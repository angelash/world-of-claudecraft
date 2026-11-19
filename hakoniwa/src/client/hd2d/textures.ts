// Procedural pixel textures for building shells and roofs (art_pipeline.md 1.7, 2.6 and
// 6.2): every wall material and roofing is painted by code at 16 pixels per metre, flat
// colours with an upper-left light, no gradients. A wall atlas holds one 16-pixel column
// per face cell (plain, plain variant, window, interior side, wall cap) and a matching
// emissive atlas lights the window panes at night. Pure; Node-tested.

import type { Roofing, WallMaterial } from '../../systems/world/look';
import { wallSurface } from '../assets/surface_art';
import { TILE_PX } from '../render/camera';
import { createMatrix, hash3, type PixelMatrix, type Rgb, setPixel } from '../sprites/pixels';
import type { FaceCell } from './layout';
import type { MaterialColors } from './style_packs';

export const ATLAS_CELLS: readonly (FaceCell | 'cap')[] = [
  'plain',
  'plain2',
  'pane',
  'inner',
  'cap',
];

export function cellIndex(cell: FaceCell | 'cap'): number {
  return ATLAS_CELLS.indexOf(cell);
}

/** Pixel height of a wall of `metres` (at least one tile so the cap cell fits). */
export function wallPixels(metres: number): number {
  return Math.max(TILE_PX, Math.round(metres * TILE_PX));
}

function shadeRgb(c: Rgb, k: number): Rgb {
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return (ch((c >> 16) & 0xff) << 16) | (ch((c >> 8) & 0xff) << 8) | ch(c & 0xff);
}

/** One wall column (16 wide, h tall) in a material; `seed` varies blocks between cells. */
function paintMaterial(
  m: PixelMatrix,
  ox: number,
  h: number,
  mat: WallMaterial,
  col: MaterialColors,
  seed: number,
  brace: boolean,
): void {
  const [base, dark, light, trim] = col;
  const S = TILE_PX;
  const n = (x: number, y: number, s = 0) => hash3(x + seed * 13, y + s * 7, seed + 101) % 100;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < S; x++) {
      let c: Rgb = base;
      let clear = false;
      switch (mat) {
        case 'timber_plaster': {
          if (x <= 1) c = x === 0 ? light : dark;
          else if (y <= 1 || y >= h - 2) c = y === 0 ? light : dark;
          else if (brace && Math.abs(x - 2 - (((y * 12) / Math.max(1, h - 3)) % 14)) < 1.1)
            c = dark;
          else if (n(x, y) > 94) c = light;
          else if (n(x, y) < 4) c = shadeRgb(base, 0.93);
          break;
        }
        case 'whitewash': {
          if (y >= h - 3) c = n(x, y) > 40 ? dark : shadeRgb(base, 0.85);
          else if (n(x, y) > 95) c = light;
          else if (n(x, y) < 5) c = shadeRgb(base, 0.94);
          break;
        }
        case 'stone':
        case 'ruin_stone':
        case 'marble': {
          const row = Math.floor(y / 5);
          const off = (row % 2) * 4 + (seed % 3);
          const cx = (x + off) % 8;
          const cy = y % 5;
          if (cy === 4 || cx === 7) c = dark;
          else if (cy === 0 || cx === 0) c = light;
          else if (n(Math.floor((x + off) / 8), row, 1) > 70) c = shadeRgb(base, 0.92);
          if (mat === 'ruin_stone' && n(x, y, 3) > 92 && y > h / 2) c = 0x5a7a4a;
          if (mat === 'marble' && n(x, y, 4) > 96) c = 0xd8cfc0;
          break;
        }
        case 'brick': {
          const row = Math.floor(y / 3);
          const off = (row % 2) * 3;
          if (y % 3 === 2 || (x + off) % 6 === 5) c = dark;
          else if (n(Math.floor((x + off) / 6), row, 2) > 75) c = light;
          break;
        }
        case 'plank':
        case 'palisade': {
          const w = 4;
          const p = x % w;
          if (p === w - 1) c = dark;
          else if (p === 0) c = light;
          else if (n(x, y) > 96) c = dark;
          if (mat === 'palisade') {
            const tip = Math.abs((x % w) - 1.5);
            // Sharpened stake tips: transparent corners above each stake.
            if (y < 3 && tip > 0.5 + y * 0.5) clear = true;
          }
          break;
        }
        case 'log': {
          const r = y % 4;
          c = r === 0 ? light : r === 3 ? dark : base;
          if (x === S - 1 && n(0, Math.floor(y / 4)) > 50) c = trim;
          break;
        }
        case 'basalt': {
          const p = x % 5;
          c = p === 4 ? dark : p === 0 ? light : base;
          if (n(x, y, 5) > 97) c = trim;
          break;
        }
      }
      if (clear) setPixel(m, ox + x, y, 0, 0);
      else setPixel(m, ox + x, y, c);
    }
  }
  // A one-pixel trim along the top edge (the wall plate) except on palisades.
  if (mat !== 'palisade') for (let x = 0; x < S; x++) setPixel(m, ox + x, 0, trim);
}

