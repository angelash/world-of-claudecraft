import type { KnownAbility } from '../../src/sim/content/classes';
import type { Role, TalentAllocation } from '../../src/sim/content/talents';
import { computeTalentModifiers } from '../../src/sim/content/talents';
import { abilitiesKnownAt, CLASSES, ITEMS, MOBS } from '../../src/sim/data';
import { parseTalentAllocation } from '../../src/sim/talent_allocation_input';
import { angleTo, dist2d, type InvSlot, MELEE_RANGE } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import {
  type PartyCombatTarget,
  type PartyTravelGoal,
  partyAssistArrivalRange,
  travelGoalToPartyMember,
  travelGoalToPartyTarget,
} from '../party_coordination';
import { planAmbientPartyRoles } from './party_roles';
import { maybePrepareForPullFromLiveState } from './pre_combat';
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
const GROUP_FRAGILE_SELF_PRESERVE_THREATENED_RATIO = 0.9;
const GROUP_FRAGILE_SELF_PRESERVE_MAX_LEVEL = 4;
const GROUP_SELF_PRESERVE_POTION_RATIO = 0.65;
const GROUP_SELF_PRESERVE_ANCHOR_RANGE = 6;
const GROUP_RECOVERY_EMERGENCY_FOCUS_RATIO = 0.72;
const GROUP_RECOVERY_PROTECTOR_STABLE_RATIO = 0.9;
const GROUP_RECOVERY_PROTECTOR_ENGAGE_RATIO = 0.65;
const GROUP_PULL_STAGING_RANGE = 18;
const GROUP_PULL_MELEE_RELEASE_RANGE = 10;
const GROUP_DENSE_PACK_PULL_AGGRO_RADIUS = 12;
const GROUP_DENSE_PACK_PULL_STAGING_PADDING = 10;
const GROUP_DENSE_PACK_PULL_MELEE_RELEASE_RANGE = 6;
const GROUP_PULL_READY_LEADER_RANGE = 10;
const PARTY_ROSTER_VISIBILITY_RANGE = 40;
const GROUP_NON_EMERGENCY_MANA_RESERVE_RATIO = 0.35;

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
  targetMarkers: Record<string, number>;
  autoAttack: boolean;
  resource: number;
  maxResource: number;
  resourceType: string;
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
  templateId: string;
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
  prePullOnly?: boolean;
  suppressFocusFire?: boolean;
  suppressRecoveryOffense?: boolean;
  reserveCommandBatch: (reservations: readonly AmbientGroupCommandReservation[]) => boolean;
}

export interface AmbientPartySupportDecision {
  commands: readonly Record<string, unknown>[];
  groupMode: string;
  travelGoal?: PartyTravelGoal;
  facing?: number;
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
  const partyInCombat =
    input.party.members.some((member) => member.inCombat === 1) ||
    hostileMobs.some((mob) => mob.aggroTargetId !== null);
  const role = supportRoleForSelf(input.bot.class, self);

  const selfPreserveDecision = maybePreserveThreatenedSelf({
    self,
    members,
    tankPid,
    leaderMember: input.leaderMember,
    role,
    canSelfHeal: canProvidePartyHealing(input.bot.class, self),
    partyInCombat,
    reserveCommandBatch: input.reserveCommandBatch,
  });
  if (selfPreserveDecision) return selfPreserveDecision;

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

  if (input.prePullOnly === true) {
    return maybePrePullPartyTarget({
      self,
      bot: input.bot,
      hostileMobs,
      members,
      tankPid,
      leaderPid: input.leaderMember?.pid ?? null,
      abilities,
      reserveCommandBatch: input.reserveCommandBatch,
    });
  }

