import { join } from 'node:path';
import { expect, it } from 'vitest';
import { TICK_HZ } from '../src/core/time';
import { Autoplayer, type AutoplayResult } from '../src/game/autoplay';
import { createGame } from '../src/game/create';
import { observePlaythrough } from './playthrough/diagnostics';
import { CHEATS } from './playthrough/harness';

// catalog_quests_acts1_3.md 5.1 budgets M01 at 25 and M02 at 35 play minutes.
const TUTORIAL_BUDGET = (25 + 35) * 60 * TICK_HZ;

it(
  'walks the real prologue and first tutorial boss with player commands',
  () => {
    const engine = createGame({ seed: 20261115, aiMode: 'off' });
    const bot = new Autoplayer(engine);
    const observer = observePlaythrough(engine, () => bot.intent.what, {
      directory: join(
        '.local',
        'parallel_m1_20261119',
        'checks',
        `tutorial_${new Date().toISOString().replace(/[:.]/g, '_')}`,
      ),
      intervalTicks: 1200,
      checkpointTicks: 1200,
      maxRecords: 100,
    });
    let result: AutoplayResult | undefined;
    try {
      result = bot.run({
        maxTicks: TUTORIAL_BUDGET,
        until: (e) => e.world.slices.quests.quests.q_a1_m02_raven?.status === 'done',
      });
      expect(result.stuck).toBeUndefined();
      expect(result.questsDone).toContain('q_a1_m01_fall');
      expect(result.questsDone).toContain('q_a1_m02_raven');
      for (const cheat of CHEATS) expect(result.commands[cheat] ?? 0, cheat).toBe(0);
      observer.finish('passed', { result, lossesTo: bot.lossesTo });
    } catch (error) {
      observer.finish('failed', {
        result,
        lossesTo: bot.lossesTo,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
  10 * 60 * 1000,
);
