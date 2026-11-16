// Rendering TextRefs to strings (D-077, D-087; release_engineering.md 8.2,
// ux_and_onboarding.md 20.3). The kernel emits TextRefs; the client, the editor and the
// prompt assembly call t() here. Tables are the flat key-to-text JSON files under
// locales/<lang>/; zh-Hans is the source language and the only one shipped for 1.0.
//
// Template syntax: {name} (plain; a nested TextRef renders recursively), {n, number},
// {p, percent}, {m, money} (copper), {d, date} and {d, date, <style>} (tick; the style is a
// key under sys.common.date. or a full key), {t, duration} (ticks), {x, ref},
// {n, plural, one {...} other {...}} and {g, select, a {...} other {...}}. A brace that does
// not open one of these is literal text. A missing parameter stays as its placeholder and a
// missing key renders as the key; both are reported to the missing-text handler (dev builds
// warn). Content keys c.<table>.<id>.<field>[.<n>] resolve through the content lookup the
// client installs for the content it runs (setContentText), then the generated content
// table. Pure, no DOM.

import { contentKey } from '../core/content_key';
import {
  CLIP_KEY,
  isTextRef,
  JOIN_PREFIX,
  SOURCE_LANG,
  type TextKeyArg,
  type TextParam,
  type TextRef,
} from '../core/text';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../core/time';
import { extractContentText } from './content_text';
import { PSEUDO_LANG, pseudoTable, pseudoTemplate } from './pseudo';

export { isTextRef, PSEUDO_LANG, SOURCE_LANG, type TextParam, type TextRef };

export type TextTable = Readonly<Record<string, string>>;

/** Resolves a content key (c.<table>.<id>.<field>[.<n>]) to its display text. */
export type ContentTextLookup = (key: string) => string | undefined;

export type MissingText =
  | { kind: 'key'; key: string }
  | { kind: 'param'; key: string; param: string };

/** Merge the per-domain JSON files of one language into one flat table. */
export function mergeTables(files: Record<string, { default: Record<string, string> }>): TextTable {
  const out: Record<string, string> = {};
  for (const path of Object.keys(files).sort()) {
    for (const [k, v] of Object.entries(files[path]?.default ?? {})) out[k] = v;
  }
  return out;
}

// The ui. and sys. tables (content.generated.json is excluded: it resolves through the
// content lookup below, set with setContentText, not merged into SOURCE_TABLE).
const SOURCE_FILES = import.meta.glob<{ default: Record<string, string> }>(
  ['../../locales/zh-Hans/*.json', '!../../locales/zh-Hans/*.generated.json'],
  { eager: true },
);

/** The source-language table (every ui. and sys. key the kernel and the client may emit). */
export const SOURCE_TABLE: TextTable = mergeTables(SOURCE_FILES);

const GENERATED_CONTENT_FILES = import.meta.glob<{ default: Record<string, string> }>(
  '../../locales/zh-Hans/content.generated.json',
  { eager: true },
);

/** The generated content table (release_engineering.md 8.3): c.* keys to source text. */
export const GENERATED_CONTENT_TABLE: TextTable = mergeTables(GENERATED_CONTENT_FILES);

const DEV = !!(import.meta as { env?: { DEV?: boolean } }).env?.DEV;

/** The source table run through the pseudo-localization transform (dev builds only). */
export const PSEUDO_TABLE: TextTable = DEV ? pseudoTable(SOURCE_TABLE) : {};

const TABLES: Record<string, TextTable> = DEV
  ? { [SOURCE_LANG]: SOURCE_TABLE, [PSEUDO_LANG]: PSEUDO_TABLE }
  : { [SOURCE_LANG]: SOURCE_TABLE };
let lang = SOURCE_LANG;
let contentText: ContentTextLookup | null = null;
const reported = new Set<string>();
const missingLog: MissingText[] = [];
let onMissing: ((m: MissingText) => void) | null = DEV
  ? (m) => {
      const id = m.kind === 'key' ? m.key : `${m.key}#${m.param}`;
      if (reported.has(id)) return;
      reported.add(id);
      console.warn(
        m.kind === 'key'
          ? `[i18n] missing text key ${m.key}`
          : `[i18n] missing param ${m.param} of ${m.key}`,
      );
    }
  : null;

function report(m: MissingText): void {
  if (missingLog.length < 1000) missingLog.push(m);
  onMissing?.(m);
}

