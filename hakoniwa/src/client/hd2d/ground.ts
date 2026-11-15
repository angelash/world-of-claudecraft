// Ground and water data for the HD-2D scene (art_pipeline.md 2.5): the whole map's ground
// baked once into one pixel texture in the style pack's colours (walls flat, since the
// scene extrudes them), and a one-pixel-per-tile water mask the ground shader animates
// (pixel wave lines and glints on shallow and deep water). Pure; Node-tested.

import { tileAt } from '../../systems/world/grid';
import type { MapDef } from '../../systems/world/types';
import { bakeGround } from '../render/tile_art';
import type { PixelMatrix } from '../sprites/pixels';
import type { StylePack } from './style_packs';

export function paintGround(map: MapDef, pack: StylePack): PixelMatrix {
  return bakeGround(map, 0, { ramps: pack.ground, wallFaces: false });
}

/** RGBA per tile: R 255 on water, G 255 on deep water, A 255 everywhere. */
export function waterMask(map: MapDef): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(map.width * map.height * 4);
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const k = tileAt(map, x, y);
      const o = (y * map.width + x) * 4;
      out[o] = k === 'water' || k === 'deep_water' ? 255 : 0;
      out[o + 1] = k === 'deep_water' ? 255 : 0;
      out[o + 3] = 255;
    }
  }
  return out;
}

export function hasWater(mask: Uint8Array<ArrayBufferLike>): boolean {
  for (let i = 0; i < mask.length; i += 4) if ((mask[i] as number) > 0) return true;
  return false;
}
