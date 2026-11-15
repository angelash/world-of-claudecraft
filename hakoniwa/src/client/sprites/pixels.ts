// Pixel matrix: the DOM-free output of every procedural art generator. RGBA bytes in
// row-major order, directly usable as ImageData. Pure; Node-tested.

export interface PixelMatrix {
  w: number;
  h: number;
  /** length w * h * 4, RGBA */
  rgba: Uint8ClampedArray;
}

/** 0xRRGGBB */
export type Rgb = number;

export function createMatrix(w: number, h: number): PixelMatrix {
  return { w, h, rgba: new Uint8ClampedArray(Math.max(0, w * h * 4)) };
}

export function setPixel(m: PixelMatrix, x: number, y: number, rgb: Rgb, a = 255): void {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return;
  const i = (y * m.w + x) * 4;
  m.rgba[i] = (rgb >> 16) & 0xff;
  m.rgba[i + 1] = (rgb >> 8) & 0xff;
  m.rgba[i + 2] = rgb & 0xff;
  m.rgba[i + 3] = a;
}

export function getPixel(m: PixelMatrix, x: number, y: number): Rgb {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0;
  const i = (y * m.w + x) * 4;
  return (
    ((m.rgba[i] as number) << 16) | ((m.rgba[i + 1] as number) << 8) | (m.rgba[i + 2] as number)
  );
}

export function getAlpha(m: PixelMatrix, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return 0;
  return m.rgba[(y * m.w + x) * 4 + 3] as number;
}

export function fillMatrix(m: PixelMatrix, rgb: Rgb, a = 255): void {
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) setPixel(m, x, y, rgb, a);
}

/** Copy src into dst at (dx, dy); transparent source pixels are skipped. */
export function blit(dst: PixelMatrix, src: PixelMatrix, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= dst.h) continue;
    for (let x = 0; x < src.w; x++) {
      const tx = x + dx;
      if (tx < 0 || tx >= dst.w) continue;
      const si = (y * src.w + x) * 4;
      if ((src.rgba[si + 3] as number) === 0) continue;
      const di = (ty * dst.w + tx) * 4;
      dst.rgba[di] = src.rgba[si] as number;
      dst.rgba[di + 1] = src.rgba[si + 1] as number;
      dst.rgba[di + 2] = src.rgba[si + 2] as number;
      dst.rgba[di + 3] = src.rgba[si + 3] as number;
    }
  }
}

export function mirrorX(m: PixelMatrix): PixelMatrix {
  const out = createMatrix(m.w, m.h);
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      const si = (y * m.w + x) * 4;
      const di = (y * m.w + (m.w - 1 - x)) * 4;
      out.rgba[di] = m.rgba[si] as number;
      out.rgba[di + 1] = m.rgba[si + 1] as number;
      out.rgba[di + 2] = m.rgba[si + 2] as number;
      out.rgba[di + 3] = m.rgba[si + 3] as number;
    }
  }
  return out;
}

/** Number of non-transparent pixels. */
export function opaqueCount(m: PixelMatrix): number {
  let n = 0;
  for (let i = 3; i < m.rgba.length; i += 4) if ((m.rgba[i] as number) > 0) n++;
  return n;
}

/** Bounding box of non-transparent pixels, or null when empty. */
export function opaqueBounds(
  m: PixelMatrix,
): { x0: number; y0: number; x1: number; y1: number } | null {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if ((m.rgba[(y * m.w + x) * 4 + 3] as number) === 0) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x0, y0, x1, y1 };
}

/** FNV-1a over the bytes and size; used by determinism tests and cache keys. */
export function matrixHash(m: PixelMatrix): number {
  let h = 0x811c9dc5 ^ m.w ^ (m.h << 16);
  for (let i = 0; i < m.rgba.length; i++) {
    h ^= m.rgba[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Deterministic noise and dithering helpers shared by the art generators.

/** Integer hash of a few ints to 0..2^32-1. */
export function hash3(a: number, b: number, c: number): number {
  let h =
    Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Hash of a string to 0..2^32-1 (FNV-1a). */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 4x4 ordered (Bayer) dither thresholds, 0..15. */
export const BAYER4: readonly number[] = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export function bayer4(x: number, y: number): number {
  return BAYER4[(((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4)] as number;
}
