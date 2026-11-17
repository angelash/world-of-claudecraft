// Alive metric 7 over 20 seeds (builtin_ai.md 14.2, VS-08; PK-M1-18): with nobody playing,
// the named people decide act 1's dispute points themselves and every Must dispute reaches
// a legal ending with nothing left open.

import { describe, expect, it } from 'vitest';
import { MUST_DISPUTES, runDisputes } from '../npc_disputes_brain';

describe('act 1 disputes decided by the NPC brains', () => {
  it("settles every Must dispute legally on 20 seeds, no deadlock, every point the brain's", () => {
    const endings: Record<string, Record<string, number>> = {};
    for (let seed = 1; seed <= 20; seed++) {
      const r = runDisputes(seed);
      for (const id of MUST_DISPUTES) {
        expect(r.legal[id], `${id} seed ${seed}`).toBe(true);
        if (!endings[id]) endings[id] = {};
        const e = endings[id];
        const k = r.endings[id] ?? '';
        e[k] = (e[k] ?? 0) + 1;
      }
      expect(r.open, `seed ${seed}`).toBe(0);
      expect(r.byBrain, `seed ${seed}`).toBe(r.personPoints);
    }
    console.log(`npc disputes endings ${JSON.stringify(endings)}`);
  });
});
