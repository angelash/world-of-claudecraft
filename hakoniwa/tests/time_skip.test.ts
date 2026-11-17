// The time-skip kernel (travel_and_exploration.md 7 and 10, PK-M0-31): the rest rules
// (T-08 waiting, T-09 sleeping), the two settlement tiers and their agreement (T-10), the
// model hold while a skip runs (T-11), replay of a log with waiting, sleeping and a fight
// (T-16), the engine's clock seam (strides, step semantics, backfill release), the skip
// handler registry and the interrupts. Runs the real engine with every system.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine, ok, type TextRef, worldHash } from '../src/core';
import type { AnyWorldEvent } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { calendarAt, TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR, tickAtDay } from '../src/core/time';
import type { World } from '../src/core/world';
import { createGame, resumeGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import {
  ambushChance,
  BACKFILL_CAP,
  canSleep,
  canWait,
  nextHourMark,
  SHORT_SKIP_MAX_HOURS,
  skipClock,
  skipHandlerIds,
  skipState,
  sleepAmbushChance,
  ticksUntil,
  wakeTick,
} from '../src/systems/travel';
import { mapById } from '../src/systems/world';
import type { MapDef } from '../src/systems/world/types';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_probe.fire': Record<string, never>;
  }
}

// ---------------------------------------------------------------------------
// harness: the full game, the prologue skipped, the player put somewhere

type Engine_ = Engine;

const CONTENT = buildContent();

/** A game in act 1 with the player at (x, y) on `mapId`, at tick `at` (default the start). */
function game(
  mapId: string,
  x: number,
  y: number,
  opts: { seed?: number; aiMode?: 'off' | 'external'; at?: number; content?: typeof CONTENT } = {},
): Engine_ {
  const g = createGame({
    seed: opts.seed ?? 7,
    aiMode: opts.aiMode ?? 'off',
    content: opts.content ?? CONTENT,
  });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: TOWN.map, x: TOWN.x, y: TOWN.y });
  g.step(1);
  if (opts.at !== undefined && opts.at > g.tick + TICKS_PER_GAME_HOUR) {
    // let the clock run to the start time in town (an hour-coarse skip), then go there
    g.queue(
      'time.skip',
      { hours: Math.floor((opts.at - g.tick - 1) / 1200), kind: 'travel', mode: 'long' },
      { type: 'script', script: 'test' },
    );
    g.step(1);
    finish(g);
  }
  if (opts.at !== undefined && opts.at > g.tick + 1) g.step(opts.at - g.tick - 1);
  g.queue('world.teleport', { entityId: 'player', mapId, x, y });
  g.step(1);
  return g;
}

/** The result of the last command of a kind. */
function lastResult(
  g: Engine_,
  kind: string,
): Extract<AnyWorldEvent, { kind: 'command.result' }> | undefined {
  return [...g.world.recent]
    .reverse()
    .find(
      (e): e is Extract<AnyWorldEvent, { kind: 'command.result' }> =>
        e.kind === 'command.result' && e.data.kind === kind,
    );
}

function keyOf(reason: unknown): string | undefined {
  const r = reason as TextRef | undefined;
  return r && 'key' in r ? r.key : undefined;
}

function events<K extends AnyWorldEvent['kind']>(
  list: readonly AnyWorldEvent[],
  kind: K,
): Extract<AnyWorldEvent, { kind: K }>[] {
  return list.filter((e) => e.kind === kind) as Extract<AnyWorldEvent, { kind: K }>[];
}

function collect(g: Engine_): AnyWorldEvent[] {
  const all: AnyWorldEvent[] = [];
  g.onEvents((evs) => all.push(...evs));
  return all;
}

/** Run until the skip ends (or a budget of ticks is spent). */
function finish(g: Engine_, budget = 3 * TICKS_PER_GAME_DAY): void {
  const stop = g.tick + budget;
  while (skipState(g.world) && g.tick < stop) g.step(1);
}

const TOWN = { map: 'borderstone', x: 50.5, y: 39.5 };
const TAVERN = { map: 'borderstone', x: 38.5, y: 44.5 };
const HUNTER_CAMP = { map: 'forest_edge', x: 6, y: 34 };
/** Open ground below the camp (outside it), clear of packs in the QUIET content. */
const FIELD = { x: 3.5, y: 42.5 };

