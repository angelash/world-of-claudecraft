// The dungeon runtime (PK-M1-50; catalog_dungeons_bosses.md 1.1 to 1.4): the forms and
// party caps, entry and exit, floor switching, the party cap at the gate, left items
// swallowed after seven days (tick by tick and across a time skip), activity and the
// overflow clock, the three dispositions of a dungeon with the timed collapse, and the save
// round trip of the slice.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { configProblems, validateDungeons } from '../src/content/packs/dungeons';
import { migrateSnapshot, RENAME_VERSION, serializeWorld, worldHash } from '../src/core/save';
import { validateWorld } from '../src/core/save/validate';
import {
  DUNGEONS_SLICE_VERSION,
  type DungeonsSlice,
  dungeonsView,
  fieldView,
  floorAt,
  formBand,
  formOf,
  partyCap,
  registerLeftItemPort,
  swallowTick,
  system,
  validateDungeonsSlice,
} from '../src/systems/dungeons';
import { playerEntity } from '../src/systems/world';
import {
  AI,
  bags,
  CELLAR,
  CONFIG,
  DAY,
  days,
  ds,
  fixtureContent,
  flags,
  game,
  hours,
  kinds,
  MINE,
  put,
  restorePort,
  resume,
  SCRIPT,
  type T,
  usePort,
} from './dungeons_harness';

const last = (t: T, kind: string) => kinds(t, kind).at(-1)?.data as Record<string, unknown>;
const results = (t: T) =>
  t.events
    .filter((e) => e.kind === 'command.result')
    .map((e) => e.data as { kind: string; ok: boolean; code?: string; reason?: unknown });
const lastResult = (t: T) => results(t).at(-1);

/** Walk the player to the mine gate and enter by the command. */
function enterMine(t: T): void {
  put(t, 'town', 11, 3);
  t.g.queue('dungeons.enter', { dungeonId: MINE.id });
  t.g.step(1);
}

afterEach(() => restorePort());

describe('forms, caps and floors (pure)', () => {
  it('reads the form from the pressure bands of 1.1', () => {
    expect(formOf(CONFIG, 0)).toBe('lair');
    expect(formOf(CONFIG, 99)).toBe('lair');
    expect(formOf(CONFIG, 100)).toBe('shallow');
    expect(formOf(CONFIG, 299)).toBe('shallow');
    expect(formOf(CONFIG, 300)).toBe('dungeon');
    expect(formOf(CONFIG, 799)).toBe('dungeon');
    expect(formOf(CONFIG, 800)).toBe('great');
    expect(formBand(CONFIG, 'shallow')).toEqual([100, 299]);
    expect(formBand(CONFIG, 'great')).toEqual([800, Number.POSITIVE_INFINITY]);
  });

  it('caps the party by the record, else by the form (1.4)', () => {
    expect(partyCap(CONFIG, MINE)).toBe(2);
    expect(partyCap(CONFIG, CELLAR)).toBe(0);
    const { party: _p, ...noCap } = MINE;
    expect(partyCap(CONFIG, noCap)).toBe(2);
    expect(partyCap(CONFIG, { ...noCap, form: 'dungeon' })).toBe(4);
    expect(partyCap(CONFIG, { ...noCap, form: 'great' })).toBe(9);
    expect(partyCap(CONFIG, { ...noCap, form: 'lair' })).toBe(1);
  });

  it('finds the floor at a point: the area floor wins, an area-only map is out elsewhere', () => {
    const c = fixtureContent();
    expect(floorAt(c, 'mine_upper', 5, 5)?.floor.id).toBe('upper');
    expect(floorAt(c, 'mine_lower', 3, 3)?.floor.id).toBe('lower');
    expect(floorAt(c, 'mine_lower', 16, 6)?.floor.id).toBe('vein');
    expect(floorAt(c, 'town', 21, 11)?.dungeon.id).toBe(CELLAR.id);
    expect(floorAt(c, 'town', 4, 4)).toBeUndefined();
    expect(floorAt(c, 'field', 5, 5)).toBeUndefined();
  });
});

