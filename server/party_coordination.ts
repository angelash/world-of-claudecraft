import type { PlayerClass } from '../src/sim/types';
import type { PartyInfo, PartyMemberInfo } from '../src/world_api';

export interface PartyTravelGoal {
  target: { x: number; z: number };
  arrivalRange: number;
  goalKey: string;
}

export interface PartyCombatTarget {
  id: number;
  x: number;
  z: number;
  distance: number;
}

export function distanceBetweenPartyMembers(a: PartyMemberInfo, b: PartyMemberInfo): number {
  return distanceToPoint(a.x, a.z, b.x, b.z);
}

export function findPartyCombatTarget(input: {
  liveSelf: Record<string, unknown>;
  entities: Iterable<Record<string, unknown>>;
  party: PartyInfo;
  maxDistance: number;
}): PartyCombatTarget | null {
  const selfId = readNumber(input.liveSelf.id);
  const selfX = readNumber(input.liveSelf.x);
  const selfZ = readNumber(input.liveSelf.z);
  if (selfId === null || selfX === null || selfZ === null) return null;
  const partyMemberIds = new Set(input.party.members.map((member) => member.pid));
  if (partyMemberIds.size === 0) partyMemberIds.add(selfId);
  const mobs = new Map<number, PartyCombatTarget & { aggroTargetId: number | null }>();
  for (const entity of input.entities) {
    if (!isAttackableMob(entity)) continue;
    const id = readNumber(entity.id);
    const x = readNumber(entity.x);
    const z = readNumber(entity.z);
    const aggro = readNumber(entity.aggro);
    if (id === null || x === null || z === null) continue;
    const distance = distanceToPoint(selfX, selfZ, x, z);
    if (distance > input.maxDistance) continue;
    mobs.set(id, { id, x, z, distance, aggroTargetId: aggro });
  }
  if (mobs.size === 0) return null;

  const memberByPid = new Map(input.party.members.map((member) => [member.pid, member]));
  const threatTarget =
    [...mobs.values()]
      .filter((mob) => mob.aggroTargetId !== null && partyMemberIds.has(mob.aggroTargetId))
      .sort((a, b) => {
        const aMember = memberByPid.get(a.aggroTargetId ?? -1);
        const bMember = memberByPid.get(b.aggroTargetId ?? -1);
        const healthDelta = partyMemberHealthRatio(aMember) - partyMemberHealthRatio(bMember);
        if (Math.abs(healthDelta) > 0.001) return healthDelta;
        const aLeader = a.aggroTargetId === input.party.leader ? 1 : 0;
        const bLeader = b.aggroTargetId === input.party.leader ? 1 : 0;
        if (aLeader !== bLeader) return bLeader - aLeader;
        return a.distance - b.distance || a.id - b.id;
      })[0] ?? null;
  if (threatTarget) return combatTarget(threatTarget);

  const explicitTarget = explicitPartyTarget(input.party, mobs);
  return explicitTarget ? combatTarget(explicitTarget) : null;
}

export function partyAssistArrivalRange(classId: PlayerClass): number {
  switch (classId) {
    case 'warrior':
    case 'rogue':
    case 'paladin':
      return 4.5;
    case 'hunter':
      return 18;
    case 'priest':
    case 'mage':
    case 'warlock':
      return 16;
    case 'druid':
    case 'shaman':
      return 12;
    default:
      return 6;
  }
}

export function travelGoalToPartyMember(
  member: PartyMemberInfo,
  arrivalRange: number,
  goalPrefix = 'leader',
): PartyTravelGoal {
  return {
    target: { x: member.x, z: member.z },
    arrivalRange,
    goalKey: `${goalPrefix}:${member.pid}:${Math.round(member.x)}:${Math.round(member.z)}`,
  };
}

export function travelGoalToPartyTarget(
  target: PartyCombatTarget,
  arrivalRange: number,
): PartyTravelGoal {
  return {
    target: { x: target.x, z: target.z },
    arrivalRange,
    goalKey: `party-target:${target.id}:${Math.round(target.x)}:${Math.round(target.z)}`,
  };
}

function distanceToPoint(x1: number, z1: number, x2: number, z2: number): number {
  const dx = x1 - x2;
  const dz = z1 - z2;
  return Math.sqrt(dx * dx + dz * dz);
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function partyMemberHealthRatio(member: PartyMemberInfo | undefined): number {
  if (!member || member.mhp <= 0) return 1;
  return member.hp / member.mhp;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

function explicitPartyTarget(
  party: PartyInfo,
  mobs: ReadonlyMap<number, PartyCombatTarget & { aggroTargetId: number | null }>,
): (PartyCombatTarget & { aggroTargetId: number | null }) | null {
  const leader = party.members.find((member) => member.pid === party.leader) ?? null;
  const leaderTargetId = leader?.targetId ?? null;
  if (leaderTargetId !== null) {
    const target = mobs.get(leaderTargetId);
    if (target) return target;
  }
  const votedTargets = new Map<
    number,
    { target: PartyCombatTarget & { aggroTargetId: number | null }; votes: number }
  >();
  for (const member of party.members) {
    if (member.dead) continue;
    const targetId = member.targetId ?? null;
    if (targetId === null) continue;
    const target = mobs.get(targetId);
    if (!target) continue;
    const current = votedTargets.get(targetId) ?? { target, votes: 0 };
    current.votes++;
    votedTargets.set(targetId, current);
  }
  return (
    [...votedTargets.values()].sort(
      (a, b) =>
        b.votes - a.votes || a.target.distance - b.target.distance || a.target.id - b.target.id,
    )[0]?.target ?? null
  );
}

function combatTarget(
  target: PartyCombatTarget & { aggroTargetId: number | null },
): PartyCombatTarget {
  return {
    id: target.id,
    x: target.x,
    z: target.z,
    distance: target.distance,
  };
}

function isAttackableMob(entity: Record<string, unknown>): boolean {
  if (readString(entity.k) !== 'mob' || readBoolean(entity.dead)) return false;
  const hp = readNumber(entity.hp);
  if (hp !== null && hp <= 0) return false;
  return readHostileSignal(entity.h) || readNumber(entity.aggro) !== null;
}

function readHostileSignal(value: unknown): boolean {
  if (readBoolean(value)) return true;
  const numeric = readNumber(value);
  return numeric !== null && numeric > 0;
}
