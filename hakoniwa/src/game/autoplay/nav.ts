// Navigation for the autoplayer: a breadth-first route over map exits (respecting each
// exit's required flags) and the walk target for the next leg. Pure functions over the
// content and the flag map; the player walks with world.move_to and leaves a map with
// world.use_exit, exactly like a human player would.

import type { FlagValue } from '../../core/contracts';
import type { ExitDef, MapDef } from '../../systems/world/types';

export interface Leg {
  /** exit to take on the current map */
  exit: ExitDef;
  /** maps after this leg, including the destination */
  hops: number;
}

function exitOpen(exit: ExitDef, flags: Record<string, FlagValue>): boolean {
  return !exit.requiresFlags?.some((f) => !flags[f]);
}

/** The first exit on the way from one map to another, or null when there is no route. */
export function nextLeg(
  maps: readonly MapDef[],
  flags: Record<string, FlagValue>,
  from: string,
  to: string,
): Leg | null {
  if (from === to) return null;
  const byId = new Map(maps.map((m) => [m.id, m]));
  const first = new Map<string, ExitDef>();
  const depth = new Map<string, number>([[from, 0]]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const cur = queue.shift() as string;
    const map = byId.get(cur);
    if (!map) continue;
    for (const exit of map.exits) {
      if (!exitOpen(exit, flags) || depth.has(exit.toMap)) continue;
      depth.set(exit.toMap, (depth.get(cur) ?? 0) + 1);
      first.set(exit.toMap, cur === from ? exit : (first.get(cur) as ExitDef));
      if (exit.toMap === to) {
        return { exit: first.get(to) as ExitDef, hops: depth.get(to) as number };
      }
      queue.push(exit.toMap);
    }
  }
  return null;
}

/** Can the destination map be reached from here by walking? */
export function reachableMap(
  maps: readonly MapDef[],
  flags: Record<string, FlagValue>,
  from: string,
  to: string,
): boolean {
  return from === to || nextLeg(maps, flags, from, to) !== null;
}

/** Centre point of a named location on a map (the map centre when it is missing). */
export function locationPoint(map: MapDef, location?: string): { x: number; y: number } {
  const l = location ? map.locations.find((x) => x.id === location) : undefined;
  if (l) return { x: l.x + l.w / 2, y: l.y + l.h / 2 };
  return { x: map.width / 2, y: map.height / 2 };
}

/** Is the point inside the named location (inclusive edges, as the doors system checks)? */
export function insideLocation(
  map: MapDef,
  location: string,
  p: { x: number; y: number },
): boolean {
  const l = map.locations.find((x) => x.id === location);
  return !!l && p.x >= l.x && p.x <= l.x + l.w && p.y >= l.y && p.y <= l.y + l.h;
}
