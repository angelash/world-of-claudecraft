// Keys (thousand_doors.md 5; section 23 group K, M1 rows plus the primitives): the judge
// is pure (the same world twice gives the same answers and nothing is written), the
// substitutes of an alt key come into force once the original's person is gone, item keys
// are remembered or consumed, a displayed item is not held, every primitive reads what 5.1
// says, and a sequence key wants its steps in order.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine, worldHash } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { doorState } from '../src/systems/doors';
import { evalKey, keyProgress, keysMet } from '../src/systems/doors/keys';
import type { KeyCond } from '../src/systems/doors/types';
import { addItem, countItem, removeItem } from '../src/systems/inventory';
import { addBond } from '../src/systems/party';
import {
  door,
  events,
  flags,
  gameWith,
  lastResult,
  makeGame,
  merge,
  open,
  SYSTEMS,
  setFlags,
  withCtx,
} from './doors_harness';

describe('K: the judge is pure (5.2)', () => {
  it('gives the same answers twice over one world state and writes nothing', () => {
    const g = makeGame();
    setFlags(g, {
      act: 'act1',
      'boss.crystal_mother.defeated': true,
      'trust.oola': 70,
      a1_oola_fate: 'convicted',
      'trust.martha': 85,
    });
    withCtx(g, (ctx) => addItem(ctx, 'player', 'crystal_carapace', 1));
    const before = JSON.stringify(g.world);
    const hash = worldHash(g.world);
    const content = buildContent();
    const read = () =>
      content.doors.map((d) => ({
        id: d.id,
        keys: keyProgress(g.world, d, content),
        met: keysMet(g.world, d, content),
      }));
    const a = read();
    const b = read();
    expect(b).toEqual(a);
    expect(JSON.stringify(g.world)).toBe(before);
    expect(worldHash(g.world)).toBe(hash);
    // at least one door reads open keys, so the comparison is not over empty answers
    expect(a.some((x) => x.met)).toBe(true);
  });
});