/**
 * The content with forest_edge's packs near the hunters' camp moved out: in the shipped map
 * every camp lies inside some pack's alert circle (7.2 rule 1), so nobody may rest there.
 */
const QUIET = {
  ...CONTENT,
  maps: CONTENT.maps.map((m) =>
    m.id !== HUNTER_CAMP.map
      ? m
      : {
          ...m,
          spawns: m.spawns.filter(
            (sp) =>
              sp.kind !== 'monster' || Math.hypot(sp.x - HUNTER_CAMP.x, sp.y - HUNTER_CAMP.y) > 24,
          ),
        },
  ),
} as typeof CONTENT;
/** A dian wolf spawn of forest_edge (aggro 6, wander radius 2.5). */
const DIAN_WOLF_SPAWN = { x: 28.5, y: 9.5 };

// ---------------------------------------------------------------------------

describe('the skip clock and the engine seam (7.5)', () => {
  it('registers the hour-coarse handlers of the named systems and attaches them', () => {
    expect(skipHandlerIds()).toEqual(
      expect.arrayContaining([
        'city',
        'combat',
        'doors',
        'economy',
        'modifiers',
        'npc',
        'quests',
        'strategy',
        'world',
      ]),
    );
    const systems = allSystems();
    for (const id of [
      'world',
      'combat',
      'npc',
      'quests',
      'economy',
      'city',
      'strategy',
      'travel',
    ]) {
      expect(systems.find((s) => s.id === id)?.skip, id).toBeTypeOf('function');
    }
    // the travel system owns the clock
    expect(systems.filter((s) => s.clock).map((s) => s.id)).toEqual(['travel']);
  });

  it('steps a long skip one game hour per engine step, on the hour marks', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    g.step(500); // off the hour
    const start = g.tick;
    g.queue('time.skip', { hours: 10, kind: 'travel' }, { type: 'script', script: 'test' });
    g.step(1);
    const s = skipState(g.world);
    expect(s?.mode).toBe('long');
    expect(s?.endTick).toBe(start + 1 + 10 * TICKS_PER_GAME_HOUR);
    const ticks: number[] = [];
    while (skipState(g.world)) {
      g.step(1);
      ticks.push(g.tick);
    }
    // first step to the next hour mark, then whole hours, the last one to the end
    expect(ticks[0]).toBe(nextHourMark(start + 1));
    for (let i = 1; i < ticks.length - 1; i++) {
      expect((ticks[i] as number) % TICKS_PER_GAME_HOUR).toBe(0);
      expect((ticks[i] as number) - (ticks[i - 1] as number)).toBe(TICKS_PER_GAME_HOUR);
    }
    expect(ticks[ticks.length - 1]).toBe(start + 1 + 10 * TICKS_PER_GAME_HOUR);
    expect(ticks.length).toBe(11);
    // back to ordinary ticks
    g.step(1);
    expect(g.tick).toBe(start + 2 + 10 * TICKS_PER_GAME_HOUR);
  });

  it('sends every hour and day event and the daily weather across a long skip', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    const seen = collect(g);
    g.queue('time.skip', { hours: 30, kind: 'travel' }, { type: 'script', script: 'test' });
    g.step(1);
    finish(g);
    expect(events(seen, 'world.hour').length).toBe(30);
    expect(events(seen, 'world.day').length).toBe(1);
    expect(events(seen, 'world.weather').length).toBe(1);
    const done = events(seen, 'time.skipped')[0];
    expect(done?.data).toMatchObject({ kind: 'travel', mode: 'long', outcome: 'done', hours: 30 });
  });

  it('step(n) advances the clock by at least n ticks and never splits a coarse step', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    g.queue('time.skip', { hours: 12, kind: 'travel' }, { type: 'script', script: 'test' });
    g.step(1);
    const before = g.tick;
    g.step(3);
    expect(g.tick - before).toBeGreaterThanOrEqual(3);
    expect(g.tick % TICKS_PER_GAME_HOUR).toBe(0);
  });

  it('runs a short skip tick by tick and takes no clock step outside a skip', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    expect(skipClock(g.world)).toBeNull();
    expect(g.clockStep()).toBeNull();
    g.queue('time.wait', { hours: 2 });
    g.step(1);
    expect(skipState(g.world)?.mode).toBe('short');
    expect(g.clockStep()).toEqual({ stride: 1, hold: { backfill: BACKFILL_CAP } });
    const t = g.tick;
    g.step(1);
    expect(g.tick).toBe(t + 1);
    finish(g);
    expect(g.tick).toBe(t + 2 * TICKS_PER_GAME_HOUR);
    expect(g.world.slices.travel.last?.outcome).toBe('done');
  });

  it('defaults the tier by length (8 hours or less short) and takes a named tier', () => {
    expect(SHORT_SKIP_MAX_HOURS).toBe(8);
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    g.queue('time.skip', { hours: 8 });
    g.step(1);
    expect(skipState(g.world)?.mode).toBe('short');
    g.queue('time.cancel', {});
    g.step(1);
    expect(skipState(g.world)).toBeNull();
    expect(g.world.slices.travel.last?.outcome).toBe('cancelled');
    g.queue('time.skip', { hours: 8, mode: 'long' });
    g.step(1);
    expect(skipState(g.world)?.mode).toBe('long');
  });

  it('rejects a second skip, a bad length, and a travel skip from the player', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    g.queue('time.wait', { hours: 9 });
    g.step(1);
    expect(lastResult(g, 'time.wait')?.data).toMatchObject({ ok: false, code: 'bad_hours' });
    g.queue('time.wait', { hours: 0 });
    g.step(1);
    expect(lastResult(g, 'time.wait')?.data).toMatchObject({ ok: false, code: 'bad_hours' });
    g.queue('time.skip', { hours: 5, kind: 'travel' });
    g.step(1);
    expect(lastResult(g, 'time.skip')?.data).toMatchObject({ ok: false, code: 'not_allowed' });
    g.queue('time.cancel', {});
    g.step(1);
    expect(lastResult(g, 'time.cancel')?.data).toMatchObject({ ok: false, code: 'no_skip' });
    g.queue('time.wait', { hours: 3 });
    g.step(1);
    g.queue('time.wait', { hours: 3 });
    g.step(1);
    expect(lastResult(g, 'time.wait')?.data).toMatchObject({ ok: false, code: 'busy' });
    // a script may run a travel skip (the region map's journeys come through here)
    const h = game(TOWN.map, TOWN.x, TOWN.y);
    h.queue('time.skip', { hours: 30, kind: 'travel' }, { type: 'script', script: 'test' });
    h.step(1);
    expect(skipState(h.world)).toMatchObject({ kind: 'travel', mode: 'long' });
  });

  it('waits until a time of day at most 8 hours away', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y); // 06:00 on day 0
    g.queue('time.wait', { until: { hour: 20 } });
    g.step(1);
    expect(lastResult(g, 'time.wait')?.data).toMatchObject({ ok: false, code: 'too_long' });
    g.queue('time.wait', { until: { hour: 12, minute: 30 } });
    g.step(1);
    finish(g);
    expect(calendarAt(g.tick)).toMatchObject({ hour: 12, minute: 30 });
    expect(ticksUntil(tickAtDay(0, 23), 1)).toBe(2 * TICKS_PER_GAME_HOUR);
  });
});

