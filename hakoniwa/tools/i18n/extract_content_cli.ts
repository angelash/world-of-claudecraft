// The content extraction command, loaded by extract_content.ts through Vite's module
// runner (it imports the content packs, which use import.meta.glob). See that file for the
// options. The generated table is a build artifact: never hand-edited
// (dev_process.md 3, "generated files are written only by the step that owns them").

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContent } from '../../src/content';
import { extractContentText } from '../../src/shared_ui/content_text';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Where the generated content table lives (release_engineering.md 8.2). */
export const CONTENT_TABLE_PATH = 'locales/zh-Hans/content.generated.json';

/** The file text of a content table: sorted keys, two-space JSON, trailing newline. */
export function formatContentTable(table: Record<string, string>): string {
  return `${JSON.stringify(table, null, 2)}\n`;
}

export async function main(argv: readonly string[]): Promise<number> {
  const args = new Set(argv);
  const { table, problems, folded } = extractContentText(buildContent());
  const keys = Object.keys(table);
  if (problems.length > 0) {
    for (const p of problems) console.error(`content text: ${p}`);
    return 1;
  }
  if (args.has('--report')) for (const f of folded) console.log(`folded id: ${f}`);
  const text = formatContentTable(table);
  const out = resolve(ROOT, CONTENT_TABLE_PATH);
  const summary = `${keys.length} keys from ${new Set(keys.map((k) => k.split('.')[1])).size} tables`;
  if (args.has('--check')) {
    const current = existsSync(out) ? readFileSync(out, 'utf8') : '';
    if (current.replace(/\r\n/g, '\n') !== text) {
      console.error(
        `content text: ${CONTENT_TABLE_PATH} is stale; run node tools/i18n/extract_content.ts`,
      );
      return 1;
    }
    console.log(`content text: ${CONTENT_TABLE_PATH} is current (${summary})`);
    return 0;
  }
  writeFileSync(out, text);
  console.log(`content text: wrote ${CONTENT_TABLE_PATH} (${summary})`);
  return 0;
}
