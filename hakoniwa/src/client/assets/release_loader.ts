// Browser reader for the slim release media pack. A missing pack keeps placeholders.

import { IMPORT_VERSION } from '../../../tools/assets/core/meta';
import type { PixelMatrix } from '../sprites/pixels';
import { AssetResolver } from './resolver';
import type { SheetPixels } from './runtime';
import type { AssetMeta, AssetRecord } from './types';

export const RELEASE_ART_BASE = '/art/';

export interface ReleasedArt {
  id: string;
  template: string;
  image: string;
  meta: AssetMeta;
}

/** Only local pack files are allowed; a manifest cannot point at an external origin. */
export function releasePath(file: string): boolean {
  return (
    !!file &&
    !/^[\\/]|[\\:?#]/.test(file) &&
    !file.includes(String.fromCharCode(0)) &&
    !file.split('/').some((p) => p === '..' || p === '.')
  );
}

export async function loadReleaseArt(opts: {
  fetchJson: (url: string) => Promise<unknown>;
  decode: (url: string) => Promise<PixelMatrix | undefined>;
  aliases?: Readonly<Record<string, string>>;
  base?: string;
}): Promise<{ resolver: AssetResolver; pixels: SheetPixels }> {
  const base = opts.base ?? RELEASE_ART_BASE;
  const raw = (await opts.fetchJson(`${base}manifest.json`)) as {
    version?: number;
    importVersion?: string;
    assets?: ReleasedArt[];
  };
  if (raw?.version !== 1 || raw.importVersion !== IMPORT_VERSION || !Array.isArray(raw.assets)) {
    throw new Error('release art manifest is stale or invalid');
  }
  const assets = raw.assets.filter(
    (a) =>
      a &&
      typeof a.id === 'string' &&
      releasePath(a.image) &&
      a.meta?.id === a.id &&
      Array.isArray(a.meta.frames),
  );
  const byId = new Map(assets.map((a) => [a.id, a]));
  const records: AssetRecord[] = assets.map((a) => ({
    id: a.id,
    kind: 'art',
    status: 'approved',
    template: a.template,
    file: a.image,
  }));
  const decoded = new Map<string, PixelMatrix>();
  // Bound concurrent browser decoding rather than starting a request for every asset.
  let cursor = 0;
  const worker = async () => {
    while (cursor < assets.length) {
      const a = assets[cursor++];
      if (!a) continue;
      try {
        const pixels = await opts.decode(`${base}${a.image}`);
        if (pixels) decoded.set(a.id, pixels);
      } catch {
        // One corrupt page must not prevent the remaining presentation from loading.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, assets.length) }, worker));
  return {
    resolver: new AssetResolver({
      records,
      aliases: opts.aliases,
      meta: (r) => (decoded.has(r.id) ? byId.get(r.id)?.meta : undefined),
      image: (r) => `${base}${byId.get(r.id)?.image ?? ''}`,
    }),
    pixels: { get: (id) => decoded.get(id) },
  };
}