// ---------------------------------------------------------------------------

describe('T-08: may the player wait here (7.2)', () => {
  it('cannot wait inside a dian wolf alert circle plus 6 m, and says why', () => {
    const near = game('forest_edge', DIAN_WOLF_SPAWN.x + 3, DIAN_WOLF_SPAWN.y + 8);
    const check = canWait(near, 'player');
    expect(check.ok).toBe(false);
    if (!check.ok) {
      expect(check.code).toBe('hostile');
      expect(keyOf(check.reason)).toBe('sys.travel.rest.reject.hostile');
    }
    near.queue('time.wait', { hours: 2 });
    near.step(1);
    expect(lastResult(near, 'time.wait')?.data).toMatchObject({ ok: false, code: 'hostile' });
    expect(keyOf(lastResult(near, 'time.wait')?.data.reason as TextRef)).toBe(
      'sys.travel.rest.reject.hostile',
    );
    expect(skipState(near.world)).toBeNull();
    // at the hunters' camp, far from every pack, waiting is fine
    const camp = game(HUNTER_CAMP.map, HUNTER_CAMP.x, HUNTER_CAMP.y, { content: QUIET });
    expect(canWait(camp, 'player')).toEqual({ ok: true });
  });

  it('cannot wait in a deep-sediment timed zone, but can inside a ward-stone circle', () => {
    const g = game(HUNTER_CAMP.map, FIELD.x, FIELD.y, { content: QUIET });
    const map = mapById(g.content, HUNTER_CAMP.map) as MapDef;
    const p = g.world.slices.world.entities.player as { x: number; y: number };
    const timed: MapDef = { ...map, sedimentClock: true };
    const view = (m: MapDef) => ({
      world: g.world,
      content: { ...g.content, maps: g.content.maps.map((x) => (x.id === m.id ? m : x)) },
    });
    expect(canWait(view(map), 'player')).toEqual({ ok: true });
    const out = canWait(view(timed), 'player');
    expect(out.ok).toBe(false);
    if (!out.ok) expect(keyOf(out.reason)).toBe('sys.travel.rest.reject.sediment');
    const ward = {
      id: 'zz_ward',
      name: 'ward',
      kind: 'ruin',
      tags: ['ward'],
      x: Math.floor(p.x) - 1,
      y: Math.floor(p.y) - 1,
      w: 3,
      h: 3,
    };
    expect(canWait(view({ ...timed, locations: [...timed.locations, ward] }), 'player')).toEqual({
      ok: true,
    });
    // a single location may carry the timed zone instead of the whole map
    const spot = { ...ward, id: 'zz_spot', tags: ['sediment_clock'] };
    const spotted = canWait(view({ ...map, locations: [...map.locations, spot] }), 'player');
    expect(spotted.ok).toBe(false);
  });

  it('cannot wait on the beast-tide night', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    expect(canWait(g, 'player')).toEqual({ ok: true });
    g.queue('flag.set', { key: 'combat.wave.tide_first', value: 'go' });
    g.step(1);
    const out = canWait(g, 'player');
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.code).toBe('story');
      expect(keyOf(out.reason)).toBe('sys.travel.rest.reject.tide');
    }
    g.queue('time.wait', { hours: 1 });
    g.step(1);
    expect(skipState(g.world)).toBeNull();
    // somewhere else the tide does not lock the clock
    const elsewhere = game(HUNTER_CAMP.map, HUNTER_CAMP.x, HUNTER_CAMP.y, { content: QUIET });
    elsewhere.queue('flag.set', { key: 'combat.wave.tide_first', value: 'go' });
    elsewhere.step(1);
    expect(canWait(elsewhere, 'player')).toEqual({ ok: true });
  });

  it('cannot wait on the divine stage, in a scene, or in a dungeon off its safe points', () => {
    const court = createGame({ seed: 7, aiMode: 'off', content: CONTENT });
    court.step(2); // the prologue's opening scene on the divine stage
    const c = canWait(court, 'player');
    expect(c.ok).toBe(false);
    if (!c.ok) expect(['place', 'story']).toContain(c.code);
    const ruins = game('seal_ruins', 32, 22);
    const r = canWait(ruins, 'player');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(['place', 'hostile']).toContain(r.code);
  });

  it('stops a running wait at the hour a hostile comes within reach', () => {
    const g = game(HUNTER_CAMP.map, HUNTER_CAMP.x, HUNTER_CAMP.y, { content: QUIET });
    const seen = collect(g);
    g.queue('time.wait', { hours: 6 });
    g.step(1);
    expect(skipState(g.world)).not.toBeNull();
    g.step(TICKS_PER_GAME_HOUR - 2);
    // a wolf turns up beside the camp
    g.queue(
      'combat.spawn',
      { monsterId: 'dian_wolf', mapId: HUNTER_CAMP.map, x: HUNTER_CAMP.x + 4, y: HUNTER_CAMP.y },
      { type: 'script', script: 'test' },
    );
    finish(g);
    const done = events(seen, 'time.skipped').at(-1);
    expect(done?.data.outcome).toBe('interrupted');
    expect(keyOf(done?.data.reason)).toMatch(
      /^sys\.travel\.(rest\.reject\.hostile|skip\.stop\.attacked)$/,
    );
    expect(done?.data.hours).toBeLessThan(6);
  });
});

