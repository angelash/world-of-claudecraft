// The assembled onboarding catalogue: the prologue, act-1 and any-time tables in the order of
// ux_and_onboarding.md 17.5, with a lookup by id, the per-act counts the 17.5 table states
// (the onboarding check holds the catalogue to them) and the event kinds it reads (the
// session forwards only those to the onboarding). Pure.

import { leaves, type TutAct, type TutStep } from './steps';
import { ACT1_STEPS } from './steps_a1';
import { ANY_STEPS } from './steps_any';
import { PROLOGUE_STEPS } from './steps_p';

export const TUT_STEPS: readonly TutStep[] = [...PROLOGUE_STEPS, ...ACT1_STEPS, ...ANY_STEPS];

/** The 17.5 row counts of the acts this catalogue carries (the later acts arrive with M2, M3). */
export const DESIGN_COUNTS: Readonly<Record<TutAct, number>> = { p: 9, a1: 41, any: 15 };

const BY_ID = new Map(TUT_STEPS.map((s) => [s.id, s]));

export function stepById(id: string): TutStep | undefined {
  return BY_ID.get(id);
}

/** Every event kind the catalogue's triggers and completions read. */
export function eventKindsOf(steps: readonly TutStep[]): Set<string> {
  const out = new Set<string>();
  for (const s of steps) {
    for (const c of [...leaves(s.trigger), ...leaves(s.done)]) {
      if (c.kind === 'event') out.add(c.event);
    }
  }
  return out;
}

/** The event kinds the onboarding reads: the session filters its event buffer to these. */
export const TUT_EVENT_KINDS: ReadonlySet<string> = eventKindsOf(TUT_STEPS);