/** Replace the missing-text handler (null to stay silent). */
export function setMissingTextHandler(fn: ((m: MissingText) => void) | null): void {
  onMissing = fn;
}

/** Missing keys and parameters seen so far (dev tools and tests). */
export function missingTextSeen(): readonly MissingText[] {
  return missingLog;
}

/** The active language (only the source language exists before 1.1). */
export function textLanguage(): string {
  return lang;
}

export function setTextLanguage(next: string): void {
  if (TABLES[next]) lang = next;
}

/** Install the content lookup that resolves c.* keys (null to clear). */
export function setContentText(lookup: ContentTextLookup | null): void {
  contentText = lookup;
}

/**
 * A content lookup over a loaded content map (the source language): the same keys the
 * extractor writes to content.generated.json (src/shared_ui/content_text.ts), built once.
 * Every non-empty string field resolves, so a display field the extractor would skip still
 * renders as written.
 */
export function contentTextLookup(content: unknown): ContentTextLookup {
  const { table } = extractContentText(content, { allStrings: true });
  return (key) => table[key];
}

export interface FormatOptions {
  table: TextTable;
  /** fallback table for keys the language lacks (the source language) */
  fallback?: TextTable;
  lang: string;
  content?: ContentTextLookup | null;
  missing?: (m: MissingText) => void;
}

/** Keys in string form: a scoped, lowercase dotted name (ux_and_onboarding.md 20.2). */
const KEY_FORM = /^(ui|sys|tut|c)\.[a-z0-9_]+(\.[a-z0-9_]+)+$/;

/** A string literal shaped like a text key (checked by the key overload of t, never text). */
type KeyShaped = `${'ui' | 'sys' | 'tut' | 'c'}.${string}`;
type NotKeyShaped<V> = V extends KeyShaped ? never : V;

function activeOptions(): FormatOptions {
  return {
    table: TABLES[lang] ?? SOURCE_TABLE,
    fallback: SOURCE_TABLE,
    lang,
    content: contentText,
    missing: report,
  };
}

/**
 * Render with the active language. `t('ui.win.quests.empty')` and `t('ui.x.y', { n: 3 })` look
 * a key up (the key is checked against the generated key union at compile time); any other
 * value renders as a text value: a TextRef by its key, raw text as written, other strings and
 * numbers as they are (display names the kernel holds only as text, player words).
 */
export function t<K extends string>(key: TextKeyArg<K>, params?: Record<string, TextParam>): string;
export function t<V extends TextParam | null | undefined>(v: V & NotKeyShaped<V>): string;
export function t(v: TextParam | null | undefined, params?: Record<string, TextParam>): string {
  if (typeof v === 'string' && (params !== undefined || KEY_FORM.test(v))) {
    return formatText({ key: v, params }, activeOptions());
  }
  return formatText(v, activeOptions());
}

/**
 * The text of `key`, or `fallback` when no table has it (no missing-key report): for keys
 * completed from data at run time (`ui.win.battle.formation.${id}`) whose id may be new.
 */
export function tOr<K extends string>(
  key: TextKeyArg<K>,
  fallback: string,
  params?: Record<string, TextParam>,
): string {
  const k = key as string;
  if (!hasText(k)) return fallback;
  return formatText({ key: k, params }, activeOptions());
}

/** True when the active language, the source language or the content table has `key`. */
export function hasText(key: string): boolean {
  if (key.startsWith('c.')) return lookup(key, activeOptions()) !== undefined;
  return key in (TABLES[lang] ?? SOURCE_TABLE) || key in SOURCE_TABLE;
}

/**
 * The list separator `sys.common.join.<sep>` names in the active language (the Chinese
 * comma for 'comma'), for joining already rendered strings; joinText() is the kernel's form.
 */
export function listSeparator(sep: string): string {
  return lookup(`${JOIN_PREFIX}${sep}`, activeOptions()) ?? '';
}

/**
 * The display text of one content field (release_engineering.md 8.3): `tc('items',
 * 'eq_ash_blade', 'name')` reads c.items.eq_ash_blade.name in the active language, then the
 * source language. `table` is the ContentMap name (`npcResidents` or `npc_residents`).
 */
export function tc(table: string, id: string, field: string, index?: number | string): string {
  return formatText({ key: contentKey(table, id, field, index) }, activeOptions());
}