describe('entry, floors and exit', () => {
  it('starts a visit on a walk in through a map exit and mirrors the depth', () => {
    const t = game();
    expect(ds(t.g).run).toBeNull();
    put(t, 'town', 11, 3);
    t.g.queue('world.use_exit', { entityId: 'player', exitId: 'to_mine' });
    t.g.step(1);
    expect(ds(t.g).run).toMatchObject({ dungeon: MINE.id, floor: 'upper', via: 'walk' });
    expect(last(t, 'dungeon.entered')).toMatchObject({
      dungeonId: MINE.id,
      floorId: 'upper',
      depth: 0,
      via: 'walk',
      cap: 2,
      party: 0,
      overCap: false,
    });
    expect(flags(t.g)[`dg.${MINE.id}.depth`]).toBe(0);
    expect(ds(t.g).instances[MINE.id]?.entries).toBe(1);
  });

  it('switches floors by map and by area, keeping the deepest depth', () => {
    const t = game();
    enterMine(t);
    put(t, 'mine_lower', 3, 3);
    expect(last(t, 'dungeon.floor_changed')).toMatchObject({
      dungeonId: MINE.id,
      from: 'upper',
      to: 'lower',
      depth: 1,
    });
    expect(flags(t.g)[`dg.${MINE.id}.depth`]).toBe(1);
    // walking into the vein rectangle changes the floor without a map change (the poll)
    t.g.queue('world.move_to', { entityId: 'player', x: 17, y: 7 });
    t.g.step(200);
    expect(ds(t.g).run?.floor).toBe('vein');
    expect(last(t, 'dungeon.floor_changed')).toMatchObject({ from: 'lower', to: 'vein', depth: 2 });
    expect(flags(t.g)[`dg.${MINE.id}.depth`]).toBe(2);
    t.g.queue('world.move_to', { entityId: 'player', x: 4, y: 4 });
    t.g.step(300);
    expect(ds(t.g).run?.floor).toBe('lower');
    expect(flags(t.g)[`dg.${MINE.id}.depth`]).toBe(2);
    expect(kinds(t, 'dungeon.entered')).toHaveLength(1);
  });

  it('ends the visit when the player is out, however they got out', () => {
    const t = game();
    enterMine(t);
    put(t, 'town', 4, 4);
    expect(ds(t.g).run).toBeNull();
    expect(last(t, 'dungeon.left')).toMatchObject({
      dungeonId: MINE.id,
      floorId: 'upper',
      via: 'walk',
    });
  });

  it('enters by the command only at the gate, and not twice', () => {
    const t = game();
    t.g.queue('dungeons.enter', { dungeonId: MINE.id });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'far' });
    enterMine(t);
    expect(lastResult(t)).toMatchObject({ ok: true });
    const p = playerEntity(t.g.world);
    expect(p?.mapId).toBe('mine_upper');
    expect(last(t, 'dungeon.entered')).toMatchObject({ via: 'command' });
    t.g.queue('dungeons.enter', { dungeonId: MINE.id }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'inside' });
    t.g.queue('dungeons.enter', { dungeonId: 'dg_nowhere' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'unknown' });
  });

  it('never takes a model proposal to enter, leave or dispose', () => {
    const t = game();
    put(t, 'town', 11, 3);
    t.g.queue('dungeons.enter', { dungeonId: MINE.id }, AI);
    t.g.queue('dungeons.leave', {}, AI);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'nurture' }, AI);
    t.g.queue('dungeons.clear', { id: MINE.id }, { type: 'player' });
    t.g.step(1);
    expect(
      results(t)
        .filter((r) => r.kind.startsWith('dungeons.'))
        .map((r) => r.code),
    ).toEqual(['not_allowed', 'not_allowed', 'not_allowed', 'not_allowed']);
    expect(ds(t.g).run).toBeNull();
  });

  it('leaves by the command from the arrival floor only (the story from anywhere)', () => {
    const t = game();
    enterMine(t);
    put(t, 'mine_lower', 3, 3);
    t.g.queue('dungeons.leave', {});
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'deep' });
    t.g.queue('dungeons.leave', {}, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
    expect(playerEntity(t.g.world)?.mapId).toBe('town');
    expect(last(t, 'dungeon.left')).toMatchObject({ via: 'command', floorId: 'lower' });
    t.g.queue('dungeons.leave', {});
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_inside' });
  });

  it('tracks a dungeon drawn as an area of an ordinary map', () => {
    const t = game();
    put(t, 'town', 21, 3);
    t.g.queue('world.move_to', { entityId: 'player', x: 22, y: 12 });
    t.g.step(300);
    expect(ds(t.g).run).toMatchObject({ dungeon: CELLAR.id, floor: 'cellar', via: 'walk' });
    t.g.queue('world.move_to', { entityId: 'player', x: 22, y: 4 });
    t.g.step(300);
    expect(ds(t.g).run).toBeNull();
    expect(last(t, 'dungeon.left')).toMatchObject({ dungeonId: CELLAR.id });
  });

  it('gives the field status bar its data while inside', () => {
    const t = game();
    expect(fieldView(t.g.world, t.g.content)).toBeNull();
    enterMine(t);
    const v = fieldView(t.g.world, t.g.content);
    expect(v).toMatchObject({
      dungeonId: MINE.id,
      name: { key: 'c.dungeons.dg_fx_mine.name' },
      floorId: 'upper',
      floorName: { key: 'c.dungeons.dg_fx_mine.floors.upper.name' },
      form: 'shallow',
      formName: { key: 'sys.dungeons.form.shallow' },
      state: 'normal',
      cap: 2,
      party: 0,
      floorBossDown: null,
      leftItemDays: 7,
    });
    put(t, 'mine_lower', 16, 6);
    expect(fieldView(t.g.world, t.g.content)?.floorBossDown).toBe(false);
    t.g.queue('flag.set', { key: 'boss.fx_mother.defeated', value: true }, SCRIPT);
    t.g.step(1);
    expect(fieldView(t.g.world, t.g.content)?.floorBossDown).toBe(true);
  });
});

