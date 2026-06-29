import { DUNGEONS } from '../../src/sim/data';
import type { SimEvent } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import { readAssignedPlayerName } from './assignment';
import {
  maybeCoordinateAmbientPartySupport,
  type AmbientGroupCommandReservation,
} from './group_support';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';

const GROUP_INVITE_COOLDOWN_MS = 4_000;
const GROUP_ACCEPT_COOLDOWN_MS = 1_500;
const GROUP_DECLINE_COOLDOWN_MS = 1_500;
const GROUP_ENTER_COOLDOWN_MS = 4_000;
const GROUP_FOLLOW_COOLDOWN_MS = 6_000;
const GROUP_ASSIST_COOLDOWN_MS = 1_200;
const GROUP_DOOR_RANGE = 7.5;
const GROUP_REGROUP_RANGE = 24;
const GROUP_FOLLOW_START_RANGE = 4;
const GROUP_FOLLOW_MAX_RANGE = 48;

type GroupCommand = Record<string, unknown>;

export interface AmbientPlayerBotGroupRuntimeState {
  lastCommandAtMs: Record<string, number>;
}

export interface AmbientPlayerBotGroupTickInput {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  recentEvents: readonly SimEvent[];
  objectiveId: string;
  objectiveQuestId?: string;
  objectiveDungeonId?: string;
  objectiveSuggestedPartySize: number;
  directory: readonly AmbientPlayerBotRecord[];
  nowMs: number;
}

export interface AmbientPlayerBotGroupTickResult {
  commands: readonly GroupCommand[];
  pauseBrainDrive: boolean;
  runnerStatePatch: Record<string, unknown>;
}

interface VisibleAmbientPeer {
  entityId: number;
  name: string;
}

export function createAmbientPlayerBotGroupRuntimeState(): AmbientPlayerBotGroupRuntimeState {
  return {
    lastCommandAtMs: {},
  };
}

