// Navigation for the autoplayer: a breadth-first route over map exits (respecting each
// exit's required flags) and the walk target for the next leg. Pure functions over the
// content and the flag map; the player walks with world.move_to and leaves a map with
// world.use_exit, exactly like a human player would.

import type { FlagValue } from '../../core/contracts';
import { findPath, isWalkable } from '../../systems/world/grid';
import { liveMap } from '../../systems/world/switches';
import type { ExitDef, MapDef, Waypoint } from '../../systems/world/types';

export interface Leg {
  /** exit to take on the current map */
  exit: ExitDef;
  /** maps after this leg, including the destination */
  hops: number;
}

function exitOpen(exit: ExitDef, flags: Record<string, FlagValue>): boolean {
  return !exit.requiresFlags?.some((f) => !flags[f]);
}

/** Exits the player can actually walk to on the map as its switches stand now. */
export function reachableExits(
  map: MapDef,
  flags: Record<string, FlagValue>,
  point?: Waypoint,
): ExitDef[] {
  const current = liveMap(map, flags);
  return map.exits.filter((exit) => {
    if (!exitOpen(exit, flags)) return false;
    if (!point) return true;
    const target = { x: exit.x + 0.5, y: exit.y + 0.5 };
    return isWalkable(current, target.x, target.y) && findPath(current, point, target) !== null;
  });
}

/** The first exit on the way from one map to another, or null when there is no route. */
export function nextLeg(
  maps: readonly MapDef[],
  flags: Record<string, FlagValue>,
  from: string,
  to: string,
  point?: Waypoint,
): Leg | null {
  if (from === to) return null;
  const byId = new Map(maps.map((m) => [m.id, m]));
  const keyOf = (id: string, at?: Waypoint) => (at ? `${id}@${at.x},${at.y}` : id);
  const visited = new Set([keyOf(from, point)]);
  // A divided map may be reached through either side. Visiting the map once does
  // not rule out another entrance whose connected floor reaches the onward exit.
  const queue: { mapId: string; point?: Waypoint; first?: ExitDef; hops: number }[] = [
    { mapId: from, point, hops: 0 },
  ];
  for (const cur of queue) {
    const map = byId.get(cur.mapId);
    if (!map) continue;
    for (const exit of reachableExits(map, flags, cur.point)) {
      const dest = byId.get(exit.toMap);
      const loc = dest?.locations.find((l) => l.id === exit.toLocation);
      const arrival = point
        ? loc
          ? { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 }
          : { x: exit.toX, y: exit.toY }
        : undefined;
      const key = keyOf(exit.toMap, arrival);
      if (visited.has(key)) continue;
      visited.add(key);
      const first = cur.first ?? exit;
      const hops = cur.hops + 1;
      if (exit.toMap === to) return { exit: first, hops };
      queue.push({ mapId: exit.toMap, point: arrival, first, hops });
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
