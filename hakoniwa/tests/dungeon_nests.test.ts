// The nest lifecycle (PK-M1-50; catalog_bestiary.md 2.8 and 6): a nest wakes when its
// condition holds, grows a stage every uncleared season where the sediment allows it, a full
// nest raises its map a level, the fourth stage is a shallow dungeon that opens; killing the
// lord starts the season over; nurture holds it at stage 2; destroy collapses it (the
// collapse switch closes the map's switch area, the map stays a level up for a season);
// purify lowers the map a level for good. Growth over a long time skip matches the ticks.

import { afterEach, describe, expect, it } from 'vitest';
import { validateDungeons } from '../src/content/packs/dungeons';
import { worldHash } from '../src/core/save';
import { localSediment, nestSedimentDelta, sedimentDelta } from '../src/systems/dungeons';
import { walkMap } from '../src/systems/world';
import { isWalkable } from '../src/systems/world/grid';
import {
  BURROW,
  CONFIG,
  DAY,
  days,
  ds,
  fixtureContent,
  flags,
  game,
  kinds,
  MAPS,
  MEADOW_NEST,
  put,
  QUEEN_NEST,
  restorePort,
  SCRIPT,
  type T,
} from './dungeons_harness';

const last = (t: T, kind: string) => kinds(t, kind).at(-1)?.data as Record<string, unknown>;
const lastResult = (t: T) =>
  t.events
    .filter((e) => e.kind === 'command.result')
    .map((e) => e.data as { kind: string; ok: boolean; code?: string })
    .at(-1);
const queen = (t: T) => ds(t.g).nests[QUEEN_NEST.id];
const field = MAPS.find((m) => m.id === 'field') as (typeof MAPS)[number];
const killLord = (t: T) => {
  t.g.queue('zd.die', { kind: 'monster', ref: 'fx_queen', mapId: 'field', x: 11, y: 9 });
  t.g.step(1);
};

afterEach(() => restorePort());

