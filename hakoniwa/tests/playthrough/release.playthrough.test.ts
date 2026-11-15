// D-010 acceptance, true ending: the no-model build played from the prologue to "离手"
// (release) by the autoplayer on the real engine with every system, player commands only.

import { describe, expect, it } from 'vitest';
import { ACT_ORDER, CHEATS, playthrough } from './harness';

describe('no-model playthrough: the true ending', () => {
  it('walks prologue, acts 1 to 6 and the epilogue to the release ending', () => {
    const { engine, result } = playthrough('release');
    expect(result.stuck).toBeUndefined();
    expect(result.finished).toBe(true);
    expect(result.acts.map((a) => a.act)).toEqual(ACT_ORDER);
    const f = engine.world.meta.flags;
    expect(f.ending).toBe('release');
    expect(f.act).toBe('epilogue');
    expect(engine.world.slices.scenes.seen).toContain('ending_release');
    // the true ending's world conditions were earned in play, not set
    expect(Number(f.autonomy)).toBeGreaterThanOrEqual(60);
    expect(f.purge_route).toBe('people');
    expect(f['slg.nation_founded']).toBe(true);
    // every main quest was completed along the way
    const main = engine.content.quests.filter((q) => q.kind === 'main').map((q) => q.id);
    for (const id of main) expect(result.questsDone, id).toContain(id);
    // the bot only ever sent ordinary player commands
    for (const kind of CHEATS) expect(result.commands[kind] ?? 0, kind).toBe(0);
  });
});
