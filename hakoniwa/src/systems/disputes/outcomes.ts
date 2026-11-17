// Outcome selection of a dispute (act1_borderstone.md 4: "the result cell is settled by the
// kernel by conditions"), pure: the primary ending is the first non-stacking row whose
// condition holds, else the default row, so a chain always reaches a legal ending; the
// stacking rows whose conditions hold apply on top. `by` is `player` when any applied row
// was the player's doing.

import type { DisputeDef, EndingBy, OutcomeDef } from './types';

export interface OutcomeSelection {
  primary: OutcomeDef;
  stacked: OutcomeDef[];
  /** the ending code (the primary row's `ending`, or its id) */
  ending: string;
  by: EndingBy;
}

/** The ending code of an outcome row. */
export function endingCode(o: OutcomeDef): string {
  return o.ending ?? o.id;
}

/** The outcome rows that hold now (null only for a dispute without a default row). */
export function selectOutcomes(
  def: DisputeDef,
  holds: (when: string) => boolean,
): OutcomeSelection | null {
  const primary =
    def.outcomes.find((o) => !o.stack && !o.default && !!o.when && holds(o.when)) ??
    def.outcomes.find((o) => o.default);
  if (!primary) return null;
  const stacked = def.outcomes.filter((o) => o.stack && (!o.when || holds(o.when)));
  const by: EndingBy =
    primary.by === 'player' || stacked.some((o) => o.by === 'player') ? 'player' : 'world';
  return { primary, stacked, ending: endingCode(primary), by };
}

/** Every ending code a dispute can settle on (its legal endings). */
export function legalEndings(def: DisputeDef): string[] {
  return [...new Set(def.outcomes.filter((o) => !o.stack).map(endingCode))];
}
