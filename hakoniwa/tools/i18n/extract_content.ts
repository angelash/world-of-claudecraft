// Content text extraction (release_engineering.md 8.3): writes
// locales/zh-Hans/content.generated.json from the Chinese display fields of data/, keys
// c.<table>.<id>.<field>[.<n>] (D-087). Authors edit data/ as before and never write a key.
//
//   node tools/i18n/extract_content.ts           write the table
//   node tools/i18n/extract_content.ts --check    fail when the written table is stale
//   node tools/i18n/extract_content.ts --report   also list the folded ids
//
// Node runs this file directly; the work goes through Vite's module runner, because the
// content packs are assembled with import.meta.glob (same shape as
// tools/content/validate.ts). The extractor itself is src/shared_ui/content_text.ts (pure).

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const { module } = await runnerImport<{ main(argv: string[]): Promise<number> }>(
  resolve(root, 'tools', 'i18n', 'extract_content_cli.ts'),
  { root, configFile: false, logLevel: 'error' },
);
process.exitCode = await module.main(process.argv.slice(2));
