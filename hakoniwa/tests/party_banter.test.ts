// Party chatter (PK-M1-21; builtin_ai.md 11.3, 14.2 metric 12; companions_and_party.md 8.2,
// 8.4, 10.1): the selection core (priority x freshness x relevance, once-only, void), the
// pacing of each kind, and the runtime over a fixture ln_party pack (the shipped lines are
// PK-M1-29's): an exchange on the first visit of a place, its lines in order as content keys
// with a line every few seconds, the reply point and its bond, the bond floor, combat cutting
// an exchange (it comes again from the first line; cut twice it is void), an exchange after
// an event and after a feat, the road (travel) and the campfire with their pacing, the
// content checks, and alive metric 12 over a fixture road with no repeats.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { validateBanter } from '../src/content/packs/party';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as ailments } from '../src/systems/ailments';
import { system as combat } from '../src/systems/combat';
import type { MonsterDef } from '../src/systems/combat/types';
import type { LinePack } from '../src/systems/dialogue/lines/types';
import { system as doors } from '../src/systems/doors';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { banterMetric, banterState, system as party } from '../src/systems/party';
import {
  freshness,
  pacingAllows,
  pickBanter,
  scoreBanter,
} from '../src/systems/party/banter_select';
import { DEFAULT_BANTER } from '../src/systems/party/config';
import type { BanterDef, BanterState } from '../src/systems/party/types';
import { skipState, system as travel } from '../src/systems/travel';
import { removeEntity, system as world } from '../src/systems/world';

const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, party, doors, ailments, travel];

let shipped: ContentMap | undefined;
function base(): ContentMap {
  shipped ??= buildContent();
  return shipped;
}

const QUIET: MonsterDef = {
  id: 'zz_quiet',
  name: 'zz',
  desc: 'zz',
  family: 'beast',
  faction: 'monster',
  minLevel: 3,
  maxLevel: 3,
  aggroRadius: 0,
  leash: 40,
  appearance: { base: 'wolf', colors: ['#555555', '#777777', '#999999', '#bbbbbb'] },
};

const two = ['ron', 'shiya'];
const DEFS: BanterDef[] = [
  {
    id: 'zz_enter',
    cast: two,
    kind: 'enter',
    at: 'forest_edge',
    priority: 2,
    speakers: ['ron', 'shiya', 'ron'],
    replies: [{ bond: { ron: 1 } }, { bond: { ron: -1, shiya: 1 } }],
  },
  {
    id: 'zz_event',
    cast: two,
    kind: 'event',
    when: 'a1_martha_strike',
    priority: 3,
    speakers: ['shiya', 'ron'],
  },
  {
    id: 'zz_feat',
    cast: two,
    kind: 'event',
    on: 'feat.catch_arrow',
    priority: 3,
    speakers: ['ron', 'shiya'],
  },
  { id: 'zz_road_a', cast: two, kind: 'travel', priority: 2, speakers: ['ron', 'shiya'] },
  { id: 'zz_road_b', cast: two, kind: 'travel', priority: 1, speakers: ['shiya', 'ron'] },
  { id: 'zz_road_c', cast: two, kind: 'travel', priority: 1, speakers: ['ron', 'ron'] },
  { id: 'zz_fire_a', cast: two, kind: 'campfire', priority: 3, speakers: ['ron', 'shiya'] },
  { id: 'zz_fire_b', cast: two, kind: 'campfire', priority: 2, speakers: ['shiya', 'ron'] },
  { id: 'zz_fire_c', cast: two, kind: 'campfire', priority: 1, speakers: ['ron', 'shiya'] },
  { id: 'zz_fire_d', cast: two, kind: 'campfire', priority: 1, speakers: ['shiya', 'shiya'] },
];

/** The fixture ln_party: n lines per exchange (one written as an object, one deleted). */
function pack(defs: readonly BanterDef[] = DEFS): LinePack {
  const slots: LinePack['slots'] = {};
  for (const d of defs) {
    const n = d.speakers.length + (d.replies?.length ?? 0);
    slots[`party.${d.id}`] = Array.from({ length: n }, (_v, i) => `zz${i}`);
  }
  if (defs !== DEFS) return { id: 'ln_party', slots };
  slots['party.zz_enter'] = ['zz0', { zh: 'zz1' }, 'zz2', 'zz3', 'zz4'];
  slots['party.zz_road_c'] = ['zz0', null];
  return { id: 'ln_party', slots };
}

