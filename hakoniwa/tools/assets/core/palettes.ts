// Quantization palettes (art_pipeline.md 1.4, 11 and 13 step 5).
// - Creature palette: 64 global colors for characters, monsters, bosses, mounts, units and
//   most icons (skin 8 bands, hair 10, cloth 24, metal and leather 10, reserved 12); a sheet
//   may use at most 32 of them (portraits 32, busts 48).
// - Style-pack palette: the pack's 8 to 16 anchor colors (templates.json `styles`), each with
//   one darker and one lighter step (at most 48), plus the reserved semantic colors.
// - UI palette: 16 colors for interface glyphs and head markers.
// - VFX ramps, grayscale overlays and two-tone ornaments are derived per image (median cut).
// Pure black never appears in any palette (1.5: no pure black outline).

import { deltaE, type Lab, labOf, oklabToRgb, parseHex, pxToHex, rgbToOklab } from './color';
import { type Img, pack } from './image';

export interface PaletteColor {
  hex: string;
  px: number;
  lab: Lab;
  /** Ramp the color belongs to (skin, hair, cloth_red, metal, anchor_3, reserved, ...). */
  ramp: string;
  /** Position in the ramp, 0 = darkest. */
  level: number;
}

export interface Palette {
  id: string;
  colors: PaletteColor[];
  /** Most colors one image may use (creature sheets 32); undefined means no cap. */
  maxPerImage?: number;
}

export function paletteColor(hex: string, ramp: string, level: number): PaletteColor {
  const [r, g, b] = parseHex(hex);
  return { hex: hex.toLowerCase(), px: pack(r, g, b, 255), lab: rgbToOklab(r, g, b), ramp, level };
}

function ramp(name: string, hexes: string[]): PaletteColor[] {
  return hexes.map((h, i) => paletteColor(h, name, i));
}

/** Reserved semantic colors (1.4): door gold, dian purple, divine white-gold. */
export const RESERVED_SEMANTIC = {
  doorGold: '#f0d890',
  dianPurple: '#4a3a62',
  divineGold: '#fff4d6',
} as const;

export const RESERVED_SEMANTIC_HEX: readonly string[] = Object.values(RESERVED_SEMANTIC);

const CREATURE_COLORS: PaletteColor[] = [
  ...ramp('skin', [
    '#42281c',
    '#623a26',
    '#865236',
    '#a86e4a',
    '#c88d64',
    '#e0ad84',
    '#f2cba8',
    '#fce4d0',
  ]),
  ...ramp('hair', [
    '#2b2220',
    '#4a3226',
    '#6e4a30',
    '#8c3a24',
    '#c0582e',
    '#e09048',
    '#e8c068',
    '#f6e4a8',
    '#b8bcc8',
    '#eceaf0',
  ]),
  ...ramp('cloth_red', ['#5a1c22', '#9a2e30', '#d4584c']),
  ...ramp('cloth_ochre', ['#6a4a1c', '#a8782c', '#dcae52']),
  ...ramp('cloth_green', ['#23402a', '#3e6e38', '#74aa54']),
  ...ramp('cloth_teal', ['#1c4246', '#2c706c', '#5aaa9e']),
  ...ramp('cloth_blue', ['#1c2850', '#2e4a88', '#5c80c8']),
  ...ramp('cloth_violet', ['#3a2448', '#603c7a', '#926aaa']),
  ...ramp('cloth_cream', ['#847a66', '#c6baa0', '#f0e8d2']),
  ...ramp('cloth_charcoal', ['#26262e', '#46464e', '#6c6c76']),
  ...ramp('metal', ['#3c4048', '#626872', '#8e949e', '#bcc2ca', '#e6eaee']),
  ...ramp('leather', ['#3c2818', '#5e3e24', '#805836', '#a2764a', '#c69c6a']),
  ...ramp('reserved', [
    '#1a1420',
    '#2e2434',
    RESERVED_SEMANTIC.dianPurple,
    '#6e5c8c',
    '#8a1424',
    '#b89a52',
    '#58cce6',
    '#d8e070',
    '#f4a0b4',
    RESERVED_SEMANTIC.doorGold,
    RESERVED_SEMANTIC.divineGold,
    '#ffffff',
  ]),
];

export const CREATURE_PALETTE: Palette = {
  id: 'creature',
  colors: CREATURE_COLORS,
  maxPerImage: 32,
};

export const UI_PALETTE: Palette = {
  id: 'ui',
  colors: ramp('ui', [
    '#1c1a24',
    '#3a3646',
    '#6a6478',
    '#a8a2b4',
    '#e8e4ec',
    '#ffffff',
    '#d83a3a',
    '#4ab858',
    '#e8c040',
    '#5aa8f0',
    '#f0d890',
    '#a88a40',
    '#4a3a62',
    '#f4ead0',
    '#6a4a30',
    '#58cce6',
  ]),
};

function safeHex(rgb: [number, number, number]): string {
  const [r, g, b] = rgb;
  // Never let a derived step collapse to pure black.
  if (r === 0 && g === 0 && b === 0) return '#0a0a0c';
  return pxToHex(pack(r, g, b, 255));
}

