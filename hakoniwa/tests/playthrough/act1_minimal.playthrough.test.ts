// Pacing acceptance of the act 1 minimal route (progression_and_pacing.md 17.1, 17.4;
// PK-M0-29): the autoplayer does the main story and the fights it needs, nothing optional,
// from the prologue to the change into act 2 on the no-model build. Its level at the end of
// act 1 must reach band_max - 3 = 12 (17.4, minimal route), with the experience coming
// from both quests and kills (the rescaled quest table of 18.1 and the undiluted kill share
// of 3.3).

import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Autoplayer, type AutoplayResult } from '../../src/game/autoplay';
import { createGame } from '../../src/game/create';
import { levelBand } from '../../src/systems/combat/progression';
import { observePlaythrough } from './diagnostics';
import { CHEATS, SEED, summary } from './harness';

describe('act 1 minimal route pacing', () => {
  it('ends act 1 at level 12 or more', () => {
    const t0 = performance.now();
    const engine = createGame({ seed: SEED, aiMode: 'off' });
    const xp: Record<string, number> = {};
    engine.onEvents((events) => {
      for (const ev of events) {
        if (ev.kind !== 'combat.xp' || ev.data.entityId !== engine.world.slices.world.playerId)
          continue;
        const reason = typeof ev.data.reason === 'string' ? ev.data.reason : 'other';
        const kind = reason.split(':')[0] ?? 'other';
        xp[kind] = (xp[kind] ?? 0) + ev.data.amount;
      }
    });
    const bot = new Autoplayer(engine, { route: 'release' });
    const directory = join(
      '.local',
      'parallel_m1_20261119',
      'checks',
      `act1_minimal_${new Date().toISOString().replace(/[:.]/g, '_')}`,
    );
    const observer = observePlaythrough(engine, () => bot.intent.what, {
      directory,
      log: console.log,
    });
    console.log(`[act1 diagnostics] ${directory}`);
    let result: AutoplayResult | undefined;
    try {
      result = bot.run({
        maxTicks: 2_000_000,
        until: (e) => e.world.meta.flags.act === 'act2',
      });
      const unit = engine.world.slices.combat.units[engine.world.slices.world.playerId];
      console.log(
        `[act1 minimal] level ${unit?.level} at tick ${engine.tick}, experience by source ${JSON.stringify(xp)}; ${summary(result, Math.round(performance.now() - t0))}`,
      );
      expect(result.stuck).toBeUndefined();
      expect(engine.world.meta.flags.act).toBe('act2');
      const main = engine.content.quests.filter((q) => q.act === 'act1' && q.kind === 'main');
      for (const q of main) expect(result.questsDone, q.id).toContain(q.id);
      const band = levelBand('act1');
      expect(band).toEqual([1, 15]);
      expect(unit?.level ?? 0).toBeGreaterThanOrEqual((band?.[1] ?? 15) - 3);
      // both shares carried the run: the rescaled quests and the kills
      expect(xp.quest ?? 0).toBeGreaterThanOrEqual(20000);
      expect(xp.kill ?? 0).toBeGreaterThan(0);
      for (const kind of CHEATS) expect(result.commands[kind] ?? 0, kind).toBe(0);
      observer.finish('passed', { result, xp });
    } catch (error) {
      observer.finish('failed', {
        result,
        xp,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
});
