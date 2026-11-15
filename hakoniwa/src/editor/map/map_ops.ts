// Map editing operations. Every operation returns a NEW MapDef (or the same object
// when nothing changed) and never mutates its input: the world system caches its
// walkability grid per MapDef object (systems/world/grid.ts gridOf), and the undo
// stack keeps old maps as snapshots. Pure: no DOM.

import type {
  ExitDef,
  LocationDef,
  MapDef,
  Rect,
  SpawnDef,
  TileKind,
} from '../../systems/world/types';
import { uniqueId } from '../content/form_model';
import { T } from '../text';

export { uniqueId } from '../content/form_model';

export interface Cell {
  x: number;
  y: number;
}

export type ObjectKind = 'location' | 'spawn' | 'exit';

export interface ObjectRef {
  kind: ObjectKind;
  id: string;
}

type MapObject = LocationDef | SpawnDef | ExitDef;

const LIST_KEY = { location: 'locations', spawn: 'spawns', exit: 'exits' } as const;

/** Structural check before a row is treated as a map (half-edited JSON is common). */
export function isMapLike(v: unknown): v is MapDef {
  if (!v || typeof v !== 'object') return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    typeof m.width === 'number' &&
    typeof m.height === 'number' &&
    Array.isArray(m.rows) &&
    m.rows.every((r) => typeof r === 'string') &&
    !!m.legend &&
    typeof m.legend === 'object' &&
    !Array.isArray(m.legend) &&
    Array.isArray(m.locations) &&
    Array.isArray(m.spawns) &&
    Array.isArray(m.exits)
  );
}

export function blankMap(id: string, name: string, width = 24, height = 16): MapDef {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    if (y === 0 || y === height - 1) rows.push('#'.repeat(width));
    else rows.push(`#${'.'.repeat(Math.max(0, width - 2))}#`.slice(0, width));
  }
  return {
    id,
    name,
    region: '',
    width,
    height,
    rows,
    legend: { '.': 'grass', '#': 'wall' },
    locations: [],
    spawns: [],
    exits: [],
  };
}

export function inBounds(map: MapDef, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < map.width && y < map.height;
}

export function charAt(map: MapDef, x: number, y: number): string | undefined {
  if (!inBounds(map, x, y)) return undefined;
  return map.rows[y]?.[x];
}

export function kindAt(map: MapDef, x: number, y: number): TileKind | undefined {
  const ch = charAt(map, x, y);
  return ch === undefined ? undefined : map.legend[ch];
}

/** Set one character in each listed cell. Out-of-bounds cells are ignored. */
export function paintCells(map: MapDef, cells: readonly Cell[], ch: string): MapDef {
  const rows = [...map.rows];
  const touched = new Map<number, string[]>();
  let changed = false;
  for (const { x, y } of cells) {
    if (!inBounds(map, x, y)) continue;
    let chars = touched.get(y);
    if (!chars) {
      chars = [...(rows[y] ?? '').padEnd(map.width, ' ')];
      touched.set(y, chars);
    }
    if (chars[x] !== ch) {
      chars[x] = ch;
      changed = true;
    }
  }
  if (!changed) return map;
  for (const [y, chars] of touched) rows[y] = chars.join('');
  while (rows.length < map.height) rows.push(' '.repeat(map.width));
  return { ...map, rows };
}

/** Normalised rectangle covering two corner cells (inclusive). */
export function rectBetween(a: Cell, b: Cell): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(a.x - b.x) + 1, h: Math.abs(a.y - b.y) + 1 };
}

export function rectCells(rect: Rect): Cell[] {
  const out: Cell[] = [];
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) out.push({ x, y });
  }
  return out;
}

export function fillRect(map: MapDef, rect: Rect, ch: string): MapDef {
  return paintCells(map, rectCells(rect), ch);
}

/** Cells on the line from a to b (Bresenham), so fast strokes leave no gaps. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let x = a.x;
  let y = a.y;
  const dx = Math.abs(b.x - a.x);
  const dy = -Math.abs(b.y - a.y);
  const sx = a.x < b.x ? 1 : -1;
  const sy = a.y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Resize, keeping the top-left content and filling new cells with `fill`. */
export function resizeMap(map: MapDef, width: number, height: number, fill: string): MapDef {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  if (w === map.width && h === map.height) return map;
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    const src = y < map.rows.length ? (map.rows[y] as string) : '';
    rows.push(src.slice(0, w).padEnd(w, fill));
  }
  return { ...map, width: w, height: h, rows };
}

export function legendUsage(map: MapDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const ch of Object.keys(map.legend)) out[ch] = 0;
  for (const row of map.rows) for (const ch of row) out[ch] = (out[ch] ?? 0) + 1;
  return out;
}

export function setLegend(map: MapDef, ch: string, kind: TileKind): MapDef {
  if (map.legend[ch] === kind) return map;
  return { ...map, legend: { ...map.legend, [ch]: kind } };
}