// ---------------------------------------------------------------------------

describe('T-09: sleeping (7.1, 7.3, 7.4)', () => {
  it('cannot sleep at 17:00, can at 19:00, and wakes at 06:00 the next day', () => {
    const g = game(TAVERN.map, TAVERN.x, TAVERN.y, { at: tickAtDay(0, 17) });
    expect(calendarAt(g.tick).hour).toBe(17);
    const early = canSleep(g, 'player');
    expect(early.ok).toBe(false);
    if (!early.ok) expect(keyOf(early.reason)).toBe('sys.travel.rest.reject.too_early');
    g.queue('time.sleep', {});
    g.step(1);
    expect(lastResult(g, 'time.sleep')?.data).toMatchObject({ ok: false, code: 'too_early' });
    const h = game(TAVERN.map, TAVERN.x, TAVERN.y, { at: tickAtDay(0, 19) });
    expect(canSleep(h, 'player')).toEqual({ ok: true });
    const seen = collect(h);
    h.queue('time.sleep', {});
    h.step(1);
    expect(skipState(h.world)).toMatchObject({ kind: 'sleep', mode: 'long' });
    finish(h);
    expect(calendarAt(h.tick)).toMatchObject({ dayIndex: 1, hour: 6, minute: 0 });
    expect(events(seen, 'time.skipped').at(-1)?.data).toMatchObject({
      kind: 'sleep',
      outcome: 'done',
    });
    expect(wakeTick(tickAtDay(1, 2, 30))).toBe(tickAtDay(1, 6));
  });

  it('needs a bed in town and a camp out in the field', () => {
    const street = game(TOWN.map, TOWN.x, TOWN.y, { at: tickAtDay(0, 20) });
    const s = canSleep(street, 'player');
    expect(s.ok).toBe(false);
    if (!s.ok) expect(keyOf(s.reason)).toBe('sys.travel.rest.reject.need_bed');
    const field = game(HUNTER_CAMP.map, FIELD.x, FIELD.y, { at: tickAtDay(0, 20), content: QUIET });
    const f = canSleep(field, 'player');
    expect(f.ok).toBe(false);
    if (!f.ok) expect(keyOf(f.reason)).toBe('sys.travel.rest.reject.need_camp');
    const camp = game(HUNTER_CAMP.map, HUNTER_CAMP.x, HUNTER_CAMP.y, {
      at: tickAtDay(0, 20),
      content: QUIET,
    });
    expect(canSleep(camp, 'player')).toEqual({ ok: true });
  });

  it('rolls the night ambush in the field: no camp fire doubles the chance', () => {
    const lit = ambushChance(2, { night: true, fire: true });
    const dark = ambushChance(2, { night: true, fire: false });
    expect(lit).toBeCloseTo(0.02);
    expect(dark).toBeCloseTo(2 * lit);
    expect(ambushChance(2, { night: false, fire: true })).toBeCloseTo(lit / 2);
    expect(ambushChance(0, { night: true, fire: false })).toBe(0);
    const camp = game(HUNTER_CAMP.map, HUNTER_CAMP.x, HUNTER_CAMP.y, {
      at: tickAtDay(0, 22),
      content: QUIET,
    });
    // the forest edge is canon sediment level one (map_briefs.md 1.2), half the level above
    expect(sleepAmbushChance(camp, 'player', camp.tick)).toBeCloseTo(
      ambushChance(1, { night: true, fire: true }),
    );
    const inn = game(TAVERN.map, TAVERN.x, TAVERN.y, { at: tickAtDay(0, 22) });
    expect(sleepAmbushChance(inn, 'player', inn.tick)).toBe(0);
  });

  it('a camp sleep rolls the ambush every hour and wakes the sleeper when it hits', () => {
    // across seeds, some nights at the camp end in an ambush, at an hour mark
    let ambushed = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const g = game(HUNTER_CAMP.map, HUNTER_CAMP.x, HUNTER_CAMP.y, {
        seed,
        at: tickAtDay(0, 18),
        content: QUIET,
      });
      const seen = collect(g);
      g.queue('time.sleep', {});
      g.step(1);
      finish(g);
      const end = events(seen, 'time.skipped').at(-1);
      if (end?.data.outcome === 'interrupted') {
        expect(keyOf(end.data.reason)).toBe('sys.travel.skip.stop.ambush');
        expect(events(seen, 'time.ambush').length).toBe(1);
        expect(g.tick % TICKS_PER_GAME_HOUR).toBe(0);
        ambushed++;
      }
    }
    // 12 hours at 1% to 2% per hour: about a fifth of the nights
    expect(ambushed).toBeGreaterThan(0);
    expect(ambushed).toBeLessThan(24);
    // 24 whole games, each running a town's hourly NPC brains through a day: room for a
    // busy machine running the full suite
  }, 120_000);

  it('a full night restores the sleeper; a wait does not', () => {
    const g = game(TAVERN.map, TAVERN.x, TAVERN.y, { at: tickAtDay(0, 20) });
    const u = g.world.slices.combat.units.player as { hp: number };
    u.hp = 1;
    g.queue('time.sleep', {});
    g.step(1);
    finish(g);
    expect(u.hp).toBeGreaterThan(1);
    const full = g.world.slices.combat.units.player as { hp: number };
    g.queue('time.wait', { hours: 1 });
    g.step(1);
    finish(g);
    expect(full.hp).toBe(u.hp);
  });
});

