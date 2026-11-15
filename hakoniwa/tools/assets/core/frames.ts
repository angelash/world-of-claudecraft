// Frame and animation records of a processed sheet (art_pipeline.md 3.4, 3.5 and 13 step 10):
// one record per drawn cell in row-major order, then the mirrored left-facing records that
// reuse the right-facing rectangles with flipX, and the animation table keyed "<anim>/<dir>".

import type { PlacedFrame } from './anchor';
import type { AnimMeta, FrameMeta } from './meta';
import type { ImportSpec } from './template_specs';

export function anchoredFrameMeta(
  placed: PlacedFrame[],
  cell: [number, number],
  sheetDir: string,
  mirrored: { dir: string; from: string }[],
): FrameMeta[] {
  const [fw, fh] = cell;
  const sorted = [...placed].sort((a, b) => a.row - b.row || a.col - b.col);
  const out: FrameMeta[] = sorted.map((f) => ({
    anim: f.def.anim,
    dir: f.def.dir === 'sheet' ? sheetDir : f.def.dir,
    i: f.def.i,
    x: f.col * fw,
    y: f.row * fh,
    w: fw,
    h: fh,
    ax: f.anchor ? f.anchor[0] : null,
    ay: f.anchor ? f.anchor[1] : null,
    ms: f.def.ms,
    footprint: f.footprint,
  }));
  for (const m of mirrored) {
    for (const f of out.filter((r) => r.dir === m.from && !r.flipX)) {
      out.push({ ...f, dir: m.dir, ax: f.ax === null ? null : fw - 1 - f.ax, flipX: true });
    }
  }
  return out;
}

export function buildAnims(frames: FrameMeta[], spec: ImportSpec): Record<string, AnimMeta> {
  const out: Record<string, AnimMeta> = {};
  frames.forEach((f, idx) => {
    const key = `${f.anim}/${f.dir}`;
    const info = spec.anims.find((a) => a.name === f.anim);
    const a: AnimMeta = out[key] ?? {
      frames: [],
      ms: [],
      loop: info?.loop ?? false,
      hold: info?.hold ?? false,
      ...(info?.stepTiles ? { stepTiles: info.stepTiles } : {}),
    };
    out[key] = a;
    a.frames[f.i] = idx;
    a.ms[f.i] = f.ms;
  });
  return out;
}
