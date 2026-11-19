// Non-character art at the existing pixel seams: exact catalog ids, decoded sheets and the
// import's frame rectangles. Missing, unapproved or undecoded art returns null so the caller
// keeps its procedural picture. Crops are cached by the decoded sheet itself: reinstalling
// pixels under the same asset id cannot retain the old crop.

import { styleOf, type WallMaterial } from '../../systems/world/look';
import type { MapDef, TileKind } from '../../systems/world/types';
import { createMatrix, hash3, type PixelMatrix } from '../sprites/pixels';
import { cropMatrix } from './frames';
import { bitmapPixels, installedResolver } from './runtime';

export interface SurfaceFrame {
  id: string;
  pixels: PixelMatrix;
  anchorX: number;
  anchorY: number;
}

const crops = new WeakMap<PixelMatrix, Map<string, PixelMatrix>>();

/** One catalog asset's exact frame, preserving its transparent pixels and recorded anchor. */
export function surfaceFrame(id: string, variant = 0): SurfaceFrame | null {
  const hit = installedResolver().lookup(id);
  const sheet = bitmapPixels(id);
  if (!hit.ok || !sheet || !hit.meta.frames.length) return null;
  const n = Math.abs(Math.floor(variant)) % hit.meta.frames.length;
  const frame = hit.meta.frames[n];
  if (!frame || frame.w <= 0 || frame.h <= 0) return null;
  let cache = crops.get(sheet);
  if (!cache) {
    cache = new Map();
    crops.set(sheet, cache);
  }
  const key = `${id}:${n}:${frame.x}:${frame.y}:${frame.w}:${frame.h}`;
  let pixels = cache.get(key);
  if (!pixels) {
    pixels = cropMatrix(sheet, frame.x, frame.y, frame.w, frame.h);
    cache.set(key, pixels);
  }
  return {
    id,
    pixels,
    anchorX: frame.ax ?? Math.floor(frame.w / 2),
    anchorY: frame.ay ?? frame.h - 1,
  };
}

// Exact ids from assets/prompts/specs/tiles.json. `ref` maps to TileKind; art sampling is
// across a four-metre block, not a resized copy of the whole 64-pixel tile in every metre.
const GROUND_IDS: Readonly<Record<string, Partial<Record<TileKind, readonly string[]>>>> = {
  lothar_plain: {
    grass: ['art_tile_lothar_plain_grass_01', 'art_tile_lothar_plain_grass_02'],
    dirt: ['art_tile_lothar_plain_dirt_road_01', 'art_tile_lothar_plain_dirt_road_02'],
    road: ['art_tile_lothar_plain_gravel_road_01'],
  },
  door_corridor: {
    floor: ['art_tile_door_corridor_mirror_floor_01', 'art_tile_door_corridor_keywork_mosaic_01'],
  },
};

/** Current style's available tile, selected once per 4x4 metre block. */
export function groundSurface(
  map: Pick<MapDef, 'style' | 'region' | 'indoor'>,
  kind: TileKind,
  x: number,
  y: number,
): SurfaceFrame | null {
  const ground = kind === 'tree' ? 'grass' : kind === 'rock' ? 'dirt' : kind;
  const ids = GROUND_IDS[styleOf(map)]?.[ground];
  if (!ids) return null;
  const available = ids.map((id) => surfaceFrame(id)).filter((v) => v !== null);
  if (!available.length) return null;
  return available[hash3(Math.floor(x / 4), Math.floor(y / 4), 913) % available.length] ?? null;
}

const WALL_IDS: Readonly<Record<string, Partial<Record<WallMaterial, string>>>> = {
  lothar_plain: {
    stone: 'art_bld_lothar_plain_wall_stone',
    timber_plaster: 'art_bld_lothar_plain_wall_timber_plaster',
  },
  sealed_ruins: { ruin_stone: 'art_bld_sealed_ruins_wall_cold_ashlar' },
  door_corridor: {
    basalt: 'art_bld_door_corridor_wall_keywork_panel',
    ruin_stone: 'art_bld_door_corridor_wall_keywork_panel',
  },
};

export function wallSurface(style: string, material: WallMaterial): SurfaceFrame | null {
  const id = WALL_IDS[style]?.[material];
  return id ? surfaceFrame(id) : null;
}

/** Existing rock placements in the ash waste use the catalog's four scatter variants. */
export function rockSurface(style: string, variant: number): SurfaceFrame | null {
  return style === 'ash_waste' ? surfaceFrame('art_prop_ash_waste_stones', variant) : null;
}

const CAST_IDS: Readonly<Record<string, string>> = {
  arcane: 'art_vfx_school_arcane_cast',
  fire: 'art_vfx_school_fire_cast',
  frost: 'art_vfx_school_frost_cast',
  nature: 'art_vfx_school_nature_cast',
  shadow: 'art_vfx_school_shadow_cast',
};

/** A cosmetic casting frame follows the existing simulation cast clock and import timing. */
export function castSurface(school: string | undefined, elapsedMs: number): SurfaceFrame | null {
  const id = school ? CAST_IDS[school] : undefined;
  if (!id) return null;
  const hit = installedResolver().lookup(id);
  if (!hit.ok || !hit.meta.frames.length) return null;
  const frames = hit.meta.frames;
  const cycle = frames.reduce((sum, frame) => sum + Math.max(1, frame.ms ?? 70), 0);
  let time = Math.max(0, elapsedMs) % cycle;
  for (let i = 0; i < frames.length; i++) {
    time -= Math.max(1, frames[i]?.ms ?? 70);
    if (time < 0) return surfaceFrame(id, i);
  }
  return surfaceFrame(id, 0);
}

export type IconKind = 'item' | 'door' | 'deed' | 'system' | 'skill';

/** Catalog icon naming with the resolver's existing content aliases; no speculative icon. */
export function contentIconPixels(kind: IconKind, contentId: string): SurfaceFrame | null {
  const subject = installedResolver().subject(contentId);
  const id = subject.startsWith('art_ico_')
    ? subject
    : kind === 'door' || kind === 'deed'
      ? `art_ico_${subject.startsWith(`${kind}_`) ? subject : `${kind}_${subject}`}`
      : `art_ico_${kind === 'system' ? 'sys' : kind}_${subject}`;
  return surfaceFrame(id);
}

/** Centre at an integer multiple or divisor, nearest-neighbour, without losing alpha. */
export function fitIconPixels(pixels: PixelMatrix, size: number): PixelMatrix {
  const side = Math.max(1, Math.floor(size));
  const out = createMatrix(side, side);
  if (pixels.w <= 0 || pixels.h <= 0) return out;
  const dimension = Math.max(pixels.w, pixels.h);
  const scale = dimension <= side ? Math.floor(side / dimension) : 1 / Math.ceil(dimension / side);
  const w = Math.max(1, Math.floor(pixels.w * scale));
  const h = Math.max(1, Math.floor(pixels.h * scale));
  const left = Math.floor((side - w) / 2);
  const top = Math.floor((side - h) / 2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.min(pixels.w - 1, Math.floor(x / scale));
      const sy = Math.min(pixels.h - 1, Math.floor(y / scale));
      const from = (sy * pixels.w + sx) * 4;
      const to = ((top + y) * side + left + x) * 4;
      out.rgba.set(pixels.rgba.subarray(from, from + 4), to);
    }
  }
  return out;
}
