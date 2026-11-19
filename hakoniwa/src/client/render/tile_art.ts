// Procedural ground art (art_pipeline.md 2.5): one 16x16 texture per TileKind with a few
// variants, light from the upper left, ordered-dither transitions between soft ground
// kinds and shorelines on water, in the colours of a style pack's ground ramps. Tall
// tiles (trees, rocks) are standees, not ground. The HD-2D scene bakes the whole map once
// with flat walls (its walls are solid geometry); the flat fallback also paints wall
// front faces. Pure; Node-tested.

import { tileAt } from '../../systems/world/grid';
import type { MapDef, TileKind } from '../../systems/world/types';
import { groundSurface } from '../assets/surface_art';
import { mix, shadeRamp } from '../sprites/palette';
import {
  bayer4,
  blit,
  createMatrix,
  getPixel,
  hash3,
  type PixelMatrix,
  type Rgb,
  setPixel,
} from '../sprites/pixels';
import {
  autoShade,
  colorize,
  createShape,
  drawLine,
  fillEllipse,
  fillRect,
  outline,
  SLOT,
} from '../sprites/shape';
import { TILE_PX } from './camera';

export const TILE_VARIANTS = 4;
export const WATER_FRAMES = 2;

/** Ground the prop stands on. */
function groundUnder(kind: TileKind): TileKind {
  return kind === 'tree' ? 'grass' : kind === 'rock' ? 'dirt' : kind;
}

export function tileVariant(x: number, y: number, mapSalt: number): number {
  return hash3(x, y, mapSalt) % TILE_VARIANTS;
}

/** Default ground ramps (the lothar_plain style pack uses the same values). */
export const DEFAULT_GROUND_RAMPS = {
  grass: [0x4c7a3c, 0x5a8a45, 0x6a9c50, 0x80b05c],
  dirt: [0x76583a, 0x8a6a48, 0x9e7d58, 0xb3a08a],
  road: [0x9a845e, 0xb09a72, 0xc4ae86, 0x8a7656],
  stone: [0x6e6c66, 0x8c8a84, 0xa3a19a, 0xbab8b0],
  floor: [0x6e4a28, 0x94663a, 0xa0703f, 0xb0804c],
  sand: [0xc4ae78, 0xd8c48e, 0xe6d6a8, 0xb89e68],
  ash: [0x4a4644, 0x5e5a58, 0x77716c, 0xd86a3a],
  snow: [0xc8d4e4, 0xdde6f0, 0xeef3f8, 0xffffff],
  crop: [0x5e432a, 0x6e4f32, 0x5f9442, 0x7fb456],
  bridge: [0x5e3e22, 0x8a6440, 0x9a7448, 0xae8858],
  door: [0x4a2e18, 0x6e4626, 0x86582e, 0xe2b04a],
  water: [0x2f639c, 0x3a74b0, 0x5f98d0, 0xa8d0f0],
  deep_water: [0x1f4778, 0x274f86, 0x3a68a4, 0x6a98cc],
  wall: [0x5c5a56, 0x76736e, 0x8c8a86, 0xa4a29c],
  void: [0x101018, 0x15151f, 0x1b1b28, 0x22222e],
} as const;

const P = DEFAULT_GROUND_RAMPS;

type Ramp4 = readonly [Rgb, Rgb, Rgb, Rgb];
/** Ground colours by tile kind; kinds left out use the defaults. */
export type GroundRampSet = Partial<Record<TileKind, Ramp4>>;

function rampOf(kind: TileKind, ramps: GroundRampSet): Ramp4 {
  const k = groundUnder(kind);
  return (ramps[k] ?? (P as Record<string, Ramp4>)[k] ?? P.void) as Ramp4;
}

const texCache = new Map<string, PixelMatrix>();
const rampIds = new WeakMap<GroundRampSet, number>();
let nextRampId = 1;

function rampKey(ramps: GroundRampSet): number {
  let id = rampIds.get(ramps);
  if (id === undefined) {
    id = nextRampId++;
    rampIds.set(ramps, id);
  }
  return id;
}

