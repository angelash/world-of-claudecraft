// Earliest visible act of every content row (release_engineering.md 7.4 V5: player
// text is judged at the earliest act it can be seen). A row's own act comes from its
// `act` field (quests, scenes, battle scenarios), an act row's own id, a map's
// `storyActs`, or an atlas row's `acts`; a row without one inherits the earliest act of
// the rows that reference it (src/content/references.ts), so a monster is visible from
// the first act its map or wave is, and an item from the first quest, scene or loot
// table that hands it out. Tables that belong to one act by definition (the act 6
// evidence and court defenses, the epilogue records) carry that act. Rows nothing reaches
// are visible from the first act of play: the prologue shows only its own scenes and what
// they reference. Pure.

import { collectRefs, REF_PATHS, type RefPath } from '../../../src/content/references';
import type { ContentMap } from '../../../src/core/contracts';
import { actIndex } from '../../../src/systems/quests/conditions';

/** Act index of the prologue (p_ variables) and the epilogue (ep_), as in the registry. */
export const PROLOGUE = 0;
export const EPILOGUE = 7;
/** Act of rows nothing reaches: the first act of play. */
export const FIRST_PLAY_ACT = 1;

/** Tables whose every row belongs to one act. */
export const TABLE_ACTS: Readonly<Record<string, number>> = {
  evidence: 6,
  courtDefenses: 6,
  epilogue: EPILOGUE,
};

const key = (table: string, row: string) => `${table}\n${row}`;

function asAct(v: unknown): number | null {
  if (typeof v === 'number' && Number.isInteger(v)) return v;
  if (typeof v === 'string') {
    const n = actIndex(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function minAct(list: unknown): number | null {
  if (!Array.isArray(list)) return null;
  let best: number | null = null;
  for (const v of list) {
    const a = asAct(v);
    if (a !== null && (best === null || a < best)) best = a;
  }
  return best;
}

/** The act a row declares itself, or null. */
export function ownAct(table: string, row: unknown): number | null {
  if (!row || typeof row !== 'object') return null;
  const o = row as Record<string, unknown>;
  if (table === 'acts') return asAct(o.id);
  if (TABLE_ACTS[table] !== undefined) return TABLE_ACTS[table] as number;
  return asAct(o.act) ?? minAct(o.storyActs) ?? minAct(o.acts);
}

export interface ActIndex {
  /** earliest act of a row (falls back to the first act of play) */
  of(table: string, row: string): number;
  /** whether the act came from the row itself or a referrer (false: the fallback) */
  known(table: string, row: string): boolean;
}

export function earliestActs(content: ContentMap, paths: readonly RefPath[] = REF_PATHS): ActIndex {
  const tables = content as unknown as Record<string, unknown>;
  const acts = new Map<string, number>();
  for (const [table, value] of Object.entries(tables)) {
    if (!Array.isArray(value)) continue;
    for (const r of value) {
      const id = (r as { id?: unknown } | null)?.id;
      if (typeof id !== 'string') continue;
      const a = ownAct(table, r);
      if (a !== null) acts.set(key(table, id), a);
    }
  }
  // which targets each row points at (a value names a row of every target table holding it)
  const ids = new Map<string, Set<string>>();
  for (const [table, value] of Object.entries(tables)) {
    if (!Array.isArray(value)) continue;
    ids.set(
      table,
      new Set(
        value
          .map((r) => (r as { id?: unknown } | null)?.id)
          .filter((x): x is string => typeof x === 'string'),
      ),
    );
  }
  const edges = new Map<string, string[]>();
  for (const u of collectRefs(content, paths)) {
    if (!u.row) continue;
    for (const t of u.to) {
      if (!ids.get(t)?.has(u.value)) continue;
      const from = key(u.table, u.row);
      const list = edges.get(from) ?? [];
      list.push(key(t, u.value));
      edges.set(from, list);
    }
  }
  // relax: a target is visible no later than any row that references it (and has its own act)
  const own = new Set(acts.keys());
  let changed = true;
  for (let guard = 0; changed && guard < 64; guard++) {
    changed = false;
    for (const [from, targets] of edges) {
      const a = acts.get(from);
      if (a === undefined) continue;
      for (const t of targets) {
        if (own.has(t)) continue;
        const cur = acts.get(t);
        if (cur === undefined || a < cur) {
          acts.set(t, a);
          changed = true;
        }
      }
    }
  }
  return {
    of: (table, row) => acts.get(key(table, row)) ?? TABLE_ACTS[table] ?? FIRST_PLAY_ACT,
    known: (table, row) => acts.has(key(table, row)),
  };
}
