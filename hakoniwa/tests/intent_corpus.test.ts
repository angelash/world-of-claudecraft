// Acceptance gate of the free-input pipeline (builtin_ai.md 14.3, 19 step 3; development_plan.md
// PK-M0-26): the 500-sentence labeled corpus (tests/fixtures/intent_corpus.json) must clear
// non-unknown coverage >= 68% and accuracy on classified sentences >= 72% (eighty percent
// of builtin_ai 14.3's line: coverage >= 85%, accuracy >= 90%). The held-out set
// (tests/fixtures/intent_holdout.json, never tuned against) is checked at the same bars to
// catch overfitting to the corpus. Numbers are also printed so a packet report can quote
// them verbatim.

import { describe, expect, it } from 'vitest';
import { INTENT_IDS } from '../src/systems/dialogue/intent/types';
import corpus from './fixtures/intent_corpus.json';
import holdout from './fixtures/intent_holdout.json';
import { evaluate, type Report } from './intent_eval';

const MIN_COVERAGE = 0.68;
const MIN_ACCURACY = 0.72;

function logReport(label: string, r: Report): void {
  // eslint-disable-next-line no-console -- PK-M0-26 acceptance numbers, quoted in the packet
  console.log(
    `${label}: coverage ${(r.coverage * 100).toFixed(1)}% (${r.classified}/${r.total}), ` +
      `accuracy ${(r.accuracy * 100).toFixed(1)}% (${r.correct}/${r.classified})`,
  );
}

describe('intent corpus acceptance (builtin_ai.md 14.3, PK-M0-26)', () => {
  it('the 500-sentence corpus clears the acceptance bars', () => {
    const { report } = evaluate(corpus.sentences as never);
    logReport('corpus', report);
    expect(report.total).toBe(500);
    expect(report.coverage).toBeGreaterThanOrEqual(MIN_COVERAGE);
    expect(report.accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY);
  });

  it('the held-out 120-sentence set (never tuned against) also clears the bars', () => {
    const { report } = evaluate(holdout.sentences as never);
    logReport('holdout', report);
    expect(report.total).toBe(120);
    expect(report.coverage).toBeGreaterThanOrEqual(MIN_COVERAGE);
    expect(report.accuracy).toBeGreaterThanOrEqual(MIN_ACCURACY);
  });

  it('the corpus labels every one of the 52 intent ids, each at least once correctly', () => {
    const { report } = evaluate(corpus.sentences as never);
    const labeled = new Set(Object.keys(report.perIntent));
    // 'unknown' has no rule of its own (it is the below-threshold fallback): the other 51
    // must each be a labeled intent in the corpus, and the corpus must carry 'unknown'
    // examples too, so this check is about the FIXTURE's coverage of the id space, not
    // the classifier's.
    const real = (INTENT_IDS as readonly string[]).filter((id) => id !== 'unknown');
    const missingFromFixture = real.filter((id) => !labeled.has(id));
    expect(missingFromFixture).toEqual([]);
    expect(labeled.has('unknown')).toBe(true);
    // coverage alone (classified > 0) would pass on an intent that is never once
    // classified correctly (every sample for it misrouted elsewhere); require at least
    // one correct hit per real intent, which classified-only coverage cannot catch.
    const neverCorrect = real.filter((id) => (report.perIntent[id]?.correct ?? 0) === 0);
    expect(neverCorrect).toEqual([]);
  });

  it("the corpus's own unknown sentences are not all misrouted to a real intent", () => {
    // perIntent.unknown.correct is structurally always 0 (evaluate() only counts
    // 'correct' inside the got !== 'unknown' branch), so unknown recall has to be read
    // off the raw rows, not off the per-intent report.
    const { rows } = evaluate(corpus.sentences as never);
    const unknownRows = rows.filter((r) => r.sample.intent === 'unknown');
    expect(unknownRows.length).toBeGreaterThan(0);
    const recalled = unknownRows.filter((r) => r.got === 'unknown').length;
    expect(recalled).toBeGreaterThan(0);
  });
});
