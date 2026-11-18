// Pacing of the tide night (PK-M1-52; development_plan.md 4.2 "20 个种子的伤亡与归功分布进节奏
// 报告"): 20 seeds of a regular act 1 route (tests/tide_harness.ts routeProfile: each
// preparation and dispute intervention drawn with its share, the post at dusk, the player
// near the gate or away when the colossus comes) and 20 seeds of a night with no preparation
// at all and the player at the north gate, each played in the real game with every system.
// The night begins at once on the profile's state (the disputes settle on it at dusk as they
// would at week 8 to 10; the natural act run is tests/playthrough/tide_pacing.playthrough.
// test.ts). The distributions go to the packet's pacing report; the checks below are the
// design's shape, not targets the design never set:
//   - every run settles to the registry's values, and the numbers agree with each other;
//   - with no preparation the town loses more than on the route, the slope is shut out and
//     the striker cuts the surge (8.5: the town cannot hold its weakest face alone);
//   - the route reaches more than one survival band and more than one credit version.

import { describe, expect, it } from 'vitest';
import {
  begin,
  game,
  type NightNumbers,
  numbers,
  POST_LINE,
  playNight,
  report,
  routeProfile,
  stand,
} from './tide_harness';

const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
const BANDS = ['intact', 'damaged', 'ravaged'];
const CREDITS = ['player', 'martha', 'light', 'self_collapse'];

const row = (n: NightNumbers) =>
  `civilians ${n.civilians} ${n.survival}, dead [${n.named.join(' ')}], hurt [${n.injured.join(' ')}], ` +
  `credit ${n.credit}, weakest ${n.weakest}${n.struck ? ' cut' : ''}, prosperity ${n.prosperity}`;

function legal(n: NightNumbers): void {
  expect(n.civilians).toBeGreaterThanOrEqual(0);
  expect(BANDS).toContain(n.survival);
  expect(CREDITS).toContain(n.credit);
  expect(['north', 'east', 'south', 'west']).toContain(n.weakest);
  expect(n.prosperity).toBeGreaterThanOrEqual(0);
  expect(n.prosperity).toBeLessThanOrEqual(100);
  if (n.survival === 'intact') expect(n.civilians).toBeLessThanOrEqual(5);
  if (n.survival === 'ravaged') expect(n.civilians).toBeGreaterThanOrEqual(21);
  if (n.credit === 'martha') expect(n.struck).toBe(true);
}

describe('pacing: 20 seeds', () => {
  it('a regular route and an unprepared town, the casualty and credit distribution', () => {
    const route: NightNumbers[] = [];
    const bare: NightNumbers[] = [];
    for (const seed of SEEDS) {
      const prof = routeProfile(seed);
      const t = game(seed, { ...prof.state, a1_tide_post: POST_LINE[prof.post] ?? 'free' });
      stand(t, prof.post);
      begin(t);
      playNight(t, prof.post, { away: prof.away });
      const n = numbers(t);
      legal(n);
      route.push(n);
      console.log(
        `[tide] route seed ${seed}: post ${prof.post}${prof.away ? ' (away)' : ''}, ${row(n)}`,
      );
      const u = game(seed, { a1_tide_post: 'north' });
      stand(u, 'north_gate');
      begin(u);
      playNight(u, 'north_gate');
      const m = numbers(u);
      legal(m);
      bare.push(m);
      console.log(`[tide] bare seed ${seed}: ${row(m)}`);
    }
    console.log(report('regular route', route));
    console.log(report('no preparation, the player at the north gate', bare));
    const sum = (r: NightNumbers[]) => r.reduce((s, x) => s + x.civilians, 0);
    expect(sum(bare)).toBeGreaterThan(sum(route));
    expect(bare.every((n) => n.struck)).toBe(true);
    expect(new Set(route.map((n) => n.survival)).size).toBeGreaterThan(1);
    expect(new Set(route.map((n) => n.credit)).size).toBeGreaterThan(1);
  }, 600_000);
});