describe('the party cap', () => {
  it('refuses the player at the gate with too many companions, with cap and count', () => {
    const t = game();
    t.g.queue('zd.party', { ids: ['cmp_a', 'cmp_b', 'cmp_c'] });
    put(t, 'town', 11, 3);
    t.g.queue('dungeons.enter', { dungeonId: MINE.id });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({
      ok: false,
      code: 'party_full',
      reason: { key: 'sys.dungeons.reject.party_full', params: { cap: 2, count: 3 } },
    });
    expect(ds(t.g).run).toBeNull();
    t.g.queue('zd.party', { ids: ['cmp_a', 'cmp_b'] });
    t.g.queue('dungeons.enter', { dungeonId: MINE.id });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
    expect(last(t, 'dungeon.entered')).toMatchObject({ party: 2, cap: 2, overCap: false });
  });

  it('a solo place refuses any companion; the story may bring them anyway', () => {
    const t = game();
    t.g.queue('zd.party', { ids: ['cmp_a'] });
    put(t, 'town', 21, 3);
    t.g.queue('dungeons.enter', { dungeonId: CELLAR.id });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'party_full' });
    t.g.queue('dungeons.enter', { dungeonId: CELLAR.id }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
    expect(last(t, 'dungeon.entered')).toMatchObject({ party: 1, cap: 0, overCap: true });
  });

  it('marks a walk in over the cap (map exits are not the runtime to stop)', () => {
    const t = game();
    t.g.queue('zd.party', { ids: ['cmp_a', 'cmp_b', 'cmp_c'] });
    put(t, 'mine_upper', 5, 5);
    expect(ds(t.g).run?.overCap).toBe(true);
    expect(last(t, 'dungeon.entered')).toMatchObject({ overCap: true, party: 3, cap: 2 });
  });
});

describe('left items: swallowed after seven days in a dungeon', () => {
  beforeEach(() => usePort());

  it('swallows an item left in a dungeon on the seventh day, not before', () => {
    const t = game();
    t.g.queue('zd.drop', { id: 'bag_1', mapId: 'mine_lower', x: 5, y: 5 });
    t.g.queue('zd.drop', { id: 'bag_out', mapId: 'town', x: 5, y: 5 });
    t.g.step(1);
    const since = bags(t.g).bag_1?.since ?? -1;
    expect(swallowTick(t.g.world, t.g.content, bags(t.g).bag_1 as never)).toBe(since + 7 * DAY);
    expect(swallowTick(t.g.world, t.g.content, bags(t.g).bag_out as never)).toBeNull();
    t.g.step(7 * DAY - 2 * 1200);
    expect(bags(t.g).bag_1).toBeDefined();
    expect(kinds(t, 'dungeon.swallowed')).toHaveLength(0);
    t.g.step(2 * 1200 + 1200);
    expect(bags(t.g).bag_1).toBeUndefined();
    expect(last(t, 'dungeon.swallowed')).toEqual({
      dungeonId: MINE.id,
      itemId: 'bag_1',
      mapId: 'mine_lower',
    });
    expect(ds(t.g).instances[MINE.id]?.swallowed).toBe(1);
    // out in the town the pack keeps its own clock
    t.g.step(3 * DAY);
    expect(bags(t.g).bag_out).toBeDefined();
  }, 120000);

  it('swallows the same way across an hour-coarse time skip', () => {
    const t = game();
    t.g.queue('zd.drop', { id: 'bag_1', mapId: 'town', x: 22, y: 12 });
    t.g.step(1);
    days(t, 6);
    expect(bags(t.g).bag_1).toBeDefined();
    days(t, 1);
    expect(bags(t.g).bag_1).toBeUndefined();
    expect(last(t, 'dungeon.swallowed')).toMatchObject({ dungeonId: CELLAR.id });
  });

  it('a collapse swallows at once what lies inside (long before the seven days)', () => {
    const t = game();
    t.g.queue('dungeons.clear', { id: CELLAR.id }, SCRIPT);
    t.g.queue('dungeons.dispose', { id: CELLAR.id, choice: 'destroy' }, SCRIPT);
    t.g.queue('zd.drop', { id: 'bag_in', mapId: 'town', x: 22, y: 12 });
    t.g.queue('zd.drop', { id: 'bag_out', mapId: 'town', x: 4, y: 4 });
    t.g.step(1);
    hours(t, 23);
    expect(bags(t.g).bag_in).toBeDefined();
    hours(t, 2);
    expect(ds(t.g).instances[CELLAR.id]?.collapsed).toBe(true);
    expect(bags(t.g).bag_in).toBeUndefined();
    expect(bags(t.g).bag_out).toBeDefined();
    expect(last(t, 'dungeon.swallowed')).toMatchObject({ dungeonId: CELLAR.id, itemId: 'bag_in' });
  });

  it('a clean site swallows nothing', () => {
    const t = game();
    t.g.queue('dungeons.dispose', { id: CELLAR.id, choice: 'purify' }, SCRIPT);
    t.g.step(1);
    days(t, 4);
    expect(ds(t.g).instances[CELLAR.id]?.purified).toBe(true);
    t.g.queue('zd.drop', { id: 'bag_1', mapId: 'town', x: 22, y: 12 });
    t.g.step(1);
    expect(swallowTick(t.g.world, t.g.content, bags(t.g).bag_1 as never)).toBeNull();
    days(t, 8);
    expect(bags(t.g).bag_1).toBeDefined();
  });

  it('swallows nothing without a registered port', () => {
    restorePort();
    registerLeftItemPort(null);
    const t = game();
    t.g.queue('zd.drop', { id: 'bag_1', mapId: 'mine_lower', x: 5, y: 5 });
    t.g.step(1);
    days(t, 8);
    expect(bags(t.g).bag_1).toBeDefined();
    expect(kinds(t, 'dungeon.swallowed')).toHaveLength(0);
  });
});

