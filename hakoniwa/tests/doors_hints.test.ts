// Discovery and the hint director (thousand_doors.md 2.1, 3.2, 18; section 23 group N, the
// M1 row "no model": with the model off every hint comes from the written lines and the
// act 1 cracks appear as usual). Also the director's own rules (the M2 row, kept here as
// the director ships now): integer scores with the door id as tie-break, Janu's dream never
// pushing a forbidden door even when it scores best, two hints a game day, one dream a
// night, no dream at seal stage 0, a rumour only for a place or a person; and the
// corridor's segments growing with the end-hall doors.

import { describe, expect, it } from 'vitest';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { corridorLayout, corridorView, doorState } from '../src/systems/doors';
import { giveHint, hintCandidates, hintLevelFor, REAL_MINUTE } from '../src/systems/doors/hints';
import { door, events, gameWith, makeGame, open, setFlags, withCtx } from './doors_harness';

function slept(g: ReturnType<typeof makeGame>): void {
  withCtx(g, (ctx) =>
    ctx.emit('time.skipped', {
      kind: 'sleep',
      mode: 'short',
      entityId: 'player',
      outcome: 'done',
      hours: 8,
      notes: [],
      more: 0,
    }),
  );
}

describe('N: no model, the act 1 cracks (18.1, prologue 4.8, 8 row 1)', () => {
  it("the prologue's two tendencies crack their doors once the corridor shows", () => {
    const g = makeGame();
    setFlags(g, { act: 'prologue', p_door_hints: 'blade,shadow' });
    setFlags(g, { act: 'act1' });
    // the corridor is not there before the first door
    expect(doorState(g.world, 'vocation_warrior')).toBe('hidden');
    setFlags(g, { 'feature.door_corridor': true });
    expect(doorState(g.world, 'vocation_warrior')).toBe('hinted');
    // the false-record door is an act 2 door: a crack shows, no more
    expect(doorState(g.world, 'false_record')).toBe('hinted');
    expect(doorState(g.world, 'vocation_hunter')).toBe('hidden');
    const view = corridorView(g.world, g.content);
    const record = view.find((d) => d.id === 'false_record');
    expect(record).toMatchObject({ hintLevel: 1, nameShown: false, name: '' });
    expect(record?.code).toBeUndefined();
    expect(record?.keys.length).toBe(1);
    expect(record?.keys[0]?.shown).toBe(true);
    expect(record?.keysLeft).toBe(2);
    // the hint is the door's own written crack line (a content key of the door's hint field)
    const hints = events(g, 'doors.hint');
    expect(hints.map((e) => [e.data.doorId, e.data.channel, e.data.level])).toEqual([
      ['vocation_warrior', 'tendency', 1],
      ['false_record', 'tendency', 1],
    ]);
    expect(hints.map((e) => e.data.text)).toEqual([
      { key: 'c.doors.vocation_warrior.hint' },
      { key: 'c.doors.false_record.hint' },
    ]);
  });

  it('a night of sleep from seal stage 1 gives one dream hint from the written lines', () => {
    const g = makeGame();
    setFlags(g, { act: 'act1', seal_looseness: 5 });
    slept(g);
    const dream = events(g, 'doors.hint').filter((e) => e.data.channel === 'dream');
    expect(dream.length).toBe(1);
    const picked = dream[0]?.data.doorId ?? '';
    expect(dream[0]?.data.text).toEqual({ key: `c.doors.${picked}.hint` });
    // one dream a night: a second sleep the same day gives none
    slept(g);
    expect(events(g, 'doors.hint').filter((e) => e.data.channel === 'dream').length).toBe(1);
  });
});

