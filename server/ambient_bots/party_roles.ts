import type { PlayerClass } from '../../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../../src/world_api';
import type { AmbientPlayerBotLiveState } from './ws_client';

export type AmbientPartyCombatRole = 'tank' | 'healer' | 'dps';

export interface AmbientPartyRoleAssignment {
  pid: number;
  name: string;
  classId: PlayerClass;
  combatRole: AmbientPartyCombatRole;
  dutyLabel: string;
  shortLabel: string;
  isLeader: boolean;
}

export interface AmbientPartyRolePlan {
  key: string;
  leaderPid: number;
  leaderName: string;
  tankPid: number | null;
  tankName: string;
  healerPid: number | null;
  healerName: string;
  focusCallerName: string;
  assignments: readonly AmbientPartyRoleAssignment[];
  compositionSummary: string;
}

interface CandidateMember {
  member: PartyMemberInfo;
  auraKinds: ReadonlySet<string>;
}

export function planAmbientPartyRoles(input: {
  party: PartyInfo;
  liveState: AmbientPlayerBotLiveState;
  objectiveId?: string;
  objectiveQuestId?: string;
  objectiveDungeonId?: string;
  objectiveLabel?: string;
}): AmbientPartyRolePlan {
  const leaderPid = input.party.leader;
  const leader = input.party.members.find((member) => member.pid === leaderPid) ?? input.party.members[0];
  const members = input.party.members.map((member) => ({
    member,
    auraKinds: readVisibleAuraKinds(input.liveState, member.pid),
  }));
  const tank = selectTank(members, leaderPid);
  const healer = selectHealer(members, tank?.member.pid ?? null, leaderPid);
  const assignments = members.map((candidate) =>
    assignmentForCandidate(candidate, leaderPid, tank?.member.pid ?? null, healer?.member.pid ?? null),
  );
  const keyPayload = {
    objectiveId: input.objectiveId ?? '',
    objectiveQuestId: input.objectiveQuestId ?? '',
    objectiveDungeonId: input.objectiveDungeonId ?? '',
    objectiveLabel: input.objectiveLabel ?? '',
    leaderPid,
    members: assignments.map((assignment) => ({
      pid: assignment.pid,
      cls: assignment.classId,
      role: assignment.combatRole,
      duty: assignment.shortLabel,
    })),
  };
  return {
    key: `party-plan|${JSON.stringify(keyPayload)}`,
    leaderPid,
    leaderName: leader?.name ?? '',
    tankPid: tank?.member.pid ?? null,
    tankName: tank?.member.name ?? '',
    healerPid: healer?.member.pid ?? null,
    healerName: healer?.member.name ?? '',
    focusCallerName: tank?.member.name ?? leader?.name ?? assignments[0]?.name ?? '',
    assignments,
    compositionSummary: assignments
      .map((assignment) => `${assignment.name} ${assignment.shortLabel}`)
      .join(', '),
  };
}

export function ambientPartyRoleAssignmentForPid(
  plan: AmbientPartyRolePlan,
  pid: number,
): AmbientPartyRoleAssignment | null {
  return plan.assignments.find((assignment) => assignment.pid === pid) ?? null;
}

function assignmentForCandidate(
  candidate: CandidateMember,
  leaderPid: number,
  tankPid: number | null,
  healerPid: number | null,
): AmbientPartyRoleAssignment {
  const isLeader = candidate.member.pid === leaderPid;
  if (tankPid !== null && candidate.member.pid === tankPid) {
    return {
      pid: candidate.member.pid,
      name: candidate.member.name,
      classId: candidate.member.cls,
      combatRole: 'tank',
      dutyLabel: tankDutyLabel(candidate.member.cls, candidate.auraKinds),
      shortLabel: 'tanks',
      isLeader,
    };
  }
  if (healerPid !== null && candidate.member.pid === healerPid) {
    return {
      pid: candidate.member.pid,
      name: candidate.member.name,
      classId: candidate.member.cls,
      combatRole: 'healer',
      dutyLabel: healerDutyLabel(candidate.member.cls),
      shortLabel: 'heals',
      isLeader,
    };
  }
  return {
    pid: candidate.member.pid,
    name: candidate.member.name,
    classId: candidate.member.cls,
    combatRole: 'dps',
    dutyLabel: damageDutyLabel(candidate.member.cls),
    shortLabel: supportShortLabel(candidate.member.cls),
    isLeader,
  };
}

