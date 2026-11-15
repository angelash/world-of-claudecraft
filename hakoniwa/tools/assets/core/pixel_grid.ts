// Step 4 (art_pipeline.md 13): bring the generator's "pixel art" down to real pixels.
// 1. Estimate the effective pixel block size from the edge profile: color changes between
//    neighbouring columns (rows) concentrate on the block grid, so the largest period whose
//    phase collects most of the edge weight is the block size (an edge autocorrelation).
// 2. Downsample by the mode color of each source window (colors bucketed at 5 bits per channel
//    so noisy encoder output still has a clear winner; the output is the bucket mean). Never
//    bilinear. A window less than 30% covered stays transparent.
// The scale is the template geometry (cell canvas to in-game cell); when it is within 20% of
// the detected block size the block grid is used exactly. Humanoid sheets are then refined to
// the target body height (28 px for H) when that stays within 25% of the template scale.

import { createImg, type Img, pack } from './image';

export interface BlockEstimate {
  size: number;
  phaseX: number;
  phaseY: number;
  score: number;
}

function edgeProfiles(img: Img): { ex: Float64Array; ey: Float64Array } {
  const ex = new Float64Array(img.w);
  const ey = new Float64Array(img.h);
  const d = img.data;
  const diff = (a: number, b: number): boolean => {
    const da = d[a + 3]! >= 128;
    const db = d[b + 3]! >= 128;
    if (da !== db) return true;
    if (!da) return false;
    return (
      Math.abs(d[a]! - d[b]!) + Math.abs(d[a + 1]! - d[b + 1]!) + Math.abs(d[a + 2]! - d[b + 2]!) >
      24
    );
  };
  for (let y = 0; y < img.h; y++) {
    for (let x = 1; x < img.w; x++) {
      const o = (y * img.w + x) * 4;
      if (diff(o - 4, o)) ex[x]! += 1;
    }
  }
  for (let y = 1; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      const o = (y * img.w + x) * 4;
      if (diff(o - img.w * 4, o)) ey[y]! += 1;
    }
  }
  return { ex, ey };
}

/**
 * Share of the edge weight per residue of the position modulo `size`, the strongest residue
 * (the block boundary) and whether the edges sit on that lattice. Soft edges (a fringe or
 * anti-aliasing pixel) put weight one step beside the boundary, so for blocks of 4 and more the
 * two neighbouring residues count as on-lattice, as long as the boundary residue dominates.
 */
function lattice(prof: Float64Array, size: number): { phase: number; score: number; ok: boolean } {
  let total = 0;
  for (let i = 1; i < prof.length; i++) total += prof[i]!;
  if (total === 0) return { phase: 0, score: 0, ok: false };
  const r = new Float64Array(size);
  for (let i = 1; i < prof.length; i++) r[i % size]! += prof[i]! / total;
  let p = 0;
  for (let k = 1; k < size; k++) if (r[k]! > r[p]!) p = k;
  const at = (k: number) => r[(((p + k) % size) + size) % size]!;
  if (size <= 3) return { phase: p, score: r[p]!, ok: r[p]! >= 0.8 };
  const near = at(0) + at(-1) + at(1);
  const far = 1 - near;
  const ok = at(0) >= 0.4 && far <= (size === 4 ? 0.05 : 0.1);
  return { phase: p, score: near, ok };
}

/** Detect the block size (1 means the source is already at real pixels or not block based). */
export function estimateBlock(img: Img, maxSize = 16): BlockEstimate {
  const { ex, ey } = edgeProfiles(img);
  for (let size = maxSize; size >= 2; size--) {
    const bx = lattice(ex, size);
    const by = lattice(ey, size);
    if (bx.ok && by.ok)
      return { size, phaseX: bx.phase, phaseY: by.phase, score: (bx.score + by.score) / 2 };
  }
  return { size: 1, phaseX: 0, phaseY: 0, score: 1 };
}

/**
 * Mode downsample: output pixel (i, j) takes the dominant color bucket of the source window
 * [ox + i*rx, ox + (i+1)*rx) x [oy + j*ry, oy + (j+1)*ry).
 */