// ---------------------------------------------------------------------------

/** NPC places, market prices and the settlement after a skip, for comparing tiers. */
function outcome(world: World) {
  const npcs = Object.fromEntries(
    Object.entries(world.slices.npc.npcs).map(([id, st]) => [id, `${st.mapId}/${st.locId}`]),
  );
  const prices: Record<string, number> = {};
  for (const [m, st] of Object.entries(world.slices.economy.markets)) {
    for (const [item, p] of Object.entries(
      (st as { prices?: Record<string, number> }).prices ?? {},
    ))
      prices[`${m}/${item}`] = p;
  }
  return {
    npcs,
    prices,
    city: JSON.stringify(world.slices.city),
    weather: world.slices.world.weather,
  };
}

describe('T-10: the two tiers agree, and each tier repeats itself exactly', () => {
  function save(): World {
    const g = game(TOWN.map, TOWN.x, TOWN.y, { at: tickAtDay(1, 9) });
    return JSON.parse(JSON.stringify({ ...g.world, log: [] })) as World;
  }

  function skip8(world: World, mode: 'short' | 'long'): Engine_ {
    const g = resumeGame(JSON.parse(JSON.stringify(world)) as World, { content: CONTENT });
    g.queue('time.skip', { hours: 8, mode });
    g.step(1);
    finish(g);
    return g;
  }

  it('settles the same 8 hours tick by tick and hour by hour within the tolerance', () => {
    const snap = save();
    const fine = skip8(snap, 'short');
    const coarse = skip8(snap, 'long');
    expect(fine.tick).toBe(coarse.tick);
    expect(fine.world.slices.travel.last?.outcome).toBe('done');
    expect(coarse.world.slices.travel.last?.outcome).toBe('done');
    const a = outcome(fine.world);
    const b = outcome(coarse.world);
    // the clock and the weather are exact
    expect(calendarAt(fine.tick)).toEqual(calendarAt(coarse.tick));
    expect(b.weather).toBe(a.weather);
    // NPCs stand at the same scheduled place (hour granularity: nearly all of them)
    const ids = Object.keys(a.npcs);
    const same = ids.filter((id) => a.npcs[id] === b.npcs[id]).length;
    expect(ids.length).toBeGreaterThan(10);
    expect(same / ids.length).toBeGreaterThanOrEqual(0.9);
    // market prices within 2% of each other
    for (const [k, p] of Object.entries(a.prices)) {
      const q = b.prices[k] as number;
      expect(Math.abs(q - p), k).toBeLessThanOrEqual(Math.max(1, 0.02 * p));
    }
    // the settlement (no time-driven state of its own yet) settles identically
    expect(b.city).toBe(a.city);
  });

  it('repeats exactly within a tier', () => {
    const snap = save();
    for (const mode of ['short', 'long'] as const) {
      expect(worldHash(skip8(snap, mode).world)).toBe(worldHash(skip8(snap, mode).world));
    }
  });
});