/** 16x16 texture for a tile kind, variant and animation frame in a set of ground ramps. */
export function tileTexture(
  kind: TileKind,
  variant: number,
  frame = 0,
  ramps: GroundRampSet = P,
): PixelMatrix {
  const g = groundUnder(kind);
  const f = g === 'water' || g === 'deep_water' ? frame % WATER_FRAMES : 0;
  const key = `${rampKey(ramps)}:${g}:${variant}:${f}`;
  let m = texCache.get(key);
  if (!m) {
    m = paintTile(g, variant, frame % WATER_FRAMES, ramps);
    texCache.set(key, m);
  }
  return m;
}

function paintTile(
  kind: TileKind,
  variant: number,
  frame: number,
  ramps: GroundRampSet,
): PixelMatrix {
  const S = TILE_PX;
  const m = createMatrix(S, S);
  const [dark, base, light, extra] = rampOf(kind, ramps);
  const n = (x: number, y: number, salt = 0) =>
    hash3(x + variant * 31, y + salt * 17, kind.length * 101 + salt) % 100;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) setPixel(m, x, y, base);
  switch (kind) {
    case 'grass': {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const v = n(x, y);
          if (v < 14) setPixel(m, x, y, dark);
          else if (v > 90) setPixel(m, x, y, light);
        }
      for (let i = 0; i < 3; i++) {
        const bx = hash3(i, variant, 5) % S;
        const by = 2 + (hash3(i, variant, 9) % (S - 3));
        setPixel(m, bx, by - 1, extra);
        setPixel(m, bx, by, light);
        setPixel(m, bx, by + 1, dark);
      }
      break;
    }
    case 'dirt':
    case 'sand':
    case 'snow':
    case 'ash': {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const v = n(x, y);
          if (v < 12) setPixel(m, x, y, dark);
          else if (v > 92) setPixel(m, x, y, light);
        }
      const specks = kind === 'snow' ? 2 : kind === 'ash' ? (variant === 0 ? 1 : 0) : 2;
      for (let i = 0; i < specks; i++) {
        const px = 1 + (hash3(i, variant, 11) % (S - 2));
        const py = 1 + (hash3(i, variant, 13) % (S - 2));
        setPixel(m, px, py, extra);
        if (kind === 'dirt') setPixel(m, px, py + 1, dark);
      }
      break;
    }
    case 'road': {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const v = n(x, y);
          if (v < 10) setPixel(m, x, y, extra);
          else if (v > 93) setPixel(m, x, y, light);
        }
      // Wheel ruts along the road.
      for (let x = 0; x < S; x++) {
        if (n(x, 4, 3) > 25) setPixel(m, x, 4, dark);
        if (n(x, 11, 3) > 25) setPixel(m, x, 11, dark);
      }
      break;
    }
    case 'stone': {
      // Cobbles: offset rows of 5x4 stones, mortar in the dark step, lit upper-left rim.
      for (let y = 0; y < S; y++) {
        const row = Math.floor(y / 4);
        const off = (row % 2) * 2 + variant;
        for (let x = 0; x < S; x++) {
          const cx = (x + off) % 5;
          const cy = y % 4;
          if (cx === 0 || cy === 0) setPixel(m, x, y, dark);
          else if (cx === 1 || cy === 1) setPixel(m, x, y, light);
          else if (n(x, y) > 94) setPixel(m, x, y, extra);
        }
      }
      break;
    }
    case 'floor': {
      for (let y = 0; y < S; y++) {
        const plank = Math.floor(y / 4);
        const seamX = (plank * 7 + variant * 3) % S;
        for (let x = 0; x < S; x++) {
          const cy = y % 4;
          let c: Rgb = plank % 2 === 0 ? base : light;
          if (cy === 3 || x === seamX) c = dark;
          else if (cy === 0 && n(x, y) > 60) c = extra;
          setPixel(m, x, y, c);
        }
      }
      break;
    }
    case 'crop': {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const furrow = y % 4;
          if (furrow === 3) setPixel(m, x, y, dark);
          else if (furrow === 1 && (x + variant) % 3 !== 0)
            setPixel(m, x, y, n(x, y) > 50 ? extra : light);
          else if (furrow === 0 && (x + variant) % 3 === 1) setPixel(m, x, y, light);
        }
      break;
    }
    case 'bridge': {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          let c: Rgb = x % 4 === 3 ? dark : n(x, y) > 85 ? extra : base;
          if (y <= 1 || y >= S - 2) c = y === 0 || y === S - 1 ? dark : light;
          setPixel(m, x, y, c);
        }
      break;
    }
    case 'door': {
      // An open doorway: threshold stone, dark interior strip, posts on both sides.
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          let c: Rgb = base;
          if (x <= 1 || x >= S - 2) c = x === 0 || x === S - 1 ? dark : light;
          else if (y >= S - 3) c = 0x8c8a84;
          else if (y < 3) c = dark;
          setPixel(m, x, y, c);
        }
      setPixel(m, S - 4, 8, extra);
      break;
    }
    case 'water':
    case 'deep_water': {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) {
          const v = n(x, y);
          if (v < 18) setPixel(m, x, y, dark);
        }
      // Short wave dashes that shift with the animation frame.
      const waves = kind === 'water' ? 3 : 2;
      for (let i = 0; i < waves; i++) {
        const wy = 2 + (hash3(i, variant, 21) % (S - 4));
        const wx = (hash3(i, variant, 23) + frame * 2) % S;
        for (let k = 0; k < 4; k++) setPixel(m, (wx + k) % S, wy, k === 1 ? extra : light);
      }
      break;
    }
    case 'wall': {
      // Wall top: cut stone blocks.
      for (let y = 0; y < S; y++) {
        const row = Math.floor(y / 4);
        const off = (row % 2) * 4;
        for (let x = 0; x < S; x++) {
          if (y % 4 === 0 || (x + off) % 8 === 0) setPixel(m, x, y, dark);
          else if (y % 4 === 1) setPixel(m, x, y, extra);
          else setPixel(m, x, y, n(x, y) > 88 ? light : base);
        }
      }
      break;
    }
    default: {
      for (let y = 0; y < S; y++)
        for (let x = 0; x < S; x++) if (n(x, y) < 8) setPixel(m, x, y, light);
    }
  }
  return m;
}

