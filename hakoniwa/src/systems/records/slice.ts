// The records slice: creation, the load-time backfill and the save check
// (release_engineering.md 5.5). Saves written before this system existed carry no
// `records` slice; it is created on first use with its codex filled from what the world
// already shows and a full settle pending, so a loaded run grants the deeds and titles its
// world state already earned (the catalog's retroactive grants, catalog_deeds_titles.md
// 2.11). A slice settled under other records content is re-checked once on load (the
// fingerprint in `content`). Before the compatibility promise (M2) that backfill is the
// slice's migration; the world version does not change.

import type { IdField } from '../../core/save/renames';
import type { World } from '../../core/world';
import { backfillCodex } from './codex';
import { CODEX_TABS, type CodexBook, GRADES, LETTER_STATES, type RecordsSlice } from './types';

export function emptyCodex(): CodexBook {
  return {
    people: {},
    monsters: {},
    creatures: {},
    items: {},
    books: {},
    collections: {},
    memories: {},
  };
}

/** A fresh slice: nothing recorded, a full settle pending. */
export function emptyRecordsSlice(): RecordsSlice {
  return {
    dirty: true,
    deeds: {},
    titles: {},
    worn: null,
    pillar: [],
    codex: emptyCodex(),
    notes: {},
    letters: {},
    mailDue: -1,
    content: '',
  };
}

/**
 * The slice for writing, created on first use (a save from before this system); the codex
 * of such a save starts from what its world already shows (backfillCodex).
 */
export function recordsSlice(world: World): RecordsSlice {
  const w = world as World & { slices: { records?: RecordsSlice } };
  if (!w.slices.records) {
    const s = emptyRecordsSlice();
    backfillCodex(world, s);
    w.slices.records = s;
  }
  return w.slices.records;
}

/** The slice for reading, or undefined when nothing was recorded yet (never creates it). */
export function readRecords(world: World): RecordsSlice | undefined {
  return (world.slices as { records?: RecordsSlice }).records;
}

/** Where the slice keeps content ids, for the rename table (5.5 `idFields`). */
export const RECORDS_ID_FIELDS: readonly IdField[] = [
  { path: 'deeds.@keys', kind: 'deed' },
  { path: 'titles.@keys', kind: 'title' },
  { path: 'titles.*.deed', kind: 'deed' },
  { path: 'worn', kind: 'title' },
  { path: 'pillar.*', kind: 'deed' },
  { path: 'codex.people.@keys', kind: 'npc' },
  { path: 'codex.monsters.@keys', kind: 'monster' },
  { path: 'codex.creatures.@keys', kind: 'creature' },
  { path: 'codex.items.@keys', kind: 'item' },
  { path: 'codex.books.@keys', kind: 'item' },
  { path: 'codex.collections.@keys', kind: 'item' },
  { path: 'codex.memories.@keys', kind: 'scene' },
  { path: 'notes.@keys', kind: 'codex' },
  { path: 'letters.@keys', kind: 'letter' },
  { path: 'xp.settled.@keys', kind: 'xpReward' },
  { path: 'xp.vista.id', kind: 'xpReward' },
  { path: 'xp.vista.mapId', kind: 'map' },
  { path: 'xp.position.mapId', kind: 'map' },
];

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isTick = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const GRADE_SET = new Set<string>(GRADES);
const STATE_SET = new Set<string>(LETTER_STATES);

/**
 * The slice check of a load (5.5): problems found, empty when sound. A missing slice is
 * sound (a save from before this system; it is created on first use).
 */
