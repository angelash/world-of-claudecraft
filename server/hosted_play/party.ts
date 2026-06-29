import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { SimEvent } from '../../src/sim/types';
import type { HostedPlayGroupMode, HostedPlayPartyMode } from './types';

const HOSTED_PLAY_ACCEPT_COOLDOWN_MS = 1_500;
const HOSTED_PLAY_ASSIST_COOLDOWN_MS = 1_200;
const HOSTED_PLAY_FOLLOW_COOLDOWN_MS = 6_000;
const HOSTED_PLAY_REGROUP_RANGE = 28;
const HOSTED_PLAY_FOLLOW_START_RANGE = 4;
const HOSTED_PLAY_FOLLOW_MAX_RANGE = 60;

type HostedPlayCommand = Record<string, unknown>;

export interface HostedPlayPartyState {
  lastAcceptCommandAtMs: number | null;
  lastAssistCommandAtMs: number | null;
  lastFollowCommandAtMs: number | null;
}

export interface HostedPlayPartyTickInput {
  liveSelf: Record<string, unknown>;
  entities: Iterable<Record<string, unknown>>;
  recentEvents: readonly SimEvent[];
  partyMode: HostedPlayPartyMode;
  nowMs: number;
}

export interface HostedPlayPartyTickResult {
  commands: readonly HostedPlayCommand[];
  pauseBrainDrive: boolean;
  groupMode: HostedPlayGroupMode;
  groupLeaderName: string;
  groupLeaderDistance: number;
}

export function createHostedPlayPartyState(): HostedPlayPartyState {
  return {
    lastAcceptCommandAtMs: null,
    lastAssistCommandAtMs: null,
    lastFollowCommandAtMs: null,
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

  if (!party || input.partyMode !== 'follow_leader' || party.members.length < 2) {
    return idlePartyResult();
  }

  const selfMember = party.members.find((member) => member.pid === readSelfId(input.liveSelf)) ?? null;
  const leaderMember = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!selfMember || !leaderMember) return idlePartyResult();

  const leaderDistance = distanceBetweenMembers(selfMember, leaderMember);
  const groupLeaderName = leaderMember.name;
  const assistTarget = partyCombatTarget(input.liveSelf, input.entities, party);

  if (
    assistTarget
    && !selfMember.dead
    && !selfMember.inCombat
    && readSelfTargetId(input.liveSelf) !== assistTarget.id
    && canIssueAssist(input, state)
  ) {
    return {
      commands: [{ cmd: 'target', id: assistTarget.id }],
      pauseBrainDrive: true,
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
      && distanceBetweenMembers(member, selfMember) > HOSTED_PLAY_REGROUP_RANGE)
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

function distanceBetweenMembers(
  a: PartyMemberInfo,
  b: PartyMemberInfo,
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
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

function partyCombatTarget(
  liveSelf: Record<string, unknown>,
  entities: Iterable<Record<string, unknown>>,
  party: PartyInfo,
): { id: number } | null {
  const selfId = readSelfId(liveSelf);
  const selfX = typeof liveSelf.x === 'number' ? liveSelf.x : null;
  const selfZ = typeof liveSelf.z === 'number' ? liveSelf.z : null;
  if (selfId < 0 || selfX === null || selfZ === null) return null;
  const partyMemberIds = new Set(party.members.map((member) => member.pid).filter((pid) => pid !== selfId));
  if (partyMemberIds.size === 0) return null;
  let best: { id: number; distance: number } | null = null;
  for (const entity of entities) {
    if (entity.k !== 'mob' || entity.dead || !entity.h || typeof entity.id !== 'number') continue;
    if (typeof entity.aggro !== 'number' || !partyMemberIds.has(entity.aggro)) continue;
    if (typeof entity.x !== 'number' || typeof entity.z !== 'number') continue;
    const dx = entity.x - selfX;
    const dz = entity.z - selfZ;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > HOSTED_PLAY_FOLLOW_MAX_RANGE || (best && distance >= best.distance)) continue;
    best = { id: entity.id, distance };
  }
  return best ? { id: best.id } : null;
}
