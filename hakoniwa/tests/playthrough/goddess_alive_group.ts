// The act-1 acceptance of the goddess brain and the director (builtin_ai.md 14.2 metric 8
// and 17.2 row 4; catalog_goddess_interventions.md 17.2; PK-M1-20): 20 seeds over the whole
// act (84 game days) with the scripted player of tests/goddess_alive_harness.ts, split into
// four files of five seeds so the playthrough runner works them in parallel. Each group's
// mean of metric 8 meets the act-1 threshold (so the mean of all twenty does) and no seed
// falls below seven tenths of it; the presence floor, the density limits, the must acts, the
// act budgets, the end reserves and no covenant breach hold on every seed. GODDESS_ALIVE_OUT
// names a file that collects every seed's report for the packet's verification matrix.

import { appendFileSync } from 'node:fs';
import { expect } from 'vitest';
import {
  type GoddessAliveReport,
  runGoddessAlive,
  GODDESS_ALIVE_THRESHOLDS as T,
} from '../goddess_alive_harness';

/** The whole act. */
export const GODDESS_ALIVE_DAYS = 84;

/** Five whole acts take 10 to 25 minutes, by how busy the machine is. */
export const GODDESS_GROUP_TIMEOUT = 60 * 60 * 1000;

export function goddessAliveGroup(seeds: readonly number[]): void {
  const reports: GoddessAliveReport[] = [];
  const failures: Record<number, string[]> = {};
  for (const seed of seeds) {
    const r = runGoddessAlive(seed, GODDESS_ALIVE_DAYS);
    console.log(`goddess alive ${JSON.stringify(r)}`);
    const out = process.env.GODDESS_ALIVE_OUT;
    if (out) appendFileSync(out, `${JSON.stringify(r)}\n`);
    // every seed runs before any is judged, so a report names all the seeds that fall short
    const f: string[] = [];
    if (r.brain < 0.7 * T.brain) f.push(`metric 8 ${r.brain}`);
    if (r.presence < T.presence) f.push(`presence ${r.presence}`);
    if (r.densityMax > T.density) f.push(`density ${r.densityMax}`);
    if (r.densityPlayerMax > T.densityPlayer) f.push(`player density ${r.densityPlayerMax}`);
    if (r.mustMissed.length > 0) f.push(`must missed ${r.mustMissed.join(',')}`);
    if (r.overBudget.length > 0) f.push(`over budget ${r.overBudget.join(',')}`);
    if (r.belowReserve.length > 0) f.push(`below reserve ${r.belowReserve.join(',')}`);
    if (r.breaches > 0) f.push(`breaches ${r.breaches}`);
    if (f.length > 0) failures[seed] = f;
    reports.push(r);
  }
  expect(failures, 'seeds below the floor').toEqual({});
  const mean = reports.reduce((a, r) => a + r.brain, 0) / reports.length;
  console.log(`goddess alive mean metric 8 ${mean}`);
  expect(mean).toBeGreaterThanOrEqual(T.brain);
}
