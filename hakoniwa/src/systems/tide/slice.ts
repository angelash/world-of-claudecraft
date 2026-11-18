// The tide slice: creation, the load-time upgrade and the save check (release_engineering.md
// 5.5). A save from before this system has no slice and gets an empty one on first use; a
// night that began before the save resumes from its phase and its next due tick.

import type { IdField } from '../../core/save/renames';
import type { World } from '../../core/world';
import type { NightState, TideSlice } from './types';

/** The slice layout this build writes. */
export const TIDE_SLICE_VERSION = 1;

/** "Nothing due" (a finite number, so the state stays JSON). */
export const NEVER = Number.MAX_SAFE_INTEGER;

export function emptyTideSlice(): TideSlice {
  return { version: TIDE_SLICE_VERSION, night: null, done: [], cooldown: {}, pendingChildren: [] };
}

/** The slice for writing, created on first use (a save from before this system). */
export function tideSlice(world: World): TideSlice {
  const w = world as World & { slices: { tide?: TideSlice } };
  if (!w.slices.tide) w.slices.tide = emptyTideSlice();
  const s = w.slices.tide;
  if (s.version < TIDE_SLICE_VERSION) s.version = TIDE_SLICE_VERSION;
  // a night saved before the skip record existed
  if (s.night && !s.night.skipped) s.night.skipped = {};
  return s;
}

/** The slice for reading, or undefined when the system never ran (never creates it). */
export function readTide(world: { slices: object }): TideSlice | undefined {
  return (world.slices as { tide?: TideSlice }).tide;
}

/** A fresh night state. */
export function newNight(id: string, tick: number): NightState {
  return {
    id,
    start: tick,
    phase: 0,
    phaseTick: tick,
    next: tick,
    dirty: false,
    picks: {},
    chosen: {},
    samples: {},
    skipped: {},
    playerLine: {},
    results: [],
    dead: [],
    injured: [],
    extraDeaths: 0,
    buildings: [],
    escalated: false,
    witnesses: [],
    ended: false,
  };
}

/** Where the slice keeps content ids, for the rename table (5.5 `idFields`). */
export const TIDE_ID_FIELDS: readonly IdField[] = [
  { path: 'night.dead.*.npc', kind: 'npc' },
  { path: 'night.injured.*.npc', kind: 'npc' },
  { path: 'night.witnesses.*', kind: 'npc' },
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isStrings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string');

function nightProblems(n: unknown, out: string[]): void {
  if (n === null) return;
  if (!isObj(n)) {
    out.push('tide.night is not an object');
    return;
  }
  if (typeof n.id !== 'string') out.push('tide.night.id is not a string');
  for (const k of ['start', 'phase', 'phaseTick', 'next'] as const)
    if (!isInt(n[k], 0)) out.push(`tide.night.${k} is not a tick or index`);
  for (const k of ['picks', 'chosen', 'samples', 'playerLine'] as const)
    if (!isObj(n[k])) out.push(`tide.night.${k} is not a map`);
  if (n.skipped !== undefined && !isObj(n.skipped)) out.push('tide.night.skipped is not a map');
  if (n.sampledAt !== undefined && !isInt(n.sampledAt, 0))
    out.push('tide.night.sampledAt is not a tick');
  for (const k of ['results', 'dead', 'injured'] as const)
    if (!Array.isArray(n[k])) out.push(`tide.night.${k} is not a list`);
  if (!isStrings(n.buildings)) out.push('tide.night.buildings is not a list of ids');
  if (!isStrings(n.witnesses)) out.push('tide.night.witnesses is not a list of ids');
  if (typeof n.ended !== 'boolean') out.push('tide.night.ended is not a boolean');
}

/** The save check of the slice: the problems found, empty when it is sound. */
export function validateTideSlice(slice: unknown): string[] {
  // a save from before the tide system: the slice is created on first use
  if (slice === undefined) return [];
  const out: string[] = [];
  if (!isObj(slice)) return ['tide slice is not an object'];
  if (!isInt(slice.version, 1)) out.push('tide.version is not a layout version');
  else if (slice.version > TIDE_SLICE_VERSION)
    out.push(`tide.version ${slice.version} is newer than this build (${TIDE_SLICE_VERSION})`);
  if (!isStrings(slice.done)) out.push('tide.done is not a list of ids');
  if (!isObj(slice.cooldown)) out.push('tide.cooldown is not a map');
  if (!isStrings(slice.pendingChildren)) out.push('tide.pendingChildren is not a list');
  nightProblems(slice.night, out);
  return out;
}
