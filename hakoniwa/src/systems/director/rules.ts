// The director's rule table (builtin_ai.md 13.2): data rows (data/goddess/director_rules.json)
// read with firstMatch every game hour, whose `cond` joins the predicates below. The table
// decides when the director moves and which kind of move; the menu (./menu.ts) and the
// deliveries (./deliveries.ts) decide what lands. The director never reads Moira's private
// goals, archive or bargains (13.4, D-035): only the meter, the menu, the ledger of entries
// it may hand over, the written coincidences due, and where the player stands.

import { type RuleRow, ruleProblems } from '../../core/brain/rules';
import { checkCondition } from '../quests/conditions';

/** Predicates a rule row's `cond` may join (with AND, `!` negates). */
export const DIRECTOR_PREDICATES = [
  'due_delivery',
  'player_busy',
  'beat_due',
  'high_long',
  'respite_cool',
  'low_long',
  'coincidence_cool',
  'coincidence_free',
  'open_delivery',
  'reveal_gap',
  'events_eligible',
  'comedy_repeat',
] as const;
export type DirectorPredicate = (typeof DIRECTOR_PREDICATES)[number];

/** Moves a rule row's `then` may name. */
export const DIRECTOR_ACTIONS = ['deliver', 'hold', 'beat', 'open', 'event', 'background'] as const;
export type DirectorAction = (typeof DIRECTOR_ACTIONS)[number];

export interface DirectorRuleRow extends RuleRow {
  cond?: string;
}

/** Evaluate a `cond` with a predicate lookup. */
export function condHolds(cond: string | undefined, has: (p: DirectorPredicate) => boolean) {
  const c = (cond ?? '').trim();
  if (!c) return true;
  return c.split(/\s+AND\s+/).every((part) => {
    const neg = part.startsWith('!');
    const name = (neg ? part.slice(1) : part) as DirectorPredicate;
    return neg ? !has(name) : has(name);
  });
}

/** Load-time problems of the rule table. */
export function directorRuleProblems(rows: readonly DirectorRuleRow[]): string[] {
  const out = ruleProblems(
    rows.map((r) => ({ ...r, when: r.when ?? '' })),
    (w) => checkCondition(w),
  );
  for (const r of rows) {
    for (const part of (r.cond ?? '').split(/\s+AND\s+/).filter((x) => x.trim() !== '')) {
      const name = part.startsWith('!') ? part.slice(1) : part;
      if (!(DIRECTOR_PREDICATES as readonly string[]).includes(name))
        out.push(`director rule ${r.id}: unknown predicate ${name}`);
    }
    for (const t of r.then)
      if (!(DIRECTOR_ACTIONS as readonly string[]).includes(t.action))
        out.push(`director rule ${r.id}: unknown move ${t.action}`);
  }
  return out;
}
