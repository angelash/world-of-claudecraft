// The text check (release_engineering.md 8.7 step 4; ux_and_onboarding.md 20.5, 23.2):
//   node tools/i18n/check.ts            check the string tables and the code's keys
//   node tools/i18n/check.ts --json     print the findings as JSON
//
// Reads locales/<lang>/ui.json and sys_*.json (every language directory; zh-Hans is the
// source), scans src/ (the editor and the role-pack prompt templates excepted: the editor is
// not localized, release_engineering.md 8.4) for the keys and key families the code names,
// and checks: missing keys, unused keys, placeholder parity across locales, forbidden
// characters and the 19.2 length limits. It also checks that the generated files are
// current: the key types (tools/i18n/gen_keys.ts) and the content table
// (tools/i18n/extract_content.ts). Exit 0 when nothing is found. Pure checks live in
// tools/i18n/text_check.ts.

import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type Check = typeof import('./text_check');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SOURCE = 'zh-Hans';

/** Source directories the key scan reads, and the parts of them it skips. */
export const SCAN_DIRS = ['src'];
export const SCAN_SKIP = ['src/editor/', 'src/game/ai_roles/templates/'];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

function tables(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const base = join(ROOT, 'locales');
  for (const lang of readdirSync(base).sort()) {
    const dir = join(base, lang);
    if (!statSync(dir).isDirectory()) continue;
    const table: Record<string, string> = {};
    for (const f of readdirSync(dir).sort()) {
      if (!f.endsWith('.json') || f.endsWith('.generated.json') || f.startsWith('_')) continue;
      Object.assign(table, JSON.parse(readFileSync(join(dir, f), 'utf8')));
    }
    out[lang] = table;
  }
  return out;
}

function generatedCurrent(): string[] {
  const problems: string[] = [];
  const keys = spawnSync(process.execPath, [join(ROOT, 'tools/i18n/gen_keys.ts'), '--check'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (keys.status !== 0) problems.push((keys.stderr || keys.stdout).trim());
  const content = spawnSync(
    process.execPath,
    [join(ROOT, 'tools/i18n/extract_content.ts'), '--check'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  if (content.status !== 0) problems.push((content.stderr || content.stdout).trim());
  return problems;
}

async function main(): Promise<number> {
  const check = (await import(new URL('./text_check.ts', import.meta.url).href)) as Check;
  const uses = SCAN_DIRS.flatMap((d) => walk(join(ROOT, d)))
    .map((f) => ({ f, rel: relative(ROOT, f).split(sep).join('/') }))
    .filter(({ rel }) => !SCAN_SKIP.some((s) => rel.startsWith(s)))
    .filter(({ rel }) => !rel.endsWith('.generated.ts'))
    .flatMap(({ f, rel }) => check.scanKeyUses(rel, readFileSync(f, 'utf8')));
  const findings = check.checkText({ source: SOURCE, tables: tables(), uses });
  const generated = existsSync(join(ROOT, 'locales', SOURCE)) ? generatedCurrent() : [];
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ findings, generated }, null, 1));
  } else {
    for (const f of findings) console.log(`${f.code}  ${f.key}  (${f.where}) ${f.detail}`);
    for (const g of generated) console.log(`stale  ${g}`);
    const byCode: Record<string, number> = {};
    for (const f of findings) byCode[f.code] = (byCode[f.code] ?? 0) + 1;
    console.log(
      `text check: ${findings.length + generated.length} finding(s) ${JSON.stringify(byCode)}; ${uses.length} key uses scanned`,
    );
  }
  return findings.length + generated.length === 0 ? 0 : 1;
}

process.exitCode = await main();
