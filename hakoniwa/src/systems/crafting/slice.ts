// The crafting slice: creation, the load-time upgrade and the save check
// (release_engineering.md 5.5). The slice carries its own layout version: a save from before
// this system has no slice and gets an empty one on first use (every livelihood at 0, every
// node ready, nobody drunk); a slice of an older layout is upgraded before it is used; a
// slice from a newer build fails the check. Before the compatibility promise (M2) the world
// version does not change for it.

import type { IdField } from '../../core/save/renames';
import type { World } from '../../core/world';
import { PROFESSIONS } from '../inventory/types';
import type { CraftingSlice } from './types';

/** The slice layout this build writes. */
export const CRAFTING_SLICE_VERSION = 1;

export function emptyCraftingSlice(): CraftingSlice {
  return {
    version: CRAFTING_SLICE_VERSION,
    skills: {},
    nodes: {},
    recent: {},
    drunk: {},
    masterworks: {},
  };
}

/** Bring a slice of an older layout to this one (version 1 is the first). */
export function upgradeCraftingSlice(slice: CraftingSlice): CraftingSlice {
  if (slice.version < CRAFTING_SLICE_VERSION) slice.version = CRAFTING_SLICE_VERSION;
  return slice;
}

/** The slice for writing, created on first use (a save from before this system). */
export function craftingSlice(world: World): CraftingSlice {
  const w = world as World & { slices: { crafting?: CraftingSlice } };
  if (!w.slices.crafting) w.slices.crafting = emptyCraftingSlice();
  return upgradeCraftingSlice(w.slices.crafting);
}

/** The slice for reading, or undefined when the system never ran (never creates it). */
export function readCrafting(world: { slices: object }): CraftingSlice | undefined {
  return (world.slices as { crafting?: CraftingSlice }).crafting;
}

/** Where the slice keeps content ids, for the rename table (5.5 `idFields`). */
export const CRAFTING_ID_FIELDS: readonly IdField[] = [{ path: 'nodes.@keys', kind: 'node' }];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = Number.MIN_SAFE_INTEGER): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const PROFESSION_SET: ReadonlySet<string> = new Set(PROFESSIONS);

/** The save check of the slice: the problems found, empty when it is sound. */
export function validateCraftingSlice(slice: unknown): string[] {
  // a save from before the crafting system: the slice is created on first use
  if (slice === undefined) return [];
  if (!isObj(slice)) return ['crafting is not an object'];
  const out: string[] = [];
  if (!isInt(slice.version, 1)) out.push('crafting.version is not a version');
  else if (slice.version > CRAFTING_SLICE_VERSION)
    out.push(`crafting.version ${slice.version} is newer than this build's`);
  if (!isObj(slice.skills)) out.push('crafting.skills is not an object');
  else
    for (const [id, row] of Object.entries(slice.skills)) {
      if (!isObj(row)) {
        out.push(`crafting.skills.${id} is not a skill row`);
        continue;
      }
      for (const [p, v] of Object.entries(row)) {
        if (!PROFESSION_SET.has(p)) out.push(`crafting.skills.${id}.${p} is no livelihood`);
        else if (typeof v !== 'number' || !(v >= 0 && v <= 150))
          out.push(`crafting.skills.${id}.${p} is not a skill`);
      }
    }
  if (!isObj(slice.nodes)) out.push('crafting.nodes is not an object');
  else
    for (const [id, n] of Object.entries(slice.nodes)) {
      if (!isObj(n) || !isInt(n.readyAt, -1) || !isInt(n.used, 0))
        out.push(`crafting.nodes.${id} is not a node clock`);
    }
  if (!isObj(slice.recent)) out.push('crafting.recent is not an object');
  else
    for (const [id, list] of Object.entries(slice.recent)) {
      if (!Array.isArray(list) || !list.every((t) => isInt(t, 0)))
        out.push(`crafting.recent.${id} is not a list of ticks`);
    }
  if (!isObj(slice.drunk)) out.push('crafting.drunk is not an object');
  else
    for (const [id, d] of Object.entries(slice.drunk)) {
      if (!isObj(d) || !isInt(d.layers, 0) || !isInt(d.soberUntil, 0))
        out.push(`crafting.drunk.${id} is not a drunk state`);
    }
  if (!isObj(slice.masterworks)) out.push('crafting.masterworks is not an object');
  else
    for (const [id, n] of Object.entries(slice.masterworks)) {
      if (!isInt(n, 1)) out.push(`crafting.masterworks.${id} is not a count`);
    }
  return out;
}