describe('waking and growing', () => {
  it('a nest without a condition is live from the start, with its mirrors', () => {
    const t = game();
    expect(queen(t)).toMatchObject({ live: true, stage: 2, cleared: false });
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.stage`]).toBe(2);
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.phase`]).toBe('lair');
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.choice`]).toBe('untouched');
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.cleared`]).toBe(false);
  });

  it('a nest with a condition sleeps until it holds', () => {
    const t = game();
    expect(ds(t.g).nests[MEADOW_NEST.id]?.live).toBe(false);
    expect(flags(t.g)[`dg.${MEADOW_NEST.id}.stage`]).toBeUndefined();
    t.g.queue('flag.set', { key: 'fx_meadow_wakes', value: true }, SCRIPT);
    t.g.step(2);
    expect(ds(t.g).nests[MEADOW_NEST.id]?.live).toBe(true);
    expect(last(t, 'dungeon.nest_stage')).toEqual({ nestId: MEADOW_NEST.id, stage: 1, from: 0 });
    expect(flags(t.g)[`dg.${MEADOW_NEST.id}.stage`]).toBe(1);
  });

  it('grows a stage after an uncleared season; a full nest raises its map a level', () => {
    const t = game();
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(0);
    days(t, 90);
    expect(queen(t)?.stage).toBe(2);
    days(t, 1);
    expect(queen(t)?.stage).toBe(3);
    expect(last(t, 'dungeon.nest_stage')).toEqual({ nestId: QUEEN_NEST.id, stage: 3, from: 2 });
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.stage`]).toBe(3);
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(1);
    expect(localSediment(t.g.world, t.g.content, field, 2, 2)).toBe(4);
  });

  it('killing the lord starts the season over', () => {
    const t = game();
    days(t, 60);
    killLord(t);
    expect(queen(t)?.cleared).toBe(true);
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.cleared`]).toBe(true);
    expect(last(t, 'dungeon.cleared')).toEqual({ id: QUEEN_NEST.id, kind: 'nest' });
    days(t, 60);
    expect(queen(t)?.stage).toBe(2);
    days(t, 32);
    expect(queen(t)?.stage).toBe(3);
    // the nest grew past the clearing: no longer cleared
    expect(queen(t)?.cleared).toBe(false);
    // a lord dying on another map clears nothing
    t.g.queue('zd.die', { kind: 'monster', ref: 'fx_queen', mapId: 'town', x: 4, y: 4 });
    t.g.step(1);
    expect(queen(t)?.cleared).toBe(false);
  });

  it('the head clears a stage 1 nest, the lord a grown one, and only at the nest', () => {
    const t = game(fixtureContent({ nests: [{ ...QUEEN_NEST, stage: 1 }] as never }));
    const die = (ref: string, x: number, y: number) => {
      t.g.queue('zd.die', { kind: 'monster', ref, mapId: 'field', x, y });
      t.g.step(1);
    };
    // a rat far from the den clears nothing
    die('fx_rat', 25, 15);
    expect(queen(t)?.cleared).toBe(false);
    // the lord has not shown at stage 1
    die('fx_queen', 11, 9);
    expect(queen(t)?.cleared).toBe(false);
    // a rat at the den (a step outside its rectangle) clears the stage 1 nest
    die('fx_rat', 9, 9);
    expect(queen(t)?.cleared).toBe(true);
    days(t, 92);
    expect(queen(t)).toMatchObject({ stage: 2, cleared: false });
    // from stage 2 the rats do not count, the lord does
    die('fx_rat', 11, 9);
    expect(queen(t)?.cleared).toBe(false);
    die('fx_queen', 12, 10);
    expect(queen(t)?.cleared).toBe(true);
  });

  it('thin sediment holds a nest back from the full stage; the fourth stage opens its dungeon', () => {
    const t = game();
    t.g.queue('flag.set', { key: 'fx_meadow_wakes', value: true }, SCRIPT);
    t.g.step(2);
    const meadow = () => ds(t.g).nests[MEADOW_NEST.id];
    days(t, 92);
    expect(meadow()?.stage).toBe(2);
    days(t, 92);
    // level two at the burrow: a full nest needs three
    expect(meadow()?.stage).toBe(2);
    t.g.queue('dungeons.enter', { dungeonId: BURROW.id }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_formed' });
    // the meadow thickens (a goddess-made surge, say): the content says so with a new level
    const thick = fixtureContent({
      maps: MAPS.map((m) =>
        m.id === 'meadow'
          ? {
              ...m,
              locations: m.locations.map((l) => (l.id === 'burrow' ? { ...l, sediment: 3 } : l)),
            }
          : m,
      ),
    });
    const t2 = game(thick);
    t2.g.queue('flag.set', { key: 'fx_meadow_wakes', value: true }, SCRIPT);
    t2.g.step(2);
    days(t2, 92 * 3);
    const st = ds(t2.g).nests[MEADOW_NEST.id];
    expect(st).toMatchObject({ stage: 4, matured: true });
    expect(flags(t2.g)[`dg.${MEADOW_NEST.id}.phase`]).toBe('shallow');
    expect(last(t2, 'dungeon.formed')).toEqual({ dungeonId: BURROW.id, nestId: MEADOW_NEST.id });
    t2.g.queue('dungeons.enter', { dungeonId: BURROW.id }, SCRIPT);
    t2.g.step(1);
    expect(lastResult(t2)).toMatchObject({ ok: true });
    expect(ds(t2.g).run).toMatchObject({ dungeon: BURROW.id });
    // a matured nest is a dungeon now: no more growth, and no nest dispositions
    t2.g.queue('dungeons.dispose', { id: MEADOW_NEST.id, choice: 'nurture' }, SCRIPT);
    t2.g.step(1);
    expect(lastResult(t2)).toMatchObject({ ok: false, code: 'not_offered' });
  });

  it('grows over a long time skip exactly as tick by tick', () => {
    // two-day seasons, so the tick-by-tick run stays short
    const quick = fixtureContent({
      dungeonConfig: { ...CONFIG, nest: { ...CONFIG.nest, stageDays: 2 } },
    });
    const skip = game(quick);
    days(skip, 5);
    const ticks = game(quick);
    ticks.g.step(skip.g.world.meta.tick - ticks.g.world.meta.tick);
    expect(ds(ticks.g).nests[QUEEN_NEST.id]).toEqual(ds(skip.g).nests[QUEEN_NEST.id]);
    expect(ds(skip.g).nests[QUEEN_NEST.id]).toMatchObject({ stage: 4, matured: true });
  }, 120000);
});

