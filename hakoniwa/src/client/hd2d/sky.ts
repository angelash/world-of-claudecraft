// The far sky (art_pipeline.md 2.13, D-078 A-15): a band around the camera that turns with
// its yaw, so it always stands at infinity, behind everything. A sky pack has three layers
// (far mountains, a mid band of forest or city, clouds; special skies have far and near),
// each a strip that wraps left to right; the gradient, the stars and the sun or moon come
// from code. Layers shift a little with the camera focus (parallax 0.02 far, 0.05 mid) and
// the clouds drift a quarter screen per game hour. The band shows fully up to 45 degrees of
// pitch, fades out by 60, and is not drawn indoors; under the horizon, and wherever the sky
// does not show, lies the dark out-of-bounds ground with a light fog (2.5). A tier keeps
// 3, 2 or 1 layers (far first, then clouds, then the mid band). The sky is pure look: it is
// drawn behind every scene element and never over an overlay. Missing art falls back to
// the procedural strips painted here (6.4). Pure; Node-tested.

import { SKY_STYLES, type SkyPack, SPECIAL_SKIES } from '../../systems/world/atlas';
import { styleOf } from '../../systems/world/look';
import type { MapDef } from '../../systems/world/types';
import { mix } from '../sprites/palette';
import {
  bayer4,
  createMatrix,
  hash3,
  type PixelMatrix,
  type Rgb,
  setPixel,
} from '../sprites/pixels';
import { STYLE_PACKS } from './style_packs';

/** A layer strip, in sky pixels (one sky pixel is `skyPixelScale` device pixels). */
export const SKY_BAND_W = 1024;
export const SKY_BAND_H = 256;

export type SkyLayerKind = 'far' | 'mid' | 'clouds' | 'near';

export interface SkyLayerSpec {
  kind: SkyLayerKind;
  /** the art id (art_bg_<pack>_<kind>, art_bg_sky_<name>_<kind>) */
  assetId: string;
  /** focus movement to layer movement (2.13: far 0.02, mid 0.05) */
  parallax: number;
  /** screens per game hour the layer drifts by itself (clouds: a quarter) */
  drift: number;
  /** how much the layer melts into the horizon colour (aerial perspective) */
  haze: number;
}

const isSkyStyle = (s: string): s is (typeof SKY_STYLES)[number] =>
  (SKY_STYLES as readonly string[]).includes(s);
const isSpecialSky = (s: string): s is (typeof SPECIAL_SKIES)[number] =>
  (SPECIAL_SKIES as readonly string[]).includes(s);

/**
 * The sky pack a map shows (2.13), or null when it shows none: indoor maps (the inside of
 * the court, underground halls) and the door corridor, whose distance is the door-shadow
 * layer instead. The atlas entry's `sky` wins; then the map's own style pack when it has a
 * sky; then its region's pack; packs without a sky of their own borrow the plain's.
 */
export function skyPackFor(
  map: Pick<MapDef, 'style' | 'region' | 'indoor'>,
  atlasSky?: string,
): SkyPack | null {
  if (map.indoor) return null;
  const style = styleOf(map);
  if (style === 'door_corridor') return null;
  if (atlasSky && (isSkyStyle(atlasSky) || isSpecialSky(atlasSky))) return atlasSky;
  if (isSkyStyle(style)) return style;
  const regional = styleOf({ region: map.region });
  if (isSkyStyle(regional)) return regional;
  return 'lothar_plain';
}

