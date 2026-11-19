// Step 7 (art_pipeline.md 13 and 1.5): unify the outline. The generator's own outer contour (a
// 1 to 2 pixel dark ring) is stripped, then a 1-pixel outline is drawn just outside the
// silhouette in a darker level of the neighbouring fill: the deep level on the bottom and right
// edges, and for large bodies one level lighter on the lit (top and left) side. Pure black is
// never used. Key-colored doll fills take their slot's darkest level, so the outline recolors
// with the part. Thin features (no inner neighbour) are never stripped.

import { deltaE, type Lab, labOf } from './color';
import { KEY_RAMP_COLORS, keyColorInfo } from './doll_keys';
import { createImg, getPx, type Img, isOpaque, setPx } from './image';
import { neutralCandidates, type PaletteColor } from './palettes';
import type { OutlinePolicy } from './template_specs';

export interface OutlineResult {
  img: Img;
  /** The image grew by one pixel on every side; content moved by (+1, +1). */
  padded: boolean;
  stripped: number;
  added: number;
}

export const OUTLINE_COLOR_POLICY =
  'existing near-neutral neighbors for achromatic fills; darker hue neighbor within 20 degrees for chromatic fills; nearest target fallback';

const HUE_NEIGHBOR_COS = Math.cos((20 * Math.PI) / 180);

function hueNeighbors(colors: readonly PaletteColor[], fill: Lab): readonly PaletteColor[] {
  const neutral = neutralCandidates(colors, fill);
  if (neutral !== colors) return neutral;
  const chroma = Math.hypot(fill[1], fill[2]);
  if (chroma < 0.04) return colors;
  const neighbors = colors.filter((c) => {
    const candidateChroma = Math.hypot(c.lab[1], c.lab[2]);
    if (candidateChroma < 0.015) return false;
    const dot = fill[1] * c.lab[1] + fill[2] * c.lab[2];
    return dot / (chroma * candidateChroma) >= HUE_NEIGHBOR_COS;
  });
  return neighbors.length > 0 ? neighbors : colors;
}

const N4: [number, number][] = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
];

function isRing(img: Img, x: number, y: number): boolean {
  if (!isOpaque(img, x, y)) return false;
  for (const [dx, dy] of N4) if (!isOpaque(img, x + dx, y + dy)) return true;
  return false;
}

function stripPass(img: Img, prev: Lab[] | null): Lab[] {
  const kill: [number, number, Lab][] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (!isRing(img, x, y)) continue;
      const lab = labOf(getPx(img, x, y));
      let sum = 0;
      let k = 0;
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (isOpaque(img, nx, ny) && !isRing(img, nx, ny)) {
          sum += labOf(getPx(img, nx, ny))[0];
          k++;
        }
      }
      if (k === 0) continue;
      const inner = sum / k;
      if (!(lab[0] < inner - 0.08 && lab[0] < 0.5)) continue;
      // Second pass: only pixels as dark as the ring already stripped (a 2-pixel outline).
      if (prev && !(lab[0] < 0.35 && prev.some((p) => deltaE(p, lab) < 0.08))) continue;
      kill.push([x, y, lab]);
    }
  }
  for (const [x, y] of kill) setPx(img, x, y, 0);
  return kill.map((k) => k[2]);
}

export class OutlinePainter {
  private readonly cache = new Map<string, number>();
  constructor(private readonly palette: readonly PaletteColor[]) {}

  /** Outline color for a fill: kind 'normal', 'deep' (bottom and right) or 'lit' (large bodies, top and left). */
  colorFor(fill: number, kind: 'normal' | 'deep' | 'lit'): number {
    const key = `${fill}:${kind}`;
    const hit = this.cache.get(key);
    if (hit !== undefined) return hit;
    let out: number;
    const keyInfo = keyColorInfo(fill);
    if (keyInfo) {
      const ramp = KEY_RAMP_COLORS[keyInfo.slot];
      out = kind === 'lit' ? ramp[Math.min(1, ramp.length - 1)]!.px : ramp[0]!.px;
    } else {
      const lab = labOf(fill);
      const f = kind === 'deep' ? 0.45 : kind === 'lit' ? 0.78 : 0.62;
      const target: Lab = [lab[0] * f, lab[1] * 0.85, lab[2] * 0.85];
      let best: PaletteColor | null = null;
      let bd = Number.POSITIVE_INFINITY;
      const darker = this.palette.filter((c) => c.px >>> 8 !== 0 && c.lab[0] < lab[0] - 0.04);
      // Lowering lightness can make a different hue perceptually nearer: brown leather used
      // to gain red cloth edges. Prefer an existing darker neighbor of the fill's hue first.
      // Neutral fills and sparse palettes retain the original nearest-target fallback.
      for (const c of hueNeighbors(darker, lab)) {
        const d = deltaE(c.lab, target);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (!best) {
        // Nothing darker than the fill: the darkest non-black palette color.
        for (const c of this.palette) {
          if (c.px >>> 8 === 0) continue;
          if (!best || c.lab[0] < best.lab[0]) best = c;
        }
      }
      out = best ? best.px : fill;
    }
    this.cache.set(key, out);
    return out;
  }
}

export function outlineFrame(
  src: Img,
  painter: OutlinePainter,
  policy: OutlinePolicy,
  big: boolean,
): OutlineResult {
  if (policy === 'none') return { img: src, padded: false, stripped: 0, added: 0 };
  // Work on a copy padded by one pixel so the new outline is never clipped.
  const img = createImg(src.w + 2, src.h + 2);
  for (let y = 0; y < src.h; y++)
    for (let x = 0; x < src.w; x++) setPx(img, x + 1, y + 1, getPx(src, x, y));
  const first = stripPass(img, null);
  const second = first.length > 0 ? stripPass(img, first) : [];
  const stripped = first.length + second.length;
  const add: [number, number, number][] = [];
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (isOpaque(img, x, y)) continue;
      // Neighbour priority: above (outline under the shape), left (right edge), right, below.
      for (const [dx, dy] of N4) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isOpaque(img, nx, ny)) continue;
        const fill = getPx(img, nx, ny);
        const bottomOrRight = (dx === 0 && dy === -1) || (dx === -1 && dy === 0);
        const kind =
          policy === 'portrait' ? 'normal' : bottomOrRight ? 'deep' : big ? 'lit' : 'normal';
        add.push([x, y, painter.colorFor(fill, kind)]);
        break;
      }
    }
  }
  for (const [x, y, c] of add) setPx(img, x, y, c);
  return { img, padded: true, stripped, added: add.length };
}
