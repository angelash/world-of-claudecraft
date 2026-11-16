// V8 text, line packs (builtin_ai.md 7.10; catalog_dialogue_lines.md 2.2, 2.4 and 2.6): the
// content checks of every line pack. Errors: a pack id outside ln_ or bark_; a slot name
// outside the grammar of 7.2 (a goddess pack may add her own react kinds); versions on a
// slot that is not a topic, or a version outside its closed set; party slots outside
// ln_party; an unknown act override; a line field outside when, mood, place, strict, first,
// w, or a value outside its closed set; an empty line (a deleted line is a null hole, 7.1);
// a fill slot outside 7.9, or a placeholder that is no fill slot; a line over its family's
// length limit; the technical word for the grey taint in a shared layer (ln_common,
// ln_role_, ln_class_, ln_tpl_, bark_ pools say the folk terms, 2.4); a forbidden
// character (when no data file scan runs). Warning: the same source text in three or more
// packs (7.10). The registry (V4) checks the `when` conditions and the ledger (V5) runs the
// leak scan over the line text fields of ./player_text.ts. Not checked yet, because their
// data does not exist yet: topic registration and quest ids (data/dialogue/topics.json),
// the per-speaker coverage and minimum counts of 7.8, the misdirection table, catchphrase
// density.

import { findForbidden } from '../../../src/editor/checks/rules';
import {
  FILL_SLOTS,
  fillSlotsOf,
  isActId,
  type LineList,
  type LinePack,
  lengthLimit,
  MOODS,
  PLACE_KINDS,
  slotPackProblem,
  slotProblem,
  type VersionedLines,
  versionedFamily,
  versionProblem,
} from '../../../src/systems/dialogue/lines';
import type { Finding, ValidationInput } from './types';

const ENTRY_FIELDS: ReadonlySet<string> = new Set([
  'zh',
  'when',
  'mood',
  'place',
  'strict',
  'first',
  'w',
]);
const PACK_FIELDS: ReadonlySet<string> = new Set(['id', 'speaker', 'slots', 'acts']);
const PACK_ID = /^(ln|bark)_[a-z0-9_]+$/;
/** The same source text in this many packs or more is a warning (7.10). */
export const SAME_TEXT_PACKS = 3;
/** Shared layers say the folk terms only (catalog 2.4). */
const SHARED_PACK = /^(ln_common$|ln_role_|ln_class_|ln_tpl_|bark_)/;
/** The technical word for the grey taint (U+6FB1), never in a shared layer. */
const TECH_TERM = String.fromCodePoint(0x6fb1);

const hex = (c: number) => `U+${c.toString(16).toUpperCase().padStart(4, '0')}`;

interface LineAt {
  pack: string;
  /** path inside the pack, e.g. slots.greet.cold[2] or acts.act2.topic.gen_you.doubt[0] */
  path: string;
  slot: string;
  line: unknown;
}

function err(pack: string, path: string, message: string): Finding {
  return {
    level: 'error',
    table: 'linePacks',
    row: pack,
    path,
    message: `linePacks:${pack} ${path}: ${message}`,
  };
}

/** Every line of a pack with its slot and path (versioned slots expanded, holes skipped). */
function linesOf(pack: LinePack, extraReact: ReadonlySet<string>, out: Finding[]): LineAt[] {
  const res: LineAt[] = [];
  const push = (list: unknown[], at: string, slot: string, what: string) => {
    if (list.every((x) => x === null)) out.push(err(pack.id, at, `${what} has no lines`));
    list.forEach((line, i) => {
      if (line !== null) res.push({ pack: pack.id, path: `${at}[${i}]`, slot, line });
    });
  };
  const walkSlots = (
    slots: Record<string, LineList | VersionedLines> | undefined,
    base: string,
  ) => {
    if (slots === undefined) return;
    if (!slots || typeof slots !== 'object' || Array.isArray(slots)) {
      out.push(err(pack.id, base, 'slots must be an object of slot name to lines'));
      return;
    }
    for (const [slot, entry] of Object.entries(slots)) {
      const at = `${base}.${slot}`;
      const bad = slotProblem(slot, extraReact) ?? slotPackProblem(slot, pack.id);
      if (bad) out.push(err(pack.id, at, `slot ${slot}: ${bad}`));
      if (Array.isArray(entry)) push(entry, at, slot, `slot ${slot}`);
      else if (entry && typeof entry === 'object') {
        if (!versionedFamily(slot))
          out.push(err(pack.id, at, `slot ${slot}: only topic slots are split into versions`));
        for (const [version, list] of Object.entries(entry)) {
          const vat = `${at}.${version}`;
          const vbad = versionProblem(slot, version);
          if (vbad) out.push(err(pack.id, vat, vbad));
          if (!Array.isArray(list)) {
            out.push(err(pack.id, vat, `version ${version} of ${slot} must be a list`));
            continue;
          }
          push(list, vat, slot, `version ${version} of ${slot}`);
        }
      } else out.push(err(pack.id, at, `slot ${slot} must hold a list or versioned lists`));
    }
  };
  walkSlots(pack.slots, 'slots');
  for (const [act, slots] of Object.entries(pack.acts ?? {})) {
    if (!isActId(act)) out.push(err(pack.id, `acts.${act}`, `unknown act ${act}`));
    walkSlots(slots, `acts.${act}`);
  }
  return res;
}

