// Content text keys (D-087; release_engineering.md 8.3, ux_and_onboarding.md 20.2):
// c.<table>.<content id>.<field>[.<n>]. The kernel builds them (it holds the table name and
// the record id, never the display text) and the client resolves them against the generated
// content table; the extractor that writes that table uses the same functions
// (src/shared_ui/content_text.ts). Table names are the ContentMap keys in snake_case and ids
// are folded to key form, so one key shape covers every table. Pure, no tables read here.

import type { KeyText, TextParam } from './text';

/** Key prefix of every content key. */
export const CONTENT_PREFIX = 'c.';

/** A ContentMap table name in key form: camelCase to snake_case. */
export function contentTableKey(table: string): string {
  return table.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
}

/** An id or field name in key form: lowercase, anything outside [a-z0-9_] folded to _. */
export function contentKeySegment(s: string): string {
  return s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_');
}

/**
 * The key of one content field: `contentKey('city_buildings', 'granary', 'name')` is
 * `c.city_buildings.granary.name`. `field` may be a dotted path inside the record
 * (`mechanics.yieldSay`), `index` names one entry of a list field (its id or its position).
 */
export function contentKey(
  table: string,
  id: string,
  field: string,
  index?: number | string,
): string {
  const base = `${CONTENT_PREFIX}${contentTableKey(table)}.${contentKeySegment(id)}.${field
    .split('.')
    .map(contentKeySegment)
    .join('.')}`;
  return index === undefined ? base : `${base}.${contentKeySegment(String(index))}`;
}

/** True for a content key (the c. scope). */
export function isContentKey(key: string): boolean {
  return key.startsWith(CONTENT_PREFIX);
}

/**
 * A text reference to one content field: `contentRef('items', 'eq_ash_blade', 'name')` renders
 * as that item's name in the active language (the client resolves it against the generated
 * content table, locales/<lang>/content.generated.json).
 */
export function contentRef(
  table: string,
  id: string,
  field: string,
  index?: number | string,
): KeyText {
  return { key: contentKey(table, id, field, index) };
}

/**
 * The display text of one content record's field as a text reference, for a kernel text
 * parameter: the content key when the record exists and its field is non-empty text; an
 * empty field stays ''; a missing record or a field that is not text gives `fallback`
 * (what the caller showed before, usually the id). Same rendering as `rec?.[field] ??
 * fallback` once the client resolves the key. `field` defaults to `name`.
 */
export function contentText(
  table: string,
  rec: { id: string } | undefined | null,
  fallback: TextParam = '',
  field = 'name',
): TextParam {
  if (!rec) return fallback;
  const v = (rec as unknown as Record<string, unknown>)[field];
  if (typeof v !== 'string') return fallback;
  return v === '' ? '' : contentRef(table, rec.id, field);
}