export interface WallAtlas {
  color: PixelMatrix;
  emissive: PixelMatrix;
  /** pixel height of a full wall (the atlas height) */
  heightPx: number;
}

/**
 * The wall atlas of one building or of the free walls: cells in ATLAS_CELLS order, each
 * 16 pixels wide. Windows sit from 1.0 to 2.0 m (and 2.8 to 3.8 m on walls of 4 m and up).
 */
export function paintWallAtlas(
  mat: WallMaterial,
  col: MaterialColors,
  metres: number,
  glow: Rgb,
  seed: number,
  interior: Rgb = 0xd8ccb4,
  style?: string,
): WallAtlas {
  const S = TILE_PX;
  const h = wallPixels(metres);
  const color = createMatrix(S * ATLAS_CELLS.length, h);
  const emissive = createMatrix(S * ATLAS_CELLS.length, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < emissive.w; x++) setPixel(emissive, x, y, 0x000000);
  const [, dark, light, trim] = col;
  paintMaterial(color, 0, h, mat, col, seed, false);
  paintMaterial(color, S, h, mat, col, seed + 1, mat === 'timber_plaster');
  paintMaterial(color, S * 2, h, mat, col, seed + 2, false);
  const surface = style ? wallSurface(style, mat) : null;
  if (surface) {
    const image = surface.pixels;
    // Exterior cells reuse the seamless wall's actual world-pixel scale; generated window
    // frames and the interior are applied later and retain their gameplay/readability cues.
    for (let cell = 0; cell < 3; cell++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < S; x++) {
          const sx = (x + cell * S) % image.w;
          const sy = y % image.h;
          const si = (sy * image.w + sx) * 4;
          const di = (y * color.w + cell * S + x) * 4;
          const alpha = (image.rgba[si + 3] ?? 0) / 255;
          for (let c = 0; c < 3; c++)
            color.rgba[di + c] = Math.round(
              (image.rgba[si + c] ?? 0) * alpha + (color.rgba[di + c] ?? 0) * (1 - alpha),
            );
        }
      }
    }
  }
  // Window: frame, two panes with a mullion, sill.
  const rows: [number, number][] = [[1.0, 2.0]];
  if (metres >= 4) rows.push([2.8, 3.8]);
  for (const [lo, hi] of rows) {
    const top = h - Math.round(hi * S);
    const bottom = h - Math.round(lo * S);
    if (top < 1) continue;
    for (let y = top; y < bottom; y++) {
      for (let x = 3; x < 13; x++) {
        const frame = x === 3 || x === 12 || y === top || y === bottom - 1;
        const mullion = x === 7 || x === 8 || y === Math.floor((top + bottom) / 2);
        const ox = S * 2 + x;
        if (frame) setPixel(color, ox, y, trim);
        else if (mullion) setPixel(color, ox, y, dark);
        else {
          const sky = y < top + 3 && x < 7 ? 0x9ab8d0 : 0x3a4a5e;
          setPixel(color, ox, y, sky);
          setPixel(emissive, ox, y, (x + y) % 5 === 0 ? shadeRgb(glow, 0.8) : glow);
        }
      }
    }
    for (let x = 2; x < 14; x++) setPixel(color, S * 2 + x, bottom, light);
  }
  // Interior side: plaster above a wooden wainscot.
  const wain = h - Math.round(1.0 * S);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < S; x++) {
      let c: Rgb = interior;
      if (y >= wain) c = y === wain ? 0x6e4a2a : x % 4 === 3 ? 0x6e4a2a : 0x8a603a;
      else if (hash3(x, y, seed + 5) % 97 === 0) c = shadeRgb(interior, 0.92);
      setPixel(color, S * 3 + x, y, c);
    }
  }
  // Cap: the top of the wall seen from above.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < S; x++) {
      const edge = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      setPixel(color, S * 4 + x, y, edge ? dark : (x + y) % 6 === 0 ? light : trim);
    }
  }
  return { color, emissive, heightPx: h };
}

