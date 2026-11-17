// The decision utility of dispute decision points (builtin_ai.md 5.8), pure:
//
//   score = stance x 0.35 + relation x 0.25 + safety x 0.20 + values x 0.15
//           - 100 when the option breaks a must-keep rule
//
// Each input is read as 0..1 from the option's data terms (a base plus the adjustments
// whose conditions hold) and the winner is picked with the shared primitive pickBest
// (ties by id, a weighted draw inside the band from the dispute's named stream). This is
// the rule fallback; the NPC brain (PK-M1-18) scores the same menu with persona-derived
// inputs through decisionUtility and answers with disputes.decide before the deadline.

import { type BrainTrace, traceOfPick } from '../../core/brain/trace';
import {
  LIFE_BAND,
  type PickResult,
  pickBest,
  type ScoredAction,
  type ScoredTerm,
} from '../../core/brain/utility';
import type { Rng } from '../../core/rng';
import type { DecisionOptionDef, DecisionPointDef, OptionTerms, TermDef } from './types';

/** The weights of builtin_ai.md 5.8. */
export const DECISION_WEIGHTS: Readonly<Record<keyof OptionTerms, number>> = {
  stance: 0.35,
  relation: 0.25,
  safety: 0.2,
  values: 0.15,
};

/** Input names in formula order. */
export const TERM_NAMES: readonly (keyof OptionTerms)[] = [
  'stance',
  'relation',
  'safety',
  'values',
];

/** The cost of breaking a must-keep rule. */
export const MUST_KEEP_PENALTY = 100;

/** Game hours from a decision point's opening to its deadline when the data names none. */
export const DEFAULT_DECISION_HOURS = 6;

/** The decision kind of the traces (builtin_ai.md 2.6). */
export const DECISION_TRACE_KIND = 'dispute.decision';

/** Evaluated inputs of one option. */
export interface OptionInputs {
  stance: number;
  relation: number;
  safety: number;
  values: number;
  /** breaks a must-keep rule */
  breaks: boolean;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/** One input as 0..1, given a condition test. */
export function termValue(t: TermDef, holds: (when: string) => boolean): number {
  if (typeof t === 'number') return clamp01(t);
  let v = t.base;
  for (const a of t.add ?? []) if (holds(a.when)) v += a.value;
  return clamp01(v);
}

/** The inputs of an option from its data terms. */
export function optionInputs(o: DecisionOptionDef, holds: (when: string) => boolean): OptionInputs {
  return {
    stance: termValue(o.terms.stance, holds),
    relation: termValue(o.terms.relation, holds),
    safety: termValue(o.terms.safety, holds),
    values: termValue(o.terms.values, holds),
    breaks: !!o.breaks && holds(o.breaks),
  };
}

/** The utility of one option, with every named term (for the trace). */
export function decisionUtility(id: string, x: OptionInputs): ScoredAction {
  const terms: ScoredTerm[] = TERM_NAMES.map((name) => ({
    name,
    value: Math.round(clamp01(x[name]) * DECISION_WEIGHTS[name] * 1e6) / 1e6,
  }));
  let score = terms.reduce((s, t) => s + t.value, 0);
  if (x.breaks) {
    terms.push({ name: 'must_keep', value: -MUST_KEEP_PENALTY });
    score -= MUST_KEEP_PENALTY;
  }
  return { id, score: Math.round(score * 1e6) / 1e6, blocked: false, terms };
}

/**
 * The legal menu of a point now: the options whose `when` holds, trimmed to the fixed ones
 * when any of those is offered.
 */
export function legalOptions(
  point: DecisionPointDef,
  holds: (when: string) => boolean,
): DecisionOptionDef[] {
  const offered = point.options.filter((o) => !o.when || holds(o.when));
  const fixed = offered.filter((o) => o.fixed);
  return fixed.length > 0 ? fixed : offered;
}

/** The rule fallback's pick over the legal menu (null pick when the menu is empty). */
export function fallbackPick(
  point: DecisionPointDef,
  holds: (when: string) => boolean,
  rng?: Rng,
): PickResult {
  const scored = legalOptions(point, holds).map((o) =>
    decisionUtility(o.id, optionInputs(o, holds)),
  );
  return pickBest(scored, { band: point.band ?? LIFE_BAND, rng });
}

/** The trace of a fallback pick (builtin_ai.md 2.6). */
export function decisionTrace(
  actor: string,
  tick: number,
  pick: PickResult,
  stream: string,
): BrainTrace {
  return traceOfPick(actor, DECISION_TRACE_KIND, tick, pick, stream);
}
