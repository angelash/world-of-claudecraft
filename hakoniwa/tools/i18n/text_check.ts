// The text check (release_engineering.md 8.7 step 4; ux_and_onboarding.md 20.5, 23.2):
// pure checks over the string tables and the keys the code uses. Each check answers findings
// with a stable code, so the CLI (tools/i18n/check.ts), the gate and the tests read the same
// result.
//
// - missing_key: a key the code writes as a literal (ui., sys., tut.) that no source table has;
// - missing_prefix: a key family the code completes at run time (`ui.win.battle.formation.${f}`)
//   with no entry in the source tables;
// - unused_key: a ui. or sys. key of the source tables that no code names (literally, through
//   a completed family, or as a date style inside another template);
// - placeholder: a translation whose placeholders differ from the source's (every locale
//   other than the source, 8.7 step 4);
// - stale or missing translation rows are the export tool's business (8.7 step 2), not here;
// - forbidden_char: U+2013 to U+2015, U+2600 to U+27BF, emoji (CLAUDE.md);
// - too_long: a ui. text over the length limit of its element class (19.2), counted in
//   Chinese characters for the source language, twice the limit for the others.
//
// Pure: the CLI reads the files and the sources.

/** Placeholder names of a template: {name}, {name, type ...}, {name, plural|select, ...}. */
export function placeholderNames(template: string): string[] {
  const out = new Set<string>();
  const re = /\{\s*(\w+)\s*(?:\}|,\s*(?:number|percent|money|date|duration|ref|plural|select)\b)/g;
  for (const m of template.matchAll(re)) out.add(m[1] as string);
  return [...out].sort();
}

export type TextFindingCode =
  | 'missing_key'
  | 'missing_prefix'
  | 'unused_key'
  | 'placeholder'
  | 'forbidden_char'
  | 'too_long';

export interface TextFinding {
  code: TextFindingCode;
  key: string;
  /** locale for table findings, file:line for code findings */
  where: string;
  detail: string;
}

/** A key named by code: a literal, or a family completed at run time. */
export interface KeyUse {
  key: string;
  where: string;
  /** a family: `key` holds `*` where the code inserts a value (`ui.win.*.title`) */
  prefix?: boolean;
}

/** True when `key` belongs to the family `pattern` (`*` is one or more key segments). */
export function inFamily(key: string, pattern: string): boolean {
  if (!pattern.includes('*')) return key.startsWith(pattern);
  const parts = pattern.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('[a-z0-9_.]+')}${pattern.endsWith('*') ? '' : '$'}`).test(key);
}

/** The text with comments blanked (line structure kept), so examples in docs are not uses. */
export function stripComments(text: string): string {
  // one pass over strings and comments, so a `/*` or `//` inside a string stays text
  return text.replace(
    /('(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`)|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    (m, str: string | undefined) => (str ? m : m.replace(/[^\n]/g, ' ')),
  );
}

/**
 * Keys and families the code names: quoted literals, and template literals with `${...}`
 * holes (`ui.win.${id}.title` is the family `ui.win.*.title`; a trailing hole makes a
 * prefix family `ui.win.battle.formations.*`).
 */
export function scanKeyUses(file: string, text: string): KeyUse[] {
  const out: KeyUse[] = [];
  const lines = stripComments(text).split('\n');
  lines.forEach((line, i) => {
    const where = `${file}:${i + 1}`;
    for (const m of line.matchAll(/['"`]((?:ui|sys|tut)(?:\.[a-z0-9_]+)+)['"`]/g)) {
      out.push({ key: m[1] as string, where });
    }
    for (const m of line.matchAll(
      /`((?:ui|sys|tut)\.(?:[a-z0-9_.]|\$\{[^}`]*\})*\$\{[^}`]*\}(?:[a-z0-9_.]|\$\{[^}`]*\})*)`/g,
    )) {
      out.push({ key: (m[1] as string).replace(/\$\{[^}`]*\}/g, '*'), where, prefix: true });
    }
    for (const m of line.matchAll(/\bjoinText\(\s*'([^']+)'/g)) {
      out.push({ key: `sys.common.join.${m[1]}`, where });
    }
  });
  return out;
}

/** Length limits per ui key family (19.2), in Chinese characters (the source language). */
export interface LengthRule {
  /** matched against the key */
  pattern: RegExp;
  limit: number;
  /** element class from 19.2, for the report */
  label: string;
}

/**
 * The 19.2 limits mapped onto the ui key layout (20.2). A key matches the first rule; keys
 * no rule names are unbounded here (prose such as hints and confirmations). Placeholders
 * count as one character each.
 */
export const LENGTH_RULES: readonly LengthRule[] = [
  { pattern: /^ui\.win\.[a-z0-9_]+\.title$/, limit: 8, label: 'window title' },
  {
    pattern: /^ui\.win\.menu\.(resume|open_saves|open_settings|open_help|to_title)$/,
    limit: 8,
    label: 'menu item',
  },
  { pattern: /^ui\.common\.panel\.close$/, limit: 6, label: 'button' },
  { pattern: /^ui\.win\.[a-z0-9_]+\.tabs?\.[a-z0-9_]+$/, limit: 4, label: 'tab' },
  { pattern: /^ui\.win\.rumors\.(book|reputation)$/, limit: 4, label: 'tab' },
  { pattern: /^ui\.hud\.prompt\./, limit: 20, label: 'prompt bar' },
  { pattern: /^ui\.hud\.banner\./, limit: 24, label: 'notification' },
  { pattern: /^ui\.common\.feature\./, limit: 8, label: 'door or feature name' },
  { pattern: /^ui\.scr\.title\.(new_game|load_game|back)$/, limit: 6, label: 'button' },
];

