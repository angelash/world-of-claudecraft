// Step 3 (art_pipeline.md 13): split the canvas into the template's grid. Generators keep the
// cells evenly spaced but may shift or resize the whole grid, so every inner boundary is moved
// to the emptiest column (or row) within a window around its nominal place; a boundary that no
// empty line can be found for means a frame crosses into its neighbour. Each cell then gets its
// content bounding box, and occupancy is compared with the template's frame layout.

import { type Box, contentBox, type Img, isOpaque, opaqueCount } from './image';
import { type Problem, problem } from './reasons';
import type { CellDef } from './template_specs';

export interface CellBox extends Box {
  col: number;
  row: number;
  def: CellDef;
  content: Box | null;
  pixels: number;
}

function counts(img: Img, axis: 'x' | 'y'): Int32Array {
  const out = new Int32Array(axis === 'x' ? img.w : img.h);
  for (let y = 0; y < img.h; y++) {
    for (let x = 0; x < img.w; x++) {
      if (isOpaque(img, x, y)) out[axis === 'x' ? x : y]! += 1;
    }
  }
  return out;
}

/** Inner boundaries along one axis: [0, b1, ..., size]. */
function boundaries(
  prof: Int32Array,
  size: number,
  n: number,
  search: boolean,
): { cuts: number[]; crossing: number[] } {
  const cuts = [0];
  const crossing: number[] = [];
  const cell = size / n;
  for (let k = 1; k < n; k++) {
    const nominal = Math.round(k * cell);
    if (!search) {
      cuts.push(nominal);
      continue;
    }
    const win = Math.max(1, Math.round(cell * 0.12));
    let best = nominal;
    let bestCount = Number.POSITIVE_INFINITY;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let p = Math.max(1, nominal - win); p <= Math.min(size - 1, nominal + win); p++) {
      const c = prof[p]!;
      const dist = Math.abs(p - nominal);
      if (c < bestCount || (c === bestCount && dist < bestDist)) {
        bestCount = c;
        best = p;
        bestDist = dist;
      }
    }
    if (bestCount === 0) {
      // Centre the cut in the empty band around the chosen line.
      let lo = best;
      let hi = best;
      while (lo - 1 > nominal - win && prof[lo - 1] === 0) lo--;
      while (hi + 1 < nominal + win && prof[hi + 1] === 0) hi++;
      best = Math.round((lo + hi) / 2);
    } else {
      crossing.push(k);
    }
    cuts.push(best);
  }
  cuts.push(size);
  return { cuts, crossing };
}

export interface CellResult {
  cells: CellBox[][];
  problems: Problem[];
}

export function locateCells(img: Img, layout: CellDef[][], opts: { search: boolean }): CellResult {
  const rows = layout.length;
  const cols = layout[0]?.length ?? 1;
  const problems: Problem[] = [];
  const bx = boundaries(counts(img, 'x'), img.w, cols, opts.search);
  const by = boundaries(counts(img, 'y'), img.h, rows, opts.search);
  for (const k of bx.crossing) {
    problems.push(
      problem(
        'frames',
        'grid_cells',
        `content crosses the boundary between columns ${k} and ${k + 1}`,
      ),
    );
  }
  for (const k of by.crossing) {
    problems.push(
      problem(
        'frames',
        'grid_cells',
        `content crosses the boundary between rows ${k} and ${k + 1}`,
      ),
    );
  }
  const cells: CellBox[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: CellBox[] = [];
    for (let c = 0; c < cols; c++) {
      const box = {
        x: bx.cuts[c]!,
        y: by.cuts[r]!,
        w: bx.cuts[c + 1]! - bx.cuts[c]!,
        h: by.cuts[r + 1]! - by.cuts[r]!,
      };
      const pixels = opaqueCount(img, box);
      const def = layout[r]![c]!;
      row.push({
        ...box,
        col: c,
        row: r,
        def,
        content: pixels > 0 ? contentBox(img, box) : null,
        pixels,
      });
    }
    cells.push(row);
  }
  // Occupancy against the frame layout.
  const empty: string[] = [];
  const extra: string[] = [];
  for (const row of cells) {
    for (const cell of row) {
      const occupied = cell.pixels >= Math.max(4, 0.002 * cell.w * cell.h);
      if (cell.def.need === 'req' && !occupied) empty.push(`(${cell.col + 1},${cell.row + 1})`);
      if (cell.def.need === 'blank' && occupied) extra.push(`(${cell.col + 1},${cell.row + 1})`);
      if (!occupied) cell.content = null;
    }
  }
  if (empty.length > 0) {
    problems.push(
      problem('frames', 'grid_cells', `cells ${empty.join(' ')} should hold a frame but are empty`),
    );
  }
  if (extra.length > 0) {
    problems.push(
      problem('frames', 'grid_cells', `cells ${extra.join(' ')} should be blank but hold content`),
    );
  }
  return { cells, problems };
}