describe('K: substitutes (替钥, 5.4)', () => {
  it('a person dying opens the alt substitute; the door becomes openable', () => {
    const key: KeyCond = {
      type: 'alt',
      label: 'ask Bron',
      of: [
        { type: 'trust', npc: 'bron', min: 60, label: 'Bron trusts you' },
        { type: 'trust', npc: 'moss', min: 40, label: 'or the reeve does' },
      ],
    };
    // both people are in the content (persona stubs; the npc system is not running)
    const content = merge();
    content.doors = [door('mentor', { keys: [key] })];
    (content as { npcs: unknown }).npcs = [{ id: 'bron' }, { id: 'moss' }];
    const g = Engine.create(3, content as ContentMap, SYSTEMS);
    const d = content.doors[0];
    if (!d) throw new Error('no door');
    setFlags(g, { 'trust.moss': 50 });
    // Bron is alive: the reeve's trust does not stand in for his
    expect(evalKey(g.world, d, key, '0', g.content)).toMatchObject({
      met: false,
      substitute: false,
    });
    expect(doorState(g.world, 'mentor')).not.toBe('openable');
    open(g, 'mentor');
    expect(lastResult(g, 'doors.open')?.code).toBe('no_key');
    setFlags(g, { 'npc.bron.dead': true });
    expect(evalKey(g.world, d, key, '0', g.content)).toMatchObject({
      met: true,
      substitute: true,
    });
    expect(doorState(g.world, 'mentor')).toBe('openable');
    open(g, 'mentor');
    expect(flags(g)['door.mentor']).toBe(true);
  });

  it('an alt key reads the progress of the key in force (the original, else a substitute)', () => {
    const key: KeyCond = {
      type: 'alt',
      label: 'Oola',
      of: [
        { type: 'item', itemId: 'spring_herb', count: 3, label: 'herbs' },
        { type: 'item', itemId: 'crystal_carapace', label: 'carapace' },
      ],
      when: 'a1_oola_fate == fled',
    };
    const g = gameWith([door('h', { keys: [key] })]);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'spring_herb', 1));
    g.step(12);
    const d = g.content.doors[0];
    if (!d) throw new Error('no door');
    expect(evalKey(g.world, d, key, '0', g.content)).toMatchObject({
      met: false,
      cur: 1,
      need: 3,
      started: true,
    });
    // a held share shows the door at the glimpse level, with its progress
    expect(doorState(g.world, 'h')).toBe('hinted');
    expect(g.world.slices.doors.doors.h?.hintLevel).toBe(2);
  });

  it('a trust or rank reading under its threshold does not show a door by itself', () => {
    const g = gameWith([
      door('t', { keys: [{ type: 'trust', npc: 'oola', min: 60, label: 'Oola' }] }),
      door('r', { keys: [{ type: 'rank', min: 20, label: 'rank 20' }] }),
    ]);
    setFlags(g, { act: 'act1', 'trust.oola': 30 });
    expect(doorState(g.world, 't')).toBe('hidden');
    expect(doorState(g.world, 'r')).toBe('hidden');
  });

  it('an unknown key type is never met and does not stop the refresh', () => {
    const g = gameWith([
      door('odd', { keys: [{ type: 'level', min: 1, label: 'old level key' } as never] }),
      door('fine'),
    ]);
    setFlags(g, { act: 'act1', 'test.fine': true });
    expect(doorState(g.world, 'odd')).toBe('hidden');
    expect(doorState(g.world, 'fine')).toBe('openable');
  });

  it('the druid door: Oola, or the deer-kin herbalist once Oola is not cleared', () => {
    const g = makeGame();
    const druid = g.content.doors.find((x) => x.id === 'vocation_druid');
    const alt = druid?.keys[0];
    if (!druid || alt?.type !== 'alt') throw new Error('no alt key on the druid door');
    setFlags(g, { 'trust.baishan': 60 });
    expect(evalKey(g.world, druid, alt, '0', g.content).met).toBe(false);
    setFlags(g, { a1_oola_fate: 'cleared' });
    expect(evalKey(g.world, druid, alt, '0', g.content).met).toBe(false);
    setFlags(g, { a1_oola_fate: 'fled' });
    expect(evalKey(g.world, druid, alt, '0', g.content).met).toBe(true);
    setFlags(g, { a1_oola_fate: 'cleared', 'trust.oola': 60 });
    expect(evalKey(g.world, druid, alt, '0', g.content).met).toBe(true);
  });

  it("the hunter door: Shiya's hunt, or another hunter's once she has left", () => {
    const g = makeGame();
    const hunter = g.content.doors.find((x) => x.id === 'vocation_hunter');
    const alt = hunter?.keys[0];
    if (!hunter || alt?.type !== 'alt') throw new Error('no alt key on the hunter door');
    setFlags(g, { 'trust.jakob_schilf': 30 });
    expect(evalKey(g.world, hunter, alt, '0', g.content).met).toBe(false);
    setFlags(g, { 'companion.shiya.state': 'left' });
    expect(evalKey(g.world, hunter, alt, '0', g.content).met).toBe(true);
  });
});