/** Back-to-front drawing order of a pack's layers, after the tier kept `count` of them. */
export function skyLayers(pack: SkyPack, count: number): SkyLayerSpec[] {
  const n = Math.max(0, Math.min(3, Math.floor(count)));
  if (isSpecialSky(pack)) {
    const kept: SkyLayerKind[] = (['far', 'near'] as SkyLayerKind[]).slice(0, Math.min(2, n));
    return kept.map((kind) => ({
      kind,
      assetId: `art_bg_sky_${pack}_${kind}`,
      parallax: kind === 'far' ? 0.02 : 0.05,
      drift: 0,
      haze: kind === 'far' ? 0.3 : 0.12,
    }));
  }
  // importance: the far mountains first, then the clouds, then the mid band
  const kept = (['far', 'clouds', 'mid'] as SkyLayerKind[]).slice(0, n);
  const order: SkyLayerKind[] = ['clouds', 'far', 'mid'];
  return order
    .filter((k) => kept.includes(k))
    .map((kind) => ({
      kind,
      assetId: `art_bg_${pack}_${kind}`,
      parallax: kind === 'mid' ? 0.05 : kind === 'far' ? 0.02 : 0.01,
      drift: kind === 'clouds' ? 0.25 : 0,
      haze: kind === 'far' ? 0.35 : kind === 'clouds' ? 0.2 : 0.15,
    }));
}

/** 0..1 how much of the sky shows at a pitch (2.13: full to 45 degrees, gone at 60). */
export function skyVisibility(pitchDeg: number): number {
  if (pitchDeg <= 45) return 1;
  if (pitchDeg >= 60) return 0;
  return (60 - pitchDeg) / 15;
}

/** The horizon line as a fraction of the screen height from the top; it rises with the pitch. */
export function horizonFraction(pitchDeg: number): number {
  const p = Math.max(20, Math.min(60, pitchDeg));
  return Math.max(0.08, 0.46 - (p - 30) * 0.0105);
}

/** Device pixels per sky pixel: whole numbers, about one per 360 rows, never above the zoom. */
export function skyPixelScale(deviceH: number, step: number): number {
  return Math.max(1, Math.min(Math.max(1, Math.floor(step)), Math.round(deviceH / 360)));
}

/**
 * Horizontal offset (sky pixels) of a layer: a whole camera turn scrolls one band width the
 * same way the world and the sun turn (yaw up moves them right, so the band's sample offset
 * goes down), the focus moves it by its parallax (16 sprite pixels a tile), the clouds drift
 * by game hours (a quarter of a screen each). Wrapped into [0, SKY_BAND_W).
 */
export function layerOffset(
  spec: Pick<SkyLayerSpec, 'parallax' | 'drift'>,
  yawDeg: number,
  focusAlong: number,
  gameHours: number,
  screenSkyPx: number,
): number {
  const raw =
    -(yawDeg / 360) * SKY_BAND_W +
    focusAlong * 16 * spec.parallax +
    gameHours * spec.drift * screenSkyPx;
  const r = Math.round(raw) % SKY_BAND_W;
  return (r < 0 ? r + SKY_BAND_W : r) || 0;
}

export interface SkyColors {
  zenith: Rgb;
  horizon: Rgb;
  /** 0..1 star field strength */
  stars: number;
  /** multiply on the layer art (time of day) */
  layerTint: Rgb;
}

/**
 * The gradient and layer tint from the scene's light (the style pack's LightPalette as
 * daylight.ts blends it): the horizon is the sky light, the zenith a deeper shade of it;
 * stars come out as the day fades; haze (fog, ash, overcast) pulls both toward grey.
 */
export function skyColors(
  light: { sky: Rgb; sun: Rgb; tint: Rgb },
  daylight: number,
  haze: number,
  hazeColor: Rgb,
): SkyColors {
  const deep = mix(light.sky, 0x0a1030, 0.35 + 0.4 * (1 - daylight));
  const h = Math.max(0, Math.min(1, haze));
  return {
    zenith: mix(deep, hazeColor, h * 0.5),
    horizon: mix(mix(light.sky, light.sun, 0.25 * daylight), hazeColor, h * 0.7),
    stars: Math.max(0, Math.min(1, (0.55 - daylight) / 0.45)) * (1 - h),
    layerTint: mix(light.tint, light.sky, 0.3),
  };
}

