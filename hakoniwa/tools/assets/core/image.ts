// RGBA image buffer and the small set of pixel operations the import pipeline needs.
// Pixels are packed as unsigned 32-bit 0xRRGGBBAA so they compare and hash cheaply.

export interface Img {
  w: number;
  h: number;
  /** RGBA, row major, 4 bytes per pixel. */
  data: Uint8Array;
}

export function createImg(w: number, h: number, rgba = 0): Img {
  const img: Img = { w, h, data: new Uint8Array(w * h * 4) };
  if (rgba !== 0) fill(img, rgba);
  return img;
}

export function pack(r: number, g: number, b: number, a = 255): number {
  return ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
}

export function red(p: number): number {
  return (p >>> 24) & 255;
}
export function green(p: number): number {
  return (p >>> 16) & 255;
}
export function blue(p: number): number {
  return (p >>> 8) & 255;
}
export function alpha(p: number): number {
  return p & 255;
}

export function getPx(img: Img, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return 0;
  const i = (y * img.w + x) * 4;
  const d = img.data;
  return ((d[i]! << 24) | (d[i + 1]! << 16) | (d[i + 2]! << 8) | d[i + 3]!) >>> 0;
}

export function setPx(img: Img, x: number, y: number, p: number): void {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  const d = img.data;
  d[i] = (p >>> 24) & 255;
  d[i + 1] = (p >>> 16) & 255;
  d[i + 2] = (p >>> 8) & 255;
  d[i + 3] = p & 255;
}

export function isOpaque(img: Img, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return false;
  return img.data[(y * img.w + x) * 4 + 3]! >= 128;
}

export function fill(img: Img, p: number): void {
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) setPx(img, x, y, p);
}

export function clone(img: Img): Img {
  return { w: img.w, h: img.h, data: new Uint8Array(img.data) };
}

/** Copy a rectangle; pixels outside the source are transparent. */
export function crop(img: Img, x0: number, y0: number, w: number, h: number): Img {
  const out = createImg(w, h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) setPx(out, x, y, getPx(img, x0 + x, y0 + y));
  return out;
}

/** Paste `src` at (dx, dy); transparent source pixels are copied too (a plain blit). */
export function blit(dst: Img, src: Img, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) setPx(dst, dx + x, dy + y, getPx(src, x, y));
}

/** Paste only the opaque pixels of `src`. */
export function overlay(dst: Img, src: Img, dx: number, dy: number): void {
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      const p = getPx(src, x, y);
      if ((p & 255) >= 128) setPx(dst, dx + x, dy + y, p);
    }
  }
}

export function flipX(img: Img): Img {
  const out = createImg(img.w, img.h);
  for (let y = 0; y < img.h; y++)
    for (let x = 0; x < img.w; x++) setPx(out, img.w - 1 - x, y, getPx(img, x, y));
  return out;
}

/** Shift the content by (dx, dy) inside the same frame; pixels pushed out are reported. */
export function shift(img: Img, dx: number, dy: number): { img: Img; lost: number } {
  const out = createImg(img.w, img.h);
  let lost = 0;
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const p = getPx(img, x, y);
      if ((p & 255) < 128) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= img.w || ny >= img.h) lost++;
      else setPx(out, nx, ny, p);
    }
  }
  return { img: out, lost };
}

/** Nearest-neighbour resize (used for integer upscales in previews and contact sheets). */
export function resizeNearest(img: Img, w: number, h: number): Img {
  const out = createImg(w, h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.h - 1, Math.floor((y * img.h) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.w - 1, Math.floor((x * img.w) / w));
      setPx(out, x, y, getPx(img, sx, sy));
    }
  }
  return out;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Bounding box of the opaque pixels inside `area` (whole image by default); null when empty. */
export function contentBox(img: Img, area: Box = { x: 0, y: 0, w: img.w, h: img.h }): Box | null {
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = -1;
  let y1 = -1;
  for (let y = area.y; y < area.y + area.h; y++) {
    for (let x = area.x; x < area.x + area.w; x++) {
      if (!isOpaque(img, x, y)) continue;
      if (x < x0) x0 = x;
      if (y < y0) y0 = y;
      if (x > x1) x1 = x;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export function opaqueCount(img: Img, area: Box = { x: 0, y: 0, w: img.w, h: img.h }): number {
  let n = 0;
  for (let y = area.y; y < area.y + area.h; y++)
    for (let x = area.x; x < area.x + area.w; x++) if (isOpaque(img, x, y)) n++;
  return n;
}

/** Distinct opaque colors (alpha forced to 255) in first-seen scan order. */
export function opaqueColors(img: Img): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < 128) continue;
    const p = pack(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255);
    if (!seen.has(p)) {
      seen.add(p);
      out.push(p);
    }
  }
  return out;
}

export function sameImage(a: Img, b: Img): boolean {
  if (a.w !== b.w || a.h !== b.h) return false;
  for (let i = 0; i < a.data.length; i++) if (a.data[i] !== b.data[i]) return false;
  return true;
}
