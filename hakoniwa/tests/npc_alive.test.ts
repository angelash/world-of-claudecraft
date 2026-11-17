// The act-1 "alive" metrics of the NPC brain (builtin_ai.md 14.2; PK-M1-18), the short run
// of the default suite: one seed, one game week of a scripted player in Borderstone, and
// two seeds of act 1's disputes with nobody intervening. The full acceptance (20 seeds over
// 12 game weeks, and 20 seeds of disputes) runs with the playthroughs:
// tests/playthrough/npc_alive_*.playthrough.test.ts.

import { describe, expect, it } from 'vitest';
import { aliveFailures, runAlive } from './npc_alive_harness';
import { MUST_DISPUTES, runDisputes } from './npc_disputes_brain';

describe('act 1 alive metrics, the short run', () => {
  it('meets the week-measurable thresholds on one seed', () => {
    const r = runAlive(11, 7);
    expect(aliveFailures(r, 1, false), JSON.stringify(r)).toEqual([]);
    // a deed's rumor reaches the next town within the week
    expect(r.neighbourDays.length).toBeGreaterThan(0);
  }, 180_000);

  it("lets the named people decide act 1's disputes, each to a legal ending (metric 7)", () => {
    for (const seed of [1, 2]) {
      const r = runDisputes(seed);
      for (const id of MUST_DISPUTES) expect(r.legal[id], `${id} seed ${seed}`).toBe(true);
      expect(r.open).toBe(0);
      expect(r.personPoints).toBeGreaterThan(0);
      expect(r.byBrain).toBe(r.personPoints);
    }
  }, 180_000);
});
