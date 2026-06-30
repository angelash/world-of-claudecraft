import type { KnownAbility } from '../../src/sim/content/classes';
import type { Role, TalentAllocation } from '../../src/sim/content/talents';
import { computeTalentModifiers } from '../../src/sim/content/talents';
import { CLASSES, ITEMS, abilitiesKnownAt } from '../../src/sim/data';
import { MELEE_RANGE, dist2d, type InvSlot } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import { type PartyCombatTarget, type PartyTravelGoal, partyAssistArrivalRange, travelGoalToPartyMember, travelGoalToPartyTarget } from '../party_coordination';
import { maybePrepareForPullFromLiveState } from './pre_combat';
import { planAmbientPartyRoles } from './party_roles';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';

const TARGET_COMMAND_COOLDOWN_MS = 900;
const CAST_COMMAND_COOLDOWN_MS = 900;
const LONG_CAST_COMMAND_COOLDOWN_MS = 1_600;
const ATTACK_COMMAND_COOLDOWN_MS = 1_200;
const STOP_ATTACK_COMMAND_COOLDOWN_MS = 1_500;
const CLEAR_TARGET_COMMAND_COOLDOWN_MS = 1_500;
const USE_POTION_COMMAND_COOLDOWN_MS = 60_000;
const GROUP_HEAL_OUT_OF_COMBAT_RATIO = 0.92;
const GROUP_HEAL_IN_COMBAT_RATIO = 0.82;
const GROUP_SHIELD_THREATENED_RATIO = 0.99;
const GROUP_SELF_PRESERVE_THREATENED_RATIO = 0.72;
const GROUP_SELF_PRESERVE_EMERGENCY_RATIO = 0.72;
const GROUP_SELF_PRESERVE_POTION_RATIO = 0.65;
const GROUP_SELF_PRESERVE_ANCHOR_RANGE = 6;

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
  autoAttack: boolean;
  resource: number;
  gcdRemaining: number;
  cooldowns: Record<string, number>;
  castingAbility: string | null;
  auras: readonly SupportAuraView[];
  inventory: readonly InvSlot[];
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
  travelGoal?: PartyTravelGoal;
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
    const selfPreparationDecision = maybePrepareSelfForParty({
      bot: input.bot,
      liveState: input.liveState,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (selfPreparationDecision) return selfPreparationDecision;

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

  const selfPreserveDecision = maybePreserveThreatenedSelf({
    self,
    members,
    tankPid,
    leaderMember: input.leaderMember,
    role,
    partyInCombat,
    reserveCommandBatch: input.reserveCommandBatch,
  });
  if (selfPreserveDecision) return selfPreserveDecision;

  if (partyInCombat) {
    const focusDecision = maybeFocusFire({
      self,
      bot: input.bot,
      hostileMobs,
      members,
      tankPid,
      leaderPid: input.leaderMember?.pid ?? null,
      abilities,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (focusDecision) return focusDecision;
  }

  return null;
}

function maybePrepareSelfForParty(input: {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  const step = maybePrepareForPullFromLiveState({
    bot: input.bot,
    liveSelf: input.liveState.self,
    entities: input.liveState.entities.values(),
    issueCommand: (key, cooldownMs) =>
      input.reserveCommandBatch([{ key, cooldownMs }]),
  });
  if (!step) return null;
  return {
    commands: [...step.commands],
    groupMode: 'prepare_party',
  };
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

    const defensiveStance = input.abilities.get('defensive_stance');
    if (defensiveStance && !hasAuraId(input.self.auras, 'defensive_stance')) {
      const decision = queueSelfCast(input.self, defensiveStance, 'tank_party', input.reserveCommandBatch);
      if (decision) return decision;
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
  bot: AmbientPlayerBotRecord;
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  leaderPid: number | null;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  const focusTarget = selectFocusTarget(input.hostileMobs, input.members, input.tankPid, input.leaderPid);
  if (!focusTarget) return null;

  const distance = planarDistance(input.self.pos, focusTarget.pos);
  const abilityDecision = maybeQueueFocusFireAbility({
    self: input.self,
    cls: input.bot.class,
    target: focusTarget,
    distance,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
  });
  if (abilityDecision) return abilityDecision;

  const attackDecision = queueHostileAttack(
    input.self,
    input.bot.class,
    focusTarget,
    'focus_fire',
    input.reserveCommandBatch,
  );
  if (attackDecision) return attackDecision;

  const rangedAbilityInRange = hasFocusFireAbilityAtDistance(input.bot.class, input.abilities, distance);
  const classArrivalRange = partyAssistArrivalRange(input.bot.class);
  const shouldTravel = !rangedAbilityInRange
    && !withinAutoAttackRange(input.bot.class, distance)
    && distance > classArrivalRange;
  const travelGoal = shouldTravel
    ? travelGoalToPartyTarget(focusTargetAsCombatTarget(focusTarget, distance), classArrivalRange)
    : undefined;

  if (input.self.targetId !== focusTarget.id) {
    if (!input.reserveCommandBatch([{ key: `target:${focusTarget.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS }])) {
      return null;
    }
    return {
      commands: [{ cmd: 'target', id: focusTarget.id }],
      groupMode: 'focus_fire',
      ...(travelGoal ? { travelGoal } : {}),
    };
  }

  if (travelGoal) {
    return {
      commands: [],
      groupMode: 'focus_fire',
      travelGoal,
    };
  }

  return null;
}

function maybePreserveThreatenedSelf(input: {
  self: SupportSelfView;
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  leaderMember: PartyMemberInfo | null;
  role: Role;
  partyInCombat: boolean;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  if (!input.partyInCombat || input.role === 'tank') return null;
  const selfMember = input.members.find((member) => member.member.pid === input.self.id) ?? null;
  if (!selfMember || selfMember.member.dead) return null;

  const ratio = healthRatio(selfMember.member);
  const threatened = selfMember.threatenedCount > 0;
  const shouldPreserve =
    (threatened && ratio <= GROUP_SELF_PRESERVE_THREATENED_RATIO)
    || ratio <= GROUP_SELF_PRESERVE_EMERGENCY_RATIO;
  if (!shouldPreserve) return null;

  const commands: Record<string, unknown>[] = [];
  const potion = ratio <= GROUP_SELF_PRESERVE_POTION_RATIO
    ? findHealingPotion(input.self.inventory)
    : null;
  if (
    potion
    && input.reserveCommandBatch([{ key: `use:${potion}`, cooldownMs: USE_POTION_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'use', item: potion });
  }
  if (
    input.self.autoAttack
    && input.reserveCommandBatch([{ key: 'stopattack', cooldownMs: STOP_ATTACK_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    input.self.targetId !== null
    && input.reserveCommandBatch([{ key: 'clear_target', cooldownMs: CLEAR_TARGET_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  const anchor = selfPreserveAnchor(input.members, input.tankPid, input.leaderMember, input.self.id);
  const anchorDistance = anchor ? planarDistance(input.self.pos, anchor) : 0;
  const travelGoal = anchor && anchorDistance > GROUP_SELF_PRESERVE_ANCHOR_RANGE
    ? travelGoalToPartyMember(anchor, GROUP_SELF_PRESERVE_ANCHOR_RANGE, 'party-recover-anchor')
    : undefined;

  return {
    commands,
    groupMode: 'heal_party',
    ...(travelGoal ? { travelGoal } : {}),
  };
}

function selfPreserveAnchor(
  members: readonly SupportPartyMemberView[],
  tankPid: number | null,
  leaderMember: PartyMemberInfo | null,
  selfId: number,
): PartyMemberInfo | null {
  const tank = tankPid !== null
    ? members.find((member) => member.member.pid === tankPid)?.member ?? null
    : null;
  if (tank && tank.pid !== selfId && !tank.dead) return tank;
  if (leaderMember && leaderMember.pid !== selfId && !leaderMember.dead) return leaderMember;
  return members
    .map((member) => member.member)
    .filter((member) => member.pid !== selfId && !member.dead)
    .sort((a, b) => a.pid - b.pid)[0] ?? null;
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
    if (
      shield
      && (ratio <= 0.38 || (target.threatenedCount > 0 && ratio <= GROUP_SHIELD_THREATENED_RATIO))
      && !hasFreshFriendlyAura(target, shield)
    ) {
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

function queueHostileAttack(
  self: SupportSelfView,
  cls: AmbientPlayerBotRecord['class'],
  target: SupportMobView,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  const distance = planarDistance(self.pos, target.pos);
  if (self.autoAttack || !withinAutoAttackRange(cls, distance)) return null;
  const reservations: AmbientGroupCommandReservation[] = [];
  if (self.targetId !== target.id) {
    reservations.push({ key: `target:${target.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS });
  }
  reservations.push({ key: 'attack', cooldownMs: ATTACK_COMMAND_COOLDOWN_MS });
  if (!reserveCommandBatch(reservations)) return null;
  return {
    commands: [
      ...(self.targetId !== target.id ? [{ cmd: 'target', id: target.id }] : []),
      { cmd: 'attack' },
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

function findHealingPotion(inventory: readonly InvSlot[]): string | null {
  let bestItemId: string | null = null;
  let bestHealing = 0;
  for (const slot of inventory) {
    if (slot.count <= 0) continue;
    const item = ITEMS[slot.itemId];
    const healing = item && item.kind === 'potion' && 'potionHp' in item && typeof item.potionHp === 'number'
      ? item.potionHp
      : 0;
    if (healing > bestHealing) {
      bestHealing = healing;
      bestItemId = slot.itemId;
    }
  }
  return bestItemId;
}

function maybeQueueFocusFireAbility(input: {
  self: SupportSelfView;
  cls: AmbientPlayerBotRecord['class'];
  target: SupportMobView;
  distance: number;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  const ability = pickFocusFireAbility(input.cls, input.self, input.abilities, input.distance);
  if (!ability) return null;

  const reservations: AmbientGroupCommandReservation[] = [];
  if (input.self.targetId !== input.target.id) {
    reservations.push({ key: `target:${input.target.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS });
  }
  reservations.push({ key: `cast:${ability.def.id}`, cooldownMs: castCommandCooldownMs(ability) });
  if (!input.self.autoAttack && input.distance <= MELEE_RANGE + 0.3) {
    reservations.push({ key: 'attack', cooldownMs: ATTACK_COMMAND_COOLDOWN_MS });
  }
  if (!input.reserveCommandBatch(reservations)) return null;

  return {
    commands: [
      ...(input.self.targetId !== input.target.id ? [{ cmd: 'target', id: input.target.id }] : []),
      { cmd: 'cast', ability: ability.def.id },
      ...(!input.self.autoAttack && input.distance <= MELEE_RANGE + 0.3 ? [{ cmd: 'attack' }] : []),
    ],
    groupMode: 'focus_fire',
  };
}

function pickFocusFireAbility(
  cls: AmbientPlayerBotRecord['class'],
  self: SupportSelfView,
  abilities: ReadonlyMap<string, KnownAbility>,
  distance: number,
): KnownAbility | null {
  const preferRanged = !!CLASSES[cls].ranged;
  const candidates = [...abilities.values()]
    .filter(isFocusFireAbility)
    .filter((ability) => abilityMatchesDistance(ability, distance))
    .filter((ability) => canUseAbility(self, ability));
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => scoreFocusFireAbility(b, preferRanged) - scoreFocusFireAbility(a, preferRanged));
  return candidates[0] ?? null;
}

function hasFocusFireAbilityAtDistance(
  cls: AmbientPlayerBotRecord['class'],
  abilities: ReadonlyMap<string, KnownAbility>,
  distance: number,
): boolean {
  const preferRanged = !!CLASSES[cls].ranged;
  return [...abilities.values()]
    .filter(isFocusFireAbility)
    .sort((a, b) => scoreFocusFireAbility(b, preferRanged) - scoreFocusFireAbility(a, preferRanged))
    .some((ability) => abilityMatchesDistance(ability, distance));
}

function isFocusFireAbility(ability: KnownAbility): boolean {
  if (!ability.def.requiresTarget) return false;
  if (ability.def.requiresStealth) return false;
  if (ability.def.requiresOutOfCombat) return false;
  if (ability.def.requiresDodgeProc) return false;
  if (ability.def.requiresTargetHpBelow) return false;
  if (ability.def.spendsCombo) return false;
  if (ability.def.targetType === 'friendly') return false;
  if (ability.effects.some((effect) => effect.type === 'weaponStrike' && effect.requiresBehind)) return false;
  if (ability.effects.some((effect) =>
    effect.type === 'incapacitate'
    || effect.type === 'polymorph'
    || effect.type === 'stun',
  )) {
    return false;
  }
  return ability.effects.some((effect) =>
    effect.type === 'directDamage'
    || effect.type === 'weaponDamage'
    || effect.type === 'weaponStrike'
    || effect.type === 'dot'
    || effect.type === 'drainTick'
    || effect.type === 'finisherDamage'
    || effect.type === 'aoeDamage',
  );
}

function scoreFocusFireAbility(ability: KnownAbility, preferRanged: boolean): number {
  const range = abilityRange(ability);
  let score = 0;
  if (preferRanged && range > MELEE_RANGE + 1) score += 100;
  if (!preferRanged && range <= MELEE_RANGE + 1) score += 80;
  if (ability.castTime === 0) score += 10;
  score += range;
  for (const effect of ability.effects) {
    switch (effect.type) {
      case 'directDamage':
      case 'weaponDamage':
      case 'weaponStrike':
        score += 24;
        break;
      case 'aoeDamage':
      case 'finisherDamage':
        score += 12;
        break;
      case 'dot':
      case 'drainTick':
        score += 6;
        break;
    }
  }
  return score;
}

function abilityMatchesDistance(ability: KnownAbility, distance: number): boolean {
  return distance <= abilityRange(ability) + 0.35
    && distance >= (ability.def.minRange ?? 0) - 0.35;
}

function abilityRange(ability: KnownAbility): number {
  return ability.def.range > 0 ? ability.def.range : MELEE_RANGE;
}

function withinAutoAttackRange(
  cls: AmbientPlayerBotRecord['class'],
  distance: number,
): boolean {
  const ranged = CLASSES[cls].ranged;
  if (!ranged) return distance <= MELEE_RANGE + 0.3;
  const minRange = ranged.wand ? 0 : ranged.minRange;
  return distance <= ranged.maxRange + 0.35 && distance >= minRange - 0.35;
}

function focusTargetAsCombatTarget(target: SupportMobView, distance: number): PartyCombatTarget {
  return {
    id: target.id,
    x: target.pos.x,
    z: target.pos.z,
    distance,
  };
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
    autoAttack: readBoolean(raw.auto),
    resource: readNumber(raw.res) ?? 0,
    gcdRemaining: readNumber(raw.gcd) ?? 0,
    cooldowns: readNumberRecord(raw.cds),
    castingAbility: readString(raw.cast),
    auras: readAuras(raw.auras),
    inventory: readInventory(raw.inv),
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

function readInventory(raw: unknown): InvSlot[] {
  if (!Array.isArray(raw)) return [];
  const inventory: InvSlot[] = [];
  for (const item of raw) {
    const record = readRecord(item);
    if (!record) continue;
    const itemId = readString(record.itemId);
    const count = readNumber(record.count);
    if (!itemId || count === null || count <= 0) continue;
    inventory.push({ itemId, count });
  }
  return inventory;
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
