import type { PartyInfo } from '../../src/world_api';
import type { SimEvent } from '../../src/sim/types';
import type { PlayerClass } from '../../src/sim/types';
import {
  normalizeHostedPlayAutoInviteTargetPartySize,
  type HostedPlayAutoInviteTargetPartySize,
} from '../../src/hosted_play_settings';
import { distanceBetweenPartyMembers, type PartyTravelGoal, findPartyCombatTarget, partyAssistArrivalRange, travelGoalToPartyMember, travelGoalToPartyTarget } from '../party_coordination';
import {
  maybeCoordinateAmbientPartySupport,
  type AmbientGroupCommandReservation,
} from '../ambient_bots/group_support';
import { maybePrepareForPullFromLiveState } from '../ambient_bots/pre_combat';
import type { AmbientPlayerBotRecord } from '../ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../ambient_bots/ws_client';
import type { HostedPlayGroupMode, HostedPlayPartyMode } from './types';

const HOSTED_PLAY_ACCEPT_COOLDOWN_MS = 1_500;
const HOSTED_PLAY_ASSIST_COOLDOWN_MS = 1_200;
const HOSTED_PLAY_FOLLOW_COOLDOWN_MS = 6_000;
const HOSTED_PLAY_NEARBY_INVITE_COOLDOWN_MS = 12_000;
const HOSTED_PLAY_NEARBY_INVITE_TARGET_COOLDOWN_MS = 90_000;
const HOSTED_PLAY_NEARBY_INVITE_RANGE = 32;
const HOSTED_PLAY_REGROUP_RANGE = 28;
const HOSTED_PLAY_FOLLOW_START_RANGE = 4;
const HOSTED_PLAY_FOLLOW_MAX_RANGE = 60;

type HostedPlayCommand = Record<string, unknown>;

export interface HostedPlayPartyState {
  lastAcceptCommandAtMs: number | null;
  lastAssistCommandAtMs: number | null;
  lastFollowCommandAtMs: number | null;
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
    lastFollowCommandAtMs: null,
    lastNearbyInviteCommandAtMs: null,
    lastNearbyInviteAtMsByName: {},
    lastCommandAtMs: {},
  };
}

export function tickHostedPlayPartyCoordinator(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
): HostedPlayPartyTickResult {
  const party = parsePartyInfo(input.liveSelf.party);
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

  const nearbyInviteResult = maybeInviteNearbyPlayer(input, state, party);
  if (nearbyInviteResult) return nearbyInviteResult;

  if (!party || input.partyMode !== 'follow_leader' || party.members.length < 2) {
    return idlePartyResult();
  }

  const selfMember = party.members.find((member) => member.pid === readSelfId(input.liveSelf)) ?? null;
  const leaderMember = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!selfMember || !leaderMember) return idlePartyResult();

  const leaderDistance = distanceBetweenPartyMembers(selfMember, leaderMember);
  const groupLeaderName = leaderMember.name;
  const partyInCombat = party.members.some((member) => member.inCombat === 1) || hasPartyThreat(input.entities, party);
  const botRecord = hostedPlayPartyBotRecord(input.playerClass, selfMember);
  const liveState = hostedPartyLiveState(input.liveSelf, input.entities);
  const supportDecision = partyInCombat || canHostedProvidePartyPreparation(input.playerClass)
    ? maybeCoordinateAmbientPartySupport({
      bot: botRecord,
      liveState,
      party,
      leaderMember,
      selfMember,
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

  if (!partyInCombat) {
    const selfPreparation = maybePrepareForPullFromLiveState({
      bot: botRecord,
      liveSelf: input.liveSelf,
      entities: input.entities,
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
    entities: input.entities,
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

  const followerShouldStayWithLeader = selfMember.pid !== leaderMember.pid
    && !selfMember.dead
    && !leaderMember.dead
    && !selfMember.inCombat
    && !leaderMember.inCombat
    && leaderDistance <= HOSTED_PLAY_FOLLOW_MAX_RANGE;
  if (followerShouldStayWithLeader) {
    const commands: HostedPlayCommand[] = [];
    if (
      groupLeaderName
      && leaderDistance > HOSTED_PLAY_FOLLOW_START_RANGE
      && (state.lastFollowCommandAtMs === null
        || input.nowMs - state.lastFollowCommandAtMs >= HOSTED_PLAY_FOLLOW_COOLDOWN_MS)
    ) {
      state.lastFollowCommandAtMs = input.nowMs;
      commands.push({ cmd: 'chat', text: `/follow ${groupLeaderName}` });
    }
    return {
      commands,
      pauseBrainDrive: true,
      groupMode: 'follow_leader',
      groupLeaderName,
      groupLeaderDistance: leaderDistance,
    };
  }

  if (
    selfMember.pid === leaderMember.pid
    && !selfMember.dead
    && !selfMember.inCombat
    && party.members.some((member) =>
      member.pid !== selfMember.pid
      && !member.dead
      && distanceBetweenPartyMembers(member, selfMember) > HOSTED_PLAY_REGROUP_RANGE)
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

function readSelfId(value: Record<string, unknown>): number {
  return typeof value.id === 'number' ? value.id : -1;
}

function readSelfTargetId(value: Record<string, unknown>): number | null {
  return typeof value.target === 'number' ? value.target : null;
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
  let bestCandidate: { id: number; name: string; distance: number } | null = null;
  for (const entity of input.entities) {
    if (entity.k !== 'player' || typeof entity.id !== 'number' || typeof entity.nm !== 'string') continue;
    if (entity.id === selfId || (selfName && entity.nm === selfName) || partyMemberNames.has(entity.nm)) continue;
    if (entity.dead === 1 || entity.dead === true) continue;
    const distance = distanceToLiveEntity(input.liveSelf, entity);
    if (distance === null || distance > HOSTED_PLAY_NEARBY_INVITE_RANGE) continue;
    const lastInviteAtMs = state.lastNearbyInviteAtMsByName[entity.nm] ?? Number.NEGATIVE_INFINITY;
    if (input.nowMs - lastInviteAtMs < HOSTED_PLAY_NEARBY_INVITE_TARGET_COOLDOWN_MS) continue;
    if (!bestCandidate || distance < bestCandidate.distance) {
      bestCandidate = { id: entity.id, name: entity.nm, distance };
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
