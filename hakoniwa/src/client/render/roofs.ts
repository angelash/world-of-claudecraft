// Building roofs over map locations (art_pipeline_2d.md 1.9, 2.4, 5.6). A location of a
// building kind gets a procedural gable roof covering its rect plus the surrounding wall
// ring; the roof of the building the player stands in (or has selected) dissolves away
// with a 4x4 ordered dither over about 160 ms and grows back on leaving. Pure.

import type { LocationDef, MapDef } from '../../systems/world/types';
import { shadeRamp } from '../sprites/palette';
import { createMatrix, hashString, type PixelMatrix, type Rgb, setPixel } from '../sprites/pixels';
import { TILE_PX } from './camera';

/** Location kinds that are buildings with a roof (tags 'building' and 'open' override). */
export const ROOFED_KINDS: ReadonlySet<string> = new Set([
  'home',
  'house',
  'work',
  'shop',
  'church',
  'chapel',
  'temple',
  'guild',
  'tavern',
  'inn',
  'hall',
  'smithy',
  'store',
  'warehouse',
  'office',
  'manor',
  'barracks',
  'tower',
  'clinic',
  'school',
  'bank',
]);

export interface RoofSpec {
  locationId: string;
  name: string;
  /** covered area in tiles (the location rect grown by one tile for the walls) */
  x: number;
  y: number;
  w: number;
  h: number;
  color: Rgb;
}

const ROOF_COLORS: Rgb[] = [0xa8543a, 0x56657a, 0x5e7a4a, 0xb4823a, 0x7a4a6a];
const KIND_COLOR: Record<string, Rgb> = {
  church: 0x56657a,
  chapel: 0x56657a,
  temple: 0x8a8ea0,
  tavern: 0xa8543a,
  inn: 0xa8543a,
  guild: 0x4a5a7a,
  smithy: 0x4a4a52,
};

export function hasRoof(loc: LocationDef, map: MapDef): boolean {
  if (map.indoor) return false;
  const tags = loc.tags ?? [];
  if (tags.includes('open') || tags.includes('no_roof')) return false;
  return tags.includes('building') || tags.includes('roof') || ROOFED_KINDS.has(loc.kind);
}

export function roofsForMap(map: MapDef): RoofSpec[] {
  const out: RoofSpec[] = [];
  for (const loc of map.locations) {
    if (!hasRoof(loc, map)) continue;
    const x = Math.max(0, loc.x - 1);
    const y = Math.max(0, loc.y - 1);
    const x1 = Math.min(map.width, loc.x + loc.w + 1);
    const y1 = Math.min(map.height, loc.y + loc.h + 1);
    out.push({
      locationId: loc.id,
      name: loc.name,
      x,
      y,
      w: x1 - x,
      h: y1 - y,
      color: KIND_COLOR[loc.kind] ?? (ROOF_COLORS[hashString(loc.id) % ROOF_COLORS.length] as Rgb),
    });
  }
  return out;
}

/** Whether a tile position lies under a roof's covered area. */
export function underRoof(r: RoofSpec, x: number, y: number): boolean {
  return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
}

/** Roofs that should be open: the one the player stands under and any explicitly opened. */
export function roofsToOpen(
  roofs: readonly RoofSpec[],
  player: { x: number; y: number } | null,
  extra: readonly string[] = [],
): Set<string> {
  const open = new Set(extra);
  if (player) for (const r of roofs) if (underRoof(r, player.x, player.y)) open.add(r.locationId);
  return open;
}

/** Gable roof seen from the oblique top: far slope, ridge, near slope with tile rows, fascia. */
export function roofPixels(r: RoofSpec): PixelMatrix {
  const w = r.w * TILE_PX;
  const h = r.h * TILE_PX;
  const m = createMatrix(w, h);
  const ramp = shadeRamp(r.color);
  const ridge = Math.max(3, Math.round(h * 0.32));
  const fascia = Math.min(5, Math.max(3, Math.round(h * 0.12)));
  const chimneyX = 4 + (hashString(r.locationId) % Math.max(1, w - 12));
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let c: Rgb;
      if (y === 0 || x === 0) c = ramp[4] as Rgb;
      else if (y === h - 1 || x === w - 1) c = ramp[5] as Rgb;
      else if (y >= h - fascia) c = y === h - fascia ? (ramp[4] as Rgb) : (ramp[3] as Rgb);
      else if (y < ridge - 1) c = (y + (x % 2)) % 4 === 0 ? (ramp[4] as Rgb) : (ramp[3] as Rgb);
      else if (y <= ridge) c = ramp[0] as Rgb;
      else {
        const row = Math.floor((y - ridge) / 4);
        const seam = (x + row * 3) % 6 === 0;
        c =
          (y - ridge) % 4 === 0 || seam
            ? (ramp[3] as Rgb)
            : x < 3
              ? (ramp[1] as Rgb)
              : (ramp[2] as Rgb);
      }
      setPixel(m, x, y, c);
    }
  }
  // Chimney on the far slope.
  if (w >= 32 && ridge >= 6) {
    for (let y = 1; y < ridge - 1; y++) {
      for (let x = chimneyX; x < chimneyX + 5; x++) {
        const c = x === chimneyX ? 0x8c7a6a : x === chimneyX + 4 ? 0x4a3e36 : 0x6e5e50;
        setPixel(m, x, y, y === 1 ? 0x3a302a : c);
      }
    }
  }
  return m;
}

/** Number of 4x4 Bayer cells removed (0 closed .. 16 fully open) for an openness 0..1. */
export function dissolveLevel(openness: number): number {
  return Math.max(0, Math.min(16, Math.round(openness * 16)));
}

/** Openness per roof, eased toward its target at a fixed rate. */
export class RoofFader {
  private open = new Map<string, number>();
  constructor(private readonly durationMs = 160) {}

  update(dtMs: number, targets: ReadonlySet<string>, all: readonly RoofSpec[]): void {
    const step = this.durationMs > 0 ? dtMs / this.durationMs : 1;
    for (const r of all) {
      const cur = this.open.get(r.locationId) ?? 0;
      const want = targets.has(r.locationId) ? 1 : 0;
      const next = want > cur ? Math.min(want, cur + step) : Math.max(want, cur - step);
      if (next === 0) this.open.delete(r.locationId);
      else this.open.set(r.locationId, next);
    }
  }

  openness(id: string): number {
    return this.open.get(id) ?? 0;
  }

  reset(): void {
    this.open.clear();
  }
}
