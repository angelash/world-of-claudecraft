// Step 13 (art_pipeline.md 13): the pre-review contact sheet. One row per asset: the source
// image reduced to a thumbnail, the processed result at 1x and at 3x (nearest neighbour), on a
// neutral checker so transparency reads. A Markdown index lists the rows with their problems and
// the editor's HD-2D preview link. Rows can be ordered by how much a reprocessed result changed.

import { blit, createImg, getPx, type Img, overlay, pack, resizeNearest } from './image';
import { reduceMode } from './pixel_grid';
import type { Problem } from './reasons';

export interface ContactRow {
  id: string;
  source: Img;
  processed: Img | null;
  problems: Problem[];
  /** Share of processed pixels that differ from the previous result (reprocessing). */
  changed?: number;
}

const THUMB = 192;
const GAP = 8;

function checker(w: number, h: number): Img {
  const img = createImg(w, h);
  const a = pack(58, 58, 64);
  const b = pack(72, 72, 80);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) setChecker(img, x, y, ((x >> 3) + (y >> 3)) & 1 ? a : b);
  return img;
}

function setChecker(img: Img, x: number, y: number, p: number): void {
  const i = (y * img.w + x) * 4;
  img.data[i] = (p >>> 24) & 255;
  img.data[i + 1] = (p >>> 16) & 255;
  img.data[i + 2] = (p >>> 8) & 255;
  img.data[i + 3] = 255;
}

export function thumbnail(src: Img, box = THUMB): Img {
  const r = Math.max(src.w / box, src.h / box, 1);
  const w = Math.max(1, Math.round(src.w / r));
  const h = Math.max(1, Math.round(src.h / r));
  return reduceMode(src, 0, 0, src.w / w, src.h / h, w, h);
}

/** Fraction of pixels that differ between two results (1 when the sizes differ). */
export function changedShare(a: Img, b: Img): number {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let n = 0;
  for (let y = 0; y < a.h; y++)
    for (let x = 0; x < a.w; x++) if (getPx(a, x, y) !== getPx(b, x, y)) n++;
  return n / (a.w * a.h);
}

/** Width of a contact page: wide enough for the 3x view of every sheet up to 960 px. */
export const CONTACT_WIDTH = 4096;
/** Height cap of one contact page (rows are never split across pages). */
export const CONTACT_PAGE_HEIGHT = 8192;

function layoutOf(r: ContactRow, maxWidth: number) {
  const thumb = thumbnail(r.source);
  const p = r.processed;
  const triple = p && p.w * 3 + thumb.w + p.w + GAP * 4 <= maxWidth ? 3 : 1;
  const big = p && triple === 3 ? resizeNearest(p, p.w * 3, p.h * 3) : null;
  const w = GAP + thumb.w + GAP + (p ? p.w + GAP : 0) + (big ? big.w + GAP : 0);
  const h = GAP + Math.max(thumb.h, p?.h ?? 0, big?.h ?? 0);
  return { thumb, p, big, w, h };
}

/** Rows split into pages no taller than the cap; each page lists its rows. */
export function contactPages(
  rows: ContactRow[],
  maxWidth = CONTACT_WIDTH,
  maxHeight = CONTACT_PAGE_HEIGHT,
): { img: Img; rows: ContactRow[] }[] {
  const pages: ContactRow[][] = [];
  let cur: ContactRow[] = [];
  let h = GAP;
  for (const r of rows) {
    const rh = layoutOf(r, maxWidth).h;
    if (cur.length > 0 && h + rh > maxHeight) {
      pages.push(cur);
      cur = [];
      h = GAP;
    }
    cur.push(r);
    h += rh;
  }
  if (cur.length > 0) pages.push(cur);
  return pages.map((p) => ({ img: contactSheet(p, maxWidth), rows: p }));
}

export function contactSheet(rows: ContactRow[], maxWidth = CONTACT_WIDTH): Img {
  const layouts = rows.map((r) => layoutOf(r, maxWidth));
  const W = Math.max(64, ...layouts.map((l) => l.w));
  const H = layouts.reduce((s, l) => s + l.h, 0) + GAP;
  const sheet = checker(W, H);
  let y = GAP;
  for (const l of layouts) {
    let x = GAP;
    blit(sheet, l.thumb, x, y);
    x += l.thumb.w + GAP;
    if (l.p) {
      overlay(sheet, l.p, x, y);
      x += l.p.w + GAP;
    }
    if (l.big) overlay(sheet, l.big, x, y);
    y += l.h;
  }
  return sheet;
}

/** Markdown index for the contact sheet: rows in order, problems, and the editor preview link. */
export function contactIndex(rows: ContactRow[], title: string): string {
  const lines = [
    `# ${title}`,
    '',
    '| 序 | 编号 | 变化 | 问题 | 预览 |',
    '| --- | --- | --- | --- | --- |',
  ];
  rows.forEach((r, i) => {
    const probs =
      r.problems
        .map((p) => `${p.warning ? '提示' : '返工'} \`${p.code}\` ${p.message}`)
        .join('；') || '无';
    const changed = r.changed === undefined ? '' : `${(r.changed * 100).toFixed(1)}%`;
    lines.push(
      `| ${i + 1} | \`${r.id}\` | ${changed} | ${probs.replace(/\|/g, '/')} | [HD-2D](/editor.html#asset=${r.id}) |`,
    );
  });
  return `${lines.join('\n')}\n`;
}