describe('activity and the overflow clock (1.1, 1.3)', () => {
  it('a paged death inside adds, a beast or the player does not', () => {
    const t = game();
    const st = () => ds(t.g).instances[MINE.id];
    t.g.queue('zd.die', { kind: 'npc', mapId: 'mine_lower', x: 3, y: 3 });
    t.g.queue('zd.die', { kind: 'monster', ref: 'fx_bandit', mapId: 'mine_upper', x: 5, y: 5 });
    t.g.queue('zd.die', { kind: 'monster', ref: 'fx_rat', mapId: 'mine_upper', x: 5, y: 5 });
    t.g.queue('zd.die', { kind: 'player', mapId: 'mine_upper', x: 5, y: 5 });
    t.g.queue('zd.die', { kind: 'companion', mapId: 'mine_upper', x: 5, y: 5 });
    t.g.queue('zd.die', { kind: 'npc', mapId: 'town', x: 5, y: 5 });
    t.g.step(1);
    expect(st()?.activity).toBe(6);
  });

  it('enters the active period at 60, overflows when the clock runs out, falls back to 40', () => {
    const t = game();
    t.g.queue('dungeons.shift', { id: MINE.id, activity: 59 }, SCRIPT);
    t.g.step(1);
    expect(flags(t.g)[`dg.${MINE.id}.active`]).toBe(false);
    t.g.queue('zd.die', { kind: 'npc', mapId: 'mine_lower', x: 3, y: 3 });
    t.g.step(1);
    const st = ds(t.g).instances[MINE.id];
    expect(flags(t.g)[`dg.${MINE.id}.active`]).toBe(true);
    expect(last(t, 'dungeon.active')).toEqual({ dungeonId: MINE.id, active: true });
    expect(st?.overflowAt).toBeGreaterThan(0);
    hours(t, 47);
    expect(kinds(t, 'dungeon.overflow')).toHaveLength(0);
    hours(t, 2);
    expect(last(t, 'dungeon.overflow')).toEqual({ dungeonId: MINE.id, toMap: 'town' });
    expect(st?.activity).toBe(40);
    expect(flags(t.g)[`dg.${MINE.id}.active`]).toBe(false);
    expect(flags(t.g)[`dg.${MINE.id}.phase`]).toBe('overflow');
    hours(t, 25);
    expect(flags(t.g)[`dg.${MINE.id}.phase`]).toBe('shallow');
  });

  it('overflows at once on reaching the top', () => {
    const t = game();
    t.g.queue('dungeons.shift', { id: CELLAR.id, activity: 120 }, SCRIPT);
    t.g.step(1);
    expect(last(t, 'dungeon.overflow')).toEqual({ dungeonId: CELLAR.id });
    expect(ds(t.g).instances[CELLAR.id]?.activity).toBe(40);
  });

  it('the core boss down clears the dungeon, takes 60 and stops the clock', () => {
    const t = game();
    t.g.queue('dungeons.shift', { id: MINE.id, activity: 80 }, SCRIPT);
    t.g.step(1);
    t.g.queue('zd.die', { kind: 'monster', ref: 'fx_mother', mapId: 'mine_lower', x: 16, y: 6 });
    t.g.step(1);
    const st = ds(t.g).instances[MINE.id];
    expect(st?.cleared).toBe(true);
    expect(st?.activity).toBe(20);
    expect(st?.overflowAt).toBe(-1);
    expect(flags(t.g)[`dg.${MINE.id}.cleared`]).toBe(true);
    expect(flags(t.g)[`dg.${MINE.id}.active`]).toBe(false);
    expect(last(t, 'dungeon.cleared')).toEqual({ id: MINE.id, kind: 'dungeon' });
  });

  it('writes the starting mirrors of every dungeon', () => {
    const t = game();
    const f = flags(t.g);
    expect(f[`dg.${MINE.id}.phase`]).toBe('shallow');
    expect(f[`dg.${MINE.id}.pressure`]).toBe(100);
    expect(f[`dg.${MINE.id}.choice`]).toBe('untouched');
    expect(f[`dg.${MINE.id}.active`]).toBe(false);
    expect(f[`dg.${CELLAR.id}.phase`]).toBe('lair');
    expect(f[`dg.${CELLAR.id}.pressure`]).toBe(40);
    expect(f[`dg.${MINE.id}.depth`]).toBeUndefined();
    // a dungeon a nest has still to turn into has no mirrors yet, and no levers
    expect(Object.keys(f).filter((k) => k.startsWith('dg.dg_fx_burrow.'))).toEqual([]);
    t.g.queue('dungeons.shift', { id: 'dg_fx_burrow', activity: 10 }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_formed' });
  });
});

describe('nurture, destroy, purify (1.2)', () => {
  beforeEach(() => usePort());

  it('destroy waits for the core boss, then collapses within the band and puts the player out', () => {
    const t = game();
    enterMine(t);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'destroy' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_cleared' });
    t.g.queue('zd.die', { kind: 'monster', ref: 'fx_mother', mapId: 'mine_lower', x: 16, y: 6 });
    t.g.queue('zd.drop', { id: 'bag_in', mapId: 'mine_lower', x: 5, y: 5 });
    t.g.step(1);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'destroy' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({
      ok: true,
      reason: { key: 'sys.dungeons.note.chose.destroy' },
    });
    const st = ds(t.g).instances[MINE.id];
    expect(flags(t.g)[`dg.${MINE.id}.choice`]).toBe('destroy');
    expect(flags(t.g).a1_core_choice_made).toBe(true);
    const until = st?.pending?.until ?? 0;
    const daysLeft = (until - t.g.world.meta.tick) / DAY;
    expect(daysLeft).toBeGreaterThan(2.9);
    expect(daysLeft).toBeLessThanOrEqual(7);
    expect(fieldView(t.g.world, t.g.content)?.state).toBe('collapsing');
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'purify' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'settled' });
    days(t, 8);
    expect(st?.collapsed).toBe(true);
    expect(flags(t.g)[`dg.${MINE.id}.collapsed`]).toBe(true);
    expect(flags(t.g).a1_mine_cleared).toBe(true);
    expect(playerEntity(t.g.world)?.mapId).toBe('town');
    expect(last(t, 'dungeon.left')).toMatchObject({ dungeonId: MINE.id, via: 'collapse' });
    expect(last(t, 'dungeon.collapsed')).toEqual({ id: MINE.id, kind: 'dungeon' });
    expect(bags(t.g).bag_in).toBeUndefined();
    put(t, 'town', 11, 3);
    t.g.queue('dungeons.enter', { dungeonId: MINE.id });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'collapsed' });
    // walking back onto the caved-in map is no visit
    put(t, 'mine_upper', 5, 5);
    expect(ds(t.g).run).toBeNull();
  });

  it('draws the collapse days from its own stream: the same seed, the same day', () => {
    const until = (seed: number) => {
      const t = game(fixtureContent(), seed);
      t.g.queue('dungeons.clear', { id: MINE.id }, SCRIPT);
      t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'destroy' }, SCRIPT);
      t.g.step(1);
      return ds(t.g).instances[MINE.id]?.pending?.until;
    };
    expect(until(7)).toBe(until(7));
    const spread = new Set([1, 2, 3, 4, 5, 6, 7, 8].map(until));
    expect(spread.size).toBeGreaterThan(1);
  });

  it('purify runs its ritual (activity up while it runs) once the means are at hand', () => {
    const t = game();
    enterMine(t);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'purify' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_now' });
    t.g.queue('flag.set', { key: 'fx_herbs_ready', value: true }, SCRIPT);
    t.g.step(1);
    put(t, 'town', 4, 4);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'purify' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'far' });
    enterMine(t);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'purify' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
    const st = ds(t.g).instances[MINE.id];
    expect(st?.activity).toBe(30);
    expect(fieldView(t.g.world, t.g.content)?.state).toBe('purifying');
    days(t, 2);
    expect(st?.purified).toBe(false);
    days(t, 1);
    expect(st?.purified).toBe(true);
    expect(st?.activity).toBe(0);
    expect(flags(t.g)[`dg.${MINE.id}.phase`]).toBe('purified');
    expect(flags(t.g).a1_graveyard_purified).toBe(true);
    expect(last(t, 'dungeon.purified')).toEqual({ id: MINE.id, kind: 'dungeon' });
    // a clean site is no dungeon any more
    expect(ds(t.g).run).toBeNull();
  });

  it('the owner refuses a nest under her roof; the cellar caves in overnight', () => {
    const t = game();
    t.g.queue('dungeons.dispose', { id: CELLAR.id, choice: 'nurture' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({
      ok: false,
      code: 'owner_refuses',
      reason: { key: 'sys.dungeons.reject.owner_refuses' },
    });
    t.g.queue('zd.die', { kind: 'monster', ref: 'fx_crone', mapId: 'town', x: 22, y: 12 });
    t.g.step(1);
    t.g.queue('dungeons.dispose', { id: CELLAR.id, choice: 'destroy' }, SCRIPT);
    t.g.step(1);
    hours(t, 23);
    expect(ds(t.g).instances[CELLAR.id]?.collapsed).toBe(false);
    hours(t, 2);
    expect(ds(t.g).instances[CELLAR.id]?.collapsed).toBe(true);
    expect(flags(t.g).a1_martha_strike).toBe(true);
  });

  it('nurture grows the core five percent a season and may still turn into destroy', () => {
    const t = game();
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'nurture' }, SCRIPT);
    t.g.step(1);
    expect(flags(t.g)[`dg.${MINE.id}.choice`]).toBe('nurture');
    expect(flags(t.g).a1_lair_located).toBe(true);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'nurture' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'already' });
    days(t, 91);
    expect(ds(t.g).instances[MINE.id]?.pressure).toBe(105);
    expect(flags(t.g)[`dg.${MINE.id}.pressure`]).toBe(105);
    t.g.queue('dungeons.clear', { id: MINE.id }, SCRIPT);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'destroy' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
  });

  it('takes a disposition written by content (a quest choice) and settles it the same way', () => {
    const t = game();
    t.g.queue('dungeons.clear', { id: CELLAR.id }, SCRIPT);
    t.g.step(1);
    t.g.queue('flag.set', { key: `dg.${CELLAR.id}.choice`, value: 'destroy' }, SCRIPT);
    t.g.step(1);
    expect(ds(t.g).instances[CELLAR.id]?.pending?.choice).toBe('destroy');
    expect(last(t, 'dungeon.choice')).toMatchObject({ id: CELLAR.id, by: 'content' });
    // a write that is no legal next step is put back
    t.g.queue('flag.set', { key: `dg.${CELLAR.id}.choice`, value: 'purify' }, SCRIPT);
    t.g.step(2);
    expect(flags(t.g)[`dg.${CELLAR.id}.choice`]).toBe('destroy');
    expect(ds(t.g).instances[CELLAR.id]?.pending?.choice).toBe('destroy');
  });
});

