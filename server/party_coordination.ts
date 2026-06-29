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

export function distanceBetweenPartyMembers(
  a: PartyMemberInfo,
  b: PartyMemberInfo,
): number {
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
  const partyMemberIds = new Set(input.party.members.map((member) => member.pid).filter((pid) => pid !== selfId));
  if (partyMemberIds.size === 0) return null;
  let best: PartyCombatTarget | null = null;
  for (const entity of input.entities) {
    if (readString(entity.k) !== 'mob' || readBoolean(entity.dead) || !hasPositiveHealth(entity.h)) continue;
    const id = readNumber(entity.id);
    const x = readNumber(entity.x);
    const z = readNumber(entity.z);
    const aggro = readNumber(entity.aggro);
    if (id === null || x === null || z === null || aggro === null || !partyMemberIds.has(aggro)) continue;
    const distance = distanceToPoint(selfX, selfZ, x, z);
    if (distance > input.maxDistance || (best && distance >= best.distance)) continue;
    best = { id, x, z, distance };
  }
  return best;
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

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function readString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoolean(value: unknown): boolean {
  return value === true || value === 1;
}

function hasPositiveHealth(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
