// The full act-1 "alive" acceptance of the NPC brain (builtin_ai.md 14.2 and 17.2 row 4;
// PK-M1-18): 20 seeds over 12 game weeks, split into four files of five seeds so the
// playthrough runner works them in parallel. Each group's means meet the thresholds (so
// the means of all twenty do) and no single seed falls below seven tenths of one, except
// including the cognition arcs: the authority and close-repeat evidence of PK-M1-19 carries
// them, so the arc floors of 17.2 rows 4 and 6 hold like every other metric.

import { appendFileSync } from 'node:fs';
import { expect } from 'vitest';
import { TICKS_PER_GAME_DAY } from '../../src/core/time';
import { type AliveReport, aliveFailures, median, runAlive } from '../npc_alive_harness';

/** 12 game weeks. */
export const ALIVE_DAYS = 84;

/** Five seeds of 12 game weeks take 10 to 35 minutes, by how busy the machine is. */
export const GROUP_TIMEOUT = 60 * 60 * 1000;

/**
 * The whole simulated town (every system, not only the brain) may take at most this share
 * of a real-time game day (20 ticks a second): a regression guard on the per-tick cost,
 * loose enough for a busy test machine.
 */
export const REALTIME_SHARE = 0.02;

export function aliveGroup(seeds: readonly number[]): void {
  const reports: AliveReport[] = [];
  const failures: Record<number, string[]> = {};
  for (const seed of seeds) {
    const r = runAlive(seed, ALIVE_DAYS);
    console.log(`npc alive ${JSON.stringify(r)}`);
    // the runner shows the console only for failing tests: NPC_ALIVE_OUT names a file that
    // collects every seed's report for the packet's verification matrix
    const out = process.env.NPC_ALIVE_OUT;
    if (out) appendFileSync(out, `${JSON.stringify(r)}\n`);
    // every seed runs before any is judged, so a report names all the seeds that fall short
    const f = aliveFailures(r, 0.7, true);
    if (f.length > 0) failures[seed] = f;
    reports.push(r);
  }
  expect(failures, 'seeds below the floor').toEqual({});
  const mean = (f: (r: AliveReport) => number) =>
    reports.reduce((a, r) => a + f(r), 0) / reports.length;
  const means: AliveReport = {
    seed: -1,
    days: ALIVE_DAYS,
    approachesPerDay: mean((r) => r.approachesPerDay),
    deviation: mean((r) => r.deviation),
    interactionsPerDay: mean((r) => r.interactionsPerDay),
    quarrelShare: mean((r) => r.quarrelShare),
    relationRecordsPerDay: mean((r) => r.relationRecordsPerDay),
    rumorReach: mean((r) => r.rumorReach),
    neighbourDays: reports.flatMap((r) => r.neighbourDays),
    arcs: mean((r) => r.arcs),
    leapsWithoutEvidence: reports.reduce((a, r) => a + r.leapsWithoutEvidence, 0),
    recallShare: mean((r) => r.recallShare),
    priceWeeks: mean((r) => r.priceWeeks),
    longestStockout: Math.max(...reports.map((r) => r.longestStockout)),
    stuck: reports.reduce((a, r) => a + r.stuck, 0),
    msPerDay: mean((r) => r.msPerDay),
  };
  console.log(
    `npc alive means ${JSON.stringify({ ...means, neighbourDays: undefined, neighbourMedian: median(means.neighbourDays) })}`,
  );
  expect(aliveFailures(means, 1), 'group means').toEqual([]);
  expect(means.msPerDay).toBeLessThan(TICKS_PER_GAME_DAY * 50 * REALTIME_SHARE);
}