describe('owners, rituals and sweeps', () => {
  beforeEach(() => usePort());

  it('sends back a content-written choice the owner refuses, and says so', () => {
    const t = game();
    t.g.queue('flag.set', { key: `dg.${CELLAR.id}.choice`, value: 'nurture' }, SCRIPT);
    t.g.step(2);
    expect(flags(t.g)[`dg.${CELLAR.id}.choice`]).toBe('untouched');
    expect(ds(t.g).instances[CELLAR.id]?.choice).toBe('untouched');
    expect(last(t, 'dungeon.choice_refused')).toEqual({
      id: CELLAR.id,
      kind: 'dungeon',
      choice: 'nurture',
      reason: 'owner_refuses',
    });
  });

  it('a broken ritual falls back to the disposition before it', () => {
    const t = game();
    t.g.queue('dungeons.break_ritual', { id: MINE.id }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'no_ritual' });
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'nurture' }, SCRIPT);
    t.g.queue('flag.set', { key: 'fx_herbs_ready', value: true }, SCRIPT);
    t.g.step(1);
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'purify' }, SCRIPT);
    t.g.step(1);
    expect(ds(t.g).instances[MINE.id]?.pending).toMatchObject({
      choice: 'purify',
      from: 'nurture',
    });
    t.g.queue('dungeons.break_ritual', { id: MINE.id }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
    expect(ds(t.g).instances[MINE.id]).toMatchObject({ choice: 'nurture', pending: null });
    expect(flags(t.g)[`dg.${MINE.id}.choice`]).toBe('nurture');
    expect(last(t, 'dungeon.ritual_failed')).toEqual({ id: MINE.id, kind: 'dungeon' });
    days(t, 4);
    expect(ds(t.g).instances[MINE.id]?.purified).toBe(false);
    // the ritual may be tried again
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'purify' }, SCRIPT);
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: true });
  });

  it('a nurtured dungeon stirs by each unswept week; a sweep starts the weeks over', () => {
    const t = game();
    const st = () => ds(t.g).instances[MINE.id];
    t.g.queue('dungeons.dispose', { id: MINE.id, choice: 'nurture' }, SCRIPT);
    t.g.step(1);
    days(t, 6);
    expect(st()?.activity).toBe(0);
    days(t, 1);
    expect(st()?.activity).toBe(10);
    days(t, 7);
    expect(st()?.activity).toBe(20);
    t.g.queue('dungeons.patrol', { id: MINE.id }, SCRIPT);
    t.g.step(1);
    days(t, 6);
    expect(st()?.activity).toBe(20);
    days(t, 1);
    expect(st()?.activity).toBe(30);
    // an untouched dungeon does not stir by itself
    expect(ds(t.g).instances[CELLAR.id]?.activity).toBe(0);
    t.g.queue('dungeons.patrol', { id: CELLAR.id }, { type: 'player' });
    t.g.step(1);
    expect(lastResult(t)).toMatchObject({ ok: false, code: 'not_allowed' });
  });

  it('moves the pressure by the story; the form and the cap of the form follow', () => {
    const { party: _p, ...noCap } = MINE;
    const t = game(fixtureContent({ dungeons: [noCap, CELLAR] as never }));
    expect(flags(t.g)[`dg.${MINE.id}.phase`]).toBe('shallow');
    t.g.queue('dungeons.shift', { id: MINE.id, pressure: 250 }, SCRIPT);
    t.g.step(1);
    expect(flags(t.g)[`dg.${MINE.id}.pressure`]).toBe(350);
    expect(flags(t.g)[`dg.${MINE.id}.phase`]).toBe('dungeon');
    t.g.queue('zd.party', { ids: ['cmp_a', 'cmp_b', 'cmp_c'] });
    enterMine(t);
    expect(lastResult(t)).toMatchObject({ ok: true });
    expect(last(t, 'dungeon.entered')).toMatchObject({ cap: 4, party: 3, overCap: false });
  });

  it('lists the known dungeons for the dungeon window', () => {
    const t = game();
    expect(dungeonsView(t.g.world, t.g.content)).toEqual([]);
    enterMine(t);
    t.g.queue('zd.drop', { id: 'bag_1', mapId: 'mine_lower', x: 5, y: 5 });
    t.g.queue('dungeons.shift', { id: MINE.id, activity: 70 }, SCRIPT);
    t.g.step(1);
    const [v] = dungeonsView(t.g.world, t.g.content);
    const since = bags(t.g).bag_1?.since ?? -1;
    expect(v).toMatchObject({
      id: MINE.id,
      name: { key: 'c.dungeons.dg_fx_mine.name' },
      mapId: 'town',
      form: 'shallow',
      state: 'active',
      stateName: { key: 'sys.dungeons.state.active' },
      overflowDays: 2,
      disposition: 'untouched',
      owner: 'magistrate',
      partyLimit: 2,
      firstClear: false,
      bosses: [{ id: 'fx_mother', floorId: 'vein', defeated: false }],
      lostItems: [{ id: 'bag_1', swallowTick: since + 7 * DAY }],
      affixes: [],
    });
    expect(dungeonsView(t.g.world, t.g.content)).toHaveLength(1);
  });
});

