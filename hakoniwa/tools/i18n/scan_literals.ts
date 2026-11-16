// Chinese literal scanner (release_engineering.md 8.4 step 1). Lists the string, template
// and regular-expression literals that contain CJK characters (ideographs, CJK punctuation,
// full-width forms) in the given source directories, with the file, line and enclosing
// exported symbol. tests/i18n_kernel_guard.test.ts counts them against the ratchet ceiling;
// run it directly for the JSON list:
//   node tools/i18n/scan_literals.ts src/core src/systems src/game

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * Role-pack prompt templates: Chinese by design (D-077, prompts stay in the source language),
 * so the kernel ratchet and this scanner skip them (release_engineering.md 8.4).
 */
export const PROMPT_TEMPLATE_DIRS: readonly string[] = ['src/game/ai_roles/templates/'];

export interface CjkLiteral {
  /** path relative to the root, forward slashes */
  file: string;
  line: number;
  /** nearest enclosing top-level declaration name, '' at module level */
  symbol: string;
  text: string;
}

/** CJK punctuation, extension A, unified ideographs, compatibility ideographs, full-width forms. */
const CJK_RANGES: readonly (readonly [number, number])[] = [
  [0x3000, 0x303f],
  [0x3400, 0x4dbf],
  [0x4e00, 0x9fff],
  [0xf900, 0xfaff],
  [0xff00, 0xffef],
];

/** True when the text holds a CJK ideograph, CJK punctuation or a full-width form. */
export function hasCjk(text: string): boolean {
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    if (CJK_RANGES.some(([lo, hi]) => c >= lo && c <= hi)) return true;
  }
  return false;
}

function filesUnder(dir: string, skip: readonly string[]): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (skip.some((s) => p.split(sep).join('/').includes(s))) continue;
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

function symbolOf(node: ts.Node): string {
  let n: ts.Node | undefined = node;
  let name = '';
  while (n && !ts.isSourceFile(n)) {
    if (
      (ts.isFunctionDeclaration(n) || ts.isClassDeclaration(n) || ts.isVariableDeclaration(n)) &&
      n.name &&
      ts.isIdentifier(n.name)
    ) {
      name = n.name.text;
    }
    n = n.parent;
  }
  return name;
}

/** CJK literals of one source text. */
export function cjkLiteralsOf(file: string, text: string): CjkLiteral[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.ES2022, true);
  const out: CjkLiteral[] = [];
  const visit = (node: ts.Node): void => {
    let value: string | null = null;
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      value = node.text;
    } else if (ts.isRegularExpressionLiteral(node)) {
      // the pattern as written: an escaped script range is a detector, not text
      value = node.text;
    }
    if (value !== null && hasCjk(value)) {
      out.push({
        file,
        line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1,
        symbol: symbolOf(node),
        text: value,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

/**
 * CJK literals under `dirs` (relative to `root`); paths containing any `skip` fragment
 * (forward slashes, for example 'src/game/ai_roles/templates/') are left out.
 */
export function scanLiterals(
  root: string,
  dirs: readonly string[],
  skip: readonly string[] = [],
): CjkLiteral[] {
  const out: CjkLiteral[] = [];
  for (const d of dirs) {
    for (const f of filesUnder(join(root, d), skip)) {
      const rel = relative(root, f).split(sep).join('/');
      out.push(...cjkLiteralsOf(rel, readFileSync(f, 'utf8')));
    }
  }
  return out;
}

const isMain = process.argv[1]?.replace(/\\/g, '/').endsWith('tools/i18n/scan_literals.ts');
if (isMain) {
  const root = join(import.meta.dirname, '..', '..');
  const dirs = process.argv.slice(2);
  const list = scanLiterals(
    root,
    dirs.length ? dirs : ['src/core', 'src/systems', 'src/game'],
    PROMPT_TEMPLATE_DIRS,
  );
  process.stdout.write(`${JSON.stringify(list, null, 1)}\n`);
}