describe('the hint director (18.3)', () => {
  it('scores by the rules with the door id as tie-break, the same state the same pick', () => {
    const g = gameWith([
      door('main', { main: true }),
      door('plain'),
      door('banned', { forbidden: true, category: 'forbidden', wing: 'draft' }),
      door('later', { act: 2 }),
      door('taste', { tendency: 'blade' }),
      door('near', {
        keys: [{ type: 'visit', mapId: 'forest_edge', location: 'deer_spring', label: 'go' }],
      }),
      door('begun', {
        keys: [
          { type: 'flag', key: 'test.begun', label: 'a' },
          { type: 'flag', key: 'test.begun2', label: 'b' },
        ],
      }),
    ]);
    g.queue('world.teleport', { entityId: 'player', mapId: 'forest_edge', x: 19.5, y: 35.5 });
    setFlags(g, { act: 'act1', p_door_hints: 'blade', 'test.begun': true });
    const a = hintCandidates(g.world, g.content);
    expect(a.map((c) => [c.doorId, c.score])).toEqual([
      ['begun', 30],
      ['near', 20],
      ['main', 15],
      ['taste', 10],
      ['plain', 0],
      ['banned', -40],
    ]);
    expect(hintCandidates(g.world, g.content)).toEqual(a);
    // a drought of thirty real minutes adds ten to every door
    withCtx(g, (ctx) => {
      ctx.world.slices.doors.drought = 30 * REAL_MINUTE;
    });
    expect(hintCandidates(g.world, g.content).find((c) => c.doorId === 'plain')?.score).toBe(10);
  });

  it('a door hinted a game day ago weighs five more', () => {
    const g = gameWith([door('a'), door('b')]);
    setFlags(g, { act: 'act1', seal_looseness: 30 });
    let first: string | null = null;
    withCtx(g, (ctx) => {
      first = giveHint(ctx, 'dream');
    });
    expect(first).toBe('a');
    g.step(24 * TICKS_PER_GAME_HOUR);
    const scores = new Map(hintCandidates(g.world, g.content).map((c) => [c.doorId, c.score]));
    expect(scores.get('a')).toBe(5);
    expect(scores.get('b')).toBe(0);
  });

  it('a dream never pushes a forbidden door, even the best-scored; two hints a day at most', () => {
    const g = gameWith([
      door('banned', {
        forbidden: true,
        category: 'forbidden',
        wing: 'draft',
        main: true,
        tendency: 'blade',
        keys: [
          { type: 'flag', key: 'test.banned', label: 'a' },
          { type: 'flag', key: 'test.banned2', label: 'b' },
        ],
      }),
      door('a'),
      door('b'),
      door('c'),
    ]);
    setFlags(g, { act: 'act1', seal_looseness: 30, p_door_hints: 'blade', 'test.banned': true });
    // progress 30, main 15, tendency 10, forbidden -40: it leads the list
    expect(hintCandidates(g.world, g.content)[0]).toEqual({ doorId: 'banned', score: 15 });
    const before = g.world.slices.doors.doors.banned?.hintLevel ?? 0;
    const picks: (string | null)[] = [];
    withCtx(g, (ctx) => {
      picks.push(giveHint(ctx, 'dream'), giveHint(ctx, 'dream'), giveHint(ctx, 'dream'));
    });
    expect(picks).toEqual(['a', 'b', null]);
    expect(g.world.slices.doors.doors.banned?.hintLevel ?? 0).toBe(before);
    // the dream's strength follows the seal stage (capped at 1 in act 1)
    expect(g.world.slices.doors.doors.a?.hintLevel).toBe(1);
  });

  it('a rumour only tells of a door with a place or a person to its keys', () => {
    const g = gameWith([
      door('bare'),
      door('placed', { keys: [{ type: 'visit', mapId: 'forest_edge', label: 'go there' }] }),
    ]);
    setFlags(g, { act: 'act1' });
    let pick: string | null = null;
    withCtx(g, (ctx) => {
      pick = giveHint(ctx, 'rumor');
    });
    expect(pick).toBe('placed');
  });

  it('no dream at seal stage 0; levels rise by one, by two in a drought, to the top after', () => {
    const g = gameWith([door('a')]);
    setFlags(g, { act: 'act1' });
    slept(g);
    expect(events(g, 'doors.hint').length).toBe(0);
    const d = door('x');
    const placed = door('y', {
      keys: [{ type: 'visit', mapId: 'forest_edge', label: 'go there' }],
    });
    const min = REAL_MINUTE;
    expect(hintLevelFor(1, 0, d, 'rumor', 0)).toBe(2);
    expect(hintLevelFor(1, 121 * min, d, 'rumor', 0)).toBe(3);
    expect(hintLevelFor(0, 241 * min, d, 'rumor', 0)).toBe(3);
    expect(hintLevelFor(0, 241 * min, placed, 'rumor', 0)).toBe(4);
    expect(hintLevelFor(0, 241 * min, placed, 'dream', 2)).toBe(2);
  });
});

