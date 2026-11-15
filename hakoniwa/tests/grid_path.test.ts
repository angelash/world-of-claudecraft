// findPath keeps its open list in a binary heap ordered by (f, insertion order). The heap must
// reproduce the earlier linear "first lowest f" scan exactly, or every NPC route and replay
// would drift. The reference below is that scan, kept here as the oracle.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Rng } from '../src/core/rng';
import { findPath, isWalkableTile, nearestWalkable } from '../src/systems/world';
import type { MapDef, Waypoint } from '../src/systems/world/types';

function referencePath(map: MapDef, from: Waypoint, to: Waypoint): Waypoint[] | null {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  let goal = { x: Math.floor(to.x), y: Math.floor(to.y) };
  if (!isWalkableTile(map, goal.x, goal.y)) {
    const near = nearestWalkable(map, to.x, to.y);
    if (!near) return null;
    goal = { x: Math.floor(near.x), y: Math.floor(near.y) };
  }
  if (sx === goal.x && sy === goal.y) return [];
  const w = map.width;
  const idx = (x: number, y: number) => y * w + x;
  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const open: { i: number; f: number }[] = [];
  const startI = idx(sx, sy);
  gScore.set(startI, 0);
  open.push({ i: startI, f: 0 });
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  let expanded = 0;
  while (open.length > 0) {
    let best = 0;
    for (let k = 1; k < open.length; k++) {
      if ((open[k] as { f: number }).f < (open[best] as { f: number }).f) best = k;
    }
    const cur = open.splice(best, 1)[0] as { i: number; f: number };
    if (closed.has(cur.i)) continue;
    closed.add(cur.i);
    const cx = cur.i % w;
    const cy = Math.floor(cur.i / w);
    if (cx === goal.x && cy === goal.y) {
      const out: Waypoint[] = [];
      let i = cur.i;
      while (i !== startI) {
        out.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
        i = came.get(i) as number;
      }
      return out.reverse();
    }
    if (++expanded > 20000) return null;
    const base = gScore.get(cur.i) as number;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!isWalkableTile(map, nx, ny)) continue;
        if (dx !== 0 && dy !== 0) {
          if (!isWalkableTile(map, cx + dx, cy) || !isWalkableTile(map, cx, cy + dy)) continue;
        }
        const ni = idx(nx, ny);
        if (closed.has(ni)) continue;
        const cost = base + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
        if (cost < (gScore.get(ni) ?? Number.POSITIVE_INFINITY)) {
          gScore.set(ni, cost);
          came.set(ni, cur.i);
          open.push({ i: ni, f: cost + h(nx, ny) });
        }
      }
    }
  }
  return null;
}

function walkableTiles(map: MapDef): Waypoint[] {
  const out: Waypoint[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (isWalkableTile(map, x, y)) out.push({ x: x + 0.5, y: y + 0.5 });
    }
  }
  return out;
}

describe('findPath heap', () => {
  it('matches the linear-scan reference on every map for sampled routes', () => {
    const content = buildContent();
    const rng = new Rng({ s: 20261115 });
    let checked = 0;
    for (const map of content.maps) {
      const tiles = walkableTiles(map);
      if (tiles.length < 2) continue;
      for (let k = 0; k < 12; k++) {
        const a = tiles[rng.int(0, tiles.length - 1)] as Waypoint;
        const b = tiles[rng.int(0, tiles.length - 1)] as Waypoint;
        expect(findPath(map, a, b), `${map.id} ${a.x},${a.y} to ${b.x},${b.y}`).toEqual(
          referencePath(map, a, b),
        );
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(50);
  });

  it('matches the reference on open fields full of equal-cost ties', () => {
    const rows = Array.from({ length: 20 }, () => '.'.repeat(24));
    const map = {
      id: 'open',
      name: 'open',
      width: 24,
      height: 20,
      rows,
      legend: { '.': 'grass' },
      locations: [],
      spawns: [],
      exits: [],
    } as unknown as MapDef;
    for (const [a, b] of [
      [
        { x: 0.5, y: 0.5 },
        { x: 23.5, y: 19.5 },
      ],
      [
        { x: 3.5, y: 10.5 },
        { x: 20.5, y: 10.5 },
      ],
      [
        { x: 12.5, y: 0.5 },
        { x: 12.5, y: 19.5 },
      ],
    ] as const) {
      expect(findPath(map, a, b)).toEqual(referencePath(map, a, b));
    }
  });
});
