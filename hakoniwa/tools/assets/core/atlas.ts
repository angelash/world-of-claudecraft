// Step 11 (art_pipeline.md 13 and 3.7): pack approved frames into atlas pages. MaxRects with
// the best-short-side-fit rule and a 1-pixel gap; pages are 2048x2048 (icons 1024x1024) and a
// group spills into further pages when one is full. An item larger than a page gets a page of
// its own size. Deterministic: items are ordered by size then id before packing.

import { blit, createImg, crop, type Img } from './image';
import type { ArtMeta, FrameMeta } from './meta';

export interface PackItem {
  key: string;
  w: number;
  h: number;
}

export interface Placement {
  key: string;
  page: number;
  x: number;
  y: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

class MaxRects {
  free: Rect[];
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.free = [{ x: 0, y: 0, w, h }];
  }

  find(w: number, h: number): Rect | null {
    let best: Rect | null = null;
    let bestShort = Number.POSITIVE_INFINITY;
    let bestLong = Number.POSITIVE_INFINITY;
    for (const f of this.free) {
      if (w > f.w || h > f.h) continue;
      const short = Math.min(f.w - w, f.h - h);
      const long = Math.max(f.w - w, f.h - h);
      if (short < bestShort || (short === bestShort && long < bestLong)) {
        best = { x: f.x, y: f.y, w, h };
        bestShort = short;
        bestLong = long;
      }
    }
    return best;
  }

  place(r: Rect): void {
    const next: Rect[] = [];
    for (const f of this.free) {
      if (r.x >= f.x + f.w || r.x + r.w <= f.x || r.y >= f.y + f.h || r.y + r.h <= f.y) {
        next.push(f);
        continue;
      }
      if (r.x > f.x) next.push({ x: f.x, y: f.y, w: r.x - f.x, h: f.h });
      if (r.x + r.w < f.x + f.w)
        next.push({ x: r.x + r.w, y: f.y, w: f.x + f.w - r.x - r.w, h: f.h });
      if (r.y > f.y) next.push({ x: f.x, y: f.y, w: f.w, h: r.y - f.y });
      if (r.y + r.h < f.y + f.h)
        next.push({ x: f.x, y: r.y + r.h, w: f.w, h: f.y + f.h - r.y - r.h });
    }
    // Drop free rectangles contained in others.
    this.free = next.filter(
      (a, i) =>
        !next.some(
          (b, j) =>
            j !== i &&
            a.x >= b.x &&
            a.y >= b.y &&
            a.x + a.w <= b.x + b.w &&
            a.y + a.h <= b.y + b.h &&
            (j < i || a.w !== b.w || a.h !== b.h || a.x !== b.x || a.y !== b.y),
        ),
    );
  }
}

export interface PackResult {
  placements: Placement[];
  pages: { w: number; h: number }[];
}

