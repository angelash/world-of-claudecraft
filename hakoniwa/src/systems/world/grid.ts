// Walkability grid and A* pathfinding over a MapDef. Pure functions; grids are cached
// per MapDef object (content is immutable at runtime).

import { BLOCKING_TILES, type MapDef, type TileKind, type Waypoint } from './types';

interface Grid {
  width: number;
  height: number;
  walk: Uint8Array;
  kinds: TileKind[];
}

const cache = new WeakMap<MapDef, Grid>();

export function gridOf(map: MapDef): Grid {
  let g = cache.get(map);
  if (g) return g;
  const walk = new Uint8Array(map.width * map.height);
  const kinds: TileKind[] = new Array(map.width * map.height);
  for (let y = 0; y < map.height; y++) {
    const row = map.rows[y] ?? '';
    for (let x = 0; x < map.width; x++) {
      const ch = row[x] ?? ' ';
      const kind: TileKind = map.legend[ch] ?? 'void';
      kinds[y * map.width + x] = kind;
      walk[y * map.width + x] = BLOCKING_TILES.has(kind) ? 0 : 1;
    }
  }
  g = { width: map.width, height: map.height, walk, kinds };
  cache.set(map, g);
  return g;
}

export function tileAt(map: MapDef, tx: number, ty: number): TileKind {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return 'void';
  return gridOf(map).kinds[ty * map.width + tx] as TileKind;
}

export function isWalkableTile(map: MapDef, tx: number, ty: number): boolean {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  return gridOf(map).walk[ty * map.width + tx] === 1;
}

export function isWalkable(map: MapDef, x: number, y: number): boolean {
  return isWalkableTile(map, Math.floor(x), Math.floor(y));
}

/** Nearest walkable tile centre to (x, y), searching outward in rings. */
export function nearestWalkable(map: MapDef, x: number, y: number, maxRing = 12): Waypoint | null {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (isWalkableTile(map, cx, cy)) return { x: cx + 0.5, y: cy + 0.5 };
  for (let r = 1; r <= maxRing; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (isWalkableTile(map, cx + dx, cy + dy)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
      }
    }
  }
  return null;
}

/**
 * Binary min-heap of open nodes ordered by f, then by insertion order. The tie-break is the
 * same one a linear "first lowest f" scan makes, so paths match the scan exactly.
 */
class OpenHeap {
  private readonly items: { i: number; f: number; seq: number }[] = [];
  private seq = 0;
  get size(): number {
    return this.items.length;
  }
  private less(a: number, b: number): boolean {
    const x = this.items[a] as { f: number; seq: number };
    const y = this.items[b] as { f: number; seq: number };
    return x.f < y.f || (x.f === y.f && x.seq < y.seq);
  }
  private swap(a: number, b: number): void {
    const t = this.items[a] as { i: number; f: number; seq: number };
    this.items[a] = this.items[b] as { i: number; f: number; seq: number };
    this.items[b] = t;
  }
  push(i: number, f: number): void {
    this.items.push({ i, f, seq: this.seq++ });
    let k = this.items.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (!this.less(k, p)) break;
      this.swap(k, p);
      k = p;
    }
  }
  pop(): { i: number; f: number } {
    const top = this.items[0] as { i: number; f: number };
    const last = this.items.pop() as { i: number; f: number; seq: number };
    if (this.items.length > 0) {
      this.items[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < this.items.length && this.less(l, m)) m = l;
        if (r < this.items.length && this.less(r, m)) m = r;
        if (m === k) break;
        this.swap(k, m);
        k = m;
      }
    }
    return top;
  }
}

/**
 * A* over tiles with 8-way movement (no corner cutting). Returns tile-centre waypoints
 * excluding the start tile, or null when unreachable. Bounded by maxNodes.
 */
export function findPath(
  map: MapDef,
  from: Waypoint,
  to: Waypoint,
  maxNodes = 20000,
): Waypoint[] | null {
  const g = gridOf(map);
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  let goal = { x: Math.floor(to.x), y: Math.floor(to.y) };
  if (!isWalkableTile(map, goal.x, goal.y)) {
    const near = nearestWalkable(map, to.x, to.y);
    if (!near) return null;
    goal = { x: Math.floor(near.x), y: Math.floor(near.y) };
  }
  if (sx === goal.x && sy === goal.y) return [];
  const w = g.width;
  const idx = (x: number, y: number) => y * w + x;
  const gScore = new Map<number, number>();
  const came = new Map<number, number>();
  const open = new OpenHeap();
  const startI = idx(sx, sy);
  gScore.set(startI, 0);
  open.push(startI, 0);
  const closed = new Set<number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  let expanded = 0;
  while (open.size > 0) {
    const cur = open.pop();
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
    if (++expanded > maxNodes) return null;
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
          open.push(ni, cost + h(nx, ny));
        }
      }
    }
  }
  return null;
}
