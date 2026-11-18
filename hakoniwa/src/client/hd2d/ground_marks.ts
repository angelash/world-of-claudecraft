// Ground marks under a figure (art_pipeline.md 2.4 and 4.1), painted as pixel art at the
// ground's 16 pixels a metre so they keep the scene's pixel grid: the contact shadow (a
// dithered ellipse sized by the frame's width), the selection ring (its colour comes from
// the relation; the hostile ring has four gaps so the relation also reads by shape, for
// colour-blind players), the thin hover ring, and the thin outer threat ring of an enemy
// attacking the player. Marks are white with alpha; the material tints them. Both renderers
// draw them, the flat one straight onto its pixel canvas. Pure; Node-tested.

import { TILE_PX } from '../render/camera';
import { bayer4, createMatrix, type PixelMatrix, setPixel } from '../sprites/pixels';

export type RingStyle = 'self' | 'hostile' | 'friendly' | 'neutral' | 'hover' | 'threat';

/** Silhouette colours of hidden figures (2.4): the player's own, and the party's. */
export const SILHOUETTE_COLORS = { self: 0xf0e6c8, party: 0x7ad87a } as const;

/** The silhouette colour of a figure, or null when it gets none (2.4: self and party). */
export function silhouetteColor(e: { relation: string; kind: string }): number | null {
  if (e.relation === 'self') return SILHOUETTE_COLORS.self;
  if (e.kind === 'companion') return SILHOUETTE_COLORS.party;
  return null;
}

/** Ring colour by relation (the hover and threat rings have their own). */
export const RING_COLORS: Readonly<Record<RingStyle, number>> = {
  self: 0xf0e6c8,
  hostile: 0xe0503c,
  friendly: 0x6cd06a,
  neutral: 0xe8c84a,
  hover: 0xffffff,
  threat: 0xff3a2a,
};

/** Footprint of a figure's ground marks in metres, from its frame width in sprite pixels. */
export function markSize(frameW: number, scale: number): { w: number; d: number } {
  const w = Math.max(0.5, (frameW / 48) * 0.75) * scale;
  return { w, d: w * 0.7 };
}

/** Whole pixels of a mark `metres` wide (at least 4, even so the centre falls on a seam). */
export function markPx(metres: number): number {
  return Math.max(4, Math.round((metres * TILE_PX) / 2) * 2);
}

/** Normalised ellipse distance of pixel (x, y) in a w by h mark: 1 on the rim. */
function rimDistance(x: number, y: number, w: number, h: number): number {
  const nx = (x + 0.5 - w / 2) / (w / 2);
  const ny = (y + 0.5 - h / 2) / (h / 2);
  return Math.hypot(nx, ny);
}

/**
 * The contact shadow: a solid core and a one-pixel dithered rim (alpha 0 to 255; the
 * material sets the overall darkness).
 */
export function shadowMark(w: number, h: number): PixelMatrix {
  const m = createMatrix(w, h);
  const rim = 1 / Math.max(2, Math.min(w, h) / 2);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const d = rimDistance(x, y, w, h);
      if (d > 1) continue;
      if (d > 1 - rim) {
        if (bayer4(x, y) < 8) setPixel(m, x, y, 0xffffff, 255);
      } else setPixel(m, x, y, 0xffffff, 255);
    }
  return m;
}

/** Where the hostile ring breaks: four gaps on the diagonals, a sixteenth of a turn each. */
export function inRingGap(style: RingStyle, angle: number): boolean {
  if (style !== 'hostile') return false;
  const a = ((angle % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
  return Math.abs(a - Math.PI / 4) < Math.PI / 16;
}

/** Line width of a ring style, in pixels. */
export function ringThickness(style: RingStyle): number {
  return style === 'hover' || style === 'threat' ? 1 : 2;
}

/** A ring mark: an elliptical band `ringThickness` pixels wide at the rim of a w by h box. */
export function ringMark(w: number, h: number, style: RingStyle): PixelMatrix {
  const m = createMatrix(w, h);
  const t = ringThickness(style);
  // a pixel is on the band when it lies within t pixels inside the rim
  const inner = (rx: number, ry: number) => (rx > t && ry > t ? [rx - t, ry - t] : [0, 0]);
  const rx = w / 2;
  const ry = h / 2;
  const [ix, iy] = inner(rx, ry) as [number, number];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - rx;
      const py = y + 0.5 - ry;
      const out = (px / rx) ** 2 + (py / ry) ** 2;
      if (out > 1) continue;
      const inside = ix > 0 && iy > 0 && (px / ix) ** 2 + (py / iy) ** 2 < 1;
      if (inside) continue;
      if (inRingGap(style, Math.atan2(py / ry, px / rx))) continue;
      setPixel(m, x, y, 0xffffff, 255);
    }
  return m;
}