  if (input.suppressFocusFire === true) {
    const protectionDecision = maybeProtectPartyDuringRecovery({
      self,
      bot: input.bot,
      hostileMobs,
      members,
      abilities,
      allowOffense: input.suppressRecoveryOffense !== true,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (protectionDecision) return protectionDecision;

    if (input.suppressRecoveryOffense !== true) {
      const emergencyFocusDecision = maybeEmergencyRecoveryFocusFire({
        self,
        bot: input.bot,
        hostileMobs,
        members,
        abilities,
        reserveCommandBatch: input.reserveCommandBatch,
      });
      if (emergencyFocusDecision) return emergencyFocusDecision;
    }

    return null;
  }

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

    const pullDecision = maybePrePullPartyTarget({
      self,
      bot: input.bot,
      hostileMobs,
      members,
      tankPid,
      leaderPid: input.leaderMember?.pid ?? null,
      abilities,
      reserveCommandBatch: input.reserveCommandBatch,
    });
    if (pullDecision) return pullDecision;
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

function maybeProtectPartyDuringRecovery(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  abilities: ReadonlyMap<string, KnownAbility>;
  allowOffense: boolean;
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
  }

  if (input.bot.class === 'druid' && hasAuraKind(input.self.auras, 'form_bear')) {
    const growl = input.abilities.get('growl');
    if (growl) {
      const growlDecision = tryHostileCastOnCandidates(
        input.self,
        orderedTauntTargets(input.hostileMobs, input.members, input.self),
        growl,
        'taunt_party',
        input.reserveCommandBatch,
      );
      if (growlDecision) return growlDecision;
    }
  }

  if (!input.allowOffense) return null;
  if (!recoveryProtectorCanEngage(input.bot.class, input.self, input.members)) return null;
  const protectionTarget = selectRecoveryProtectionTarget(
    input.hostileMobs,
    input.members,
    input.self,
  );
  if (!protectionTarget) return null;
  return maybeFocusFireTarget({
    self: input.self,
    bot: input.bot,
    target: protectionTarget,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
    groupMode: 'protect_party',
  });
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
    issueCommand: (key, cooldownMs) => input.reserveCommandBatch([{ key, cooldownMs }]),
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
          const decision = queueFriendlyCast(
            input.self,
            target,
            fortitude,
            'buff_party',
            input.reserveCommandBatch,
          );
          if (decision) return decision;
        }
      }
      const shield = input.abilities.get('power_word_shield');
      if (shield && input.tankPid !== null) {
        const tank = input.members.find((member) => member.member.pid === input.tankPid) ?? null;
        if (tank && !hasFreshFriendlyAura(tank, shield)) {
          const decision = queueFriendlyCast(
            input.self,
            tank,
            shield,
            'prepare_party',
            input.reserveCommandBatch,
          );
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
        const decision = queueFriendlyCast(
          input.self,
          target,
          blessing,
          'buff_party',
          input.reserveCommandBatch,
        );
        if (decision) return decision;
      }
      return null;
    }
    case 'druid': {
      const mark = input.abilities.get('mark_of_the_wild');
      if (mark) {
        for (const target of orderedBuffTargets(input.members, input.tankPid, input.self.id)) {
          if (hasFreshFriendlyAura(target, mark)) continue;
          const decision = queueFriendlyCast(
            input.self,
            target,
            mark,
            'buff_party',
            input.reserveCommandBatch,
          );
          if (decision) return decision;
        }
      }
      const thorns = input.abilities.get('thorns');
      if (thorns && input.tankPid !== null) {
        const tank = input.members.find((member) => member.member.pid === input.tankPid) ?? null;
        if (tank && !hasFreshFriendlyAura(tank, thorns)) {
          const decision = queueFriendlyCast(
            input.self,
            tank,
            thorns,
            'prepare_party',
            input.reserveCommandBatch,
          );
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
      return maybePriestHeal(
        input.self,
        candidates,
        input.partyInCombat,
        input.abilities,
        input.reserveCommandBatch,
      );
    case 'paladin':
      return maybePaladinHeal(input.self, candidates, input.abilities, input.reserveCommandBatch);
    case 'shaman':
      return maybeSingleHeal(input.self, candidates, input.abilities, input.reserveCommandBatch, [
        'healing_wave',
      ]);
    case 'druid':
      return maybeDruidHeal(
        input.self,
        candidates,
        input.partyInCombat,
        input.abilities,
        input.reserveCommandBatch,
      );
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
      const decision = queueSelfCast(
        input.self,
        defensiveStance,
        'tank_party',
        input.reserveCommandBatch,
      );
      if (decision) return decision;
    }

    const thunderClap = input.abilities.get('thunder_clap');
    if (thunderClap && countNearbyThreats(input.hostileMobs, input.self.pos, 8) >= 2) {
      const decision = queueSelfCast(
        input.self,
        thunderClap,
        'tank_party',
        input.reserveCommandBatch,
      );
      if (decision) return decision;
    }

    const sunderArmor = input.abilities.get('sunder_armor');
    const focusTarget = selectFocusTarget({
      hostileMobs: input.hostileMobs,
      members: input.members,
      markerByEntityId: input.self.targetMarkers,
      tankPid: input.tankPid,
      leaderPid: input.tankPid,
    });
    if (sunderArmor && focusTarget && sunderStacks(focusTarget) < 2) {
      const decision = queueHostileCast(
        input.self,
        focusTarget,
        sunderArmor,
        'tank_party',
        input.reserveCommandBatch,
      );
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
  const focusTarget = selectFocusTarget({
    hostileMobs: input.hostileMobs,
    members: input.members,
    markerByEntityId: input.self.targetMarkers,
    tankPid: input.tankPid,
    leaderPid: input.leaderPid,
  });
  if (!focusTarget) return null;

  return maybeFocusFireTarget({
    self: input.self,
    bot: input.bot,
    target: focusTarget,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
    groupMode: 'focus_fire',
  });
}

function maybeEmergencyRecoveryFocusFire(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  if (!recoveryEmergencyFocusAllowed(input.self, input.members)) return null;
  const focusTarget = selectEmergencyRecoveryThreat(input.hostileMobs, input.members);
  if (!focusTarget) return null;
  return maybeFocusFireTarget({
    self: input.self,
    bot: input.bot,
    target: focusTarget,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
    groupMode: 'protect_party',
  });
}

function recoveryEmergencyFocusAllowed(
  self: SupportSelfView,
  members: readonly SupportPartyMemberView[],
): boolean {
  const selfMember = members.find((member) => member.member.pid === self.id) ?? null;
  if (!selfMember || selfMember.member.dead || selfMember.threatenedCount > 0) return false;
  if (healthRatio(selfMember.member) <= 0.9) return false;
  if (members.some((member) => member.member.dead)) return false;
  const unstableMembers = members.filter(
    (member) =>
      !member.member.dead && healthRatio(member.member) <= GROUP_RECOVERY_EMERGENCY_FOCUS_RATIO,
  );
  return unstableMembers.some(
    (member) => member.member.pid !== self.id && member.threatenedCount > 0,
  );
}

function recoveryProtectorCanEngage(
  cls: AmbientPlayerBotRecord['class'],
  self: SupportSelfView,
  members: readonly SupportPartyMemberView[],
): boolean {
  const selfMember = members.find((member) => member.member.pid === self.id) ?? null;
  if (!selfMember || selfMember.member.dead) return false;
  if (healthRatio(selfMember.member) <= GROUP_RECOVERY_PROTECTOR_ENGAGE_RATIO) return false;
  return (
    cls === 'warrior' ||
    cls === 'paladin' ||
    (cls === 'druid' && hasAuraKind(self.auras, 'form_bear'))
  );
}

function maybeFocusFireTarget(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  target: SupportMobView;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
  groupMode: string;
}): AmbientPartySupportDecision | null {
  const distance = planarDistance(input.self.pos, input.target.pos);
  const incomingHoldDecision = maybeHoldForIncomingPull({
    self: input.self,
    bot: input.bot,
    target: input.target,
    distance,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
    groupMode: input.groupMode,
  });
  if (incomingHoldDecision) return incomingHoldDecision;

  const abilityDecision = maybeQueueFocusFireAbility({
    self: input.self,
    cls: input.bot.class,
    target: input.target,
    distance,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
    groupMode: input.groupMode,
  });
  if (abilityDecision) return abilityDecision;

  const attackDecision = queueHostileAttack(
    input.self,
    input.bot.class,
    input.target,
    input.groupMode,
    input.reserveCommandBatch,
  );
  if (attackDecision) return attackDecision;

  const rangedAbilityInRange = hasFocusFireAbilityAtDistance(
    input.bot.class,
    input.abilities,
    distance,
  );
  const classArrivalRange = partyAssistArrivalRange(input.bot.class);
  const shouldTravel =
    !rangedAbilityInRange &&
    !withinAutoAttackRange(input.bot.class, distance) &&
    distance > classArrivalRange;
  const travelGoal = shouldTravel
    ? travelGoalToPartyTarget(focusTargetAsCombatTarget(input.target, distance), classArrivalRange)
    : undefined;

  if (input.self.targetId !== input.target.id) {
    if (
      !input.reserveCommandBatch([
        { key: `target:${input.target.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS },
      ])
    ) {
      return null;
    }
    return {
      commands: [{ cmd: 'target', id: input.target.id }],
      groupMode: input.groupMode,
      ...(travelGoal ? { travelGoal } : {}),
    };
  }

  if (travelGoal) {
    return {
      commands: [],
      groupMode: input.groupMode,
      travelGoal,
    };
  }

  return null;
}

function maybePrePullPartyTarget(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  leaderPid: number | null;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  const target = selectExplicitFocusTarget({
    hostileMobs: input.hostileMobs,
    members: input.members,
    markerByEntityId: input.self.targetMarkers,
    tankPid: input.tankPid,
    leaderPid: input.leaderPid,
  });
  if (!target || target.aggroTargetId !== null) return null;
  if (!partyReadyForPull(input.members, input.leaderPid)) return null;
  const pullerPid = selectPartyPullerPid(input.members, input.leaderPid);
  if (pullerPid === null || pullerPid !== input.self.id) return null;

  const distance = planarDistance(input.self.pos, target.pos);
  const stagingRange = groupPullStagingRange(target);
  if (distance > stagingRange + 0.35) {
    const targetCommand = targetOnlyCommand(input.self, target, input.reserveCommandBatch);
    return {
      commands: targetCommand ? [targetCommand] : [],
      groupMode: 'prepare_party',
      travelGoal: travelGoalToPartyTarget(
        focusTargetAsCombatTarget(target, distance),
        stagingRange,
      ),
    };
  }

  const pullCast = maybeQueuePullAbility({
    self: input.self,
    target,
    distance,
    abilities: input.abilities,
    reserveCommandBatch: input.reserveCommandBatch,
    groupMode: 'prepare_party',
  });
  if (pullCast) return pullCast;

  const rangedAttack = queueRangedHostileAttack(
    input.self,
    input.bot.class,
    target,
    'prepare_party',
    input.reserveCommandBatch,
  );
  if (rangedAttack) return rangedAttack;

  const targetCommand = targetOnlyCommand(input.self, target, input.reserveCommandBatch);
  return {
    commands: targetCommand ? [targetCommand] : [],
    groupMode: 'prepare_party',
  };
}

function maybeHoldForIncomingPull(input: {
  self: SupportSelfView;
  bot: AmbientPlayerBotRecord;
  target: SupportMobView;
  distance: number;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
  groupMode: string;
}): AmbientPartySupportDecision | null {
  if (input.target.aggroTargetId === null) return null;
  if (input.distance <= groupPullMeleeReleaseRange(input.target)) return null;
  if (hasPullAbilityAtDistance(input.abilities, input.distance)) return null;
  if (hasRangedAutoAttackAtDistance(input.bot.class, input.distance)) return null;
  const targetCommand = targetOnlyCommand(input.self, input.target, input.reserveCommandBatch);
  return {
    commands: targetCommand ? [targetCommand] : [],
    groupMode: input.groupMode,
  };
}

function groupPullStagingRange(target: SupportMobView): number {
  const aggroRadius = MOBS[target.templateId]?.aggroRadius ?? 0;
  return aggroRadius >= GROUP_DENSE_PACK_PULL_AGGRO_RADIUS
    ? Math.max(GROUP_PULL_STAGING_RANGE, aggroRadius + GROUP_DENSE_PACK_PULL_STAGING_PADDING)
    : GROUP_PULL_STAGING_RANGE;
}

function groupPullMeleeReleaseRange(target: SupportMobView): number {
  const aggroRadius = MOBS[target.templateId]?.aggroRadius ?? 0;
  return aggroRadius >= GROUP_DENSE_PACK_PULL_AGGRO_RADIUS
    ? GROUP_DENSE_PACK_PULL_MELEE_RELEASE_RANGE
    : GROUP_PULL_MELEE_RELEASE_RANGE;
}

function maybePreserveThreatenedSelf(input: {
  self: SupportSelfView;
  members: readonly SupportPartyMemberView[];
  tankPid: number | null;
  leaderMember: PartyMemberInfo | null;
  role: Role;
  canSelfHeal: boolean;
  partyInCombat: boolean;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
}): AmbientPartySupportDecision | null {
  if (!input.partyInCombat || input.role === 'tank') return null;
  const selfMember = input.members.find((member) => member.member.pid === input.self.id) ?? null;
  if (!selfMember || selfMember.member.dead) return null;

  const ratio = healthRatio(selfMember.member);
  const threatened = selfMember.threatenedCount > 0;
  const threatenedRatio = isFragileLowLevelMember(selfMember.member)
    ? GROUP_FRAGILE_SELF_PRESERVE_THREATENED_RATIO
    : GROUP_SELF_PRESERVE_THREATENED_RATIO;
  const shouldPreserve =
    (threatened && ratio <= threatenedRatio) || ratio <= GROUP_SELF_PRESERVE_EMERGENCY_RATIO;
  if (!shouldPreserve) return null;

  const commands: Record<string, unknown>[] = [];
  const potion =
    ratio <= GROUP_SELF_PRESERVE_POTION_RATIO ? findHealingPotion(input.self.inventory) : null;
  let usedPotion = false;
  if (
    potion &&
    input.reserveCommandBatch([
      { key: `use:${potion}`, cooldownMs: USE_POTION_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'use', item: potion });
    usedPotion = true;
  }
  if (
    !usedPotion &&
    input.canSelfHeal &&
    ratio <= GROUP_SELF_PRESERVE_EMERGENCY_RATIO &&
    selfIsMostUrgentWoundedMember(input.members, input.self.id, ratio)
  ) {
    return null;
  }
  if (
    input.self.autoAttack &&
    input.reserveCommandBatch([{ key: 'stopattack', cooldownMs: STOP_ATTACK_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    input.self.targetId !== null &&
    input.reserveCommandBatch([
      { key: 'clear_target', cooldownMs: CLEAR_TARGET_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  const anchor = selfPreserveAnchor(
    input.members,
    input.tankPid,
    input.leaderMember,
    input.self.id,
  );
  const anchorDistance = anchor ? planarDistance(input.self.pos, anchor) : 0;
  const travelGoal =
    anchor && anchorDistance > GROUP_SELF_PRESERVE_ANCHOR_RANGE
      ? travelGoalToPartyMember(anchor, GROUP_SELF_PRESERVE_ANCHOR_RANGE, 'party-recover-anchor')
      : undefined;
  if (commands.length === 0 && !travelGoal) return null;

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
  const tank =
    tankPid !== null
      ? (members.find((member) => member.member.pid === tankPid)?.member ?? null)
      : null;
  if (tank && tank.pid !== selfId && !tank.dead) return tank;
  if (leaderMember && leaderMember.pid !== selfId && !leaderMember.dead) return leaderMember;
  return (
    members
      .map((member) => member.member)
      .filter((member) => member.pid !== selfId && !member.dead)
      .sort((a, b) => a.pid - b.pid)[0] ?? null
  );
}

function selfIsMostUrgentWoundedMember(
  members: readonly SupportPartyMemberView[],
  selfId: number,
  selfRatio: number,
): boolean {
  return !members.some(
    (member) =>
      member.member.pid !== selfId &&
      !member.member.dead &&
      healthRatio(member.member) < selfRatio - 0.001,
  );
}

function isFragileLowLevelMember(member: PartyMemberInfo): boolean {
  if (member.level > GROUP_FRAGILE_SELF_PRESERVE_MAX_LEVEL) return false;
  return member.cls === 'mage' || member.cls === 'priest' || member.cls === 'warlock';
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
      shield &&
      (ratio <= 0.38 || (target.threatenedCount > 0 && ratio <= GROUP_SHIELD_THREATENED_RATIO)) &&
      !hasFreshFriendlyAura(target, shield)
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
      const emergency =
        abilities.get('flash_heal') ?? abilities.get('heal') ?? abilities.get('lesser_heal');
      if (emergency) {
        const decision = queueFriendlyCast(
          self,
          target,
          emergency,
          'heal_party',
          reserveCommandBatch,
        );
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
      const decision = queueFriendlyCast(
        self,
        target,
        layOnHands,
        'heal_party',
        reserveCommandBatch,
      );
      if (decision) return decision;
    }
    const flash = abilities.get('flash_of_light');
    if (flash && ratio <= 0.45) {
      const decision = queueFriendlyCast(self, target, flash, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }
    const holyLight = abilities.get('holy_light');
    if (holyLight && ratio <= 0.72) {
      const decision = queueFriendlyCast(
        self,
        target,
        holyLight,
        'heal_party',
        reserveCommandBatch,
      );
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
    if (
      rejuvenation &&
      ratio <= (inCombat ? 0.8 : 0.88) &&
      !hasFreshFriendlyAura(target, rejuvenation)
    ) {
      const decision = queueFriendlyCast(
        self,
        target,
        rejuvenation,
        'heal_party',
        reserveCommandBatch,
      );
      if (decision) return decision;
    }

    const regrowth = abilities.get('regrowth');
    if (regrowth && ratio <= 0.62 && !hasFreshFriendlyAura(target, regrowth)) {
      const decision = queueFriendlyCast(self, target, regrowth, 'heal_party', reserveCommandBatch);
      if (decision) return decision;
    }

    const healingTouch = abilities.get('healing_touch');
    if (healingTouch && ratio <= 0.5) {
      const decision = queueFriendlyCast(
        self,
        target,
        healingTouch,
        'heal_party',
        reserveCommandBatch,
      );
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
  if (!nonEmergencyFriendlyCastKeepsManaReserve(self, ability, groupMode)) return null;
  const range = ability.def.range > 0 ? ability.def.range : 5;
  if (!withinRange(self.pos, target.member, range)) return null;
  const reservations: AmbientGroupCommandReservation[] = [];
  if (self.targetId !== target.member.pid) {
    reservations.push({
      key: `target:${target.member.pid}`,
      cooldownMs: TARGET_COMMAND_COOLDOWN_MS,
    });
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
    facing: facingForHostile(self, target),
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
    facing: facingForHostile(self, target),
  };
}

function queueRangedHostileAttack(
  self: SupportSelfView,
  cls: AmbientPlayerBotRecord['class'],
  target: SupportMobView,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  const distance = planarDistance(self.pos, target.pos);
  if (self.autoAttack || !hasRangedAutoAttackAtDistance(cls, distance)) return null;
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
    facing: facingForHostile(self, target),
  };
}

function queueSelfCast(
  self: SupportSelfView,
  ability: KnownAbility,
  groupMode: string,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): AmbientPartySupportDecision | null {
  if (!canUseAbility(self, ability)) return null;
  if (
    !reserveCommandBatch([
      { key: `cast:${ability.def.id}`, cooldownMs: castCommandCooldownMs(ability) },
    ])
  ) {
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

function targetOnlyCommand(
  self: SupportSelfView,
  target: SupportMobView,
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'],
): Record<string, unknown> | null {
  if (self.targetId === target.id) return null;
  if (
    !reserveCommandBatch([{ key: `target:${target.id}`, cooldownMs: TARGET_COMMAND_COOLDOWN_MS }])
  ) {
    return null;
  }
  return { cmd: 'target', id: target.id };
}

function canProvidePartyHealing(
  cls: AmbientPlayerBotRecord['class'],
  self: SupportSelfView,
): boolean {
  if (cls === 'priest' || cls === 'paladin' || cls === 'shaman') return true;
  if (cls !== 'druid') return false;
  return (
    !hasAuraKind(self.auras, 'form_bear') &&
    !hasAuraKind(self.auras, 'form_cat') &&
    !hasAuraKind(self.auras, 'form_travel')
  );
}

function supportRoleForSelf(cls: AmbientPlayerBotRecord['class'], self: SupportSelfView): Role {
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

function partyReadyForPull(
  members: readonly SupportPartyMemberView[],
  leaderPid: number | null,
): boolean {
  if (leaderPid === null) return false;
  const leader = members.find((member) => member.member.pid === leaderPid) ?? null;
  if (!leader || leader.member.dead) return false;
  return members
    .filter((member) => !member.member.dead)
    .every(
      (member) =>
        member.member.pid === leaderPid ||
        planarDistance({ x: member.member.x, z: member.member.z }, leader.member) <=
          GROUP_PULL_READY_LEADER_RANGE,
    );
}

function selectPartyPullerPid(
  members: readonly SupportPartyMemberView[],
  leaderPid: number | null,
): number | null {
  const candidates = members
    .map((member) => member.member)
    .filter((member) => !member.dead && memberCanSafelyPull(member))
    .sort((a, b) => {
      const aPriority = pullerClassPriority(a.cls);
      const bPriority = pullerClassPriority(b.cls);
      if (aPriority !== bPriority) return aPriority - bPriority;
      const aLeader = leaderPid !== null && a.pid === leaderPid ? 1 : 0;
      const bLeader = leaderPid !== null && b.pid === leaderPid ? 1 : 0;
      if (aLeader !== bLeader) return bLeader - aLeader;
      return a.pid - b.pid;
    });
  return candidates[0]?.pid ?? null;
}

function memberCanSafelyPull(member: PartyMemberInfo): boolean {
  const abilities = abilitiesKnownAt(member.cls, member.level);
  return !!CLASSES[member.cls].ranged || abilities.some(isSafePullAbility);
}

function pullerClassPriority(cls: PartyMemberInfo['cls']): number {
  switch (cls) {
    case 'hunter':
      return 0;
    case 'mage':
    case 'warlock':
      return 1;
    case 'shaman':
    case 'druid':
      return 2;
    case 'priest':
      return 3;
    case 'paladin':
      return 4;
    default:
      return 5;
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
  return (
    member.cls === 'warrior' ||
    member.cls === 'rogue' ||
    member.cls === 'hunter' ||
    member.cls === 'paladin' ||
    member.cls === 'shaman' ||
    member.cls === 'druid'
  );
}

function knownAbilityMap(
  bot: AmbientPlayerBotRecord,
  self: SupportSelfView,
): ReadonlyMap<string, KnownAbility> {
  const mods = self.talents ? computeTalentModifiers(bot.class, self.talents) : undefined;
  return new Map(
    abilitiesKnownAt(bot.class, self.level, mods).map((ability) => [ability.def.id, ability]),
  );
}

function findHealingPotion(inventory: readonly InvSlot[]): string | null {
  let bestItemId: string | null = null;
  let bestHealing = 0;
  for (const slot of inventory) {
    if (slot.count <= 0) continue;
    const item = ITEMS[slot.itemId];
    const healing =
      item && item.kind === 'potion' && 'potionHp' in item && typeof item.potionHp === 'number'
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
  groupMode: string;
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
    groupMode: input.groupMode,
    facing: facingForHostile(input.self, input.target),
  };
}

function facingForHostile(self: SupportSelfView, target: SupportMobView): number {
  return angleTo(
    { x: self.pos.x, y: 0, z: self.pos.z },
    { x: target.pos.x, y: 0, z: target.pos.z },
  );
}

function maybeQueuePullAbility(input: {
  self: SupportSelfView;
  target: SupportMobView;
  distance: number;
  abilities: ReadonlyMap<string, KnownAbility>;
  reserveCommandBatch: AmbientPartySupportInput['reserveCommandBatch'];
  groupMode: string;
}): AmbientPartySupportDecision | null {
  const ability = pickPullAbility(input.abilities, input.distance, input.self);
  if (!ability) return null;
  return queueHostileCast(
    input.self,
    input.target,
    ability,
    input.groupMode,
    input.reserveCommandBatch,
  );
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
  candidates.sort(
    (a, b) => scoreFocusFireAbility(b, preferRanged) - scoreFocusFireAbility(a, preferRanged),
  );
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

function hasPullAbilityAtDistance(
  abilities: ReadonlyMap<string, KnownAbility>,
  distance: number,
): boolean {
  return [...abilities.values()]
    .filter(isSafePullAbility)
    .some((ability) => abilityMatchesDistance(ability, distance));
}

function pickPullAbility(
  abilities: ReadonlyMap<string, KnownAbility>,
  distance: number,
  self: SupportSelfView,
): KnownAbility | null {
  const candidates = [...abilities.values()]
    .filter(isSafePullAbility)
    .filter((ability) => abilityMatchesDistance(ability, distance))
    .filter((ability) => canUseAbility(self, ability));
  candidates.sort((a, b) => {
    const aInstant = a.castTime === 0 ? 1 : 0;
    const bInstant = b.castTime === 0 ? 1 : 0;
    if (aInstant !== bInstant) return bInstant - aInstant;
    return abilityRange(b) - abilityRange(a);
  });
  return candidates[0] ?? null;
}

function isSafePullAbility(ability: KnownAbility): boolean {
  if (!isFocusFireAbility(ability)) return false;
  if (abilityRange(ability) <= MELEE_RANGE + 1) return false;
  return true;
}

function isFocusFireAbility(ability: KnownAbility): boolean {
  if (!ability.def.requiresTarget) return false;
  if (ability.def.requiresStealth) return false;
  if (ability.def.requiresOutOfCombat) return false;
  if (ability.def.requiresDodgeProc) return false;
  if (ability.def.requiresTargetHpBelow) return false;
  if (ability.def.spendsCombo) return false;
  if (ability.def.targetType === 'friendly') return false;
  if (ability.effects.some((effect) => effect.type === 'weaponStrike' && effect.requiresBehind))
    return false;
  if (
    ability.effects.some(
      (effect) =>
        effect.type === 'incapacitate' || effect.type === 'polymorph' || effect.type === 'stun',
    )
  ) {
    return false;
  }
  return ability.effects.some(
    (effect) =>
      effect.type === 'directDamage' ||
      effect.type === 'weaponDamage' ||
      effect.type === 'weaponStrike' ||
      effect.type === 'dot' ||
      effect.type === 'drainTick' ||
      effect.type === 'finisherDamage' ||
      effect.type === 'aoeDamage',
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
  return distance <= abilityRange(ability) + 0.35 && distance >= (ability.def.minRange ?? 0) - 0.35;
}

function abilityRange(ability: KnownAbility): number {
  return ability.def.range > 0 ? ability.def.range : MELEE_RANGE;
}

function withinAutoAttackRange(cls: AmbientPlayerBotRecord['class'], distance: number): boolean {
  const ranged = CLASSES[cls].ranged;
  if (!ranged) return distance <= MELEE_RANGE + 0.3;
  const minRange = ranged.wand ? 0 : ranged.minRange;
  return distance <= ranged.maxRange + 0.35 && distance >= minRange - 0.35;
}

function hasRangedAutoAttackAtDistance(
  cls: AmbientPlayerBotRecord['class'],
  distance: number,
): boolean {
  const ranged = CLASSES[cls].ranged;
  if (!ranged) return false;
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

function selectFocusTarget(input: {
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  markerByEntityId: Record<string, number>;
  tankPid: number | null;
  leaderPid: number | null;
}): SupportMobView | null {
  const mobById = new Map(input.hostileMobs.map((mob) => [mob.id, mob]));
  const markedTarget = selectMarkedFocusTarget(mobById, input.markerByEntityId);
  if (markedTarget) return markedTarget;

  const leaderTarget = selectLeaderFocusTarget(mobById, input.members, input.leaderPid);
  if (leaderTarget) return leaderTarget;

  const votedTarget = selectVotedFocusTarget(
    mobById,
    input.members,
    input.tankPid,
    input.leaderPid,
  );
  if (votedTarget) return votedTarget;

  return selectAggroFocusTarget(input.hostileMobs, input.members, input.tankPid, input.leaderPid);
}

function selectMarkedFocusTarget(
  mobById: ReadonlyMap<number, SupportMobView>,
  markerByEntityId: Record<string, number>,
): SupportMobView | null {
  const marked = Object.entries(markerByEntityId)
    .map(([entityIdText, markerId]) => {
      const entityId = Number(entityIdText);
      const mob = Number.isInteger(entityId) ? (mobById.get(entityId) ?? null) : null;
      return mob && isValidRaidMarkerId(markerId)
        ? { mob, markerId, priority: markerFocusPriority(markerId) }
        : null;
    })
    .filter(
      (entry): entry is { mob: SupportMobView; markerId: number; priority: number } =>
        entry !== null,
    );
  marked.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (a.markerId !== b.markerId) return a.markerId - b.markerId;
    return a.mob.id - b.mob.id;
  });
  return marked[0]?.mob ?? null;
}

function selectLeaderFocusTarget(
  mobById: ReadonlyMap<number, SupportMobView>,
  members: readonly SupportPartyMemberView[],
  leaderPid: number | null,
): SupportMobView | null {
  if (leaderPid === null) return null;
  const leader = members.find((member) => member.member.pid === leaderPid) ?? null;
  if (!leader || leader.member.dead) return null;
  const targetId = leader.member.targetId;
  return targetId !== undefined && targetId !== null ? (mobById.get(targetId) ?? null) : null;
}

function selectVotedFocusTarget(
  mobById: ReadonlyMap<number, SupportMobView>,
  members: readonly SupportPartyMemberView[],
  tankPid: number | null,
  leaderPid: number | null,
): SupportMobView | null {
  const tallies = new Map<
    number,
    {
      mob: SupportMobView;
      votes: number;
      score: number;
      nearestVoteDistance: number;
    }
  >();
  for (const member of members) {
    if (member.member.dead) continue;
    const targetId = member.member.targetId;
    if (targetId === undefined || targetId === null) continue;
    const mob = mobById.get(targetId);
    if (!mob) continue;
    const current = tallies.get(targetId) ?? {
      mob,
      votes: 0,
      score: 0,
      nearestVoteDistance: Number.POSITIVE_INFINITY,
    };
    current.votes += 1;
    current.score += partyTargetVoteScore(member.member.pid, tankPid, leaderPid);
    current.nearestVoteDistance = Math.min(
      current.nearestVoteDistance,
      planarDistance({ x: member.member.x, z: member.member.z }, mob.pos),
    );
    tallies.set(targetId, current);
  }

  const sorted = [...tallies.values()];
  sorted.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.votes !== b.votes) return b.votes - a.votes;
    if (Math.abs(a.nearestVoteDistance - b.nearestVoteDistance) > 0.001) {
      return a.nearestVoteDistance - b.nearestVoteDistance;
    }
    return a.mob.id - b.mob.id;
  });
  return sorted[0]?.mob ?? null;
}

function selectAggroFocusTarget(
  hostileMobs: readonly SupportMobView[],
  members: readonly SupportPartyMemberView[],
  tankPid: number | null,
  leaderPid: number | null,
): SupportMobView | null {
  const memberByPid = new Map(members.map((member) => [member.member.pid, member.member]));
  const sorted = [...hostileMobs].filter(
    (mob) => mob.aggroTargetId !== null && memberByPid.has(mob.aggroTargetId),
  );
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

function selectExplicitFocusTarget(input: {
  hostileMobs: readonly SupportMobView[];
  members: readonly SupportPartyMemberView[];
  markerByEntityId: Record<string, number>;
  tankPid: number | null;
  leaderPid: number | null;
}): SupportMobView | null {
  const mobById = new Map(input.hostileMobs.map((mob) => [mob.id, mob]));
  const markedTarget = selectMarkedFocusTarget(mobById, input.markerByEntityId);
  if (markedTarget) return markedTarget;

  const leaderTarget = selectLeaderFocusTarget(mobById, input.members, input.leaderPid);
  if (leaderTarget) return leaderTarget;

  return selectVotedFocusTarget(mobById, input.members, input.tankPid, input.leaderPid);
}

function isValidRaidMarkerId(markerId: number): boolean {
  return Number.isInteger(markerId) && markerId >= 0 && markerId <= 7;
}

function markerFocusPriority(markerId: number): number {
  if (markerId === 7) return 0;
  if (markerId === 6) return 1;
  return markerId + 2;
}

function partyTargetVoteScore(
  pid: number,
  tankPid: number | null,
  leaderPid: number | null,
): number {
  let score = 10;
  if (leaderPid !== null && pid === leaderPid) score += 5;
  if (tankPid !== null && pid === tankPid) score += 3;
  return score;
}

function selectEmergencyRecoveryThreat(
  hostileMobs: readonly SupportMobView[],
  members: readonly SupportPartyMemberView[],
): SupportMobView | null {
  const threatenedMembers = new Map(
    members
      .filter(
        (member) =>
          !member.member.dead && healthRatio(member.member) <= GROUP_RECOVERY_EMERGENCY_FOCUS_RATIO,
      )
      .map((member) => [member.member.pid, member]),
  );
  const sorted = [...hostileMobs].filter(
    (mob) => mob.aggroTargetId !== null && threatenedMembers.has(mob.aggroTargetId),
  );
  sorted.sort((a, b) => {
    const aMember = threatenedMembers.get(a.aggroTargetId ?? -1);
    const bMember = threatenedMembers.get(b.aggroTargetId ?? -1);
    const aRatio = aMember ? healthRatio(aMember.member) : 1;
    const bRatio = bMember ? healthRatio(bMember.member) : 1;
    if (Math.abs(aRatio - bRatio) > 0.001) return aRatio - bRatio;
    const aDistance = aMember
      ? planarDistance({ x: aMember.member.x, z: aMember.member.z }, a.pos)
      : 0;
    const bDistance = bMember
      ? planarDistance({ x: bMember.member.x, z: bMember.member.z }, b.pos)
      : 0;
    if (Math.abs(aDistance - bDistance) > 0.001) return aDistance - bDistance;
    return a.id - b.id;
  });
  return sorted[0] ?? null;
}

function selectRecoveryProtectionTarget(
  hostileMobs: readonly SupportMobView[],
  members: readonly SupportPartyMemberView[],
  self: SupportSelfView,
): SupportMobView | null {
  const memberByPid = new Map(
    members.filter((member) => !member.member.dead).map((member) => [member.member.pid, member]),
  );
  const sorted = [...hostileMobs].filter(
    (mob) => mob.aggroTargetId !== null && memberByPid.has(mob.aggroTargetId),
  );
  sorted.sort((a, b) => {
    const aMember = memberByPid.get(a.aggroTargetId ?? -1);
    const bMember = memberByPid.get(b.aggroTargetId ?? -1);
    const aPriority = aMember ? recoveryProtectionPriority(aMember, self.id) : 4;
    const bPriority = bMember ? recoveryProtectionPriority(bMember, self.id) : 4;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aHealer = aMember && canClassHeal(aMember.member.cls) ? 1 : 0;
    const bHealer = bMember && canClassHeal(bMember.member.cls) ? 1 : 0;
    if (aHealer !== bHealer) return bHealer - aHealer;
    const aRatio = aMember ? healthRatio(aMember.member) : 1;
    const bRatio = bMember ? healthRatio(bMember.member) : 1;
    if (Math.abs(aRatio - bRatio) > 0.001) return aRatio - bRatio;
    const aDistance = planarDistance(self.pos, a.pos);
    const bDistance = planarDistance(self.pos, b.pos);
    if (Math.abs(aDistance - bDistance) > 0.001) return aDistance - bDistance;
    return a.id - b.id;
  });
  return sorted[0] ?? null;
}

function recoveryProtectionPriority(member: SupportPartyMemberView, selfId: number): number {
  if (member.member.pid === selfId) return 3;
  const ratio = healthRatio(member.member);
  if (ratio <= GROUP_RECOVERY_EMERGENCY_FOCUS_RATIO) return 0;
  if (ratio <= GROUP_RECOVERY_PROTECTOR_STABLE_RATIO) return 1;
  return 2;
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

function canUseAbility(self: SupportSelfView, ability: KnownAbility): boolean {
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

function nonEmergencyFriendlyCastKeepsManaReserve(
  self: SupportSelfView,
  ability: KnownAbility,
  groupMode: string,
): boolean {
  if (groupMode !== 'buff_party' && groupMode !== 'prepare_party') return true;
  if (self.resourceType !== 'mana' || self.maxResource <= 0 || ability.cost <= 0) return true;
  return (
    (self.resource - ability.cost) / self.maxResource >= GROUP_NON_EMERGENCY_MANA_RESERVE_RATIO
  );
}

function currentFormKind(auras: readonly SupportAuraView[]): string | null {
  const form = auras.find(
    (aura) => aura.kind === 'form_bear' || aura.kind === 'form_cat' || aura.kind === 'form_travel',
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
  return dist2d({ x: source.x, y: 0, z: source.z }, { x: target.x, y: 0, z: target.z });
}

function hasFreshFriendlyAura(target: SupportPartyMemberView, ability: KnownAbility): boolean {
  const duration = ability.effects.reduce((max, effect) => {
    if (
      effect.type === 'buffTarget' ||
      effect.type === 'selfBuff' ||
      effect.type === 'absorb' ||
      effect.type === 'hot'
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

function hasAuraId(auras: readonly SupportAuraView[], auraId: string): boolean {
  return auras.some((aura) => aura.id === auraId && aura.remaining > 3);
}

function hasAuraKind(auras: readonly SupportAuraView[], auraKind: string): boolean {
  return auras.some((aura) => aura.kind === auraKind && aura.remaining > 3);
}

function buildSupportMembers(
  party: PartyInfo,
  liveState: AmbientPlayerBotLiveState,
  self: SupportSelfView,
  hostileMobs: readonly SupportMobView[],
): SupportPartyMemberView[] {
  return party.members.map((member) => {
    const visibleRecord =
      member.pid === self.id ? liveState.self : (liveState.entities.get(member.pid) ?? null);
    const rosterVisible = planarDistance(self.pos, member) <= PARTY_ROSTER_VISIBILITY_RANGE;
    return {
      member,
      visible: !!visibleRecord || rosterVisible,
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
    if (!isAttackableMob(raw)) continue;
    const id = readNumber(raw.id);
    const x = readNumber(raw.x);
    const z = readNumber(raw.z);
    if (id === null || x === null || z === null) continue;
    const aggroTargetId = readNumber(raw.aggro);
    if (aggroTargetId !== null && !partyIds.has(aggroTargetId)) continue;
    mobs.push({
      id,
      templateId: readString(raw.tid) ?? '',
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
    targetMarkers: readNumberRecord(raw.marks),
    autoAttack: readBoolean(raw.auto),
    resource: readNumber(raw.res) ?? 0,
    maxResource: readNumber(raw.mres) ?? 0,
    resourceType: readString(raw.rtype) ?? '',
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
  return parseTalentAllocation(record?.alloc);
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
    ? (raw as Record<string, unknown>)
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

function isAttackableMob(raw: Record<string, unknown>): boolean {
  if (readString(raw.k) !== 'mob' || readBoolean(raw.dead)) return false;
  const hp = readNumber(raw.hp);
  if (hp !== null && hp <= 0) return false;
  return readHostileSignal(raw.h) || readNumber(raw.aggro) !== null;
}

function readHostileSignal(raw: unknown): boolean {
  if (readBoolean(raw)) return true;
  const numeric = readNumber(raw);
  return numeric !== null && numeric > 0;
}
