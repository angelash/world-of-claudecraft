// The dungeons slice: creation, the load-time upgrade and the save check
// (release_engineering.md 5.5). The slice carries its own layout version: a save from before
// this system has no slice and gets an empty one on first use (instances and nests are made
// from their records when first touched, so they start as the data writes them); a slice
// of an older layout is upgraded by upgradeDungeonsSlice before it is used; a slice from a
// newer build fails the check. Before the compatibility promise (M2) the world version
// does not change for it.

import type { IdField } from '../../core/save/renames';
import type { World } from '../../core/world';
import { CHOICES, type DungeonsSlice } from './types';

/** The slice layout this build writes. */
export const DUNGEONS_SLICE_VERSION = 1;

export function emptyDungeonsSlice(): DungeonsSlice {
  return { version: DUNGEONS_SLICE_VERSION, instances: {}, nests: {}, run: null, dirty: true };
}

/**
 * Bring a slice of an older layout to this one (none exist yet: version 1 is the first),
 * and drop a visit whose dungeon the rename table removed (its id is gone from the run).
 * Returns the slice it was given.
 */
export function upgradeDungeonsSlice(slice: DungeonsSlice): DungeonsSlice {
  if (slice.version < DUNGEONS_SLICE_VERSION) slice.version = DUNGEONS_SLICE_VERSION;
  if (slice.run && typeof slice.run.dungeon !== 'string') slice.run = null;
  return slice;
}

/** The slice for writing, created on first use (a save from before this system). */
export function dungeonsSlice(world: World): DungeonsSlice {
  const w = world as World & { slices: { dungeons?: DungeonsSlice } };
  if (!w.slices.dungeons) w.slices.dungeons = emptyDungeonsSlice();
  return upgradeDungeonsSlice(w.slices.dungeons);
}

/** The slice for reading, or undefined when the system never ran (never creates it). */
export function readDungeons(world: { slices: object }): DungeonsSlice | undefined {
  return (world.slices as { dungeons?: DungeonsSlice }).dungeons;
}

/** Where the slice keeps content ids, for the rename table (5.5 `idFields`). */
export const DUNGEONS_ID_FIELDS: readonly IdField[] = [
  { path: 'instances.@keys', kind: 'dungeon' },
  { path: 'instances.*.def', kind: 'dungeon' },
  { path: 'nests.@keys', kind: 'nest' },
  { path: 'run.dungeon', kind: 'dungeon' },
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const CHOICE_STATES = new Set<string>(['untouched', ...CHOICES]);
const VIAS = new Set(['command', 'walk', 'collapse', 'purify']);

function pendingProblems(v: unknown, at: string, out: string[]): void {
  if (v === null) return;
  if (
    !isObj(v) ||
    (v.choice !== 'destroy' && v.choice !== 'purify') ||
    !isInt(v.until, 0) ||
    !CHOICE_STATES.has(v.from as string)
  )
    out.push(`${at}.pending is not a pending choice`);
}

function choiceProblems(s: Record<string, unknown>, at: string, out: string[]): void {
  if (!CHOICE_STATES.has(s.choice as string)) out.push(`${at}.choice is unknown`);
  if (!isInt(s.choiceTick, -1)) out.push(`${at}.choiceTick is not a tick`);
  pendingProblems(s.pending, at, out);
  for (const k of ['collapsed', 'purified', 'cleared'] as const)
    if (typeof s[k] !== 'boolean') out.push(`${at}.${k} is not a boolean`);
}

/** The save check of the slice: the problems found, empty when it is sound. */
export function validateDungeonsSlice(slice: unknown): string[] {
  // a save from before the dungeons existed: the slice is created on first use
  if (slice === undefined) return [];
  if (!isObj(slice)) return ['dungeons is not an object'];
  const out: string[] = [];
  if (!isInt(slice.version, 1)) out.push('dungeons.version is not a version');
  else if (slice.version > DUNGEONS_SLICE_VERSION)
    out.push(`dungeons.version ${slice.version} is newer than this build's`);
  if (!isObj(slice.instances)) out.push('dungeons.instances is not an object');
  else
    for (const [id, s] of Object.entries(slice.instances)) {
      const at = `dungeons.instances.${id}`;
      if (!isObj(s)) {
        out.push(`${at} is not an instance`);
        continue;
      }
      if (typeof s.def !== 'string' || s.def === '') out.push(`${at}.def is missing`);
      if (!isNum(s.pressure) || s.pressure < 0) out.push(`${at}.pressure is not a pressure`);
      if (!isNum(s.activity) || s.activity < 0) out.push(`${at}.activity is not an activity`);
      for (const k of ['overflowAt', 'overflowed', 'depth', 'patrol'] as const)
        if (!isInt(s[k], -1)) out.push(`${at}.${k} is not a tick or level`);
      for (const k of ['grown', 'idle', 'entries', 'swallowed'] as const)
        if (!isInt(s[k], 0)) out.push(`${at}.${k} is not a count`);
      choiceProblems(s, at, out);
    }
  if (!isObj(slice.nests)) out.push('dungeons.nests is not an object');
  else
    for (const [id, s] of Object.entries(slice.nests)) {
      const at = `dungeons.nests.${id}`;
      if (!isObj(s)) {
        out.push(`${at} is not a nest`);
        continue;
      }
      if (typeof s.live !== 'boolean') out.push(`${at}.live is not a boolean`);
      if (typeof s.matured !== 'boolean') out.push(`${at}.matured is not a boolean`);
      if (!isInt(s.stage, 1)) out.push(`${at}.stage is not a stage`);
      for (const k of ['since', 'clearedTick', 'collapsedTick'] as const)
        if (!isInt(s[k], -1)) out.push(`${at}.${k} is not a tick`);
      choiceProblems(s, at, out);
    }
  const run = slice.run;
  // a visit whose dungeon the rename table removed has no dungeon left: dropped on use
  if (run !== null && !(isObj(run) && run.dungeon === undefined)) {
    if (
      !isObj(run) ||
      typeof run.dungeon !== 'string' ||
      typeof run.floor !== 'string' ||
      !isInt(run.enteredTick, 0) ||
      !VIAS.has(run.via as string) ||
      typeof run.overCap !== 'boolean'
    )
      out.push('dungeons.run is not a run');
  }
  if (typeof slice.dirty !== 'boolean') out.push('dungeons.dirty is not a boolean');
  return out;
}