/** Render in the source language whatever the interface language (prompt assembly, D-077). */
export function tSource(v: TextParam | null | undefined): string {
  return formatText(v, {
    table: SOURCE_TABLE,
    lang: SOURCE_LANG,
    content: contentText,
    missing: report,
  });
}

/** Deep copy with every TextRef rendered in the source language (prompt contexts). */
export function renderTextDeep(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(renderTextDeep);
  if (v && typeof v === 'object') {
    if (isTextRef(v)) return tSource(v);
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = renderTextDeep(x);
    return out;
  }
  return v;
}

/** Pure renderer over explicit tables (tests, tools). */
export function formatText(v: TextParam | null | undefined, o: FormatOptions): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (!isTextRef(v)) {
    // malformed data (an object or list where text belongs): show nothing, never throw
    o.missing?.({ kind: 'key', key: '(not text)' });
    return '';
  }
  if ('raw' in v) return v.raw;
  const params = v.params && typeof v.params === 'object' ? v.params : {};
  return formatKey(v.key, params, o);
}

function lookup(key: string, o: FormatOptions): string | undefined {
  if (key.startsWith('c.')) {
    const v = o.content?.(key) ?? GENERATED_CONTENT_TABLE[key];
    return v !== undefined && o.lang === PSEUDO_LANG ? pseudoTemplate(v) : v;
  }
  return o.table[key] ?? o.fallback?.[key];
}

function formatKey(key: string, params: Record<string, TextParam>, o: FormatOptions): string {
  if (key === CLIP_KEY) return formatText(params.text, o).slice(0, Number(params.n));
  const template = lookup(key, o);
  if (template === undefined) {
    o.missing?.({ kind: 'key', key });
    if (key.startsWith(JOIN_PREFIX)) return joinItems('', params, o);
    return key;
  }
  if (key.startsWith(JOIN_PREFIX)) return joinItems(template, params, o);
  return fill(template, key, params, o);
}

function joinItems(sep: string, params: Record<string, TextParam>, o: FormatOptions): string {
  const out: string[] = [];
  for (let i = 0; String(i) in params; i++) out.push(formatText(params[String(i)], o));
  return out.join(sep);
}

const SIMPLE = /^\{\s*(\w+)\s*\}/;
const TYPED = /^\{\s*(\w+)\s*,\s*(number|percent|money|date|duration|ref)\s*(?:,\s*([\w.]+)\s*)?\}/;
const BRANCHED = /^\{\s*(\w+)\s*,\s*(plural|select)\s*,/;

/** Fill a template's placeholders (single pass; substituted text is never re-read). */
function fill(
  template: string,
  key: string,
  params: Record<string, TextParam>,
  o: FormatOptions,
): string {
  let out = '';
  let i = 0;
  while (i < template.length) {
    const brace = template.indexOf('{', i);
    if (brace < 0) {
      out += template.slice(i);
      break;
    }
    out += template.slice(i, brace);
    const rest = template.slice(brace);
    let m = SIMPLE.exec(rest);
    if (m) {
      out += param(m[1] as string, undefined, undefined, m[0], key, params, o);
      i = brace + m[0].length;
      continue;
    }
    m = TYPED.exec(rest);
    if (m) {
      out += param(m[1] as string, m[2], m[3], m[0], key, params, o);
      i = brace + m[0].length;
      continue;
    }
    m = BRANCHED.exec(rest);
    if (m) {
      const end = matchBrace(template, brace);
      if (end > 0) {
        const body = template.slice(brace + m[0].length, end);
        out += branch(
          m[1] as string,
          m[2] as string,
          body,
          template.slice(brace, end + 1),
          key,
          params,
          o,
        );
        i = end + 1;
        continue;
      }
    }
    out += '{';
    i = brace + 1;
  }
  return out;
}

/** Index of the brace closing the one at `open`, or -1. */
function matchBrace(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth === 0) return i;
  }
  return -1;
}

function param(
  name: string,
  type: string | undefined,
  style: string | undefined,
  placeholder: string,
  key: string,
  params: Record<string, TextParam>,
  o: FormatOptions,
): string {
  if (!(name in params) || params[name] === undefined) {
    o.missing?.({ kind: 'param', key, param: name });
    return placeholder;
  }
  const v = params[name] as TextParam;
  if (typeof v === 'number') {
    switch (type) {
      case 'number':
        return new Intl.NumberFormat(o.lang).format(v);
      case 'percent':
        return new Intl.NumberFormat(o.lang, { style: 'percent', maximumFractionDigits: 1 }).format(
          v,
        );
      case 'money':
        return formatMoneyWith(v, o);
      case 'date':
        return formatDateWith(v, style, o);
      case 'duration':
        return formatDurationWith(v, o);
      default:
        return String(v);
    }
  }
  return formatText(v, o);
}

