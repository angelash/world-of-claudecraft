// Kernel text guard (D-077, PK-M0-14; release_engineering.md 8.4 step 6, implementation
// conventions 8). The kernel speaks in TextRefs only:
// - a ratchet: the CJK literals (strings, templates, regular expressions) of src/core,
//   src/systems and src/game (the role-pack prompt templates under
//   src/game/ai_roles/templates/ excepted) may not exceed tests/fixtures/i18n_ceiling.json,
//   which is 0 for every scope since the migration; kernel JSON files may hold CJK only when
//   listed below (vocabulary data waiting to move to data/), and the kernel has no other
//   code files than .ts;
// - the kernel never reads the string tables: no import of src/shared_ui or locales/ from
//   src/core, src/systems or src/game;
// - the source string tables under locales/zh-Hans/ are flat key-to-text files, one per
//   system (sys_<system>.json holds only sys.<system>.* keys), with well-formed keys and
//   no forbidden characters;
// - every text key the kernel writes as a literal ('sys.a.b', also inside conditionals and
//   tables), every key prefix it completes at run time (`sys.a.${id}`) and every joinText
//   separator exists in them, no table entry is dead, and every tr(key, { ... }) call passes
//   exactly the parameters its template names.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { formatText, SOURCE_TABLE } from '../src/shared_ui/i18n';
import { hasCjk, PROMPT_TEMPLATE_DIRS, scanLiterals } from '../tools/i18n/scan_literals';
import ceiling from './fixtures/i18n_ceiling.json';

const ROOT = join(__dirname, '..');
const LOCALE_DIR = join(ROOT, 'locales', 'zh-Hans');
const KERNEL = ['src/core', 'src/systems', 'src/game'];
const SKIP = PROMPT_TEMPLATE_DIRS;
const KEY = /^[a-z0-9_]+(\.[a-z0-9_]+)+$/;

/**
 * Kernel JSON files allowed to hold CJK: vocabulary matched against Chinese content values
 * or the player's typed words, and a name list; data, not display text (follow-up: data/).
 */
const VOCABULARY_JSON = [
  'src/systems/city/settler_names.json',
  'src/systems/dialogue/input_lexicon.json',
  'src/systems/goddess/input_lexicon.json',
  'src/systems/npc/trait_words.json',
  'src/systems/warfare/trait_words.json',
];

// U+2013 to U+2015, U+2600 to U+27BF and the emoji blocks (CLAUDE.md), built from char
// codes so this file never contains them
const ch = (...codes: number[]) => String.fromCharCode(...codes);
const FORBIDDEN = new RegExp(
  `[${ch(0x2013)}-${ch(0x2015)}${ch(0x2600)}-${ch(0x27bf)}${ch(0xd83c, 0xdc00)}-${ch(0xd83e, 0xdeff)}]`,
  'u',
);

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
}

const rel = (p: string) => relative(ROOT, p).split(sep).join('/');
const kernelFiles = KERNEL.flatMap((d) => filesUnder(join(ROOT, d)));
const kernelTs = kernelFiles.filter((f) => f.endsWith('.ts'));

