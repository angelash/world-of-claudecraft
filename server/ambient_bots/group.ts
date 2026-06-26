import { DUNGEONS } from '../../src/sim/data';
import type { SimEvent } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotLiveState } from './ws_client';

const GROUP_INVITE_COOLDOWN_MS = 4_000;
const GROUP_ACCEPT_COOLDOWN_MS = 1_500;
const GROUP_ENTER_COOLDOWN_MS = 4_000;
const GROUP_FOLLOW_COOLDOWN_MS = 6_000;
const GROUP_DOOR_RANGE = 7.5;
const GROUP_REGROUP_RANGE = 24;
const GROUP_FOLLOW_START_RANGE = 10;
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

  const activeBots = input.directory
    .filter((record) =>
      record.assignedClusterId === input.bot.assignedClusterId
      && record.lifecycleStatus === 'online'
      && matchesGroupObjective(record.runnerState, objectiveMatchKey),
    )
    .sort((a, b) => a.botId.localeCompare(b.botId));
  if (activeBots.length === 0) return emptyGroupResult();

  const activeNames = new Set(activeBots.map((record) => record.characterName).filter(Boolean));
  const visiblePeers = collectVisibleAmbientPeers(input.liveState, activeNames, input.bot.characterName);
  const party = parsePartyInfo(self.party);
  const leader = currentLeaderRecord(activeBots, party) ?? activeBots[0] ?? input.bot;
  const leaderMember = party ? findPartyMember(party, leader) : null;
  const selfMember = party ? findPartyMember(party, input.bot) : null;
  const partySize = party?.members.length ?? 1;
  const targetPartySize = Math.max(
    1,
    Math.min(
      input.objectiveSuggestedPartySize,
      Math.max(activeBots.length, visiblePeers.length + 1, partySize),
    ),
  );
  const commands: GroupCommand[] = [];
  let pauseBrainDrive = false;

  const inviteFromName = !party
    ? input.recentEvents
        .map((event) => ambientInviteFromName(event, activeNames))
        .find((name): name is string => !!name)
    : null;
  if (inviteFromName && canIssue(state, `accept:${inviteFromName}`, input.nowMs, GROUP_ACCEPT_COOLDOWN_MS)) {
    commands.push({ cmd: 'paccept' });
  }

  const partyMemberNames = new Set(party?.members.map((member) => member.name) ?? [input.bot.characterName]);
  const ungroupedVisiblePeers = visiblePeers.filter((peer) => !partyMemberNames.has(peer.name));

  if (leader.botId === input.bot.botId) {
    const nextInvite = ungroupedVisiblePeers[0];
    if (
      nextInvite
      && partySize < targetPartySize
      && canIssue(state, `invite:${nextInvite.name}`, input.nowMs, GROUP_INVITE_COOLDOWN_MS)
    ) {
      commands.push({ cmd: 'pinvite', id: nextInvite.entityId });
    }
  }

  const inObjectiveDungeon = !!input.objectiveDungeonId && readSelfDungeonId(self) === input.objectiveDungeonId;
  const groupTravelActive = inObjectiveDungeon || isOutdoorGroupedObjective;
  const laggingAmbientMembers = leaderMember && party
    ? countLaggingAmbientMembers(party, leaderMember, activeNames)
    : 0;
  const leaderShouldWaitForParty = isOutdoorGroupedObjective
    && leader.botId === input.bot.botId
    && partySize < targetPartySize
    && ungroupedVisiblePeers.length > 0;
  const leaderShouldHoldForLag = groupTravelActive
    && leader.botId === input.bot.botId
    && !!leaderMember
    && !memberInCombat(leaderMember)
    && laggingAmbientMembers > 0;
  const leaderShouldHold = leaderShouldWaitForParty || leaderShouldHoldForLag;
  if (leaderShouldHold) pauseBrainDrive = true;

  const leaderDistance = selfMember && leaderMember
    ? distanceBetweenMembers(selfMember, leaderMember)
    : null;
  const followerShouldTrackLeader = groupTravelActive
    && leader.botId !== input.bot.botId
    && !!selfMember
    && !!leaderMember
    && !memberInCombat(selfMember)
    && !memberInCombat(leaderMember)
    && !selfMember.dead
    && !leaderMember.dead
    && leaderDistance !== null
    && leaderDistance > GROUP_FOLLOW_START_RANGE
    && leaderDistance <= GROUP_FOLLOW_MAX_RANGE;
  if (followerShouldTrackLeader) {
    pauseBrainDrive = true;
    if (
      leader.characterName
      && canIssue(state, `follow:${leader.characterName}`, input.nowMs, GROUP_FOLLOW_COOLDOWN_MS)
    ) {
      commands.push({ cmd: 'chat', text: `/follow ${leader.characterName}` });
    }
  }

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
    runnerStatePatch: {
      groupDungeonId: input.objectiveDungeonId ?? '',
      groupObjectiveQuestId: input.objectiveQuestId ?? '',
      groupObjectiveScope: input.objectiveDungeonId ? 'dungeon' : isOutdoorGroupedObjective ? 'outdoor' : '',
      groupLeaderName: leader.characterName,
      groupTargetSize: targetPartySize,
      groupPartySize: partySize,
      groupMode: leaderShouldWaitForParty
        ? 'wait_party'
        : leaderShouldHoldForLag
        ? 'hold_regroup'
        : followerShouldTrackLeader
          ? 'follow_leader'
          : 'brain',
      groupNeedsRegroup: leaderShouldHoldForLag,
      groupAwaitingParty: leaderShouldWaitForParty,
      groupLaggingMembers: laggingAmbientMembers,
      groupLeaderDistance: leaderDistance ?? 0,
    },
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
  const lastAtMs = state.lastCommandAtMs[key] ?? Number.NEGATIVE_INFINITY;
  if (nowMs - lastAtMs < cooldownMs) return false;
  state.lastCommandAtMs[key] = nowMs;
  return true;
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

function ambientInviteFromName(
  event: SimEvent,
  activeNames: ReadonlySet<string>,
): string | null {
  if (event.type !== 'partyInvite' || !('fromName' in event) || typeof event.fromName !== 'string') {
    return null;
  }
  return activeNames.has(event.fromName) ? event.fromName : null;
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
