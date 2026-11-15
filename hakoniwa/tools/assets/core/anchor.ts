// Steps 8 and 9 (art_pipeline.md 13, 3.2, 3.5): place every frame in its in-game cell.
// - Foot anchor: each direction row shares one baseline: the row's median lowest opaque line
//   lands on the template anchor (H humanoid (24, 44)); relative vertical motion inside the row
//   (a jump, a lift) is kept.
// - Torso center: in-place animations (idle, walk, cast loop, ...) put every frame's torso on
//   the anchor column, which removes generator jitter; drift over 2 px means the frames were
//   drawn unstable and the sheet goes to rework. Moving animations shift as a group.
// - Flying sheets keep their height (the body floats; the anchor is the ground projection).
// - Neck, center and none anchors: parts keep the generator's placement, icons are centered.
// - Mirroring: left-facing frames are the right-facing ones flipped (recorded, not duplicated).

import { contentBox, createImg, type Img, isOpaque, overlay } from './image';
import { type Problem, problem } from './reasons';
import type { CellDef, ImportSpec } from './template_specs';

export interface FrameInput {
  col: number;
  row: number;
  def: CellDef;
  /** Content already scaled to game pixels (tight box, outline included). */
  img: Img;
  /** Top-left of the content inside the in-game cell when the generator's placement is kept. */
  rel: [number, number];
}

export interface PlacedFrame extends FrameInput {
  cell: Img;
  at: [number, number];
  anchor: [number, number] | null;
  footprint: number;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

function lowestRow(img: Img): number {
  for (let y = img.h - 1; y >= 0; y--)
    for (let x = 0; x < img.w; x++) if (isOpaque(img, x, y)) return y;
  return img.h - 1;
}

/** Mean x of opaque pixels in the middle band of the content (30% to 70% of its height). */
export function torsoX(img: Img): number {
  const box = contentBox(img);
  if (!box) return img.w / 2;
  const y0 = box.y + Math.floor(box.h * 0.3);
  const y1 = Math.max(y0 + 1, box.y + Math.ceil(box.h * 0.7));
  let sum = 0;
  let n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = 0; x < img.w; x++) {
      if (isOpaque(img, x, y)) {
        sum += x;
        n++;
      }
    }
  }
  return n > 0 ? sum / n : box.x + box.w / 2;
}

/** Midpoint of the lowest opaque row (the foot anchor, art_pipeline.md 13 step 8). */
export function footMidX(img: Img): number {
  const y = lowestRow(img);
  let x0 = -1;
  let x1 = -1;
  for (let x = 0; x < img.w; x++) {
    if (!isOpaque(img, x, y)) continue;
    if (x0 < 0) x0 = x;
    x1 = x;
  }
  return x0 < 0 ? img.w / 2 : (x0 + x1) / 2;
}

function footprintOf(img: Img): number {
  const box = contentBox(img);
  if (!box) return 0;
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = -1;
  for (let y = box.y + box.h - 2; y < box.y + box.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (y >= 0 && isOpaque(img, x, y)) {
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
      }
    }
  }
  return x1 >= x0 ? x1 - x0 + 1 : 0;
}

export function placeFrames(
  frames: FrameInput[],
  spec: ImportSpec,
): { frames: PlacedFrame[]; problems: Problem[]; jitter: number } {
  const [fw, fh] = spec.final!;
  const problems: Problem[] = [];
  const at = new Map<FrameInput, [number, number]>();
  let jitterMax = 0;
  const anchored = spec.anchor === 'foot' || spec.anchor === 'flying';
  if (anchored && spec.anchorPx) {
    const [ax, ay] = spec.anchorPx;
    const rows = new Map<number, FrameInput[]>();
    for (const f of frames) rows.set(f.row, [...(rows.get(f.row) ?? []), f]);
    for (const group of rows.values()) {
      // Vertical: one baseline per row.
      const bases = group.map((f) => f.rel[1] + lowestRow(f.img));
      const dy = spec.anchor === 'flying' ? 0 : Math.round(ay - median(bases));
      // Horizontal: per animation inside the row.
      const anims = new Map<string, FrameInput[]>();
      for (const f of group) anims.set(f.def.anim, [...(anims.get(f.def.anim) ?? []), f]);
      for (const [anim, fs] of anims) {
        const torsos = fs.map((f) => f.rel[0] + torsoX(f.img));
        const mid = median(torsos);
        const inPlace = spec.inPlace.includes(anim);
        if (inPlace) {
          const drift = Math.max(...torsos.map((t) => Math.abs(t - mid)));
          jitterMax = Math.max(jitterMax, drift);
          if (drift > 2) {
            problems.push(
              problem(
                'frames',
                'frame_jitter',
                `${anim} (row ${fs[0]!.row + 1}) drifts ${drift.toFixed(1)} px between frames (over 2 px)`,
              ),
            );
          }
        }
        // In place: every torso on the group's median torso column (jitter removed); moving:
        // the generator's relative placement. Then the group's median foot midpoint goes to ax.
        const xs = fs.map((f) => (inPlace ? mid - torsoX(f.img) : f.rel[0]));
        const feet = fs.map((f, i) => xs[i]! + footMidX(f.img));
        const dx = ax - median(feet);
        fs.forEach((f, i) => {
          at.set(f, [Math.round(xs[i]! + dx), f.rel[1] + dy]);
        });
      }
    }
  } else {
    for (const f of frames) {
      if (spec.anchor === 'center')
        at.set(f, [Math.floor((fw - f.img.w) / 2), Math.floor((fh - f.img.h) / 2)]);
      else at.set(f, [f.rel[0], f.rel[1]]);
    }
  }
  const placed: PlacedFrame[] = [];
  let lost = 0;
  for (const f of frames) {
    const pos = at.get(f)!;
    const cell = createImg(fw, fh);
    overlay(cell, f.img, pos[0], pos[1]);
    const box = contentBox(f.img);
    if (
      box &&
      (pos[0] + box.x < 0 ||
        pos[1] + box.y < 0 ||
        pos[0] + box.x + box.w > fw ||
        pos[1] + box.y + box.h > fh)
    ) {
      lost++;
    }
    placed.push({
      ...f,
      cell,
      at: pos,
      anchor: spec.anchorPx ?? null,
      footprint: footprintOf(f.img),
    });
  }
  if (lost > 0) {
    problems.push(
      problem(
        'scale',
        'frame_bounds',
        `${lost} frame(s) do not fit their ${fw}x${fh} cell after alignment`,
      ),
    );
  }
  return { frames: placed, problems, jitter: jitterMax };
}

/** Directions drawn on the sheet and the mirrored ones (3.5). */
export function mirrorPlan(
  spec: ImportSpec,
  sheetDir: string,
): { drawn: string[]; mirrored: { dir: string; from: string }[] } {
  if (spec.dirAxis === 'rows') {
    const drawn = [...new Set(spec.cells.map((r) => r[0]!.dir))];
    return {
      drawn,
      mirrored:
        drawn.includes('right') && !drawn.includes('left') ? [{ dir: 'left', from: 'right' }] : [],
    };
  }
  if (spec.dirAxis === 'cols') {
    const drawn = [...new Set(spec.cells[0]!.map((c) => c.dir))];
    return {
      drawn,
      mirrored:
        drawn.includes('right') && !drawn.includes('left') ? [{ dir: 'left', from: 'right' }] : [],
    };
  }
  if (spec.dirAxis === 'sheet') {
    return {
      drawn: [sheetDir],
      mirrored: sheetDir === 'right' ? [{ dir: 'left', from: 'right' }] : [],
    };
  }
  return { drawn: [], mirrored: [] };
}