/**
 * The sun (by day) or moon (by night) on the band: x as a fraction of the band from the
 * screen centre (-0.5 to 0.5 is one band), and its height above the horizon as a fraction
 * of the band height. Null when it stands behind the camera or under the horizon.
 */
export function celestial(
  sunDir: readonly [number, number, number],
  yawDeg: number,
  daylight: number,
): { x: number; alt: number; moon: boolean } | null {
  const [dx, dy, dz] = sunDir;
  // the camera looks along -toCamera; with yaw 0 it faces north (-z)
  const yaw = (yawDeg * Math.PI) / 180;
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const rx = Math.cos(yaw);
  const rz = -Math.sin(yaw);
  const ahead = dx * fx + dz * fz;
  const side = dx * rx + dz * rz;
  if (ahead <= 0 || dy <= 0) return null;
  const az = Math.atan2(side, ahead);
  return {
    x: az / (Math.PI * 2),
    alt: Math.min(0.9, Math.max(0, Math.asin(Math.min(1, dy)) / (Math.PI / 2))),
    moon: daylight < 0.4,
  };
}

// ---------------------------------------------------------------------------
// Procedural placeholder strips (6.4): seamless, deterministic, in the pack's colours.

/** A periodic ridge: integer frequencies over the band width wrap without a seam. */
function ridge(x: number, seed: number, amp: number, octaves: readonly number[]): number {
  let y = 0;
  for (let i = 0; i < octaves.length; i++) {
    const f = octaves[i] as number;
    const ph = (hash3(seed, i, f) % 1000) / 1000;
    y += Math.sin(((x / SKY_BAND_W) * f + ph) * Math.PI * 2) * (amp / (i + 1));
  }
  return y;
}

interface StripColors {
  far: Rgb;
  farLight: Rgb;
  mid: Rgb;
  midDark: Rgb;
  cloud: Rgb;
  cloudShade: Rgb;
  city: boolean;
}

const SPECIAL_COLORS: Readonly<Record<string, StripColors>> = {
  earth_night_city: {
    far: 0x2a2e48,
    farLight: 0x3a4062,
    mid: 0x1a1c2c,
    midDark: 0x101220,
    cloud: 0x4a4a68,
    cloudShade: 0x34344c,
    city: true,
  },
  dream_door_sea: {
    far: 0x5a6a9a,
    farLight: 0xc8b070,
    mid: 0x3a4870,
    midDark: 0x2a3456,
    cloud: 0xb8c0d8,
    cloudShade: 0x8a94b4,
    city: false,
  },
  divine_heights: {
    far: 0xd8cca8,
    farLight: 0xfff0c8,
    mid: 0xbcae88,
    midDark: 0x9a8e6c,
    cloud: 0xfff8e8,
    cloudShade: 0xe8dcc0,
    city: false,
  },
  vault: {
    far: 0x6a7ab8,
    farLight: 0xa8b8e8,
    mid: 0x4a5890,
    midDark: 0x36427a,
    cloud: 0xe0e8ff,
    cloudShade: 0xb0bce0,
    city: false,
  },
  mist_edge: {
    far: 0x9aa0a8,
    farLight: 0xc0c4ca,
    mid: 0x7a8088,
    midDark: 0x60666e,
    cloud: 0xd8dcdf,
    cloudShade: 0xb4b8bc,
    city: false,
  },
};

const CITY_PACKS: ReadonlySet<string> = new Set(['valen_city', 'holy_see_white', 'mercato_coast']);

function stripColors(pack: SkyPack): StripColors {
  const special = SPECIAL_COLORS[pack];
  if (special) return special;
  const p = STYLE_PACKS[pack as (typeof SKY_STYLES)[number]];
  const leaf = (p.trees.leaves[0] ?? 0x4a6a3a) as Rgb;
  const far = mix(mix(p.rock, p.light.day.sky, 0.55), 0x6a7890, 0.2);
  return {
    far,
    farLight: mix(far, 0xffffff, 0.22),
    mid: CITY_PACKS.has(pack) ? mix(p.rock, 0x8a8a98, 0.3) : mix(leaf, p.light.day.sky, 0.25),
    midDark: CITY_PACKS.has(pack) ? mix(p.rock, 0x30303c, 0.45) : mix(leaf, 0x1a2418, 0.35),
    cloud: mix(0xffffff, p.light.day.sky, 0.15),
    cloudShade: mix(p.light.day.sky, 0x8a94a8, 0.35),
    city: CITY_PACKS.has(pack),
  };
}

