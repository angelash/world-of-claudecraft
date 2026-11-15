// Battle-grid terrain: per-terrain modifiers (warfare_rts.md 5.1), tile lookup, a line
// check and a binary-heap A* with terrain move costs. Pure functions over plain data.

import type { BattleTerrain } from './types';

export interface TerrainInfo {
  /** movement speed factor (0 = impassable) */
  move: number;
  /** damage factor for melee damage taken by a defender standing here */
  meleeTaken: number;
  /** damage factor for ranged damage taken by a defender standing here */
  rangedTaken: number;
  /** fatigue build-up factor */
  fatigue: number;
  passable: boolean;
  /** high ground: ranged reach and damage bonus for shooters standing here */
  high: boolean;
}

const T = (
  move: number,
  meleeTaken: number,
  rangedTaken: number,
  fatigue: number,
  high = false,
): TerrainInfo => ({ move, meleeTaken, rangedTaken, fatigue, passable: move > 0, high });

/** Initial values from warfare_rts.md 5.1 (tunable). */
export const TERRAIN: Record<BattleTerrain, TerrainInfo> = {
  plain: T(1, 1, 1, 1),
  road: T(1.3, 1, 1, 0.9),
  forest: T(0.6, 0.9, 0.7, 1.2),
  hill: T(0.7, 0.9, 0.9, 1.2, true),
  ford: T(0.4, 1.3, 1.15, 1.5),
  water: T(0, 1, 1, 1),
  wall: T(0, 1, 1, 1),
  swamp: T(0.5, 1, 1, 2),
  snow: T(0.7, 1, 1, 1.5),
  dian: T(1, 1, 1, 1),
  building: T(0, 1, 1, 1),
};

export interface GridLike {
  width: number;
  height: number;
  rows: string[];
  legend: Record<string, BattleTerrain>;
}

export function terrainAtTile(g: GridLike, tx: number, ty: number): BattleTerrain {
  if (tx < 0 || ty < 0 || tx >= g.width || ty >= g.height) return 'wall';
  const ch = g.rows[ty]?.[tx] ?? '';
  return g.legend[ch] ?? 'plain';
}

export function terrainAt(g: GridLike, x: number, y: number): BattleTerrain {
  return terrainAtTile(g, Math.floor(x), Math.floor(y));
}

export function passableTile(g: GridLike, tx: number, ty: number): boolean {
  return TERRAIN[terrainAtTile(g, tx, ty)].passable;
}

/** Nearest passable tile centre (ring search). */
export function nearestPassable(g: GridLike, x: number, y: number): { x: number; y: number } {
  const cx = Math.floor(x);
  const cy = Math.floor(y);
  if (passableTile(g, cx, cy)) return { x, y };
  for (let r = 1; r < 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (passableTile(g, cx + dx, cy + dy)) return { x: cx + dx + 0.5, y: cy + dy + 0.5 };
      }
    }
  }
  return { x, y };
}

/** True when the straight segment crosses only passable tiles (sampled every 0.4 tile). */
export function lineClear(
  g: GridLike,
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  const d = Math.hypot(to.x - from.x, to.y - from.y);
  const n = Math.max(1, Math.ceil(d / 0.4));
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    if (!passableTile(g, Math.floor(x), Math.floor(y))) return false;
  }
  return true;
}

// Minimal binary heap of [priority, value] pairs.
class Heap {
  private pri: number[] = [];
  private val: number[] = [];
  get size(): number {
    return this.val.length;
  }
  push(p: number, v: number): void {
    this.pri.push(p);
    this.val.push(v);
    let i = this.val.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if ((this.pri[parent] as number) <= p) break;
      this.swap(i, parent);
      i = parent;
    }
  }
  pop(): number {
    const top = this.val[0] as number;
    const lastP = this.pri.pop() as number;
    const lastV = this.val.pop() as number;
    if (this.val.length > 0) {
      this.pri[0] = lastP;
      this.val[0] = lastV;
      let i = 0;
      const n = this.val.length;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < n && (this.pri[l] as number) < (this.pri[m] as number)) m = l;
        if (r < n && (this.pri[r] as number) < (this.pri[m] as number)) m = r;
        if (m === i) break;
        this.swap(i, m);
        i = m;
      }
    }
    return top;
  }
  private swap(a: number, b: number): void {
    const p = this.pri[a] as number;
    this.pri[a] = this.pri[b] as number;
    this.pri[b] = p;
    const v = this.val[a] as number;
    this.val[a] = this.val[b] as number;
    this.val[b] = v;
  }
}

/**
 * Terrain-weighted A* (8-way, no corner cutting). Returns tile-centre waypoints excluding
 * the start, ending at the goal point itself; null when unreachable.
 */
export function findBattlePath(
  g: GridLike,
  from: { x: number; y: number },
  to: { x: number; y: number },
  maxNodes = 4000,
): { x: number; y: number }[] | null {
  const sx = Math.floor(from.x);
  const sy = Math.floor(from.y);
  const goal = nearestPassable(g, to.x, to.y);
  const gx = Math.floor(goal.x);
  const gy = Math.floor(goal.y);
  if (sx === gx && sy === gy) return [{ x: goal.x, y: goal.y }];
  const w = g.width;
  const cost = new Map<number, number>();
  const came = new Map<number, number>();
  const closed = new Set<number>();
  const heap = new Heap();
  const start = sy * w + sx;
  cost.set(start, 0);
  heap.push(0, start);
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - gx);
    const dy = Math.abs(y - gy);
    return (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)) / 1.3;
  };
  let expanded = 0;
  while (heap.size > 0) {
    const cur = heap.pop();
    if (closed.has(cur)) continue;
    closed.add(cur);
    const cx = cur % w;
    const cy = Math.floor(cur / w);
    if (cx === gx && cy === gy) {
      const out: { x: number; y: number }[] = [{ x: goal.x, y: goal.y }];
      let i = came.get(cur);
      while (i !== undefined && i !== start) {
        out.push({ x: (i % w) + 0.5, y: Math.floor(i / w) + 0.5 });
        i = came.get(i);
      }
      return out.reverse();
    }
    if (++expanded > maxNodes) return null;
    const base = cost.get(cur) as number;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (!passableTile(g, nx, ny)) continue;
        if (
          dx !== 0 &&
          dy !== 0 &&
          (!passableTile(g, cx + dx, cy) || !passableTile(g, cx, cy + dy))
        )
          continue;
        const ni = ny * w + nx;
        if (closed.has(ni)) continue;
        const mv = TERRAIN[terrainAtTile(g, nx, ny)].move;
        const c = base + (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1) / mv;
        if (c < (cost.get(ni) ?? Number.POSITIVE_INFINITY)) {
          cost.set(ni, c);
          came.set(ni, cur);
          heap.push(c + h(nx, ny), ni);
        }
      }
    }
  }
  return null;
}
