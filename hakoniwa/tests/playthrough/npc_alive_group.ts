// The full act-1 "alive" acceptance of the NPC brain (builtin_ai.md 14.2 and 17.2 row 4;
// PK-M1-18): 20 seeds over 12 game weeks, split into four files of five seeds so the
// playthrough runner works them in parallel. Each group's means meet the thresholds (so
// the means of all twenty do) and no single seed falls below seven tenths of one, except
// the cognition arcs: every seed forms at least one arc and a group's arc mean keeps the
// per-seed floor of seven tenths, while the full floors (17.2 rows 4 and 6, and the
// twenty-seed mean of 4) wait for the evidence kinds no system emits yet (`authority`, and
// little `repeat_close`); the M1 gate re-checks the twenty-seed mean (project_state U-21,
// docs/70_packets/pk_m1_18_npc_brain/progress.md section 3).

import { appendFileSync } from 'node:fs';
import { expect } from 'vitest';
import { TICKS_PER_GAME_DAY } from '../../src/core/time';
import {
  ALIVE_THRESHOLDS,
  type AliveReport,
  aliveFailures,
  median,
  runAlive,
} from '../npc_alive_harness';

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
    const f = aliveFailures(r, 0.7, true, { arcs: false });
    if (r.arcs < 1) f.push('no complete cognition arc');
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
  // a five-seed group cannot carry the twenty-seed arc mean yet (see the header)
  const groupFailures = aliveFailures(means, 1, true, { arcs: false });
  const arcFloor = ALIVE_THRESHOLDS.arcsPer12Weeks * 0.7;
  const arcs = (means.arcs * 84) / means.days;
  if (arcs < arcFloor)
    groupFailures.push(`arcs per 12 weeks ${arcs.toFixed(3)} < ${arcFloor.toFixed(3)}`);
  expect(groupFailures, 'group means').toEqual([]);
  expect(means.msPerDay).toBeLessThan(TICKS_PER_GAME_DAY * 50 * REALTIME_SHARE);
}