export function tickAmbientPlayerBotGroupCoordinator(
  input: AmbientPlayerBotGroupTickInput,
  state: AmbientPlayerBotGroupRuntimeState,
): AmbientPlayerBotGroupTickResult {
  const self = input.liveState.self;
  const objectiveMatchKey = groupObjectiveMatchKey(
    input.objectiveId,
    input.objectiveQuestId,
    input.objectiveDungeonId,
  );
  const dungeon = input.objectiveDungeonId ? DUNGEONS[input.objectiveDungeonId] : null;
  const isOutdoorGroupedObjective = !input.objectiveDungeonId;
  if (!self || !input.bot.assignedClusterId) {
    return emptyGroupResult();
  }

  const party = parsePartyInfo(self.party);
  const activeBots = input.directory
    .filter((record) =>
      record.assignedClusterId === input.bot.assignedClusterId
      && record.lifecycleStatus === 'online'
      && matchesGroupObjective(record.runnerState, objectiveMatchKey),
    )
    .sort((a, b) => a.botId.localeCompare(b.botId));
  const coordinatorBots = activeBots.length > 0 ? activeBots : [input.bot];

  const activeNames = new Set(coordinatorBots.map((record) => record.characterName).filter(Boolean));
  const visiblePeers = collectVisibleAmbientPeers(input.liveState, activeNames, input.bot.characterName);
  const leaderRecord = currentLeaderRecord(coordinatorBots, party);
  const fallbackBotLeader = coordinatorBots[0] ?? input.bot;
  const leaderMember = party ? findPartyLeaderMember(party) : null;
  const selfMember = party ? findPartyMember(party, input.bot) : null;
  const partySize = party?.members.length ?? 1;
  const targetPartySize = Math.max(
    1,
    Math.min(
      input.objectiveSuggestedPartySize,
      Math.max(coordinatorBots.length, visiblePeers.length + 1, partySize),
    ),
  );
  const commands: GroupCommand[] = [];
  let pauseBrainDrive = false;
  let groupMode = '';
  let groupLeaderName = leaderMember?.name ?? leaderRecord?.characterName ?? fallbackBotLeader.characterName;
  const botIsGroupLeader = party
    ? party.leader === input.bot.characterId
    : fallbackBotLeader.botId === input.bot.botId;
  const assignedPlayerName = readAssignedPlayerName(input.bot.plannerState);
  const leaderDistance = selfMember && leaderMember
    ? distanceBetweenMembers(selfMember, leaderMember)
    : null;
  let groupLeaderDistance = leaderDistance ?? 0;

  const inviteDecision = !party
    ? ambientPartyInviteDecision(input.recentEvents, activeNames, assignedPlayerName)
    : null;
  if (inviteDecision?.trusted && canIssue(state, `accept:${inviteDecision.fromName}`, input.nowMs, GROUP_ACCEPT_COOLDOWN_MS)) {
    commands.push({ cmd: 'paccept' });
    return {
      commands,
      pauseBrainDrive: true,
      runnerStatePatch: groupRunnerStatePatch({
        objectiveDungeonId: input.objectiveDungeonId,
        objectiveQuestId: input.objectiveQuestId,
        isOutdoorGroupedObjective,
        groupLeaderName: inviteDecision.fromName,
        groupTargetSize: targetPartySize,
        groupPartySize: partySize,
        groupMode: 'accept_invite',
        groupNeedsRegroup: false,
        groupAwaitingParty: false,
        groupLaggingMembers: 0,
        groupLeaderDistance: 0,
      }),
    };
  }
  if (inviteDecision && !inviteDecision.trusted && canIssue(state, `decline:${inviteDecision.fromPid}`, input.nowMs, GROUP_DECLINE_COOLDOWN_MS)) {
    commands.push({ cmd: 'pdecline' });
    return {
      commands,
      pauseBrainDrive: true,
      runnerStatePatch: groupRunnerStatePatch({
        objectiveDungeonId: input.objectiveDungeonId,
        objectiveQuestId: input.objectiveQuestId,
        isOutdoorGroupedObjective,
        groupLeaderName,
        groupTargetSize: targetPartySize,
        groupPartySize: partySize,
        groupMode: '',
        groupNeedsRegroup: false,
        groupAwaitingParty: false,
        groupLaggingMembers: 0,
        groupLeaderDistance: 0,
      }),
    };
  }

  const supportDecision = party
    ? maybeCoordinateAmbientPartySupport({
      bot: input.bot,
      liveState: input.liveState,
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
      runnerStatePatch: groupRunnerStatePatch({
        objectiveDungeonId: input.objectiveDungeonId,
        objectiveQuestId: input.objectiveQuestId,
        isOutdoorGroupedObjective,
        groupLeaderName,
        groupTargetSize: targetPartySize,
        groupPartySize: partySize,
        groupMode: supportDecision.groupMode,
        groupNeedsRegroup: false,
        groupAwaitingParty: false,
        groupLaggingMembers: 0,
        groupLeaderDistance: leaderDistance ?? 0,
      }),
    };
  }

  const partyMemberNames = new Set(party?.members.map((member) => member.name) ?? [input.bot.characterName]);
  const ungroupedVisiblePeers = visiblePeers.filter((peer) => !partyMemberNames.has(peer.name));

  if (leaderRecord?.botId === input.bot.botId || (!leaderRecord && fallbackBotLeader.botId === input.bot.botId && !party)) {
    const nextInvite = ungroupedVisiblePeers[0];
    if (
      nextInvite
      && partySize < targetPartySize
      && canIssue(state, `invite:${nextInvite.name}`, input.nowMs, GROUP_INVITE_COOLDOWN_MS)
    ) {
      commands.push({ cmd: 'pinvite', id: nextInvite.entityId });
    }
  }

  const assistTarget = party ? partyCombatTarget(input.liveState, party) : null;
  if (
    assistTarget
    && selfMember
    && !memberInCombat(selfMember)
    && readSelfTargetId(self) !== assistTarget.id
    && canIssue(state, `assist:${assistTarget.id}`, input.nowMs, GROUP_ASSIST_COOLDOWN_MS)
  ) {
    commands.push({ cmd: 'target', id: assistTarget.id });
    pauseBrainDrive = true;
    groupMode = 'assist_party';
  }

  const inObjectiveDungeon = !!input.objectiveDungeonId && readSelfDungeonId(self) === input.objectiveDungeonId;
  const groupTravelActive = inObjectiveDungeon || isOutdoorGroupedObjective;
  const laggingAmbientMembers = leaderMember && party
    ? countLaggingAmbientMembers(party, leaderMember, activeNames)
    : 0;
  const leaderShouldWaitForParty = isOutdoorGroupedObjective
    && botIsGroupLeader
    && partySize < targetPartySize
    && ungroupedVisiblePeers.length > 0;
  const leaderShouldHoldForLag = groupTravelActive
    && leaderRecord?.botId === input.bot.botId
    && !!leaderMember
    && !memberInCombat(leaderMember)
    && laggingAmbientMembers > 0;
  const leaderShouldHold = leaderShouldWaitForParty || leaderShouldHoldForLag;
  if (leaderShouldHold) pauseBrainDrive = true;
  groupLeaderDistance = leaderDistance ?? 0;
  const followerShouldStayWithLeader = groupTravelActive
    && party?.leader !== input.bot.characterId
    && !!selfMember
    && !!leaderMember
    && !memberInCombat(selfMember)
    && !memberInCombat(leaderMember)
    && !selfMember.dead
    && !leaderMember.dead
    && leaderDistance !== null
    && leaderDistance <= GROUP_FOLLOW_MAX_RANGE;
  if (followerShouldStayWithLeader && groupMode !== 'assist_party') {
    pauseBrainDrive = true;
    groupMode = 'follow_leader';
    if (
      leaderMember.name
      && leaderDistance > GROUP_FOLLOW_START_RANGE
      && canIssue(state, `follow:${leaderMember.name}`, input.nowMs, GROUP_FOLLOW_COOLDOWN_MS)
    ) {
      commands.push({ cmd: 'chat', text: `/follow ${leaderMember.name}` });
    }
  }
  if (leaderShouldWaitForParty) groupMode = 'wait_party';
  else if (leaderShouldHoldForLag) groupMode = 'hold_regroup';
  else if (!groupMode && (party || input.objectiveSuggestedPartySize > 1)) groupMode = 'brain';

  const distanceToDoor = dungeon && typeof self.x === 'number' && typeof self.z === 'number'
    ? distanceToPoint(self.x, self.z, dungeon.doorPos.x, dungeon.doorPos.z)
    : Number.POSITIVE_INFINITY;
  if (
    dungeon
    && typeof self.x === 'number'
    && typeof self.z === 'number'
    && distanceToDoor <= GROUP_DOOR_RANGE
    && (!self.dgn || self.dgn !== input.objectiveDungeonId)
    && partySize >= targetPartySize
    && canIssue(state, `enter:${input.objectiveDungeonId}`, input.nowMs, GROUP_ENTER_COOLDOWN_MS)
  ) {
    commands.push({ cmd: 'enter_dungeon', dungeon: input.objectiveDungeonId });
  }

  return {
    commands,
    pauseBrainDrive,
    runnerStatePatch: groupRunnerStatePatch({
      objectiveDungeonId: input.objectiveDungeonId,
      objectiveQuestId: input.objectiveQuestId,
      isOutdoorGroupedObjective,
      groupLeaderName,
      groupTargetSize: targetPartySize,
      groupPartySize: partySize,
      groupMode,
      groupNeedsRegroup: leaderShouldHoldForLag,
      groupAwaitingParty: leaderShouldWaitForParty,
      groupLaggingMembers: laggingAmbientMembers,
      groupLeaderDistance,
    }),
  };
}

