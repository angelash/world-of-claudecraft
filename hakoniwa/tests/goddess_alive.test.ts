// The act-1 goddess metrics (builtin_ai.md 14.2 metric 8; catalog_goddess_interventions.md
// 17.2 and 1.3; PK-M1-20), the short run of the default suite: one seed over the whole act
// (84 game days) against the thresholds, and the same seed twice over three weeks for the
// determinism of the goddesses' and the director's work. The full acceptance (20 seeds) runs
// with the playthroughs: tests/playthrough/goddess_alive_1 to _4 (goddess_alive_group.ts).

import { describe, expect, it } from 'vitest';
import { runGoddessAlive, GODDESS_ALIVE_THRESHOLDS as T } from './goddess_alive_harness';

describe('act 1 goddess metrics, the short run', () => {
  it('meets metric 8, the presence floor and the density limits on one seed', () => {
    const r = runGoddessAlive(4, 84);
    const at = JSON.stringify(r);
    expect(r.days, at).toBe(84);
    expect(r.brain, at).toBeGreaterThanOrEqual(T.brain);
    expect(r.presence, at).toBeGreaterThanOrEqual(T.presence);
    expect(r.densityMax, at).toBeLessThanOrEqual(T.density);
    expect(r.densityPlayerMax, at).toBeLessThanOrEqual(T.densityPlayer);
    expect(r.mustMissed, at).toEqual([]);
    // the plan keeps to the act budget over the whole act (builtin_ai 8.4)
    expect(r.overBudget, at).toEqual([]);
    // the end reserve holds at the act's end, and no covenant is breached in act 1 (17.2)
    expect(r.belowReserve, at).toEqual([]);
    expect(r.breaches, at).toBe(0);
    // the act keeps to its one written coincidence besides the reveals (act1 7.5)
    expect(r.byAction['moira:coincidence:beat'] ?? 0, at).toBeLessThanOrEqual(2);
  }, 600_000);

  it('runs the same for the same seed', () => {
    const a = runGoddessAlive(9, 21);
    const b = runGoddessAlive(9, 21);
    expect(a.ledgerHash).toBe(b.ledgerHash);
    expect(a.brain).toBe(b.brain);
  }, 600_000);
});
