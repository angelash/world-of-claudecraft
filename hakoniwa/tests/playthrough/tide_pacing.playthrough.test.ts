// Pacing of the tide night on a natural act 1 (PK-M1-52; development_plan.md 4.2 "20 个种子的
// 伤亡与归功分布进节奏报告"): 20 seeds of act 1 from its first day to the tide night with
// nobody intervening, on the systems the night and the act run on (world, quests and the act
// clock, the disputes and the NPC brain that decides their points, ailments for the
// children, the tide), the registry guard on and an hour-coarse clock. Each seed draws a
// prologue of 0 to 13 days and the other writers of seal_unrest (doors, quest effects), as
// the disputes acceptance does, so the night falls on the dark moon of week 8, 9 or 10. The
// player stands at the north gate all night and brings the colossus down when it comes;
// everyone else does what the state of their world gives them. The numbers go to the
// packet's pacing report; the faster profile runs are tests/tide_pacing.test.ts.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../../src/content';
import { Engine } from '../../src/core';
import type { AnyWorldEvent, FlagValue } from '../../src/core/contracts';
import { Rng } from '../../src/core/rng';
import { tickAtDay } from '../../src/core/time';
import { guardSystems, registryFor } from '../../src/game/flag_guard';
import { allSystems } from '../../src/game/registry';
import { actWeekStartTick } from '../../src/systems/quests';
import {
  type NightNumbers,
  numbers,
  report,
  SCRIPT,
  stand,
  strideSystem,
  type T,
  tally,
} from '../tide_harness';

const KEEP = new Set([
  'world',
  'modifiers',
  'inventory',
  'quests',
  'disputes',
  'npc',
  'ailments',
  'tide',
  'travel',
]);
const CONTENT = buildContent();
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);

function leanGame(seed: number, startTick: number): T {
  const stride = { on: true };
  const systems = [
    ...guardSystems(
      allSystems().filter((s) => KEEP.has(s.id)),
      registryFor(CONTENT),
      'throw',
    ),
    strideSystem(stride),
  ];
  const g = Engine.create(seed, CONTENT, systems, { aiMode: 'off' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  while (g.tick < startTick - 1) g.step(1);
  stride.on = false;
  g.queue('flag.set', { key: 'act', value: 'act1' }, SCRIPT);
  g.step(1);
  stride.on = true;
  return { g, events, stride };
}

const flag = (t: T, k: string): FlagValue | undefined => t.g.world.meta.flags[k];

function runTo(t: T, tick: number): void {
  while (t.g.tick < tick) t.g.step(1);
}

function weekTick(t: T, week: number): number {
  const st = t.g.world.slices.quests.clock;
  if (!st) throw new Error('no act clock');
  return actWeekStartTick(st.startDay, week, st.startTick);
}

describe('pacing on a natural act 1: 20 seeds, nobody intervening', () => {
  it('reaches the night on the dark moon of weeks 8 to 10 and settles it', () => {
    const runs: NightNumbers[] = [];
    const weeks: string[] = [];
    const endings: string[] = [];
    for (const seed of SEEDS) {
      const rng = new Rng({ s: seed * 7919 + 13 });
      const t = leanGame(seed, tickAtDay(rng.int(0, 13), rng.int(7, 18)));
      const bumps = rng.int(0, 3);
      for (let i = 0; i < bumps; i++) {
        runTo(t, weekTick(t, rng.int(2, 7)) + rng.int(1, 20) * 1200);
        const cur = Number(flag(t, 'seal_unrest') ?? 0);
        t.g.queue(
          'flag.set',
          { key: 'seal_unrest', value: Math.min(100, cur + rng.int(5, 20)) },
          SCRIPT,
        );
        t.g.step(1);
      }
      runTo(t, weekTick(t, 8));
      stand(t, 'north_gate');
      // the dusk scene's post: the waves pass in hour-coarse steps here
      t.g.queue('flag.set', { key: 'a1_tide_post', value: 'north' }, SCRIPT);
      for (let i = 0; i < 24 * 7 * 3 && flag(t, 'a1_tide_stage') !== 3; i++) t.g.step(1);
      expect(flag(t, 'a1_tide_stage'), `seed ${seed}`).toBe(3);
      weeks.push(String(flag(t, 'act_week')));
      t.g.queue('flag.set', { key: 'boss.dian_colossus.defeated', value: true }, SCRIPT);
      for (let i = 0; i < 24 && !flag(t, 'a1_beast_tide_cleared'); i++) t.g.step(1);
      expect(flag(t, 'a1_beast_tide_cleared'), `seed ${seed}`).toBe(true);
      t.g.step(2);
      const n = numbers(t);
      runs.push(n);
      console.log(
        `[tide] natural seed ${seed}: week ${flag(t, 'act_week')}, civilians ${n.civilians} ${n.survival}, ` +
          `dead [${n.named.join(' ')}], hurt [${n.injured.join(' ')}], credit ${n.credit}, ` +
          `weakest ${n.weakest}, prosperity ${n.prosperity}`,
      );
      endings.push(
        ['q_a1_d01_tax_and_bandits', 'q_a1_d02_witch_trial', 'q_a1_d04_forest_dispute']
          .map((d) => String(flag(t, `dispute.${d}.ending`)))
          .join('/'),
      );
    }
    console.log(report('natural act 1, nobody intervening', runs));
    console.log(
      `[tide] night weeks ${JSON.stringify(tally(weeks))}; dispute endings ${JSON.stringify(tally(endings))}`,
    );
    for (const n of runs) {
      expect(['intact', 'damaged', 'ravaged']).toContain(n.survival);
      expect(['player', 'martha', 'light', 'self_collapse']).toContain(n.credit);
    }
    expect(weeks.every((w) => ['8', '9', '10'].includes(w))).toBe(true);
  });
});
