// The NPC brain's saved state (builtin_ai.md 18: only what cannot be recomputed): created
// on first use for a named NPC, so worlds saved before the brain gain it lazily. Also the
// staggered evaluation beat (builtin_ai.md 1.5: (tick + hash(id)) % period == 0). Pure.

import { BEAT_L1, BEAT_L2 } from '../constants';
import type { NpcBrainState, NpcState } from '../types';

export function newBrain(): NpcBrainState {
  return {
    layer: 'schedule',
    current: '',
    needLatch: false,
    emergencyUntil: 0,
    used: {},
    bt: {},
    pursued: {},
    approach: { day: -1, stopWeek: -1, ignored: 0, pending: null, spent: [] },
    opener: null,
    recent: {},
    offender: '',
    dayLog: { day: -1, hours: 0, off: 0 },
    barked: {},
    quarrel: null,
    spokeTick: -1,
  };
}

/** The brain of a named NPC (created on first use); residents have none. */
export function ensureBrain(st: NpcState): NpcBrainState {
  if (!st.brain) st.brain = newBrain();
  return st.brain;
}

const hashCache = new Map<string, number>();

/** FNV-1a of an id: the actor's fixed offset in the staggered beats (pure, cached). */
export function hashId(id: string): number {
  const hit = hashCache.get(id);
  if (hit !== undefined) return hit;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const out = h >>> 0;
  hashCache.set(id, out);
  return out;
}

const idCache = new WeakMap<object, string[]>();

/**
 * Every NPC id in sorted order (the deterministic iteration order), cached per npcs record:
 * people are never removed from it (they are marked gone), so the list only changes when
 * one is added. Callers must not mutate the list.
 */
export function sortedNpcIds(npcs: Record<string, unknown>): readonly string[] {
  let ids = idCache.get(npcs);
  const n = Object.keys(npcs).length;
  if (!ids || ids.length !== n) {
    ids = Object.keys(npcs).sort();
    idCache.set(npcs, ids);
  }
  return ids;
}

/** The evaluation period of a tier (L1 10 game minutes, L2 30; L3 runs on the hour). */
export function beatPeriod(tier: number): number {
  return tier === 1 ? BEAT_L1 : tier === 2 ? BEAT_L2 : 0;
}

/** Whether this tick is the actor's staggered beat. */
export function onBeat(tick: number, id: string, period: number): boolean {
  return period > 0 && (tick + (hashId(id) % period)) % period === 0;
}

/** Note a happening the mood reads (threat, insulted, gift, ...). */
export function noteRecent(st: NpcState, kind: string, tick: number): void {
  ensureBrain(st).recent[kind] = tick;
}

/** Ticks since a happening, or Infinity when it never happened. */
export function since(st: NpcState, kind: string, tick: number): number {
  const t = st.brain?.recent[kind];
  return t === undefined ? Number.POSITIVE_INFINITY : tick - t;
}