export function reduceMode(
  img: Img,
  ox: number,
  oy: number,
  rx: number,
  ry: number,
  outW: number,
  outH: number,
): Img {
  const out = createImg(outW, outH);
  const d = img.data;
  const sums = new Map<number, [number, number, number, number]>();
  for (let j = 0; j < outH; j++) {
    const y0 = Math.floor(oy + j * ry);
    const y1 = Math.max(y0 + 1, Math.floor(oy + (j + 1) * ry));
    for (let i = 0; i < outW; i++) {
      const x0 = Math.floor(ox + i * rx);
      const x1 = Math.max(x0 + 1, Math.floor(ox + (i + 1) * rx));
      sums.clear();
      let transparent = 0;
      let total = 0;
      for (let y = y0; y < y1; y++) {
        if (y < 0 || y >= img.h) {
          transparent += x1 - x0;
          total += x1 - x0;
          continue;
        }
        for (let x = x0; x < x1; x++) {
          total++;
          if (x < 0 || x >= img.w) {
            transparent++;
            continue;
          }
          const o = (y * img.w + x) * 4;
          if (d[o + 3]! < 128) {
            transparent++;
            continue;
          }
          const key = ((d[o]! >> 3) << 10) | ((d[o + 1]! >> 3) << 5) | (d[o + 2]! >> 3);
          const s = sums.get(key);
          if (s) {
            s[0] += d[o]!;
            s[1] += d[o + 1]!;
            s[2] += d[o + 2]!;
            s[3] += 1;
          } else sums.set(key, [d[o]!, d[o + 1]!, d[o + 2]!, 1]);
        }
      }
      // Opaque from 30% coverage: a one-pixel feature keeps its block after its fringe is keyed
      // away on three sides, while a background block holding a neighbour's fringe stays clear.
      if (transparent >= 0.7 * total) continue;
      let bestKey = -1;
      let best: [number, number, number, number] | null = null;
      for (const [k, s] of sums) {
        if (!best || s[3] > best[3] || (s[3] === best[3] && k < bestKey)) {
          best = s;
          bestKey = k;
        }
      }
      if (!best) continue;
      const o = (j * outW + i) * 4;
      const p = pack(
        Math.round(best[0] / best[3]),
        Math.round(best[1] / best[3]),
        Math.round(best[2] / best[3]),
        255,
      );
      out.data[o] = (p >>> 24) & 255;
      out.data[o + 1] = (p >>> 16) & 255;
      out.data[o + 2] = (p >>> 8) & 255;
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export interface ScaleChoice {
  /** Source pixels per output pixel. */
  ratio: number;
  /** Whether the detected block grid is used exactly. */
  blockAligned: boolean;
  /** Set when the humanoid body-height refinement changed the ratio. */
  refinedFrom?: number;
}

/** Template-geometry ratio, snapped to the block grid when close. */
export function chooseRatio(geometric: number, block: BlockEstimate): ScaleChoice {
  if (block.size >= 2 && Math.abs(geometric / block.size - 1) <= 0.2)
    return { ratio: block.size, blockAligned: true };
  return { ratio: geometric, blockAligned: false };
}

/**
 * Refine for a humanoid body height: keep the template ratio when the body already lands in
 * range, otherwise scale to the target height; null when the drawing is too far off to trust
 * (more than 25% from the template proportion), which the caller reports as `scale`.
 */
export function refineForHeight(
  choice: ScaleChoice,
  measuredSourceHeight: number,
  body: { target: number; min: number; max: number },
  block: BlockEstimate,
): ScaleChoice | null {
  const h0 = Math.round(measuredSourceHeight / choice.ratio);
  if (h0 >= body.min && h0 <= body.max) return choice;
  const rh = measuredSourceHeight / body.target;
  if (Math.abs(rh / choice.ratio - 1) > 0.25) return null;
  if (block.size >= 2 && Math.abs(rh / block.size - 1) < 0.06) {
    return { ratio: block.size, blockAligned: true, refinedFrom: choice.ratio };
  }
  return { ratio: rh, blockAligned: false, refinedFrom: choice.ratio };
}

/** Window origin snapped to the block phase so every window covers exactly one block. */
export function snapOrigin(v: number, phase: number, size: number): number {
  if (size < 2) return v;
  return v - ((((v - phase) % size) + size) % size);
}
