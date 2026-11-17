// Entity extraction (builtin_ai.md 6.3 steps 3, 4 and 6): longest match against one table
// built from the content (persona and companion names with their short forms, goddess
// names and honorifics, map and location names, items, monsters) and the lexicon's generic
// words per kind (lore, events, factions, earth things, generic places and goods); hidden
// goddess names count as the forbidden name until their reveal flag holds; unknown proper
// names come from quotes, naming frames and place endings. The clause is then masked: each
// entity becomes one private-use character, so keywords never match inside a name and
// patterns can ask for an entity slot. Reads content records by their fields, never by id.
// Pure (the caller passes a flag reader).

import type { ContentMap } from '../../../core/contracts';
import { normalizeInput } from './normalize';
import type { EntityHit, EntityKind, IntentLexicon } from './types';

/** First private-use code point of the entity mask. */
export const MASK_BASE = 0xe000;

interface Surface {
  text: string;
  kind: EntityKind;
  id: string;
  source: string;
  /** goddess names that are the forbidden word while this flag is unset */
  hiddenUntil?: string;
}

interface EntityTable {
  /** first character to the surfaces starting with it, longest first */
  byFirst: Map<string, Surface[]>;
}

type NameRecord = { id?: unknown; name?: unknown };
type ContentLike = Partial<
  Pick<ContentMap, 'npcs' | 'goddesses' | 'maps' | 'items' | 'monsters' | 'companions'>
>;

const tables = new WeakMap<object, WeakMap<IntentLexicon, EntityTable>>();

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

/** Short forms of a content name: split at the joiner, then title prefixes and suffixes off. */
export function nameForms(name: string, lex: IntentLexicon): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    if (Array.from(s).length >= 2) out.add(s);
  };
  add(name);
  const parts = lex.affixes.joiner ? name.split(lex.affixes.joiner) : [name];
  if (parts.length > 1) for (const p of parts) add(p);
  for (const base of [...out]) {
    for (const pre of lex.affixes.prefix) if (base.startsWith(pre)) add(base.slice(pre.length));
    for (const suf of lex.affixes.suffix)
      if (base.endsWith(suf)) add(base.slice(0, base.length - suf.length));
  }
  return [...out];
}

function buildTable(content: ContentLike, lex: IntentLexicon): EntityTable {
  const surfaces: Surface[] = [];
  const norm = (s: string) => normalizeInput(s, lex).replace(/\s/g, '');
  const push = (text: string, kind: EntityKind, id: string, source: string, hidden?: string) => {
    const t = norm(text);
    if (Array.from(t).length < 2 && source === 'content') return;
    if (t) surfaces.push({ text: t, kind, id, source, hiddenUntil: hidden });
  };
  const people = [...(content.npcs ?? []), ...(content.companions ?? [])] as NameRecord[];
  for (const p of people) {
    const id = str(p.id);
    for (const form of nameForms(str(p.name), lex)) push(form, 'person', id, 'content');
  }
  for (const g of content.goddesses ?? []) {
    const hidden = g.hiddenName && g.revealWhen ? g.revealWhen : undefined;
    for (const n of [g.name, g.fullName, g.title]) {
      for (const form of nameForms(str(n), lex)) push(form, 'goddess', g.id, 'content', hidden);
    }
    if (g.honorific) push(g.honorific, 'honorific', g.id, 'content', hidden);
  }
  for (const m of content.maps ?? []) {
    push(str(m.name), 'place', m.id, 'content');
    for (const l of m.locations ?? []) push(str(l.name), 'place', `${m.id}/${l.id}`, 'content');
  }
  for (const it of (content.items ?? []) as NameRecord[])
    push(str(it.name), 'item', str(it.id), 'content');
  for (const mo of (content.monsters ?? []) as NameRecord[])
    push(str(mo.name), 'monster', str(mo.id), 'content');
  for (const [list, words] of Object.entries(lex.entities)) {
    const kind = (list === 'earth_refuse' ? 'earth' : list) as EntityKind;
    for (const w of words ?? []) push(w, kind, w, list);
  }
  const byFirst = new Map<string, Surface[]>();
  for (const s of surfaces) {
    const first = Array.from(s.text)[0] as string;
    let list = byFirst.get(first);
    if (!list) {
      list = [];
      byFirst.set(first, list);
    }
    list.push(s);
  }
  // longest first; at equal length a content name before a generic word, then the
  // earlier record (stable sort keeps the table order)
  for (const list of byFirst.values())
    list.sort(
      (a, b) =>
        b.text.length - a.text.length ||
        Number(a.source !== 'content') - Number(b.source !== 'content'),
    );
  return { byFirst };
}

