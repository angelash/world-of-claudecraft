// Switch tile areas (map_briefs.md 1.10): rectangles of a map that are a closed tile (rock
// fall, sluice, iron gate, reed path) until a flag condition opens them. The content map
// stays immutable; the world reads the live map, a copy of the map with the closed
// switches painted in, cached per map and per set of closed switches, so walkability and
// pathing follow the flags at once and a map without switches is returned as it is.
// Pure: the open state is a function of the flags, nothing is stored in the world.

import type { FlagValue } from '../../core/contracts';
import { checkCondition, evaluate, flagResolver } from '../quests/conditions';
import { type MapDef, type SwitchDef, TILE_KINDS, type TileKind } from './types';

const variants = new WeakMap<MapDef, Map<string, MapDef>>();

/** Ids of the switches whose condition is false (closed), in content order. */
export function closedSwitches(
  map: { switches?: readonly SwitchDef[] },
  isOpen: (condition: string) => boolean,
): string[] {
  return (map.switches ?? []).filter((s) => !isOpen(s.openWhen)).map((s) => s.id);
}

/** A legend character for a tile kind: the map's own (first in legend order) or a private one. */
function charFor(legend: Record<string, TileKind>, kind: TileKind): string {
  for (const [ch, k] of Object.entries(legend)) if (k === kind) return ch;
  const ch = String.fromCharCode(0xe000 + TILE_KINDS.indexOf(kind));
  legend[ch] = kind;
  return ch;
}

/**
 * The map with the listed switches closed: each closed rectangle (clipped to the map) is
 * painted with its closed tile. No closed switch returns the map itself; the same map and
 * set always return the same object, so the walkability grid is cached with it.
 */
export function switchedMap(map: MapDef, closed: readonly string[]): MapDef {
  if (closed.length === 0) return map;
  const key = closed.join('\n');
  let byKey = variants.get(map);
  if (!byKey) {
    byKey = new Map();
    variants.set(map, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const legend: Record<string, TileKind> = { ...map.legend };
  const rows = map.rows.map((r) => r.split(''));
  for (const s of map.switches ?? []) {
    if (!closed.includes(s.id)) continue;
    const ch = charFor(legend, s.closedTile);
    for (let y = Math.max(0, s.y); y < Math.min(map.height, s.y + s.h); y++) {
      const row = rows[y];
      if (!row) continue;
      for (let x = Math.max(0, s.x); x < Math.min(map.width, s.x + s.w); x++) row[x] = ch;
    }
  }
  const variant: MapDef = { ...map, legend, rows: rows.map((r) => r.join('')) };
  byKey.set(key, variant);
  return variant;
}

/**
 * The map as the flags leave it: switches whose `openWhen` is false are closed. Maps
 * without switches come back unchanged (the same object).
 */
export function liveMap(map: MapDef, flags: Readonly<Record<string, FlagValue>>): MapDef {
  if (!map.switches || map.switches.length === 0) return map;
  const resolve = flagResolver(flags as Record<string, FlagValue>);
  return switchedMap(
    map,
    closedSwitches(map, (c) => evaluate(c, resolve)),
  );
}

/** Problems with a map's switches (content validation). Pure. */
export function switchProblems(map: {
  id: string;
  width: number;
  height: number;
  switches?: readonly SwitchDef[];
}): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const [i, s] of (map.switches ?? []).entries()) {
    const who = `map ${map.id}: switch ${s.id || i}`;
    if (typeof s.id !== 'string' || s.id === '') out.push(`map ${map.id}: switch ${i} has no id`);
    else if (seen.has(s.id)) out.push(`${who} listed twice`);
    seen.add(s.id);
    if (!(TILE_KINDS as readonly string[]).includes(s.closedTile))
      out.push(`${who} unknown closed tile '${s.closedTile}'`);
    const whole = [s.x, s.y, s.w, s.h].every((n) => Number.isInteger(n));
    if (!whole || s.w < 1 || s.h < 1) out.push(`${who} needs a whole rectangle of at least 1x1`);
    else if (s.x < 0 || s.y < 0 || s.x + s.w > map.width || s.y + s.h > map.height)
      out.push(`${who} (${s.x},${s.y} ${s.w}x${s.h}) outside the map`);
    if (typeof s.openWhen !== 'string' || s.openWhen.trim() === '')
      out.push(`${who} needs an openWhen condition`);
    else {
      const bad = checkCondition(s.openWhen);
      if (bad !== null) out.push(`${who} openWhen does not parse: ${bad}`);
    }
  }
  return out;
}