/** A style pack's quantization board: anchors with a darker and lighter step, plus reserved colors. */
export function stylePalette(styleId: string, anchors: readonly string[]): Palette {
  const colors: PaletteColor[] = [];
  const seen = new Set<string>();
  const add = (hex: string, r: string, level: number): void => {
    const h = hex.toLowerCase();
    if (seen.has(h)) return;
    seen.add(h);
    colors.push(paletteColor(h, r, level));
  };
  anchors.forEach((hex, i) => {
    const [r, g, b] = parseHex(hex);
    const [L, A, B] = rgbToOklab(r, g, b);
    const name = `anchor_${i}`;
    add(safeHex(oklabToRgb([Math.max(0.08, L - 0.1), A * 0.9, B * 0.9])), name, 0);
    add(hex, name, 1);
    add(safeHex(oklabToRgb([Math.min(0.98, L + 0.08), A * 0.95, B * 0.95])), name, 2);
  });
  RESERVED_SEMANTIC_HEX.forEach((hex, i) => {
    add(hex, 'reserved', i);
  });
  return { id: `style:${styleId}`, colors };
}

/** Median cut over the opaque pixels of an image (deterministic); pure black is excluded. */
export function medianCut(img: Img, count: number, id: string, minL = 0): Palette {
  const counts = new Map<number, number>();
  for (let i = 0; i < img.data.length; i += 4) {
    if (img.data[i + 3]! < 128) continue;
    const p = pack(img.data[i]!, img.data[i + 1]!, img.data[i + 2]!, 255);
    if (labOf(p)[0] < minL) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  type Box = { items: { lab: Lab; n: number; px: number }[] };
  const all = [...counts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([px, n]) => ({ px, n, lab: labOf(px) }));
  if (all.length === 0) return { id, colors: [] };
  const boxes: Box[] = [{ items: all }];
  while (boxes.length < count) {
    // Split the box with the widest extent (ties: earlier box).
    let bi = -1;
    let bestRange = 0;
    let axis = 0;
    boxes.forEach((b, i) => {
      if (b.items.length < 2) return;
      for (let k = 0; k < 3; k++) {
        let lo = Number.POSITIVE_INFINITY;
        let hi = Number.NEGATIVE_INFINITY;
        for (const it of b.items) {
          lo = Math.min(lo, it.lab[k]!);
          hi = Math.max(hi, it.lab[k]!);
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          bi = i;
          axis = k;
        }
      }
    });
    if (bi < 0) break;
    const box = boxes[bi]!;
    const sorted = [...box.items].sort((a, b) => a.lab[axis]! - b.lab[axis]! || a.px - b.px);
    const total = sorted.reduce((s, it) => s + it.n, 0);
    let acc = 0;
    let cut = 1;
    for (let i = 0; i < sorted.length - 1; i++) {
      acc += sorted[i]!.n;
      cut = i + 1;
      if (acc * 2 >= total) break;
    }
    boxes.splice(bi, 1, { items: sorted.slice(0, cut) }, { items: sorted.slice(cut) });
  }
  const colors: PaletteColor[] = [];
  const seen = new Set<string>();
  for (const b of boxes) {
    const n = b.items.reduce((s, it) => s + it.n, 0);
    const lab: [number, number, number] = [0, 0, 0];
    for (const it of b.items) for (let k = 0; k < 3; k++) lab[k] += (it.lab[k]! * it.n) / n;
    const hex = safeHex(oklabToRgb(lab));
    if (seen.has(hex)) continue;
    seen.add(hex);
    colors.push(paletteColor(hex, id, 0));
  }
  colors.sort((a, b) => a.lab[0] - b.lab[0]);
  colors.forEach((c, i) => {
    c.level = i;
  });
  return { id, colors };
}

/** Grayscale levels for overlay textures (vfx_overlay); level 0 is near black, never pure black. */
export function grayPalette(levels: number): Palette {
  const colors: PaletteColor[] = [];
  for (let i = 0; i < levels; i++) {
    const v = Math.round(16 + ((255 - 16) * i) / (levels - 1));
    colors.push(paletteColor(pxToHex(pack(v, v, v, 255)), 'gray', i));
  }
  return { id: `gray${levels}`, colors };
}

/** Nearest palette entry in OKLab (ties: earlier entry). */
export function nearest(
  palette: readonly PaletteColor[],
  lab: Lab,
): { color: PaletteColor; dist: number; second?: PaletteColor; dist2: number } {
  let bi = -1;
  let si = -1;
  let d1 = Number.POSITIVE_INFINITY;
  let d2 = Number.POSITIVE_INFINITY;
  palette.forEach((c, i) => {
    const d = deltaE(c.lab, lab);
    if (d < d1) {
      si = bi;
      d2 = d1;
      bi = i;
      d1 = d;
    } else if (d < d2) {
      si = i;
      d2 = d;
    }
  });
  if (bi < 0) throw new Error('empty palette');
  return { color: palette[bi]!, dist: d1, second: si >= 0 ? palette[si] : undefined, dist2: d2 };
}

export function paletteSet(palette: Palette): Set<number> {
  return new Set(palette.colors.map((c) => c.px));
}