/** The cached entity table of a content map and lexicon. */
export function entityTable(content: ContentLike, lex: IntentLexicon): EntityTable {
  let byLex = tables.get(content);
  if (!byLex) {
    byLex = new WeakMap();
    tables.set(content, byLex);
  }
  let t = byLex.get(lex);
  if (!t) {
    t = buildTable(content, lex);
    byLex.set(lex, t);
  }
  return t;
}

function truthy(v: unknown): boolean {
  return v !== undefined && v !== null && v !== false && v !== 0 && v !== '' && v !== 'false';
}

/** Unknown proper names (6.3 step 4): quoted words, naming frames, place endings. */
function unknownNames(text: string, taken: boolean[], lex: IntentLexicon): EntityHit[] {
  const out: EntityHit[] = [];
  const free = (a: number, b: number) => {
    for (let i = a; i < b; i++) if (taken[i]) return false;
    return true;
  };
  const add = (a: number, b: number) => {
    if (b - a < 2 || b - a > 8 || !free(a, b)) return;
    const word = text.slice(a, b);
    if (/[.,!?;:\s]/.test(word)) return;
    out.push({ kind: 'unknown_name', id: word, text: word, source: 'unknown', start: a, end: b });
    for (let i = a; i < b; i++) taken[i] = true;
  };
  // quoted words
  for (const m of text.matchAll(/"([^"]{2,8})"/g)) {
    const a = (m.index ?? 0) + 1;
    add(a, a + (m[1] as string).length);
  }
  // naming frames: before X after (叫X的)
  for (const before of lex.unknown.before) {
    let at = text.indexOf(before);
    while (at >= 0) {
      const a = at + before.length;
      for (const after of lex.unknown.after) {
        const b = text.indexOf(after, a + 2);
        if (b > a && b - a <= 6) {
          add(a, b);
          break;
        }
      }
      at = text.indexOf(before, at + 1);
    }
  }
  // place endings: two or three free CJK characters before an ending character
  for (const end of lex.unknown.endings) {
    let at = text.indexOf(end);
    while (at >= 0) {
      if (!taken[at]) {
        let a = at;
        while (
          a > 0 &&
          at - a < 3 &&
          !taken[a - 1] &&
          /[\u4e00-\u9fff]/.test(text[a - 1] as string)
        )
          a--;
        if (at - a >= 1) add(a, at + end.length);
      }
      at = text.indexOf(end, at + 1);
    }
  }
  return out;
}

/**
 * Entities of a normalized clause, by position: the longest table match wins at each
 * position, then unknown names fill the gaps. Hidden goddess names become `forbidden`
 * while their reveal flag is unset.
 */
export function extractEntities(
  text: string,
  table: EntityTable,
  lex: IntentLexicon,
  flag: (key: string) => unknown = () => undefined,
): EntityHit[] {
  const out: EntityHit[] = [];
  const taken: boolean[] = new Array(text.length).fill(false);
  let i = 0;
  while (i < text.length) {
    const list = table.byFirst.get(text[i] as string);
    const hit = list?.find((s) => text.startsWith(s.text, i));
    if (!hit) {
      i++;
      continue;
    }
    let kind = hit.kind;
    if (hit.hiddenUntil && !truthy(flag(hit.hiddenUntil))) kind = 'forbidden';
    out.push({
      kind,
      id: hit.id,
      text: hit.text,
      source: hit.source,
      start: i,
      end: i + hit.text.length,
    });
    for (let k = i; k < i + hit.text.length; k++) taken[k] = true;
    i += hit.text.length;
  }
  out.push(...unknownNames(text, taken, lex));
  return out.sort((a, b) => a.start - b.start);
}

/** The clause with every entity replaced by one mask character (MASK_BASE + entity index). */
export function maskEntities(text: string, entities: readonly EntityHit[]): string {
  let out = '';
  let at = 0;
  entities.forEach((e, n) => {
    out += text.slice(at, e.start) + String.fromCharCode(MASK_BASE + n);
    at = e.end;
  });
  return out + text.slice(at);
}

/** The entity behind a mask character, or undefined for an ordinary character. */
export function maskedEntity(ch: string, entities: readonly EntityHit[]): EntityHit | undefined {
  const c = ch.charCodeAt(0) - MASK_BASE;
  return c >= 0 && c < entities.length ? entities[c] : undefined;
}

/** Pronoun reference (6.3 step 6): the last entity, when the clause uses a pronoun of its kind. */
export function pronounEntity(
  text: string,
  lex: IntentLexicon,
  last: EntityHit | undefined,
): EntityHit | undefined {
  if (!last) return undefined;
  const words = lex.pronouns[last.kind] ?? lex.pronouns.any ?? [];
  return words.some((w) => text.includes(w)) ? { ...last, start: -1, end: -1 } : undefined;
}
