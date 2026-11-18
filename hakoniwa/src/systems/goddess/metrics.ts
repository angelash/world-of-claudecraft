// The goddesses' visible work per act, read off the miracle ledger (builtin_ai.md 14.2 metric
// 8; catalog_goddess_interventions.md 17.2): metric 8 counts what the built-in brain chose
// itself (her dawn plan and schemes, and the director's coincidences and respites) that the
// player could perceive; the catalog's presence count adds everything else the player saw
// (scripted acts, reactions, the coin's trades). Pure.

import type { GoddessSlice, InterventionOrigin, MiracleEntry } from './types';

/** Origins of the brain's own choices (metric 8 of builtin_ai 14.2). */
export const BRAIN_ORIGINS: readonly InterventionOrigin[] = ['plan', 'scheme', 'director'];

export interface VisibleCount {
  /** metric 8: perceivable acts the brain chose */
  brain: number;
  /** catalog 17.2 presence: every perceivable divine act */
  presence: number;
  /** by origin, perceivable only */
  byOrigin: Partial<Record<InterventionOrigin, number>>;
}

/** Perceivable entries of an act. */
export function visibleEntries(slice: GoddessSlice, act: string): MiracleEntry[] {
  return slice.ledger.filter((e) => e.act === act && e.seen === true);
}

/** Metric 8 and the presence count of one act. */
export function visibleCount(slice: GoddessSlice, act: string): VisibleCount {
  const byOrigin: VisibleCount['byOrigin'] = {};
  let brain = 0;
  let presence = 0;
  for (const e of visibleEntries(slice, act)) {
    presence++;
    const o = e.origin ?? 'command';
    byOrigin[o] = (byOrigin[o] ?? 0) + 1;
    if (BRAIN_ORIGINS.includes(o)) brain++;
  }
  return { brain, presence, byOrigin };
}
