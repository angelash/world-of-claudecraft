// Generate data/registry/vars.json from the world-state registry document
// (docs/40_design/world_state_registry.md section 9.2: the document fixes the names, this
// script writes the data). Rerunning on the same document gives the same file.
//
//   node tools/registry/build.ts           write data/registry/vars.json
//   node tools/registry/build.ts --check   fail when the file is stale, then run the
//                                          registry guard (tests/registry.test.ts: data
//                                          and code use canonical names only, the
//                                          section 9.3 rules hold)
//   node tools/registry/build.ts --report  also list the document rows the parser skipped
//
// The parser is tools/registry/parse.ts (pure, unit tested in tests/registry.test.ts); the
// choices the document leaves to the build are in tools/registry/options.ts.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Parse = typeof import('./parse');
type Options = typeof import('./options');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Node strips the types of this file; the parser loads by file URL (explicit .ts).
async function loadParser(): Promise<Parse> {
  return (await import(new URL('./parse.ts', import.meta.url).href)) as Parse;
}

async function loadOptions(): Promise<Options> {
  return (await import(new URL('./options.ts', import.meta.url).href)) as Options;
}

async function main(): Promise<number> {
  const args = new Set(process.argv.slice(2));
  const parser = await loadParser();
  const { OUT_PATH, PARSE_OPTIONS } = await loadOptions();
  const md = readFileSync(join(ROOT, parser.DOC_PATH), 'utf8');
  const { data, report } = parser.parseRegistry(md, PARSE_OPTIONS);
  const text = parser.formatRegistry(data);
  const out = join(ROOT, OUT_PATH);
  const summary = `${data.vars.length} names, ${data.families.length} families, ${
    Object.keys(data.questIds).length
  } quest ids, ${report.skipped.length} skipped rows`;
  if (args.has('--report')) for (const line of report.skipped) console.log(`skipped: ${line}`);
  if (args.has('--check')) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error(`registry: ${OUT_PATH} is stale; run node tools/registry/build.ts`);
      return 1;
    }
    console.log(`registry: ${OUT_PATH} is current (${summary})`);
    const vitest = join(ROOT, '..', 'node_modules', 'vitest', 'vitest.mjs');
    const run = spawnSync(
      process.execPath,
      [vitest, 'run', '--config', 'vitest.config.ts', 'tests/registry.test.ts'],
      { cwd: ROOT, stdio: 'inherit' },
    );
    return run.status ?? 1;
  }
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, text);
  console.log(`registry: wrote ${OUT_PATH} (${summary})`);
  return 0;
}

main().then(
  (code) => process.exit(code),
  (err: unknown) => {
    console.error(err);
    process.exit(1);
  },
);
