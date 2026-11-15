// Thin DOM helpers for the Canvas2D backend: offscreen canvases and pixel matrices.

import type { PixelMatrix } from '../sprites/pixels';

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function ctx2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('2d canvas unavailable');
  ctx.imageSmoothingEnabled = false;
  return ctx;
}

export function matrixToCanvas(m: PixelMatrix): HTMLCanvasElement {
  const c = makeCanvas(m.w, m.h);
  if (m.w > 0 && m.h > 0) {
    const data = new ImageData(new Uint8ClampedArray(m.rgba), m.w, m.h);
    ctx2d(c).putImageData(data, 0, 0);
  }
  return c;
}

/** Resize a canvas only when its size changed (resizing clears it). */
export function ensureSize(c: HTMLCanvasElement, w: number, h: number): boolean {
  const W = Math.max(1, Math.ceil(w));
  const H = Math.max(1, Math.ceil(h));
  if (c.width === W && c.height === H) return false;
  c.width = W;
  c.height = H;
  return true;
}
