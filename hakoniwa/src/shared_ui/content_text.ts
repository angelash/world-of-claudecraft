// Content text extraction (D-087; release_engineering.md 8.3, ux_and_onboarding.md 20.2).
// The display text of data/ stays Chinese source text in the data files; this module turns a
// loaded ContentMap into the flat content table, keyed by src/core/content_key.ts:
// - <table> is the ContentMap table name in snake_case (npcResidents is npc_residents);
// - <id> is the record id (array tables), the entry key (object tables), or the record's
//   index when a table has no ids (terms); ids not in key form (uppercase, dots, hyphens) are
//   folded with contentKeySegment, which the kernel's contentKey() applies too;
// - <field> is the field path in snake_case: nested objects add their property names, list
//   items add their id when every item of the list has a distinct one, else their index.
// Every string holding a CJK character is display text, except the fields of
// NOT_TEXT_FIELDS (match words, tags, conditions, code). Fields the model prompts read but
// the client never shows are marked by isSourceOnlyContentKey: they stay in the table (the
// prompt assembly renders them) but translation export skips them, like sys.*.prompt.* keys.
// Pure, no DOM; tools/i18n/extract_content.ts writes the result to
// locales/zh-Hans/content.generated.json.

import { CONTENT_PREFIX, contentKeySegment, contentTableKey } from '../core/content_key';

export { CONTENT_PREFIX, contentKeySegment, contentTableKey };

/** CJK punctuation, extension A, unified ideographs, compatibility ideographs, full-width forms. */
const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

/** Field names that hold matching words, tags, conditions or code, never display text. */
const NOT_TEXT_FIELDS: ReadonlySet<string> = new Set([
  'keywords',
  'tag',
  'when',
  'derive',
  'term',
  'traits',
  'aliases',
]);

/** Tables that are not content text at all (the variable registry). */
const NOT_TEXT_TABLES: ReadonlySet<string> = new Set(['registry']);

/** Tables without ids whose records are keyed by another field. */
const RECORD_KEY_FIELD: Readonly<Record<string, string>> = { courtDefenses: 'goddess' };

/**
 * Content fields that only the model prompts read (persona and goddess cards, the maker's
 * charter, rulers' personas, schedule notes): source language only, skipped by translation
 * export (release_engineering.md 8.6). Keys: c.<table>.<id>.<first field segment>.
 */
const SOURCE_ONLY_FIELDS: Readonly<Record<string, readonly string[]>> = {
  goddesses: [
    'voice',
    'must_keep',
    'never',
    'public_goal',
    'private_goals',
    'knowledge_by_act',
    'anchors',
  ],
  maker: ['presence', 'charter', 'revelation_rules', 'never', 'room'],
  npcs: ['goals', 'secrets', 'knowledge_notes', 'voice', 'potential'],
  companions: ['personality'],
  npc_schedules: ['segments'],
  npc_knowledge: ['text'],
  slg_nations: ['ruler'],
  slg_config: ['ruler'],
  atlas_maps: ['source', 'note'],
  atlas_regions: ['geo', 'note'],
  atlas_routes: ['note'],
};

/** True for a content key whose text renders only in the source language (prompt material). */
export function isSourceOnlyContentKey(key: string): boolean {
  const parts = key.split('.');
  if (parts[0] !== 'c' || parts.length < 4) return false;
  const fields = SOURCE_ONLY_FIELDS[parts[1] as string];
  return !!fields && fields.includes(parts[3] as string);
}

const hasCjk = (s: string) => CJK.test(s);

/** The id segment of every item of a list, or null when the items are not all distinct ids. */
function listIds(list: readonly unknown[]): string[] | null {
  const ids: string[] = [];
  for (const item of list) {
    const id = (item as { id?: unknown } | null)?.id;
    if (!item || typeof item !== 'object' || typeof id !== 'string' || id === '') return null;
    ids.push(contentKeySegment(id));
  }
  return new Set(ids).size === ids.length ? ids : null;
}

interface WalkOptions {
  /** keep every non-empty string, not only CJK display text (the runtime lookup) */
  allStrings: boolean;
}

function walk(
  value: unknown,
  path: string,
  out: Record<string, string>,
  problems: string[],
  o: WalkOptions,
): void {
  if (typeof value === 'string') {
    if (o.allStrings ? value === '' : !hasCjk(value)) return;
    if (path in out && out[path] !== value) problems.push(`${path}: two texts fold to one key`);
    out[path] = value;
    return;
  }
  if (Array.isArray(value)) {
    const ids = listIds(value);
    value.forEach((item, i) => {
      walk(item, `${path}.${ids ? ids[i] : i}`, out, problems, o);
    });
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'id' || NOT_TEXT_FIELDS.has(k)) continue;
      walk(v, `${path}.${contentKeySegment(k)}`, out, problems, o);
    }
  }
}

export interface ContentTextResult {
  /** c.* key to source text, keys sorted */
  table: Record<string, string>;
  /** fold collisions (two texts on one key), duplicate record keys */
  problems: string[];
  /** ids not in key form, folded: `<table>: <id> -> <segment>` */
  folded: string[];
}

/**
 * Extract the content text table of a ContentMap (tables in sorted order). `allStrings`
 * keeps every non-empty string field (the runtime lookup over live content), not only the
 * CJK display text the generated table holds.
 */
export function extractContentText(
  content: unknown,
  opts: Partial<WalkOptions> = {},
): ContentTextResult {
  const o: WalkOptions = { allStrings: opts.allStrings ?? false };
  const root = (content ?? {}) as Record<string, unknown>;
  const out: Record<string, string> = {};
  const problems: string[] = [];
  const folded: string[] = [];
  for (const table of Object.keys(root).sort()) {
    if (NOT_TEXT_TABLES.has(table)) continue;
    const value = root[table];
    const prefix = `${CONTENT_PREFIX}${contentTableKey(table)}`;
    const records: [string, unknown][] = [];
    if (Array.isArray(value)) {
      const keyField = RECORD_KEY_FIELD[table] ?? 'id';
      value.forEach((rec, i) => {
        const id = (rec as Record<string, unknown> | null)?.[keyField];
        records.push([typeof id === 'string' && id !== '' ? id : String(i), rec]);
      });
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) records.push([k, v]);
    } else continue;
    const seen = new Set<string>();
    for (const [id, rec] of records) {
      const seg = contentKeySegment(id);
      if (seg !== id) folded.push(`${table}: ${id} -> ${seg}`);
      if (seen.has(seg)) {
        problems.push(`${prefix}.${seg}: duplicate record key`);
        continue;
      }
      seen.add(seg);
      walk(rec, `${prefix}.${seg}`, out, problems, o);
    }
  }
  const table: Record<string, string> = {};
  for (const k of Object.keys(out).sort()) table[k] = out[k] as string;
  return { table, problems, folded };
}
