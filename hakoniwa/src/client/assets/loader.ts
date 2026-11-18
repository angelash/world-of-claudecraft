// Startup loader for approved art (art_pipeline.md 2.1, 6.4 and 13): reads assets/manifest.json,
// fetches the processed metadata of every approved art record, decodes its processed image into
// pixels and installs the resolver the renderers draw from (./runtime.ts). With an empty
// manifest (the state before the first art batch) it installs nothing, so the game draws the
// procedural placeholder exactly as before. ?art=procedural forces the placeholder (6.4).
// Development builds also load `review` records (loadedStatuses in ./types.ts), so generated
// art shows before approval; ?assets=approved shows only approved art, as release would.
//
// This is the DOM side (Image, canvas, fetch); the rules live in the pure resolver. It serves
// the development build only: the dev server hands out assets/ as files, so whatever
// `npm run assets:import` writes shows up on the next reload, and nothing of the manifest
// (tools, seeds, reviewers, notes) or of unapproved art is bundled. Release builds keep the
// placeholder until the atlas pages and their slim manifest replace this per-file loading
// (development plan PK-M1-04). Processed results made by another import version, or from
// another source file than the manifest records, are stale and skipped, as `assets:atlas` does.

import { ART_ALIASES } from '../../../tools/assets/core/aliases';
import { IMPORT_VERSION } from '../../../tools/assets/core/meta';
import { makeCanvas } from '../render/canvas_util';
import type { PixelMatrix } from '../sprites/pixels';
import { AssetResolver } from './resolver';
import { installAssets, type SheetPixels } from './runtime';
import {
  type AssetMeta,
  type AssetRecord,
  type AssetStatus,
  loadedStatuses,
  metaPathOf,
  processedPathOf,
} from './types';

/** Where the dev server serves hakoniwa/assets/. */
export const DEV_ASSET_BASE = '/assets/';

export interface LoadOptions {
  /** force the placeholder everywhere */
  procedural?: boolean;
  /** URL prefix of assets/ */
  base?: string;
  /** JSON reader (defaults to fetch) */
  fetchJson?: (url: string) => Promise<unknown>;
  /** image decoder (defaults to an Image drawn into a canvas) */
  decode?: (url: string) => Promise<PixelMatrix | undefined>;
  /** statuses to load (default approved; installApprovedArt passes loadedStatuses) */
  statuses?: readonly AssetStatus[];
}

/** Whether the page asks for the placeholder everywhere (development builds only). */
export function forceProcedural(search: string, dev: boolean): boolean {
  return dev && new URLSearchParams(search).get('art') === 'procedural';
}

async function fetchJsonDefault(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

async function decodeDefault(url: string): Promise<PixelMatrix | undefined> {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = makeCanvas(img.naturalWidth, img.naturalHeight);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, rgba: data.data };
}

type RawRecord = AssetRecord & { sha256?: string };
type RawMeta = AssetMeta & { importVersion?: string; source?: { sha256?: string } };

/** Whether a processed result belongs to this import version and to the recorded source file. */
export function freshMeta(rec: RawRecord, meta: RawMeta | undefined): meta is RawMeta {
  if (!meta || !Array.isArray(meta.frames)) return false;
  if (meta.importVersion !== IMPORT_VERSION) return false;
  return !rec.sha256 || meta.source?.sha256 === rec.sha256;
}

/**
 * Build the resolver and decode every approved sheet. A missing or unreadable manifest is an
 * empty one; a record whose processed files are missing, stale, or fail to decode stays on
 * the placeholder.
 */
export async function loadAssets(
  opts: LoadOptions = {},
): Promise<{ resolver: AssetResolver; pixels: SheetPixels }> {
  const base = opts.base ?? DEV_ASSET_BASE;
  const fetchJson = opts.fetchJson ?? fetchJsonDefault;
  const decode = opts.decode ?? decodeDefault;
  const statuses = opts.statuses ?? ['approved'];
  let raw: unknown = [];
  try {
    raw = await fetchJson(`${base}manifest.json`);
  } catch {
    raw = [];
  }
  const records = (Array.isArray(raw) ? raw : []).filter(
    (r): r is RawRecord => !!r && typeof r === 'object' && typeof (r as RawRecord).id === 'string',
  );
  const metas = new Map<string, AssetMeta>();
  if (!opts.procedural) {
    await Promise.all(
      records
        .filter(
          (r) => r.kind === 'art' && statuses.includes(r.status) && typeof r.file === 'string',
        )
        .map(async (r) => {
          try {
            const meta = (await fetchJson(`${base}${metaPathOf(r.file)}`)) as RawMeta;
            if (freshMeta(r, meta)) metas.set(r.id, meta);
            else console.warn(`[assets] ${r.id}: processed result is missing or stale`);
          } catch {
            console.warn(`[assets] ${r.id}: no processed metadata`);
          }
        }),
    );
  }
  const resolver = new AssetResolver({
    records,
    meta: (r) => metas.get(r.id),
    image: (r) => `${base}${processedPathOf(r.file)}`,
    aliases: ART_ALIASES,
    procedural: opts.procedural,
    statuses,
  });
  const sheets = new Map<string, PixelMatrix>();
  await Promise.all(
    resolver.approved().map(async (hit) => {
      try {
        const m = await decode(hit.image);
        if (m) sheets.set(hit.id, m);
      } catch {
        console.warn(`[assets] ${hit.id}: image failed to decode`);
      }
    }),
  );
  return { resolver, pixels: { get: (id) => sheets.get(id) } };
}

/**
 * Load and install the approved art. The app bootstrap awaits this once before the first
 * frame (the one-line wiring belongs in src/client/app/main.ts). Development builds only;
 * never throws: on any failure the placeholder stays.
 */
export async function installApprovedArt(): Promise<void> {
  if (!import.meta.env.DEV) return;
  try {
    const procedural = forceProcedural(window.location.search, true);
    const statuses = loadedStatuses(window.location.search, import.meta.env.DEV);
    const { resolver, pixels } = await loadAssets({ procedural, statuses });
    installAssets(resolver, pixels);
  } catch (err) {
    console.warn('[assets] approved art not installed; drawing placeholders', err);
  }
}
