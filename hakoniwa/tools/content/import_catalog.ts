// The catalog importer (release_engineering.md 7.1 and 7.3): turns rows of a design catalog
// table into staged data records and walks a content batch through the seven steps.
// `node tools/content/import_catalog.ts <command>`. Node runs this file directly; the
// commands (import_cli.ts) go through Vite's module runner, because validation builds the
// game content with import.meta.glob.
//
//   mappings                                list the catalog mappings (tools/content/mappings/)
//   extract  --mapping <id> --batch <name> [--ids a,b] [--depends x,y] [--scope "..."]
//            steps 1 and 2: stage the mapped rows in data/_staging/<name>.json, list the
//            unmapped columns and the fields the author fills
//   fill     --batch <name> [--note "..."]  step 3: record the author's fill-in
//   validate --batch <name> [--milestone M0] [--warnings]
//            step 4: V1 to V10 over data/ with the batch applied
//   promote  --batch <name>                 step 5: merge into data/, keep the batch record in
//            data/_batches/<name>.json, remove the staged file
//   verify   --batch <name> --note "..."    step 6: record a verification (tests, playthrough)
//   report   --batch <name> [--out <file>]  step 7: print the batch report (markdown)
//   status   [--batch <name>]               list the batches, or show one
//
// Batch names follow dev_process.md 3.1: content_<act or base>_<category>_<two digits>.

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { module } = await runnerImport<{ main(argv: string[]): Promise<number> }>(
  resolve(root, 'tools', 'content', 'import_cli.ts'),
  { root, configFile: false, logLevel: 'error' },
);
process.exitCode = await module.main(process.argv.slice(2));