// ---------------------------------------------------------------------------

describe('T-11: no model request goes out while a skip runs', () => {
  it('holds every request during the skip and backfills at most the cap afterwards', () => {
    const g = game(TAVERN.map, TAVERN.x, TAVERN.y, { aiMode: 'external', at: tickAtDay(0, 20) });
    // answer nothing before the skip: drain what is pending so far
    g.takeAiRequests();
    g.queue('time.sleep', {});
    g.step(1);
    expect(skipState(g.world)?.kind).toBe('sleep');
    let during = 0;
    let filed = 0;
    g.onEvents((evs) => {
      if (skipState(g.world)) filed += evs.filter((e) => e.kind === 'ai.requested').length;
    });
    while (skipState(g.world)) {
      g.step(1);
      during += g.takeAiRequests().length;
    }
    // the night crossed midnight (diaries) and the dawn plan round (06:00)
    expect(filed).toBeGreaterThan(0);
    expect(during).toBe(0);
    const backfill = g.world.ai.pending.filter((r) => r.hold === 'backfill');
    expect(backfill.length).toBeGreaterThan(0);
    expect(backfill.length).toBeLessThanOrEqual(BACKFILL_CAP);
    for (const r of backfill) expect(r.role).toBe('npc.batch_diary');
    // the step after the skip releases them with a fresh deadline
    g.step(1);
    const after = g.takeAiRequests();
    expect(after.length).toBeGreaterThanOrEqual(backfill.length);
    for (const r of after.filter((x) => x.backfill)) {
      expect(r.hold).toBeUndefined();
      expect(r.deadlineTick).toBeGreaterThan(g.tick);
    }
    // decisions filed during the skip went to the built-in AI (their fallbacks ran)
    const resolved = g.world.recent.filter(
      (e) => e.kind === 'ai.resolved' && e.data.outcome === 'fallback',
    );
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('changes nothing with the AI off: requests resolve on the next tick as always', () => {
    const g = game(TAVERN.map, TAVERN.x, TAVERN.y, { at: tickAtDay(0, 20) });
    g.queue('time.sleep', {});
    g.step(1);
    finish(g);
    expect(g.world.ai.pending.every((r) => r.hold === undefined)).toBe(true);
  });
});

// ---------------------------------------------------------------------------

describe('T-16: a log with a fight, waiting and sleeping replays to the same world', () => {
  it('replays field by field', () => {
    const g = game('forest_edge', 22.5, 45.5, { seed: 11 });
    // a grey wolf pack on the southern trail: fight the nearest
    const p = g.world.slices.world.entities.player as { x: number; y: number };
    const wolf = Object.values(g.world.slices.world.entities)
      .filter((e) => e.ref === 'grey_wolf' && e.alive && e.mapId === 'forest_edge')
      .sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0];
    expect(wolf).toBeDefined();
    g.queue('combat.attack', { targetId: wolf?.id as string, on: true });
    g.step(20 * 30);
    const fought = g.world.recent.some((e) => e.kind === 'combat.damage');
    expect(fought).toBe(true);
    // walk off to the hunters' camp, wait, then sleep through the night
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: HUNTER_CAMP.map,
      x: HUNTER_CAMP.x,
      y: HUNTER_CAMP.y,
    });
    g.step(20 * 15);
    g.queue('time.wait', { hours: 3 });
    g.step(1);
    finish(g);
    g.step(tickAtDay(0, 19) - g.tick);
    g.queue('time.sleep', {});
    g.step(1);
    finish(g);
    g.step(200);
    const kinds = g.world.log.map((e) => e.command.kind);
    expect(kinds).toEqual(expect.arrayContaining(['combat.attack', 'time.wait', 'time.sleep']));
    const tick = g.tick;
    const replay = Engine.replay(11, g.content, g.systems, g.world.log, { aiMode: 'off' });
    replay.step(tick);
    expect(replay.tick).toBe(tick);
    expect(worldHash(replay.world)).toBe(worldHash(g.world));
    expect(replay.world.slices.travel).toEqual(g.world.slices.travel);
  }, 60000);

  it('resumes a skip saved midway to the same world', () => {
    const g = game(TAVERN.map, TAVERN.x, TAVERN.y, { at: tickAtDay(0, 19) });
    g.queue('time.sleep', {});
    g.step(1);
    g.step(3);
    expect(skipState(g.world)).not.toBeNull();
    const copy = resumeGame(JSON.parse(JSON.stringify(g.world)) as World, { content: CONTENT });
    finish(g);
    finish(copy);
    expect(copy.tick).toBe(g.tick);
    expect(worldHash(copy.world)).toBe(worldHash(g.world));
  });
});

