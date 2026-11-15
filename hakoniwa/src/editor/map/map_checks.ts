// Map checks for the map editor and the content check desk: tile grid shape, object
// bounds and ids, exit targets (toMap, toLocation and the gate_<map> convention from
// docs/50_tech/implementation_conventions.md 2), walkability, and reachability between
// exits, locations and spawns using the world system's own findPath. Pure: no DOM.

import { findPath, isWalkableTile, nearestWalkable } from '../../systems/world/grid';
import type { MapDef, Waypoint } from '../../systems/world/types';
import { fmt, T } from '../text';
import { inBounds, locationCentre, type ObjectKind, type ObjectRef } from './map_ops';
import { isTileKind } from './palette';

export type Severity = 'error' | 'warning' | 'info';

export interface MapIssue {
  severity: Severity;
  /** 'shape' | 'object' | 'exit_ref' | 'reach' */
  rule: 'shape' | 'object' | 'exit_ref' | 'reach';
  message: string;
  x?: number;
  y?: number;
  ref?: ObjectRef;
}

const WHAT: Record<ObjectKind, string> = {
  location: T.mapCheck.whatLocation,
  spawn: T.mapCheck.whatSpawn,
  exit: T.mapCheck.whatExit,
};

export function checkShape(map: MapDef): MapIssue[] {
  const out: MapIssue[] = [];
  if (map.rows.length !== map.height) {
    out.push({
      severity: 'error',
      rule: 'shape',
      message: fmt(T.mapCheck.rowsCount, { rows: map.rows.length, height: map.height }),
    });
  }
  map.rows.forEach((row, y) => {
    if (row.length !== map.width) {
      out.push({
        severity: 'error',
        rule: 'shape',
        message: fmt(T.mapCheck.rowWidth, { row: y, len: row.length, width: map.width }),
        x: 0,
        y,
      });
    }
    const reported = new Set<string>();
    for (let x = 0; x < row.length; x++) {
      const ch = row[x] as string;
      if (ch in map.legend || reported.has(ch)) continue;
      reported.add(ch);
      out.push({
        severity: 'error',
        rule: 'shape',
        message: fmt(T.mapCheck.unknownChar, { row: y, ch }),
        x,
        y,
      });
    }
  });
  for (const [ch, kind] of Object.entries(map.legend)) {
    if (!isTileKind(kind)) {
      out.push({
        severity: 'error',
        rule: 'shape',
        message: fmt(T.mapCheck.badKind, { ch, kind: String(kind) }),
      });
    }
  }
  return out;
}

/** Same walkability as the world system (grid.ts), so checks match the game. */
function walkableAt(map: MapDef, x: number, y: number): boolean {
  return isWalkableTile(map, x, y);
}

