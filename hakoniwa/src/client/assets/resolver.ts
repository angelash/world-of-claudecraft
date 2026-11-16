// The asset resolver (art_pipeline.md 2.1, 6.4 and 6.5): given an asset id (and a variant)
// it returns the approved processed bitmap with its frame metadata, or says why there is
// none so the caller keeps the procedural placeholder. Only records whose manifest status is
// `approved` resolve; review, rework, rejected and retired ids, ids the manifest does not
// list, reference sheets (turnarounds) and records without processed metadata all miss.
// Development builds can force every id to miss (?art=procedural, 6.4).
//
// Pure: the loader (./loader.ts) reads the manifest and the processed files and hands them
// over as an AssetSource; tests build one in memory.

import type { Dir } from '../sprites/anim_spec';
import {
  type AssetFrame,
  type AssetMeta,
  type AssetRecord,
  type AssetStatus,
  processedPathOf,
} from './types';

export type AssetMissReason =
  | 'missing'
  | Exclude<AssetStatus, 'approved'>
  | 'not_art'
  | 'reference'
  | 'no_meta'
  | 'procedural';

export interface AssetHit {
  ok: true;
  id: string;
  record: AssetRecord;
  meta: AssetMeta;
  /** the processed image, as the source names it (a path relative to assets/ or a URL) */
  image: string;
}

export interface AssetMiss {
  ok: false;
  id: string;
  reason: AssetMissReason;
}

export type AssetLookup = AssetHit | AssetMiss;

/** One resolved frame: where its pixels are and how to place them. */
export interface ResolvedFrame {
  assetId: string;
  image: string;
  /** index into the asset's frame list */
  index: number;
  frame: AssetFrame;
  /** draw the rectangle mirrored (left-facing frames reuse the right-facing ones, 3.5) */
  flipX: boolean;
  /** anchor inside the drawn (possibly mirrored) frame */
  ax: number | null;
  ay: number | null;
}

export interface AssetSource {
  /** manifest records (assets/manifest.json); audio and unknown statuses are ignored */
  records: readonly AssetRecord[];
  /** processed metadata of a record, when the import has written it */
  meta(record: AssetRecord): AssetMeta | undefined;
  /** where the processed image is served from; defaults to its path under assets/ */
  image?(record: AssetRecord): string | undefined;
  /** import alias table (content id to art subject, tools/assets/core/aliases.ts) */
  aliases?: Readonly<Record<string, string>>;
  /** force the procedural placeholder everywhere (?art=procedural) */
  procedural?: boolean;
}

const DIR_SUFFIX: Readonly<Record<Dir | 'front', string>> = {
  down: '_d',
  right: '_r',
  left: '_r',
  up: '_u',
  front: '',
};

/**
 * The asset id of a variant: a display direction picks the direction sheet (left reads the
 * right-facing sheet and mirrors it; front is the id itself), a number the two-digit variant
 * (art_tile_..._grass_02), any other word a named suffix (art_npc_x_crowned).
 */
export function variantId(id: string, variant?: string | number): string {
  if (variant === undefined || variant === '') return id;
  if (typeof variant === 'number')
    return `${id}_${String(Math.max(0, Math.floor(variant))).padStart(2, '0')}`;
  if (Object.hasOwn(DIR_SUFFIX, variant)) return `${id}${DIR_SUFFIX[variant as Dir | 'front']}`;
  return `${id}_${variant}`;
}

export class AssetResolver {
  private readonly records = new Map<string, AssetRecord>();
  private readonly hits = new Map<string, AssetHit>();
  private readonly aliases: Readonly<Record<string, string>>;
  private readonly procedural: boolean;

  constructor(private readonly source: AssetSource) {
    this.aliases = source.aliases ?? {};
    this.procedural = !!source.procedural;
    for (const r of source.records) {
      if (r && typeof r.id === 'string') this.records.set(r.id, r);
    }
    if (this.procedural) return;
    for (const r of this.records.values()) {
      if (r.kind !== 'art' || r.status !== 'approved') continue;
      const meta = source.meta(r);
      if (!meta || !Array.isArray(meta.frames) || meta.processing?.reference) continue;
      const image = source.image?.(r) ?? processedPathOf(r.file);
      this.hits.set(r.id, { ok: true, id: r.id, record: r, meta, image });
    }
  }