export function validateRecordsSlice(slice: unknown): string[] {
  if (slice === undefined) return [];
  if (!isObj(slice)) return ['not an object'];
  const out: string[] = [];
  const s = slice as Partial<Record<keyof RecordsSlice, unknown>>;
  if (typeof s.dirty !== 'boolean') out.push('dirty is not a boolean');
  if (!isObj(s.deeds)) out.push('deeds is not an object');
  else {
    for (const [id, r] of Object.entries(s.deeds)) {
      if (!isObj(r) || !isTick(r.tick) || !GRADE_SET.has(r.grade as string))
        out.push(`deed ${id} is not a record`);
    }
  }
  if (!isObj(s.titles)) out.push('titles is not an object');
  else {
    for (const [id, r] of Object.entries(s.titles)) {
      if (
        !isObj(r) ||
        !isTick(r.tick) ||
        (r.lost !== undefined && !isTick(r.lost)) ||
        (r.deed !== undefined && typeof r.deed !== 'string')
      )
        out.push(`title ${id} is not a record`);
    }
  }
  if (s.worn !== null && typeof s.worn !== 'string') out.push('worn is not a title id or null');
  if (!Array.isArray(s.pillar)) out.push('pillar is not an array');
  else if (s.pillar.some((d) => d !== null && typeof d !== 'string'))
    out.push('pillar holds something other than deed ids');
  if (!isObj(s.codex)) out.push('codex is not an object');
  else {
    for (const tab of CODEX_TABS) {
      const book = s.codex[tab];
      if (!isObj(book)) {
        out.push(`codex.${tab} is not an object`);
        continue;
      }
      for (const [id, r] of Object.entries(book)) {
        if (!isObj(r) || !isTick(r.first) || !isTick(r.last) || !isTick(r.count))
          out.push(`codex.${tab} ${id} is not a record`);
      }
    }
  }
  if (!isObj(s.notes)) out.push('notes is not an object');
  else if (Object.values(s.notes).some((t) => !isTick(t))) out.push('notes holds a non-tick');
  if (!isObj(s.letters)) out.push('letters is not an object');
  else {
    for (const [id, r] of Object.entries(s.letters)) {
      if (
        !isObj(r) ||
        !STATE_SET.has(r.state as string) ||
        !isTick(r.sent) ||
        !isTick(r.arrives) ||
        !Array.isArray(r.body) ||
        r.body.some((p) => typeof p !== 'string') ||
        (r.delivered !== undefined && !isTick(r.delivered)) ||
        (r.read !== undefined && !isTick(r.read)) ||
        (r.taken !== undefined && typeof r.taken !== 'boolean') ||
        (r.reply !== undefined && typeof r.reply !== 'string')
      )
        out.push(`letter ${id} is not a record`);
    }
  }
  if (typeof s.mailDue !== 'number' || !Number.isInteger(s.mailDue) || s.mailDue < -1)
    out.push('mailDue is not a tick or -1');
  else if (isObj(s.letters)) {
    // a letter on the road is due no earlier than mailDue says, or it would never arrive
    let due = -1;
    for (const r of Object.values(s.letters)) {
      if (!isObj(r) || r.state !== 'transit' || !isTick(r.arrives)) continue;
      due = due < 0 ? r.arrives : Math.min(due, r.arrives);
    }
    if (due >= 0 && (s.mailDue < 0 || s.mailDue > due))
      out.push('mailDue is later than a letter on the road');
  }
  if (typeof s.worn === 'string' && isObj(s.titles) && !isObj(s.titles[s.worn]))
    out.push('worn is not a held title');
  if (typeof s.content !== 'string') out.push('content is not a fingerprint');
  if (s.xp !== undefined) {
    if (!isObj(s.xp) || !isObj(s.xp.settled)) out.push('xp is not a reward ledger');
    else {
      for (const [id, r] of Object.entries(s.xp.settled)) {
        if (!isObj(r) || !isTick(r.tick) || !isTick(r.amount))
          out.push(`xp ${id} is not a settlement`);
      }
      const v = s.xp.vista;
      if (
        v !== undefined &&
        (!isObj(v) ||
          typeof v.id !== 'string' ||
          !isTick(v.since) ||
          typeof v.mapId !== 'string' ||
          typeof v.x !== 'number' ||
          !Number.isFinite(v.x) ||
          typeof v.y !== 'number' ||
          !Number.isFinite(v.y))
      )
        out.push('xp vista is not a dwell');
      const p = s.xp.position;
      if (
        p !== undefined &&
        (!isObj(p) ||
          typeof p.mapId !== 'string' ||
          typeof p.x !== 'number' ||
          !Number.isFinite(p.x) ||
          typeof p.y !== 'number' ||
          !Number.isFinite(p.y) ||
          typeof p.act !== 'string')
      )
        out.push('xp position is not a position');
    }
  }
  return out;
}