/** Walkable tiles from which an exit can be used (world.use_exit allows 1.8 tiles). */
export function exitStandTiles(map: MapDef, ex: number, ey: number): Waypoint[] {
  const out: Waypoint[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = Math.floor(ex) + dx;
      const y = Math.floor(ey) + dy;
      if (walkableAt(map, x, y)) out.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return out;
}

function dupIds(kind: ObjectKind, ids: string[]): MapIssue[] {
  const seen = new Set<string>();
  const out: MapIssue[] = [];
  for (const id of ids) {
    if (seen.has(id)) {
      out.push({
        severity: 'error',
        rule: 'object',
        message: fmt(T.mapCheck.dupId, { what: WHAT[kind], id }),
        ref: { kind, id },
      });
    }
    seen.add(id);
  }
  return out;
}

export function checkObjects(map: MapDef): MapIssue[] {
  const out: MapIssue[] = [];
  out.push(
    ...dupIds(
      'location',
      map.locations.map((l) => l.id),
    ),
  );
  out.push(
    ...dupIds(
      'spawn',
      map.spawns.map((s) => s.id),
    ),
  );
  out.push(
    ...dupIds(
      'exit',
      map.exits.map((e) => e.id),
    ),
  );
  for (const l of map.locations) {
    const ref: ObjectRef = { kind: 'location', id: l.id };
    if (
      l.x < 0 ||
      l.y < 0 ||
      l.w < 1 ||
      l.h < 1 ||
      l.x + l.w > map.width ||
      l.y + l.h > map.height
    ) {
      out.push({
        severity: 'error',
        rule: 'object',
        message: fmt(T.mapCheck.outOfBounds, { what: WHAT.location, id: l.id }),
        x: l.x,
        y: l.y,
        ref,
      });
      continue;
    }
    let any = false;
    for (let y = l.y; y < l.y + l.h && !any; y++) {
      for (let x = l.x; x < l.x + l.w && !any; x++) any = walkableAt(map, x, y);
    }
    if (!any) {
      out.push({
        severity: 'warning',
        rule: 'object',
        message: fmt(T.mapCheck.locationBlocked, { id: l.id }),
        x: l.x,
        y: l.y,
        ref,
      });
    }
  }
  for (const s of map.spawns) {
    const ref: ObjectRef = { kind: 'spawn', id: s.id };
    const x = Math.floor(s.x);
    const y = Math.floor(s.y);
    if (!inBounds(map, x, y)) {
      out.push({
        severity: 'error',
        rule: 'object',
        message: fmt(T.mapCheck.outOfBounds, { what: WHAT.spawn, id: s.id }),
        ref,
      });
    } else if (!walkableAt(map, x, y)) {
      out.push({
        severity: 'warning',
        rule: 'object',
        message: fmt(T.mapCheck.spawnBlocked, { id: s.id }),
        x,
        y,
        ref,
      });
    }
  }
  for (const e of map.exits) {
    const ref: ObjectRef = { kind: 'exit', id: e.id };
    const x = Math.floor(e.x);
    const y = Math.floor(e.y);
    if (!inBounds(map, x, y)) {
      out.push({
        severity: 'error',
        rule: 'object',
        message: fmt(T.mapCheck.outOfBounds, { what: WHAT.exit, id: e.id }),
        ref,
      });
    } else if (exitStandTiles(map, x, y).length === 0) {
      out.push({
        severity: 'error',
        rule: 'object',
        message: fmt(T.mapCheck.exitNoWalk, { id: e.id }),
        x,
        y,
        ref,
      });
    }
  }
  return out;
}

/** Exit targets against every known map (drafts included by the caller). */
export function checkExitRefs(map: MapDef, allMaps: readonly MapDef[]): MapIssue[] {
  const out: MapIssue[] = [];
  for (const e of map.exits) {
    const ref: ObjectRef = { kind: 'exit', id: e.id };
    const at = { x: Math.floor(e.x), y: Math.floor(e.y), ref };
    if (!e.toMap) {
      out.push({
        severity: 'error',
        rule: 'exit_ref',
        message: fmt(T.mapCheck.exitNoTarget, { id: e.id }),
        ...at,
      });
      continue;
    }
    const target = allMaps.find((m) => m.id === e.toMap);
    if (!target) {
      out.push({
        severity: 'error',
        rule: 'exit_ref',
        message: fmt(T.mapCheck.exitUnknownMap, { id: e.id, map: e.toMap }),
        ...at,
      });
      continue;
    }
    if (!e.toLocation) {
      out.push({
        severity: 'info',
        rule: 'exit_ref',
        message: fmt(T.mapCheck.exitNoLocation, { id: e.id }),
        ...at,
      });
      if (!inBounds(target, Math.floor(e.toX), Math.floor(e.toY))) {
        out.push({
          severity: 'error',
          rule: 'exit_ref',
          message: fmt(T.mapCheck.exitTargetOutside, { id: e.id, map: e.toMap }),
          ...at,
        });
      }
      continue;
    }
    if (!target.locations.some((l) => l.id === e.toLocation)) {
      out.push({
        severity: 'error',
        rule: 'exit_ref',
        message: fmt(T.mapCheck.exitUnknownLocation, { id: e.id, loc: e.toLocation, map: e.toMap }),
        ...at,
      });
    }
    if (e.toMap !== map.id && e.toLocation !== `gate_${map.id}`) {
      out.push({
        severity: 'warning',
        rule: 'exit_ref',
        message: fmt(T.mapCheck.exitGateName, { id: e.id, loc: e.toLocation, map: map.id }),
        ...at,
      });
    }
  }
  return out;
}

export interface Components {
  /** component index per tile (-1 = blocked), largest component first */
  labels: Int32Array;
  sizes: number[];
}

/**
 * Walkable areas. findPath moves 8-way without cutting corners, which connects
 * exactly the 4-connected tiles, so a 4-way flood fill gives the same partition.
 */
export function walkComponents(map: MapDef): Components {
  const w = map.width;
  const h = map.height;
  const raw = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (raw[start] !== -1 || !walkableAt(map, start % w, Math.floor(start / w))) continue;
    const label = sizes.length;
    let size = 0;
    raw[start] = label;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop() as number;
      size++;
      const x = i % w;
      const y = Math.floor(i / w);
      const next = [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ] as const;
      for (const [nx, ny] of next) {
        const ni = ny * w + nx;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || raw[ni] !== -1) continue;
        if (!walkableAt(map, nx, ny)) continue;
        raw[ni] = label;
        stack.push(ni);
      }
    }
    sizes.push(size);
  }
  // Relabel so index 0 is the largest area.
  const order = sizes
    .map((_, i) => i)
    .sort((a, b) => (sizes[b] as number) - (sizes[a] as number) || a - b);
  const rank = new Int32Array(sizes.length);
  order.forEach((old, i) => {
    rank[old] = i;
  });
  const labels = new Int32Array(w * h);
  for (let i = 0; i < raw.length; i++)
    labels[i] = (raw[i] as number) < 0 ? -1 : (rank[raw[i] as number] as number);
  return { labels, sizes: order.map((i) => sizes[i] as number) };
}

