// Flow metrics of a map (scene_flow.md 1, map_briefs.md 1.4 and 15): walking distances on
// the real rows (eight ways, no corner cutting, a diagonal step 1.414 m, as findPath
// walks), the first-contact distance from the entrances to the nearest alert circle, the
// gap between a safe place and the nearest alert circle, and the resident levels a map
// shows under an act's flags. The kernel does not read these; validation tests and the
// map tools do. Monster data comes in through a lookup, so the world never reads combat.
// Pure.

import { isWalkableTile, nearestWalkable } from './grid';
import { flagListMet } from './spawn_rules';
import type { MapDef, Rect, SpawnDef, Waypoint } from './types';

/** Flow templates (map_briefs.md 1.4): hub, dungeon floor, field, battle, divine or private. */
export type FlowTemplate = 'T-H' | 'T-D' | 'T-F' | 'T-B' | 'T-S';

/** The template targets the metrics check (scene_flow.md 2.6 and 5; map_briefs.md 1.4). */
export const FLOW_TARGETS = {
  /** metres from an entrance to the first alert circle, fields and dungeon floors */
  firstContact: 8,
  /** metres between a safe place (camp, entrance platform) and the nearest alert circle */
  safeMargin: 3,
  /** a multi-act map's resident levels stay within the act band's top plus this */
  levelOverBand: 2,
} as const;

/** The template of an atlas role (map_briefs.md 1.4). */
export function flowTemplate(role: string): FlowTemplate {
  if (role === 'hub') return 'T-H';
  if (role === 'dungeon') return 'T-D';
  if (role === 'field') return 'T-F';
  if (role === 'battle') return 'T-B';
  return 'T-S';
}

/** What a metric needs to know of a monster. */
export interface MonsterStats {
  minLevel: number;
  maxLevel: number;
  aggroRadius: number;
}

/** A monster spawn's alert circle: its wander radius plus the monster's aggro radius. */
export interface AlertCircle {
  spawnId: string;
  x: number;
  y: number;
  r: number;
  levels: [number, number];
}

/** Monster spawns that are present under the flags (requiresFlags, negations included). */
export function residentSpawns(
  map: { spawns: readonly SpawnDef[] },
  flags: Readonly<Record<string, unknown>>,
): SpawnDef[] {
  return map.spawns.filter(
    (s) => s.kind === 'monster' && flagListMet(s.requiresFlags, (f) => flags[f]),
  );
}

/** Alert circles of the resident spawns; spawns of unknown monsters are left out. */
export function alertCircles(
  map: { spawns: readonly SpawnDef[] },
  flags: Readonly<Record<string, unknown>>,
  monster: (id: string) => MonsterStats | undefined,
): AlertCircle[] {
  const out: AlertCircle[] = [];
  for (const s of residentSpawns(map, flags)) {
    const m = monster(s.ref);
    if (!m) continue;
    const lv = s.level;
    const levels: [number, number] =
      lv === undefined
        ? [m.minLevel, m.maxLevel]
        : typeof lv === 'number'
          ? [lv, lv]
          : [lv[0], lv[1]];
    out.push({ spawnId: s.id, x: s.x, y: s.y, r: (s.radius ?? 1) + m.aggroRadius, levels });
  }
  return out;
}

/**
 * Where the player arrives on a map: the landing of every exit of another map that leads
 * here (its arrival location's centre, else its toX and toY), snapped to a walkable tile.
 */
export function entrances(maps: readonly MapDef[], map: MapDef): Waypoint[] {
  const out: Waypoint[] = [];
  for (const other of maps) {
    if (other.id === map.id) continue;
    for (const x of other.exits) {
      if (x.toMap !== map.id) continue;
      const loc = x.toLocation ? map.locations.find((l) => l.id === x.toLocation) : undefined;
      const at = loc ? { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 } : { x: x.toX, y: x.toY };
      const p = nearestWalkable(map, at.x, at.y);
      if (p) out.push(p);
    }
  }
  return out;
}

/**
 * Walking distance in metres from the nearest start to every tile (Infinity where no
 * walk reaches): Dijkstra over the walkable tiles with findPath's moves.
 */
export function walkDistances(map: MapDef, starts: readonly Waypoint[]): Float64Array {
  const w = map.width;
  const dist = new Float64Array(w * map.height).fill(Number.POSITIVE_INFINITY);
  const open: number[] = [];
  for (const s of starts) {
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (!isWalkableTile(map, x, y)) continue;
    dist[y * w + x] = 0;
    open.push(y * w + x);
  }
  const done = new Uint8Array(w * map.height);
  // a small map: a linear scan for the nearest open tile is plenty
  while (open.length > 0) {
    let best = 0;
    for (let k = 1; k < open.length; k++)
      if ((dist[open[k] as number] as number) < (dist[open[best] as number] as number)) best = k;
    const i = open.splice(best, 1)[0] as number;
    if (done[i]) continue;
    done[i] = 1;
    const cx = i % w;
    const cy = Math.floor(i / w);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkableTile(map, nx, ny)) continue;
        if (
          dx !== 0 &&
          dy !== 0 &&
          (!isWalkableTile(map, cx + dx, cy) || !isWalkableTile(map, cx, cy + dy))
        )
          continue;
        const ni = ny * w + nx;
        const d = (dist[i] as number) + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
        if (d < (dist[ni] as number)) {
          dist[ni] = d;
          open.push(ni);
        }
      }
    }
  }
  return dist;
}

/**
 * First-contact distance (scene_flow.md 1): the shortest walk from an entrance to a tile
 * whose centre lies inside an alert circle; Infinity when no circle is reached (towns).
 */
export function firstContact(
  map: MapDef,
  starts: readonly Waypoint[],
  circles: readonly AlertCircle[],
): number {
  if (circles.length === 0) return Number.POSITIVE_INFINITY;
  const dist = walkDistances(map, starts);
  let best = Number.POSITIVE_INFINITY;
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const d = dist[y * map.width + x] as number;
      if (d >= best) continue;
      if (circles.some((c) => Math.hypot(x + 0.5 - c.x, y + 0.5 - c.y) <= c.r)) best = d;
    }
  }
  return best;
}

/**
 * The gap in metres between a rectangle (a safe place) and the nearest alert circle;
 * negative when they overlap, Infinity without circles.
 */
export function safeMargin(rect: Rect, circles: readonly AlertCircle[]): number {
  let best = Number.POSITIVE_INFINITY;
  for (const c of circles) {
    const dx = Math.max(rect.x - c.x, 0, c.x - (rect.x + rect.w));
    const dy = Math.max(rect.y - c.y, 0, c.y - (rect.y + rect.h));
    best = Math.min(best, Math.hypot(dx, dy) - c.r);
  }
  return best;
}

/** The flags of an act as the map's act groups read them: act.1.entered to act.<n>.entered. */
export function actFlags(act: number): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (let n = 1; n <= act; n++) out[`act.${n}.entered`] = true;
  return out;
}

/** The highest resident level of a map under an act's flags (0 without monsters). */
export function residentTopLevel(
  map: { spawns: readonly SpawnDef[] },
  act: number,
  monster: (id: string) => MonsterStats | undefined,
): number {
  let top = 0;
  for (const c of alertCircles(map, actFlags(act), monster)) top = Math.max(top, c.levels[1]);
  return top;
}