const SOFT_PRIORITY: Partial<Record<TileKind, number>> = {
  snow: 6,
  grass: 5,
  tree: 5,
  ash: 4,
  sand: 3,
  dirt: 2,
  rock: 2,
  road: 1,
  crop: 0,
};

/** Dither thresholds (out of 16) by distance from the shared edge. */
const EDGE_DITHER = [9, 5, 2];

function mapSalt(map: MapDef): number {
  let h = 0;
  for (let i = 0; i < map.id.length; i++) h = (h * 31 + map.id.charCodeAt(i)) >>> 0;
  return h;
}

function isWater(k: TileKind): boolean {
  return k === 'water' || k === 'deep_water';
}

export interface BakeOptions {
  /** ground colours (a style pack's ramps); defaults to DEFAULT_GROUND_RAMPS */
  ramps?: GroundRampSet;
  /** paint wall front faces (the flat fallback); the HD-2D scene extrudes walls instead */
  wallFaces?: boolean;
}

/**
 * Bake a whole map's ground (w*16 by h*16 world pixels) for one water frame. Soft kinds
 * bleed into lower-priority neighbours with a 3-pixel ordered-dither band; water gets a
 * foam line on its land edges; with `wallFaces`, walls get a darker front face where open
 * ground lies south.
 */
