// D-010 acceptance, a second ending: the same no-model build, but the player backs Merca
// in the court of the review, which ends in her rule (某神之治：梅尔卡).

import { describe, expect, it } from 'vitest';
import { ACT_ORDER, CHEATS, playthrough } from './harness';

describe('no-model playthrough: a goddess rule', () => {
  it('walks the whole story and ends in rule_merca when Merca is backed in the court', () => {
    const { engine, result } = playthrough('rule_merca');
    expect(result.stuck).toBeUndefined();
    expect(result.finished).toBe(true);
    expect(result.acts.map((a) => a.act)).toEqual(ACT_ORDER);
    const f = engine.world.meta.flags;
    expect(f.a6_patron).toBe('merca');
    expect(f.ending).toBe('rule_merca');
    expect(engine.world.slices.scenes.seen).toContain('ending_rule_merca');
    for (const kind of CHEATS) expect(result.commands[kind] ?? 0, kind).toBe(0);
  });
});