function selectTank(
  members: readonly CandidateMember[],
  leaderPid: number,
): CandidateMember | null {
  const ordered = [...members].sort((a, b) => {
    const delta = tankPriority(a, leaderPid) - tankPriority(b, leaderPid);
    return delta !== 0 ? delta : a.member.pid - b.member.pid;
  });
  return ordered[0] ?? null;
}

function selectHealer(
  members: readonly CandidateMember[],
  tankPid: number | null,
  leaderPid: number,
): CandidateMember | null {
  const ordered = [...members]
    .filter((member) => healerPriority(member, leaderPid) < 9)
    .sort((a, b) => {
      const delta = healerPriority(a, leaderPid) - healerPriority(b, leaderPid);
      return delta !== 0 ? delta : a.member.pid - b.member.pid;
    });
  if (ordered.length === 0) return null;
  const nonTank = ordered.find((member) => member.member.pid !== tankPid);
  return nonTank ?? ordered[0];
}

function tankPriority(
  member: CandidateMember,
  leaderPid: number,
): number {
  if (member.member.cls === 'warrior') return 0;
  if (member.member.cls === 'druid' && member.auraKinds.has('form_bear')) return 1;
  if (member.member.cls === 'paladin') return 2;
  if (member.member.pid === leaderPid) return 3;
  return 4;
}

function healerPriority(
  member: CandidateMember,
  leaderPid: number,
): number {
  switch (member.member.cls) {
    case 'priest':
      return 0;
    case 'shaman':
      return 1;
    case 'druid':
      return member.auraKinds.has('form_bear') ? 6 : 2;
    case 'paladin':
      return 3;
    default:
      return member.member.pid === leaderPid ? 8 : 9;
  }
}

function tankDutyLabel(
  classId: PlayerClass,
  auraKinds: ReadonlySet<string>,
): string {
  if (classId === 'druid' && auraKinds.has('form_bear')) {
    return 'take point, hold threat, and peel loose mobs';
  }
  if (classId === 'paladin') {
    return 'lead the pull and keep loose mobs off the backline';
  }
  return 'take point, set the pace, and keep threat stable';
}

function healerDutyLabel(classId: PlayerClass): string {
  switch (classId) {
    case 'paladin':
      return 'keep the frontline topped and cover emergency saves';
    case 'shaman':
      return 'keep heals rolling and stabilize damage spikes';
    case 'druid':
      return 'cover steady heals and keep the group safe while moving';
    default:
      return 'keep the tank topped and patch danger fast';
  }
}

function damageDutyLabel(classId: PlayerClass): string {
  switch (classId) {
    case 'rogue':
      return 'collapse on focus and peel loose mobs fast';
    case 'hunter':
      return 'stay on focus and clean up runners from range';
    case 'mage':
    case 'warlock':
      return 'burn the focus target and help lock down strays';
    case 'priest':
    case 'paladin':
    case 'shaman':
    case 'druid':
      return 'keep buffs up, help on focus, and cover danger when needed';
    default:
      return 'stay on the called target and clean up loose mobs';
  }
}

function supportShortLabel(classId: PlayerClass): string {
  switch (classId) {
    case 'priest':
    case 'paladin':
    case 'shaman':
    case 'druid':
      return 'supports';
    default:
      return 'follows focus';
  }
}

function readVisibleAuraKinds(
  liveState: AmbientPlayerBotLiveState,
  pid: number,
): ReadonlySet<string> {
  const raw = liveState.self?.id === pid
    ? liveState.self?.auras
    : liveState.entities.get(pid)?.auras;
  if (!Array.isArray(raw)) return new Set();
  const kinds = new Set<string>();
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const kind = typeof (entry as Record<string, unknown>).kind === 'string'
      ? String((entry as Record<string, unknown>).kind)
      : '';
    if (kind) kinds.add(kind);
  }
  return kinds;
}
