// Step 2 (art_pipeline.md 13): key out the background. Magenta backgrounds are removed by
// OKLab distance; the magenta fringe is removed where an edge pixel is closer to magenta than to
// the subject color behind it (others stay and are quantized in step 5). Black backgrounds of
// additive effects are not keyed for color, only near-black becomes transparent (black adds
// nothing under additive blending). A source alpha below one half is always transparent.

import { deltaE, type Lab, labOf } from './color';
import { createImg, type Img, isOpaque } from './image';
import { type Problem, problem } from './reasons';
import type { Keying } from './template_specs';

const MAGENTA = labOf(0xff00ffff);
/** OKLab distance under which a pixel counts as background magenta. */
export const MAGENTA_RADIUS = 0.13;
/** OKLab lightness under which an additive-effect pixel counts as black background. */
export const BLACK_L = 0.06;

/** An edge pixel that is at least this much magenta (blended with the subject behind it) goes. */
export const FRINGE_SHARE = 0.3;

/**
 * How much of an edge pixel is magenta, reading it as a blend between the subject color behind
 * it and magenta: the projection onto that line (0 subject, 1 magenta); a pixel far off the line
 * is not a blend and counts as 0.
 */
export function magentaShare(px: Lab, inner: Lab): number {
  const v = [MAGENTA[0] - inner[0], MAGENTA[1] - inner[1], MAGENTA[2] - inner[2]];
  const w = [px[0] - inner[0], px[1] - inner[1], px[2] - inner[2]];
  const vv = v[0]! * v[0]! + v[1]! * v[1]! + v[2]! * v[2]!;
  if (vv === 0) return 0;
  const t = (w[0]! * v[0]! + w[1]! * v[1]! + w[2]! * v[2]!) / vv;
  const off = Math.hypot(w[0]! - t * v[0]!, w[1]! - t * v[1]!, w[2]! - t * v[2]!);
  return off > 0.08 + 0.15 * Math.sqrt(vv) ? 0 : t;
}

export interface KeyResult {
  img: Img;
  opaqueFraction: number;
  fringeRemoved: number;
  problems: Problem[];
}

function neighborsOpaque(img: Img, x: number, y: number): boolean {
  return (
    isOpaque(img, x - 1, y) &&
    isOpaque(img, x + 1, y) &&
    isOpaque(img, x, y - 1) &&
    isOpaque(img, x, y + 1)
  );
}

export function keyBackground(src: Img, keying: Keying, opts: { checkEdges: boolean }): KeyResult {
  const img = createImg(src.w, src.h);
  img.data.set(src.data);
  const d = img.data;
  const n = src.w * src.h;
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    if (d[o + 3]! < 128) {
      d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
      continue;
    }
    d[o + 3] = 255;
    if (keying === 'none') continue;
    const px = ((d[o]! << 24) | (d[o + 1]! << 16) | (d[o + 2]! << 8) | 255) >>> 0;
    const lab = labOf(px);
    const clear = keying === 'magenta' ? deltaE(lab, MAGENTA) < MAGENTA_RADIUS : lab[0] < BLACK_L;
    if (clear) d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
  }
  let fringeRemoved = 0;
  if (keying === 'magenta') {
    for (let pass = 0; pass < 2; pass++) {
      const clear: number[] = [];
      for (let y = 0; y < img.h; y++) {
        for (let x = 0; x < img.w; x++) {
          if (!isOpaque(img, x, y) || neighborsOpaque(img, x, y)) continue;
          // Interior reference: mean color of opaque 8-neighbours that are not edge pixels.
          let L = 0;
          let A = 0;
          let B = 0;
          let k = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (
                (dx === 0 && dy === 0) ||
                !isOpaque(img, x + dx, y + dy) ||
                !neighborsOpaque(img, x + dx, y + dy)
              )
                continue;
              const o = ((y + dy) * img.w + x + dx) * 4;
              const lab = labOf(((d[o]! << 24) | (d[o + 1]! << 16) | (d[o + 2]! << 8) | 255) >>> 0);
              L += lab[0];
              A += lab[1];
              B += lab[2];
              k++;
            }
          }
          const o = (y * img.w + x) * 4;
          const lab = labOf(((d[o]! << 24) | (d[o + 1]! << 16) | (d[o + 2]! << 8) | 255) >>> 0);
          const toMagenta = deltaE(lab, MAGENTA);
          if (k === 0) {
            // An isolated edge pixel: drop it only when it is clearly pinkish.
            if (toMagenta < MAGENTA_RADIUS * 2) clear.push(o);
            continue;
          }
          const inner: Lab = [L / k, A / k, B / k];
          if (toMagenta < deltaE(lab, inner) || magentaShare(lab, inner) >= FRINGE_SHARE)
            clear.push(o);
        }
      }
      for (const o of clear) d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0;
      fringeRemoved += clear.length;
      if (clear.length === 0) break;
    }
  }
  let opaque = 0;
  for (let i = 0; i < n; i++) if (d[i * 4 + 3]! >= 128) opaque++;
  const opaqueFraction = opaque / n;
  const problems: Problem[] = [];
  if (keying !== 'none') {
    if (opaqueFraction < 0.005) {
      problems.push(
        problem(
          'scale',
          'subject_area',
          `subject covers ${(opaqueFraction * 100).toFixed(2)}% of the canvas after keying (too small)`,
        ),
      );
    }
    if (keying === 'magenta' && opaqueFraction > 0.92) {
      problems.push(
        problem(
          'background',
          'subject_area',
          'almost nothing was keyed out: the background is not flat magenta (scenery drawn in?)',
        ),
      );
    }
    if (opts.checkEdges) {
      let edge = 0;
      for (let x = 0; x < img.w; x++) {
        if (isOpaque(img, x, 0)) edge++;
        if (isOpaque(img, x, img.h - 1)) edge++;
      }
      for (let y = 1; y < img.h - 1; y++) {
        if (isOpaque(img, 0, y)) edge++;
        if (isOpaque(img, img.w - 1, y)) edge++;
      }
      if (edge > Math.max(4, 0.01 * 2 * (img.w + img.h))) {
        problems.push(
          problem(
            'frames',
            'touches_edge',
            `${edge} subject pixels touch the canvas edge (cut off or misplaced grid)`,
          ),
        );
      }
    }
  }
  return { img, opaqueFraction, fringeRemoved, problems };
}
