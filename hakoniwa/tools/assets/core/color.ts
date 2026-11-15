// Color math for quantization (art_pipeline.md 13 step 5: nearest palette color in OKLab).
// OKLab per Bjorn Ottosson; sRGB transfer per IEC 61966-2-1. Conversions of packed pixels are
// memoised because AI sheets reuse the same few thousand colors across a whole canvas.

import { blue, green, pack, red } from './image';

export type Lab = readonly [number, number, number];

export interface Lch {
  L: number;
  C: number;
  /** Hue in degrees, 0 to 360. */
  H: number;
}

const toLinear = new Float64Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  toLinear[i] = c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function fromLinear(c: number): number {
  const v = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
  return Math.max(0, Math.min(255, Math.round(v * 255)));
}

export function rgbToOklab(r: number, g: number, b: number): Lab {
  const lr = toLinear[r]!;
  const lg = toLinear[g]!;
  const lb = toLinear[b]!;
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

export function oklabToRgb(lab: Lab): [number, number, number] {
  const [L, a, b] = lab;
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

const labCache = new Map<number, Lab>();

/** OKLab of a packed pixel (alpha ignored). */
export function labOf(p: number): Lab {
  const key = p >>> 8;
  let v = labCache.get(key);
  if (!v) {
    v = rgbToOklab(red(p), green(p), blue(p));
    if (labCache.size > 1 << 20) labCache.clear();
    labCache.set(key, v);
  }
  return v;
}

export function lch(lab: Lab): Lch {
  const C = Math.hypot(lab[1], lab[2]);
  let H = (Math.atan2(lab[2], lab[1]) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L: lab[0], C, H };
}

export function deltaE(a: Lab, b: Lab): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function parseHex(hex: string): [number, number, number] {
  const m = /^#?([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`bad hex color ${hex}`);
  const n = Number.parseInt(m[1]!, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function hexToPx(hex: string): number {
  const [r, g, b] = parseHex(hex);
  return pack(r, g, b, 255);
}

export function pxToHex(p: number): string {
  return `#${((p >>> 8) & 0xffffff).toString(16).padStart(6, '0')}`;
}

/** Relative luminance-like lightness used by brightness checks (OKLab L, 0 to 1). */
export function lightness(p: number): number {
  return labOf(p)[0];
}
