// Shape grid: the "palette index" stage of the procedural paper doll
// (art_pipeline.md 3.3). Generators rasterize primitives into colour SLOTS and shade
// levels; autoShade adds the upper-left light, outline adds the deepened-neighbour
// outline (1.6), and colorize turns slots into RGBA through a per-look palette. Pure.

import { RAMP_LEVELS, SHADE } from './palette';
import { createMatrix, type PixelMatrix, type Rgb } from './pixels';

export const SLOT = {
  EMPTY: 0,
  PRIMARY: 1,
  SECONDARY: 2,
  SKIN: 3,
  HAIR: 4,
  EYE: 5,
  METAL: 6,
  LEATHER: 7,
  /** emissive: no shading, no outline (halos, glowing eyes, cores) */
  GLOW: 8,
  WHITE: 9,
  BONE: 10,
  ACCENT: 11,
} as const;

export type Slot = (typeof SLOT)[keyof typeof SLOT];
export const SLOT_COUNT = 12;

export interface ShapeGrid {
  w: number;
  h: number;
  slot: Uint8Array;
  shade: Uint8Array;
}

export function createShape(w: number, h: number): ShapeGrid {
  return { w, h, slot: new Uint8Array(w * h), shade: new Uint8Array(w * h) };
}

export function inShape(g: ShapeGrid, x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < g.w && y < g.h;
}

export function slotAt(g: ShapeGrid, x: number, y: number): number {
  return inShape(g, x, y) ? (g.slot[y * g.w + x] as number) : SLOT.EMPTY;
}

export function setCell(
  g: ShapeGrid,
  x: number,
  y: number,
  slot: number,
  shade: number = SHADE.BASE,
): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (!inShape(g, xi, yi)) return;
  g.slot[yi * g.w + xi] = slot;
  g.shade[yi * g.w + xi] = slot === SLOT.EMPTY ? 0 : shade;
}

export function fillRect(
  g: ShapeGrid,
  x: number,
  y: number,
  w: number,
  h: number,
  slot: number,
  shade: number = SHADE.BASE,
): void {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = x0 + Math.round(w);
  const y1 = y0 + Math.round(h);
  for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) setCell(g, xx, yy, slot, shade);
}

/** Filled ellipse centred on (cx, cy); radii may be fractional. */
export function fillEllipse(
  g: ShapeGrid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  slot: number,
  shade: number = SHADE.BASE,
): void {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const dy = (y + 0.5 - cy) / ry;
      if (dx * dx + dy * dy <= 1) setCell(g, x, y, slot, shade);
    }
  }
}

/** Ellipse ring of the given pixel thickness. */
export function strokeEllipse(
  g: ShapeGrid,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  thickness: number,
  slot: number,
  shade: number = SHADE.BASE,
): void {
  const x0 = Math.floor(cx - rx - 1);
  const x1 = Math.ceil(cx + rx + 1);
  const y0 = Math.floor(cy - ry - 1);
  const y1 = Math.ceil(cy + ry + 1);
  const irx = Math.max(0.1, rx - thickness);
  const iry = Math.max(0.1, ry - thickness);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const ox = (x + 0.5 - cx) / rx;
      const oy = (y + 0.5 - cy) / ry;
      const ix = (x + 0.5 - cx) / irx;
      const iy = (y + 0.5 - cy) / iry;
      if (ox * ox + oy * oy <= 1 && ix * ix + iy * iy > 1) setCell(g, x, y, slot, shade);
    }
  }
}

/** Filled isosceles-ish triangle from a base segment to an apex. */
export function fillTriangle(
  g: ShapeGrid,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  slot: number,
  shade: number = SHADE.BASE,
): void {
  const x0 = Math.floor(Math.min(ax, bx, cx));
  const x1 = Math.ceil(Math.max(ax, bx, cx));
  const y0 = Math.floor(Math.min(ay, by, cy));
  const y1 = Math.ceil(Math.max(ay, by, cy));
  const sign = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) =>
    (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const d1 = sign(px, py, ax, ay, bx, by);
      const d2 = sign(px, py, bx, by, cx, cy);
      const d3 = sign(px, py, cx, cy, ax, ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0;
      const pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) setCell(g, x, y, slot, shade);
    }
  }
}

/** Thick line between two points (used for tails, horns, weapons). */
export function drawLine(
  g: ShapeGrid,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  thickness: number,
  slot: number,
  shade: number = SHADE.BASE,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
  const r = Math.max(0, (thickness - 1) / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (r === 0) setCell(g, Math.floor(x), Math.floor(y), slot, shade);
    else fillRect(g, Math.floor(x - r), Math.floor(y - r), thickness, thickness, slot, shade);
  }
}