describe('the slice in saves', () => {
  beforeEach(() => usePort());

  const roundTrip = (w: unknown) =>
    migrateSnapshot(serializeWorld(structuredClone(w) as never), RENAME_VERSION, {
      owners: [system],
    }).world;

  it('round-trips mid-visit and mid-collapse, and plays on like the run that never stopped', () => {
    const live = game();
    enterMine(live);
    put(live, 'mine_lower', 3, 3);
    live.g.queue('dungeons.clear', { id: MINE.id }, SCRIPT);
    live.g.queue('dungeons.dispose', { id: MINE.id, choice: 'destroy' }, SCRIPT);
    live.g.queue('zd.drop', { id: 'bag_1', mapId: 'town', x: 22, y: 12 });
    live.g.step(1);
    const s = live.g.world.slices.dungeons as DungeonsSlice;
    expect(s.version).toBe(DUNGEONS_SLICE_VERSION);
    expect(validateDungeonsSlice(s)).toEqual([]);
    const loaded = roundTrip(live.g.world);
    expect(validateWorld(loaded, [system])).toEqual([]);
    expect(worldHash(loaded)).toBe(worldHash(live.g.world));
    expect(loaded.slices.dungeons).toEqual(s);
    const back = resume(loaded);
    days(live, 9);
    days(back, 9);
    expect(worldHash(back.g.world)).toBe(worldHash(live.g.world));
    expect(back.g.world.slices.dungeons.instances[MINE.id]?.collapsed).toBe(true);
    expect(bags(back.g).bag_1).toBeUndefined();
  });

  it('loads a save from before the dungeons: no slice is sound, one is made on first use', () => {
    const t = game();
    put(t, 'mine_upper', 5, 5);
    const w = structuredClone(t.g.world) as unknown as { slices: Record<string, unknown> };
    delete w.slices.dungeons;
    expect(validateDungeonsSlice(undefined)).toEqual([]);
    const back = resume(w as never);
    back.g.step(2);
    const s = back.g.world.slices.dungeons;
    expect(s.version).toBe(DUNGEONS_SLICE_VERSION);
    expect(s.instances[MINE.id]?.pressure).toBe(100);
    expect(s.run).toMatchObject({ dungeon: MINE.id, floor: 'upper' });
  });

  it('settles a choice a quest wrote before the dungeons existed, not overwriting it', () => {
    const t = game();
    t.g.queue('dungeons.clear', { id: CELLAR.id }, SCRIPT);
    t.g.step(1);
    const w = structuredClone(t.g.world) as unknown as {
      slices: Record<string, unknown>;
      meta: { flags: Record<string, unknown> };
    };
    delete w.slices.dungeons;
    for (const k of Object.keys(w.meta.flags)) if (k.startsWith('dg.')) delete w.meta.flags[k];
    w.meta.flags[`dg.${CELLAR.id}.choice`] = 'destroy';
    const back = resume(w as never);
    back.g.step(2);
    expect(back.g.world.slices.dungeons.instances[CELLAR.id]?.pending?.choice).toBe('destroy');
    expect(flags(back.g)[`dg.${CELLAR.id}.choice`]).toBe('destroy');
  });

  it('drops a visit whose dungeon the rename table removed', () => {
    const t = game();
    put(t, 'mine_upper', 5, 5);
    const s = structuredClone(t.g.world.slices.dungeons) as unknown as Record<string, unknown>;
    const run = { ...(s.run as Record<string, unknown>) };
    delete run.dungeon;
    expect(validateDungeonsSlice({ ...s, run })).toEqual([]);
    const w = structuredClone(t.g.world) as unknown as { slices: { dungeons: DungeonsSlice } };
    delete (w.slices.dungeons.run as unknown as Record<string, unknown>).dungeon;
    const back = resume(w as never, fixtureContent({ dungeons: [CELLAR] }));
    back.g.step(1);
    expect(back.g.world.slices.dungeons.run).toBeNull();
  });

  it('refuses a slice from a newer build and a broken one', () => {
    const t = game();
    const s = structuredClone(t.g.world.slices.dungeons) as unknown as Record<string, unknown>;
    expect(validateDungeonsSlice({ ...s, version: DUNGEONS_SLICE_VERSION + 1 })).toEqual([
      `dungeons.version ${DUNGEONS_SLICE_VERSION + 1} is newer than this build's`,
    ]);
    const inst = { ...(s.instances as Record<string, Record<string, unknown>>) };
    inst[MINE.id] = {
      ...inst[MINE.id],
      choice: 'eat',
      pending: { choice: 'nurture', until: 1, from: 'untouched' },
    };
    expect(validateDungeonsSlice({ ...s, instances: inst })).toEqual([
      `dungeons.instances.${MINE.id}.choice is unknown`,
      `dungeons.instances.${MINE.id}.pending is not a pending choice`,
    ]);
    expect(validateDungeonsSlice({ ...s, run: { dungeon: 1 } })).toEqual([
      'dungeons.run is not a run',
    ]);
    expect(system.idFields.map((f) => `${f.path} ${f.kind}`)).toEqual([
      'instances.@keys dungeon',
      'instances.*.def dungeon',
      'nests.@keys nest',
      'run.dungeon dungeon',
    ]);
  });
});