export function bakeGround(map: MapDef, frame = 0, opts: BakeOptions = {}): PixelMatrix {
  const S = TILE_PX;
  const ramps = opts.ramps ?? P;
  const wallFaces = opts.wallFaces ?? true;
  const out = createMatrix(map.width * S, map.height * S);
  const salt = mapSalt(map);
  const water = rampOf('water', ramps);
  const deep = rampOf('deep_water', ramps);
  const faceRamp = [0x55524f, 0x6f6c68, 0x7c7975, 0x4a4744];
  const art = new Map<string, PixelMatrix>();
  const texture = (kind: TileKind, x: number, y: number): PixelMatrix => {
    const base = tileTexture(kind, tileVariant(x, y, salt), frame, ramps);
    const surface = groundSurface(map, kind, x, y);
    if (!surface) return base;
    const sheet = surface.pixels;
    const ox = ((x % 4) + 4) % 4;
    const oy = ((y % 4) + 4) % 4;
    const key = `${surface.id}:${ox}:${oy}:${kind}:${tileVariant(x, y, salt)}`;
    const hit = art.get(key);
    if (hit) return hit;
    const tex = createMatrix(S, S);
    // Transparent holes retain the existing terrain; neighbour dithering samples this same
    // composite so an empty art pixel can never erase collision-readable ground.
    tex.rgba.set(base.rgba);
    for (let py = 0; py < S; py++) {
      for (let px = 0; px < S; px++) {
        const sx = Math.floor(((ox * S + px) * sheet.w) / (S * 4));
        const sy = Math.floor(((oy * S + py) * sheet.h) / (S * 4));
        const si = (sy * sheet.w + sx) * 4;
        const di = (py * S + px) * 4;
        const alpha = (sheet.rgba[si + 3] ?? 0) / 255;
        for (let c = 0; c < 3; c++)
          tex.rgba[di + c] = Math.round(
            (sheet.rgba[si + c] ?? 0) * alpha + (tex.rgba[di + c] ?? 0) * (1 - alpha),
          );
      }
    }
    art.set(key, tex);
    return tex;
  };
  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const kind = tileAt(map, tx, ty);
      const tex = texture(kind, tx, ty);
      blit(out, tex, tx * S, ty * S);
      const myP = SOFT_PRIORITY[kind];
      const neigh: [number, number, 'n' | 's' | 'w' | 'e'][] = [
        [0, -1, 'n'],
        [0, 1, 's'],
        [-1, 0, 'w'],
        [1, 0, 'e'],
      ];
      // Soft ground transitions.
      if (myP !== undefined) {
        for (const [dx, dy, side] of neigh) {
          const nk = tileAt(map, tx + dx, ty + dy);
          const np = SOFT_PRIORITY[nk];
          if (np === undefined || np <= myP || groundUnder(nk) === groundUnder(kind)) continue;
          const ntex = texture(nk, tx + dx, ty + dy);
          for (let d = 0; d < EDGE_DITHER.length; d++) {
            for (let i = 0; i < S; i++) {
              const px = side === 'w' ? d : side === 'e' ? S - 1 - d : i;
              const py = side === 'n' ? d : side === 's' ? S - 1 - d : i;
              const wx = tx * S + px;
              const wy = ty * S + py;
              if (bayer4(wx, wy) < (EDGE_DITHER[d] as number)) {
                setPixel(out, wx, wy, getPixel(ntex, px, py));
              }
            }
          }
        }
      }
      // Water: foam along land edges, deep water darkens toward shallow.
      if (isWater(kind)) {
        const foam = kind === 'water' ? water[3] : deep[3];
        for (const [dx, dy, side] of neigh) {
          const nk = tileAt(map, tx + dx, ty + dy);
          if (isWater(nk) || nk === 'void' || nk === 'bridge') continue;
          for (let i = 0; i < S; i++) {
            const px = side === 'w' ? 0 : side === 'e' ? S - 1 : i;
            const py = side === 'n' ? 0 : side === 's' ? S - 1 : i;
            const wx = tx * S + px;
            const wy = ty * S + py;
            if ((i + frame) % 5 !== 0) setPixel(out, wx, wy, foam);
            const ix = side === 'w' ? 1 : side === 'e' ? S - 2 : i;
            const iy = side === 'n' ? 1 : side === 's' ? S - 2 : i;
            if (bayer4(wx, wy) < 6) setPixel(out, tx * S + ix, ty * S + iy, water[2]);
          }
        }
      }
      // Wall front face where the tile to the south is not a wall.
      if (kind === 'wall' && wallFaces) {
        const south = tileAt(map, tx, ty + 1);
        if (south !== 'wall' && south !== 'void') {
          const faceTop = S - 7;
          for (let y = faceTop; y < S; y++) {
            const row = Math.floor((y - faceTop) / 3);
            for (let x = 0; x < S; x++) {
              let c = faceRamp[1] as Rgb;
              if (y === faceTop) c = faceRamp[2] as Rgb;
              else if ((y - faceTop) % 3 === 0 || (x + row * 3) % 6 === 0) c = faceRamp[0] as Rgb;
              if (y === S - 1) c = faceRamp[3] as Rgb;
              setPixel(out, tx * S + x, ty * S + y, c);
            }
          }
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Tall tile props: trees and rocks, drawn with the paper-doll shading pipeline.

export interface PropSprite {
  matrix: PixelMatrix;
  anchorX: number;
  anchorY: number;
}

/** Colours and shapes a style pack gives trees and rocks. */
export interface PropColors {
  leaves: readonly Rgb[];
  trunk: Rgb;
  /** crown shape per variant: 0 round, 1 conifer, 2 broad, 3 bare */
  shapes: readonly number[];
  rock: Rgb;
}

export const DEFAULT_PROP_COLORS: PropColors = {
  leaves: [0x4a8040, 0x3d6b3a, 0x4a8040],
  trunk: 0x6b4a32,
  shapes: [0, 1, 2],
  rock: 0x8a8780,
};

const propCache = new Map<string, PropSprite>();
const colorIds = new WeakMap<PropColors, number>();
let nextColorId = 1;

export function propSprite(
  kind: 'tree' | 'rock',
  variant: number,
  colors: PropColors = DEFAULT_PROP_COLORS,
): PropSprite {
  let cid = colorIds.get(colors);
  if (cid === undefined) {
    cid = nextColorId++;
    colorIds.set(colors, cid);
  }
  const key = `${cid}:${kind}:${variant % 3}`;
  let p = propCache.get(key);
  if (p) return p;
  if (kind === 'tree') {
    const g = createShape(32, 40);
    const vi = variant % 3;
    const v = colors.shapes[vi % colors.shapes.length] ?? vi;
    fillRect(g, 14, 26, 4, 11, SLOT.LEATHER);
    if (v === 3) {
      // Bare tree: forked dead branches.
      fillRect(g, 14, 12, 4, 15, SLOT.LEATHER);
      drawLine(g, 15, 14, 8, 6, 2, SLOT.LEATHER);
      drawLine(g, 16, 12, 23, 4, 2, SLOT.LEATHER);
      drawLine(g, 10, 8, 7, 2, 1, SLOT.LEATHER);
      drawLine(g, 21, 6, 26, 5, 1, SLOT.LEATHER);
    } else if (v === 1) {
      // Conifer: stacked tiers.
      fillEllipse(g, 16, 25, 9, 5, SLOT.PRIMARY);
      fillEllipse(g, 16, 18, 7.5, 5, SLOT.PRIMARY);
      fillEllipse(g, 16, 11, 5.5, 4.5, SLOT.PRIMARY);
      fillEllipse(g, 16, 6, 3, 3, SLOT.PRIMARY);
    } else {
      const r = v === 0 ? 11 : 10;
      fillEllipse(g, 16, 17, r, r - 1, SLOT.PRIMARY);
      fillEllipse(g, 11, 13, 4, 3.5, SLOT.SECONDARY);
      if (v === 2) fillEllipse(g, 21, 21, 4, 3, SLOT.PRIMARY, 3);
    }
    autoShade(g);
    outline(g);
    const leaf = (colors.leaves[vi % colors.leaves.length] ?? 0x4a8040) as Rgb;
    const m = colorize(g, {
      [SLOT.PRIMARY]: shadeRamp(leaf),
      [SLOT.SECONDARY]: shadeRamp(mix(leaf, 0x9ad070, 0.45)),
      [SLOT.LEATHER]: shadeRamp(colors.trunk),
    });
    p = { matrix: m, anchorX: 16, anchorY: 37 };
  } else {
    const g = createShape(20, 18);
    fillEllipse(g, 10, 10.5, 7.5, 5.5, SLOT.PRIMARY);
    fillEllipse(g, 8, 8.5, 3, 2, SLOT.SECONDARY);
    if (variant % 2) fillEllipse(g, 14, 12, 3, 2.5, SLOT.PRIMARY);
    autoShade(g);
    outline(g);
    const m = colorize(g, {
      [SLOT.PRIMARY]: shadeRamp(colors.rock),
      [SLOT.SECONDARY]: shadeRamp(mix(colors.rock, 0xffffff, 0.2)),
    });
    p = { matrix: m, anchorX: 10, anchorY: 15 };
  }
  propCache.set(key, p);
  return p;
}