/** Repaint every cell of slot `from` to `to` keeping shades (used for flashes and variants). */
export function recolorSlot(g: ShapeGrid, from: number, to: number): void {
  for (let i = 0; i < g.slot.length; i++) if (g.slot[i] === from) g.slot[i] = to;
}

const isSolid = (slot: number) => slot !== SLOT.EMPTY && slot !== SLOT.GLOW;

/**
 * Upper-left light: base cells facing an empty or different-slot neighbour above or to
 * the left get the light step; facing one below or to the right get the shadow step.
 * Cells with an explicit (non-base) shade are left alone.
 */
export function autoShade(g: ShapeGrid): void {
  const next = new Uint8Array(g.shade);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      const s = g.slot[i] as number;
      if (!isSolid(s) || g.shade[i] !== SHADE.BASE) continue;
      const up = slotAt(g, x, y - 1);
      const left = slotAt(g, x - 1, y);
      const down = slotAt(g, x, y + 1);
      const right = slotAt(g, x + 1, y);
      if (down !== s || right !== s) next[i] = SHADE.SHADOW;
      else if (up !== s || left !== s) next[i] = SHADE.LIGHT;
    }
  }
  g.shade.set(next);
}

/**
 * 1-pixel outline around solid cells using the neighbour's ramp: the deepest step on the
 * bottom and right edges, one step lighter on the top and left (and one more step lighter
 * on the lit side for large bodies, art_pipeline.md 1.5).
 */
export function outline(g: ShapeGrid, large = false): void {
  const slots = new Uint8Array(g.slot);
  const shades = new Uint8Array(g.shade);
  for (let y = 0; y < g.h; y++) {
    for (let x = 0; x < g.w; x++) {
      const i = y * g.w + x;
      if (g.slot[i] !== SLOT.EMPTY) continue;
      // Neighbour above means this cell is below the shape: bottom edge, deep outline.
      const above = slotAt(g, x, y - 1);
      const leftN = slotAt(g, x - 1, y);
      const below = slotAt(g, x, y + 1);
      const rightN = slotAt(g, x + 1, y);
      let src: number = SLOT.EMPTY;
      let shade: number = SHADE.OUTLINE;
      if (isSolid(above)) {
        src = above;
        shade = SHADE.OUTLINE_DEEP;
      } else if (isSolid(leftN)) {
        src = leftN;
        shade = SHADE.OUTLINE_DEEP;
      } else if (isSolid(below)) {
        src = below;
        shade = large ? SHADE.SHADOW : SHADE.OUTLINE;
      } else if (isSolid(rightN)) {
        src = rightN;
        shade = large ? SHADE.SHADOW : SHADE.OUTLINE;
      }
      if (src !== SLOT.EMPTY) {
        slots[i] = src;
        shades[i] = shade;
      }
    }
  }
  g.slot.set(slots);
  g.shade.set(shades);
}

export type SlotPalette = Partial<Record<number, Rgb[]>>;

export interface ColorizeOptions {
  /** 0..255 alpha for every opaque pixel */
  alpha?: number;
  /** mix every pixel toward white by this fraction (hit flash) */
  flash?: number;
  /** emissive colour for SLOT.GLOW */
  glow?: Rgb;
}

/** Turn slots plus shades into RGBA using a ramp per slot. */
export function colorize(
  g: ShapeGrid,
  palette: SlotPalette,
  opts: ColorizeOptions = {},
): PixelMatrix {
  const out = createMatrix(g.w, g.h);
  const alpha = Math.max(0, Math.min(255, Math.round(opts.alpha ?? 255)));
  const flash = Math.max(0, Math.min(1, opts.flash ?? 0));
  for (let i = 0; i < g.slot.length; i++) {
    const s = g.slot[i] as number;
    if (s === SLOT.EMPTY) continue;
    let rgb: Rgb;
    if (s === SLOT.GLOW) rgb = opts.glow ?? 0xfff2c0;
    else {
      const ramp = palette[s] ?? palette[SLOT.PRIMARY] ?? [0x808080];
      const lvl = Math.min(RAMP_LEVELS - 1, g.shade[i] as number);
      rgb = ramp[Math.min(lvl, ramp.length - 1)] as Rgb;
    }
    let r = (rgb >> 16) & 0xff;
    let gg = (rgb >> 8) & 0xff;
    let b = rgb & 0xff;
    if (flash > 0) {
      r = Math.round(r + (255 - r) * flash);
      gg = Math.round(gg + (255 - gg) * flash);
      b = Math.round(b + (255 - b) * flash);
    }
    const o = i * 4;
    out.rgba[o] = r;
    out.rgba[o + 1] = gg;
    out.rgba[o + 2] = b;
    out.rgba[o + 3] = s === SLOT.GLOW ? Math.max(alpha, 230) : alpha;
  }
  return out;
}
