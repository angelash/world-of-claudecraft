// Key evaluation (钥, power_system.md 9.4) and event counting. Keys read only flags,
// the player's inventory and level (through the inventory and combat query surfaces),
// the visit record and the doors' own event counters.

import type { ContentMap, FlagValue } from '../../core/contracts';
import type { World } from '../../core/world';
import { xpProgress } from '../combat';
import { countItem } from '../inventory';
import { bondReached } from '../party/bond';
import { actIndex } from '../quests/conditions';
import type { DoorDef, KeyCond } from './types';

export interface KeyProgress {
  label: string;
  met: boolean;
  cur?: number;
  need?: number;
}

function flagMet(v: FlagValue | undefined, k: Extract<KeyCond, { type: 'flag' }>): boolean {
  if (k.equals !== undefined) return v === k.equals;
  // the act flag holds an act name; it compares by its index (act4 is 4)
  if (k.min !== undefined) {
    const n = typeof v === 'number' ? v : typeof v === 'string' ? actIndex(v) : Number.NaN;
    return !Number.isNaN(n) && n >= k.min;
  }
  return !!v;
}

/** Evaluate one key; `path` addresses its event counter. */
export function evalKey(world: World, door: DoorDef, k: KeyCond, path: string): KeyProgress {
  const flags = world.meta.flags;
  const playerId = world.slices.world.playerId;
  switch (k.type) {
    case 'flag':
      return { label: k.label, met: flagMet(flags[k.key], k) };
    case 'count': {
      const cur = world.slices.doors.counters[`${door.id}:${path}`] ?? 0;
      return { label: k.label, met: cur >= k.count, cur: Math.min(cur, k.count), need: k.count };
    }
    case 'item': {
      const need = k.count ?? 1;
      const cur = countItem(world, playerId, k.itemId);
      return { label: k.label, met: cur >= need, cur: Math.min(cur, need), need };
    }
    case 'level': {
      const lvl = xpProgress(world, playerId).level;
      return { label: k.label, met: lvl >= k.min, cur: Math.min(lvl, k.min), need: k.min };
    }
    case 'visit': {
      const key = k.location ? `loc:${k.mapId}/${k.location}` : `map:${k.mapId}`;
      return { label: k.label, met: !!world.slices.doors.visited[key] };
    }
    case 'door':
      return { label: k.label, met: world.slices.doors.doors[k.doorId]?.state === 'opened' };
    case 'bond':
      return { label: k.label, met: bondReached(world, k.companion, k.min) };
    case 'any': {
      const need = k.need ?? 1;
      let cur = 0;
      k.of.forEach((sub, i) => {
        if (evalKey(world, door, sub, `${path}.${i}`).met) cur++;
      });
      return { label: k.label, met: cur >= need, cur: Math.min(cur, need), need };
    }
  }
}

export function keyProgress(world: World, door: DoorDef): KeyProgress[] {
  return door.keys.map((k, i) => evalKey(world, door, k, String(i)));
}

export function keysMet(world: World, door: DoorDef): boolean {
  return keyProgress(world, door).every((p) => p.met);
}

/** Story act as a number: prologue 0, act1 to act6, epilogue 7 (default act 1). */
export function actNumber(v: FlagValue | undefined): number {
  const idx = actIndex(v);
  if (!Number.isNaN(idx)) return idx;
  const m = typeof v === 'string' ? /^act(\d)$/.exec(v) : null;
  return m ? Number(m[1]) : 1;
}

/**
 * Is the door hinted? Its hint flag door_hint.<id> always reveals it (Janu's clue tool);
 * otherwise a door of the current act or earlier shows once a reveal key (or, without
 * reveal keys, any of its own keys) is met, so later acts never leak early.
 */
export function revealed(world: World, door: DoorDef): boolean {
  if (world.meta.flags[`door_hint.${door.id}`]) return true;
  if (door.act > actNumber(world.meta.flags.act)) return false;
  if (door.reveal) return door.reveal.some((k, i) => evalKey(world, door, k, `r${i}`).met);
  return keyProgress(world, door).some((p) => p.met || (p.cur ?? 0) > 0);
}

function matches(k: Extract<KeyCond, { type: 'count' }>, data: Record<string, unknown>): boolean {
  for (const [f, v] of Object.entries(k.where ?? {})) if (data[f] !== v) return false;
  for (const [f, v] of Object.entries(k.atLeast ?? {})) {
    const got = data[f];
    if (typeof got !== 'number' || got < v) return false;
  }
  return true;
}

function walkCounts(
  door: DoorDef,
  keys: KeyCond[],
  prefix: string,
  visit: (k: Extract<KeyCond, { type: 'count' }>, path: string) => void,
): void {
  keys.forEach((k, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    if (k.type === 'count') visit(k, path);
    else if (k.type === 'any') walkCounts(door, k.of, path, visit);
  });
}

/** Event kinds any door counts (doors subscribes to exactly these). */
export function countedEvents(content: ContentMap): Set<string> {
  const out = new Set<string>();
  for (const door of content.doors ?? []) walkCounts(door, door.keys, '', (k) => out.add(k.event));
  return out;
}

/** Feed one event to the counters of every door still closed to the player. */
export function countEvent(
  world: World,
  content: ContentMap,
  kind: string,
  data: Record<string, unknown>,
): void {
  const slice = world.slices.doors;
  for (const door of content.doors ?? []) {
    const st = slice.doors[door.id]?.state;
    if (st === 'opened' || st === 'locked' || st === 'closed') continue;
    walkCounts(door, door.keys, '', (k, path) => {
      if (k.event !== kind || !matches(k, data)) return;
      const key = `${door.id}:${path}`;
      slice.counters[key] = (slice.counters[key] ?? 0) + 1;
    });
  }
}

/** Every visit key (map and location) any door asks for. */
export function visitTargets(content: ContentMap): { mapId: string; location?: string }[] {
  const out: { mapId: string; location?: string }[] = [];
  const walk = (keys: KeyCond[]) => {
    for (const k of keys) {
      if (k.type === 'visit') out.push({ mapId: k.mapId, location: k.location });
      else if (k.type === 'any') walk(k.of);
    }
  };
  for (const door of content.doors ?? []) {
    walk(door.keys);
    if (door.reveal) walk(door.reveal);
  }
  return out;
}
