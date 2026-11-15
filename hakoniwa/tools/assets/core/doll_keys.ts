// Paper-doll key colors (art_pipeline.md 1.4 and 3.3): doll parts are generated in fixed key
// color families (primary pure red, secondary pure blue, leather brown, metal gray, accent green,
// hair pure yellow, skin light beige). Import maps each pixel to a color slot by hue and to a
// ramp level by lightness, so the runtime recolors a part by swapping its swatch row.
//
// Which slots a part may use depends on the template: outfit strips (chr_* under art_doll_,
// except the gray mannequin) use the five outfit slots; head parts use hair, skin and metal;
// back attachments use primary, secondary and hair (fur). Everything outside the slot regions
// stays a fixed color and is quantized to the creature palette.
//
// The life_a strip carries a crate drawn in light wood #b48a58 (doll.json notes). The leather
// region stops at OKLab L 0.60 so that color (L 0.66) and its near neighbours stay fixed and
// never become recolorable leather; `crateWoodLeaks` guards the rule on imported strips.

import { deltaE, type Lab, labOf, lch } from './color';
import type { Img } from './image';
import { type PaletteColor, paletteColor } from './palettes';

export type KeySlot = 'primary' | 'secondary' | 'leather' | 'metal' | 'accent' | 'hair' | 'skin';

export const KEY_SLOTS: readonly KeySlot[] = [
  'primary',
  'secondary',
  'leather',
  'metal',
  'accent',
  'hair',
  'skin',
];

/** Canonical ramp per slot (level 0 darkest, used for outlines; 3 lightest). */
export const KEY_RAMPS: Record<KeySlot, readonly string[]> = {
  primary: ['#5a0e12', '#a01c1c', '#d83030', '#ff7060'],
  secondary: ['#101e5a', '#1e3ca0', '#3a64e0', '#80a4ff'],
  leather: ['#3a2412', '#5a3a1e', '#7a5230', '#94683e'],
  metal: ['#3c3e44', '#62666e', '#9095a0', '#c8ccd4'],
  accent: ['#0e3a16', '#1e6a2a', '#3ca048', '#7cd27a'],
  hair: ['#806010', '#c0a010', '#f0d820', '#fff48a'],
  skin: ['#d0aa86', '#dcb894', '#ecd0b0', '#fbeedd'],
};

/** Light wood of the life_a crate: a fixed prop color, never a key slot. */
export const CRATE_WOOD = '#b48a58';

export const KEY_RAMP_COLORS: Record<KeySlot, PaletteColor[]> = Object.fromEntries(
  KEY_SLOTS.map((s) => [s, KEY_RAMPS[s].map((h, i) => paletteColor(h, `key_${s}`, i))]),
) as Record<KeySlot, PaletteColor[]>;

const OUTFIT: readonly KeySlot[] = ['primary', 'secondary', 'leather', 'metal', 'accent'];
const HEAD: readonly KeySlot[] = ['hair', 'skin', 'metal'];
const BACK: readonly KeySlot[] = ['primary', 'secondary', 'hair'];

/** Key slots a doll part may use, or null when the asset is not key-colored. */
export function keySlotsFor(template: string, assetId: string): readonly KeySlot[] | null {
  if (!assetId.startsWith('art_doll_')) return null;
  if (template === 'doll_head') return HEAD;
  if (template === 'doll_back') return BACK;
  if (template.startsWith('chr_') && !assetId.startsWith('art_doll_mannequin_')) return OUTFIT;
  return null;
}

function hueIn(h: number, lo: number, hi: number): boolean {
  return lo <= hi ? h >= lo && h < hi : h >= lo || h < hi;
}

/** Slot of a color by OKLCh region, restricted to `allowed`; null means a fixed color. */
export function classifyKey(lab: Lab, allowed: readonly KeySlot[] = KEY_SLOTS): KeySlot | null {
  const { L, C, H } = lch(lab);
  const ok = (s: KeySlot): boolean => allowed.includes(s);
  if (ok('metal') && C < 0.035 && L >= 0.2 && L <= 0.95) return 'metal';
  if (ok('primary') && C >= 0.1 && hueIn(H, 350, 40)) return 'primary';
  if (ok('secondary') && C >= 0.07 && hueIn(H, 215, 300)) return 'secondary';
  if (ok('accent') && C >= 0.07 && hueIn(H, 120, 180)) return 'accent';
  if (ok('hair') && C >= 0.09 && L >= 0.5 && hueIn(H, 80, 120)) return 'hair';
  if (ok('skin') && C >= 0.02 && C < 0.1 && L >= 0.74 && hueIn(H, 40, 95)) return 'skin';
  if (ok('leather') && C >= 0.035 && C < 0.14 && L >= 0.2 && L <= 0.6 && hueIn(H, 35, 80))
    return 'leather';
  return null;
}

/** Ramp level by lightness: the slot's canonical level with the nearest OKLab L. */
export function keyLevel(slot: KeySlot, lab: Lab): number {
  const ramp = KEY_RAMP_COLORS[slot];
  let best = 0;
  let bestD = Number.POSITIVE_INFINITY;
  ramp.forEach((c, i) => {
    const d = Math.abs(c.lab[0] - lab[0]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** Slot and level of a canonical key ramp color (for checks on processed output). */
export function keyColorInfo(px: number): { slot: KeySlot; level: number } | null {
  for (const s of KEY_SLOTS) {
    const i = KEY_RAMP_COLORS[s].findIndex((c) => c.px === (px | 255) >>> 0);
    if (i >= 0) return { slot: s, level: i };
  }
  return null;
}

/**
 * Crate guard for life_a outfit strips: pixels of the source within `radius` (OKLab) of the
 * crate wood that the slot map would turn into leather. Must be zero.
 */
export function crateWoodLeaks(img: Img, allowed: readonly KeySlot[], radius = 0.06): number {
  const crate = labOf(((0xb48a58 << 8) | 255) >>> 0);
  let n = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < 128) continue;
    const px =
      ((img.data[i]! << 24) | (img.data[i + 1]! << 16) | (img.data[i + 2]! << 8) | 255) >>> 0;
    const lab = labOf(px);
    if (deltaE(lab, crate) > radius) continue;
    if (classifyKey(lab, allowed) === 'leather') n++;
  }
  return n;
}