/** Pack items into pages of `pageW` x `pageH` with `gap` pixels between items. */
export function packMaxRects(items: PackItem[], pageW: number, pageH: number, gap = 1): PackResult {
  const order = [...items].sort(
    (a, b) =>
      Math.max(b.w, b.h) - Math.max(a.w, a.h) ||
      b.w * b.h - a.w * a.h ||
      (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const bins: MaxRects[] = [];
  const pages: { w: number; h: number }[] = [];
  const placements: Placement[] = [];
  for (const it of order) {
    const w = it.w + gap;
    const h = it.h + gap;
    if (w > pageW || h > pageH) {
      // Oversized: a page of its own.
      pages.push({ w: it.w, h: it.h });
      bins.push(new MaxRects(0, 0));
      placements.push({ key: it.key, page: pages.length - 1, x: 0, y: 0 });
      continue;
    }
    let done = false;
    for (let p = 0; p < bins.length && !done; p++) {
      const bin = bins[p]!;
      if (bin.w === 0) continue;
      const r = bin.find(w, h);
      if (r) {
        bin.place(r);
        placements.push({ key: it.key, page: p, x: r.x, y: r.y });
        done = true;
      }
    }
    if (!done) {
      const bin = new MaxRects(pageW, pageH);
      bins.push(bin);
      pages.push({ w: pageW, h: pageH });
      const r = bin.find(w, h)!;
      bin.place(r);
      placements.push({ key: it.key, page: bins.length - 1, x: r.x, y: r.y });
    }
  }
  return { placements, pages };
}

/** Atlas group of a processed asset: actors, icons, effects, ui, portraits, or world per style pack. */
export function atlasGroup(
  meta: Pick<ArtMeta, 'template' | 'style'>,
): { group: string; page: number } | null {
  const t = meta.template;
  if (t.startsWith('key_') || t.startsWith('map_')) return null;
  if (t.startsWith('ico_')) return { group: 'icons', page: 1024 };
  if (t.startsWith('vfx_')) return { group: 'vfx', page: 2048 };
  if (t.startsWith('ui_')) return { group: 'ui', page: 2048 };
  if (t.startsWith('por_') || t.startsWith('bust_') || t === 'boss_card')
    return { group: 'portraits', page: 2048 };
  if (
    t.startsWith('chr_') ||
    t.startsWith('doll_') ||
    t.startsWith('mon_') ||
    t.startsWith('boss_') ||
    t.startsWith('pet_') ||
    t.startsWith('unit_')
  ) {
    return { group: 'actors', page: 2048 };
  }
  return { group: `world_${meta.style ?? 'common'}`, page: 2048 };
}

export interface AtlasFrame extends FrameMeta {
  page: string;
  /** Rectangle on the atlas page (the frame's own rectangle is kept in x, y, w, h of FrameMeta). */
  px: number;
  py: number;
}

export interface AtlasOutput {
  pages: { file: string; group: string; w: number; h: number; img: Img }[];
  frames: Record<string, AtlasFrame[]>;
}

/** Build the atlas pages for processed sheets (each drawn frame is packed on its own). */
export function buildAtlas(sheets: { meta: ArtMeta; img: Img }[]): AtlasOutput {
  const groups = new Map<
    string,
    { page: number; items: { key: string; meta: ArtMeta; img: Img; frame: number }[] }
  >();
  for (const s of [...sheets].sort((a, b) => (a.meta.id < b.meta.id ? -1 : 1))) {
    const g = atlasGroup(s.meta);
    if (!g) continue;
    const entry = groups.get(g.group) ?? { page: g.page, items: [] };
    s.meta.frames.forEach((f, i) => {
      if (!f.flipX)
        entry.items.push({ key: `${s.meta.id}#${i}`, meta: s.meta, img: s.img, frame: i });
    });
    groups.set(g.group, entry);
  }
  const out: AtlasOutput = { pages: [], frames: {} };
  for (const name of [...groups.keys()].sort()) {
    const g = groups.get(name)!;
    const items = g.items.map((it) => {
      const f = it.meta.frames[it.frame]!;
      return { key: it.key, w: f.w, h: f.h };
    });
    const packed = packMaxRects(items, g.page, g.page, 1);
    const base = out.pages.length;
    for (const [i, p] of packed.pages.entries()) {
      out.pages.push({
        file: `${name}_${i}.png`,
        group: name,
        w: p.w,
        h: p.h,
        img: createImg(p.w, p.h),
      });
    }
    const byKey = new Map(g.items.map((it) => [it.key, it]));
    for (const pl of packed.placements) {
      const it = byKey.get(pl.key)!;
      const f = it.meta.frames[it.frame]!;
      const page = out.pages[base + pl.page]!;
      blit(page.img, crop(it.img, f.x, f.y, f.w, f.h), pl.x, pl.y);
      const list = out.frames[it.meta.id] ?? [];
      list[it.frame] = { ...f, page: page.file, px: pl.x, py: pl.y };
      out.frames[it.meta.id] = list;
    }
    // Mirrored frames point at the placement of their source rectangle.
    for (const it of g.items) {
      const list = out.frames[it.meta.id]!;
      it.meta.frames.forEach((f, i) => {
        if (!f.flipX || list[i]) return;
        const src = list.find((a) => a && !a.flipX && a.x === f.x && a.y === f.y);
        if (src) list[i] = { ...f, page: src.page, px: src.px, py: src.py };
      });
    }
  }
  return out;
}
