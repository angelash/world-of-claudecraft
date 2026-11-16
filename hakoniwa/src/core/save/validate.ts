// validateWorld (release_engineering.md 5.5): after a load's migrations, the kernel checks
// the world's own structure (meta, random streams, id counters, command queues, AI
// requests, the event ring) and every system that exports `validateSlice` checks its
// slice. Any problem fails the load of that generation (5.6 level 2): nothing is written.
// The save layer reads systems by shape (SliceOwner), so any GameSystem fits; a system
// opts in by adding `validateSlice` (and `idFields` for the rename table) to its object.

import type { World } from '../world';
import { WORLD_VERSION } from '../world';
import type { IdField } from './renames';

/** A system's check of its own slice: the problems found, empty when it is sound. */
export type SliceValidator = (slice: unknown) => readonly string[];

/** What the save layer reads from a game system; its id is its slice name. */
export interface SliceOwner {
  readonly id: string;
  readonly validateSlice?: SliceValidator;
  /** where its slice keeps content ids, for the rename table (5.5) */
  readonly idFields?: readonly IdField[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isFlagValue = (v: unknown): boolean =>
  typeof v === 'boolean' || typeof v === 'string' || (typeof v === 'number' && Number.isFinite(v));
const AI_MODES = new Set(['off', 'external', 'replay']);

function checkCommands(v: unknown, at: string, out: string[]): void {
  if (!Array.isArray(v)) {
    out.push(`${at} is not an array`);
    return;
  }
  v.forEach((c, i) => {
    if (
      !isObj(c) ||
      typeof c.kind !== 'string' ||
      !isObj(c.source) ||
      typeof c.source.type !== 'string'
    ) {
      out.push(`${at}[${i}] is not a command`);
    }
  });
}

/** The kernel's own structure checks, then each owner's slice check. Empty when sound. */
export function validateWorld(world: unknown, owners: readonly SliceOwner[] = []): string[] {
  const out: string[] = [];
  if (!isObj(world)) return ['the world is not an object'];
  const w = world as Partial<Record<keyof World, unknown>>;
  const meta = w.meta;
  if (!isObj(meta)) out.push('meta is missing');
  else {
    if (meta.version !== WORLD_VERSION) out.push(`meta.version is ${String(meta.version)}`);
    if (!isInt(meta.seed, -0x80000000)) out.push('meta.seed is not an integer');
    if (!isInt(meta.tick)) out.push('meta.tick is not a tick');
    if (!isInt(meta.seq)) out.push('meta.seq is not a counter');
    if (!isObj(meta.flags)) out.push('meta.flags is missing');
    else {
      for (const [k, v] of Object.entries(meta.flags)) {
        if (!isFlagValue(v)) out.push(`flag ${k} has a ${typeof v} value`);
      }
    }
  }
  if (!isObj(w.rng)) out.push('rng is missing');
  else {
    for (const [k, v] of Object.entries(w.rng)) {
      if (!isObj(v) || !isInt(v.s, -0x80000000)) out.push(`rng ${k} is not a stream state`);
    }
  }
  if (!isObj(w.ids)) out.push('ids is missing');
  else {
    for (const [k, v] of Object.entries(w.ids)) {
      if (!isInt(v)) out.push(`ids ${k} is not a counter`);
    }
  }
  checkCommands(w.inbox, 'inbox', out);
  checkCommands(w.queue, 'queue', out);
  const ai = w.ai;
  if (!isObj(ai)) out.push('ai is missing');
  else {
    if (!AI_MODES.has(ai.mode as string)) out.push(`ai.mode is ${String(ai.mode)}`);
    if (!isInt(ai.nextId, 1)) out.push('ai.nextId is not a counter');
    if (!Array.isArray(ai.pending)) out.push('ai.pending is not an array');
    else {
      ai.pending.forEach((r, i) => {
        if (
          !isObj(r) ||
          typeof r.id !== 'string' ||
          !isInt(r.createdTick) ||
          !isInt(r.deadlineTick) ||
          !Array.isArray(r.fallback)
        ) {
          out.push(`ai.pending[${i}] is not a request`);
        }
      });
    }
  }
  if (!isObj(w.slices)) out.push('slices is missing');
  if (!Array.isArray(w.recent)) out.push('recent is not an array');
  else {
    w.recent.forEach((e, i) => {
      if (!isObj(e) || typeof e.kind !== 'string' || !isInt(e.tick) || !isInt(e.seq)) {
        out.push(`recent[${i}] is not an event`);
      }
    });
  }
  if (w.log !== undefined && !Array.isArray(w.log)) out.push('log is not an array');
  if (isObj(w.slices)) {
    for (const o of owners) {
      if (!o.validateSlice) continue;
      let problems: readonly string[];
      try {
        problems = o.validateSlice((w.slices as Record<string, unknown>)[o.id]);
      } catch (err) {
        problems = [`check threw: ${String((err as Error)?.message ?? err)}`];
      }
      for (const p of problems) out.push(`slices.${o.id}: ${p}`);
    }
  }
  return out;
}