describe('kernel CJK literal ratchet', () => {
  const scopes = ceiling as Record<string, number>;
  for (const [scope, max] of Object.entries(scopes)) {
    it(`${scope} holds at most ${max} CJK literals`, () => {
      const hits = scanLiterals(ROOT, [scope], SKIP);
      const sample = hits
        .slice(0, 10)
        .map((h) => `${h.file}:${h.line} ${h.text}`)
        .join('\n');
      expect(
        hits.length,
        `CJK literals over the ceiling, for example:\n${sample}`,
      ).toBeLessThanOrEqual(max);
    });
  }

  it('every ceiling is 0: the kernel holds no Chinese literal (PK-M0-14 exit)', () => {
    expect(Object.keys(scopes).sort()).toEqual(['src/core', 'src/game', 'src/systems']);
    for (const v of Object.values(scopes)) expect(v).toBe(0);
  });

  it('the kernel has no code files the scanner would not read', () => {
    const other = kernelFiles.map(rel).filter((f) => /\.(js|mjs|cjs|mts|cts|tsx|jsx)$/.test(f));
    expect(other).toEqual([]);
  });

  it('kernel JSON holds CJK only in the listed vocabulary files', () => {
    const withCjk = kernelFiles
      .filter((f) => f.endsWith('.json') && hasCjk(readFileSync(f, 'utf8')))
      .map(rel)
      .sort();
    expect(withCjk).toEqual([...VOCABULARY_JSON].sort());
  });

  it('the kernel never imports the string tables or the client text', () => {
    const offenders: string[] = [];
    for (const f of kernelTs) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/from\s+'([^']+)'/g)) {
        const spec = m[1] as string;
        if (/shared_ui|locales\//.test(spec)) offenders.push(`${rel(f)} -> ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

describe('source string tables', () => {
  const allFiles = readdirSync(LOCALE_DIR).filter((f) => f.endsWith('.json'));
  const files = allFiles.filter((f) => f.startsWith('sys_'));

  it('are flat key-to-text files, one per system, with well-formed keys', () => {
    const seen = new Map<string, string>();
    for (const f of files) {
      const m = /^sys_([a-z0-9_]+)\.json$/.exec(f);
      expect(m, `${f}: expected sys_<system>.json`).not.toBeNull();
      const system = (m as RegExpExecArray)[1] as string;
      const table = JSON.parse(readFileSync(join(LOCALE_DIR, f), 'utf8')) as Record<
        string,
        unknown
      >;
      for (const [k, v] of Object.entries(table)) {
        expect(KEY.test(k), `${f}: bad key ${k}`).toBe(true);
        expect(k.startsWith(`sys.${system}.`), `${f}: ${k} outside sys.${system}.`).toBe(true);
        expect(typeof v, `${f}: ${k} is not text`).toBe('string');
        expect(FORBIDDEN.test(v as string), `${f}: ${k} has a forbidden character`).toBe(false);
        expect(seen.has(k), `${k} defined twice`).toBe(false);
        seen.set(k, f);
      }
    }
    // the client tables (PK-M0-15, PK-M1-23): ui.json and ui_<area>.json hold ui.* keys,
    // tut.json the onboarding steps' tut.* keys; well-formed, no forbidden characters, no
    // duplicates across every table.
    const client = allFiles.filter((f) => /^ui(_[a-z0-9_]+)?\.json$/.test(f) || f === 'tut.json');
    expect(client).toContain('ui.json');
    for (const f of client) {
      const root = f === 'tut.json' ? 'tut.' : 'ui.';
      const table = JSON.parse(readFileSync(join(LOCALE_DIR, f), 'utf8')) as Record<
        string,
        unknown
      >;
      for (const [k, v] of Object.entries(table)) {
        expect(KEY.test(k), `${f}: bad key ${k}`).toBe(true);
        expect(k.startsWith(root), `${f}: ${k} outside ${root}`).toBe(true);
        expect(typeof v, `${f}: ${k} is not text`).toBe('string');
        expect(FORBIDDEN.test(v as string), `${f}: ${k} has a forbidden character`).toBe(false);
        expect(seen.has(k), `${k} defined twice`).toBe(false);
        seen.set(k, f);
      }
    }
    // Only these tables feed SOURCE_TABLE; content.generated.json is separate (resolved
    // through the content lookup, src/shared_ui/content_text.ts), and no other file may sit
    // in the folder, since the loader merges every non-generated JSON there.
    expect(allFiles.sort()).toEqual([...files, ...client, 'content.generated.json'].sort());
    expect(Object.keys(SOURCE_TABLE).length).toBe(seen.size);
  });

  it('render placeholders, joins, clips and money the way the kernel used to write them', () => {
    const o = { table: SOURCE_TABLE, lang: 'zh-Hans' };
    expect(formatText({ key: 'sys.common.join.list', params: { 0: 'a', 1: 'b' } }, o)).toBe('a、b');
    expect(formatText({ key: 'sys.common.clip', params: { text: 'abcdef', n: 3 } }, o)).toBe('abc');
    expect(formatText({ key: 'sys.common.money.gold', params: { n: 2 } }, o)).toBe('2 金');
    expect(formatText({ raw: 'no handler for x.y', lang: 'en' }, o)).toBe('no handler for x.y');
    // malformed params never throw
    const bad = { key: 'sys.common.clip', params: { text: {} as never, n: 3 } };
    expect(formatText(bad, o)).toBe('');
  });
});

/** Placeholder names a template uses: {name}, {name, type ...}, {name, plural|select, ...}. */
function placeholders(template: string): Set<string> {
  const out = new Set<string>();
  const re = /\{\s*(\w+)\s*(?:\}|,\s*(?:number|percent|money|date|duration|ref|plural|select)\b)/g;
  for (const m of template.matchAll(re)) out.add(m[1] as string);
  return out;
}

describe('kernel text keys', () => {
  const uses: { file: string; key: string }[] = [];
  const prefixes: { file: string; key: string }[] = [];
  for (const f of kernelTs) {
    const text = readFileSync(f, 'utf8');
    const file = rel(f);
    // every quoted key: tr() arguments, both arms of a conditional, table entries
    for (const m of text.matchAll(/['"`](sys(?:\.[a-z0-9_]+)+)['"`]/g))
      uses.push({ file, key: m[1] as string });
    // keys completed at run time: `sys.a.b.${id}`
    for (const m of text.matchAll(/`(sys(?:\.[a-z0-9_]+)+\.)\$\{/g))
      prefixes.push({ file, key: m[1] as string });
    for (const m of text.matchAll(/\bjoinText\(\s*'([^']+)'/g))
      uses.push({ file, key: `sys.common.join.${m[1]}` });
  }

  it('finds the kernel keys at all', () => {
    expect(uses.length).toBeGreaterThan(500);
    expect(prefixes.length).toBeGreaterThan(0);
  });

  it('every key the kernel writes as a literal is in the source tables', () => {
    const missing = uses.filter((u) => !(u.key in SOURCE_TABLE)).map((u) => `${u.file}: ${u.key}`);
    expect(missing).toEqual([]);
  });

  it('every system key in the source tables is used by the kernel (no dead entries)', () => {
    const used = new Set(uses.map((u) => u.key));
    // date styles are named inside other templates: {tick, date, sys.npc.time.label}
    for (const v of Object.values(SOURCE_TABLE))
      for (const m of v.matchAll(/\b(sys(?:\.[a-z0-9_]+)+)\s*\}/g)) used.add(m[1] as string);
    const dead = Object.keys(SOURCE_TABLE).filter(
      (k) =>
        k.startsWith('sys.') &&
        !k.startsWith('sys.common.') &&
        !used.has(k) &&
        !prefixes.some((p) => k.startsWith(p.key)),
    );
    expect(dead).toEqual([]);
  });

  it('every key prefix the kernel completes at run time has entries in the source tables', () => {
    const keys = Object.keys(SOURCE_TABLE);
    const missing = prefixes
      .filter((p) => !keys.some((k) => k.startsWith(p.key)))
      .map((p) => `${p.file}: ${p.key}`);
    expect(missing).toEqual([]);
  });

  it('every tr(key, { ... }) call passes exactly the parameters its template names', () => {
    const problems: string[] = [];
    let checked = 0;
    for (const f of kernelTs) {
      const sf = ts.createSourceFile(f, readFileSync(f, 'utf8'), ts.ScriptTarget.ES2022, true);
      const visit = (n: ts.Node): void => {
        if (
          ts.isCallExpression(n) &&
          ts.isIdentifier(n.expression) &&
          n.expression.text === 'tr' &&
          n.arguments[0] &&
          ts.isStringLiteral(n.arguments[0])
        ) {
          const key = n.arguments[0].text;
          const template = SOURCE_TABLE[key];
          const arg = n.arguments[1];
          const names = new Set<string>();
          let exact = true;
          if (arg && ts.isObjectLiteralExpression(arg)) {
            for (const p of arg.properties) {
              if (
                (ts.isPropertyAssignment(p) || ts.isShorthandPropertyAssignment(p)) &&
                (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
              )
                names.add(p.name.text);
              else exact = false;
            }
          } else exact = false;
          // a bare tr(key) may be a key holder in a table, filled later: only calls that pass
          // an object literal are checked
          if (template !== undefined && exact) {
            checked++;
            const want = placeholders(template);
            const where = `${rel(f)}:${sf.getLineAndCharacterOfPosition(n.getStart(sf)).line + 1} ${key}`;
            for (const w of want) if (!names.has(w)) problems.push(`${where}: missing {${w}}`);
            for (const h of names) if (!want.has(h)) problems.push(`${where}: unused param ${h}`);
          }
        }
        ts.forEachChild(n, visit);
      };
      visit(sf);
    }
    expect(checked).toBeGreaterThan(200);
    expect(problems).toEqual([]);
  });
});