describe('the corridor grows by segment (2.1)', () => {
  it('the first door shows the inner court at the glimpse level; act 2 grows its hall', () => {
    const g = makeGame();
    setFlags(g, { act: 'act1' });
    expect(corridorLayout(g.world, g.content).segments).toEqual([]);
    expect(doorState(g.world, 'inner_garden')).toBe('hidden');
    setFlags(g, { 'feature.door_corridor': true });
    expect(corridorLayout(g.world, g.content).segments).toEqual([1]);
    expect(doorState(g.world, 'inner_garden')).toBe('hinted');
    expect(g.world.slices.doors.doors.inner_garden?.hintLevel).toBe(2);
    expect(doorState(g.world, 'trade_pact')).toBe('hidden');
    setFlags(g, { act: 'act2' });
    expect(corridorLayout(g.world, g.content).segments).toEqual([1, 2]);
    for (const id of ['trade_pact', 'wayfaring']) expect(doorState(g.world, id), id).toBe('hinted');
    const wings = corridorLayout(g.world, g.content).wings;
    expect(wings.find((w) => w.wing === 'court')?.seen).toBe(1);
    expect(wings.find((w) => w.wing === 'paths')?.seen).toBe(1);
  });

  it('a glimpse shows the keys met or under way and how many are left', () => {
    const g = gameWith([
      door('two', {
        keys: [
          { type: 'flag', key: 'test.one', label: 'one' },
          { type: 'flag', key: 'test.two', label: 'two' },
          { type: 'flag', key: 'test.three', label: 'three' },
        ],
      }),
    ]);
    setFlags(g, { act: 'act1', 'test.two': true });
    const v = corridorView(g.world, g.content).find((d) => d.id === 'two');
    expect(v).toMatchObject({ state: 'hinted', hintLevel: 2, nameShown: true, keysLeft: 2 });
    expect(v?.name).toBe('two');
    expect(v?.keys.map((k) => k.label)).toEqual(['two']);
    // an openable door discloses every key
    setFlags(g, { 'test.one': true, 'test.three': true });
    const ready = corridorView(g.world, g.content).find((d) => d.id === 'two');
    expect(ready?.state).toBe('openable');
    expect(ready?.keys.map((k) => k.label)).toEqual(['one', 'two', 'three']);
    open(g, 'two');
    expect(corridorView(g.world, g.content).find((d) => d.id === 'two')?.keys.length).toBe(3);
  });

  it('a door locked before it was ever shown stays out of the corridor', () => {
    const g = gameWith([
      door('seen', { exclusive: [{ group: 'X3', mode: 'lock' }] }),
      door('unseen', { act: 3, exclusive: [{ group: 'X3', mode: 'lock' }] }),
    ]);
    setFlags(g, { act: 'act1', 'test.seen': true });
    open(g, 'seen');
    expect(doorState(g.world, 'unseen')).toBe('locked');
    expect(corridorView(g.world, g.content).map((d) => d.id)).toEqual(['seen']);
  });
});