/** Display length in Chinese-character units: placeholders count as one, ASCII as half. */
export function displayLength(template: string): number {
  // a placeholder becomes one full-width stand-in character
  const text = template.replace(/\{[^{}]*(\{[^{}]*\}[^{}]*)*\}/g, '〇');
  let n = 0;
  for (const ch of text) n += (ch.codePointAt(0) ?? 0) < 0x2e80 ? 0.5 : 1;
  return n;
}

// U+2013 to U+2015, U+2600 to U+27BF and the emoji blocks, built from char codes so this
// file never contains them.
const ch = (...codes: number[]) => String.fromCharCode(...codes);
const FORBIDDEN = new RegExp(
  `[${ch(0x2013)}-${ch(0x2015)}${ch(0x2600)}-${ch(0x27bf)}${ch(0xd83c, 0xdc00)}-${ch(0xd83e, 0xdeff)}]`,
  'u',
);

export interface TextCheckInput {
  /** the source language */
  source: string;
  /** locale to flat table (ui. and sys. keys; the generated content table is not here) */
  tables: Readonly<Record<string, Readonly<Record<string, string>>>>;
  /** every key and family the code names */
  uses: readonly KeyUse[];
  /** keys used outside the scanned code (dynamic tables, documented exceptions) */
  allowUnused?: (key: string) => boolean;
}

/** Every finding, in a stable order (code, key, where). */
export function checkText(input: TextCheckInput): TextFinding[] {
  const out: TextFinding[] = [];
  const src = input.tables[input.source] ?? {};
  const srcKeys = Object.keys(src);
  const literal = input.uses.filter((u) => !u.prefix);
  const prefixes = input.uses.filter((u) => u.prefix);

  for (const u of literal) {
    if (!(u.key in src)) {
      out.push({
        code: 'missing_key',
        key: u.key,
        where: u.where,
        detail: 'not in the source tables',
      });
    }
  }
  for (const p of prefixes) {
    if (!srcKeys.some((k) => inFamily(k, p.key))) {
      out.push({
        code: 'missing_prefix',
        key: p.key,
        where: p.where,
        detail: 'no key in this family',
      });
    }
  }

  const used = new Set(literal.map((u) => u.key));
  // date styles and nested keys named inside other templates: {tick, date, sys.npc.time.label}
  for (const v of Object.values(src)) {
    for (const m of v.matchAll(/\b((?:sys|ui)(?:\.[a-z0-9_]+)+)\s*\}/g)) used.add(m[1] as string);
  }
  for (const k of srcKeys) {
    if (k.startsWith('sys.common.')) continue;
    if (used.has(k) || prefixes.some((p) => inFamily(k, p.key))) continue;
    if (input.allowUnused?.(k)) continue;
    out.push({ code: 'unused_key', key: k, where: input.source, detail: 'no code names it' });
  }

  for (const [locale, table] of Object.entries(input.tables)) {
    for (const [k, v] of Object.entries(table)) {
      if (FORBIDDEN.test(v)) {
        out.push({ code: 'forbidden_char', key: k, where: locale, detail: 'forbidden character' });
      }
      if (locale !== input.source && k in src) {
        const want = placeholderNames(src[k] as string).join(',');
        const have = placeholderNames(v).join(',');
        if (want !== have) {
          out.push({
            code: 'placeholder',
            key: k,
            where: locale,
            detail: `placeholders {${have}} differ from the source {${want}}`,
          });
        }
      }
      const rule = LENGTH_RULES.find((r) => r.pattern.test(k));
      if (rule) {
        const limit = locale === input.source ? rule.limit : rule.limit * 2;
        const len = displayLength(v);
        if (len > limit) {
          out.push({
            code: 'too_long',
            key: k,
            where: locale,
            detail: `${rule.label}: ${len} over ${limit}`,
          });
        }
      }
    }
  }

  const order: TextFindingCode[] = [
    'missing_key',
    'missing_prefix',
    'placeholder',
    'forbidden_char',
    'too_long',
    'unused_key',
  ];
  return out.sort(
    (a, b) =>
      order.indexOf(a.code) - order.indexOf(b.code) ||
      a.key.localeCompare(b.key) ||
      a.where.localeCompare(b.where),
  );
}

/**
 * Translation export rule (release_engineering.md 8.6, 8.7 step 2): prompt text renders only
 * in the source language, so sys.<system>.prompt.* keys (and the source-only content fields)
 * are never sent out for translation.
 */
export function isSourceOnlyKey(key: string): boolean {
  return /^sys\.[a-z0-9_]+\.prompt\./.test(key);
}

/**
 * The keys of a table that go to translators (the export filter): every key but the prompt
 * keys, and, for the content table, but the fields only the prompts read (pass
 * isSourceOnlyContentKey from src/shared_ui/content_text.ts as `sourceOnlyContent`).
 */
export function exportableKeys(
  table: Readonly<Record<string, string>>,
  sourceOnlyContent: (key: string) => boolean = () => false,
): string[] {
  return Object.keys(table)
    .filter((k) => !isSourceOnlyKey(k) && !sourceOnlyContent(k))
    .sort();
}