/** Remove a legend entry; null when the character is still used by a tile. */
export function removeLegend(map: MapDef, ch: string): MapDef | null {
  if (!(ch in map.legend)) return map;
  if ((legendUsage(map)[ch] ?? 0) > 0) return null;
  const legend = { ...map.legend };
  delete legend[ch];
  return { ...map, legend };
}

/** First legend character whose kind matches (for painting a kind). */
export function charForKind(map: MapDef, kind: TileKind): string | undefined {
  return Object.keys(map.legend).find((ch) => map.legend[ch] === kind);
}

// ---------------------------------------------------------------------------
// Locations, spawns, exits

export function objectsOf(map: MapDef, kind: ObjectKind): MapObject[] {
  return map[LIST_KEY[kind]] as MapObject[];
}

export function findObject(map: MapDef, ref: ObjectRef): MapObject | undefined {
  return objectsOf(map, ref.kind).find((o) => o.id === ref.id);
}

function withList(map: MapDef, kind: ObjectKind, list: MapObject[]): MapDef {
  return { ...map, [LIST_KEY[kind]]: list } as MapDef;
}

export function addObject(map: MapDef, kind: ObjectKind, obj: MapObject): MapDef {
  return withList(map, kind, [...objectsOf(map, kind), obj]);
}

/** Merge a patch into one object; a patch value of undefined removes that key. */
export function updateObject(map: MapDef, ref: ObjectRef, patch: Record<string, unknown>): MapDef {
  const list = objectsOf(map, ref.kind);
  const idx = list.findIndex((o) => o.id === ref.id);
  if (idx < 0) return map;
  const next: Record<string, unknown> = { ...(list[idx] as unknown as Record<string, unknown>) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) delete next[k];
    else next[k] = v;
  }
  const out = [...list];
  out[idx] = next as unknown as MapObject;
  return withList(map, ref.kind, out);
}

export function removeObject(map: MapDef, ref: ObjectRef): MapDef {
  const list = objectsOf(map, ref.kind);
  const out = list.filter((o) => o.id !== ref.id);
  return out.length === list.length ? map : withList(map, ref.kind, out);
}

export function moveObject(map: MapDef, ref: ObjectRef, dx: number, dy: number): MapDef {
  if (dx === 0 && dy === 0) return map;
  const obj = findObject(map, ref);
  if (!obj) return map;
  return updateObject(map, ref, { x: obj.x + dx, y: obj.y + dy });
}

/** The cell an object is drawn on (locations: their top-left cell). */
export function objectCell(obj: MapObject): Cell {
  return { x: Math.floor(obj.x), y: Math.floor(obj.y) };
}

export function locationCentre(loc: Rect): { x: number; y: number } {
  return { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 };
}

/** Topmost object at a cell: exits, then spawns, then the smallest location. */
export function hitTest(map: MapDef, x: number, y: number): ObjectRef | null {
  for (const e of map.exits)
    if (Math.floor(e.x) === x && Math.floor(e.y) === y) {
      return { kind: 'exit', id: e.id };
    }
  for (const s of map.spawns)
    if (Math.floor(s.x) === x && Math.floor(s.y) === y) {
      return { kind: 'spawn', id: s.id };
    }
  let best: LocationDef | undefined;
  for (const l of map.locations) {
    if (x < l.x || y < l.y || x >= l.x + l.w || y >= l.y + l.h) continue;
    if (!best || l.w * l.h < best.w * best.h) best = l;
  }
  return best ? { kind: 'location', id: best.id } : null;
}

function allObjectIds(map: MapDef, kind: ObjectKind): string[] {
  return objectsOf(map, kind).map((o) => o.id);
}

export function newLocation(map: MapDef, rect: Rect): LocationDef {
  return {
    id: uniqueId('loc', allObjectIds(map, 'location')),
    name: T.map.newLocationName,
    kind: 'plaza',
    x: rect.x,
    y: rect.y,
    w: rect.w,
    h: rect.h,
  };
}

export function newSpawn(map: MapDef, cell: Cell): SpawnDef {
  return {
    id: uniqueId(`${map.id}_spawn`, allObjectIds(map, 'spawn')),
    kind: 'monster',
    ref: '',
    x: cell.x + 0.5,
    y: cell.y + 0.5,
  };
}

export function newExit(map: MapDef, cell: Cell): ExitDef {
  return {
    id: uniqueId('exit', allObjectIds(map, 'exit')),
    x: cell.x,
    y: cell.y,
    toMap: '',
    toX: 0,
    toY: 0,
    label: T.map.newExitLabel,
  };
}

/** The map with a new id, keeping everything else. */
export function renameMap(map: MapDef, id: string): MapDef {
  return map.id === id ? map : { ...map, id };
}