function emptyGroupResult(): AmbientPlayerBotGroupTickResult {
  return {
    commands: [],
    pauseBrainDrive: false,
    runnerStatePatch: {
      groupDungeonId: '',
      groupObjectiveQuestId: '',
      groupObjectiveScope: '',
      groupLeaderName: '',
      groupTargetSize: 0,
      groupPartySize: 0,
      groupMode: '',
      groupNeedsRegroup: false,
      groupAwaitingParty: false,
      groupLaggingMembers: 0,
      groupLeaderDistance: 0,
    },
  };
}

function groupObjectiveMatchKey(
  objectiveId: string,
  objectiveQuestId?: string,
  objectiveDungeonId?: string,
): string {
  if (objectiveDungeonId) return `dungeon:${objectiveDungeonId}`;
  if (objectiveQuestId) return `quest:${objectiveQuestId}`;
  return `objective:${objectiveId}`;
}

function matchesGroupObjective(
  runnerState: Record<string, unknown>,
  objectiveMatchKey: string,
): boolean {
  const recordMatchKey = runnerStateObjectiveMatchKey(runnerState);
  return recordMatchKey === '' || recordMatchKey === objectiveMatchKey;
}

function parsePartyInfo(value: unknown): PartyInfo | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const party = value as PartyInfo;
  return Array.isArray(party.members) ? party : null;
}

