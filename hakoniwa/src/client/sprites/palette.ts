// Colour helpers and shade ramps for the procedural pixel art. Ramps follow
// art_pipeline_2d.md 1.5 to 1.7: light comes from the upper left, light steps shift
// warm, dark steps shift cool, and the outline is the deepest step of the neighbouring
// fill ramp (never pure black). Pure; Node-tested.

import type { Rgb } from './pixels';

/** Shade levels inside a ramp. */
export const SHADE = {
  HIGHLIGHT: 0,
  LIGHT: 1,
  BASE: 2,
  SHADOW: 3,
  /** outline on the lit (top, left) side */
  OUTLINE: 4,
  /** outline on the bottom and right edges, one step deeper */
  OUTLINE_DEEP: 5,
} as const;

export const RAMP_LEVELS = 6;

export function parseHex(hex: string | undefined, fallback: Rgb): Rgb {
  if (!hex) return fallback;
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return fallback;
  let s = m[1] as string;
  if (s.length === 3) s = s.replace(/./g, (c) => c + c);
  return Number.parseInt(s, 16);
}

export function toHex(rgb: Rgb): string {
  return `#${(rgb & 0xffffff).toString(16).padStart(6, '0')}`;
}

export function toCss(rgb: Rgb, alpha = 1): string {
  const r = (rgb >> 16) & 0xff;
  const g = (rgb >> 8) & 0xff;
  const b = rgb & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

export function mix(a: Rgb, b: Rgb, t: number): Rgb {
  const k = Math.max(0, Math.min(1, t));
  const r = Math.round(((a >> 16) & 0xff) * (1 - k) + ((b >> 16) & 0xff) * k);
  const g = Math.round(((a >> 8) & 0xff) * (1 - k) + ((b >> 8) & 0xff) * k);
  const bl = Math.round((a & 0xff) * (1 - k) + (b & 0xff) * k);
  return (r << 16) | (g << 8) | bl;
}

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function rgbToHsl(rgb: Rgb): Hsl {
  const r = ((rgb >> 16) & 0xff) / 255;
  const g = ((rgb >> 8) & 0xff) / 255;
  const b = (rgb & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(hsl: Hsl): Rgb {
  const h = (((hsl.h % 360) + 360) % 360) / 360;
  const s = Math.max(0, Math.min(1, hsl.s));
  const l = Math.max(0, Math.min(1, hsl.l));
  if (s === 0) {
    const v = Math.round(l * 255);
    return (v << 16) | (v << 8) | v;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const ch = (t0: number) => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const r = Math.round(ch(h + 1 / 3) * 255);
  const g = Math.round(ch(h) * 255);
  const b = Math.round(ch(h - 1 / 3) * 255);
  return (r << 16) | (g << 8) | b;
}

/** Move hue a fraction of the way toward a target hue along the short arc. */
function hueToward(h: number, target: number, t: number): number {
  let d = target - h;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return h + d * t;
}

const WARM_HUE = 48;
const COOL_HUE = 228;
/** Floor for the deepest step so outlines never collapse to pure black. */
const MIN_LIGHTNESS = 0.07;

/**
 * Six-step ramp from a base colour: highlight, light, base, shadow, outline, deep
 * outline. Light steps lean warm, dark steps lean cool.
 */
export function shadeRamp(base: Rgb): Rgb[] {
  const hsl = rgbToHsl(base);
  const chroma = hsl.s > 0.04;
  const step = (dl: number, hueT: number, ds: number): Rgb => {
    const target = dl > 0 ? WARM_HUE : COOL_HUE;
    const l = Math.max(MIN_LIGHTNESS, Math.min(0.96, hsl.l + dl));
    return hslToRgb({
      h: chroma ? hueToward(hsl.h, target, hueT) : hsl.h,
      s: chroma ? Math.min(1, hsl.s + ds) : hsl.s,
      l,
    });
  };
  const outline = Math.min(hsl.l * 0.42, 0.24);
  return [
    step(0.16, 0.18, -0.04),
    step(0.08, 0.08, -0.02),
    base,
    step(-0.12, 0.1, 0.04),
    hslToRgb({
      h: chroma ? hueToward(hsl.h, COOL_HUE, 0.1) : hsl.h,
      s: chroma ? Math.min(0.62, hsl.s * 0.8) : hsl.s,
      l: Math.max(MIN_LIGHTNESS + 0.03, outline + 0.04),
    }),
    hslToRgb({
      h: chroma ? hueToward(hsl.h, COOL_HUE, 0.14) : hsl.h,
      s: chroma ? Math.min(0.58, hsl.s * 0.75) : hsl.s,
      l: Math.max(MIN_LIGHTNESS, outline - 0.02),
    }),
  ];
}

export function lighten(rgb: Rgb, dl: number): Rgb {
  const hsl = rgbToHsl(rgb);
  return hslToRgb({ ...hsl, l: hsl.l + dl });
}

/** Relative luminance 0..1 (sRGB approximation, good enough for contrast picks). */
export function luminance(rgb: Rgb): number {
  return (
    (0.2126 * ((rgb >> 16) & 0xff) + 0.7152 * ((rgb >> 8) & 0xff) + 0.0722 * (rgb & 0xff)) / 255
  );
}
