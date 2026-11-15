// npm run assets:atlas: step 11 of the import pipeline (art_pipeline.md 13). Packs the processed
// frames of every approved art asset into atlas pages by group (actors, icons, effects, ui,
// portraits, world per style pack) and writes the pages plus atlas.json (page list and, per
// asset, every frame's page rectangle, anchor, duration and mirroring). Atlases are build
// output, never committed: the default folder is .local/atlas/.
//
//   npm run assets:atlas [-- --out <dir>] [--include-review] [--root <assets dir>]

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildAtlas } from './core/atlas';
import type { ManifestRecord } from './core/manifest';
import { type ArtMeta, IMPORT_VERSION, metaPathOf, processedPathOf } from './core/meta';
import { decodePng, encodePng } from './core/png';
import {
  consoleLogger,
  flag,
  isMain,
  jsonText,
  type Logger,
  parseArgs,
  readJson,
  writeBytes,
  writeText,
} from './lib';

export async function run(argv: string[], log: Logger = consoleLogger): Promise<number> {
  const args = parseArgs(argv);
  const records = readJson<ManifestRecord[]>(join(args.root, 'manifest.json'), []);
  const statuses = new Set<string>(
    args.flags.has('include-review') ? ['approved', 'review'] : ['approved'],
  );
  const sheets: { meta: ArtMeta; img: ReturnType<typeof decodePng> }[] = [];
  let missing = 0;
  for (const rec of records) {
    if (rec.kind !== 'art' || !statuses.has(rec.status)) continue;
    const metaPath = join(args.root, metaPathOf(rec.file));
    const pngPath = join(args.root, processedPathOf(rec.file));
    const meta = readJson<ArtMeta | null>(metaPath, null);
    if (meta?.processing?.reference) continue;
    if (!meta || !existsSync(pngPath)) {
      log.error(`${rec.id}: no processed result; run npm run assets:import`);
      missing++;
      continue;
    }
    if (meta.importVersion !== IMPORT_VERSION || meta.source.sha256 !== rec.sha256) {
      log.error(`${rec.id}: processed result is stale; run npm run assets:import`);
      missing++;
      continue;
    }
    sheets.push({ meta, img: decodePng(new Uint8Array(readFileSync(pngPath))) });
  }
  const atlas = buildAtlas(sheets);
  const out = flag(args, 'out') ?? join(args.root, '..', '.local', 'atlas');
  for (const p of atlas.pages) writeBytes(join(out, p.file), encodePng(p.img));
  writeText(
    join(out, 'atlas.json'),
    jsonText({
      version: 1,
      importVersion: IMPORT_VERSION,
      pages: atlas.pages.map((p) => ({ file: p.file, group: p.group, w: p.w, h: p.h })),
      frames: atlas.frames,
    }),
  );
  log.log(`${sheets.length} asset(s) packed into ${atlas.pages.length} page(s) in ${out}`);
  return missing > 0 ? 1 : 0;
}

if (isMain(import.meta.url)) {
  run(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
  });
}
