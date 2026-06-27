import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { HostedPlayGroupMode, HostedPlayPartyMode } from './types';

const HOSTED_PLAY_FOLLOW_COOLDOWN_MS = 6_000;
const HOSTED_PLAY_REGROUP_RANGE = 28;
const HOSTED_PLAY_FOLLOW_START_RANGE = 10;
const HOSTED_PLAY_FOLLOW_MAX_RANGE = 60;

type HostedPlayCommand = Record<string, unknown>;

export interface HostedPlayPartyState {
  lastFollowCommandAtMs: number | null;
}

export interface HostedPlayPartyTickInput {
  liveSelf: Record<string, unknown>;
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
    lastFollowCommandAtMs: null,
  };
}

export function tickHostedPlayPartyCoordinator(
  input: HostedPlayPartyTickInput,
  state: HostedPlayPartyState,
): HostedPlayPartyTickResult {
  const party = parsePartyInfo(input.liveSelf.party);
  if (!party || input.partyMode !== 'follow_leader' || party.members.length < 2) {
    return idlePartyResult();
  }

  const selfMember = party.members.find((member) => member.pid === readSelfId(input.liveSelf)) ?? null;
  const leaderMember = party.members.find((member) => member.pid === party.leader) ?? null;
  if (!selfMember || !leaderMember) return idlePartyResult();

  const leaderDistance = distanceBetweenMembers(selfMember, leaderMember);
  const groupLeaderName = leaderMember.name;

  if (
    selfMember.pid !== leaderMember.pid
    && !selfMember.dead
    && !leaderMember.dead
    && !selfMember.inCombat
    && !leaderMember.inCombat
    && leaderDistance > HOSTED_PLAY_FOLLOW_START_RANGE
    && leaderDistance <= HOSTED_PLAY_FOLLOW_MAX_RANGE
  ) {
    const commands: HostedPlayCommand[] = [];
    if (
      groupLeaderName
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

function distanceBetweenMembers(
  a: PartyMemberInfo,
  b: PartyMemberInfo,
): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}
