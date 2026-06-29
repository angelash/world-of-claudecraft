import type { KnownAbility } from '../../src/sim/content/classes';
import type { Role, TalentAllocation } from '../../src/sim/content/talents';
import { computeTalentModifiers } from '../../src/sim/content/talents';
import { abilitiesKnownAt } from '../../src/sim/data';
import { dist2d } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import { planAmbientPartyRoles } from './party_roles';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';

const TARGET_COMMAND_COOLDOWN_MS = 900;
const CAST_COMMAND_COOLDOWN_MS = 900;
const LONG_CAST_COMMAND_COOLDOWN_MS = 1_600;
const GROUP_HEAL_OUT_OF_COMBAT_RATIO = 0.92;
const GROUP_HEAL_IN_COMBAT_RATIO = 0.82;

interface SupportAuraView {
  id: string;
  kind: string;
  remaining: number;
  duration: number;
  stacks: number;
}

interface SupportSelfView {
  id: number;
  level: number;
  pos: { x: number; z: number };
  targetId: number | null;
  resource: number;
  gcdRemaining: number;
  cooldowns: Record<string, number>;
  castingAbility: string | null;
  auras: readonly SupportAuraView[];
  talents: TalentAllocation | null;
  role: Role | null;
}

interface SupportMobView {
  id: number;
  pos: { x: number; z: number };
  aggroTargetId: number | null;
  auras: readonly SupportAuraView[];
}

interface SupportPartyMemberView {
  member: PartyMemberInfo;
  visible: boolean;
  auras: readonly SupportAuraView[];
  threatenedCount: number;
}

export interface AmbientGroupCommandReservation {
  key: string;
  cooldownMs: number;
}

export interface AmbientPartySupportInput {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  party: PartyInfo;
  leaderMember: PartyMemberInfo | null;
  selfMember: PartyMemberInfo | null;
  reserveCommandBatch: (reservations: readonly AmbientGroupCommandReservation[]) => boolean;
}

export interface AmbientPartySupportDecision {
  commands: readonly Record<string, unknown>[];
  groupMode: string;
}