function content(defs: readonly BanterDef[] = DEFS): ContentMap {
  const b = base();
  return {
    ...b,
    monsters: [...b.monsters, QUIET],
    linePacks: [...(b.linePacks ?? []).filter((p) => p.id !== 'ln_party'), pack(defs)],
    partyBanter: [...defs],
  } as ContentMap;
}

/** A game whose only exchanges are `defs` (with a full fixture ln_party for them). */
function makeGameWith(defs: readonly BanterDef[], seed = 7): Engine {
  const g = createGame({ seed, aiMode: 'off', content: content(defs), systems: SYSTEMS });
  const log: AnyWorldEvent[] = [];
  g.onEvents((evs) => log.push(...evs));
  seen.set(g, log);
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(1);
  return g;
}

/** The party in a fight for five seconds (combat keeps combatUntil while it fights). */
function brawl(g: Engine): void {
  withCtx(g, (ctx) => {
    const u = ctx.world.slices.combat.units.player;
    if (u) u.combatUntil = ctx.tick + 100;
  });
}

let fixture: ContentMap | undefined;
const seen = new WeakMap<Engine, AnyWorldEvent[]>();
function makeGame(seed = 7): Engine {
  fixture ??= content();
  const g = createGame({ seed, aiMode: 'off', content: fixture, systems: SYSTEMS });
  const log: AnyWorldEvent[] = [];
  g.onEvents((evs) => log.push(...evs));
  seen.set(g, log);
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(1);
  return g;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  const log = seen.get(g) ?? g.world.recent;
  return log.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

function lastResult(g: Engine, kind: string) {
  const r = [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

/** Ron and Shiya in the party, each with the given bond. */
function party2(g: Engine, bond = 25): void {
  for (const id of two) g.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
  g.step(1);
  for (const id of two) {
    const m = g.world.slices.party.members[id];
    if (m) m.bond = bond;
  }
}

function goTo(g: Engine, mapId: string, x: number, y: number): void {
  g.queue('world.teleport', { entityId: 'player', mapId, x, y });
  g.step(1);
}

/** Take every monster off a map (a quiet stage for the chatter). */
function clearMap(g: Engine, mapId: string): void {
  withCtx(g, (ctx) => {
    for (const e of Object.values(ctx.world.slices.world.entities))
      if (e.mapId === mapId && e.kind === 'monster') removeEntity(ctx, e.id);
  });
}

const lines = (g: Engine, id: string) =>
  events(g, 'party.banter').filter((e) => e.data.exchangeId === id);
const ends = (g: Engine, id: string) =>
  events(g, 'party.banter_end').filter((e) => e.data.exchangeId === id);

const empty = (): BanterState => ({ played: {} });
const OPTS = { freshPerDay: 0.1, relevance: 2 };
const ready = { castReady: true, holds: true, daysSince: null, caused: false };

// ---------------------------------------------------------------------------

describe('choosing an exchange (builtin_ai.md 11.3)', () => {
  it('priority x freshness x relevance, ties by id', () => {
    const [a, b] = [DEFS[3], DEFS[4]] as BanterDef[];
    const scored = scoreBanter(
      [
        { def: a, facts: ready },
        { def: b, facts: { ...ready, caused: true } },
      ],
      empty(),
      OPTS,
    );
    expect(scored.map((s) => [s.id, s.score])).toEqual([
      ['zz_road_a', 2],
      ['zz_road_b', 2],
    ]);
    // the caused one wins once its priority matches
    const c = { ...b, priority: 2 };
    expect(
      pickBanter(
        [
          { def: a, facts: ready },
          { def: c, facts: { ...ready, caused: true } },
        ],
        empty(),
        OPTS,
      ),
    ).toBe('zz_road_b');
  });

  it('a once-only exchange heard never again; a repeatable one recovers by the day', () => {
    const once = DEFS[0] as BanterDef;
    const again = { ...once, id: 'zz_again', once: false };
    expect(freshness(once, null, 0.1)).toBe(1);
    expect(freshness(once, 30, 0.1)).toBe(0);
    expect(freshness(again, 0, 0.1)).toBe(0);
    expect(freshness(again, 5, 0.1)).toBe(0.5);
    expect(freshness(again, 20, 0.1)).toBe(1);
    const st: BanterState = { played: { zz_enter: 1 }, void: ['zz_event'] };
    expect(pickBanter([{ def: once, facts: ready }], st, OPTS)).toBeNull();
    const ev = DEFS[1] as BanterDef;
    expect(pickBanter([{ def: ev, facts: ready }], st, OPTS)).toBeNull();
    expect(
      pickBanter([{ def: ev, facts: { ...ready, castReady: false } }], empty(), OPTS),
    ).toBeNull();
  });

  it('pacing: ten real minutes exploring, 30 game minutes of road, three a campfire night', () => {
    const cfg = DEFAULT_BANTER;
    expect(pacingAllows('enter', { played: {}, lastAt: 100 }, 100 + 11999, 0, cfg)).toBe(false);
    expect(pacingAllows('enter', { played: {}, lastAt: 100 }, 100 + 12000, 0, cfg)).toBe(true);
    expect(pacingAllows('travel', { played: {}, journey: 599 }, 0, 0, cfg)).toBe(false);
    expect(pacingAllows('travel', { played: {}, journey: 600 }, 0, 0, cfg)).toBe(true);
    expect(pacingAllows('campfire', { played: {}, camp: { night: 4, count: 3 } }, 0, 4, cfg)).toBe(
      false,
    );
    expect(pacingAllows('campfire', { played: {}, camp: { night: 4, count: 3 } }, 0, 5, cfg)).toBe(
      true,
    );
  });
});

describe('an exchange on the first visit of a place', () => {
  it('says its lines in order as content keys, a line every four seconds, then asks', () => {
    const g = makeGame();
    party2(g);
    clearMap(g, 'forest_edge');
    goTo(g, 'forest_edge', 60, 60);
    g.step(25);
    const first = lines(g, 'zz_enter');
    expect(first.length).toBe(1);
    expect(first[0]?.data).toMatchObject({
      kind: 'enter',
      line: 0,
      speakerId: 'companion_ron',
      text: { key: 'c.line_packs.ln_party.slots.party_zz_enter.0' },
    });
    g.step(20 * 12);
    const said = lines(g, 'zz_enter');
    expect(said.map((e) => e.data.line)).toEqual([0, 1, 2]);
    // a line written as an object keeps its text under zh
    expect(said[1]?.data.text).toEqual({ key: 'c.line_packs.ln_party.slots.party_zz_enter.1.zh' });
    expect(said.map((e) => e.data.speakerId)).toEqual([
      'companion_ron',
      'companion_shiya',
      'companion_ron',
    ]);
    const ask = events(g, 'party.banter_ask')[0]?.data;
    expect(ask?.options).toEqual([
      { key: 'c.line_packs.ln_party.slots.party_zz_enter.3' },
      { key: 'c.line_packs.ln_party.slots.party_zz_enter.4' },
    ]);
    const ron = g.world.slices.party.members.ron?.bond ?? 0;
    const shiya = g.world.slices.party.members.shiya?.bond ?? 0;
    g.queue('party.banter_reply', { exchangeId: 'zz_enter', option: 1 });
    g.step(1);
    expect(g.world.slices.party.members.ron?.bond).toBe(ron - 1);
    expect(g.world.slices.party.members.shiya?.bond).toBe(shiya + 1);
    expect(ends(g, 'zz_enter').map((e) => e.data)).toEqual([
      { exchangeId: 'zz_enter', kind: 'enter', outcome: 'done', reply: 1 },
    ]);
    // a reply with nothing to answer is refused
    g.queue('party.banter_reply', { exchangeId: 'zz_enter', option: 0 });
    g.step(1);
    expect(lastResult(g, 'party.banter_reply')?.code).toBe('no_banter');
  });

  it('no chatter before the bond reaches 相识 (8.2: 20)', () => {
    const g = makeGame();
    party2(g, 19);
    clearMap(g, 'forest_edge');
    goTo(g, 'forest_edge', 60, 60);
    g.step(20 * 5);
    expect(lines(g, 'zz_enter')).toEqual([]);
  });

  it('combat cuts it short; it comes again from the first line; cut twice it is void', () => {
    const g = makeGame();
    party2(g);
    clearMap(g, 'forest_edge');
    goTo(g, 'forest_edge', 60, 60);
    g.step(25);
    const fight = () => {
      // the party in a fight for five seconds (combat keeps combatUntil while it fights)
      withCtx(g, (ctx) => {
        const u = ctx.world.slices.combat.units.player;
        if (u) u.combatUntil = ctx.tick + 100;
      });
      g.step(20 * 5);
      // calm again: the next calm moment comes on the next look
      g.step(25);
    };
    fight();
    expect(ends(g, 'zz_enter').map((e) => e.data.outcome)).toEqual(['cut']);
    // again from the first line at the next calm moment
    const again = lines(g, 'zz_enter').map((e) => e.data.line);
    expect(again).toEqual([0, 0]);
    fight();
    expect(ends(g, 'zz_enter').map((e) => e.data.outcome)).toEqual(['cut', 'void']);
    expect(banterState2(g).void).toEqual(['zz_enter']);
  });
});

const banterState2 = (g: Engine) => {
  let st: BanterState = { played: {} };
  withCtx(g, (ctx) => {
    st = banterState(ctx);
  });
  return st;
};

describe('held exchanges (11.3: they wait for a calm moment in their own situation)', () => {
  it('an enter exchange that came in a fight plays only back in its place', () => {
    const g = makeGame();
    party2(g);
    clearMap(g, 'forest_edge');
    brawl(g);
    goTo(g, 'forest_edge', 60, 60);
    g.step(25);
    // the fight is over by the time the player is away: it does not play there
    goTo(g, 'seal_ruins', 32.5, 17.5);
    g.step(20 * 10);
    expect(lines(g, 'zz_enter')).toEqual([]);
    goTo(g, 'forest_edge', 60, 60);
    g.step(25);
    expect(lines(g, 'zz_enter').map((e) => e.data.line)).toEqual([0]);
  });

  it('held ones play by priority x freshness, not by id', () => {
    const both = (id: string, priority: number): BanterDef => ({
      id,
      cast: two,
      kind: 'event',
      when: 'a1_martha_strike',
      priority,
      speakers: ['ron', 'shiya'],
    });
    const g = makeGameWith([both('zz_ev_a', 1), both('zz_ev_b', 5)]);
    party2(g);
    g.step(25);
    brawl(g);
    g.queue('flag.set', { key: 'a1_martha_strike', value: true });
    g.step(20 * 8);
    const started = events(g, 'party.banter').filter((e) => e.data.line === 0);
    expect(started.map((e) => e.data.exchangeId)).toEqual(['zz_ev_b']);
  });

  it('a repeatable road or fire exchange is heard again only once it is fresh (no repeats)', () => {
    const road: BanterDef = {
      id: 'zz_walk',
      cast: two,
      kind: 'travel',
      once: false,
      priority: 1,
      speakers: ['ron', 'shiya'],
    };
    const fire: BanterDef = { ...road, id: 'zz_fire', kind: 'campfire' };
    const g = makeGameWith([road, fire]);
    party2(g);
    clearMap(g, 'forest_edge');
    goTo(g, 'forest_edge', 40, 60);
    for (let s = 0; s < 150; s += 1) {
      const x = 40 + (s % 20 < 10 ? s % 10 : 10 - (s % 10));
      g.queue('world.teleport', { entityId: 'player', mapId: 'forest_edge', x, y: 60 });
      g.step(20);
    }
    expect(ends(g, 'zz_walk').length).toBe(1);
    g.queue(
      'time.skip',
      { hours: 13, kind: 'travel', mode: 'long' },
      { type: 'script', script: 'zz' },
    );
    g.step(1);
    for (let i = 0; i < 40 && skipState(g.world); i++) g.step(1);
    clearMap(g, 'ash_waste');
    goTo(g, 'ash_waste', 70.5, 106.5);
    g.step(20 * 60);
    expect(ends(g, 'zz_fire').length).toBe(1);
    const m = banterMetric(
      events(g, 'party.banter_end').map((e) => e.data),
      1,
    );
    expect(m.repeats).toBe(0);
  });
});

describe('after an event (builtin_ai.md 11.3 事件之后)', () => {
  it('its condition coming true raises it once; a feat raises the one waiting for it', () => {
    const g = makeGame();
    party2(g);
    g.step(25);
    g.queue('flag.set', { key: 'a1_martha_strike', value: true });
    g.step(25);
    expect(lines(g, 'zz_event').length).toBe(1);
    g.step(20 * 10);
    expect(ends(g, 'zz_event').map((e) => e.data.outcome)).toEqual(['done']);
    // the exploring gap holds the next one until ten real minutes have passed
    withCtx(g, (ctx) =>
      ctx.emit('feat.performed', {
        actorId: 'player',
        kind: 'catch_arrow',
        tier: 0,
        mapId: 'seal_ruins',
        x: 32,
        y: 17,
      }),
    );
    g.step(25);
    expect(lines(g, 'zz_feat')).toEqual([]);
    g.step(12000);
    expect(lines(g, 'zz_feat').length).toBe(2);
    expect(ends(g, 'zz_event').length).toBe(1);
  });
});

describe('on the road and at the campfire (10.1)', () => {
  it('one road exchange per 30 game minutes of journey; metric 12 holds with no repeats', () => {
    const g = makeGame();
    party2(g);
    clearMap(g, 'forest_edge');
    goTo(g, 'forest_edge', 40, 60);
    // walk the road for two and a half game hours: a tile a game minute (20 ticks)
    for (let s = 0; s < 150; s += 1) {
      const x = 40 + (s % 20 < 10 ? s % 10 : 10 - (s % 10));
      g.queue('world.teleport', { entityId: 'player', mapId: 'forest_edge', x, y: 60 });
      g.step(20);
      if (s === 60) clearMap(g, 'forest_edge');
    }
    const road = events(g, 'party.banter_end').filter((e) => e.data.kind === 'travel');
    expect(road.map((e) => e.data.exchangeId)).toEqual(['zz_road_a', 'zz_road_b', 'zz_road_c']);
    // the deleted line of zz_road_c is skipped, its first line said
    expect(lines(g, 'zz_road_c').map((e) => e.data.line)).toEqual([0]);
    const m = banterMetric(
      events(g, 'party.banter_end').map((e) => e.data),
      banterState2(g).exposure ?? 0,
    );
    // the exposure counts the road actually walked: a look that found the player standing
    // still (the first one, and the ones a cleared map cost) adds nothing
    expect(m.hours).toBeGreaterThanOrEqual(1.9);
    expect(m.perHour).toBeGreaterThanOrEqual(1);
    expect(m.repeats).toBe(0);
  });

  it('at a camp at night: at most three exchanges a night', () => {
    const g = makeGame();
    party2(g);
    // to 19:00 of the first day
    g.queue(
      'time.skip',
      { hours: 13, kind: 'travel', mode: 'long' },
      { type: 'script', script: 'zz' },
    );
    g.step(1);
    for (let i = 0; i < 40 && skipState(g.world); i++) g.step(1);
    clearMap(g, 'ash_waste');
    goTo(g, 'ash_waste', 70.5, 106.5);
    g.step(20 * 60);
    const fire = events(g, 'party.banter_end').filter((e) => e.data.kind === 'campfire');
    expect(fire.map((e) => e.data.exchangeId)).toEqual(['zz_fire_a', 'zz_fire_b', 'zz_fire_c']);
    expect(banterState2(g).exposure ?? 0).toBeGreaterThan(TICKS_PER_GAME_HOUR / 2);
  });
});

describe('camp talk (companions_and_party.md 8.4: +1, one companion a night)', () => {
  it('only at a camp at night and from 同行 (40); once a night', () => {
    const g = makeGame();
    party2(g, 45);
    clearMap(g, 'ash_waste');
    goTo(g, 'ash_waste', 70.5, 106.5);
    // by day, at the camp
    g.queue('party.camp_talk', { companionId: 'ron' });
    g.step(1);
    expect(lastResult(g, 'party.camp_talk')?.code).toBe('not_night');
    g.queue(
      'time.skip',
      { hours: 13, kind: 'travel', mode: 'long' },
      { type: 'script', script: 'zz' },
    );
    g.step(1);
    for (let i = 0; i < 40 && skipState(g.world); i++) g.step(1);
    goTo(g, 'ash_waste', 70.5, 106.5);
    const shiya = g.world.slices.party.members.shiya;
    if (shiya) shiya.bond = 30;
    g.queue('party.camp_talk', { companionId: 'shiya' });
    g.step(1);
    expect(lastResult(g, 'party.camp_talk')?.code).toBe('bond_low');
    const bond = g.world.slices.party.members.ron?.bond ?? 0;
    g.queue('party.camp_talk', { companionId: 'ron' });
    g.step(1);
    expect(g.world.slices.party.members.ron?.bond).toBe(bond + 1);
    expect(events(g, 'party.camp_talk').map((e) => e.data.companionId)).toEqual(['ron']);
    g.queue('party.camp_talk', { companionId: 'ron' });
    g.step(1);
    expect(lastResult(g, 'party.camp_talk')?.code).toBe('talked');
    expect(g.world.slices.party.members.ron?.bond).toBe(bond + 1);
  });
});

describe('alive metric 12 (builtin_ai.md 14.2)', () => {
  it('road exchanges per hour of road and campfire; every second hearing is a repeat', () => {
    const m = banterMetric(
      [
        { exchangeId: 'a', kind: 'travel', outcome: 'done' },
        { exchangeId: 'b', kind: 'campfire', outcome: 'done' },
        { exchangeId: 'a', kind: 'travel', outcome: 'done' },
        { exchangeId: 'c', kind: 'travel', outcome: 'cut' },
        { exchangeId: 'd', kind: 'enter', outcome: 'done' },
      ],
      2 * TICKS_PER_GAME_HOUR,
    );
    expect(m).toEqual({
      roadExchanges: 3,
      hours: 2,
      perHour: 1.5,
      repeats: 1,
      byKind: { travel: 2, campfire: 1, enter: 1 },
    });
    expect(banterMetric([], 0).perHour).toBe(0);
  });
});

describe('the content checks of the exchanges', () => {
  it('the shipped act 1 exchanges pass; a bad speaker, place, kind, cast and slot are named', () => {
    expect(validateBanter(base())).toEqual([]);
    const bad: BanterDef[] = [
      {
        id: 'zz_bad',
        cast: ['ron'],
        kind: 'enter',
        at: 'nowhere',
        priority: 1,
        speakers: ['shiya', 'ron'],
      },
      {
        id: 'zz_kind',
        cast: ['ron'],
        kind: 'party' as never,
        priority: 1,
        speakers: ['ron', 'ron'],
      },
      {
        id: 'zz_short',
        cast: ['ron'],
        kind: 'event',
        priority: 1,
        speakers: ['ron', 'ron', 'ron'],
      },
      { id: 'zz_nowhere', cast: ['ron'], kind: 'enter', priority: 1, speakers: ['ron', 'ron'] },
      { id: 'zz_alone', cast: ['ron'], kind: 'relation', priority: 1, speakers: ['ron', 'ron'] },
    ];
    const c = {
      ...base(),
      partyBanter: bad,
      linePacks: [
        ...(base().linePacks ?? []).filter((p) => p.id !== 'ln_party'),
        { id: 'ln_party', slots: { 'party.zz_short': ['a'] } },
      ],
    } as ContentMap;
    const out = validateBanter(c);
    expect(out).toContain('banter zz_bad: speaker shiya is not in the cast');
    expect(out).toContain('banter zz_bad: unknown place nowhere');
    expect(out).toContain('banter zz_kind: unknown kind party');
    expect(out).toContain('banter zz_short: ln_party slot party.zz_short holds 1 of 3 lines');
    expect(out).toContain('banter zz_bad: ln_party has no slot party.zz_bad');
    expect(out).toContain('banter zz_nowhere: an enter exchange names its place');
    expect(out).toContain('banter zz_alone: relation needs two in the cast');
  });
});
