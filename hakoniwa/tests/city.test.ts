import { describe, expect, it } from 'vitest';
import type {
  AnyWorldEvent,
  CommandKind,
  CommandMap,
  CommandSource,
  ContentMap,
} from '../src/core';
import { worldHash } from '../src/core';
import type { Engine } from '../src/core/engine';
import { calendarAt, tickAtDay } from '../src/core/time';
import { createGame as createFullGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import {
  type BuildingDef,
  computeTerms,
  previewPlacement,
  type SiteDef,
  settlementView,
} from '../src/systems/city';
import { newSiteState } from '../src/systems/city/daily';
import type { MapDef } from '../src/systems/world/types';

// The city chain needs the kernel systems, economy (markets for officials) and warfare
// (raids). Other teams' systems are left out so their per-tick cost does not dominate.
const CHAIN = new Set([
  'modifiers',
  'world',
  'inventory',
  'economy',
  'city',
  'warfare',
  'strategy',
]);
function createGame(opts: { seed: number }) {
  return createFullGame({ ...opts, systems: allSystems().filter((s) => CHAIN.has(s.id)) });
}

const SITE = 'old_outpost';
const OWNER = 'site:old_outpost';

function stepDays(engine: Engine, n: number): void {
  const day = calendarAt(engine.tick).dayIndex;
  engine.step(tickAtDay(day + n, 0, 30) - engine.tick);
}

function collect(engine: Engine): AnyWorldEvent[] {
  const out: AnyWorldEvent[] = [];
  engine.onEvents((evs) => {
    for (const e of evs)
      if (e.kind !== 'inventory.changed' && e.kind !== 'money.changed') out.push(e);
  });
  return out;
}

/** Queue one command, run a tick, return its command.result. */
function run<K extends CommandKind>(
  engine: Engine,
  kind: K,
  data: CommandMap[K],
  events: AnyWorldEvent[],
  source?: CommandSource,
) {
  const before = events.length;
  engine.queue(kind, data, source);
  engine.step(1);
  const res = events.slice(before).find((e) => e.kind === 'command.result' && e.data.kind === kind);
  if (res?.kind !== 'command.result') throw new Error(`no result for ${kind}`);
  return res.data;
}

function give(engine: Engine, owner: string, items: Record<string, number>, money = 0): void {
  const owners = engine.world.slices.inventory.owners;
  const h = owners[owner] ?? { money: 0, items: {}, equipped: {} };
  owners[owner] = h;
  for (const [id, n] of Object.entries(items)) h.items[id] = (h.items[id] ?? 0) + n;
  h.money += money;
}

function toOutpost(engine: Engine, events: AnyWorldEvent[]): void {
  const r = run(
    engine,
    'world.teleport',
    { entityId: 'player', mapId: SITE, x: 22.5, y: 19.5 },
    events,
  );
  expect(r.ok).toBe(true);
}

function stock(engine: Engine, owner = OWNER): Record<string, number> {
  return engine.world.slices.inventory.owners[owner]?.items ?? {};
}

/** A game with a founded 30-person village, a stove, shacks and a farm. */
function foundedVillage(seed = 7) {
  const engine = createGame({ seed });
  const events = collect(engine);
  toOutpost(engine, events);
  const places: [string, number, number][] = [
    ['communal_stove', 15, 14],
    ['shack', 18, 14],
    ['shack', 21, 14],
    ['shack', 24, 14],
    ['shack', 27, 14],
    ['farm', 14, 23],
  ];
  for (const [defId, x, y] of places) {
    const r = run(engine, 'city.place', { siteId: SITE, defId, x, y }, events);
    expect(r.ok, `${defId} at ${x},${y}: ${r.reason}`).toBe(true);
  }
  const added = run(
    engine,
    'city.add_population',
    { siteId: SITE, group: 'refugees', count: 30 },
    events,
  );
  expect(added.ok).toBe(true);
  stepDays(engine, 2);
  give(engine, OWNER, { grain: 300 });
  const founded = run(engine, 'city.found', { siteId: SITE }, events);
  expect(founded.ok, founded.reason).toBe(true);
  return { engine, events };
}

// ---------------------------------------------------------------------------

describe('city content', () => {
  it('ships the old outpost and inner court maps with zones, arrivals and exits', () => {
    const engine = createGame({ seed: 1 });
    const outpost = engine.content.maps.find((m) => m.id === 'old_outpost');
    const court = engine.content.maps.find((m) => m.id === 'inner_court');
    expect(outpost && outpost.width >= 40 && outpost.height >= 36).toBe(true);
    const locs = new Set(outpost?.locations.map((l) => l.id));
    for (const id of ['village_center', 'gate_borderstone', 'gate_ash_waste'])
      expect(locs.has(id)).toBe(true);
    expect(outpost?.exits.map((e) => [e.toMap, e.toLocation])).toEqual([
      ['borderstone', 'gate_old_outpost'],
      ['ash_waste', 'gate_old_outpost'],
    ]);
    expect(
      outpost?.locations.some(
        (l) => l.kind === 'build_zone' && l.tags?.includes('stage:territory'),
      ),
    ).toBe(true);
    expect(court?.exits).toEqual([]);
    expect(court?.locations.some((l) => l.kind === 'safe')).toBe(true);
    const ids = new Set(engine.content.city_buildings.map((b) => b.id));
    expect(ids.size).toBeGreaterThanOrEqual(30);
    for (const id of [
      'communal_stove',
      'purify_well',
      'door_node',
      'refinery',
      'court_garden',
      'court_study',
    ])
      expect(ids.has(id)).toBe(true);
    const cats = new Set(engine.content.city_buildings.map((b) => b.category));
    expect(cats.size).toBe(9);
    const courtSite = engine.content.city_sites.find((s) => s.id === 'inner_court');
    expect(courtSite?.outsideDivineSight).toBe(true);
    expect(courtSite?.immuneToModifiers).toBe(true);
  });
});

describe('placement validator', () => {
  it('accepts a free spot and names every rejection reason on the real map', () => {
    const engine = createGame({ seed: 1 });
    const w = engine.world;
    const c = engine.content;
    expect(previewPlacement(w, c, SITE, 'shack', 15, 14).ok).toBe(true);
    const code = (defId: string, x: number, y: number) => {
      const r = previewPlacement(w, c, SITE, defId, x, y);
      return r.ok ? 'ok' : r.code;
    };
    expect(code('shack', 15, 21)).toBe('road');
    expect(code('shack', 2, 2)).toBe('bounds');
    expect(code('shack', 26, 28)).toBe('terrain'); // the grove inside the old wall
    expect(code('cabin', 15, 14)).toBe('locked');
    expect(code('fishing_hut', 15, 14)).toBe('terrain');
    expect(code('shack', 21, 18)).toBe('reach'); // covers the village centre
    const r = previewPlacement(w, c, SITE, 'shack', 2, 2);
    expect(!r.ok && r.reason).toBe('超出了可建设用地');
  });

  it('rejects a building that would cut off another entrance or the exit (keep_reach)', () => {
    // A north room joined to the south room (with the centre) by a one-tile corridor.
    const map: MapDef = {
      id: 'test_site',
      name: '测试',
      region: 'test',
      width: 5,
      height: 9,
      rows: ['#####', '#...#', '#...#', '##.##', '##.##', '##.##', '#...#', '#...#', '#####'],
      legend: { '#': 'wall', '.': 'grass' },
      locations: [
        { id: 'center', name: '中心', kind: 'plaza', x: 2, y: 7, w: 1, h: 1 },
        {
          id: 'zone',
          name: '用地',
          kind: 'build_zone',
          x: 1,
          y: 1,
          w: 3,
          h: 7,
          tags: ['stage:outpost'],
        },
      ],
      spawns: [],
      exits: [{ id: 'out', x: 1, y: 1, toMap: 'test_site', toX: 1, toY: 1, label: '出口' }],
    };
    const block: BuildingDef = {
      id: 'block',
      name: '石墩',
      category: 'special',
      desc: '',
      footprint: { w: 1, h: 1 },
      cost: { items: {} },
      days: 1,
      upkeepPerMonth: 0,
      unlock: {},
      sites: ['settlement'],
    };
    const sdef: SiteDef = {
      id: 's',
      name: '测试',
      kind: 'settlement',
      mapId: 'test_site',
      stockOwner: 'site:s',
      centerLocation: 'center',
      initialStock: {},
      initialMoney: 0,
      caps: { outpost: { population: 10, policySlots: 1, storageBase: 10 } },
    };
    const content = {
      maps: [map],
      city_sites: [sdef],
      city_buildings: [block],
    } as unknown as ContentMap;
    const site = newSiteState(sdef, true);
    const world = {
      meta: { tick: 0, flags: {} },
      slices: {
        city: {
          sites: { s: site },
          nation: { founded: false, offices: {}, core: null },
          court: { returnTo: null },
        },
        inventory: { owners: {} },
      },
    };
    const code = (x: number, y: number) => {
      const r = previewPlacement(world, content, 's', 'block', x, y);
      return r.ok ? 'ok' : `${r.code}:${r.reason}`;
    };
    // Corridor block with its entrance on the centre side cuts off the exit in the north room.
    expect(code(2, 4)).toBe('keep_reach:会堵住通往外面的路');
    // With a building in the north room, its entrance is reported first.
    site.buildings.push({
      id: 'b1',
      defId: 'block',
      x: 3,
      y: 1,
      w: 1,
      h: 1,
      status: 'active',
      progress: 1,
      condition: 100,
      workers: 0,
      placedDay: 0,
      placedBy: 'player',
    });
    expect(code(2, 4)).toBe('keep_reach:会挡住石墩的出入口');
    // Once the corridor is taken, the north room cannot be reached at all.
    site.buildings.push({
      id: 'b2',
      defId: 'block',
      x: 2,
      y: 5,
      w: 1,
      h: 1,
      status: 'active',
      progress: 1,
      condition: 100,
      workers: 0,
      placedDay: 0,
      placedBy: 'player',
    });
    expect(code(1, 1)).toBe('reach:门口和聚落中心走不通');
    expect(code(1, 6)).toBe('ok');
  });
});

describe('settlement chain', () => {
  it('builds from stock, completes buildings and founds the village with its flags', () => {
    const { engine, events } = foundedVillage();
    const done = events
      .filter((e) => e.kind === 'building.completed')
      .map((e) => e.kind === 'building.completed' && e.data.defId);
    expect(done).toContain('communal_stove');
    expect(done).toContain('farm');
    expect(engine.world.meta.flags['city.village_founded']).toBe(true);
    const site = engine.world.slices.city.sites[SITE];
    expect(site?.stage).toBe('village');
    // stove 10 stone + 10 wood, 4 shacks 40 wood, farm 5 wood from the 80 wood / 40 stone ruin stock
    expect(stock(engine).stone).toBe(30);
    stepDays(engine, 1);
    const pop = settlementView(engine.world, engine.content, SITE)?.population.total ?? 0;
    expect(pop).toBeGreaterThanOrEqual(30);
    expect(engine.world.meta.flags.village_pop).toBe(pop);
    expect(typeof engine.world.meta.flags.village_autonomy).toBe('number');
    expect(engine.world.meta.flags.village_defense).toBe(0);
    const settlers = Object.values(engine.world.slices.world.entities).filter((e) =>
      e.tags.includes('settler'),
    );
    expect(settlers.length).toBe(Math.min(12, Math.ceil(pop / 5)));
    expect(
      settlers.every((e) => e.kind === 'npc' && e.mapId === SITE && e.tags.includes('friendly')),
    ).toBe(true);
    const view = settlementView(engine.world, engine.content, SITE);
    expect(view?.population.total).toBe(pop);
    expect(view?.stageName).toBe('村落');
    expect(view?.buildings.find((b) => b.defId === 'farm')?.workers).toBe(4);
  });

  it('refuses to found a village without 30 residents, a stove and ten days of food', () => {
    const engine = createGame({ seed: 2 });
    const events = collect(engine);
    toOutpost(engine, events);
    let r = run(engine, 'city.found', { siteId: SITE }, events);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('population');
    run(engine, 'city.add_population', { siteId: SITE, group: 'migrants', count: 30 }, events);
    r = run(engine, 'city.found', { siteId: SITE }, events);
    expect(r.code).toBe('stove');
    run(engine, 'city.place', { siteId: SITE, defId: 'communal_stove', x: 15, y: 14 }, events);
    stepDays(engine, 2);
    r = run(engine, 'city.found', { siteId: SITE }, events);
    expect(r.code).toBe('food');
  });

  it('requires the player on site (or a door node) for orders', () => {
    const engine = createGame({ seed: 3 });
    const events = collect(engine);
    const r = run(engine, 'city.place', { siteId: SITE, defId: 'shack', x: 15, y: 14 }, events);
    expect(r.ok).toBe(false);
    expect(r.code).toBe('not_here');
  });

  it('passes output through the registered harvest modifier keyed by the site', () => {
    const grainAfter = (factor: number) => {
      const { engine, events } = foundedVillage(11);
      if (factor !== 1) {
        const r = run(
          engine,
          'modifier.register',
          {
            target: 'harvest',
            key: SITE,
            factor,
            untilTick: engine.tick + 999999,
            source: 'test',
            visibility: 'public',
            note: '测试丰收',
          },
          events,
        );
        expect(r.ok).toBe(true);
      }
      const before = stock(engine).grain ?? 0;
      stepDays(engine, 1);
      return (stock(engine).grain ?? 0) - before;
    };
    const normal = grainAfter(1);
    const blessed = grainAfter(3);
    // farm: 12 grain x 4/4 workers x E(autonomy) per day; tripled by the modifier
    expect(blessed - normal).toBeGreaterThanOrEqual(16);
  });

  it('stops production when storage is full and says so', () => {
    const { engine } = foundedVillage(13);
    const site = engine.world.slices.city.sites[SITE];
    give(engine, OWNER, { stone: 2000 });
    stepDays(engine, 1);
    expect(site?.status.some((s) => s.includes('仓库已满'))).toBe(true);
    const farm = site?.buildings.find((b) => b.defId === 'farm');
    expect(farm?.note).toBe('仓库已满，停产');
  });
});

describe('officials and autonomy', () => {
  it('computes the design formula and moves at most one point a day', () => {
    const t = computeTerms({
      domains: [
        { hasHead: true, hasPolicy: true, hasDeputy: true, competence: 100 },
        { hasHead: false, hasPolicy: false, hasDeputy: false, competence: 0 },
      ],
      talentBonus: 0,
      decisions: [
        { day: 10, by: 'player', weight: 4 },
        { day: 10, by: 'official', weight: 6 },
        { day: -40, by: 'player', weight: 100 },
      ],
      trials: [
        { day: 9, ok: true, weight: 1 },
        { day: 9, ok: false, weight: 1 },
      ],
      day: 10,
      happiness: 0,
      security: 50,
      loyalty: 50,
      pDep: 8,
    });
    expect(t.I).toBeCloseTo(0.5);
    expect(t.T).toBeCloseTo(0.5);
    expect(t.D).toBeCloseTo(0.6); // decisions older than 30 days are ignored
    expect(t.S).toBeCloseTo(0.4);
    expect(t.C).toBeCloseTo(0.5);
    expect(t.raw).toBeCloseTo(100 * (0.125 + 0.1 + 0.12 + 0.06 + 0.1) - 8);
  });

  it('runs weekly official.decide requests with a utility fallback and drops stale proposals', () => {
    const { engine, events } = foundedVillage(17);
    const a = run(engine, 'city.assign', { siteId: SITE, domain: 'food', npcId: 'werner' }, events);
    expect(a.ok).toBe(true);
    expect(
      run(engine, 'city.assign', { siteId: SITE, domain: 'works', npcId: 'werner' }, events).code,
    ).toBe('busy');
    expect(
      run(engine, 'city.assign', { siteId: SITE, domain: 'commerce', npcId: 'nera' }, events).code,
    ).toBe('domain_locked');
    stepDays(engine, 8);
    const req = events.find((e) => e.kind === 'ai.requested' && e.data.role === 'official.decide');
    expect(req && req.kind === 'ai.requested' && req.data.agentId).toBe('werner');
    const decided = events.find((e) => e.kind === 'city.official_decided');
    expect(decided && decided.kind === 'city.official_decided' && decided.data.officialId).toBe(
      'werner',
    );
    const office = engine.world.slices.city.sites[SITE]?.offices.food;
    const stale = run(
      engine,
      'city.official_act',
      {
        siteId: SITE,
        domain: 'food',
        officialId: 'werner',
        action: 'idle',
        revision: (office?.revision ?? 0) - 1,
      },
      events,
      { type: 'script', script: 'test' },
    );
    expect(stale.code).toBe('stale');
    const forged = run(
      engine,
      'city.official_act',
      {
        siteId: SITE,
        domain: 'food',
        officialId: 'werner',
        action: 'idle',
        revision: office?.revision ?? 0,
      },
      events,
    );
    expect(forged.code).toBe('not_official');
  });

  it('micro-management adds dependency and loses autonomy against delegation', () => {
    const play = (micro: boolean) => {
      const { engine, events } = foundedVillage(19);
      if (!micro) {
        run(engine, 'city.assign', { siteId: SITE, domain: 'food', npcId: 'romaine' }, events);
        run(engine, 'city.assign', { siteId: SITE, domain: 'works', npcId: 'werner' }, events);
        run(engine, 'city.assign', { siteId: SITE, domain: 'civil', npcId: 'clara' }, events);
        run(engine, 'city.assign', { siteId: SITE, domain: 'security', npcId: 'martha' }, events);
        expect(
          run(
            engine,
            'city.policy',
            { siteId: SITE, policyId: 'fields_first', enabled: true },
            events,
          ).ok,
        ).toBe(true);
      }
      for (let d = 0; d < 6; d++) {
        if (micro) {
          expect(run(engine, 'city.micro', { siteId: SITE, action: 'boost' }, events).ok).toBe(
            true,
          );
          run(engine, 'city.micro', { siteId: SITE, action: 'handle_dispute' }, events);
        }
        stepDays(engine, 1);
      }
      return engine.world.slices.city.sites[SITE]?.autonomy;
    };
    const hands = play(true);
    const delegated = play(false);
    expect(hands?.pDep ?? 0).toBeGreaterThan(3);
    expect(delegated?.pDep ?? 0).toBeLessThan(hands?.pDep ?? 0);
    expect(delegated?.raw ?? 0).toBeGreaterThan(hands?.raw ?? 0);
    expect(delegated?.value ?? 0).toBeGreaterThanOrEqual(hands?.value ?? 0);
  });

  it('seeds territory autonomy on the grant and writes the nation autonomy after founding', () => {
    const { engine, events } = foundedVillage(23);
    stepDays(engine, 1);
    expect(typeof engine.world.meta.flags.village_autonomy).toBe('number');
    const village = engine.world.slices.city.sites[SITE]?.autonomy.value ?? 0;
    run(engine, 'flag.set', { key: 'city.territory_granted', value: true }, events);
    expect(engine.world.slices.city.sites[SITE]?.stage).toBe('territory');
    expect(engine.world.meta.flags.territory_autonomy).toBe(Math.round(10 + village * 0.4));
    // the territory zones east of the creek open up
    expect(previewPlacement(engine.world, engine.content, SITE, 'shack', 41, 12).ok).toBe(true);
    expect(engine.world.meta.flags.autonomy).toBeUndefined();
    run(engine, 'flag.set', { key: 'slg.nation_founded', value: true }, events);
    expect(typeof engine.world.meta.flags.autonomy).toBe('number');
    expect(
      run(engine, 'city.assign', { siteId: 'nation', domain: 'research', npcId: 'maeve' }, events)
        .ok,
    ).toBe(true);
  });
});

describe('events', () => {
  it('settles a raid with the warfare kernel when the monster modifier spikes', () => {
    const { engine, events } = foundedVillage(29);
    run(
      engine,
      'modifier.register',
      {
        target: 'monster',
        key: SITE,
        add: 1,
        untilTick: engine.tick + 999999,
        source: 'test',
        visibility: 'public',
        note: '兽潮',
      },
      events,
    );
    stepDays(engine, 1);
    const raid = events.find((e) => e.kind === 'city.event' && e.data.kind === 'raid');
    expect(raid).toBeDefined();
    const site = engine.world.slices.city.sites[SITE];
    expect(site?.severe.some((s) => s.kind === 'raid')).toBe(true);
    // the next severe event waits at least 7 days
    const before = events.filter(
      (e) => e.kind === 'city.event' && e.data.severity === 'severe',
    ).length;
    stepDays(engine, 3);
    const after = events.filter(
      (e) => e.kind === 'city.event' && e.data.severity === 'severe',
    ).length;
    expect(after).toBe(before);
  });
});

describe('inner court', () => {
  it('teleports in and out, stores items and grows the garden immune to modifiers', () => {
    const engine = createGame({ seed: 31 });
    const events = collect(engine);
    expect(run(engine, 'city.enter_court', {}, events).code).toBe('locked');
    run(engine, 'flag.set', { key: 'feature.inner_court', value: true }, events);
    const from = engine.world.slices.world.entities.player?.mapId;
    expect(run(engine, 'city.enter_court', {}, events).ok).toBe(true);
    expect(engine.world.slices.world.entities.player?.mapId).toBe('inner_court');
    give(engine, 'player', { wood: 20, herb: 3 });
    expect(
      run(engine, 'city.deposit', { siteId: 'inner_court', itemId: 'herb', count: 3 }, events).ok,
    ).toBe(true);
    expect(stock(engine, 'site:inner_court').herb).toBe(3);
    run(
      engine,
      'modifier.register',
      {
        target: 'harvest',
        key: 'inner_court',
        factor: 0,
        untilTick: engine.tick + 999999,
        source: 'test',
        visibility: 'public',
        note: '枯萎',
      },
      events,
    );
    const placed = run(
      engine,
      'city.place',
      { siteId: 'inner_court', defId: 'court_garden', x: 3, y: 12 },
      events,
    );
    expect(placed.ok, placed.reason).toBe(true);
    expect(
      run(engine, 'city.place', { siteId: 'inner_court', defId: 'shack', x: 8, y: 12 }, events)
        .code,
    ).toBe('site_kind');
    stepDays(engine, 3);
    expect(stock(engine, 'site:inner_court').herb).toBeGreaterThan(3);
    expect(run(engine, 'city.leave_court', {}, events).ok).toBe(true);
    expect(engine.world.slices.world.entities.player?.mapId).toBe(from);
  });
});

describe('door node', () => {
  it('lets orders and goods through from the court, up to the daily throughput', () => {
    const engine = createGame({ seed: 41 });
    const events = collect(engine);
    toOutpost(engine, events);
    run(engine, 'flag.set', { key: 'feature.inner_court', value: true }, events);
    give(engine, 'player', { magic_crystal: 2, wood: 60 });
    run(engine, 'city.add_population', { siteId: SITE, group: 'migrants', count: 5 }, events);
    const placed = run(
      engine,
      'city.place',
      { siteId: SITE, defId: 'door_node', x: 15, y: 26 },
      events,
    );
    expect(placed.ok, placed.reason).toBe(true);
    expect(run(engine, 'city.enter_court', {}, events).ok).toBe(true);
    // not linked yet: the order cannot reach the outpost from the court
    expect(
      run(engine, 'city.deposit', { siteId: SITE, itemId: 'wood', count: 10 }, events).code,
    ).toBe('not_here');
    stepDays(engine, 3);
    expect(
      run(engine, 'city.deposit', { siteId: SITE, itemId: 'wood', count: 50 }, events).ok,
    ).toBe(true);
    expect(
      run(engine, 'city.deposit', { siteId: SITE, itemId: 'wood', count: 1 }, events).code,
    ).toBe('gate_cap');
    const view = settlementView(engine.world, engine.content, SITE);
    expect(view?.gateLinked).toBe(true);
    expect(view?.gateRoom).toBe(0);
  });
});

describe('determinism', () => {
  it('produces the same world for the same seed and commands', () => {
    const a = foundedVillage(37);
    const b = foundedVillage(37);
    stepDays(a.engine, 3);
    stepDays(b.engine, 3);
    expect(worldHash(a.engine.world)).toBe(worldHash(b.engine.world));
  });
});
