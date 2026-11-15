// Steps 5 and 6 (art_pipeline.md 13): palette quantization in OKLab and binary transparency.
// - Every opaque pixel maps to its nearest palette color. Textures keep a 4x4 Bayer dither where
//   a pixel sits between two neighbouring levels of one ramp (no smooth gradients, 1.4).
// - Doll parts map key-colored pixels to their slot ramp by lightness (doll_keys.ts); the rest
//   uses the creature palette.
// - A per-image color cap (creature sheets 32) folds the least used colors into their nearest
//   remaining color until the sheet fits.
// - Alpha becomes 0 or 255 (step 6); a transparent pixel is stored as 0,0,0,0.
// All frames of a sheet are quantized together so the cap and the swatch cover the sheet.

import { deltaE, type Lab, labOf, pxToHex } from './color';
import { classifyKey, KEY_RAMP_COLORS, type KeySlot, keyColorInfo, keyLevel } from './doll_keys';
import type { Img } from './image';
import { nearest, type Palette, type PaletteColor } from './palettes';

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

export interface QuantOptions {
  dither?: boolean;
  maxColors?: number;
  keySlots?: readonly KeySlot[] | null;
  /** false: keep existing key ramp colors as keys but classify nothing new (re-fold after outlining). */
  classify?: boolean;
}

export interface QuantResult {
  frames: Img[];
  /** Mean OKLab error over palette-mapped (non-key) pixels. */
  meanError: number;
  /** Swatch row: the colors the sheet uses, in palette order then key ramps. */
  swatch: string[];
  /** Key ramp colors used and their slot and level. */
  slots: Record<string, { slot: KeySlot; level: number }>;
  folded: number;
}

export function binarizeAlpha(img: Img): void {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3]! < 128) d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
    else d[i + 3] = 255;
  }
}

function write(img: Img, o: number, px: number): void {
  img.data[o] = (px >>> 24) & 255;
  img.data[o + 1] = (px >>> 16) & 255;
  img.data[o + 2] = (px >>> 8) & 255;
  img.data[o + 3] = 255;
}

export function quantizeFrames(
  frames: Img[],
  palette: Palette | null,
  opts: QuantOptions = {},
): QuantResult {
  const out = frames.map((f) => ({ w: f.w, h: f.h, data: new Uint8Array(f.data) }));
  for (const f of out) binarizeAlpha(f);
  if (!palette) return { frames: out, meanError: 0, swatch: [], slots: {}, folded: 0 };
  const colors = palette.colors;
  const byPx = new Map<number, PaletteColor>(colors.map((c) => [c.px, c]));
  const near = new Map<number, ReturnType<typeof nearest>>();
  const nearOf = (px: number, lab: Lab): ReturnType<typeof nearest> => {
    let n = near.get(px);
    if (!n) {
      n = nearest(colors, lab);
      near.set(px, n);
    }
    return n;
  };
  const keyed = new Set<number>();
  const slots: QuantResult['slots'] = {};
  let errSum = 0;
  let errN = 0;
  // Pass 1: map every pixel; remember which output pixels are key colors.
  const keyMask = out.map((f) => new Uint8Array(f.w * f.h));
  out.forEach((f, fi) => {
    for (let y = 0; y < f.h; y++) {
      for (let x = 0; x < f.w; x++) {
        const o = (y * f.w + x) * 4;
        if (f.data[o + 3] === 0) continue;
        const px =
          ((f.data[o]! << 24) | (f.data[o + 1]! << 16) | (f.data[o + 2]! << 8) | 255) >>> 0;
        const lab = labOf(px);
        if (opts.keySlots) {
          const known = keyColorInfo(px);
          const slot = known
            ? known.slot
            : opts.classify === false
              ? null
              : classifyKey(lab, opts.keySlots);
          if (slot) {
            const level = known ? known.level : keyLevel(slot, lab);
            const c = KEY_RAMP_COLORS[slot][level]!;
            write(f, o, c.px);
            keyMask[fi]![y * f.w + x] = 1;
            keyed.add(c.px);
            slots[c.hex] = { slot, level };
            continue;
          }
        }
        const n = nearOf(px, lab);
        let pick = n.color;
        if (
          opts.dither &&
          n.second &&
          n.second.ramp === n.color.ramp &&
          Math.abs(n.second.level - n.color.level) === 1
        ) {
          const f2 = n.dist / (n.dist + n.dist2);
          if (f2 > 0.15 && f2 > (BAYER4[(y & 3) * 4 + (x & 3)]! + 0.5) / 16) pick = n.second;
        }
        write(f, o, pick.px);
        errSum += n.dist;
        errN++;
      }
    }
  });
  // Pass 2: fold the least used palette colors until the sheet fits the cap.
  let folded = 0;
  const cap = opts.maxColors;
  if (cap !== undefined) {
    const usage = new Map<number, number>();
    out.forEach((f, fi) => {
      for (let i = 0; i < f.w * f.h; i++) {
        if (f.data[i * 4 + 3] === 0 || keyMask[fi]![i]) continue;
        const px =
          ((f.data[i * 4]! << 24) |
            (f.data[i * 4 + 1]! << 16) |
            (f.data[i * 4 + 2]! << 8) |
            255) >>>
          0;
        usage.set(px, (usage.get(px) ?? 0) + 1);
      }
    });
    const remap = new Map<number, number>();
    while (usage.size > cap) {
      let victim = -1;
      let least = Number.POSITIVE_INFINITY;
      for (const [px, n] of usage) {
        if (n < least || (n === least && px > victim)) {
          least = n;
          victim = px;
        }
      }
      usage.delete(victim);
      const vLab = byPx.get(victim)?.lab ?? labOf(victim);
      let target = -1;
      let td = Number.POSITIVE_INFINITY;
      for (const px of usage.keys()) {
        const d = deltaE(byPx.get(px)?.lab ?? labOf(px), vLab);
        if (d < td || (d === td && px < target)) {
          td = d;
          target = px;
        }
      }
      usage.set(target, (usage.get(target) ?? 0) + least);
      for (const [from, to] of remap) if (to === victim) remap.set(from, target);
      remap.set(victim, target);
      folded++;
    }
    if (remap.size > 0) {
      out.forEach((f, fi) => {
        for (let i = 0; i < f.w * f.h; i++) {
          if (f.data[i * 4 + 3] === 0 || keyMask[fi]![i]) continue;
          const px =
            ((f.data[i * 4]! << 24) |
              (f.data[i * 4 + 1]! << 16) |
              (f.data[i * 4 + 2]! << 8) |
              255) >>>
            0;
          const to = remap.get(px);
          if (to !== undefined) write(f, i * 4, to);
        }
      });
    }
  }
  const used = new Set<number>();
  for (const f of out) {
    for (let i = 0; i < f.data.length; i += 4) {
      if (f.data[i + 3] === 0) continue;
      used.add(((f.data[i]! << 24) | (f.data[i + 1]! << 16) | (f.data[i + 2]! << 8) | 255) >>> 0);
    }
  }
  const swatch = colors.filter((c) => used.has(c.px) && !keyed.has(c.px)).map((c) => c.hex);
  for (const slot of Object.keys(KEY_RAMP_COLORS) as KeySlot[]) {
    for (const c of KEY_RAMP_COLORS[slot]) if (used.has(c.px)) swatch.push(c.hex);
  }
  // Colors outside both (only possible for palette-free images) are appended for completeness.
  for (const px of used) {
    const hex = pxToHex(px);
    if (!swatch.includes(hex)) swatch.push(hex);
  }
  return { frames: out, meanError: errN > 0 ? errSum / errN : 0, swatch, slots, folded };
}