  /** A resolver with no art: every id keeps the procedural placeholder. */
  static empty(): AssetResolver {
    return new AssetResolver({ records: [], meta: () => undefined });
  }

  /** Number of drawable (approved, processed) assets. */
  get size(): number {
    return this.hits.size;
  }

  /** The art subject of a content id: its alias target, else the id itself. */
  subject(contentId: string): string {
    return Object.hasOwn(this.aliases, contentId) ? (this.aliases[contentId] as string) : contentId;
  }

  /** The approved asset for an id and variant, or the reason there is none. */
  lookup(id: string, variant?: string | number): AssetLookup {
    const full = variantId(id, variant);
    const hit = this.hits.get(full);
    if (hit) return hit;
    if (this.procedural) return { ok: false, id: full, reason: 'procedural' };
    const r = this.records.get(full);
    if (!r) return { ok: false, id: full, reason: 'missing' };
    if (r.kind !== 'art') return { ok: false, id: full, reason: 'not_art' };
    if (r.status !== 'approved') {
      const known = ['review', 'rework', 'rejected', 'retired'] as const;
      const reason = (known as readonly string[]).includes(r.status)
        ? (r.status as AssetMissReason)
        : 'review';
      return { ok: false, id: full, reason };
    }
    const meta = this.source.meta(r);
    return { ok: false, id: full, reason: meta?.processing?.reference ? 'reference' : 'no_meta' };
  }

  has(id: string, variant?: string | number): boolean {
    return this.hits.has(variantId(id, variant));
  }

  /** Whether the manifest lists the id at all, in any status. */
  listed(id: string): boolean {
    return this.records.has(id);
  }

  /** The first approved id among candidates, else the miss of the first candidate. */
  first(ids: readonly string[]): AssetLookup {
    let firstMiss: AssetMiss | null = null;
    for (const id of ids) {
      const l = this.lookup(id);
      if (l.ok) return l;
      firstMiss ??= l;
    }
    return firstMiss ?? { ok: false, id: '', reason: 'missing' };
  }

  /**
   * A frame of an approved asset by animation, direction and frame number. A left-facing
   * frame the metadata does not list is the right-facing one mirrored (art_pipeline.md 3.5);
   * frame numbers past the end hold the last frame. Null when the asset or the animation is
   * missing.
   */
  frame(id: string, anim: string, dir: string, i: number): ResolvedFrame | null {
    const hit = this.hits.get(id);
    if (!hit) return null;
    const meta = hit.meta;
    let a = meta.anims[`${anim}/${dir}`];
    let mirror = false;
    if (!a && dir === 'left') {
      a = meta.anims[`${anim}/right`];
      mirror = !!a;
    }
    if (!a || a.frames.length === 0) return null;
    const n = Math.max(0, Math.min(a.frames.length - 1, Math.floor(i)));
    const index = a.frames[n];
    const frame = index === undefined ? undefined : meta.frames[index];
    if (!frame || index === undefined) return null;
    const flipX = mirror ? !frame.flipX : !!frame.flipX;
    // A mirrored left frame in the metadata already carries the mirrored anchor.
    const ax = mirror && frame.ax !== null ? frame.w - 1 - frame.ax : frame.ax;
    return { assetId: id, image: hit.image, index, frame, flipX, ax, ay: frame.ay };
  }

  /** Frame count of an animation in an approved asset (0 when absent). */
  frameCount(id: string, anim: string, dir: string): number {
    const meta = this.hits.get(id)?.meta;
    if (!meta) return 0;
    const a =
      meta.anims[`${anim}/${dir}`] ?? (dir === 'left' ? meta.anims[`${anim}/right`] : undefined);
    return a ? a.frames.length : 0;
  }

  /** Every approved asset (for the loader's decoding pass). */
  approved(): AssetHit[] {
    return [...this.hits.values()];
  }
}