function currentLeaderRecord(
  records: readonly AmbientPlayerBotRecord[],
  party: PartyInfo | null,
): AmbientPlayerBotRecord | null {
  if (!party) return null;
  const leaderPid = party.leader;
  return records.find((record) => record.characterId === leaderPid) ?? null;
}

function findPartyMember(
  party: PartyInfo,
  record: AmbientPlayerBotRecord,
): PartyMemberInfo | null {
  return party.members.find((member) => member.pid === record.characterId || member.name === record.characterName) ?? null;
}

function findPartyLeaderMember(party: PartyInfo): PartyMemberInfo | null {
  return party.members.find((member) => member.pid === party.leader) ?? null;
}

function collectVisibleAmbientPeers(
  liveState: AmbientPlayerBotLiveState,
  activeNames: ReadonlySet<string>,
  selfName: string,
): VisibleAmbientPeer[] {
  const peers: VisibleAmbientPeer[] = [];
  for (const entity of liveState.entities.values()) {
    if (entity.k !== 'player' || typeof entity.id !== 'number' || typeof entity.nm !== 'string') continue;
    if (entity.nm === selfName || !activeNames.has(entity.nm)) continue;
    peers.push({ entityId: entity.id, name: entity.nm });
  }
  peers.sort((a, b) => a.name.localeCompare(b.name));
  return peers;
}

function canIssue(
  state: AmbientPlayerBotGroupRuntimeState,
  key: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  if (!commandReady(state, key, nowMs, cooldownMs)) return false;
  state.lastCommandAtMs[key] = nowMs;
  return true;
}

function reserveCommandBatch(
  state: AmbientPlayerBotGroupRuntimeState,
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
  state: AmbientPlayerBotGroupRuntimeState,
  key: string,
  nowMs: number,
  cooldownMs: number,
): boolean {
  const lastAtMs = state.lastCommandAtMs[key] ?? Number.NEGATIVE_INFINITY;
  return nowMs - lastAtMs >= cooldownMs;
}

function readRunnerString(
  value: Record<string, unknown>,
  key: string,
): string {
  const field = value[key];
  return typeof field === 'string' ? field : '';
}

function runnerStateObjectiveMatchKey(
  runnerState: Record<string, unknown>,
): string {
  const dungeonId = readRunnerString(runnerState, 'objectiveDungeonId');
  if (dungeonId) return `dungeon:${dungeonId}`;
  const questId = readRunnerString(runnerState, 'objectiveQuestId');
  if (questId) return `quest:${questId}`;
  const objectiveId = readRunnerString(runnerState, 'objective');
  return objectiveId ? `objective:${objectiveId}` : '';
}

function readSelfDungeonId(value: Record<string, unknown>): string {
  return typeof value.dgn === 'string' ? value.dgn : '';
}

function readSelfTargetId(value: Record<string, unknown>): number | null {
  return typeof value.target === 'number' ? value.target : null;
}

interface AmbientPartyInviteDecision {
  fromPid: number;
  fromName: string;
  trusted: boolean;
}

