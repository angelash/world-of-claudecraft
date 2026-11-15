// Code-generated sample art for the import tests (no real assets are committed): pixel-art
// sprites drawn at game resolution, blown up into generator-sized canvases with a block size, a
// grid offset, color noise and a magenta fringe, the way an AI tool delivers them.

import { hexToPx } from '../tools/assets/core/color';
import { createImg, getPx, type Img, isOpaque, pack, setPx } from '../tools/assets/core/image';

/** Deterministic LCG for fixture noise. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

export interface SpriteStyle {
  body: string;
  shade: string;
  light: string;
  dark: string;
  outline: string;
}

export const BEAST: SpriteStyle = {
  body: '#a2764a',
  shade: '#805836',
  light: '#c69c6a',
  dark: '#2b2220',
  outline: '#3c2818',
};

function fillEllipse(
  img: Img,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: number,
): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPx(img, x, y, color);
    }
  }
}

function fillRect(img: Img, x0: number, y0: number, w: number, h: number, color: number): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) setPx(img, x, y, color);
}

/** Add a 1-pixel outline of `color` around the opaque shape (outside it). */
export function addOutline(img: Img, color: number): void {
  const add: [number, number][] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (isOpaque(img, x, y)) continue;
      if (
        isOpaque(img, x - 1, y) ||
        isOpaque(img, x + 1, y) ||
        isOpaque(img, x, y - 1) ||
        isOpaque(img, x, y + 1)
      )
        add.push([x, y]);
    }
  }
  for (const [x, y] of add) setPx(img, x, y, color);
}

/**
 * A small four-legged creature in a `size` cell, feet on row `baseline`. `phase` moves the legs
 * and `dx` shifts the whole body (to fake generator jitter).
 */
export function creatureFrame(
  size: number,
  baseline: number,
  style: SpriteStyle,
  phase = 0,
  dx = 0,
): Img {
  const img = createImg(size, size);
  const cx = size / 2 + dx;
  const legTop = baseline - 6;
  const body = hexToPx(style.body);
  const shade = hexToPx(style.shade);
  fillRect(img, Math.round(cx - 8 + (phase % 2)), legTop, 3, baseline - legTop + 1, shade);
  fillRect(img, Math.round(cx + 5 - (phase % 2)), legTop, 3, baseline - legTop + 1, shade);
  fillEllipse(img, cx, legTop - 3, 11, 7, body);
  fillEllipse(img, cx + 1, legTop - 1, 7, 3, hexToPx(style.light));
  fillEllipse(img, cx + 9, legTop - 11, 5, 5, body);
  setPx(img, Math.round(cx + 11), legTop - 12, hexToPx(style.dark));
  addOutline(img, hexToPx(style.outline));
  return img;
}

/** A humanoid of the given body height standing on `baseline` in a 48 cell (for chr_* sheets). */
export function humanoidFrame(
  height: number,
  baseline: number,
  colors: {
    body: string;
    head: string;
    outline: string;
    extra?: [string, number, number, number, number];
  },
  dx = 0,
): Img {
  const img = createImg(48, 48);
  const top = baseline - height + 2;
  const cx = 24 + dx;
  const head = Math.round(height * 0.55);
  fillEllipse(img, cx, top + head / 2, 7, head / 2 - 0.5, hexToPx(colors.head));
  fillRect(img, cx - 5, top + head, 10, height - head - 4, hexToPx(colors.body));
  fillRect(img, cx - 4, baseline - 4, 3, 4, hexToPx(colors.body));
  fillRect(img, cx + 1, baseline - 4, 3, 4, hexToPx(colors.body));
  if (colors.extra) {
    const [hex, x, y, w, h] = colors.extra;
    fillRect(img, cx + x, y, w, h, hexToPx(hex));
  }
  addOutline(img, hexToPx(colors.outline));
  return img;
}

export interface SheetOptions {
  /** Canvas pixels per game pixel. */
  block: number;
  /** Whole-grid offset in canvas pixels (generators shift the grid). */
  offset?: [number, number];
  /** Per-channel color noise amplitude on subject pixels. */
  noise?: number;
  /** Blend one canvas pixel of magenta into subject edges. */
  fringe?: boolean;
  background?: string;
  seed?: number;
}

/** Blow game-resolution cells up into a generator canvas. `cells[row][col]` may be null (blank). */
export function makeSheet(
  cells: (Img | null)[][],
  cell: [number, number],
  opts: SheetOptions,
): Img {
  const rows = cells.length;
  const cols = cells[0]!.length;
  const B = opts.block;
  const [ox, oy] = opts.offset ?? [0, 0];
  const bg = hexToPx(opts.background ?? '#ff00ff');
  const canvas = createImg(cols * cell[0] * B, rows * cell[1] * B, bg);
  const rnd = lcg(opts.seed ?? 7);
  const noise = opts.noise ?? 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const src = cells[r]![c];
      if (!src) continue;
      for (let y = 0; y < src.h; y++) {
        for (let x = 0; x < src.w; x++) {
          const p = getPx(src, x, y);
          if ((p & 255) < 128) continue;
          for (let by = 0; by < B; by++) {
            for (let bx = 0; bx < B; bx++) {
              const n = () => Math.round((rnd() * 2 - 1) * noise);
              const clamp = (v: number) => Math.max(0, Math.min(255, v));
              const q = pack(
                clamp(((p >>> 24) & 255) + n()),
                clamp(((p >>> 16) & 255) + n()),
                clamp(((p >>> 8) & 255) + n()),
                255,
              );
              setPx(canvas, ox + (c * cell[0] + x) * B + bx, oy + (r * cell[1] + y) * B + by, q);
            }
          }
        }
      }
    }
  }
  if (opts.fringe) {
    const edits: [number, number, number][] = [];
    for (let y = 0; y < canvas.h; y++) {
      for (let x = 0; x < canvas.w; x++) {
        const p = getPx(canvas, x, y);
        if (p === bg) continue;
        const nearBg = [
          getPx(canvas, x - 1, y),
          getPx(canvas, x + 1, y),
          getPx(canvas, x, y - 1),
          getPx(canvas, x, y + 1),
        ].some((q) => q === bg);
        if (!nearBg) continue;
        const mix = (a: number, b: number) => Math.round((a + b) / 2);
        edits.push([
          x,
          y,
          pack(
            mix((p >>> 24) & 255, 255),
            mix((p >>> 16) & 255, 0),
            mix((p >>> 8) & 255, 255),
            255,
          ),
        ]);
      }
    }
    for (const [x, y, q] of edits) setPx(canvas, x, y, q);
  }
  return canvas;
}