describe('the dungeon validator', () => {
  const check = (over: Record<string, unknown>, extra: unknown[] = []) =>
    validateDungeons(
      fixtureContent({ dungeons: [{ ...MINE, ...over }, ...extra] as never, nests: [] }),
    );

  it('holds floors, places, bands and the core boss to the runtime', () => {
    expect(check({})).toEqual([]);
    expect(check({ pressure: 400 })).toContain(
      'dungeon dg_fx_mine: pressure 400 outside the shallow band',
    );
    expect(check({ gate: { mapId: 'mine_upper', location: 'cave_in' } })).toContain(
      'dungeon dg_fx_mine: the gate lies inside the dungeon',
    );
    expect(check({ entry: { mapId: 'town', location: 'square' } })).toContain(
      'dungeon dg_fx_mine: the entry place lies on none of its floors',
    );
    expect(check({ entry: { mapId: 'town', location: 'nowhere' } })).toContain(
      'dungeon dg_fx_mine entry: map town has no location nowhere',
    );
    expect(check({ coreBoss: undefined })).toContain(
      'dungeon dg_fx_mine: destroy needs a core boss (who breaks the core)',
    );
    expect(check({ id: 'mine_two' })).toContain('dungeon mine_two: id must start with dg_');
    expect(
      check({}, [
        { ...CELLAR, id: 'dg_fx_twin', floors: [{ id: 'f', mapId: 'mine_lower', depth: 0 }] },
      ]),
    ).toContain('map mine_lower: whole-map floor of both dg_fx_mine and dg_fx_twin');
    expect(
      check({ floors: [{ id: 'upper', mapId: 'mine_upper', area: 'nope', depth: 0 }] }),
    ).toContain('dungeon dg_fx_mine floor upper: map mine_upper has no location nope');
    expect(check({ level: [12, 6] })).toContain(
      'dungeon dg_fx_mine: level must be a band 1 to 60, low to high',
    );
    expect(check({ choices: { purify: { when: 'a ==', days: 1 } } })[0]).toMatch(
      /^dungeon dg_fx_mine choice purify when: /,
    );
    expect(check({ choices: { purify: {} } })).toEqual([
      'dungeon dg_fx_mine choice purify: a purification ritual needs its days',
    ]);
  });
});