function ambientPartyInviteDecision(
  events: readonly SimEvent[],
  activeNames: ReadonlySet<string>,
  assignedPlayerName: string,
): AmbientPartyInviteDecision | null {
  let untrusted: AmbientPartyInviteDecision | null = null;
  for (const event of events) {
    if (
      event.type !== 'partyInvite'
      || typeof event.fromName !== 'string'
      || typeof event.fromPid !== 'number'
    ) {
      continue;
    }
    const trusted = activeNames.has(event.fromName)
      || (assignedPlayerName !== '' && event.fromName === assignedPlayerName);
    const decision = { fromPid: event.fromPid, fromName: event.fromName, trusted };
    if (trusted) return decision;
    untrusted ??= decision;
  }
  return untrusted;
}

interface GroupRunnerStatePatchInput {
  objectiveDungeonId?: string;
  objectiveQuestId?: string;
  isOutdoorGroupedObjective: boolean;
  groupLeaderName: string;
  groupTargetSize: number;
  groupPartySize: number;
  groupMode: string;
  groupNeedsRegroup: boolean;
  groupAwaitingParty: boolean;
  groupLaggingMembers: number;
  groupLeaderDistance: number;
}

function groupRunnerStatePatch(input: GroupRunnerStatePatchInput): Record<string, unknown> {
  return {
    groupDungeonId: input.objectiveDungeonId ?? '',
    groupObjectiveQuestId: input.objectiveQuestId ?? '',
    groupObjectiveScope: input.objectiveDungeonId ? 'dungeon' : input.isOutdoorGroupedObjective ? 'outdoor' : '',
    groupLeaderName: input.groupLeaderName,
    groupTargetSize: input.groupTargetSize,
    groupPartySize: input.groupPartySize,
    groupMode: input.groupMode,
    groupNeedsRegroup: input.groupNeedsRegroup,
    groupAwaitingParty: input.groupAwaitingParty,
    groupLaggingMembers: input.groupLaggingMembers,
    groupLeaderDistance: input.groupLeaderDistance,
  };
}

function partyCombatTarget(
  liveState: AmbientPlayerBotLiveState,
  party: PartyInfo,
): { id: number } | null {
  const self = liveState.self;
  const selfId = typeof self?.id === 'number' ? self.id : null;
  const selfX = typeof self?.x === 'number' ? self.x : null;
  const selfZ = typeof self?.z === 'number' ? self.z : null;
  if (selfId === null || selfX === null || selfZ === null) return null;
  const partyMemberIds = new Set(party.members.map((member) => member.pid).filter((pid) => pid !== selfId));
  if (partyMemberIds.size === 0) return null;
  let best: { id: number; distance: number } | null = null;
  for (const entity of liveState.entities.values()) {
    if (entity.k !== 'mob' || entity.dead || !entity.h || typeof entity.id !== 'number') continue;
    if (typeof entity.aggro !== 'number' || !partyMemberIds.has(entity.aggro)) continue;
    if (typeof entity.x !== 'number' || typeof entity.z !== 'number') continue;
    const distance = distanceToPoint(selfX, selfZ, entity.x, entity.z);
    if (distance > GROUP_FOLLOW_MAX_RANGE || (best && distance >= best.distance)) continue;
    best = { id: entity.id, distance };
  }
  return best ? { id: best.id } : null;
}

function distanceToPoint(
  x1: number,
  z1: number,
  x2: number,
  z2: number,
): number {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dz * dz);
}

function distanceBetweenMembers(
  a: PartyMemberInfo,
  b: PartyMemberInfo,
): number {
  return distanceToPoint(a.x, a.z, b.x, b.z);
}

function memberInCombat(member: PartyMemberInfo): boolean {
  return member.inCombat === 1;
}

function countLaggingAmbientMembers(
  party: PartyInfo,
  leader: PartyMemberInfo,
  activeNames: ReadonlySet<string>,
): number {
  let count = 0;
  for (const member of party.members) {
    if (member.pid === leader.pid) continue;
    if (!activeNames.has(member.name) || member.dead) continue;
    if (distanceBetweenMembers(member, leader) > GROUP_REGROUP_RANGE) count++;
  }
  return count;
}