/** Options of a plural or select body: `name {text} name {text} ...`. */
function branches(body: string): Map<string, string> {
  const out = new Map<string, string>();
  let i = 0;
  while (i < body.length) {
    const open = body.indexOf('{', i);
    if (open < 0) break;
    const name = body.slice(i, open).trim();
    const close = matchBrace(body, open);
    if (close < 0) break;
    out.set(name, body.slice(open + 1, close));
    i = close + 1;
  }
  return out;
}

function branch(
  name: string,
  kind: string,
  body: string,
  placeholder: string,
  key: string,
  params: Record<string, TextParam>,
  o: FormatOptions,
): string {
  if (!(name in params)) {
    o.missing?.({ kind: 'param', key, param: name });
    return placeholder;
  }
  const v = params[name] as TextParam;
  const opts = branches(body);
  let pick: string | undefined;
  if (kind === 'plural' && typeof v === 'number') {
    pick =
      opts.get(`=${v}`) ?? opts.get(new Intl.PluralRules(o.lang).select(v)) ?? opts.get('other');
    if (pick !== undefined) pick = pick.replace(/#/g, String(v));
  } else {
    pick = opts.get(String(typeof v === 'object' ? formatText(v, o) : v)) ?? opts.get('other');
  }
  return pick === undefined ? '' : fill(pick, key, params, o);
}

function unit(key: string, n: number, o: FormatOptions): string {
  return fill(lookup(key, o) ?? `{n} ${key}`, key, { n }, o);
}

/** Copper to gold, silver and copper ("1 金 23 银 45 铜"); zero parts are left out. */
function formatMoneyWith(copper: number, o: FormatOptions): string {
  const sign = copper < 0 ? '-' : '';
  let c = Math.abs(Math.round(copper));
  const g = Math.floor(c / 10000);
  c -= g * 10000;
  const s = Math.floor(c / 100);
  c -= s * 100;
  const parts: string[] = [];
  if (g) parts.push(unit('sys.common.money.gold', g, o));
  if (s) parts.push(unit('sys.common.money.silver', s, o));
  if (c || parts.length === 0) parts.push(unit('sys.common.money.copper', c, o));
  return sign + parts.join(lookup('sys.common.money.sep', o) ?? ' ');
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** A game tick as a Sacred Era date in the given style (sys.common.date.<style>). */
function formatDateWith(tick: number, style: string | undefined, o: FormatOptions): string {
  const key = style?.includes('.') ? style : `sys.common.date.${style ?? 'default'}`;
  const template = lookup(key, o);
  if (template === undefined) {
    o.missing?.({ kind: 'key', key });
    return key;
  }
  const cal = calendarAt(tick);
  const season = lookup(`sys.common.season.${cal.season}`, o) ?? String(cal.season);
  return fill(
    template,
    key,
    { year: cal.year, season, day: cal.day, hh: pad2(cal.hour), mm: pad2(cal.minute) },
    o,
  );
}

/** Ticks as whole game days and hours ("2 天 3 小时"). */
function formatDurationWith(ticks: number, o: FormatOptions): string {
  const days = Math.floor(ticks / TICKS_PER_GAME_DAY);
  const hours = Math.floor((ticks - days * TICKS_PER_GAME_DAY) / TICKS_PER_GAME_HOUR);
  const parts: string[] = [];
  if (days) parts.push(unit('sys.common.duration.days', days, o));
  if (hours || parts.length === 0) parts.push(unit('sys.common.duration.hours', hours, o));
  return parts.join(lookup('sys.common.duration.sep', o) ?? ' ');
}

/** Copper amount in the active language ("1 金 23 银 45 铜"). */
export function formatMoney(copper: number): string {
  return formatMoneyWith(copper, {
    table: TABLES[lang] ?? SOURCE_TABLE,
    fallback: SOURCE_TABLE,
    lang,
  });
}

/** True when `v` renders to nothing visible (empty strings and missing values). */
export function isBlankText(v: TextParam | null | undefined): boolean {
  return v === null || v === undefined || v === '';
}