// ---------------------------------------------------------------------------

describe('interrupts and the summary (7.4, 7.6)', () => {
  it('stops at the tick another system reports an interrupt and keeps the summary', () => {
    const g = game(TOWN.map, TOWN.x, TOWN.y);
    const seen = collect(g);
    g.queue('time.wait', { hours: 5 });
    g.step(1);
    g.step(100);
    // a wave on another map
    g.queue('flag.set', { key: 'combat.wave.forest_vanguard', value: 'go' });
    g.step(1);
    // the wave is on another map: noted, not stopping
    expect(skipState(g.world)).not.toBeNull();
    expect(skipState(g.world)?.notes.map((n) => n.event)).toContain('combat.wave_spawned');
    g.queue('flag.set', { key: 'combat.wave.tide_first', value: 'go' });
    g.step(1);
    expect(skipState(g.world)).toBeNull();
    const end = events(seen, 'time.skipped').at(-1);
    expect(end?.data.outcome).toBe('interrupted');
    expect(keyOf(end?.data.reason)).toBe('sys.travel.skip.stop.tide');
    expect(g.world.slices.travel.last?.endTick).toBe(g.tick);
    expect(g.world.slices.travel.last?.notes.length).toBeGreaterThan(0);
  });

  it('a nation battle or war naming the player interrupts the skip, one not naming it does not', () => {
    // a tiny probe system that emits strategy's own events on command, standing in for the
    // real strategy system's battle and war resolution (out of scope here)
    let pending: { kind: 'slg.battle' | 'slg.war_declared'; nation: string } | null = null;
    const probe: GameSystem = {
      id: 'zz_probe',
      order: 99,
      commands: {
        'zz_probe.fire'(ctx) {
          if (pending?.kind === 'slg.battle') {
            ctx.emit('slg.battle', {
              provinceId: 'zz',
              attacker: pending.nation,
              defender: 'other',
              victor: 'draw',
              losses: {},
              manual: false,
            });
          } else if (pending?.kind === 'slg.war_declared') {
            ctx.emit('slg.war_declared', {
              attacker: pending.nation,
              defender: 'other',
              casusBelli: false,
              allies: [],
            });
          }
          return ok();
        },
      },
    };
    const engine = createGame({
      seed: 7,
      aiMode: 'off',
      content: CONTENT,
      systems: [...allSystems(), probe],
    });
    engine.queue('flag.set', { key: 'act', value: 'act1' });
    engine.queue('world.teleport', { entityId: 'player', mapId: TOWN.map, x: TOWN.x, y: TOWN.y });
    engine.step(1);
    engine.queue('time.wait', { hours: 5 });
    engine.step(1);
    expect(skipState(engine.world)).not.toBeNull();
    pending = { kind: 'slg.battle', nation: 'other' };
    engine.queue('zz_probe.fire', {});
    engine.step(1);
    expect(skipState(engine.world)).not.toBeNull(); // a battle not naming the player: noted, not stopping
    pending = { kind: 'slg.war_declared', nation: 'player' };
    engine.queue('zz_probe.fire', {});
    engine.step(1);
    expect(skipState(engine.world)).toBeNull();
    const last = engine.world.slices.travel.last;
    expect(keyOf(last?.reason)).toBe('sys.travel.skip.stop.crisis');
  });
});

// ---------------------------------------------------------------------------

describe('combat/skip.ts refuses to silently drop a periodic or pulse aura', () => {
  it('throws rather than settle a DoT or HoT aura across an hour-coarse step', () => {
    const content = {
      ...buildContent(),
    };
    content.auras = [
      ...content.auras,
      {
        id: 'zz_test_dot',
        name: 'test dot',
        kind: 'debuff',
        duration: 7200,
        periodic: { every: 3, damage: true },
      } as unknown as (typeof content.auras)[number],
    ];
    const g = game(TOWN.map, TOWN.x, TOWN.y, { content });
    const p = g.world.slices.world.entities.player as { id: string };
    const u = g.world.slices.combat.units[p.id] as {
      auras: { id: string; sourceId: string; expires: number; stacks: number; lvl: number }[];
    };
    u.auras.push({ id: 'zz_test_dot', sourceId: p.id, expires: g.tick + 7200, stacks: 1, lvl: 1 });
    g.queue('time.skip', { hours: 10, kind: 'travel' }, { type: 'script', script: 'test' });
    g.step(1);
    expect(() => g.step(1)).toThrow(/periodic or pulse/);
  });
});
