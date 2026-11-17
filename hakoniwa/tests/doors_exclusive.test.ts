// Exclusion (thousand_doors.md 9.1; section 23 group X, the act 1 groups): X1 the past-life
// variants lock each other for good; X2 the abyss door's act 1 version and the shapeshift
// door lock each other within act 1 only, back to unseen from act 3; X3 the abyss and the
// clear-flow doors lock for good; forceClose closes an open member. The shipped data
// carries the groups as X codes with their modes.

import { describe, expect, it } from 'vitest';
import { doorState } from '../src/systems/doors';
import { addItem } from '../src/systems/inventory';
import { door, flags, gameWith, makeGame, open, setFlags, withCtx } from './doors_harness';

describe('the shipped act 1 groups', () => {
  it('carry X1 lock, X2 actLock in act 1 until act 3, X3 lock', () => {
    const g = makeGame();
    const ex = (id: string) => g.content.doors.find((d) => d.id === id)?.exclusive;
    expect(ex('past_life_hearth')).toEqual([{ group: 'X1', mode: 'lock' }]);
    expect(ex('vocation_druid')).toEqual([{ group: 'X2', mode: 'actLock', act: 1, until: 3 }]);
    expect(ex('vocation_warlock')).toEqual([
      { group: 'X2', mode: 'actLock', act: 1, until: 3 },
      { group: 'X3', mode: 'lock' },
    ]);
    expect(ex('clear_flow')).toEqual([{ group: 'X3', mode: 'lock' }]);
  });

  it('X1: the chosen past life locks the seven others for good', () => {
    const g = makeGame();
    setFlags(g, { act: 'prologue', p_past_life_door: 'signpost' });
    const variants = g.content.doors.filter((d) => d.code === 'door_past_life');
    expect(variants.length).toBe(8);
    for (const v of variants)
      expect(doorState(g.world, v.id), v.id).toBe(
        v.id === 'past_life_signpost' ? 'opened' : 'locked',
      );
    setFlags(g, { act: 'act3' });
    expect(doorState(g.world, 'past_life_hearth')).toBe('locked');
  });

  it('X2 and X3: grasping the core in act 1 locks the shapeshift door until act 3', () => {
    const g = makeGame();
    setFlags(g, { act: 'act1' });
    withCtx(g, (ctx) => addItem(ctx, 'player', 'dian_core', 1));
    g.step(12);
    open(g, 'vocation_warlock');
    expect(doorState(g.world, 'vocation_warlock')).toBe('opened');
    expect(doorState(g.world, 'vocation_druid')).toBe('locked');
    expect(doorState(g.world, 'clear_flow')).toBe('locked');
    g.queue('doors.open', { doorId: 'vocation_druid' });
    g.step(1);
    setFlags(g, { act: 'act2' });
    expect(doorState(g.world, 'vocation_druid')).toBe('locked');
    setFlags(g, { act: 'act3' });
    // back to unseen, keys judged again; X3 stays locked for good
    expect(doorState(g.world, 'vocation_druid')).toBe('hidden');
    expect(doorState(g.world, 'clear_flow')).toBe('locked');
  });

  it('X2 does not lock outside its act', () => {
    const g = gameWith([
      door('abyss', { exclusive: [{ group: 'X2', mode: 'actLock', act: 1, until: 3 }] }),
      door('shape', { exclusive: [{ group: 'X2', mode: 'actLock', act: 1, until: 3 }] }),
    ]);
    setFlags(g, { act: 'act3', 'test.abyss': true });
    open(g, 'abyss');
    expect(doorState(g.world, 'abyss')).toBe('opened');
    expect(doorState(g.world, 'shape')).not.toBe('locked');
  });
});

describe('forceClose (9.1)', () => {
  it('closes an open member through the close settlement and locks an unopened one', () => {
    const g = gameWith([
      door('vow', {
        seal: 'medium',
        exclusive: [{ group: 'X12', mode: 'forceClose' }],
        effects: [{ type: 'feature', feature: 'test_vow' }],
      }),
      // X12 is one way: the page door sets it off and stays untouched itself
      door('page', { exclusive: [{ group: 'X12', mode: 'forceClose', source: true }] }),
      door('other', { exclusive: [{ group: 'X12', mode: 'forceClose' }] }),
    ]);
    setFlags(g, { 'test.vow': true, 'test.page': true });
    open(g, 'vow');
    expect(flags(g)['feature.test_vow']).toBe(true);
    expect(flags(g).seal_points).toBe(4);
    open(g, 'page');
    expect(doorState(g.world, 'vow')).toBe('closed');
    expect(flags(g)['feature.test_vow']).toBe(false);
    expect(flags(g)['door.vow']).toBe(false);
    // the medium door settles 2 points back
    expect(flags(g).seal_points).toBe(2);
    expect(doorState(g.world, 'other')).toBe('locked');
  });
});

describe('saves from before the act locks and newer content', () => {
  it('a door locked for good by the old X2 gets its return act; a new door gets an entry', () => {
    const g = makeGame();
    // the slice as an old save holds it: no rank, seal or lock fields, one door missing
    withCtx(g, (ctx) => {
      const s = ctx.world.slices.doors;
      for (const k of Object.keys(s) as (keyof typeof s)[])
        if (k !== 'doors' && k !== 'counters' && k !== 'visited') delete s[k];
      const warlock = s.doors.vocation_warlock;
      const druid = s.doors.vocation_druid;
      if (warlock) warlock.state = 'opened';
      if (druid) druid.state = 'locked';
      delete s.doors.tide_sight;
    });
    setFlags(g, { act: 'act2' });
    expect(g.world.slices.doors.doors.vocation_druid?.lockedUntil).toBe(3);
    expect(g.world.slices.doors.doors.tide_sight?.state).toBe('hidden');
    // the warlock door counts in the rank (rank value 2: rank 3)
    expect(g.world.slices.doors.rank).toBe(3);
    setFlags(g, { act: 'act3' });
    expect(doorState(g.world, 'vocation_druid')).toBe('hidden');
  });
});