/**
 * A roof slope texture of `wPx` along the ridge by `lPx` down the slope (top row = ridge,
 * bottom rows = eave). Courses run along the ridge; the ridge cap and the eave are drawn.
 */
export function paintRoof(
  roofing: Roofing,
  colors: readonly [Rgb, Rgb, Rgb],
  wPx: number,
  lPx: number,
  seed: number,
): PixelMatrix {
  const [base, dark, light] = colors;
  const w = Math.max(4, wPx);
  const l = Math.max(4, lPx);
  const m = createMatrix(w, l);
  const n = (x: number, y: number, s = 0) => hash3(x + seed, y + s * 31, seed * 3 + 7) % 100;
  for (let y = 0; y < l; y++) {
    for (let x = 0; x < w; x++) {
      let c: Rgb = base;
      switch (roofing) {
        case 'tile': {
          const row = Math.floor(y / 3);
          const off = (row % 2) * 2;
          const cx = (x + off) % 4;
          const cy = y % 3;
          if (cy === 2) c = dark;
          else if (cx === 3) c = shadeRgb(base, 0.82);
          else if (cy === 0 && cx === 1) c = light;
          if (n(Math.floor((x + off) / 4), row) > 92) c = shadeRgb(c, 0.88);
          break;
        }
        case 'slate': {
          const row = Math.floor(y / 3);
          const off = (row % 2) * 3;
          if (y % 3 === 2 || (x + off) % 5 === 4) c = dark;
          else if (y % 3 === 0 && n(x, row) > 60) c = light;
          break;
        }
        case 'shingle': {
          const row = Math.floor(y / 4);
          const off = hash3(row, seed, 3) % 5;
          const cx = (x + off) % 5;
          if (y % 4 === 3) c = dark;
          else if (cx === 4) c = shadeRgb(base, 0.8);
          else if (y % 4 === 0) c = light;
          break;
        }
        case 'thatch': {
          const strand = n(x, Math.floor(y / 2));
          c = strand > 70 ? light : strand < 20 ? dark : base;
          if (y % 6 === 5) c = shadeRgb(base, 0.78);
          break;
        }
        case 'gold_leaf': {
          if (y % 4 === 3) c = dark;
          else if (n(x, y) > 93) c = 0xfff4c8;
          else if (y % 4 === 0) c = light;
          break;
        }
        case 'scorched': {
          if (n(x, y) < 6) c = 0x8a3a1a;
          else if (y % 5 === 4) c = dark;
          else if (n(x, y, 2) > 90) c = light;
          break;
        }
      }
      if (y <= 1) c = y === 0 ? light : dark;
      else if (y >= l - 2) c = y === l - 1 ? shadeRgb(dark, 0.8) : dark;
      setPixel(m, x, y, c);
    }
  }
  return m;
}

/** A door leaf (16 wide, 2.1 m tall): vertical planks, two iron bands, a ring handle. */
export function paintDoor(color: Rgb): PixelMatrix {
  const S = TILE_PX;
  const h = Math.round(2.1 * S);
  const m = createMatrix(S, h);
  const dark = shadeRgb(color, 0.7);
  const light = shadeRgb(color, 1.2);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < S; x++) {
      let c: Rgb = color;
      if (x <= 1 || x >= S - 2 || y <= 1) c = 0x3a2a1c;
      else if ((x - 2) % 4 === 3) c = dark;
      else if ((x - 2) % 4 === 0) c = light;
      if ((y === 6 || y === h - 8) && x > 1 && x < S - 2) c = 0x4a4a52;
      setPixel(m, x, y, c);
    }
  }
  setPixel(m, S - 5, Math.floor(h / 2), 0xd8b04a);
  setPixel(m, S - 5, Math.floor(h / 2) + 1, 0x8a6a2a);
  return m;
}
