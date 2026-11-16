// Content validation V1 to V10 (release_engineering.md 7.4): `node tools/content/validate.ts`.
// Node runs this file directly; the command itself (validate_cli.ts) goes through Vite's
// module runner, because the game content is assembled with import.meta.glob.
//
//   node tools/content/validate.ts                  validate data/ at M0
//   node tools/content/validate.ts --milestone M2   milestone-gated rules at M2
//   node tools/content/validate.ts --batch <name>   as if staged batch <name> were promoted
//   node tools/content/validate.ts --only V1,V5     a subset
//   node tools/content/validate.ts --warnings       also print warnings
//   node tools/content/validate.ts --json out.json  also write the results as JSON
//
// Exit code 0 when every validator is green (no error-level finding), 1 otherwise. The
// validators are tools/content/validators/ (shared with tests/content_validation.test.ts,
// the catalog importer and the editor's batch view).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { module } = await runnerImport<{ main(argv: string[]): Promise<number> }>(
  resolve(root, 'tools', 'content', 'validate_cli.ts'),
  { root, configFile: false, logLevel: 'error' },
);
process.exitCode = await module.main(process.argv.slice(2));
