// The cells of the five ground-warning shapes (combat_and_classes.md 10.3): a tile is in
// the area when its centre lies inside the shape, and a unit is struck when the tile under
// its centre is in the area. The area is a list of tile coordinates, the same list the
// overlay draws (art 4.6 "逐格一致"). Pure; no world state.

import type { TelegraphShape } from './mech_types';

/** Where a shape is anchored: its centre (circle, ring, pulse) or its apex (cone, line). */
export interface ShapeAnchor {
  x: number;
  y: number;
  /** facing in radians for cones and lines (from the caster towards its target) */
  facing: number;
}

/** Bounds of the map the area is cut to (tiles 0..width-1, 0..height-1). */
export interface ShapeBounds {
  width: number;
  height: number;
}

/** Whether a point (a tile centre) lies inside the shape anchored at `a`. */
export function inShape(shape: TelegraphShape, a: ShapeAnchor, px: number, py: number): boolean {
  const dx = px - a.x;
  const dy = py - a.y;
  const d = Math.hypot(dx, dy);
  switch (shape.kind) {
    case 'circle':
    case 'pulse':
      return d <= shape.radius;
    case 'ring':
      return d >= shape.inner && d <= shape.outer;
    case 'cone': {
      if (d > shape.radius) return false;
      if (d < 1e-9) return true;
      let diff = Math.atan2(dy, dx) - a.facing;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      return Math.abs(diff) <= (shape.angle * Math.PI) / 360 + 1e-9;
    }
    case 'line': {
      const ux = Math.cos(a.facing);
      const uy = Math.sin(a.facing);
      const along = dx * ux + dy * uy;
      const across = Math.abs(-dx * uy + dy * ux);
      return along >= -0.5 && along <= shape.length && across <= shape.width / 2;
    }
  }
}

/** The farthest any part of the shape reaches from its anchor. */
function reach(shape: TelegraphShape): number {
  switch (shape.kind) {
    case 'circle':
    case 'pulse':
    case 'cone':
      return shape.radius;
    case 'ring':
      return shape.outer;
    case 'line':
      return Math.hypot(shape.length, shape.width / 2) + 0.5;
  }
}

/**
 * The tiles of one area, as x and y in pairs, row by row (y, then x): every tile of the
 * bounds whose centre lies inside the shape.
 */
export function shapeCells(shape: TelegraphShape, a: ShapeAnchor, b: ShapeBounds): number[] {
  const r = Math.ceil(reach(shape)) + 1;
  const x0 = Math.max(0, Math.floor(a.x) - r);
  const x1 = Math.min(b.width - 1, Math.floor(a.x) + r);
  const y0 = Math.max(0, Math.floor(a.y) - r);
  const y1 = Math.min(b.height - 1, Math.floor(a.y) + r);
  const out: number[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    for (let tx = x0; tx <= x1; tx++) {
      if (inShape(shape, a, tx + 0.5, ty + 0.5)) out.push(tx, ty);
    }
  }
  return out;
}

/** The cells as a lookup set of `x,y` keys. */
export function cellSet(cells: readonly number[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + 1 < cells.length; i += 2) out.add(`${cells[i]},${cells[i + 1]}`);
  return out;
}

/** The tile key a point stands on. */
export function tileKey(x: number, y: number): string {
  return `${Math.floor(x)},${Math.floor(y)}`;
}

/** Merge areas (several circles of one warning) into one sorted, duplicate-free list. */
export function mergeCells(lists: readonly (readonly number[])[]): number[] {
  const seen = new Set<string>();
  const pairs: [number, number][] = [];
  for (const cells of lists) {
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const x = cells[i] as number;
      const y = cells[i + 1] as number;
      const k = `${x},${y}`;
      if (seen.has(k)) continue;
      seen.add(k);
      pairs.push([x, y]);
    }
  }
  pairs.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return pairs.flat();
}

/** How many separate areas one cast of the shape lays (each member is its own circle). */
export function areaCount(shape: TelegraphShape, members: number): number {
  if (shape.kind === 'pulse') return 0;
  if (shape.kind === 'circle' && shape.at === 'each_member') return Math.max(1, members);
  if (shape.kind === 'circle') return Math.max(1, shape.count ?? 1);
  return 1;
}