describe('K: item keys (5.5)', () => {
  it('a remembered key stays in the pack, a consumed one goes into the door', () => {
    const g = gameWith([
      door('keep', { keys: [{ type: 'item', itemId: 'crystal_carapace', label: 'carapace' }] }),
      door('eat', {
        keys: [{ type: 'item', itemId: 'dian_core', consume: true, label: 'core' }],
      }),
    ]);
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'crystal_carapace', 1);
      addItem(ctx, 'player', 'dian_core', 1);
    });
    g.step(12);
    open(g, 'keep');
    open(g, 'eat');
    expect(flags(g)['door.keep']).toBe(true);
    expect(flags(g)['door.eat']).toBe(true);
    expect(countItem(g.world, 'player', 'crystal_carapace')).toBe(1);
    expect(countItem(g.world, 'player', 'dian_core')).toBe(0);
  });

  it('an item held by another holder (the court display, PK-M1-53) does not open a door', () => {
    const g = gameWith([
      door('shown', { keys: [{ type: 'item', itemId: 'crystal_carapace', label: 'carapace' }] }),
    ]);
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'crystal_carapace', 1);
      // the inner court's display holds it (PK-M1-53 keeps displays as their own holder)
      removeItem(ctx, 'player', 'crystal_carapace', 1, 'display');
      addItem(ctx, 'court_display', 'crystal_carapace', 1);
    });
    g.step(12);
    expect(countItem(g.world, 'court_display', 'crystal_carapace')).toBe(1);
    expect(doorState(g.world, 'shown')).toBe('hidden');
    open(g, 'shown');
    expect(lastResult(g, 'doors.open')?.code).toBe('no_key');
  });
});

describe('the sixteen primitives and the combinators (5.1)', () => {
  const cases: {
    key: KeyCond;
    before: Record<string, string | number | boolean>;
    after: Record<string, string | number | boolean>;
  }[] = [
    {
      key: { type: 'deed', deed: 'deed_x', label: 'd' },
      before: {},
      after: { 'deed.deed_x': true },
    },
    {
      key: { type: 'trial', goddess: 'merca', min: 3, label: 't' },
      before: { 'trial_wins.merca': 2 },
      after: { 'trial_wins.merca': 3 },
    },
    {
      key: { type: 'trial', trial: 'trl_x', label: 't' },
      before: {},
      after: { 'trial_done.trl_x': true },
    },
    {
      key: { type: 'trust', npc: 'oola', min: 60, label: 't' },
      before: { 'trust.oola': 59 },
      after: { 'trust.oola': 60 },
    },
    {
      key: { type: 'trust', npc: '*', min: 80, label: 't' },
      before: { 'trust.oola': 79 },
      after: { 'trust.martha': 80 },
    },
    {
      key: { type: 'taught', door: 'x', mentors: ['barto', 'dirk_schwarz'], label: 't' },
      before: {},
      after: { 'taught.x.dirk_schwarz': true },
    },
    {
      key: { type: 'choice', key: 'a1_oola_fate', equals: 'fled', label: 'c' },
      before: { a1_oola_fate: 'cleared' },
      after: { a1_oola_fate: 'fled' },
    },
    {
      key: { type: 'dungeon', dungeon: 'dg_old_mine', depth: 2, label: 'd' },
      before: { 'dg.dg_old_mine.cleared': true, 'dg.dg_old_mine.depth': 1 },
      after: { 'dg.dg_old_mine.depth': 2 },
    },
    {
      key: { type: 'know', key: 'read.lb_formula_workbook', label: 'k' },
      before: {},
      after: { 'read.lb_formula_workbook': true },
    },
    {
      key: { type: 'time', key: 'a5_revelation_trial', act: 5, label: 't' },
      before: { a5_revelation_trial: true, act: 'act4' },
      after: { act: 'act5' },
    },
    {
      key: { type: 'cond', expr: 'remnants >= 15 AND a2_remnants_settled', label: 'c' },
      before: { remnants: 15 },
      after: { a2_remnants_settled: true },
    },
    {
      key: {
        type: 'all',
        label: 'a',
        of: [
          { type: 'flag', key: 'test.a', label: 'a' },
          { type: 'flag', key: 'test.b', label: 'b' },
        ],
      },
      before: { 'test.a': true },
      after: { 'test.b': true },
    },
  ];

  for (const c of cases) {
    it(`${c.key.type} ${JSON.stringify(c.after)}`, () => {
      const g = gameWith([door('k', { keys: [c.key] })]);
      const d = g.content.doors[0];
      if (!d) throw new Error('no door');
      setFlags(g, c.before);
      expect(evalKey(g.world, d, c.key, '0', g.content).met).toBe(false);
      setFlags(g, c.after);
      expect(evalKey(g.world, d, c.key, '0', g.content).met).toBe(true);
    });
  }

  it('rank reads the door rank; door reads another door (to a tier)', () => {
    const g = gameWith([
      door('a', { rankValue: 2 }),
      door('r', { keys: [{ type: 'rank', min: 3, label: 'rank 3' }] }),
      door('t', { keys: [{ type: 'door', doorId: 'a', tier: 2, label: 'a II' }] }),
    ]);
    expect(doorState(g.world, 'r')).toBe('hidden');
    setFlags(g, { 'test.a': true });
    open(g, 'a');
    g.step(12);
    // P 2: rank 3
    expect(doorState(g.world, 'r')).toBe('openable');
    expect(doorState(g.world, 't')).not.toBe('openable');
    setFlags(g, { 'door.a.tier': 2 });
    expect(doorState(g.world, 't')).toBe('openable');
  });

  it('bond reads the party, count reads the counters', () => {
    const g = makeGame();
    const d = door('b', {
      keys: [{ type: 'bond', companion: 'shiya', min: 40, label: 'bond' }],
    });
    setFlags(g, { 'companion.shiya.recruited': true });
    expect(evalKey(g.world, d, d.keys[0] as KeyCond, '0').met).toBe(false);
    withCtx(g, (ctx) => {
      const m = ctx.world.slices.party.members.shiya;
      if (m) addBond(ctx, m, 45, 'test');
    });
    expect(evalKey(g.world, d, d.keys[0] as KeyCond, '0').met).toBe(true);
  });
});

