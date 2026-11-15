import {
  type HostedPlayAutoInviteTargetPartySize,
  normalizeHostedPlayAutoInviteTargetPartySize,
} from '../../src/hosted_play_settings';
import { DUNGEONS, ITEMS, zoneAt } from '../../src/sim/data';
import type { PlayerClass, ResourceType, SimEvent } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import {
  type AmbientGroupCommandReservation,
  type AmbientPartySupportDecision,
  maybeCoordinateAmbientPartySupport,
} from '../ambient_bots/group_support';
import type { AmbientPartyCoordinationIntent } from '../ambient_bots/party_intent';
import { maybePrepareForPullFromLiveState } from '../ambient_bots/pre_combat';
import type { AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import {
  distanceBetweenPartyMembers,
  findPartyCombatTarget,
  type PartyTravelGoal,
  partyAssistArrivalRange,
  travelGoalToPartyMember,
  travelGoalToPartyTarget,
} from '../party_coordination';
import type { HostedPlayGroupMode, HostedPlayPartyMode } from './types';

const HOSTED_PLAY_ACCEPT_COOLDOWN_MS = 1_500;
const HOSTED_PLAY_ASSIST_COOLDOWN_MS = 1_200;
const HOSTED_PLAY_NEARBY_INVITE_COOLDOWN_MS = 12_000;
const HOSTED_PLAY_NEARBY_INVITE_TARGET_COOLDOWN_MS = 90_000;
const HOSTED_PLAY_NEARBY_INVITE_RANGE = 32;
const HOSTED_PLAY_DUNGEON_ENTER_COOLDOWN_MS = 4_000;
const HOSTED_PLAY_DUNGEON_DOOR_RANGE = 7.5;
const HOSTED_PLAY_DUNGEON_ENTRY_APPROACH_RANGE = 90;
const HOSTED_PLAY_DUNGEON_ENTRY_WAIT_RANGE = 1.75;
const HOSTED_PLAY_DUNGEON_PHASE_SPLIT_DISTANCE = 400;
const HOSTED_PLAY_FOLLOW_START_RANGE = 4;
const HOSTED_PLAY_FOLLOW_MAX_RANGE = 60;
const HOSTED_PLAY_TRAIN_LINK_REGROUP_RANGE = 10;
const HOSTED_PLAY_TRAIN_LEADER_REGROUP_LINK_RANGE = 16;
const HOSTED_PLAY_TRAIN_MAX_LEADER_RANGE = 24;
const HOSTED_PLAY_RECOVERY_ANCHOR_RANGE = 4;
const HOSTED_PLAY_URGENT_RECOVERY_ANCHOR_RANGE = 1.5;
const HOSTED_PLAY_URGENT_RECOVERY_THREAT_RANGE = 10;
const HOSTED_PLAY_URGENT_RECOVERY_RETREAT_DISTANCE = 8;
const HOSTED_PLAY_FRONTLINE_URGENT_RECOVERY_RETREAT_DISTANCE = 12;
const HOSTED_PLAY_RECOVERY_HEALTH_RATIO = 0.72;
const HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO = 0.9;
const HOSTED_PLAY_RECOVERY_PROTECTOR_ENGAGE_HEALTH_RATIO = 0.65;
const HOSTED_PLAY_RECOVERY_RESOURCE_RATIO = 0.25;
const HOSTED_PLAY_RECOVERY_STABLE_RESOURCE_RATIO = 0.25;
const HOSTED_PLAY_RECOVERY_POTION_RATIO = 0.65;
const HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_HEALTH_RATIO = 0.9;
const HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_POTION_RATIO = 0.72;
const HOSTED_PLAY_FRAGILE_THREAT_MAX_LEVEL = 4;
const HOSTED_PLAY_FRONTLINE_THREAT_RECOVERY_HEALTH_RATIO = 0.82;
const HOSTED_PLAY_HIGH_THREAT_RETREAT_MOBS = 3;
const HOSTED_PLAY_DENSE_RECOVERY_HOSTILES = 28;
const HOSTED_PLAY_DENSE_RECOVERY_RADIUS = 38;
const HOSTED_PLAY_DENSE_RECOVERY_RETREAT_DISTANCE = 18;
const HOSTED_PLAY_THORNPEAK_HIGH_THREAT_SAFE_RETREAT_HOSTILES = 20;
const HOSTED_PLAY_SAFE_RETREAT_ARRIVAL_RANGE = 2.5;
const HOSTED_PLAY_SAFE_RETREAT_SUPPORT_RANGE = 15;
const HOSTED_PLAY_HIGHWATCH_SAFE_LEASH_CORRIDOR_RANGE = 15;
const HOSTED_PLAY_SAFE_RETREAT_EMERGENCY_HEALTH_RATIO = 0.72;
const HOSTED_PLAY_SAFE_RETREAT_EMERGENCY_SUPPORT_RANGE = 35;
const HOSTED_PLAY_FENBRIDGE_SAFE_REGROUP_RELEASE_RANGE = 10;
const HOSTED_PLAY_FENBRIDGE_LEADER_REGROUP_RADIUS = 45;
const HOSTED_PLAY_MIREFEN_SAFE_RECOVERY_HOSTILES = 12;
const HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS = 1_500;
const HOSTED_PLAY_RECOVERY_POTION_COOLDOWN_MS = 60_000;
const HOSTED_PLAY_FENBRIDGE_SAFE_RETREAT_POINT = { x: -18, z: 286 };
const HOSTED_PLAY_HIGHWATCH_SAFE_RETREAT_POINT = { x: -22, z: 664 };
const HOSTED_PLAY_HIGHWATCH_SAFE_THREAT_LEASH_POINT = { x: -5, z: 650 };

type HostedPlayCommand = Record<string, unknown>;

export interface HostedPlayPartyState {
  lastAcceptCommandAtMs: number | null;
  lastAssistCommandAtMs: number | null;
  lastNearbyInviteCommandAtMs: number | null;
  lastNearbyInviteAtMsByName: Record<string, number>;
  lastCommandAtMs: Record<string, number>;
  highwatchSafeThreatLeashActive: boolean;
}

export interface HostedPlayPartyTickInput {
  liveSelf: Record<string, unknown>;
  entities: Iterable<Record<string, unknown>>;
  recentEvents: readonly SimEvent[];
  playerClass: PlayerClass;
  partyMode: HostedPlayPartyMode;
  autoInviteNearbyPlayers?: boolean;
  autoInviteNearbyTargetPartySize?: HostedPlayAutoInviteTargetPartySize;
  objectiveDungeonId?: string;
  objectiveSuggestedPartySize?: number;
  partyIntent?: AmbientPartyCoordinationIntent | null;
  ambientDirectory: readonly AmbientPlayerBotRecord[];
  nowMs: number;
}

export interface HostedPlayPartyTickResult {
  commands: readonly HostedPlayCommand[];
  pauseBrainDrive: boolean;
  travelGoal?: PartyTravelGoal;
  facing?: number;
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
    highwatchSafeThreatLeashActive: false,
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
  const inviteFromName =
    !party && input.partyMode === 'follow_leader'
      ? input.recentEvents.map(partyInviteFromName).find((name): name is string => !!name)
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

  const partyFormationHold = maybeHoldForTargetParty(liveInput, party);
  if (partyFormationHold) return partyFormationHold;

  if (!party || input.partyMode !== 'follow_leader' || party.members.length < 2) {
    return idlePartyResult();
  }

  const selfMember =
    party.members.find((member) => member.pid === readSelfId(input.liveSelf)) ?? null;
  const leaderMember = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!selfMember || !leaderMember) return idlePartyResult();

  const leaderDistance = distanceBetweenPartyMembers(selfMember, leaderMember);
  const groupLeaderName = leaderMember.name;
  const followAnchor = hostedPartyTrainAnchor(party, selfMember, leaderMember);
  const followAnchorDistance = followAnchor
    ? distanceBetweenPartyMembers(selfMember, followAnchor)
    : leaderDistance;
  const dungeonEntry = maybeCoordinateHostedDungeonEntry({
    input,
    party,
    selfMember,
    leaderMember,
    groupLeaderName,
    leaderDistance,
    state,
  });
  if (dungeonEntry) return dungeonEntry;
  const partyThreatCount = countPartyThreatMobs(entities, party);
  const nearbyHostileCount = countNearbyHostileMobs(entities);
  const partyHighThreatRecovery = partyThreatCount >= HOSTED_PLAY_HIGH_THREAT_RETREAT_MOBS;
  const forceMirefenHighThreatRetreat =
    partyHighThreatRecovery && zoneAt(selfMember.x, selfMember.z).id === 'mirefen_marsh';
  const partyMemberInCombat = party.members.some((member) => member.inCombat === 1);
  const partyInCombat = partyMemberInCombat || partyThreatCount > 0;
  const partyIntentRecovering =
    input.partyIntent?.kind === 'recovery' || input.partyIntent?.behavior === 'recover';
  const partyNeedsImmediateRecovery = partyNeedsRecovery(party);
  const partyRecovering =
    partyNeedsImmediateRecovery ||
    partyHighThreatRecovery ||
    (!partyInCombat && partyIntentRecovering && partyNeedsRecovery(party, true));
  const partyRecoveryHasHealthRisk = partyNeedsHealthRecovery(party, partyIntentRecovering);
  const partyRecoveryHasCriticalHealthRisk = partyNeedsHealthRecovery(party, false);
  const partyRecoveringOnlyResources = partyRecovering && !partyRecoveryHasHealthRisk;
  const forceSafeRecoveryRetreat = hostedPartyNeedsSafeRecoveryRetreat({
    partyRecovering,
    partyHighThreatRecovery,
    partyRecoveryHasCriticalHealthRisk,
    leaderMember,
    nearbyHostileCount,
  });
  const botRecord = hostedPlayPartyBotRecord(input.playerClass, selfMember);
  const liveState = hostedPartyLiveState(input.liveSelf, entities);
  const followerCanMoveToParty =
    !!followAnchor && !selfMember.dead && !followAnchor.dead && !selfMember.inCombat;
  const followerNeedsToCloseGap =
    followerCanMoveToParty && followAnchorDistance > HOSTED_PLAY_FOLLOW_START_RANGE;
  const followerOutsidePartyActionRange =
    followerNeedsToCloseGap &&
    (leaderDistance > HOSTED_PLAY_FOLLOW_MAX_RANGE ||
      followAnchorDistance > HOSTED_PLAY_FOLLOW_MAX_RANGE);

  const selfNeedsEarlyThreatRecovery = selfNeedsFragileThreatRecovery(selfMember, entities);
  const selfNeedsIntentRecovery = selfNeedsFragileIntentRecovery(selfMember, partyIntentRecovering);
  const selfNeedsFrontlineRecovery = selfNeedsFrontlineThreatRecovery(selfMember, entities);
  const selfNeedsHighThreatRetreat = partyHighThreatRecovery && !selfMember.dead;
  const selfNeedsPartyRecoveryPause =
    partyRecovering &&
    hostedSelfNeedsPartyRecoveryPause(input.playerClass, input.liveSelf, selfMember);
  const selfNeedsUrgentRecovery =
    !selfMember.dead &&
    (selfNeedsPartyRecoveryPause ||
      selfNeedsEarlyThreatRecovery ||
      selfNeedsIntentRecovery ||
      selfNeedsFrontlineRecovery ||
      selfNeedsHighThreatRetreat);
  const selfCanHoldRecoveryCombat =
    partyRecovering &&
    partyInCombat &&
    canHostedRecoveryProtectorStayEngaged(input.playerClass, input.liveSelf, selfMember);
  const suppressRecoveryOffense =
    partyRecovering && partyInCombat && hostedPartyRecoveryOffenseUnsafe(party);
  const highwatchSafeThreatLeashCombat =
    partyInCombat &&
    suppressRecoveryOffense &&
    zoneAt(selfMember.x, selfMember.z).id === 'thornpeak_heights';
  if (
    !highwatchSafeThreatLeashCombat ||
    !hostedMemberInsideHighwatchSafeThreatLeashCorridor(selfMember)
  ) {
    state.highwatchSafeThreatLeashActive = false;
  } else if (hostedMemberReachedSafeRetreat(selfMember)) {
    state.highwatchSafeThreatLeashActive = true;
  }
  const forceSafeThreatLeash =
    highwatchSafeThreatLeashCombat &&
    state.highwatchSafeThreatLeashActive &&
    hostedMemberInsideHighwatchSafeThreatLeashCorridor(selfMember);
  const selfShouldHandleResourceRecovery = hostedSelfShouldHandleResourceRecovery({
    partyRecoveringOnlyResources,
    partyInCombat,
    forceSafeRecoveryRetreat,
    liveSelf: input.liveSelf,
    selfMember,
    selfIsLeader: selfMember.pid === leaderMember.pid,
    leaderDistance,
  });
  const selfCanSupportFromSafeRetreat =
    !forceMirefenHighThreatRetreat &&
    (!forceSafeRecoveryRetreat || hostedMemberReachedSafeRetreat(selfMember));
  const selfCanEmergencySupportDuringSafeRetreat =
    hostedSelfCanEmergencySupportDuringSafeRetreat({
      party,
      selfMember,
      liveSelf: input.liveSelf,
      playerClass: input.playerClass,
      entities,
      forceSafeRecoveryRetreat: forceSafeRecoveryRetreat || forceMirefenHighThreatRetreat,
    }) &&
    (!forceMirefenHighThreatRetreat || canClassHeal(input.playerClass));
  const selfCanSelfHealDuringSafeRetreat = hostedSelfCanSelfHealDuringSafeRetreat({
    selfMember,
    playerClass: input.playerClass,
    forceSafeRecoveryRetreat: forceSafeRecoveryRetreat || forceMirefenHighThreatRetreat,
  });
  const selfCanSupportDuringSafeRetreat =
    selfCanSupportFromSafeRetreat ||
    selfCanEmergencySupportDuringSafeRetreat ||
    selfCanSelfHealDuringSafeRetreat;
  const selfShouldPrioritizeEmergencySafeRetreatSupport =
    selfCanEmergencySupportDuringSafeRetreat &&
    memberHealthRatio(selfMember) > HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO;
  const selfShouldPrioritizeSafeRetreatHealing =
    selfCanSelfHealDuringSafeRetreat || selfShouldPrioritizeEmergencySafeRetreatSupport;
  if (
    (selfNeedsUrgentRecovery || forceSafeThreatLeash) &&
    !selfShouldPrioritizeSafeRetreatHealing
  ) {
    const recoveryPause = maybePauseForPartyRecovery({
      liveSelf: input.liveSelf,
      party,
      selfMember,
      leaderMember,
      leaderDistance,
      state,
      nowMs: input.nowMs,
      entities,
      forceSelfRecovery:
        selfNeedsEarlyThreatRecovery ||
        selfNeedsIntentRecovery ||
        selfNeedsFrontlineRecovery ||
        selfNeedsHighThreatRetreat,
      forcePartyRecovery: partyRecovering,
      forceSafeRetreat: forceMirefenHighThreatRetreat || forceSafeRecoveryRetreat,
      forceSafeThreatLeash,
      allowProtectiveCombat: false,
    });
    if (recoveryPause) return recoveryPause;
  }

  const regroupReturn =
    !partyRecovering || partyRecoveringOnlyResources
      ? maybeReturnForRegroupIntent({
          intent: input.partyIntent ?? null,
          liveSelf: input.liveSelf,
          selfMember,
          leaderMember,
          followAnchor,
          followAnchorDistance,
          leaderDistance,
          state,
          nowMs: input.nowMs,
          entities,
        })
      : null;
  if (regroupReturn) return regroupReturn;

  const formationReturn =
    !partyRecovering || partyRecoveringOnlyResources
      ? maybeReturnForFormationBreak({
          liveSelf: input.liveSelf,
          selfMember,
          leaderMember,
          followAnchor,
          followAnchorDistance,
          leaderDistance,
          partyInCombat,
          state,
          nowMs: input.nowMs,
        })
      : null;
  if (formationReturn) return formationReturn;

  const assistTarget = findPartyCombatTarget({
    liveSelf: input.liveSelf,
    entities,
    party,
    maxDistance: HOSTED_PLAY_FOLLOW_MAX_RANGE,
  });
  const assistArrivalRange = partyAssistArrivalRange(input.playerClass);
  const assistTravelGoal =
    assistTarget && assistTarget.distance > assistArrivalRange
      ? travelGoalToPartyTarget(assistTarget, assistArrivalRange)
      : null;
  const earlyUnresolvedCombatReturn =
    !assistTarget && partyInCombat && (!partyRecovering || partyRecoveringOnlyResources)
      ? maybeReturnForUnresolvedPartyCombat({
          liveSelf: input.liveSelf,
          party,
          selfMember,
          leaderMember,
          leaderDistance,
          state,
          nowMs: input.nowMs,
          entities,
          playerClass: input.playerClass,
        })
      : null;
  if (earlyUnresolvedCombatReturn) return earlyUnresolvedCombatReturn;

  const normalSupportDecision =
    !followerOutsidePartyActionRange &&
    selfCanSupportDuringSafeRetreat &&
    !selfShouldHandleResourceRecovery &&
    (!forceMirefenHighThreatRetreat || selfCanEmergencySupportDuringSafeRetreat) &&
    (partyInCombat ||
      (canHostedProvidePartyPreparation(input.playerClass) && !followerNeedsToCloseGap))
      ? maybeCoordinateAmbientPartySupport({
          bot: botRecord,
          liveState,
          party,
          leaderMember,
          selfMember,
          suppressFocusFire: partyRecovering && partyRecoveryHasHealthRisk,
          suppressRecoveryOffense,
          reserveCommandBatch: (reservations) =>
            reserveCommandBatch(state, input.nowMs, reservations),
        })
      : null;
  const prePullSupportDecision =
    !normalSupportDecision &&
    !followerOutsidePartyActionRange &&
    !partyInCombat &&
    !partyRecovering &&
    !followerNeedsToCloseGap
      ? maybeCoordinateAmbientPartySupport({
          bot: botRecord,
          liveState,
          party,
          leaderMember,
          selfMember,
          prePullOnly: true,
          reserveCommandBatch: (reservations) =>
            reserveCommandBatch(state, input.nowMs, reservations),
        })
      : null;
  const supportDecision = normalSupportDecision ?? prePullSupportDecision;
  if (supportDecision) {
    if (
      hostedSupportDecisionShouldYieldToBrain(
        supportDecision,
        partyMemberInCombat,
        partyThreatCount,
      )
    ) {
      return {
        commands: [],
        pauseBrainDrive: false,
        groupMode: 'brain',
        groupLeaderName,
        groupLeaderDistance: leaderDistance,
      };
    }
    return {
      commands: supportDecision.commands,
      pauseBrainDrive: true,
      ...(supportDecision.travelGoal ? { travelGoal: supportDecision.travelGoal } : {}),
      ...(supportDecision.facing !== undefined ? { facing: supportDecision.facing } : {}),
      groupMode: normalizeHostedGroupMode(supportDecision.groupMode, partyInCombat),
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }

  if (selfShouldHandleResourceRecovery) {
    return {
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
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
    forceSafeRetreat: forceMirefenHighThreatRetreat || forceSafeRecoveryRetreat,
    forceSafeThreatLeash,
    allowProtectiveCombat: selfCanHoldRecoveryCombat,
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
    selfMember.pid === leaderMember.pid &&
    !selfMember.dead &&
    !selfMember.inCombat &&
    !partyInCombat &&
    ambientPartyMemberPreparing(party, input.ambientDirectory, selfMember.pid)
  ) {
    return {
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'prepare_party',
      groupLeaderName,
      groupLeaderDistance: 0,
    };
  }

  if (
    assistTarget &&
    !selfMember.dead &&
    !selfMember.inCombat &&
    readSelfTargetId(input.liveSelf) !== assistTarget.id &&
    canIssueAssist(input, state)
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

  const unresolvedCombatReturn =
    !assistTarget && partyInCombat
      ? maybeReturnForUnresolvedPartyCombat({
          liveSelf: input.liveSelf,
          party,
          selfMember,
          leaderMember,
          leaderDistance,
          state,
          nowMs: input.nowMs,
          entities,
          playerClass: input.playerClass,
        })
      : null;
  if (unresolvedCombatReturn) return unresolvedCombatReturn;

  const combatFollowTravelGoal =
    selfMember.pid !== leaderMember.pid &&
    !selfMember.dead &&
    !leaderMember.dead &&
    !selfMember.inCombat &&
    leaderMember.inCombat &&
    leaderDistance > HOSTED_PLAY_FOLLOW_START_RANGE &&
    leaderDistance <= HOSTED_PLAY_FOLLOW_MAX_RANGE
      ? travelGoalToPartyMember(
          leaderMember,
          HOSTED_PLAY_FOLLOW_START_RANGE,
          'hosted-combat-leader',
        )
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

  if (followerCanMoveToParty) {
    const followTravelGoal =
      followAnchorDistance > HOSTED_PLAY_FOLLOW_START_RANGE
        ? travelGoalToPartyMember(
            followAnchor,
            HOSTED_PLAY_FOLLOW_START_RANGE,
            followAnchor.pid === leaderMember.pid ? 'hosted-follow-leader' : 'hosted-follow-train',
          )
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
    selfMember.pid === leaderMember.pid &&
    !selfMember.dead &&
    !selfMember.inCombat &&
    partyNeedsRegroup(party, selfMember) &&
    !fenbridgeSafeRegroupCanRelease(party, selfMember)
  ) {
    const leaderRegroupGoal = hostedLeaderRegroupGoal(party, selfMember);
    return {
      commands: [],
      pauseBrainDrive: true,
      ...(leaderRegroupGoal ? { travelGoal: leaderRegroupGoal } : {}),
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

function hostedSupportDecisionShouldYieldToBrain(
  decision: AmbientPartySupportDecision,
  partyMemberInCombat: boolean,
  partyThreatCount: number,
): boolean {
  return (
    partyThreatCount > 0 &&
    !partyMemberInCombat &&
    decision.commands.length === 0 &&
    !decision.travelGoal &&
    decision.facing === undefined
  );
}

function maybeReturnForUnresolvedPartyCombat(input: {
  liveSelf: Record<string, unknown>;
  party: PartyInfo;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  leaderDistance: number;
  state: HostedPlayPartyState;
  nowMs: number;
  entities: readonly Record<string, unknown>[];
  playerClass: PlayerClass;
}): HostedPlayPartyTickResult | null {
  if (input.selfMember.dead) return null;
  if (input.selfMember.inCombat === 1 || memberInCombatLive(input.liveSelf)) return null;
  const anchor = partyCombatAnchor(
    input.party,
    input.selfMember,
    input.leaderMember,
    input.entities,
  );
  if (!anchor || anchor.pid === input.selfMember.pid || anchor.dead) return null;

  const commands: HostedPlayCommand[] = [];
  if (
    readSelfAutoAttack(input.liveSelf) &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    readSelfTargetId(input.liveSelf) !== null &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  const arrivalRange = Math.max(
    HOSTED_PLAY_FOLLOW_START_RANGE,
    partyAssistArrivalRange(input.playerClass),
  );
  const anchorDistance = distanceBetweenPartyMembers(input.selfMember, anchor);
  const travelGoal =
    anchorDistance > arrivalRange
      ? travelGoalToPartyMember(anchor, arrivalRange, 'hosted-party-combat')
      : undefined;
  if (commands.length === 0 && !travelGoal) return null;
  return {
    commands,
    pauseBrainDrive: true,
    ...(travelGoal ? { travelGoal } : {}),
    groupMode: 'assist_party',
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function partyCombatAnchor(
  party: PartyInfo,
  selfMember: PartyMemberInfo,
  leaderMember: PartyMemberInfo,
  entities: readonly Record<string, unknown>[],
): PartyMemberInfo | null {
  const threatenedIds = partyThreatTargetIds(entities, party);
  const candidates = party.members.filter(
    (member) =>
      member.pid !== selfMember.pid &&
      !member.dead &&
      (member.inCombat === 1 || threatenedIds.has(member.pid)),
  );
  const leaderCandidate = candidates.find((member) => member.pid === leaderMember.pid) ?? null;
  if (leaderCandidate) return leaderCandidate;
  return (
    [...candidates].sort((a, b) => {
      const healthDelta = memberHealthRatio(a) - memberHealthRatio(b);
      if (Math.abs(healthDelta) > 0.001) return healthDelta;
      return (
        distanceBetweenPartyMembers(selfMember, a) - distanceBetweenPartyMembers(selfMember, b)
      );
    })[0] ?? null
  );
}

function partyThreatTargetIds(
  entities: Iterable<Record<string, unknown>>,
  party: PartyInfo,
): Set<number> {
  const partyIds = new Set(party.members.map((member) => member.pid));
  const threatenedIds = new Set<number>();
  for (const entity of entities) {
    if (!isAttackableHostedMob(entity)) continue;
    if (typeof entity.aggro === 'number' && partyIds.has(entity.aggro)) {
      threatenedIds.add(entity.aggro);
    }
  }
  return threatenedIds;
}

function countPartyThreatMobs(
  entities: Iterable<Record<string, unknown>>,
  party: PartyInfo,
): number {
  const partyIds = new Set(party.members.map((member) => member.pid));
  let count = 0;
  for (const entity of entities) {
    if (!isAttackableHostedMob(entity)) continue;
    if (typeof entity.aggro === 'number' && partyIds.has(entity.aggro)) count++;
  }
  return count;
}

function countNearbyHostileMobs(entities: Iterable<Record<string, unknown>>): number {
  let count = 0;
  for (const entity of entities) {
    if (!isAttackableHostedMob(entity)) continue;
    if (hostedHostileSignal(entity.h) || typeof entity.aggro === 'number') count++;
  }
  return count;
}

function maybeReturnForRegroupIntent(input: {
  intent: AmbientPartyCoordinationIntent | null;
  liveSelf: Record<string, unknown>;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  followAnchor: PartyMemberInfo | null;
  followAnchorDistance: number;
  leaderDistance: number;
  state: HostedPlayPartyState;
  nowMs: number;
  entities: Iterable<Record<string, unknown>>;
}): HostedPlayPartyTickResult | null {
  if (input.intent?.behavior !== 'regroup') return null;
  if (input.selfMember.pid === input.leaderMember.pid) return null;
  if (input.selfMember.dead || !input.followAnchor || input.followAnchor.dead) return null;
  if (!hostedFollowerNeedsTrainRegroup(input.followAnchorDistance, input.leaderDistance))
    return null;

  const commands: HostedPlayCommand[] = [];
  if (
    readSelfAutoAttack(input.liveSelf) &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    readSelfTargetId(input.liveSelf) !== null &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  return {
    commands,
    pauseBrainDrive: true,
    travelGoal: travelGoalToPartyMember(
      input.followAnchor,
      HOSTED_PLAY_FOLLOW_START_RANGE,
      input.followAnchor.pid === input.leaderMember.pid
        ? 'hosted-regroup-leader'
        : 'hosted-regroup-train',
    ),
    groupMode: 'follow_leader',
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function maybeReturnForFormationBreak(input: {
  liveSelf: Record<string, unknown>;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  followAnchor: PartyMemberInfo | null;
  followAnchorDistance: number;
  leaderDistance: number;
  partyInCombat: boolean;
  state: HostedPlayPartyState;
  nowMs: number;
}): HostedPlayPartyTickResult | null {
  if (input.selfMember.pid === input.leaderMember.pid) return null;
  if (input.selfMember.dead || !input.followAnchor || input.followAnchor.dead) return null;
  if (!hostedFollowerNeedsTrainRegroup(input.followAnchorDistance, input.leaderDistance))
    return null;
  if (!input.partyInCombat && !input.selfMember.inCombat) return null;

  const commands: HostedPlayCommand[] = [];
  if (
    readSelfAutoAttack(input.liveSelf) &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    readSelfTargetId(input.liveSelf) !== null &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  return {
    commands,
    pauseBrainDrive: true,
    travelGoal: travelGoalToPartyMember(
      input.followAnchor,
      HOSTED_PLAY_FOLLOW_START_RANGE,
      input.followAnchor.pid === input.leaderMember.pid
        ? 'hosted-regroup-leader'
        : 'hosted-regroup-train',
    ),
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
  forceSafeRetreat: boolean;
  forceSafeThreatLeash: boolean;
  allowProtectiveCombat: boolean;
}): HostedPlayPartyTickResult | null {
  if ((!input.forcePartyRecovery && !input.forceSelfRecovery) || input.selfMember.dead) return null;

  const selfHealthRatio = memberHealthRatio(input.selfMember);
  const commands: HostedPlayCommand[] = [];
  const potionThreshold = input.forceSelfRecovery
    ? HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_POTION_RATIO
    : HOSTED_PLAY_RECOVERY_POTION_RATIO;
  const potion = selfHealthRatio <= potionThreshold ? findHealingPotion(input.liveSelf) : null;
  if (
    potion &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: `use:${potion}`, cooldownMs: HOSTED_PLAY_RECOVERY_POTION_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'use', item: potion });
  }
  const holdingProtectiveCombat =
    input.allowProtectiveCombat &&
    !input.forceSelfRecovery &&
    !input.forceSafeRetreat &&
    selfHealthRatio > HOSTED_PLAY_RECOVERY_PROTECTOR_ENGAGE_HEALTH_RATIO &&
    (input.selfMember.inCombat === 1 ||
      readSelfAutoAttack(input.liveSelf) ||
      readSelfTargetId(input.liveSelf) !== null);
  const selfNeedsEscape =
    input.selfMember.pid !== input.leaderMember.pid ||
    (input.forcePartyRecovery && !holdingProtectiveCombat) ||
    selfHealthRatio <= HOSTED_PLAY_RECOVERY_HEALTH_RATIO ||
    input.forceSelfRecovery;
  if (
    selfNeedsEscape &&
    readSelfAutoAttack(input.liveSelf) &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'stopattack', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'stopattack' });
  }
  if (
    selfNeedsEscape &&
    readSelfTargetId(input.liveSelf) !== null &&
    reserveCommandBatch(input.state, input.nowMs, [
      { key: 'clear_target', cooldownMs: HOSTED_PLAY_RECOVERY_COMMAND_COOLDOWN_MS },
    ])
  ) {
    commands.push({ cmd: 'target', id: null });
  }

  const anchor = partyRecoveryAnchor(input.party, input.selfMember, input.leaderMember);
  const anchorDistance = anchor ? distanceBetweenPartyMembers(input.selfMember, anchor) : 0;
  const urgentSelfRecovery =
    input.forceSelfRecovery || selfHealthRatio <= HOSTED_PLAY_RECOVERY_HEALTH_RATIO;
  const recoveryAnchorRange = urgentSelfRecovery
    ? HOSTED_PLAY_URGENT_RECOVERY_ANCHOR_RANGE
    : HOSTED_PLAY_RECOVERY_ANCHOR_RANGE;
  const includePartyThreats =
    input.forcePartyRecovery ||
    (input.forceSelfRecovery &&
      input.selfMember.level <= HOSTED_PLAY_FRAGILE_THREAT_MAX_LEVEL &&
      isFragileHostedClass(input.selfMember.cls));
  const threatRetreatGoal =
    !holdingProtectiveCombat && anchor && urgentSelfRecovery
      ? recoveryThreatRetreatGoal(
          input.liveSelf,
          input.entities,
          input.party,
          input.selfMember,
          anchor,
          recoveryAnchorRange,
          includePartyThreats,
        )
      : null;
  const densityRetreatGoal =
    !holdingProtectiveCombat && anchor && input.forcePartyRecovery
      ? recoveryDensityRetreatGoal(input.entities, anchor, recoveryAnchorRange)
      : null;
  const safeThreatLeashGoal =
    !holdingProtectiveCombat && input.forceSafeThreatLeash
      ? hostedZoneSafeThreatLeashGoal(input.selfMember)
      : null;
  const safeRetreatGoal =
    !holdingProtectiveCombat && input.forceSafeRetreat
      ? hostedZoneSafeRetreatGoal(input.selfMember)
      : null;
  const travelGoal = holdingProtectiveCombat
    ? undefined
    : (safeThreatLeashGoal ??
      safeRetreatGoal ??
      threatRetreatGoal ??
      densityRetreatGoal ??
      (anchor && anchorDistance > recoveryAnchorRange
        ? travelGoalToPartyMember(anchor, recoveryAnchorRange, 'hosted-party-recover')
        : undefined));

  return {
    commands,
    pauseBrainDrive: true,
    ...(travelGoal ? { travelGoal } : {}),
    groupMode:
      input.selfMember.pid === input.leaderMember.pid && !travelGoal
        ? 'recover_party'
        : 'assist_party',
    groupLeaderName: input.leaderMember.name,
    groupLeaderDistance: input.leaderDistance,
  };
}

function hostedZoneSafeRetreatGoal(selfMember: PartyMemberInfo): PartyTravelGoal | null {
  const zone = zoneAt(selfMember.x, selfMember.z);
  const target = hostedZoneSafeRetreatPoint(zone.id, zone.hub);
  return {
    target: { x: target.x, z: target.z },
    arrivalRange: HOSTED_PLAY_SAFE_RETREAT_ARRIVAL_RANGE,
    goalKey: `hosted-party-safe-retreat:${zone.id}:${Math.round(target.x)}:${Math.round(target.z)}`,
  };
}

function hostedZoneSafeRetreatPoint(
  zoneId: string,
  hub: { x: number; z: number },
): { x: number; z: number } {
  if (zoneId === 'mirefen_marsh') return HOSTED_PLAY_FENBRIDGE_SAFE_RETREAT_POINT;
  if (zoneId === 'thornpeak_heights') return HOSTED_PLAY_HIGHWATCH_SAFE_RETREAT_POINT;
  return hub;
}

function hostedZoneSafeThreatLeashGoal(selfMember: PartyMemberInfo): PartyTravelGoal | null {
  const zone = zoneAt(selfMember.x, selfMember.z);
  if (zone.id !== 'thornpeak_heights') return null;
  const target = HOSTED_PLAY_HIGHWATCH_SAFE_THREAT_LEASH_POINT;
  return {
    target: { x: target.x, z: target.z },
    arrivalRange: HOSTED_PLAY_SAFE_RETREAT_ARRIVAL_RANGE,
    goalKey: `hosted-party-safe-leash:${zone.id}:${Math.round(target.x)}:${Math.round(target.z)}`,
  };
}

function hostedMemberReachedSafeRetreat(selfMember: PartyMemberInfo): boolean {
  const safeRetreatGoal = hostedZoneSafeRetreatGoal(selfMember);
  if (!safeRetreatGoal) return false;
  return (
    Math.hypot(selfMember.x - safeRetreatGoal.target.x, selfMember.z - safeRetreatGoal.target.z) <=
    Math.max(safeRetreatGoal.arrivalRange, HOSTED_PLAY_SAFE_RETREAT_SUPPORT_RANGE)
  );
}

function hostedMemberInsideHighwatchSafeThreatLeashCorridor(selfMember: PartyMemberInfo): boolean {
  if (zoneAt(selfMember.x, selfMember.z).id !== 'thornpeak_heights') return false;
  if (hostedMemberReachedSafeRetreat(selfMember)) return true;
  return (
    distanceFromPointToSegment(
      selfMember,
      HOSTED_PLAY_HIGHWATCH_SAFE_RETREAT_POINT,
      HOSTED_PLAY_HIGHWATCH_SAFE_THREAT_LEASH_POINT,
    ) <= HOSTED_PLAY_HIGHWATCH_SAFE_LEASH_CORRIDOR_RANGE
  );
}

function distanceFromPointToSegment(
  point: { x: number; z: number },
  start: { x: number; z: number },
  end: { x: number; z: number },
): number {
  const segmentX = end.x - start.x;
  const segmentZ = end.z - start.z;
  const segmentLengthSq = segmentX * segmentX + segmentZ * segmentZ;
  if (segmentLengthSq <= 0.001) return Math.hypot(point.x - start.x, point.z - start.z);
  const rawT = ((point.x - start.x) * segmentX + (point.z - start.z) * segmentZ) / segmentLengthSq;
  const t = Math.max(0, Math.min(1, rawT));
  const closestX = start.x + segmentX * t;
  const closestZ = start.z + segmentZ * t;
  return Math.hypot(point.x - closestX, point.z - closestZ);
}

function hostedSelfCanEmergencySupportDuringSafeRetreat(input: {
  party: PartyInfo;
  selfMember: PartyMemberInfo;
  liveSelf: Record<string, unknown>;
  playerClass: PlayerClass;
  entities: Iterable<Record<string, unknown>>;
  forceSafeRecoveryRetreat: boolean;
}): boolean {
  if (!input.forceSafeRecoveryRetreat || input.selfMember.dead) return false;
  if (
    !hostedClassCanEmergencySupportDuringSafeRetreat(
      input.playerClass,
      input.liveSelf,
      input.selfMember,
    )
  ) {
    return false;
  }
  const threatenedIds = partyThreatTargetIds(input.entities, input.party);
  return input.party.members.some(
    (member) =>
      member.pid !== input.selfMember.pid &&
      !member.dead &&
      threatenedIds.has(member.pid) &&
      memberHealthRatio(member) <= HOSTED_PLAY_SAFE_RETREAT_EMERGENCY_HEALTH_RATIO &&
      distanceBetweenPartyMembers(input.selfMember, member) <=
        HOSTED_PLAY_SAFE_RETREAT_EMERGENCY_SUPPORT_RANGE,
  );
}

function hostedClassCanEmergencySupportDuringSafeRetreat(
  playerClass: PlayerClass,
  liveSelf: Record<string, unknown>,
  selfMember: PartyMemberInfo,
): boolean {
  if (canClassHeal(playerClass)) return true;
  return canHostedRecoveryProtectorStayEngaged(playerClass, liveSelf, selfMember);
}

function hostedSelfCanSelfHealDuringSafeRetreat(input: {
  selfMember: PartyMemberInfo;
  playerClass: PlayerClass;
  forceSafeRecoveryRetreat: boolean;
}): boolean {
  return (
    input.forceSafeRecoveryRetreat &&
    canClassHeal(input.playerClass) &&
    !input.selfMember.dead &&
    memberHealthRatio(input.selfMember) <= HOSTED_PLAY_SAFE_RETREAT_EMERGENCY_HEALTH_RATIO &&
    hostedMemberReachedSafeRetreat(input.selfMember)
  );
}

function recoveryThreatRetreatGoal(
  liveSelf: Record<string, unknown>,
  entities: Iterable<Record<string, unknown>>,
  party: PartyInfo,
  selfMember: PartyMemberInfo,
  anchor: PartyMemberInfo,
  arrivalRange: number,
  includePartyThreats: boolean,
): PartyTravelGoal | null {
  const selfId = readSelfId(liveSelf);
  const partyIds = new Set(party.members.map((member) => member.pid));
  const selfX = typeof liveSelf.x === 'number' ? liveSelf.x : selfMember.x;
  const selfZ = typeof liveSelf.z === 'number' ? liveSelf.z : selfMember.z;
  let threat: { id: number; x: number; z: number; distance: number } | null = null;
  for (const entity of entities) {
    if (!isAttackableHostedMob(entity)) continue;
    const aggro = typeof entity.aggro === 'number' ? entity.aggro : null;
    if (aggro !== selfId && (!includePartyThreats || aggro === null || !partyIds.has(aggro)))
      continue;
    const id = typeof entity.id === 'number' ? entity.id : null;
    const x = typeof entity.x === 'number' ? entity.x : null;
    const z = typeof entity.z === 'number' ? entity.z : null;
    if (id === null || x === null || z === null) continue;
    const distance = Math.hypot(selfX - x, selfZ - z);
    if (
      distance > HOSTED_PLAY_URGENT_RECOVERY_THREAT_RANGE ||
      (threat && distance >= threat.distance)
    )
      continue;
    threat = { id, x, z, distance };
  }
  if (!threat) return null;

  const awayX = anchor.x - threat.x;
  const awayZ = anchor.z - threat.z;
  const length = Math.hypot(awayX, awayZ);
  if (length <= 0.001) return null;
  const target = {
    x: anchor.x + (awayX / length) * recoveryRetreatDistance(selfMember),
    z: anchor.z + (awayZ / length) * recoveryRetreatDistance(selfMember),
  };
  return {
    target,
    arrivalRange,
    goalKey: `hosted-party-retreat:${anchor.pid}:${threat.id}:${Math.round(target.x)}:${Math.round(target.z)}`,
  };
}

function recoveryDensityRetreatGoal(
  entities: Iterable<Record<string, unknown>>,
  anchor: PartyMemberInfo,
  arrivalRange: number,
): PartyTravelGoal | null {
  let count = 0;
  let sumX = 0;
  let sumZ = 0;
  let closest: { x: number; z: number; distance: number } | null = null;
  for (const entity of entities) {
    if (!isAttackableHostedMob(entity)) continue;
    if (!hostedHostileSignal(entity.h) && typeof entity.aggro !== 'number') continue;
    const x = typeof entity.x === 'number' ? entity.x : null;
    const z = typeof entity.z === 'number' ? entity.z : null;
    if (x === null || z === null) continue;
    const distance = Math.hypot(anchor.x - x, anchor.z - z);
    if (distance > HOSTED_PLAY_DENSE_RECOVERY_RADIUS) continue;
    count++;
    sumX += x;
    sumZ += z;
    if (!closest || distance < closest.distance) closest = { x, z, distance };
  }
  if (count < HOSTED_PLAY_DENSE_RECOVERY_HOSTILES) return null;

  let awayX = anchor.x - sumX / count;
  let awayZ = anchor.z - sumZ / count;
  let length = Math.hypot(awayX, awayZ);
  if (length <= 0.001 && closest) {
    awayX = anchor.x - closest.x;
    awayZ = anchor.z - closest.z;
    length = Math.hypot(awayX, awayZ);
  }
  if (length <= 0.001) return null;
  const target = {
    x: anchor.x + (awayX / length) * HOSTED_PLAY_DENSE_RECOVERY_RETREAT_DISTANCE,
    z: anchor.z + (awayZ / length) * HOSTED_PLAY_DENSE_RECOVERY_RETREAT_DISTANCE,
  };
  return {
    target,
    arrivalRange,
    goalKey: `hosted-party-density-retreat:${anchor.pid}:${count}:${Math.round(target.x)}:${Math.round(target.z)}`,
  };
}

function recoveryRetreatDistance(selfMember: PartyMemberInfo): number {
  return isFrontlineHostedClass(selfMember.cls)
    ? HOSTED_PLAY_FRONTLINE_URGENT_RECOVERY_RETREAT_DISTANCE
    : HOSTED_PLAY_URGENT_RECOVERY_RETREAT_DISTANCE;
}

function isAttackableHostedMob(entity: Record<string, unknown>): boolean {
  if (entity.k !== 'mob' || entity.dead === 1 || entity.dead === true) return false;
  const hp = typeof entity.hp === 'number' ? entity.hp : null;
  if (hp !== null && hp <= 0) return false;
  return hostedHostileSignal(entity.h) || typeof entity.aggro === 'number';
}

function hostedHostileSignal(value: unknown): boolean {
  if (value === true || value === 1) return true;
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
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
  const groupMode: HostedPlayGroupMode =
    input.intent.behavior === 'regroup' ? 'hold_regroup' : 'prepare_party';
  const travelGoal =
    input.intent.behavior === 'regroup'
      ? hostedLeaderRegroupGoal(input.party, input.leaderMember)
      : null;
  return {
    commands: [],
    pauseBrainDrive: true,
    ...(travelGoal ? { travelGoal } : {}),
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
      if (fenbridgeSafeRegroupCanRelease(party, leaderMember)) return false;
      return partyNeedsRegroup(party, leaderMember);
    case 'recover':
      return partyNeedsRecovery(party, true);
    case 'prepare':
      return false;
    default:
      return true;
  }
}

function hostedPartyNeedsSafeRecoveryRetreat(input: {
  partyRecovering: boolean;
  partyHighThreatRecovery: boolean;
  partyRecoveryHasCriticalHealthRisk: boolean;
  leaderMember: PartyMemberInfo;
  nearbyHostileCount: number;
}): boolean {
  if (!input.partyRecovering) return false;
  const zone = zoneAt(input.leaderMember.x, input.leaderMember.z);
  if (!zone.hub) return false;
  if (
    input.partyRecoveryHasCriticalHealthRisk &&
    input.nearbyHostileCount >= HOSTED_PLAY_MIREFEN_SAFE_RECOVERY_HOSTILES
  ) {
    return true;
  }
  return (
    zone.id === 'thornpeak_heights' &&
    input.partyHighThreatRecovery &&
    input.nearbyHostileCount >= HOSTED_PLAY_THORNPEAK_HIGH_THREAT_SAFE_RETREAT_HOSTILES
  );
}

function fenbridgeSafeRegroupCanRelease(party: PartyInfo, leaderMember: PartyMemberInfo): boolean {
  if (zoneAt(leaderMember.x, leaderMember.z).id !== 'mirefen_marsh') return false;
  const distanceToSafePoint = Math.hypot(
    leaderMember.x - HOSTED_PLAY_FENBRIDGE_SAFE_RETREAT_POINT.x,
    leaderMember.z - HOSTED_PLAY_FENBRIDGE_SAFE_RETREAT_POINT.z,
  );
  if (distanceToSafePoint > HOSTED_PLAY_FENBRIDGE_SAFE_REGROUP_RELEASE_RANGE) return false;
  return !party.members.some(
    (member) =>
      member.pid !== leaderMember.pid &&
      !member.dead &&
      member.z < leaderMember.z - HOSTED_PLAY_TRAIN_LINK_REGROUP_RANGE,
  );
}

function fenbridgeLeaderRegroupGoal(
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): PartyTravelGoal | null {
  const zone = zoneAt(leaderMember.x, leaderMember.z);
  if (zone.id !== 'mirefen_marsh') return null;
  if (
    Math.hypot(leaderMember.x - zone.hub.x, leaderMember.z - zone.hub.z) >
    HOSTED_PLAY_FENBRIDGE_LEADER_REGROUP_RADIUS
  ) {
    return null;
  }
  const trainMembers = hostedPartyTrainMembers(party, leaderMember).filter(
    (member) => !member.dead,
  );
  let previous = trainMembers[0] ?? null;
  if (!previous) return null;
  for (const member of trainMembers.slice(1)) {
    if (
      distanceBetweenPartyMembers(previous, member) > HOSTED_PLAY_TRAIN_LEADER_REGROUP_LINK_RANGE
    ) {
      return travelGoalToPartyMember(
        member,
        HOSTED_PLAY_FOLLOW_START_RANGE,
        'hosted-leader-regroup',
      );
    }
    previous = member;
  }
  return null;
}

function hostedLeaderRegroupGoal(
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): PartyTravelGoal | null {
  return (
    fenbridgeLeaderRegroupGoal(party, leaderMember) ??
    trainLinkLeaderRegroupGoal(party, leaderMember) ??
    badlySplitLeaderRegroupGoal(party, leaderMember)
  );
}

function trainLinkLeaderRegroupGoal(
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): PartyTravelGoal | null {
  const trainMembers = hostedPartyTrainMembers(party, leaderMember).filter(
    (member) => !member.dead,
  );
  let previous = trainMembers[0] ?? null;
  if (!previous) return null;
  for (const member of trainMembers.slice(1)) {
    const linkDistance = distanceBetweenPartyMembers(previous, member);
    const leaderDistance = distanceBetweenPartyMembers(leaderMember, member);
    if (
      linkDistance > HOSTED_PLAY_TRAIN_LEADER_REGROUP_LINK_RANGE ||
      leaderDistance > HOSTED_PLAY_TRAIN_MAX_LEADER_RANGE
    ) {
      return travelGoalToPartyMember(
        member,
        HOSTED_PLAY_FOLLOW_START_RANGE,
        'hosted-leader-regroup',
      );
    }
    previous = member;
  }
  return null;
}

function badlySplitLeaderRegroupGoal(
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): PartyTravelGoal | null {
  const trainMembers = hostedPartyTrainMembers(party, leaderMember).filter(
    (member) => !member.dead,
  );
  let previous = trainMembers[0] ?? null;
  if (!previous) return null;
  for (const member of trainMembers.slice(1)) {
    if (distanceBetweenPartyMembers(previous, member) > HOSTED_PLAY_FOLLOW_MAX_RANGE) {
      return travelGoalToPartyMember(
        member,
        HOSTED_PLAY_FOLLOW_START_RANGE,
        'hosted-leader-regroup',
      );
    }
    previous = member;
  }
  return null;
}

function hostedFollowerNeedsTrainRegroup(
  followAnchorDistance: number,
  leaderDistance: number,
): boolean {
  return (
    followAnchorDistance > HOSTED_PLAY_TRAIN_LINK_REGROUP_RANGE ||
    leaderDistance > HOSTED_PLAY_TRAIN_MAX_LEADER_RANGE
  );
}

function partyNeedsRegroup(party: PartyInfo, leaderMember: PartyMemberInfo): boolean {
  const trainMembers = hostedPartyTrainMembers(party, leaderMember).filter(
    (member) => !member.dead,
  );
  if (trainMembers.length <= 1) return false;
  let previous = trainMembers[0];
  for (const member of trainMembers.slice(1)) {
    if (
      distanceBetweenPartyMembers(previous, member) > HOSTED_PLAY_TRAIN_LEADER_REGROUP_LINK_RANGE
    ) {
      return true;
    }
    previous = member;
  }
  return trainMembers.some(
    (member) =>
      member.pid !== leaderMember.pid &&
      distanceBetweenPartyMembers(member, leaderMember) > HOSTED_PLAY_TRAIN_MAX_LEADER_RANGE,
  );
}

function maybeCoordinateHostedDungeonEntry(input: {
  input: HostedPlayPartyTickInput;
  party: PartyInfo;
  selfMember: PartyMemberInfo;
  leaderMember: PartyMemberInfo;
  groupLeaderName: string;
  leaderDistance: number;
  state: HostedPlayPartyState;
}): HostedPlayPartyTickResult | null {
  const dungeonId = input.input.objectiveDungeonId;
  if (!dungeonId) return null;
  const dungeon = DUNGEONS[dungeonId];
  if (!dungeon) return null;
  if (readString(input.input.liveSelf.dgn) === dungeonId) return null;

  const targetPartySize = Math.max(1, input.input.objectiveSuggestedPartySize ?? 1);
  if (input.party.members.length < targetPartySize) return null;

  const selfIsLeader = input.selfMember.pid === input.party.leader;
  const waitPoint = hostedDungeonEntryWaitPoint(dungeonId, dungeon.doorPos);
  const distanceToDoor = distanceToPoint(
    input.selfMember.x,
    input.selfMember.z,
    dungeon.doorPos.x,
    dungeon.doorPos.z,
  );
  const distanceToWaitPoint = distanceToPoint(
    input.selfMember.x,
    input.selfMember.z,
    waitPoint.x,
    waitPoint.z,
  );
  const leaderDistanceToDoor = distanceToPoint(
    input.leaderMember.x,
    input.leaderMember.z,
    dungeon.doorPos.x,
    dungeon.doorPos.z,
  );
  const leaderAppearsInDifferentDungeonPhase =
    leaderDistanceToDoor > HOSTED_PLAY_DUNGEON_PHASE_SPLIT_DISTANCE;
  const entryApproachActive =
    leaderDistanceToDoor <= HOSTED_PLAY_DUNGEON_ENTRY_APPROACH_RANGE ||
    distanceToDoor <= HOSTED_PLAY_DUNGEON_ENTRY_APPROACH_RANGE;
  const laggingMembers = countHostedPartyMembersNotReadyForDungeonEntry(
    input.party,
    dungeon.doorPos,
    waitPoint,
  );
  const partyReadyToEnter = laggingMembers === 0;

  if (
    !selfIsLeader &&
    !leaderAppearsInDifferentDungeonPhase &&
    leaderDistanceToDoor <= HOSTED_PLAY_DUNGEON_ENTRY_APPROACH_RANGE &&
    distanceToDoor > HOSTED_PLAY_DUNGEON_ENTRY_APPROACH_RANGE
  ) {
    return {
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: input.groupLeaderName,
      groupLeaderDistance: input.leaderDistance,
    };
  }

  if (!leaderAppearsInDifferentDungeonPhase && entryApproachActive && laggingMembers > 0) {
    const regroupMember = selfIsLeader
      ? hostedDungeonEntryRegroupMember(input.party, input.selfMember, dungeon.doorPos)
      : null;
    const travelGoal = regroupMember
      ? travelGoalToPartyMember(
          regroupMember,
          HOSTED_PLAY_FOLLOW_START_RANGE,
          'hosted-dungeon-door-regroup',
        )
      : distanceToWaitPoint > HOSTED_PLAY_DUNGEON_ENTRY_WAIT_RANGE
        ? {
            target: waitPoint,
            arrivalRange: HOSTED_PLAY_DUNGEON_ENTRY_WAIT_RANGE,
            goalKey: `hosted-dungeon-entry-wait:${dungeonId}:${Math.round(waitPoint.x)}:${Math.round(waitPoint.z)}`,
          }
        : null;
    return {
      commands: [],
      pauseBrainDrive: true,
      ...(travelGoal ? { travelGoal } : {}),
      groupMode: selfIsLeader ? 'hold_regroup' : 'follow_leader',
      groupLeaderName: input.groupLeaderName,
      groupLeaderDistance: input.leaderDistance,
    };
  }

  if (
    distanceToDoor <= HOSTED_PLAY_DUNGEON_DOOR_RANGE &&
    (partyReadyToEnter || leaderAppearsInDifferentDungeonPhase) &&
    reserveCommandBatch(input.state, input.input.nowMs, [
      { key: `enter:${dungeonId}`, cooldownMs: HOSTED_PLAY_DUNGEON_ENTER_COOLDOWN_MS },
    ])
  ) {
    return {
      commands: [{ cmd: 'enter_dungeon', dungeon: dungeonId }],
      pauseBrainDrive: true,
      groupMode: 'brain',
      groupLeaderName: input.groupLeaderName,
      groupLeaderDistance: input.leaderDistance,
    };
  }

  return null;
}

function hostedDungeonEntryWaitPoint(
  dungeonId: string,
  doorPos: { x: number; z: number },
): { x: number; z: number } {
  if (dungeonId === 'sunken_bastion') return { x: 49, z: 518 };
  return { x: doorPos.x, z: doorPos.z - 4 };
}

function hostedDungeonEntryRegroupMember(
  party: PartyInfo,
  selfMember: PartyMemberInfo,
  doorPos: { x: number; z: number },
): PartyMemberInfo | null {
  let bestMember: PartyMemberInfo | null = null;
  let bestDistanceToSelf = HOSTED_PLAY_TRAIN_MAX_LEADER_RANGE;
  for (const member of party.members) {
    if (member.pid === selfMember.pid || member.dead) continue;
    const distanceToDoor = distanceToPoint(member.x, member.z, doorPos.x, doorPos.z);
    if (distanceToDoor <= HOSTED_PLAY_DUNGEON_DOOR_RANGE) continue;
    if (distanceToDoor > HOSTED_PLAY_DUNGEON_PHASE_SPLIT_DISTANCE) continue;
    const distanceToSelf = distanceBetweenPartyMembers(selfMember, member);
    if (distanceToSelf <= bestDistanceToSelf) continue;
    bestDistanceToSelf = distanceToSelf;
    bestMember = member;
  }
  return bestMember;
}

function countHostedPartyMembersNotReadyForDungeonEntry(
  party: PartyInfo,
  doorPos: { x: number; z: number },
  waitPoint: { x: number; z: number },
): number {
  let count = 0;
  for (const member of party.members) {
    if (member.dead) continue;
    const distanceToWaitPoint = distanceToPoint(member.x, member.z, waitPoint.x, waitPoint.z);
    if (distanceToWaitPoint > HOSTED_PLAY_DUNGEON_PHASE_SPLIT_DISTANCE) continue;
    const distanceToDoor = distanceToPoint(member.x, member.z, doorPos.x, doorPos.z);
    if (
      distanceToWaitPoint <= HOSTED_PLAY_DUNGEON_ENTRY_WAIT_RANGE &&
      distanceToDoor <= HOSTED_PLAY_DUNGEON_DOOR_RANGE
    ) {
      continue;
    }
    count++;
  }
  return count;
}

function distanceToPoint(x: number, z: number, targetX: number, targetZ: number): number {
  return Math.hypot(x - targetX, z - targetZ);
}

function hostedPartyTrainAnchor(
  party: PartyInfo,
  selfMember: PartyMemberInfo,
  leaderMember: PartyMemberInfo,
): PartyMemberInfo | null {
  if (selfMember.pid === leaderMember.pid || selfMember.dead) return null;
  const trainMembers = hostedPartyTrainMembers(party, leaderMember).filter(
    (member) => !member.dead,
  );
  const selfIndex = trainMembers.findIndex((member) => member.pid === selfMember.pid);
  if (selfIndex <= 0) return null;
  return trainMembers[selfIndex - 1] ?? null;
}

function hostedPartyTrainMembers(
  party: PartyInfo,
  leaderMember: PartyMemberInfo,
): PartyMemberInfo[] {
  return [leaderMember, ...party.members.filter((member) => member.pid !== leaderMember.pid)];
}

function partyNeedsRecovery(party: PartyInfo, holdUntilStable = false): boolean {
  return (
    partyNeedsHealthRecovery(party, holdUntilStable) ||
    partyNeedsResourceRecovery(party, holdUntilStable)
  );
}

function partyNeedsHealthRecovery(party: PartyInfo, holdUntilStable = false): boolean {
  const healthThreshold = holdUntilStable
    ? HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO
    : HOSTED_PLAY_RECOVERY_HEALTH_RATIO;
  return party.members.some(
    (member) => member.dead || memberHealthRatio(member) <= healthThreshold,
  );
}

function partyNeedsResourceRecovery(party: PartyInfo, holdUntilStable = false): boolean {
  const resourceThreshold = holdUntilStable
    ? HOSTED_PLAY_RECOVERY_STABLE_RESOURCE_RATIO
    : HOSTED_PLAY_RECOVERY_RESOURCE_RATIO;
  const primaryResourceMember = primaryResourceRecoveryMember(party);
  return primaryResourceMember
    ? memberNeedsResourceRecovery(primaryResourceMember, resourceThreshold)
    : false;
}

function primaryResourceRecoveryMember(party: PartyInfo): PartyMemberInfo | null {
  const healers = party.members.filter((member) => !member.dead && canClassHeal(member.cls));
  return healers.find((member) => member.cls === 'priest') ?? healers[0] ?? null;
}

function hostedPartyRecoveryOffenseUnsafe(party: PartyInfo): boolean {
  const primaryResourceMember = primaryResourceRecoveryMember(party);
  return primaryResourceMember
    ? memberNeedsResourceRecovery(primaryResourceMember, HOSTED_PLAY_RECOVERY_RESOURCE_RATIO)
    : false;
}

function hostedSelfShouldHandleResourceRecovery(input: {
  partyRecoveringOnlyResources: boolean;
  partyInCombat: boolean;
  forceSafeRecoveryRetreat: boolean;
  liveSelf: Record<string, unknown>;
  selfMember: PartyMemberInfo;
  selfIsLeader: boolean;
  leaderDistance: number;
}): boolean {
  return (
    input.partyRecoveringOnlyResources &&
    !input.partyInCombat &&
    !input.forceSafeRecoveryRetreat &&
    !input.selfMember.dead &&
    input.leaderDistance <= HOSTED_PLAY_FOLLOW_MAX_RANGE &&
    memberNeedsResourceRecovery(input.selfMember, HOSTED_PLAY_RECOVERY_RESOURCE_RATIO) &&
    (input.selfIsLeader || hostedSelfCanRecoverResourcesInPlace(input.liveSelf))
  );
}

function hostedSelfCanRecoverResourcesInPlace(liveSelf: Record<string, unknown>): boolean {
  if (readRemaining(liveSelf.drk) > 0) return true;
  return inventoryHasKind(liveSelf, 'drink');
}

function inventoryHasKind(liveSelf: Record<string, unknown>, kind: 'drink'): boolean {
  const inventory = Array.isArray(liveSelf.inv) ? liveSelf.inv : [];
  for (const rawSlot of inventory) {
    if (!rawSlot || typeof rawSlot !== 'object' || Array.isArray(rawSlot)) continue;
    const slot = rawSlot as Record<string, unknown>;
    const itemId = typeof slot.itemId === 'string' ? slot.itemId : '';
    const count = typeof slot.count === 'number' && Number.isFinite(slot.count) ? slot.count : 0;
    if (count <= 0) continue;
    const item = ITEMS[itemId];
    if (item?.kind === kind) return true;
  }
  return false;
}

function readRemaining(value: unknown): number {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
  const remaining = (value as Record<string, unknown>).remaining;
  return typeof remaining === 'number' && Number.isFinite(remaining) ? remaining : 0;
}

function memberNeedsResourceRecovery(member: PartyMemberInfo, threshold: number): boolean {
  return (
    !member.dead &&
    member.rtype === 'mana' &&
    member.mres > 0 &&
    canClassHeal(member.cls) &&
    memberResourceRatio(member) <= threshold
  );
}

function selfNeedsFragileThreatRecovery(
  selfMember: PartyMemberInfo,
  entities: readonly Record<string, unknown>[],
): boolean {
  if (selfMember.dead || selfMember.level > HOSTED_PLAY_FRAGILE_THREAT_MAX_LEVEL) return false;
  if (!isFragileHostedClass(selfMember.cls)) return false;
  if (memberHealthRatio(selfMember) > HOSTED_PLAY_FRAGILE_THREAT_RECOVERY_HEALTH_RATIO)
    return false;
  return entities.some(
    (entity) =>
      entity.k === 'mob' &&
      entity.dead !== 1 &&
      entity.dead !== true &&
      entity.aggro === selfMember.pid,
  );
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
  if (memberHealthRatio(selfMember) > HOSTED_PLAY_FRONTLINE_THREAT_RECOVERY_HEALTH_RATIO)
    return false;
  return entities.some(
    (entity) =>
      entity.k === 'mob' &&
      entity.dead !== 1 &&
      entity.dead !== true &&
      entity.aggro === selfMember.pid,
  );
}

function isFragileHostedClass(cls: PlayerClass): boolean {
  return cls === 'mage' || cls === 'priest' || cls === 'warlock';
}

function isFrontlineHostedClass(cls: PlayerClass): boolean {
  return cls === 'warrior' || cls === 'paladin' || cls === 'druid';
}

function canHostedRecoveryProtectorStayEngaged(
  playerClass: PlayerClass,
  liveSelf: Record<string, unknown>,
  selfMember: PartyMemberInfo,
): boolean {
  if (selfMember.dead) return false;
  if (memberHealthRatio(selfMember) <= HOSTED_PLAY_RECOVERY_PROTECTOR_ENGAGE_HEALTH_RATIO)
    return false;
  if (playerClass === 'warrior' || playerClass === 'paladin') return true;
  return playerClass === 'druid' && liveSelfHasAuraKind(liveSelf, 'form_bear');
}

function hostedSelfNeedsPartyRecoveryPause(
  playerClass: PlayerClass,
  liveSelf: Record<string, unknown>,
  selfMember: PartyMemberInfo,
): boolean {
  if (memberHealthRatio(selfMember) > HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO) return false;
  return !canHostedRecoveryProtectorStayEngaged(playerClass, liveSelf, selfMember);
}

function liveSelfHasAuraKind(liveSelf: Record<string, unknown>, auraKind: string): boolean {
  const auras = Array.isArray(liveSelf.auras) ? liveSelf.auras : [];
  return auras.some((aura) => {
    if (!aura || typeof aura !== 'object' || Array.isArray(aura)) return false;
    const record = aura as Record<string, unknown>;
    const remaining = typeof record.rem === 'number' ? record.rem : 0;
    return record.kind === auraKind && remaining > 3;
  });
}

function partyRecoveryAnchor(
  party: PartyInfo,
  selfMember: PartyMemberInfo,
  leaderMember: PartyMemberInfo,
): PartyMemberInfo | null {
  const aliveMembers = party.members.filter(
    (member) => member.pid !== selfMember.pid && !member.dead,
  );
  const stableMembers = aliveMembers.filter(
    (member) => memberHealthRatio(member) > HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO,
  );
  if (
    leaderMember.pid === selfMember.pid &&
    memberHealthRatio(selfMember) <= HOSTED_PLAY_RECOVERY_HEALTH_RATIO
  ) {
    const stableHealer =
      [...stableMembers]
        .filter((member) => canClassHeal(member.cls))
        .sort(
          (a, b) =>
            distanceBetweenPartyMembers(selfMember, b) - distanceBetweenPartyMembers(selfMember, a),
        )[0] ?? null;
    if (stableHealer) return stableHealer;
  }
  if (
    leaderMember.pid !== selfMember.pid &&
    !leaderMember.dead &&
    memberHealthRatio(leaderMember) > HOSTED_PLAY_RECOVERY_STABLE_HEALTH_RATIO
  ) {
    return leaderMember;
  }
  const candidates = stableMembers.length > 0 ? stableMembers : aliveMembers;
  return (
    [...candidates].sort(
      (a, b) =>
        distanceBetweenPartyMembers(selfMember, a) - distanceBetweenPartyMembers(selfMember, b),
    )[0] ?? null
  );
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
  const liveTargetId = readFiniteNumber(liveMember.target);
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
    ...(liveTargetId !== null ? { targetId: liveTargetId } : {}),
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
  return value === 'rage' || value === 'mana' || value === 'energy' ? value : undefined;
}

function readSelfId(value: Record<string, unknown>): number {
  return typeof value.id === 'number' ? value.id : -1;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
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
    const healing =
      item && item.kind === 'potion' && 'potionHp' in item && typeof item.potionHp === 'number'
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
    state.lastAcceptCommandAtMs !== null &&
    input.nowMs - state.lastAcceptCommandAtMs < HOSTED_PLAY_ACCEPT_COOLDOWN_MS
  ) {
    return false;
  }
  state.lastAcceptCommandAtMs = input.nowMs;
  return true;
}

function canIssueAssist(input: HostedPlayPartyTickInput, state: HostedPlayPartyState): boolean {
  if (
    state.lastAssistCommandAtMs !== null &&
    input.nowMs - state.lastAssistCommandAtMs < HOSTED_PLAY_ASSIST_COOLDOWN_MS
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
  const targetPartySize = hostedPlayTargetPartySizeForInput(input);
  const selfId = readSelfId(input.liveSelf);
  const selfName = readSelfName(input.liveSelf);
  if (selfId <= 0 || memberIsDead(input.liveSelf) || memberInCombatLive(input.liveSelf))
    return null;
  const partySize = party?.members.length ?? 1;
  if (partySize >= targetPartySize || partySize >= 5) return null;
  if (party && party.leader !== selfId) return null;
  const nearbyInvite = collectNearbyInviteCandidate(input, state, party, selfId, selfName);
  if (!nearbyInvite || !canIssueNearbyInvite(input, state)) return null;
  state.lastNearbyInviteAtMsByName[nearbyInvite.name] = input.nowMs;
  return {
    commands: [{ cmd: 'pinvite', id: nearbyInvite.id }],
    pauseBrainDrive: true,
    groupMode: 'invite_nearby',
    groupLeaderName: party
      ? (party.members.find((member) => member.pid === party.leader)?.name ?? selfName)
      : selfName,
    groupLeaderDistance: 0,
  };
}

function maybeHoldForTargetParty(
  input: HostedPlayPartyTickInput,
  party: PartyInfo | null,
): HostedPlayPartyTickResult | null {
  if (input.autoInviteNearbyPlayers !== true) return null;
  if (!party) return null;
  const targetPartySize = hostedPlayTargetPartySizeForInput(input);
  const partySize = party?.members.length ?? 1;
  if (partySize >= targetPartySize || partySize >= 5) return null;
  const selfId = readSelfId(input.liveSelf);
  if (selfId <= 0 || memberIsDead(input.liveSelf) || memberInCombatLive(input.liveSelf))
    return null;
  if (party && party.leader !== selfId) return null;
  const selfName = readSelfName(input.liveSelf);
  return {
    commands: [],
    pauseBrainDrive: true,
    groupMode: 'invite_nearby',
    groupLeaderName: party
      ? (party.members.find((member) => member.pid === party.leader)?.name ?? selfName)
      : selfName,
    groupLeaderDistance: 0,
  };
}

function hostedPlayTargetPartySizeForInput(
  input: HostedPlayPartyTickInput,
): HostedPlayAutoInviteTargetPartySize {
  const fallbackPartySize = Math.max(
    2,
    hostedPlayTargetPartySize(input.objectiveSuggestedPartySize ?? 0),
  );
  return normalizeHostedPlayAutoInviteTargetPartySize(
    input.autoInviteNearbyTargetPartySize ?? fallbackPartySize,
  );
}

function collectNearbyInviteCandidate(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
  party: PartyInfo | null,
  selfId: number,
  selfName: string,
): { id: number; name: string } | null {
  const partyMemberNames = new Set(party?.members.map((member) => member.name) ?? []);
  const ambientBotNames = new Set(
    input.ambientDirectory.map((bot) => bot.characterName).filter(Boolean),
  );
  let bestCandidate: { id: number; name: string; distance: number; ambient: boolean } | null = null;
  for (const entity of input.entities) {
    if (entity.k !== 'player' || typeof entity.id !== 'number' || typeof entity.nm !== 'string')
      continue;
    if (
      entity.id === selfId ||
      (selfName && entity.nm === selfName) ||
      partyMemberNames.has(entity.nm)
    )
      continue;
    if (entity.dead === 1 || entity.dead === true) continue;
    const distance = distanceToLiveEntity(input.liveSelf, entity);
    if (distance === null || distance > HOSTED_PLAY_NEARBY_INVITE_RANGE) continue;
    const lastInviteAtMs = state.lastNearbyInviteAtMsByName[entity.nm] ?? Number.NEGATIVE_INFINITY;
    if (input.nowMs - lastInviteAtMs < HOSTED_PLAY_NEARBY_INVITE_TARGET_COOLDOWN_MS) continue;
    const ambient = ambientBotNames.has(entity.nm);
    const betterCandidate =
      !bestCandidate ||
      (bestCandidate.ambient && !ambient) ||
      (bestCandidate.ambient === ambient && distance < bestCandidate.distance);
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
    state.lastNearbyInviteCommandAtMs !== null &&
    input.nowMs - state.lastNearbyInviteCommandAtMs < HOSTED_PLAY_NEARBY_INVITE_COOLDOWN_MS
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
    self: {
      ...liveSelf,
      id: readSelfId(liveSelf),
      x: readFiniteNumber(liveSelf.x) ?? 0,
      z: readFiniteNumber(liveSelf.z) ?? 0,
    },
    entities: entityMap,
  };
}

function canHostedProvidePartyPreparation(playerClass: PlayerClass): boolean {
  return (
    playerClass === 'priest' ||
    playerClass === 'paladin' ||
    playerClass === 'druid' ||
    playerClass === 'shaman'
  );
}

function normalizeHostedGroupMode(groupMode: string, partyInCombat: boolean): HostedPlayGroupMode {
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
  return groupMode === 'buff_party' || groupMode === 'prepare_party' || groupMode === 'heal_party';
}

function readRunnerString(value: Record<string, unknown>, key: string): string {
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

function hasPartyThreat(entities: Iterable<Record<string, unknown>>, party: PartyInfo): boolean {
  return partyThreatTargetIds(entities, party).size > 0;
}
