// Door rank and the seal (thousand_doors.md 4, 6.4; section 23 groups R and S, M1 rows):
// the curve's pinned points and the shipped curve file, the rank moving only on an
// opening (not on closing, death or blockage), the seal tiers in half points with the
// forbidden weight, the stage capped by the act and raised on the act change, the
// seal_unrest rule per act, and content writes of seal_looseness kept in step.

import { describe, expect, it } from 'vitest';
import curveFile from '../data/doors/rank_curve.json';
import type { SystemContext } from '../src/core/system';
import { doorCosts } from '../src/systems/doors';
import { rankCurve, rankFromPoints, rankThreshold } from '../src/systems/doors/rank';
import { cappedStage, openPoints, unrestDelta } from '../src/systems/doors/seal';
import type { DoorDef } from '../src/systems/doors/types';
import {
  door,
  events,
  flags,
  gameWith,
  makeGame,
  merge,
  open,
  setFlags,
  withCtx,
} from './doors_harness';

function shipped(id: string): DoorDef {
  const d = merge().doors.find((x) => x.id === id);
  if (!d) throw new Error(`no door ${id}`);
  return d;
}

/** A shipped door whose keys are replaced by one test flag. */
function keyed(id: string): DoorDef {
  return { ...shipped(id), keys: [{ type: 'flag', key: `test.${id}`, label: 'k' }] };
}

describe('R: the door rank curve (4.3)', () => {
  it('pins P = 4, 15, 37, 55, 74, 94, 182 to ranks 5, 15, 30, 40, 50, 60, 99', () => {
    const curve = curveFile.thresholds;
    const pins: [number, number][] = [
      [4, 5],
      [15, 15],
      [37, 30],
      [55, 40],
      [74, 50],
      [94, 60],
      [182, 99],
    ];
    for (const [p, r] of pins) expect(rankFromPoints(curve, p), `P ${p}`).toBe(r);
    // one point less stays below each pinned rank
    for (const [p, r] of pins) expect(rankFromPoints(curve, p - 1), `P ${p - 1}`).toBe(r - 1);
    expect(rankFromPoints(curve, 0)).toBe(1);
    expect(rankFromPoints(curve, 1000)).toBe(99);
  });

  it('ships the curve file the formula writes, matching every column of the 4.3 table', () => {
    expect(curveFile.thresholds).toEqual(rankCurve());
    expect(curveFile.thresholds.length).toBe(99);
    const table: [number, number][] = [
      [5, 4],
      [10, 9],
      [15, 15],
      [20, 22],
      [25, 30],
      [28, 34],
      [30, 37],
      [35, 46],
      [40, 55],
      [45, 64],
      [50, 74],
      [55, 84],
      [60, 94],
      [61, 96],
      [70, 115],
      [80, 137],
      [90, 161],
      [99, 182],
    ];
    for (const [r, p] of table) expect(rankThreshold(r), `rank ${r}`).toBe(p);
    // the first door mirror reading: past life (1) and the first door (2) make rank 4
    expect(rankFromPoints(curveFile.thresholds, 3)).toBe(4);
  });
});

describe('R: only opening a door moves the rank (4.1)', () => {
  it('rises on openings and stays through closing, death and blockage', () => {
    const doors = [
      door('a', { rankValue: 2, closable: true }),
      door('b', { rankValue: 2 }),
      door('c', { rankValue: 1 }),
    ];
    const g = gameWith(doors);
    expect(doorCosts(g.world).rank).toBe(1);
    setFlags(g, { 'test.a': true, 'test.b': true, 'test.c': true });
    for (const id of ['a', 'b', 'c']) open(g, id);
    // P = 5: rank floor(2 * 5^0.75) = 6
    expect(doorCosts(g.world)).toMatchObject({ rank: 6, rankPoints: 5 });
    expect(flags(g).door_rank).toBe(6);
    // P 2, 4, 5 read ranks 3, 5, 6
    expect(events(g, 'doors.rank_up').map((e) => e.data.rank)).toEqual([3, 5, 6]);
    g.queue('doors.close', { doorId: 'a' });
    g.step(1);
    expect(flags(g)['door.a']).toBe(false);
    // a return through the door, then taint that turns into blockage
    withCtx(g, (ctx: SystemContext) => {
      ctx.emit('combat.player_returned', {
        fromMap: 'seal_ruins',
        x: 1,
        y: 1,
        toMap: 'seal_ruins',
        toX: 1,
        toY: 1,
        innerCourt: false,
        moneyLost: 0,
        fatigueMinutes: 120,
      });
    });
    setFlags(g, { 'player.taint': 40 });
    expect(doorCosts(g.world).blockage).toBe(10);
    expect(doorCosts(g.world)).toMatchObject({ rank: 6, rankPoints: 5 });
    expect(flags(g).door_rank).toBe(6);
  });
});

describe('S: seal tiers in half points (6.4.1)', () => {
  it('a medium door adds 4 points; the forbidden weight 4 more; the mirror is half', () => {
    expect(openPoints(door('m', { seal: 'medium' }))).toBe(4);
    expect(openPoints(door('f', { seal: 'medium', forbidden: true }))).toBe(8);
    const g = gameWith([
      door('m', { seal: 'medium' }),
      door('f', { seal: 'medium', forbidden: true, category: 'forbidden', wing: 'draft' }),
    ]);
    setFlags(g, { 'test.m': true, 'test.f': true });
    open(g, 'm');
    expect(flags(g).seal_points).toBe(4);
    expect(flags(g).seal_looseness).toBe(2);
    open(g, 'f');
    expect(flags(g).seal_points).toBe(12);
    expect(flags(g).seal_looseness).toBe(6);
    expect(flags(g).danger_doors_opened).toBe(1);
    expect(events(g, 'door.opened').map((e) => e.data.sealDelta)).toEqual([2, 4]);
  });

  it('stops at 99 outside the restoration door', () => {
    const g = gameWith([door('x', { seal: 'extreme', forbidden: true })]);
    setFlags(g, { seal_looseness: 95, 'test.x': true });
    open(g, 'x');
    expect(flags(g).seal_looseness).toBe(99);
    expect(flags(g).seal_points).toBe(198);
    expect(flags(g).doors_opened).toBe(1);
  });
});