export function maybeCoordinateAmbientPartySupport(
  input: AmbientPartySupportInput,
): AmbientPartySupportDecision | null {
  const self = parseSupportSelf(input.liveState.self);
  if (!self || self.castingAbility) return null;

  const abilities = knownAbilityMap(input.bot, self);
  if (abilities.size === 0) return null;

  const partyIds = new Set(input.party.members.map((member) => member.pid));
  const hostileMobs = readPartyHostileMobs(input.liveState, partyIds);
  const members = buildSupportMembers(input.party, input.liveState, self, hostileMobs);
  const tankPid = planAmbientPartyRoles({
    party: input.party,
    liveState: input.liveState,
  }).tankPid;
  const partyInCombat = input.party.members.some((member) => member.inCombat === 1) || hostileMobs.length > 0;
  const role = supportRoleForSelf(input.bot.class, self);

  const healDecision = maybeHealParty({
    self,
    bot: input.bot,
    members,
    tankPid,
    partyInCombat,
    abilities,
    reserveCommandBatch: input.reserveCommandBatch,
  });
  if (healDecision) return healDecision;

  if (!partyInCombat) {
    const buffDecision = maybeBuffParty({
      self,
      bot: input.bot,
      members,
      tankPid,
      abilities,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (buffDecision) return buffDecision;
  }

  if (role === 'tank') {
    const tankDecision = maybeSupportTank({
      self,
      bot: input.bot,
      hostileMobs,
      members,
      tankPid,
      abilities,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (tankDecision) return tankDecision;
  }

  if (partyInCombat) {
    const focusDecision = maybeFocusFire({
      self,
      hostileMobs,
      members,
      tankPid,
      leaderPid: input.leaderMember?.pid ?? null,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (focusDecision) return focusDecision;
  }

  return null;
}

function maybeBuffParty(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  switch (input.bot.class) {
    case 'priest': {
      const fortitude = input.abilities.get('power_word_fortitude');
      if (fortitude) {
        for (const target of orderedBuffTargets(input.members, input.tankPid, input.self.id)) {
          if (hasFreshFriendlyAura(target, fortitude)) continue;
          const decision = queueFriendlyCast(input.self, target, fortitude, 'buff_party', input.reserveCommandBatch);
          if (decision) return decision;
        }
      }
      const shield = input.abilities.get('power_word_shield');
      if (shield && input.tankPid !== null) {
        const tank = input.members.find((member) => member.member.pid === input.tankPid) ?? null;
        if (tank && !hasFreshFriendlyAura(tank, shield)) {
          const decision = queueFriendlyCast(input.self, tank, shield, 'prepare_party', input.reserveCommandBatch);
          if (decision) return decision;
        }
      }
      return null;
    }
    case 'paladin': {
      const blessing = input.abilities.get('blessing_of_might');
      if (!blessing) return null;
      for (const target of orderedBuffTargets(input.members, input.tankPid, input.self.id)) {
        if (!prefersBlessingOfMight(target.member)) continue;
        if (hasFreshFriendlyAura(target, blessing)) continue;
        const decision = queueFriendlyCast(input.self, target, blessing, 'buff_party', input.reserveCommandBatch);
        if (decision) return decision;
      }
      return null;
    }
    case 'druid': {
      const mark = input.abilities.get('mark_of_the_wild');
      if (mark) {
        for (const target of orderedBuffTargets(input.members, input.tankPid, input.self.id)) {
          if (hasFreshFriendlyAura(target, mark)) continue;
          const decision = queueFriendlyCast(input.self, target, mark, 'buff_party', input.reserveCommandBatch);
          if (decision) return decision;
        }
      }
      const thorns = input.abilities.get('thorns');
      if (thorns && input.tankPid !== null) {
        const tank = input.members.find((member) => member.member.pid === input.tankPid) ?? null;
        if (tank && !hasFreshFriendlyAura(tank, thorns)) {
          const decision = queueFriendlyCast(input.self, tank, thorns, 'prepare_party', input.reserveCommandBatch);
          if (decision) return decision;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

function maybeHealParty(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  partyInCombat: boolean;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  if (!canProvidePartyHealing(input.bot.class, input.self)) return null;

  const candidates = orderedWoundedMembers(
    input.members,
    input.tankPid,
    input.self.id,
    input.partyInCombat,
  );
  if (candidates.length === 0) return null;

  switch (input.bot.class) {
    case 'priest':
      return maybePriestHeal(input.self, candidates, input.partyInCombat, input.abilities, input.reserveCommandBatch);
    case 'paladin':
      return maybePaladinHeal(input.self, candidates, input.abilities, input.reserveCommandBatch);
    case 'shaman':
      return maybeSingleHeal(input.self, candidates, input.abilities, input.reserveCommandBatch, ['healing_wave']);
    case 'druid':
      return maybeDruidHeal(input.self, candidates, input.partyInCombat, input.abilities, input.reserveCommandBatch);
    default:
      return null;
  }
}

function maybeSupportTank(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  if (input.bot.class === 'warrior') {
    const defensiveStance = input.abilities.get('defensive_stance');
    if (defensiveStance && !hasAuraId(input.self.auras, 'defensive_stance')) {
      const decision = queueSelfCast(input.self, defensiveStance, 'tank_party', input.reserveCommandBatch);
      if (decision) return decision;
    }

    const taunt = input.abilities.get('taunt');
    if (taunt) {
      const tauntDecision = tryHostileCastOnCandidates(
        input.self,
        orderedTauntTargets(input.hostileMobs, input.members, input.self),
        taunt,
        'taunt_party',
        input.reserveCommandBatch,
      );
      if (tauntDecision) return tauntDecision;
    }

    const thunderClap = input.abilities.get('thunder_clap');
    if (thunderClap && countNearbyThreats(input.hostileMobs, input.self.pos, 8) >= 2) {
      const decision = queueSelfCast(input.self, thunderClap, 'tank_party', input.reserveCommandBatch);
      if (decision) return decision;
    }

    const sunderArmor = input.abilities.get('sunder_armor');
    const focusTarget = selectFocusTarget(input.hostileMobs, input.members, input.tankPid, input.tankPid);
    if (sunderArmor && focusTarget && sunderStacks(focusTarget) < 2) {
      const decision = queueHostileCast(input.self, focusTarget, sunderArmor, 'tank_party', input.reserveCommandBatch);
      if (decision) return decision;
    }
  }

  if (input.bot.class === 'druid' && hasAuraKind(input.self.auras, 'form_bear')) {
    const growl = input.abilities.get('growl');
    if (growl) {
      const tauntDecision = tryHostileCastOnCandidates(
        input.self,
        orderedTauntTargets(input.hostileMobs, input.members, input.self),
        growl,
        'taunt_party',
        input.reserveCommandBatch,
      );
      if (tauntDecision) return tauntDecision;
    }
  }

  return null;
}

function maybeFocusFire(input: {
  self: SupportSelfView;
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  leaderPid: number | null;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  const focusTarget = selectFocusTarget(input.hostileMobs, input.members, input.tankPid, input.leaderPid);
  if (!focusTarget || input.self.targetId === focusTarget.id) return null;
  if (!input.reserveCommandBatch([{ key: `target:${focusTarget.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS }])) {
    return null;
  }
  return {
    commands: [{ cmd: 'target', id: focusTarget.id }],
    groupMode: 'focus_fire',
  };
}

function maybePriestHeal(
  self: SupportSelfView,
  candidates: readonly SupportPartyMemberView[],
  inCombat: boolean,
  abilities: ReadonlyMap<string, KnownAbility>,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  for (const target of candidates) {
    const ratio = healthRatio(target.member);
    const shield = abilities.get('power_word_shield');
    if (shield && ratio <= 0.38 && !hasFreshFriendlyAura(target, shield)) {
      const decision = queueFriendlyCast(self, target, shield, 'shield_party', reserveCommandBatch);
      if (decision) return decision;
    }

    const renew = abilities.get('renew');
    if (renew && inCombat && ratio <= 0.78 && !hasFreshFriendlyAura(target, renew)) {
      const decision = queueFriendlyCast(self, target, renew, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }

    if (ratio <= 0.48) {
      const emergency = abilities.get('flash_heal') ?? abilities.get('heal') ?? abilities.get('lesser_heal');
      if (emergency) {
        const decision = queueFriendlyCast(self, target, emergency, 'heal_party', reserveCommandBatch);
        if (decision) return decision;
      }
    }

    const steady = abilities.get('heal') ?? abilities.get('lesser_heal');
    if (steady && ratio <= 0.72) {
      const decision = queueFriendlyCast(self, target, steady, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
  }

  return null;
}

function maybePaladinHeal(
  self: SupportSelfView,
  candidates: readonly SupportPartyMemberView[],
  abilities: ReadonlyMap<string, KnownAbility>,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  for (const target of candidates) {
    const ratio = healthRatio(target.member);
    const layOnHands = abilities.get('lay_on_hands');
    if (layOnHands && ratio <= 0.18) {
      const decision = queueFriendlyCast(self, target, layOnHands, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
    const flash = abilities.get('flash_of_light');
    if (flash && ratio <= 0.45) {
      const decision = queueFriendlyCast(self, target, flash, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
    const holyLight = abilities.get('holy_light');
    if (holyLight && ratio <= 0.72) {
      const decision = queueFriendlyCast(self, target, holyLight, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
  }
  return null;
}

function maybeDruidHeal(
  self: SupportSelfView,
  candidates: readonly SupportPartyMemberView[],
  inCombat: boolean,
  abilities: ReadonlyMap<string, KnownAbility>,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  for (const target of candidates) {
    const ratio = healthRatio(target.member);
    const rejuvenation = abilities.get('rejuvenation');
    if (rejuvenation && ratio <= (inCombat ? 0.8 : 0.88) && !hasFreshFriendlyAura(target, rejuvenation)) {
      const decision = queueFriendlyCast(self, target, rejuvenation, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }

    const regrowth = abilities.get('regrowth');
    if (regrowth && ratio <= 0.62 && !hasFreshFriendlyAura(target, regrowth)) {
      const decision = queueFriendlyCast(self, target, regrowth, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }

    const healingTouch = abilities.get('healing_touch');
    if (healingTouch && ratio <= 0.5) {
      const decision = queueFriendlyCast(self, target, healingTouch, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
  }
  return null;
}

function maybeSingleHeal(
  self: SupportSelfView,
  candidates: readonly SupportPartyMemberView[],
  abilities: ReadonlyMap<string, KnownAbility>,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
  abilityIds: readonly string[],
): AmbientPartySupportDecision | null {
  for (const target of candidates) {
    if (healthRatio(target.member) > 0.72) continue;
    for (const abilityId of abilityIds) {
      const ability = abilities.get(abilityId);
      if (!ability) continue;
      const decision = queueFriendlyCast(self, target, ability, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
  }
  return null;
}

function queueFriendlyCast(
  self: SupportSelfView,
  target: SupportPartyMemberView,
  ability: KnownAbility,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  if (target.member.pid !== self.id && !target.visible) return null;
  if (!canUseAbility(self, ability)) return null;
  const range = ability.def.range > 0 ? ability.def.range : 5;
  if (!withinRange(self.pos, target.member, range)) return null;
  const reservations: AmbientGroupCommandReservation[] = [];
  if (self.targetId !== target.member.pid) {
    reservations.push({ key: `target:${target.member.pid}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS });
  }
  reservations.push({ key: `cast:${ability.def.id}`, cooldownMs: castCommandCooldownMs(ability) });
  if (!reserveCommandBatch(reservations)) return null;
  return {
    commands: [
      ...(self.targetId !== target.member.pid ? [{ cmd: 'target', id: target.member.pid }] : []),
      { cmd: 'cast', ability: ability.def.id },
    ],
    groupMode,
  };
}

function queueHostileCast(
  self: SupportSelfView,
  target: SupportMobView,
  ability: KnownAbility,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  if (!canUseAbility(self, ability)) return null;
  const range = ability.def.range > 0 ? ability.def.range : 5;
  if (!withinRange(self.pos, target.pos, range)) return null;
  const reservations: AmbientGroupCommandReservation[] = [];
  if (self.targetId !== target.id) {
    reservations.push({ key: `target:${target.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS });
  }
  reservations.push({ key: `cast:${ability.def.id}`, cooldownMs: castCommandCooldownMs(ability) });
  if (!reserveCommandBatch(reservations)) return null;
  return {
    commands: [
      ...(self.targetId !== target.id ? [{ cmd: 'target', id: target.id }] : []),
      { cmd: 'cast', ability: ability.def.id },
    ],
    groupMode,
  };
}

function queueSelfCast(
  self: SupportSelfView,
  ability: KnownAbility,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  if (!canUseAbility(self, ability)) return null;
  if (!reserveCommandBatch([{ key: `cast:${ability.def.id}`, cooldownMs: castCommandCooldownMs(ability) }])) {
    return null;
  }
  return {
    commands: [{ cmd: 'cast', ability: ability.def.id }],
    groupMode,
  };
}

function tryHostileCastOnCandidates(
  self: SupportSelfView,
  targets: readonly SupportMobView[],
  ability: KnownAbility,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  for (const target of targets) {
    const decision = queueHostileCast(self, target, ability, groupMode, reserveCommandBatch);
    if (decision) return decision;
  }
  return null;
}

function canProvidePartyHealing(
  cls: AmbientPlayerBotRecord['class'],
  self: SupportSelfView,
): boolean {
  if (cls === 'priest' || cls === 'paladin' || cls === 'shaman') return true;
  if (cls !== 'druid') return false;
  return !hasAuraKind(self.auras, 'form_bear')
    && !hasAuraKind(self.auras, 'form_cat')
    && !hasAuraKind(self.auras, 'form_travel');
}

function supportRoleForSelf(
  cls: AmbientPlayerBotRecord['class'],
  self: SupportSelfView,
): Role {
  if (self.role === 'tank' || self.role === 'healer' || self.role === 'dps') return self.role;
  switch (cls) {
    case 'warrior':
      return 'tank';
    case 'priest':
      return 'healer';
    case 'druid':
      return hasAuraKind(self.auras, 'form_bear') ? 'tank' : 'healer';
    default:
      return 'dps';
  }
}

function orderedBuffTargets(
  members: readonly SupportPartyMemberView[],
  tankPid: number | null,
  selfId: number,
): SupportPartyMemberView[] {
  return [...members].sort((a, b) => {
    const aTank = tankPid !== null && a.member.pid === tankPid ? 1 : 0;
    const bTank = tankPid !== null && b.member.pid === tankPid ? 1 : 0;
    if (aTank !== bTank) return bTank - aTank;
    const aSelf = a.member.pid === selfId ? 1 : 0;
    const bSelf = b.member.pid === selfId ? 1 : 0;
    if (aSelf !== bSelf) return bSelf - aSelf;
    return a.member.pid - b.member.pid;
  });
}

function orderedWoundedMembers(
  members: readonly SupportPartyMemberView[],
  tankPid: number | null,
  selfId: number,
  inCombat: boolean,
): SupportPartyMemberView[] {
  const threshold = inCombat ? GROUP_HEAL_IN_COMBAT_RATIO : GROUP_HEAL_OUT_OF_COMBAT_RATIO;
  return [...members]
    .filter((member) => !member.member.dead && member.member.mhp > 0)
    .filter((member) => member.visible || member.member.pid === selfId)
    .filter((member) => healthRatio(member.member) < threshold || member.threatenedCount > 0)
    .sort((a, b) => {
      const aRatio = healthRatio(a.member);
      const bRatio = healthRatio(b.member);
      if (Math.abs(aRatio - bRatio) > 0.001) return aRatio - bRatio;
      const aTank = tankPid !== null && a.member.pid === tankPid ? 1 : 0;
      const bTank = tankPid !== null && b.member.pid === tankPid ? 1 : 0;
      if (aTank !== bTank) return bTank - aTank;
      if (a.threatenedCount !== b.threatenedCount) return b.threatenedCount - a.threatenedCount;
      return a.member.pid - b.member.pid;
    });
}

function prefersBlessingOfMight(member: PartyMemberInfo): boolean {
  return member.cls === 'warrior'
    || member.cls === 'rogue'
    || member.cls === 'hunter'
    || member.cls === 'paladin'
    || member.cls === 'shaman'
    || member.cls === 'druid';
}

function knownAbilityMap(
  bot: AmbientPlayerBotRecord,
  self: SupportSelfView,
): ReadonlyMap<string, KnownAbility> {
  const mods = self.talents ? computeTalentModifiers(bot.class, self.talents) : undefined;
  return new Map(abilitiesKnownAt(bot.class, self.level, mods).map((ability) => [ability.def.id, ability]));
}

function healthRatio(member: PartyMemberInfo): number {
  return member.mhp > 0 ? member.hp / member.mhp : 1;
}

function orderedTauntTargets(
  hostileMobs: readonly SupportMobView[],
  members: readonly SupportPartyMemberView[],
  self: SupportSelfView,
): SupportMobView[] {
  const memberByPid = new Map(members.map((member) => [member.member.pid, member]));
  return [...hostileMobs]
    .filter((mob) => mob.aggroTargetId !== null && mob.aggroTargetId !== self.id)
    .filter((mob) => {
      const aggroTargetId = mob.aggroTargetId;
      return aggroTargetId !== null && memberByPid.has(aggroTargetId);
    })
    .sort((a, b) => {
      const aThreatened = memberByPid.get(a.aggroTargetId ?? -1);
      const bThreatened = memberByPid.get(b.aggroTargetId ?? -1);
      const aHealer = aThreatened && canClassHeal(aThreatened.member.cls) ? 1 : 0;
      const bHealer = bThreatened && canClassHeal(bThreatened.member.cls) ? 1 : 0;
      if (aHealer !== bHealer) return bHealer - aHealer;
      const aRatio = aThreatened ? healthRatio(aThreatened.member) : 1;
      const bRatio = bThreatened ? healthRatio(bThreatened.member) : 1;
      if (Math.abs(aRatio - bRatio) > 0.001) return aRatio - bRatio;
      const aDistance = planarDistance(self.pos, a.pos);
      const bDistance = planarDistance(self.pos, b.pos);
      if (Math.abs(aDistance - bDistance) > 0.001) return aDistance - bDistance;
      return a.id - b.id;
    });
}

function canClassHeal(cls: PartyMemberInfo['cls']): boolean {
  return cls === 'priest' || cls === 'paladin' || cls === 'shaman' || cls === 'druid';
}

function selectFocusTarget(
  hostileMobs: readonly SupportMobView[],
  members: readonly SupportPartyMemberView[],
  tankPid: number | null,
  leaderPid: number | null,
): SupportMobView | null {
  const memberByPid = new Map(members.map((member) => [member.member.pid, member.member]));
  const sorted = [...hostileMobs].filter((mob) => mob.aggroTargetId !== null && memberByPid.has(mob.aggroTargetId));
  sorted.sort((a, b) => {
    const aPriority = focusPriority(a, tankPid, leaderPid);
    const bPriority = focusPriority(b, tankPid, leaderPid);
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aAnchor = memberByPid.get(a.aggroTargetId ?? -1);
    const bAnchor = memberByPid.get(b.aggroTargetId ?? -1);
    const aDistance = aAnchor ? planarDistance({ x: aAnchor.x, z: aAnchor.z }, a.pos) : 0;
    const bDistance = bAnchor ? planarDistance({ x: bAnchor.x, z: bAnchor.z }, b.pos) : 0;
    if (Math.abs(aDistance - bDistance) > 0.001) return aDistance - bDistance;
    return a.id - b.id;
  });
  return sorted[0] ?? null;
}

function focusPriority(
  mob: SupportMobView,
  tankPid: number | null,
  leaderPid: number | null,
): number {
  if (tankPid !== null && mob.aggroTargetId === tankPid) return 0;
  if (leaderPid !== null && mob.aggroTargetId === leaderPid) return 1;
  return 2;
}

function countNearbyThreats(
  hostileMobs: readonly SupportMobView[],
  origin: { x: number; z: number },
  radius: number,
): number {
  return hostileMobs.filter((mob) => planarDistance(origin, mob.pos) <= radius + 0.35).length;
}

function sunderStacks(mob: SupportMobView): number {
  return mob.auras.find((aura) => aura.kind === 'sunder')?.stacks ?? 0;
}

function castCommandCooldownMs(ability: KnownAbility): number {
  return ability.castTime > 0 ? LONG_CAST_COMMAND_COOLDOWN_MS : CAST_COMMAND_COOLDOWN_MS;
}

function canUseAbility(
  self: SupportSelfView,
  ability: KnownAbility,
): boolean {
  if (self.castingAbility) return false;
  if (!ability.def.offGcd && self.gcdRemaining > 0.05) return false;
  if ((self.cooldowns[ability.def.id] ?? 0) > 0.05) return false;
  if (self.resource < ability.cost) return false;
  const form = currentFormKind(self.auras);
  if (ability.def.requiresForm) {
    const required = ability.def.requiresForm === 'bear' ? 'form_bear' : 'form_cat';
    if (form !== required) return false;
  } else if (form && !isFormToggle(ability.def.id)) {
    return false;
  }
  return true;
}

function currentFormKind(auras: readonly SupportAuraView[]): string | null {
  const form = auras.find((aura) =>
    aura.kind === 'form_bear' || aura.kind === 'form_cat' || aura.kind === 'form_travel',
  );
  return form?.kind ?? null;
}

function isFormToggle(abilityId: string): boolean {
  return abilityId === 'bear_form' || abilityId === 'cat_form' || abilityId === 'travel_form';
}

function withinRange(
  source: { x: number; z: number },
  target: { x: number; z: number },
  range: number,
): boolean {
  return planarDistance(source, target) <= Math.max(range, 5) + 0.35;
}

function planarDistance(
  source: { x: number; z: number },
  target: { x: number; z: number },
): number {
  return dist2d(
    { x: source.x, y: 0, z: source.z },
    { x: target.x, y: 0, z: target.z },
  );
}

function hasFreshFriendlyAura(
  target: SupportPartyMemberView,
  ability: KnownAbility,
): boolean {
  const duration = ability.effects.reduce((max, effect) => {
    if (
      effect.type === 'buffTarget'
      || effect.type === 'selfBuff'
      || effect.type === 'absorb'
      || effect.type === 'hot'
    ) {
      return Math.max(max, effect.duration);
    }
    return max;
  }, 0);
  if (duration <= 0) return false;
  const refreshBelow = auraRefreshBelow(duration);
  return target.auras.some((aura) => aura.id === ability.def.id && aura.remaining > refreshBelow);
}

function auraRefreshBelow(duration: number): number {
  if (duration <= 60) return 5;
  return Math.min(30, Math.max(8, duration * 0.2));
}

function hasAuraId(
  auras: readonly SupportAuraView[],
  auraId: string,
): boolean {
  return auras.some((aura) => aura.id === auraId && aura.remaining > 3);
}

function hasAuraKind(
  auras: readonly SupportAuraView[],
  auraKind: string,
): boolean {
  return auras.some((aura) => aura.kind === auraKind && aura.remaining > 3);
}

function buildSupportMembers(
  party: PartyInfo,
  liveState: AmbientPlayerBotLiveState,
  self: SupportSelfView,
  hostileMobs: readonly SupportMobView[],
): SupportPartyMemberView[] {
  return party.members.map((member) => {
    const visibleRecord = member.pid === self.id ? liveState.self : liveState.entities.get(member.pid) ?? null;
    return {
      member,
      visible: !!visibleRecord,
      auras: member.pid === self.id ? [...self.auras] : readAuras(visibleRecord?.auras),
      threatenedCount: hostileMobs.filter((mob) => mob.aggroTargetId === member.pid).length,
    };
  });
}

function readPartyHostileMobs(
  liveState: AmbientPlayerBotLiveState,
  partyIds: ReadonlySet<number>,
): SupportMobView[] {
  const mobs: SupportMobView[] = [];
  for (const raw of liveState.entities.values()) {
    if (readString(raw.k) !== 'mob' || readBoolean(raw.dead) || !hasPositiveHealth(raw.h)) continue;
    const id = readNumber(raw.id);
    const x = readNumber(raw.x);
    const z = readNumber(raw.z);
    if (id === null || x === null || z === null) continue;
    const aggroTargetId = readNumber(raw.aggro);
    if (aggroTargetId !== null && !partyIds.has(aggroTargetId)) continue;
    mobs.push({
      id,
      pos: { x, z },
      aggroTargetId,
      auras: readAuras(raw.auras),
    });
  }
  return mobs;
}

function parseSupportSelf(raw: Record<string, unknown> | null): SupportSelfView | null {
  if (!raw) return null;
  const id = readNumber(raw.id);
  const x = readNumber(raw.x);
  const z = readNumber(raw.z);
  if (id === null || x === null || z === null) return null;
  return {
    id,
    level: readNumber(raw.lv) ?? 1,
    pos: { x, z },
    targetId: readNumber(raw.target),
    resource: readNumber(raw.res) ?? 0,
    gcdRemaining: readNumber(raw.gcd) ?? 0,
    cooldowns: readNumberRecord(raw.cds),
    castingAbility: readString(raw.cast),
    auras: readAuras(raw.auras),
    talents: readTalentAllocation(raw.tal),
    role: readRole(raw.tal),
  };
}

function readRole(raw: unknown): Role | null {
  const record = readRecord(raw);
  const role = record ? readString(record.role) : null;
  return role === 'tank' || role === 'healer' || role === 'dps' ? role : null;
}

function readTalentAllocation(raw: unknown): TalentAllocation | null {
  const record = readRecord(raw);
  const alloc = record ? readRecord(record.alloc) : null;
  const ranks = alloc ? readRecord(alloc.ranks) : null;
  const choices = alloc ? readRecord(alloc.choices) : null;
  return alloc
    ? {
      spec: readString(alloc.spec),
      ranks: ranks ? Object.fromEntries(Object.entries(ranks).map(([key, value]) => [key, readNumber(value) ?? 0])) : {},
      choices: choices ? Object.fromEntries(Object.entries(choices).map(([key, value]) => [key, readString(value) ?? ''])) : {},
    }
    : null;
}

function readAuras(raw: unknown): SupportAuraView[] {
  if (!Array.isArray(raw)) return [];
  const auras: SupportAuraView[] = [];
  for (const item of raw) {
    const record = readRecord(item);
    const id = record ? readString(record.id) : null;
    const kind = record ? readString(record.kind) : null;
    if (!id || !kind) continue;
    auras.push({
      id,
      kind,
      remaining: readNumber(record?.rem) ?? readNumber(record?.remaining) ?? 0,
      duration: readNumber(record?.dur) ?? readNumber(record?.duration) ?? 0,
      stacks: readNumber(record?.stacks) ?? 1,
    });
  }
  return auras;
}

function readNumberRecord(raw: unknown): Record<string, number> {
  const record = readRecord(raw);
  if (!record) return {};
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(record)) {
    const number = readNumber(value);
    if (number !== null) out[key] = number;
  }
  return out;
}

function readRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : null;
}

function readString(raw: unknown): string | null {
  return typeof raw === 'string' ? raw : null;
}

function readNumber(raw: unknown): number | null {
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
}

function readBoolean(raw: unknown): boolean {
  return raw === true || raw === 1;
}

function hasPositiveHealth(raw: unknown): boolean {
  const hp = readNumber(raw);
  if (hp !== null) return hp > 0;
  return readBoolean(raw);
}