describe('nurture, destroy, purify', () => {
  it('every disposition waits for the lord, and a player stands at the nest', () => {
    const t = game();
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'nurture' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_cleared' });
    killLord(t);
    put(t, 'field', 25, 15);
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'destroy' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'far' });
    put(t, 'field', 11, 9);
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'bake' as never });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'bad_choice' });
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'destroy' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
  });

  it('nurture holds a full nest at stage 2', () => {
    const t = game();
    days(t, 92);
    expect(queen(t)?.stage).toBe(3);
    killLord(t);
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'nurture' }, SCRIPT);
    t.g.step(1);
    expect(queen(t)).toMatchObject({ stage: 2, choice: 'nurture' });
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.stage`]).toBe(2);
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.choice`]).toBe('nurture');
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(0);
    // kept cleared each season, it stays at 2
    for (let i = 0; i < 3; i++) {
      days(t, 80);
      killLord(t);
    }
    expect(queen(t)?.stage).toBe(2);
  });

  it('destroy collapses the nest: the collapse switch closes, the map is a level up for a season', () => {
    const t = game();
    killLord(t);
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'destroy' }, SCRIPT);
    t.g.step(1);
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.choice`]).toBe('destroy');
    const until = queen(t)?.pending?.until ?? 0;
    const map = () => walkMap(t.g, 'field');
    expect(map() && isWalkable(map() as never, 10, 6)).toBe(true);
    days(t, 8);
    expect(t.g.world.meta.tick).toBeGreaterThan(until);
    expect(queen(t)).toMatchObject({ collapsed: true, pending: null });
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.collapsed`]).toBe(true);
    expect(flags(t.g).a1_culvert_sealed).toBe(true);
    expect(last(t, 'dungeon.collapsed')).toEqual({ id: QUEEN_NEST.id, kind: 'nest' });
    // the switch area of the den mouth is rock now
    expect(map() && isWalkable(map() as never, 10, 6)).toBe(false);
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(1);
    days(t, 91);
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(0);
    // a collapsed nest grows no more
    days(t, 100);
    expect(queen(t)?.stage).toBe(2);
  });

  it('purify runs its ritual and lowers the map a level for good', () => {
    const t = game();
    killLord(t);
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'purify' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_now' });
    t.g.queue('flag.set', { key: 'fx_herbs_ready', value: true }, SCRIPT);
    t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'purify' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
    days(t, 1);
    expect(queen(t)?.purified).toBe(false);
    days(t, 1);
    expect(queen(t)?.purified).toBe(true);
    expect(flags(t.g)[`dg.${QUEEN_NEST.id}.phase`]).toBe('purified');
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(-1);
    expect(localSediment(t.g.world, t.g.content, field, 2, 2)).toBe(2);
    days(t, 400);
    expect(sedimentDelta(t.g.world, t.g.content, 'field')).toBe(-1);
    expect(queen(t)?.stage).toBe(2);
  });

  it('a quest choice written as the flag settles the nest the same way', () => {
    const t = game();
    killLord(t);
    t.g.queue('flag.set', { key: `dg.${QUEEN_NEST.id}.choice`, value: 'destroy' }, SCRIPT);
    t.g.step(1);
    expect(queen(t)?.pending?.choice).toBe('destroy');
    days(t, 8);
    expect(queen(t)?.collapsed).toBe(true);
  });

  it('the delta of one nest follows its state (pure)', () => {
    const base = {
      live: true,
      stage: 2,
      since: 0,
      cleared: false,
      clearedTick: -1,
      choice: 'untouched' as const,
      choiceTick: -1,
      pending: null,
      collapsed: false,
      collapsedTick: -1,
      purified: false,
      matured: false,
    };
    expect(nestSedimentDelta(CONFIG, base, 0)).toBe(0);
    expect(nestSedimentDelta(CONFIG, { ...base, stage: 3 }, 0)).toBe(1);
    expect(nestSedimentDelta(CONFIG, { ...base, live: false, stage: 3 }, 0)).toBe(0);
    expect(nestSedimentDelta(CONFIG, { ...base, purified: true }, 0)).toBe(-1);
    const fell = { ...base, collapsed: true, collapsedTick: 100 };
    expect(nestSedimentDelta(CONFIG, fell, 100 + 91 * DAY - 1)).toBe(1);
    expect(nestSedimentDelta(CONFIG, fell, 100 + 91 * DAY)).toBe(0);
  });

  it('two runs of one seed end in the same world', () => {
    const run = () => {
      const t = game(fixtureContent(), 77);
      killLord(t);
      t.g.queue('dungeons.dispose', { id: QUEEN_NEST.id, choice: 'destroy' }, SCRIPT);
      t.g.step(1);
      days(t, 10);
      return worldHash(t.g.world);
    };
    expect(run()).toBe(run());
  });
});

describe('the nest validator', () => {
  const content = (over: Record<string, unknown>) =>
    fixtureContent({ nests: [{ ...QUEEN_NEST, ...over }] as never, dungeons: [BURROW] });

  it('names a nest after its lord, needs dense ground, a shallow dungeon to become', () => {
    expect(validateDungeons(content({}))).toEqual([]);
    expect(validateDungeons(content({ id: 'nest_other' }))).toContain(
      'nest nest_other: a nest with a lord is nest_fx_queen',
    );
    expect(validateDungeons(content({ mapId: 'town', location: 'square' }))).toContain(
      'nest nest_fx_queen: sediment below 2 at the nest (catalog_bestiary 2.8)',
    );
    expect(
      validateDungeons(
        fixtureContent({
          nests: [{ ...QUEEN_NEST, becomes: BURROW.id }] as never,
          dungeons: [{ ...BURROW, form: 'dungeon' }],
        }),
      ),
    ).toContain('nest nest_fx_queen: becomes dg_fx_burrow, which is not shallow');
    expect(validateDungeons(content({ stage: 4 }))).toContain(
      'nest nest_fx_queen: stage must be 1 to 3',
    );
    expect(validateDungeons(content({ lord: 'fx_ghost', id: 'nest_fx_ghost' }))).toContain(
      'nest nest_fx_ghost: unknown lord fx_ghost',
    );
    expect(validateDungeons(content({ choices: { nurture: { days: 3 }, eat: {} } }))).toEqual([
      'nest nest_fx_queen choice nurture: nurture takes hold at once (no days)',
      'nest nest_fx_queen choice eat: unknown choice',
    ]);
  });
});
