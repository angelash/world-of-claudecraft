// The rule-coverage report of the built-in AI's rule tables (builtin_ai.md 15 and 19 step 9;
// catalog_goddess_interventions.md 17.1 rule 7): every row of the goddesses' reaction table
// and of the director's rule table, whether it ever fired in this world, and for a row that
// cannot fire at all the static reason (an event the kernel never raises, a predicate or a
// goddess that does not exist). A dead row is a static failure; an unfired row is only a
// gap of the run that produced the world. Pure.

import type { ContentMap } from '../../core/contracts';
import { knownPredicate, REACT_EVENTS, type ReactRow } from '../goddess/brain/reactions';
import type { GoddessSlice } from '../goddess/types';
import type { DirectorSlice } from './index';
import { DIRECTOR_PREDICATES, type DirectorRuleRow } from './rules';

export interface CoverageRow {
  table: 'goddessReactions' | 'directorRules';
  row: string;
  fired: boolean;
  /** why the row can never fire ('' when it can) */
  dead: string;
}

type CoverageWorld = {
  slices: { goddess?: GoddessSlice; director?: DirectorSlice };
};

function predicatesOf(cond: string | undefined): string[] {
  return (cond ?? '')
    .split(/\s+AND\s+/)
    .filter((x) => x.trim() !== '')
    .map((x) => (x.startsWith('!') ? x.slice(1) : x));
}

/** The coverage of both rule tables in one world. */
export function ruleCoverage(
  world: CoverageWorld,
  content: Pick<ContentMap, 'goddesses'> & {
    goddessReactions?: ReactRow[];
    directorRules?: DirectorRuleRow[];
  },
): CoverageRow[] {
  const out: CoverageRow[] = [];
  const brains = world.slices.goddess?.brains ?? {};
  for (const r of content.goddessReactions ?? []) {
    let dead = '';
    if (!(REACT_EVENTS as readonly string[]).includes(r.event)) dead = `event ${r.event}`;
    else if (r.goddess !== '*' && !content.goddesses.some((g) => g.id === r.goddess))
      dead = `goddess ${r.goddess}`;
    else for (const p of predicatesOf(r.cond)) if (!knownPredicate(p)) dead = `predicate ${p}`;
    out.push({
      table: 'goddessReactions',
      row: r.id,
      fired: Object.values(brains).some((b) => b.react.lastTick[r.id] !== undefined),
      dead,
    });
  }
  const mem = world.slices.director?.rules;
  for (const r of content.directorRules ?? []) {
    let dead = '';
    for (const p of predicatesOf(r.cond))
      if (!(DIRECTOR_PREDICATES as readonly string[]).includes(p)) dead = `predicate ${p}`;
    out.push({
      table: 'directorRules',
      row: r.id,
      fired: mem?.lastTick[r.id] !== undefined,
      dead,
    });
  }
  return out;
}
