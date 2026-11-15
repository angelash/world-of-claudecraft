// Shared driver of the playthrough tests (D-010): a fresh no-model game, the autoplayer
// on a route, progress lines on the console, and a summary the tests assert on.

import type { Engine } from '../../src/core/engine';
import {
  type ActRecord,
  Autoplayer,
  type AutoplayResult,
  type EndingRoute,
} from '../../src/game/autoplay';
import { createGame } from '../../src/game/create';

export const SEED = 20261115;

/** Story order of the acts a finished run must pass through. */
export const ACT_ORDER = ['prologue', 'act1', 'act2', 'act3', 'act4', 'act5', 'act6', 'epilogue'];

export interface Playthrough {
  engine: Engine;
  bot: Autoplayer;
  result: AutoplayResult;
  ms: number;
}

/** Play a whole run (or until `stop` holds) and print one line per milestone. */
export function playthrough(
  route: EndingRoute,
  opts: { seed?: number; stop?: (e: Engine) => boolean; maxTicks?: number; logLimit?: number } = {},
): Playthrough {
  const t0 = performance.now();
  const engine = createGame({
    seed: opts.seed ?? SEED,
    aiMode: 'off',
    logLimit: opts.logLimit,
  });
  const bot = new Autoplayer(engine, {
    route,
    log: (line) => {
      if (!line.includes('倒下')) console.log(`[${route}] ${line}`);
    },
  });
  const result = bot.run({ maxTicks: opts.maxTicks ?? 6_000_000, until: opts.stop });
  const ms = Math.round(performance.now() - t0);
  console.log(`[${route}] ${summary(result, ms)}`);
  return { engine, bot, result, ms };
}

export function summary(r: AutoplayResult, ms: number): string {
  const acts = r.acts
    .map(
      (a: ActRecord) => `${a.act} ${((a.endTick ?? a.startTick) - a.startTick).toLocaleString()}t`,
    )
    .join(', ');
  return `ending=${r.ending} finished=${r.finished} ticks=${r.ticks} ms=${ms} deaths=${r.deaths} quests=${r.questsDone.length} acts: ${acts}${r.stuck ? ` stuck: ${r.stuck}` : ''}`;
}

/** Commands a player has no business sending (debug and script channels). */
export const CHEATS = [
  'flag.set',
  'world.teleport',
  'combat.spawn',
  'combat.set_class',
  'city.add_population',
  'modifier.register',
  'maker.revelation',
  'scenes.start',
];