describe('sequence keys (序钥, 5.1)', () => {
  const seq: KeyCond = {
    type: 'seq',
    label: 'grasp, then the pact',
    of: [
      { type: 'flag', key: 'test.grasp', label: 'grasp the crystal' },
      { type: 'flag', key: 'test.pact', label: 'make the pact' },
    ],
  };

  it('in order: the steps add up and the door opens', () => {
    const g = gameWith([door('s', { keys: [seq] })]);
    setFlags(g, { 'test.grasp': true });
    expect(g.world.slices.doors.counters['seq:s:0']).toBe(1);
    expect(doorState(g.world, 's')).toBe('hinted');
    setFlags(g, { 'test.pact': true });
    expect(doorState(g.world, 's')).toBe('openable');
  });

  it('out of order: the pact before the grasp voids the key for good', () => {
    const g = gameWith([door('s', { keys: [seq] })]);
    setFlags(g, { 'test.pact': true });
    expect(g.world.slices.doors.counters['seq:s:0']).toBe(-1);
    setFlags(g, { 'test.grasp': true });
    expect(doorState(g.world, 's')).not.toBe('openable');
    expect(events(g, 'doors.state').some((e) => e.data.to === 'openable')).toBe(false);
  });

  it('a counted step does not count before its turn', () => {
    const counted: KeyCond = {
      type: 'seq',
      label: 'first the flag, then a kill',
      of: [
        { type: 'flag', key: 'test.first', label: 'first' },
        { type: 'count', event: 'feat.performed', count: 1, label: 'then a feat' },
      ],
    };
    const g = gameWith([door('c', { keys: [counted] })]);
    withCtx(g, (ctx) => ctx.emit('feat.performed', { entityId: 'player', tier: 1 } as never));
    g.step(12);
    expect(g.world.slices.doors.counters['c:0.1'] ?? 0).toBe(0);
    setFlags(g, { 'test.first': true });
    withCtx(g, (ctx) => ctx.emit('feat.performed', { entityId: 'player', tier: 1 } as never));
    g.step(12);
    expect(g.world.slices.doors.counters['c:0.1']).toBe(1);
    expect(doorState(g.world, 'c')).toBe('openable');
  });
});