/** A periodic ridge over the band width, once per column (the strips index it). */
function ridgeTable(seed: number, amp: number, octaves: readonly number[]): Float32Array {
  const t = new Float32Array(SKY_BAND_W);
  for (let x = 0; x < SKY_BAND_W; x++) t[x] = ridge(x, seed, amp, octaves);
  return t;
}

/** The procedural strip of one layer (SKY_BAND_W by SKY_BAND_H, transparent sky). */
export function paintSkyLayer(pack: SkyPack, kind: SkyLayerKind): PixelMatrix {
  const m = createMatrix(SKY_BAND_W, SKY_BAND_H);
  const c = stripColors(pack);
  const seed = pack.length * 97 + kind.length * 13;
  const H = SKY_BAND_H;
  if (kind === 'clouds') {
    const base = ridgeTable(seed, 0.7, [3, 7, 13]);
    const shear = ridgeTable(seed + 1, 0.45, [5, 11]);
    for (let x = 0; x < SKY_BAND_W; x++) {
      for (let y = 40; y < 150; y++) {
        // lumps along the band, sheared a little with height; every term wraps with x
        const lumps = (base[x] as number) + (shear[(x + y * 6) % SKY_BAND_W] as number);
        const k = lumps + 0.35 - Math.abs(y - 92) / 34;
        const t = k * 16 + bayer4(x, y) - 8;
        if (t < 0) continue;
        setPixel(m, x, y, y > 98 || bayer4(x, y) < 3 ? c.cloudShade : c.cloud);
      }
    }
    return m;
  }
  const near = kind === 'mid' || kind === 'near';
  for (let x = 0; x < SKY_BAND_W; x++) {
    let top: number;
    if (near && c.city) {
      // blocky roofs and the odd tower
      const lot = Math.floor(x / 18);
      const h = 18 + (hash3(seed, lot, 7) % 26) + (hash3(seed, lot, 9) % 9 === 0 ? 30 : 0);
      top = H - h;
    } else if (near) {
      top = H - (30 + ridge(x, seed, 7, [9, 23, 61]) + (hash3(seed, x >> 2, 3) % 3));
    } else {
      top = H - (78 + ridge(x, seed, 34, [2, 5, 11, 27]));
    }
    top = Math.max(8, Math.round(top));
    for (let y = top; y < H; y++) {
      let col: Rgb;
      if (near) col = y - top < 2 ? c.mid : c.midDark;
      else {
        // a light snow or haze cap on the ridges, dithered into the body
        const depth = y - top;
        col = depth < 6 || (depth < 10 && bayer4(x, y) < 8 - depth) ? c.farLight : c.far;
      }
      setPixel(m, x, y, col);
    }
  }
  return m;
}

/** Strips kept: the current pack's layers and the last pack's (painted strips are 1 MB each). */
const STRIP_CACHE = 6;
const strips = new Map<string, PixelMatrix>();

/**
 * The procedural strip of a layer, painted once and kept while it is among the last few used
 * (a bounded cache; the clouds take tens of milliseconds to paint).
 */
export function cachedSkyLayer(pack: SkyPack, kind: SkyLayerKind): PixelMatrix {
  const key = `${pack}:${kind}`;
  let m = strips.get(key);
  if (m) strips.delete(key);
  else m = paintSkyLayer(pack, kind);
  strips.set(key, m);
  while (strips.size > STRIP_CACHE) {
    const oldest = strips.keys().next().value;
    if (oldest === undefined) break;
    strips.delete(oldest);
  }
  return m;
}
