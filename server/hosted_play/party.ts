import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { SimEvent } from '../../src/sim/types';
import type { PlayerClass, ResourceType } from '../../src/sim/types';
import { ITEMS } from '../../src/sim/data';
import {
  normalizeHostedPlayAutoInviteTargetPartySize,
  type HostedPlayAutoInviteTargetPartySize,
} from '../../src/hosted_play_settings';
import { distanceBetweenPartyMembers, type PartyTravelGoal, findPartyCombatTarget, partyAssistArrivalRange, travelGoalToPartyMember, travelGoalToPartyTarget } from '../party_coordination';
import {
  maybeCoordinateAmbientPartySupport,
  type AmbientGroupCommandReservation,
} from '../ambient_bots/group_support';
import type { AmbientPartyCoordinationIntent } from '../ambient_bots/party_intent';
import { maybePrepareForPullFromLiveState } from '../ambient_bots/pre_combat';
import type { AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import type { HostedPlayGroupMode, HostedPlayPartyMode } from './types';

const HOSTED_PLAY_ACCEPT_COOLDOWN_MS = 1_500;
const HOSTED_PLAY_ASSIST_COOLDOWN_MS = 1_200;
const HOSTED_PLAY_NEARBY_INVITE_COOLDOWN_MS = 12_000;
const HOSTED_PLAY_NEARBY_INVITE_TARGET_COOLDOWN_MS = 90_000;
const HOSTED_PLAY_NEARBY_INVITE_RANGE = 32;
const HOSTED_PLAY_REGROUP_RANGE = 18;
const HOSTED_PLAY_FOLLOW_START_RANGE = 4;
const HOSTED_PLAY_FOLLOW_MAX_RANGE = 60;
const HOSTED_PLAY_RECOVERY_ANCHOR_RANGE = 4;
const HOSTED_PLAY_URGENT_RECOVERY_ANCHOR_RANGE = 1.5;
const HOSTED_PLAY_URGENT_RECOVERY_THREAT_RANGE = 10;
const HOSTED_PLAY_URGENT_RECOVERY_RETREAT_DISTANCE = 8;
const HOSTED_PLAY_RECOVERY_HEALTH_RATIO = 0.72;
const HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO = 0.9;
const HOSTED_PLAY_RECOVERY_RESOURCE_RATIO = 0.45;
const HOSTED_PLAY_RECOVERY_STABLE_RESOURCE_RATIO = 0.65;
const HOSTED_PLAY_RECOVERY_POTION_RATIO = 0.65;
const HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_HEALTH_RATIO = 0.9;
const HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_POTION_RATIO = 0.72;
const HOSTED_PLAY_FRAGILE_THREAT_MAX_LEVEL = 4;
const HOSTED_PLAY_FRONTLINE_THREAT_RECOVERY_HEALTH_RATIO = 0.82;
const HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS = 1_500;
const HOSTED_PLAY_RECOVERY_POTION_COOLDOWN_MS = 60_000;

type HostedPlayCommand = Record<string, unknown>;

export interface HostedPlayPartyState {
  lastAcceptCommandAtMs: number | null;
  lastAssistCommandAtMs: number | null;
  lastNearbyInviteCommandAtMs: number | null;
  lastNearbyInviteAtMsByName: Record<string, number>;
  lastCommandAtMs: Record<string, number>;
}

export interface HostedPlayPartyTickInput {
  liveSelf: Record<string, unknown>;
  entities: Iterable<Record<string, unknown>>;
  recentEvents: readonly SimEvent[];
  playerClass: PlayerClass;
  partyMode: HostedPlayPartyMode;
  autoInviteNearbyPlayers?: boolean;
  autoInviteNearbyTargetPartySize?: HostedPlayAutoInviteTargetPartySize;
  objectiveSuggestedPartySize?: number;
  partyIntent?: AmbientPartyCoordinationIntent | null;
  ambientDirectory: readonly AmbientPlayerBotRecord[];
  nowMs: number;
}

export interface HostedPlayPartyTickResult {
  commands: readonly HostedPlayCommand[];
  pauseBrainDrive: boolean;
  travelGoal?: PartyTravelGoal;
  groupMode: HostedPlayGroupMode;
  groupLeaderName: string;
  groupLeaderDistance: number;
}

export function createHostedPlayPartyState(): HostedPlayPartyState {
  return {
    lastAcceptCommandAtMs: null,
    lastAssistCommandAtMs: null,
    lastNearbyInviteCommandAtMs: null,
    lastNearbyInviteAtMsByName: {},
    lastCommandAtMs: {},
  };
}

export function tickHostedPlayPartyCoordinator(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
): HostedPlayPartyTickResult {
  const entities = Array.from(input.entities);
  const liveInput: HostedPlayPartyTickInput = { ...input, entities };
  const rawParty = parsePartyInfo(input.liveSelf.party);
  const party = rawParty ? refreshPartyInfoFromLiveState(rawParty, input.liveSelf, entities) : null;
  const inviteFromName = !party && input.partyMode === 'follow_leader'
    ? input.recentEvents
        .map(partyInviteFromName)
        .find((name): name is string => !!name)
    : null;
  if (inviteFromName && canIssueAccept(input, state)) {
    return {
      commands: [{ cmd: 'paccept' }],
      pauseBrainDrive: true,
      groupMode: 'accept_invite',
      groupLeaderName: inviteFromName,
      groupLeaderDistance: 0,
    };
  }

  const nearbyInviteResult = maybeInviteNearbyPlayer(liveInput, state, party);
  if (nearbyInviteResult) return nearbyInviteResult;

  if (!party || input.partyMode !== 'follow_leader' || party.members.length < 2) {
    return idlePartyResult();
  }

  const selfMember = party.members.find((member) => member.pid === readSelfId(input.liveSelf)) ?? null;
  const leaderMember = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!selfMember || !leaderMember) return idlePartyResult();

  const leaderDistance = distanceBetweenPartyMembers(selfMember, leaderMember);
  const groupLeaderName = leaderMember.name;
  const partyInCombat = party.members.some((member) => member.inCombat === 1) || hasPartyThreat(entities, party);
  const partyIntentRecovering = input.partyIntent?.kind === 'recovery'
    || input.partyIntent?.behavior === 'recover';
  const partyRecovering = partyNeedsRecovery(party, partyIntentRecovering);
  const botRecord = hostedPlayPartyBotRecord(input.playerClass, selfMember);
  const liveState = hostedPartyLiveState(input.liveSelf, entities);
  const followerCanMoveToLeader = selfMember.pid !== leaderMember.pid
    && !selfMember.dead
    && !leaderMember.dead
    && !selfMember.inCombat;
  const followerNeedsToCloseGap =
    followerCanMoveToLeader && leaderDistance > HOSTED_PLAY_FOLLOW_START_RANGE;
  const followerOutsidePartyActionRange =
    followerNeedsToCloseGap && leaderDistance > HOSTED_PLAY_FOLLOW_MAX_RANGE;

  const selfNeedsEarlyThreatRecovery = selfNeedsFragileThreatRecovery(selfMember, entities);
  const selfNeedsIntentRecovery = selfNeedsFragileIntentRecovery(
    selfMember,
    partyIntentRecovering,
  );
  const selfNeedsFrontlineRecovery = selfNeedsFrontlineThreatRecovery(selfMember, entities);
  const selfNeedsUrgentRecovery = !selfMember.dead
    && (
      (partyRecovering && memberHealthRatio(selfMember) <= HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO)
      || selfNeedsEarlyThreatRecovery
      || selfNeedsIntentRecovery
      || selfNeedsFrontlineRecovery
    );
  if (selfNeedsUrgentRecovery) {
    const recoveryPause = maybePauseForPartyRecovery({
      liveSelf: input.liveSelf,
      party,
      selfMember,
      leaderMember,
      leaderDistance,
      state,
      nowMs: input.nowMs,
      entities,
      forceSelfRecovery: selfNeedsEarlyThreatRecovery || selfNeedsIntentRecovery || selfNeedsFrontlineRecovery,
      forcePartyRecovery: partyRecovering,
    });
    if (recoveryPause) return recoveryPause;
  }

  const regroupReturn = !partyRecovering ? maybeReturnForRegroupIntent({
    intent: input.partyIntent ?? null,
    liveSelf: input.liveSelf,
    selfMember,
    leaderMember,
    leaderDistance,
    state,
    nowMs: input.nowMs,
  }) : null;
  if (regroupReturn) return regroupReturn;

  const formationReturn = !partyRecovering ? maybeReturnForFormationBreak({
    liveSelf: input.liveSelf,
    selfMember,
    leaderMember,
    leaderDistance,
    state,
    nowMs: input.nowMs,
  }) : null;
  if (formationReturn) return formationReturn;

  const supportDecision = !followerOutsidePartyActionRange
    && (partyInCombat || (canHostedProvidePartyPreparation(input.playerClass) && !followerNeedsToCloseGap))
    ? maybeCoordinateAmbientPartySupport({
      bot: botRecord,
      liveState,
      party,
      leaderMember,
      selfMember,
      suppressFocusFire: partyRecovering,
      reserveCommandBatch: (reservations) => reserveCommandBatch(state, input.nowMs, reservations),
    })
    : null;
  if (supportDecision) {
    return {
      commands: supportDecision.commands,
      pauseBrainDrive: true,
      ...(supportDecision.travelGoal ? { travelGoal: supportDecision.travelGoal } : {}),
      groupMode: normalizeHostedGroupMode(supportDecision.groupMode, partyInCombat),
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }

  const recoveryPause = maybePauseForPartyRecovery({
    liveSelf: input.liveSelf,
    party,
    selfMember,
    leaderMember,
    leaderDistance,
    state,
    nowMs: input.nowMs,
    entities,
    forceSelfRecovery: false,
    forcePartyRecovery: partyRecovering,
  });
  if (recoveryPause) return recoveryPause;

  const intentHold = maybeHoldForPartyIntent({
    intent: input.partyIntent ?? null,
    party,
    selfMember,
    leaderMember,
    leaderDistance,
    partyInCombat,
  });
  if (intentHold) return intentHold;

  if (!partyInCombat && !partyRecovering && !followerNeedsToCloseGap) {
    const selfPreparation = maybePrepareForPullFromLiveState({
      bot: botRecord,
      liveSelf: input.liveSelf,
      entities,
      issueCommand: (key, cooldownMs) =>
        reserveCommandBatch(state, input.nowMs, [{ key, cooldownMs }]),
    });
    if (selfPreparation) {
      return {
        commands: [...selfPreparation.commands],
        pauseBrainDrive: true,
        groupMode: 'prepare_party',
        groupLeaderName,
        groupLeaderDistance: leaderDistance,
      };
    }
  }

  if (
    selfMember.pid === leaderMember.pid
    && !selfMember.dead
    && !selfMember.inCombat
    && ambientPartyMemberPreparing(party, input.ambientDirectory, selfMember.pid)
  ) {
    return {
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'prepare_party',
      groupLeaderName,
      groupLeaderDistance: 0,
    };
  }

  const assistTarget = findPartyCombatTarget({
    liveSelf: input.liveSelf,
    entities,
    party,
    maxDistance: HOSTED_PLAY_FOLLOW_MAX_RANGE,
  });
  const assistArrivalRange = partyAssistArrivalRange(input.playerClass);
  const assistTravelGoal = assistTarget && assistTarget.distance > assistArrivalRange
    ? travelGoalToPartyTarget(assistTarget, assistArrivalRange)
    : null;

  if (
    assistTarget
    && !selfMember.dead
    && !selfMember.inCombat
    && readSelfTargetId(input.liveSelf) !== assistTarget.id
    && canIssueAssist(input, state)
  ) {
    return {
      commands: [{ cmd: 'target', id: assistTarget.id }],
      pauseBrainDrive: !!assistTravelGoal,
      ...(assistTravelGoal ? { travelGoal: assistTravelGoal } : {}),
      groupMode: 'assist_party',
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }
  if (assistTravelGoal && !selfMember.dead && !selfMember.inCombat) {
    return {
      commands: [],
      pauseBrainDrive: true,
      travelGoal: assistTravelGoal,
      groupMode: 'assist_party',
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }

  const combatFollowTravelGoal = selfMember.pid !== leaderMember.pid
    && !selfMember.dead
    && !leaderMember.dead
    && !selfMember.inCombat
    && leaderMember.inCombat
    && leaderDistance > HOSTED_PLAY_FOLLOW_START_RANGE
    && leaderDistance <= HOSTED_PLAY_FOLLOW_MAX_RANGE
    ? travelGoalToPartyMember(leaderMember, HOSTED_PLAY_FOLLOW_START_RANGE, 'hosted-combat-leader')
    : null;
  if (combatFollowTravelGoal) {
    return {
      commands: [],
      pauseBrainDrive: true,
      travelGoal: combatFollowTravelGoal,
      groupMode: 'assist_party',
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }

  if (followerCanMoveToLeader) {
    const followTravelGoal = leaderDistance > HOSTED_PLAY_FOLLOW_START_RANGE
      ? travelGoalToPartyMember(leaderMember, HOSTED_PLAY_FOLLOW_START_RANGE, 'hosted-follow-leader')
      : null;
    return {
      commands: [],
      pauseBrainDrive: true,
      ...(followTravelGoal ? { travelGoal: followTravelGoal } : {}),
      groupMode: 'follow_leader',
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }

  if (
    selfMember.pid === leaderMember.pid
    && !selfMember.dead
    && !selfMember.inCombat
    && partyNeedsRegroup(party, selfMember)
  ) {
    return {
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'hold_regroup',
      groupLeaderName,
      groupLeaderDistance: 0,
    };
  }

  return {
    commands: [],
    pauseBrainDrive: false,
    groupMode: 'brain',
    groupLeaderName,
    groupLeaderDistance: leaderDistance,
  };
}

function maybeReturnForRegroupIntent(input: {
  intent: AmbientPartyCoordinationIntent | null;
  liveSelf: Record<string, unknown>;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  leaderDistance: number;
  state: HostedPlayPartyState;
  nowMs: number;
  entities: Iterable<Record<string, unknown>>;
}): HostedPlayPartyTickResult | null {
  if (input.intent?.behavior !== 'regroup') return null;
  if (input.selfMember.pid === input.leaderMember.pid) return null;
  if (input.selfMember.dead || input.leaderMember.dead) return null;
  if (input.leaderDistance <= HOSTED_PLAY_REGROUP_RANGE) return null;

  const commands: HostedPlayCommand[] = [];
  if (
    readSelfAutoAttack(input.liveSelf)
    && reserveCommandBatch(input.state, input.nowMs, [{ key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    readSelfTargetId(input.liveSelf) !== null
    && reserveCommandBatch(input.state, input.nowMs, [{ key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  return {
    commands,
    pauseBrainDrive: true,
    travelGoal: travelGoalToPartyMember(input.leaderMember, HOSTED_PLAY_FOLLOW_START_RANGE, 'hosted-regroup-leader'),
    groupMode: 'follow_leader',
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function maybeReturnForFormationBreak(input: {
  liveSelf: Record<string, unknown>;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  leaderDistance: number;
  state: HostedPlayPartyState;
  nowMs: number;
}): HostedPlayPartyTickResult | null {
  if (input.selfMember.pid === input.leaderMember.pid) return null;
  if (input.selfMember.dead || input.leaderMember.dead) return null;
  if (input.leaderDistance <= HOSTED_PLAY_REGROUP_RANGE) return null;
  if (!input.selfMember.inCombat) return null;

  const commands: HostedPlayCommand[] = [];
  if (
    readSelfAutoAttack(input.liveSelf)
    && reserveCommandBatch(input.state, input.nowMs, [{ key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    readSelfTargetId(input.liveSelf) !== null
    && reserveCommandBatch(input.state, input.nowMs, [{ key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  return {
    commands,
    pauseBrainDrive: true,
    travelGoal: travelGoalToPartyMember(input.leaderMember, HOSTED_PLAY_FOLLOW_START_RANGE, 'hosted-regroup-leader'),
    groupMode: 'follow_leader',
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function maybePauseForPartyRecovery(input: {
  liveSelf: Record<string, unknown>;
  party: PartyInfo;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  leaderDistance: number;
  state: HostedPlayPartyState;
  nowMs: number;
  entities: Iterable<Record<string, unknown>>;
  forceSelfRecovery: boolean;
  forcePartyRecovery: boolean;
}): HostedPlayPartyTickResult | null {
  if ((!input.forcePartyRecovery && !input.forceSelfRecovery) || input.selfMember.dead) return null;

  const selfHealthRatio = memberHealthRatio(input.selfMember);
  const commands: HostedPlayCommand[] = [];
  const potionThreshold = input.forceSelfRecovery
    ? HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_POTION_RATIO
    : HOSTED_PLAY_RECOVERY_POTION_RATIO;
  const potion = selfHealthRatio <= potionThreshold
    ? findHealingPotion(input.liveSelf)
    : null;
  if (
    potion
    && reserveCommandBatch(input.state, input.nowMs, [{ key: `use:${potion}`, cooldownMs: HOSTED_PLAY_RECOVERY_POTION_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'use', item: potion });
  }
  const selfNeedsEscape = input.selfMember.pid !== input.leaderMember.pid
    || input.forcePartyRecovery
    || selfHealthRatio <= HOSTED_PLAY_RECOVERY_HEALTH_RATIO
    || input.forceSelfRecovery;
  if (
    selfNeedsEscape
    && readSelfAutoAttack(input.liveSelf)
    && reserveCommandBatch(input.state, input.nowMs, [{ key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    selfNeedsEscape
    && readSelfTargetId(input.liveSelf) !== null
    && reserveCommandBatch(input.state, input.nowMs, [{ key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS }])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  const anchor = partyRecoveryAnchor(input.party, input.selfMember, input.leaderMember);
  const anchorDistance = anchor ? distanceBetweenPartyMembers(input.selfMember, anchor) : 0;
  const urgentSelfRecovery = input.forceSelfRecovery || selfHealthRatio <= HOSTED_PLAY_RECOVERY_HEALTH_RATIO;
  const recoveryAnchorRange = urgentSelfRecovery
    ? HOSTED_PLAY_URGENT_RECOVERY_ANCHOR_RANGE
    : HOSTED_PLAY_RECOVERY_ANCHOR_RANGE;
  const threatRetreatGoal = anchor && urgentSelfRecovery
    ? recoveryThreatRetreatGoal(input.liveSelf, input.entities, input.selfMember, anchor, recoveryAnchorRange)
    : null;
  const travelGoal = threatRetreatGoal ?? (anchor && anchorDistance > recoveryAnchorRange
    ? travelGoalToPartyMember(anchor, recoveryAnchorRange, 'hosted-party-recover')
    : undefined);

  return {
    commands,
    pauseBrainDrive: true,
    ...(travelGoal ? { travelGoal } : {}),
    groupMode: input.selfMember.pid === input.leaderMember.pid && !travelGoal ? 'recover_party' : 'assist_party',
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function recoveryThreatRetreatGoal(
  liveSelf: Record<string, unknown>,
  entities: Iterable<Record<string, unknown>>,
  selfMember: PartyMemberInfo,
  anchor: PartyMemberInfo,
  arrivalRange: number,
): PartyTravelGoal | null {
  const selfId = readSelfId(liveSelf);
  const selfX = typeof liveSelf.x === 'number' ? liveSelf.x : selfMember.x;
  const selfZ = typeof liveSelf.z === 'number' ? liveSelf.z : selfMember.z;
  let threat: { id: number; x: number; z: number; distance: number } | null = null;
  for (const entity of entities) {
    if (entity.k !== 'mob' || entity.dead === 1 || entity.dead === true || entity.aggro !== selfId) continue;
    const id = typeof entity.id === 'number' ? entity.id : null;
    const x = typeof entity.x === 'number' ? entity.x : null;
    const z = typeof entity.z === 'number' ? entity.z : null;
    if (id === null || x === null || z === null) continue;
    const distance = Math.hypot(selfX - x, selfZ - z);
    if (distance > HOSTED_PLAY_URGENT_RECOVERY_THREAT_RANGE || (threat && distance >= threat.distance)) continue;
    threat = { id, x, z, distance };
  }
  if (!threat) return null;

  const awayX = anchor.x - threat.x;
  const awayZ = anchor.z - threat.z;
  const length = Math.hypot(awayX, awayZ);
  if (length <= 0.001) return null;
  const target = {
    x: anchor.x + (awayX / length) * HOSTED_PLAY_URGENT_RECOVERY_RETREAT_DISTANCE,
    z: anchor.z + (awayZ / length) * HOSTED_PLAY_URGENT_RECOVERY_RETREAT_DISTANCE,
  };
  return {
    target,
    arrivalRange,
    goalKey: `hosted-party-retreat:${anchor.pid}:${threat.id}:${Math.round(target.x)}:${Math.round(target.z)}`,
  };
}

function maybeHoldForPartyIntent(input: {
  intent: AmbientPartyCoordinationIntent | null;
  party: PartyInfo;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  leaderDistance: number;
  partyInCombat: boolean;
}): HostedPlayPartyTickResult | null {
  if (!input.intent?.holdAdvance || input.partyInCombat) return null;
  if (input.selfMember.dead || input.leaderMember.dead) return null;
  if (input.selfMember.pid !== input.leaderMember.pid) return null;
  if (!partyIntentStillNeedsHold(input.intent, input.party, input.leaderMember)) return null;
  const groupMode: HostedPlayGroupMode = input.intent.behavior === 'regroup'
    ? 'hold_regroup'
    : 'prepare_party';
  return {
    commands: [],
    pauseBrainDrive: true,
    groupMode,
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function partyIntentStillNeedsHold(
  intent: AmbientPartyCoordinationIntent,
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): boolean {
  switch (intent.behavior) {
    case 'regroup':
      return partyNeedsRegroup(party, leaderMember);
    case 'recover':
      return partyNeedsRecovery(party, true);
    case 'prepare':
      return false;
    default:
      return true;
  }
}

function partyNeedsRegroup(
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): boolean {
  return party.members.some((member) =>
    member.pid !== leaderMember.pid
    && !member.dead
    && distanceBetweenPartyMembers(member, leaderMember) > HOSTED_PLAY_REGROUP_RANGE);
}

function partyNeedsRecovery(party: PartyInfo, holdUntilStable = false): boolean {
  const healthThreshold = holdUntilStable
    ? HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO
    : HOSTED_PLAY_RECOVERY_HEALTH_RATIO;
  const resourceThreshold = holdUntilStable
    ? HOSTED_PLAY_RECOVERY_STABLE_RESOURCE_RATIO
    : HOSTED_PLAY_RECOVERY_RESOURCE_RATIO;
  return party.members.some((member) =>
    member.dead
    || memberHealthRatio(member) <= healthThreshold
    || memberNeedsResourceRecovery(member, resourceThreshold));
}

function memberNeedsResourceRecovery(
  member: PartyMemberInfo,
  threshold: number,
): boolean {
  return !member.dead
    && member.rtype === 'mana'
    && member.mres > 0
    && canClassHeal(member.cls)
    && memberResourceRatio(member) <= threshold;
}

function selfNeedsFragileThreatRecovery(
  selfMember: PartyMemberInfo,
  entities: readonly Record<string, unknown>[],
): boolean {
  if (selfMember.dead || selfMember.level > HOSTED_PLAY_FRAGILE_THREAT_MAX_LEVEL) return false;
  if (!isFragileHostedClass(selfMember.cls)) return false;
  if (memberHealthRatio(selfMember) > HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_HEALTH_RATIO) return false;
  return entities.some((entity) =>
    entity.k === 'mob'
    && entity.dead !== 1
    && entity.dead !== true
    && entity.aggro === selfMember.pid);
}

function selfNeedsFragileIntentRecovery(
  selfMember: PartyMemberInfo,
  partyIntentRecovering: boolean,
): boolean {
  if (!partyIntentRecovering) return false;
  if (selfMember.dead || selfMember.level > HOSTED_PLAY_FRAGILE_THREAT_MAX_LEVEL) return false;
  if (!isFragileHostedClass(selfMember.cls)) return false;
  return memberHealthRatio(selfMember) <= HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_HEALTH_RATIO;
}

function selfNeedsFrontlineThreatRecovery(
  selfMember: PartyMemberInfo,
  entities: readonly Record<string, unknown>[],
): boolean {
  if (selfMember.dead || !isFrontlineHostedClass(selfMember.cls)) return false;
  if (memberHealthRatio(selfMember) > HOSTED_PLAY_FRONTLINE_THREAT_RECOVERY_HEALTH_RATIO) return false;
  return entities.some((entity) =>
    entity.k === 'mob'
    && entity.dead !== 1
    && entity.dead !== true
    && entity.aggro === selfMember.pid);
}

function isFragileHostedClass(cls: PlayerClass): boolean {
  return cls === 'mage' || cls === 'priest' || cls === 'warlock';
}

function isFrontlineHostedClass(cls: PlayerClass): boolean {
  return cls === 'warrior' || cls === 'paladin' || cls === 'druid';
}

function partyRecoveryAnchor(
  party: PartyInfo,
  selfMember: PartyMemberInfo,
  leaderMember: PartyMemberInfo,
): PartyMemberInfo | null {
  const aliveMembers = party.members.filter((member) => member.pid !== selfMember.pid && !member.dead);
  const stableMembers = aliveMembers.filter((member) =>
    memberHealthRatio(member) > HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO);
  if (leaderMember.pid === selfMember.pid && memberHealthRatio(selfMember) <= HOSTED_PLAY_RECOVERY_HEALTH_RATIO) {
    const stableHealer = [...stableMembers]
      .filter((member) => canClassHeal(member.cls))
      .sort((a, b) =>
        distanceBetweenPartyMembers(selfMember, b) - distanceBetweenPartyMembers(selfMember, a))[0] ?? null;
    if (stableHealer) return stableHealer;
  }
  if (
    leaderMember.pid !== selfMember.pid
    && !leaderMember.dead
    && memberHealthRatio(leaderMember) > HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO
  ) {
    return leaderMember;
  }
  const candidates = stableMembers.length > 0 ? stableMembers : aliveMembers;
  return [...candidates].sort((a, b) =>
    distanceBetweenPartyMembers(selfMember, a) - distanceBetweenPartyMembers(selfMember, b))[0] ?? null;
}

function canClassHeal(cls: PartyMemberInfo['cls']): boolean {
  return cls === 'priest' || cls === 'paladin' || cls === 'shaman' || cls === 'druid';
}

function memberHealthRatio(member: PartyMemberInfo): number {
  return member.mhp > 0 ? member.hp / member.mhp : 1;
}

function memberResourceRatio(member: PartyMemberInfo): number {
  return member.mres > 0 ? member.res / member.mres : 1;
}

function idlePartyResult(): HostedPlayPartyTickResult {
  return {
    commands: [],
    pauseBrainDrive: false,
    groupMode: '',
    groupLeaderName: '',
    groupLeaderDistance: 0,
  };
}

function parsePartyInfo(value: unknown): PartyInfo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const party = value as PartyInfo;
  return Array.isArray(party.members) ? party : null;
}

function refreshPartyInfoFromLiveState(
  party: PartyInfo,
  liveSelf: Record<string, unknown>,
  entities: readonly Record<string, unknown>[],
): PartyInfo {
  const liveByPlayerId = new Map<number, Record<string, unknown>>();
  for (const entity of entities) {
    if (entity.k !== 'player') continue;
    const id = readFiniteNumber(entity.id);
    if (id === null) continue;
    liveByPlayerId.set(id, entity);
  }
  const selfId = readSelfId(liveSelf);
  return {
    ...party,
    members: party.members.map((member) => {
      const liveMember = member.pid === selfId ? liveSelf : liveByPlayerId.get(member.pid);
      return liveMember ? refreshPartyMemberFromLiveState(member, liveMember) : member;
    }),
  };
}

function refreshPartyMemberFromLiveState(
  member: PartyMemberInfo,
  liveMember: Record<string, unknown>,
): PartyMemberInfo {
  const liveX = readFiniteNumber(liveMember.x);
  const liveZ = readFiniteNumber(liveMember.z);
  const liveLevel = readFiniteNumber(liveMember.lv);
  const liveHp = readFiniteNumber(liveMember.hp);
  const liveMaxHp = readFiniteNumber(liveMember.mhp);
  const liveResource = readFiniteNumber(liveMember.res);
  const liveMaxResource = readFiniteNumber(liveMember.mres);
  const liveResourceType = readResourceType(liveMember.rtype);
  const liveDead = readPartyFlag(liveMember.dead);
  const liveInCombat = readPartyFlag(liveMember.cmb) ?? readPartyFlag(liveMember.inCombat);
  return {
    ...member,
    ...(liveLevel !== null ? { level: Math.max(1, Math.floor(liveLevel)) } : {}),
    ...(liveHp !== null ? { hp: liveHp } : {}),
    ...(liveMaxHp !== null ? { mhp: liveMaxHp } : {}),
    ...(liveResource !== null ? { res: liveResource } : {}),
    ...(liveMaxResource !== null ? { mres: liveMaxResource } : {}),
    ...(liveResourceType !== undefined ? { rtype: liveResourceType } : {}),
    ...(liveX !== null ? { x: liveX } : {}),
    ...(liveZ !== null ? { z: liveZ } : {}),
    ...(liveDead !== null ? { dead: liveDead } : {}),
    ...(liveInCombat !== null ? { inCombat: liveInCombat } : {}),
  };
}

function readFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readPartyFlag(value: unknown): 0 | 1 | null {
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;
  return null;
}

function readResourceType(value: unknown): ResourceType | null | undefined {
  if (value === null) return null;
  switch (value) {
    case 'rage':
    case 'mana':
    case 'energy':
      return value;
    default:
      return undefined;
  }
}

function readSelfId(value: Record<string, unknown>): number {
  return typeof value.id === 'number' ? value.id : -1;
}

function readSelfTargetId(value: Record<string, unknown>): number | null {
  return typeof value.target === 'number' ? value.target : null;
}

function readSelfAutoAttack(value: Record<string, unknown>): boolean {
  return value.auto === true || value.auto === 1;
}

function findHealingPotion(liveSelf: Record<string, unknown>): string | null {
  const inventory = Array.isArray(liveSelf.inv) ? liveSelf.inv : [];
  let bestItemId: string | null = null;
  let bestHealing = 0;
  for (const rawSlot of inventory) {
    if (!rawSlot || typeof rawSlot !== 'object' || Array.isArray(rawSlot)) continue;
    const slot = rawSlot as Record<string, unknown>;
    const itemId = typeof slot.itemId === 'string' ? slot.itemId : '';
    const count = typeof slot.count === 'number' && Number.isFinite(slot.count) ? slot.count : 0;
    if (!itemId || count <= 0) continue;
    const item = ITEMS[itemId];
    const healing = item && item.kind === 'potion' && 'potionHp' in item && typeof item.potionHp === 'number'
      ? item.potionHp
      : 0;
    if (healing > bestHealing) {
      bestHealing = healing;
      bestItemId = itemId;
    }
  }
  return bestItemId;
}

function partyInviteFromName(event: SimEvent): string | null {
  return event.type === 'partyInvite' && typeof event.fromName === 'string' ? event.fromName : null;
}

function canIssueAccept(input: HostedPlayPartyTickInput, state: HostedPlayPartyState): boolean {
  if (
    state.lastAcceptCommandAtMs !== null
    && input.nowMs - state.lastAcceptCommandAtMs < HOSTED_PLAY_ACCEPT_COOLDOWN_MS
  ) {
    return false;
  }
  state.lastAcceptCommandAtMs = input.nowMs;
  return true;
}

function canIssueAssist(input: HostedPlayPartyTickInput, state: HostedPlayPartyState): boolean {
  if (
    state.lastAssistCommandAtMs !== null
    && input.nowMs - state.lastAssistCommandAtMs < HOSTED_PLAY_ASSIST_COOLDOWN_MS
  ) {
    return false;
  }
  state.lastAssistCommandAtMs = input.nowMs;
  return true;
}

function maybeInviteNearbyPlayer(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
  party: PartyInfo | null,
): HostedPlayPartyTickResult | null {
  if (input.autoInviteNearbyPlayers !== true) return null;
  const fallbackPartySize = Math.max(2, hostedPlayTargetPartySize(input.objectiveSuggestedPartySize ?? 0));
  const targetPartySize = normalizeHostedPlayAutoInviteTargetPartySize(
    input.autoInviteNearbyTargetPartySize ?? fallbackPartySize,
  );
  const selfId = readSelfId(input.liveSelf);
  const selfName = readSelfName(input.liveSelf);
  if (selfId <= 0 || memberIsDead(input.liveSelf) || memberInCombatLive(input.liveSelf)) return null;
  const partySize = party?.members.length ?? 1;
  if (partySize >= targetPartySize || partySize >= 5) return null;
  if (party && party.leader !== selfId) return null;
  const nearbyInvite = collectNearbyInviteCandidate(input, state, party, selfId, selfName);
  if (!nearbyInvite || !canIssueNearbyInvite(input, state)) return null;
  state.lastNearbyInviteAtMsByName[nearbyInvite.name] = input.nowMs;
  return {
    commands: [{ cmd: 'pinvite', id: nearbyInvite.id }],
    pauseBrainDrive: false,
    groupMode: 'invite_nearby',
    groupLeaderName: party
      ? party.members.find((member) => member.pid === party.leader)?.name ?? selfName
      : selfName,
    groupLeaderDistance: 0,
  };
}

function collectNearbyInviteCandidate(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
  party: PartyInfo | null,
  selfId: number,
  selfName: string,
): { id: number; name: string } | null {
  const partyMemberNames = new Set(party?.members.map((member) => member.name) ?? []);
  const ambientBotNames = new Set(input.ambientDirectory.map((bot) => bot.characterName).filter(Boolean));
  let bestCandidate: { id: number; name: string; distance: number; ambient: boolean } | null = null;
  for (const entity of input.entities) {
    if (entity.k !== 'player' || typeof entity.id !== 'number' || typeof entity.nm !== 'string') continue;
    if (entity.id === selfId || (selfName && entity.nm === selfName) || partyMemberNames.has(entity.nm)) continue;
    if (entity.dead === 1 || entity.dead === true) continue;
    const distance = distanceToLiveEntity(input.liveSelf, entity);
    if (distance === null || distance > HOSTED_PLAY_NEARBY_INVITE_RANGE) continue;
    const lastInviteAtMs = state.lastNearbyInviteAtMsByName[entity.nm] ?? Number.NEGATIVE_INFINITY;
    if (input.nowMs - lastInviteAtMs < HOSTED_PLAY_NEARBY_INVITE_TARGET_COOLDOWN_MS) continue;
    const ambient = ambientBotNames.has(entity.nm);
    const betterCandidate = !bestCandidate
      || (bestCandidate.ambient && !ambient)
      || (bestCandidate.ambient === ambient && distance < bestCandidate.distance);
    if (betterCandidate) {
      bestCandidate = { id: entity.id, name: entity.nm, distance, ambient };
    }
  }
  return bestCandidate ? { id: bestCandidate.id, name: bestCandidate.name } : null;
}

function canIssueNearbyInvite(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
): boolean {
  if (
    state.lastNearbyInviteCommandAtMs !== null
    && input.nowMs - state.lastNearbyInviteCommandAtMs < HOSTED_PLAY_NEARBY_INVITE_COOLDOWN_MS
  ) {
    return false;
  }
  state.lastNearbyInviteCommandAtMs = input.nowMs;
  return true;
}

function hostedPlayTargetPartySize(objectiveSuggestedPartySize: number): number {
  if (!Number.isFinite(objectiveSuggestedPartySize)) return 1;
  return Math.max(1, Math.min(5, Math.floor(objectiveSuggestedPartySize)));
}

function hostedPlayPartyBotRecord(
  playerClass: PlayerClass,
  selfMember: NonNullable<PartyInfo['members'][number]>,
): AmbientPlayerBotRecord {
  return {
    botId: `hosted-party:${selfMember.pid}`,
    accountId: null,
    accountUsername: '',
    accountPassword: '',
    characterId: selfMember.pid,
    characterName: selfMember.name,
    profileId: `hosted_${playerClass}`,
    class: playerClass,
    authToken: '',
    authTokenExpiresAtMs: null,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 60 },
    preferredZoneIds: [],
    lastKnownZoneId: '',
    lastKnownLevel: selfMember.level,
    lastKnownX: selfMember.x,
    lastKnownZ: selfMember.z,
    assignedClusterId: null,
    assignedPlayerCharacterId: selfMember.pid,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs: null,
    plannerState: {},
    runnerState: {},
    socialState: {},
  };
}

function hostedPartyLiveState(
  liveSelf: Record<string, unknown>,
  entities: Iterable<Record<string, unknown>>,
): AmbientPlayerBotLiveState {
  const entityMap = new Map<number, Record<string, unknown>>();
  for (const entity of entities) {
    if (typeof entity.id !== 'number' || !Number.isFinite(entity.id)) continue;
    entityMap.set(entity.id, entity);
  }
  return {
    pid: readSelfId(liveSelf),
    seed: 0,
    self: liveSelf,
    entities: entityMap,
  };
}

function canHostedProvidePartyPreparation(playerClass: PlayerClass): boolean {
  return playerClass === 'priest'
    || playerClass === 'paladin'
    || playerClass === 'druid'
    || playerClass === 'shaman';
}

function normalizeHostedGroupMode(
  groupMode: string,
  partyInCombat: boolean,
): HostedPlayGroupMode {
  switch (groupMode) {
    case 'buff_party':
    case 'prepare_party':
      return 'prepare_party';
    case 'heal_party':
    case 'shield_party':
    case 'tank_party':
      return partyInCombat ? 'assist_party' : 'prepare_party';
    default:
      return 'assist_party';
  }
}

function ambientPartyMemberPreparing(
  party: PartyInfo,
  ambientDirectory: readonly AmbientPlayerBotRecord[],
  leaderPid: number,
): boolean {
  const partyMembers = new Set(party.members.map((member) => member.name));
  return ambientDirectory.some((record) => {
    if (!partyMembers.has(record.characterName)) return false;
    if (record.characterId === leaderPid) return false;
    return isPreparationGroupMode(readRunnerString(record.runnerState, 'groupMode'));
  });
}

function isPreparationGroupMode(groupMode: string): boolean {
  return groupMode === 'buff_party'
    || groupMode === 'prepare_party'
    || groupMode === 'heal_party';
}

function readRunnerString(
  value: Record<string, unknown>,
  key: string,
): string {
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

function reserveCommandBatch(
  state: HostedPlayPartyState,
  nowMs: number,
  reservations: readonly AmbientGroupCommandReservation[],
): boolean {
  for (const reservation of reservations) {
    if (!commandReady(state, reservation.key, nowMs, reservation.cooldownMs)) return false;
  }
  for (const reservation of reservations) {
    state.lastCommandAtMs[reservation.key] = nowMs;
  }
  return true;
}

function commandReady(
  state: HostedPlayPartyState,
  key: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const lastAtMs = state.lastCommandAtMs[key] ?? Number.NEGATIVE_INFINITY;
  return nowMs - lastAtMs >= cooldownMs;
}

function readSelfName(value: Record<string, unknown>): string {
  return typeof value.nm === 'string' ? value.nm : '';
}

function memberIsDead(value: Record<string, unknown>): boolean {
  return value.dead === 1 || value.dead === true;
}

function memberInCombatLive(value: Record<string, unknown>): boolean {
  return value.cmb === 1 || value.inCombat === 1 || value.inCombat === true;
}

function distanceToLiveEntity(
  self: Record<string, unknown>,
  entity: Record<string, unknown>,
): number | null {
  const selfX = typeof self.x === 'number' ? self.x : null;
  const selfZ = typeof self.z === 'number' ? self.z : null;
  const entityX = typeof entity.x === 'number' ? entity.x : null;
  const entityZ = typeof entity.z === 'number' ? entity.z : null;
  if (selfX === null || selfZ === null || entityX === null || entityZ === null) return null;
  const dx = selfX - entityX;
  const dz = selfZ - entityZ;
  return Math.sqrt(dx * dx + dz * dz);
}

function hasPartyThreat(
  entities: Iterable<Record<string, unknown>>,
  party: PartyInfo,
): boolean {
  const partyIds = new Set(party.members.map((member) => member.pid));
  for (const entity of entities) {
    if (entity.k !== 'mob' || entity.dead === 1 || entity.dead === true) continue;
    if (entity.aggro === null || entity.aggro === undefined) continue;
    if (typeof entity.aggro === 'number' && partyIds.has(entity.aggro)) return true;
  }
  return false;
}