describe('the tuning validator', () => {
  it('holds the forms, activity, days and nest stages to the runtime', () => {
    expect(configProblems(CONFIG)).toEqual([]);
    expect(configProblems(undefined)).toEqual(['dungeonConfig: missing']);
    expect(
      configProblems({ ...CONFIG, forms: CONFIG.forms.filter((f) => f.id !== 'great') }),
    ).toContain('dungeonConfig: forms must be lair, shallow, dungeon, great, once each');
    expect(
      configProblems({ ...CONFIG, activity: { ...CONFIG.activity, afterOverflow: 70 } }),
    ).toEqual(['dungeonConfig: afterOverflow must lie below the active threshold']);
    expect(configProblems({ ...CONFIG, collapseDays: [5, 3] })).toEqual([
      'dungeonConfig: collapseDays must be a band of days',
    ]);
    expect(configProblems({ ...CONFIG, nest: { ...CONFIG.nest, lordStage: 4 } })).toEqual([
      'dungeonConfig: nest.lordStage must lie below maxStage',
    ]);
    expect(configProblems({ ...CONFIG, leftItemDays: 0 })).toEqual([
      'dungeonConfig: leftItemDays must be a whole day count',
    ]);
  });
});

describe('the shipped data', () => {
  it('validates clean, and the fixtures do too', () => {
    const content = buildContent();
    expect(validateDungeons(content)).toEqual([]);
    expect(content.dungeons.map((d) => d.id)).toContain('dg_seal_ruins');
    expect(
      validateDungeons({
        ...content,
        ...fixtureContent({ acts: content.acts, monsters: content.monsters }),
        monsters: [...content.monsters, ...(fixtureContent().monsters as typeof content.monsters)],
        maps: [...content.maps, ...fixtureContent().maps],
      }),
    ).toEqual([]);
  });

  it('places the seal ruins floors on the built maps: the shaft is level two', () => {
    const content = buildContent();
    expect(floorAt(content, 'seal_ruins', 10, 10)?.floor.id).toBe('surface');
    expect(floorAt(content, 'seal_ruins_depths', 3, 9)?.floor.id).toBe('depths');
    expect(floorAt(content, 'seal_ruins_depths', 24, 7)?.floor.id).toBe('shaft');
    expect(floorAt(content, 'borderstone', 10, 10)).toBeUndefined();
  });
});