interface Target {
  ref: ObjectRef;
  label: string;
  /** walkable tile centres from which the target counts as reached */
  stands: Waypoint[];
  x: number;
  y: number;
}

function targetsOf(map: MapDef): Target[] {
  const out: Target[] = [];
  for (const e of map.exits) {
    out.push({
      ref: { kind: 'exit', id: e.id },
      label: `${WHAT.exit} ${e.id}`,
      stands: exitStandTiles(map, e.x, e.y),
      x: Math.floor(e.x),
      y: Math.floor(e.y),
    });
  }
  for (const l of map.locations) {
    const c = locationCentre(l);
    const near = nearestWalkable(map, c.x, c.y);
    out.push({
      ref: { kind: 'location', id: l.id },
      label: `${WHAT.location} ${l.id}`,
      stands: near ? [near] : [],
      x: l.x,
      y: l.y,
    });
  }
  for (const s of map.spawns) {
    const near = nearestWalkable(map, s.x, s.y);
    out.push({
      ref: { kind: 'spawn', id: s.id },
      label: `${WHAT.spawn} ${s.id}`,
      stands: near ? [near] : [],
      x: Math.floor(s.x),
      y: Math.floor(s.y),
    });
  }
  return out;
}

/**
 * Reachability from an anchor (the first exit, else the first location, else the
 * first spawn) to every other exit, location and spawn, confirmed with findPath. A
 * target in the anchor's area that findPath still cannot reach means the map is too
 * large for the default search budget: in-game move orders would fail there too.
 */
export function checkReachability(map: MapDef, maxNodes?: number): MapIssue[] {
  if (map.width <= 0 || map.height <= 0) return [];
  const targets = targetsOf(map);
  const anchor = targets[0];
  if (!anchor) return [{ severity: 'info', rule: 'reach', message: T.mapCheck.noAnchor }];
  const start = anchor.stands[0];
  if (!start) {
    return [
      {
        severity: 'error',
        rule: 'reach',
        message: fmt(T.mapCheck.anchorBlocked, { id: anchor.ref.id }),
        x: anchor.x,
        y: anchor.y,
        ref: anchor.ref,
      },
    ];
  }
  const comps = walkComponents(map);
  const compOf = (p: Waypoint) => comps.labels[Math.floor(p.y) * map.width + Math.floor(p.x)] ?? -1;
  const anchorComp = compOf(start);
  const out: MapIssue[] = [];
  for (const t of targets.slice(1)) {
    const same = t.stands.filter((p) => compOf(p) === anchorComp);
    const what = WHAT[t.ref.kind];
    if (same.length === 0) {
      out.push({
        severity: t.ref.kind === 'spawn' ? 'warning' : 'error',
        rule: 'reach',
        message: fmt(T.mapCheck.unreachable, { what, id: t.ref.id, anchor: anchor.label }),
        x: t.x,
        y: t.y,
        ref: t.ref,
      });
      continue;
    }
    const found = same.some((p) => findPath(map, start, p, maxNodes) !== null);
    if (!found) {
      out.push({
        severity: 'warning',
        rule: 'reach',
        message: fmt(T.mapCheck.pathCapped, { what, id: t.ref.id, anchor: anchor.label }),
        x: t.x,
        y: t.y,
        ref: t.ref,
      });
    }
  }
  if (comps.sizes.length > 1) {
    out.push({
      severity: 'info',
      rule: 'reach',
      message: fmt(T.mapCheck.components, { n: comps.sizes.length }),
    });
  }
  return out;
}

/** Every check for one map. Reachability runs only on a well-formed grid. */
export function checkMap(map: MapDef, allMaps: readonly MapDef[]): MapIssue[] {
  const shape = checkShape(map);
  const out = [...shape, ...checkObjects(map), ...checkExitRefs(map, allMaps)];
  if (!shape.some((i) => i.severity === 'error')) out.push(...checkReachability(map));
  return out;
}
