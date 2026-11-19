// Minimap model: one pixel per tile coloured by kind, the scale that fits a map into the
// minimap box, and dot colours by relation. Pure; Node-tested.

import { tileAt } from '../../systems/world/grid';
import type { MapDef, TileKind } from '../../systems/world/types';
import { activePalette } from '../render/palette_modes';
import type { Relation } from '../render/scene';
import { createMatrix, type PixelMatrix, type Rgb, setPixel } from '../sprites/pixels';

export const MINIMAP_TILE_COLORS: Record<TileKind, Rgb> = {
  grass: 0x5a8a45,
  dirt: 0x8a6a48,
  road: 0xb09a72,
  stone: 0x8c8a84,
  floor: 0x94663a,
  sand: 0xd8c48e,
  ash: 0x5e5a58,
  snow: 0xdde6f0,
  crop: 0x7a8a3a,
  bridge: 0x8a6440,
  door: 0xe2b04a,
  water: 0x3a74b0,
  deep_water: 0x274f86,
  wall: 0x4a4844,
  tree: 0x2f5a2e,
  rock: 0x6e6c66,
  void: 0x101018,
};

export function minimapMatrix(map: MapDef): PixelMatrix {
  const m = createMatrix(map.width, map.height);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) setPixel(m, x, y, MINIMAP_TILE_COLORS[tileAt(map, x, y)]);
  }
  return m;
}

/** Largest scale (may be fractional below 1) that fits the map inside the box. */
export function minimapScale(mapW: number, mapH: number, boxW: number, boxH: number): number {
  if (mapW <= 0 || mapH <= 0) return 1;
  const s = Math.min(boxW / mapW, boxH / mapH);
  return s >= 1 ? Math.floor(s) : s;
}

/** Dot colours in the standard palette (minimap and map window). */
export const DOT_COLORS: Record<Relation | 'exit', string> = {
  self: '#ffffff',
  hostile: '#ff5a48',
  friendly: '#7ee07a',
  neutral: '#f0d050',
  exit: '#f2c94c',
};

/** A dot colour in the active colour-vision palette (18.2; ../render/palette_modes.ts). */
export function dotColor(kind: Relation | 'exit' | 'danger'): string {
  return activePalette().dots[kind];
}