describe('S: the stage is capped by the act (6.4.3)', () => {
  it('act 1 at looseness 20 reads stage 1; entering act 2 raises it to 2; it never falls', () => {
    expect(cappedStage(20, 1)).toBe(1);
    expect(cappedStage(20, 2)).toBe(2);
    expect(cappedStage(4.5, 1)).toBe(0);
    const g = gameWith([door('c', { seal: 'medium', closable: true })]);
    setFlags(g, { act: 'act1', seal_looseness: 20 });
    expect(flags(g).seal_points).toBe(40);
    expect(flags(g).seal_stage).toBe(1);
    setFlags(g, { act: 'act2' });
    expect(flags(g).seal_stage).toBe(2);
    expect(events(g, 'seal.stage_up').map((e) => [e.data.from, e.data.stage])).toEqual([
      [0, 1],
      [1, 2],
    ]);
    // the looseness falls back below 15 when a door closes, the stage stays
    setFlags(g, { seal_looseness: 14, 'test.c': true });
    open(g, 'c');
    g.queue('doors.close', { doorId: 'c' });
    g.step(1);
    expect(flags(g).seal_looseness).toBe(15);
    setFlags(g, { seal_looseness: 10 });
    expect(flags(g).seal_stage).toBe(2);
  });
});

describe('S: seal_unrest by act (6.4.4)', () => {
  it('act 1: the first door and the inner court add nothing, other doors 3, the abyss 18', () => {
    const g = gameWith([
      keyed('awaken'),
      keyed('inner_garden'),
      keyed('tide_sight'),
      keyed('vocation_warlock'),
    ]);
    setFlags(g, { act: 'act1', 'test.awaken': true, 'test.inner_garden': true });
    expect(flags(g)['door.awaken']).toBe(true);
    expect(flags(g)['door.inner_garden']).toBe(true);
    expect(flags(g).seal_unrest ?? 0).toBe(0);
    // the first door is micro, the court medium: 1 + 4 points
    expect(flags(g).seal_points).toBe(5);
    setFlags(g, { 'test.tide_sight': true });
    open(g, 'tide_sight');
    expect(flags(g).seal_unrest).toBe(3);
    setFlags(g, { 'test.vocation_warlock': true });
    open(g, 'vocation_warlock');
    expect(flags(g).seal_unrest).toBe(21);
  });

  it('act 3 and later: only the ruins-keyed doors (3) and forbidden doors (6) add', () => {
    expect(unrestDelta(door('d'), 2)).toBe(3);
    expect(unrestDelta(door('d'), 3)).toBe(0);
    expect(unrestDelta(door('r', { unrest: 'ruins' }), 3)).toBe(3);
    expect(unrestDelta(door('f', { forbidden: true }), 3)).toBe(6);
    expect(unrestDelta(door('f', { forbidden: true }), 2)).toBe(9);
    expect(unrestDelta(door('n', { unrest: 'none' }), 1)).toBe(0);
    expect(unrestDelta(door('p'), 0)).toBe(0);
    const g = gameWith([
      door('plain', { act: 3 }),
      keyed('resonance'),
      door('f', { act: 3, forbidden: true }),
    ]);
    setFlags(g, { act: 'act3', 'test.plain': true, 'test.resonance': true, 'test.f': true });
    open(g, 'plain');
    expect(flags(g).seal_unrest ?? 0).toBe(0);
    open(g, 'resonance');
    expect(flags(g).seal_unrest).toBe(3);
    open(g, 'f');
    expect(flags(g).seal_unrest).toBe(9);
    // a forbidden door opened in act 3 counts for the act 3 tally as well (D-054)
    expect(flags(g).danger_doors_act3).toBe(1);
  });
});

describe('the seal kept in step with content writes', () => {
  it('a scene adding looseness moves the half points; a door adds on top', () => {
    const g = makeGame();
    setFlags(g, { act: 'act1', seal_looseness: 5 });
    expect(flags(g).seal_points).toBe(10);
    expect(flags(g).seal_stage).toBe(1);
    setFlags(g, { p_past_life_door: 'notes' });
    // the past-life door is micro
    expect(flags(g).seal_points).toBe(11);
    expect(flags(g).seal_looseness).toBe(5.5);
  });
});

describe('a content write and a door opening in the same tick', () => {
  it('keeps the written looseness under the door increment, whatever the tick phase', () => {
    for (let phase = 0; phase < 10; phase++) {
      const g = gameWith([door('auto', { seal: 'medium', auto: true })]);
      g.step(phase);
      // a scene writes the looseness and the door's key in one go (the act 1 dream does)
      g.queue('flag.set', { key: 'seal_looseness', value: 5 });
      g.queue('flag.set', { key: 'test.auto', value: true });
      g.step(12);
      expect(flags(g)['door.auto'], `phase ${phase}`).toBe(true);
      expect(flags(g).seal_points, `phase ${phase}`).toBe(14);
      expect(flags(g).seal_looseness, `phase ${phase}`).toBe(7);
    }
  });
});
