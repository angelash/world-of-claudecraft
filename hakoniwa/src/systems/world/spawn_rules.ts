// Spawn point rules of the map documents (map_briefs.md 1.6 and 1.10): flag lists whose
// entries may be negated (`!act.2.entered`: only while the flag is falsy, so an act's
// group gives way to the next act's), and the level a map assigns to a spawn point (one
// level or a band rolled per spawn) when the bestiary level sits below the map's band.
// Systems that place things from spawn points (combat) read these instead of the raw
// fields. Pure.

import type { SpawnDef, SpawnLevel } from './types';

/** Prefix of a negated flag-list entry. */
export const NEGATED = '!';

/** The level cap (combat formulas MAX_LEVEL); a spawn level lies in 1..SPAWN_LEVEL_MAX. */
export const SPAWN_LEVEL_MAX = 60;

/** The flag name of a list entry, without its negation. */
export function flagEntryName(entry: string): string {
  return entry.startsWith(NEGATED) ? entry.slice(NEGATED.length) : entry;
}

/**
 * Whether every entry of a flag list holds: `name` needs the flag truthy, `!name` needs it
 * falsy (unset counts as falsy). No list holds. Truthiness is plain JavaScript, as the
 * spawn gates always read it.
 */
export function flagListMet(
  list: readonly string[] | undefined,
  read: (name: string) => unknown,
): boolean {
  if (!list) return true;
  for (const entry of list) {
    const on = !!read(flagEntryName(entry));
    if (entry.startsWith(NEGATED) ? on : !on) return false;
  }
  return true;
}

/** The flag names a list reads (negations stripped), for change listeners and the registry. */
export function flagListNames(list: readonly string[] | undefined): string[] {
  return (list ?? []).map(flagEntryName);
}

/** The level band of a spawn point: [level, level] for a fixed level, undefined without one. */
export function spawnLevelBand(spawn: { level?: SpawnLevel }): [number, number] | undefined {
  const l = spawn.level;
  if (l === undefined) return undefined;
  return typeof l === 'number' ? [l, l] : [l[0], l[1]];
}

/**
 * The level for one spawn from a point: a fixed level as is (no draw), a band with one
 * draw from the given stream, undefined when the point assigns none (the caller keeps
 * the bestiary roll, which is one draw from the same stream).
 */
export function rollSpawnLevel(
  spawn: { level?: SpawnLevel },
  rng: { int(lo: number, hi: number): number },
): number | undefined {
  const l = spawn.level;
  if (l === undefined) return undefined;
  return typeof l === 'number' ? l : rng.int(l[0], l[1]);
}

const NAME = /^[A-Za-z0-9_.:<>-]+$/;

/** Problems with a flag list's entries (content validation). */
export function flagListProblems(who: string, list: unknown): string[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) return [`${who}: requiresFlags must be a list`];
  const out: string[] = [];
  for (const entry of list) {
    if (typeof entry !== 'string' || !NAME.test(flagEntryName(entry)))
      out.push(`${who}: bad flag entry '${String(entry)}'`);
  }
  return out;
}

/** Problems with a map's spawn points: level shape and range, flag entries. Pure. */
export function spawnRuleProblems(map: { id: string; spawns: readonly SpawnDef[] }): string[] {
  const out: string[] = [];
  for (const s of map.spawns) {
    const who = `map ${map.id}: spawn ${s.id}`;
    out.push(...flagListProblems(who, s.requiresFlags));
    if (s.level === undefined) continue;
    const band = Array.isArray(s.level) ? s.level : [s.level, s.level];
    const ok =
      band.length === 2 &&
      band.every((n) => Number.isInteger(n) && n >= 1 && n <= SPAWN_LEVEL_MAX) &&
      (band[0] as number) <= (band[1] as number);
    if (!ok)
      out.push(
        `${who}: level ${JSON.stringify(s.level)} is not 1..${SPAWN_LEVEL_MAX} or a band low to high`,
      );
    else if (s.kind !== 'monster') out.push(`${who}: only a monster spawn takes a level`);
  }
  return out;
}