/** Problems of one line (fields, values, text, fill slots, length, terms, characters). */
function oneLine(l: LineAt, forbidden: boolean): Finding[] {
  const out: Finding[] = [];
  const e = (m: string) => err(l.pack, l.path, m);
  let text: unknown = l.line;
  if (l.line && typeof l.line === 'object' && !Array.isArray(l.line)) {
    const o = l.line as Record<string, unknown>;
    for (const k of Object.keys(o))
      if (!ENTRY_FIELDS.has(k)) out.push(e(`unknown line field ${k}`));
    text = o.zh;
    if (o.when !== undefined && (typeof o.when !== 'string' || o.when.trim() === ''))
      out.push(e('when must be a non-empty condition'));
    if (o.mood !== undefined) {
      if (!Array.isArray(o.mood) || o.mood.length === 0)
        out.push(e('mood must be a non-empty list'));
      else
        for (const m of o.mood)
          if (!(MOODS as readonly unknown[]).includes(m))
            out.push(e(`mood ${String(m)} is not one of ${MOODS.join(', ')}`));
    }
    if (o.place !== undefined) {
      if (!Array.isArray(o.place) || o.place.length === 0)
        out.push(e('place must be a non-empty list'));
      else
        for (const p of o.place)
          if (!(PLACE_KINDS as readonly unknown[]).includes(p))
            out.push(e(`place ${String(p)} is not a place kind`));
    }
    if (o.strict !== undefined && typeof o.strict !== 'boolean')
      out.push(e('strict must be true or false'));
    if (o.strict === true && o.mood === undefined && o.place === undefined)
      out.push(e('strict without mood or place'));
    if (o.first !== undefined && typeof o.first !== 'boolean')
      out.push(e('first must be true or false'));
    if (o.w !== undefined && !(typeof o.w === 'number' && o.w > 0))
      out.push(e('w must be a positive number'));
  }
  if (typeof text !== 'string') {
    out.push(e('a line is a string or an object with zh'));
    return out;
  }
  if (text.trim() === '') {
    out.push(e('empty line (a deleted line is null)'));
    return out;
  }
  for (const s of fillSlotsOf(text))
    if (!FILL_SLOTS.has(s)) out.push(e(`fill slot {${s}} is not one of builtin_ai 7.9`));
  for (const m of text.matchAll(/\{([^{}]*)\}/g))
    if (!/^[a-z_]+$/.test(m[1] as string))
      out.push(e(`placeholder {${m[1]}} is not a fill slot (a lowercase name only)`));
  const len = [...text.replace(/\{[a-z_]+\}/g, '')].length;
  const limit = lengthLimit(l.slot);
  if (len > limit)
    out.push(e(`${len} characters, over the ${l.slot.split('.')[0]} limit ${limit}`));
  if (SHARED_PACK.test(l.pack) && text.includes(TECH_TERM))
    out.push(e('a shared layer says the folk terms only (catalog 2.4)'));
  if (forbidden)
    for (const hit of findForbidden(text)) out.push(e(`forbidden character ${hex(hit.codePoint)}`));
  return out;
}

export interface LinePackOptions {
  /** speakers whose packs may add their own reaction kinds (the goddesses, builtin_ai 7.5) */
  goddesses?: ReadonlySet<string>;
  /** scan forbidden characters here (default true; V8 turns it off when its file scan runs) */
  forbidden?: boolean;
}

/** Findings of a set of line packs (the rules in the header). */
export function linePackFindings(
  packs: readonly LinePack[],
  opts: LinePackOptions = {},
): Finding[] {
  const out: Finding[] = [];
  const textPacks = new Map<string, Set<string>>();
  for (const pack of packs) {
    if (typeof pack.id !== 'string' || !PACK_ID.test(pack.id)) {
      out.push(err(String(pack.id), '', 'a line pack id is ln_<name> or bark_<pool>'));
      continue;
    }
    for (const k of Object.keys(pack))
      if (!PACK_FIELDS.has(k)) out.push(err(pack.id, k, `unknown pack field ${k}`));
    if (pack.slots === undefined) out.push(err(pack.id, 'slots', 'a pack needs slots'));
    // a goddess's own pack may register her reaction kinds (react.<kind> of her catalog)
    const own = new Set<string>();
    if (pack.speaker && opts.goddesses?.has(pack.speaker))
      for (const s of [
        ...Object.keys(pack.slots ?? {}),
        ...Object.values(pack.acts ?? {}).flatMap((a) => Object.keys(a)),
      ])
        if (/^react\.[a-z0-9_]+$/.test(s)) own.add(s.slice(6));
    for (const l of linesOf(pack, own, out)) {
      out.push(...oneLine(l, opts.forbidden ?? true));
      const text = typeof l.line === 'string' ? l.line : (l.line as { zh?: unknown } | null)?.zh;
      if (typeof text === 'string' && text.trim() !== '') {
        let set = textPacks.get(text);
        if (!set) {
          set = new Set();
          textPacks.set(text, set);
        }
        set.add(pack.id);
      }
    }
  }
  for (const [text, set] of textPacks)
    if (set.size >= SAME_TEXT_PACKS)
      out.push({
        level: 'warning',
        table: 'linePacks',
        message: `the line "${text}" is in ${set.size} packs (${[...set].sort().join(', ')})`,
      });
  return out;
}

/** The line pack findings of a validation input (part of V8). */
export function linesFindings(input: Pick<ValidationInput, 'content' | 'files'>): Finding[] {
  const goddesses = new Set((input.content.goddesses ?? []).map((g) => g.id));
  return linePackFindings(input.content.linePacks ?? [], {
    goddesses,
    forbidden: input.files.size === 0,
  });
}
