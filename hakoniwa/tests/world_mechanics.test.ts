// The map mechanics of map_briefs.md 1.10 (PK-M1-16): canon sediment levels with local hot
// spots and the render conversion, switch tile areas whose walkability follows flags,
// spawn points with negated flag entries and map-assigned levels, gate sites, cross-map
// NPC schedules, and the content validation that guards all of them. Pure functions are
// pinned on hand-made maps; the kernel paths run on the real engine.

import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { validateCombat } from '../src/content/packs/combat';
import { validateNpcContent } from '../src/content/packs/npc';
import { canonEdits } from '../src/content/registry_canon';
import { collectFlagUses } from '../src/content/registry_refs';
import { Engine, ok } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { defaultRegistry } from '../src/core/registry';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { indexData } from '../src/editor/quests/flag_index';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { MAX_LEVEL } from '../src/systems/combat/formulas';
import { cardOf } from '../src/systems/npc';
import { locationOfRef, placeRef, resolvePlaceOn, splitPlaceRef } from '../src/systems/npc/places';
import { validatePlan } from '../src/systems/npc/schedule';
import type { SpawnDef } from '../src/systems/world';
import {
  closedSwitches,
  flagEntryName,
  flagListMet,
  flagListNames,
  flagListProblems,
  gateSiteLanding,
  gateSites,
  getEntity,
  isGateSite,
  isWalkable,
  liveMap,
  type MapDef,
  mapMechanicProblems,
  renderSedimentLevel,
  rollSpawnLevel,
  SEDIMENT_CRITICAL,
  SPAWN_LEVEL_MAX,
  sedimentAt,
  sedimentProblems,
  spawnLevelBand,
  spawnRuleProblems,
  switchedMap,
  switchProblems,
  tileAt,
  walkMap,
  system as world,
} from '../src/systems/world';
import { namespaceFindings } from '../tools/content/validators/namespace';

// A 10 x 5 hall: a wall across column 5 with a two-tile doorway that a rock fall closes
// until `zz_cleared`; a hot spot in the east room; a gate site in the west room.
const HALL: MapDef = {
  id: 'zz_hall',
  name: '测试大厅',
  region: 'ashen_waste',
  width: 10,
  height: 5,
  rows: ['..........', '.....#....', '..........', '.....#....', '.....#....'],
  legend: { '.': 'floor', '#': 'wall' },
  locations: [
    { id: 'west', name: '西室', kind: 'room', x: 0, y: 0, w: 5, h: 5 },
    { id: 'east', name: '东室', kind: 'room', x: 6, y: 0, w: 4, h: 5, sediment: 4 },
    { id: 'pool', name: '澱池', kind: 'ruin', x: 8, y: 3, w: 2, h: 2, sediment: SEDIMENT_CRITICAL },
    { id: 'site', name: '门址', kind: 'gate_site', x: 1, y: 1, w: 3, h: 3 },
  ],
  spawns: [],
  exits: [],
  sediment: 2,
  switches: [
    { id: 'rockfall', x: 5, y: 0, w: 1, h: 1, closedTile: 'rock', openWhen: 'zz_cleared' },
    { id: 'gap', x: 5, y: 2, w: 1, h: 1, closedTile: 'rock', openWhen: 'zz_cleared' },
  ],
};

describe('sediment: canon levels, hot spots and the render scale (map_briefs.md 1.2)', () => {
  it('converts canon 0 to 6 to render 0, 1, 2, 4, 5, 6, 7 (halves up), clamped', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(renderSedimentLevel)).toEqual([0, 1, 2, 4, 5, 6, 7]);
    expect(renderSedimentLevel(-1)).toBe(0);
    expect(renderSedimentLevel(9)).toBe(7);
    expect(renderSedimentLevel(Number.NaN)).toBe(0);
  });

  it('reads the smallest location with its own level, else the map level, else 0', () => {
    expect(sedimentAt(HALL, 2.5, 2.5)).toBe(2);
    expect(sedimentAt(HALL, 6.5, 0.5)).toBe(4);
    expect(sedimentAt(HALL, 8.5, 3.5)).toBe(SEDIMENT_CRITICAL);
    // the right and bottom edges are open: x = 10 is outside the east room
    expect(sedimentAt(HALL, 9.99, 4.99)).toBe(SEDIMENT_CRITICAL);
    expect(sedimentAt({ locations: [] }, 1, 1)).toBe(0);
  });

  it('reports levels off the canon scale on the map and on locations', () => {
    expect(sedimentProblems(HALL)).toEqual([]);
    expect(
      sedimentProblems({
        ...HALL,
        sediment: 7,
        locations: [{ id: 'a', name: 'a', kind: 'room', x: 0, y: 0, w: 1, h: 1, sediment: 2.5 }],
      }),
    ).toEqual([
      'map zz_hall: sediment 7 is not a canon level 0..6',
      'map zz_hall: location a sediment 2.5 is not a canon level 0..6',
    ]);
  });
});

describe('switch tile areas (map_briefs.md 1.10)', () => {
  it('closes a switch while its condition is false and paints its closed tile', () => {
    expect(closedSwitches(HALL, () => false)).toEqual(['rockfall', 'gap']);
    expect(closedSwitches(HALL, (c) => c === 'zz_cleared')).toEqual([]);
    const closed = liveMap(HALL, {});
    expect(closed).not.toBe(HALL);
    expect(tileAt(closed, 5, 2)).toBe('rock');
    expect(tileAt(closed, 5, 0)).toBe('rock');
    expect(isWalkable(closed, 5.5, 2.5)).toBe(false);
    // the content map is untouched
    expect(tileAt(HALL, 5, 2)).toBe('floor');
    expect(HALL.rows[2]).toBe('..........');
  });

  it('returns the map itself when open, and one cached copy per closed set', () => {
    expect(liveMap(HALL, { zz_cleared: true })).toBe(HALL);
    expect(liveMap(HALL, {})).toBe(liveMap(HALL, { zz_cleared: false }));
    expect(switchedMap(HALL, ['gap'])).toBe(switchedMap(HALL, ['gap']));
    expect(switchedMap(HALL, ['gap'])).not.toBe(switchedMap(HALL, ['rockfall', 'gap']));
    const noSwitch = { ...HALL, switches: undefined };
    expect(liveMap(noSwitch, {})).toBe(noSwitch);
  });

  it('reuses the legend character of the closed tile, else adds a private one', () => {
    const withRock = { ...HALL, legend: { ...HALL.legend, r: 'rock' as const } };
    expect(switchedMap(withRock, ['gap']).rows[2]).toBe('.....r....');
    const painted = switchedMap(HALL, ['gap']);
    const ch = painted.rows[2]?.[5] as string;
    expect(ch).not.toBe('.');
    expect(painted.legend[ch]).toBe('rock');
  });

  it('reports bad switches: id, tile, rectangle, condition', () => {
    expect(switchProblems(HALL)).toEqual([]);
    const bad = switchProblems({
      ...HALL,
      switches: [
        { id: 'a', x: 9, y: 4, w: 2, h: 1, closedTile: 'lava' as never, openWhen: 'zz_cleared' },
        { id: 'a', x: 0, y: 0, w: 0, h: 1, closedTile: 'rock', openWhen: '' },
        { id: '', x: 1, y: 1, w: 1, h: 1, closedTile: 'water', openWhen: 'zz_x AND (' },
      ],
    });
    expect(bad[0]).toBe("map zz_hall: switch a unknown closed tile 'lava'");
    expect(bad[1]).toBe('map zz_hall: switch a (9,4 2x1) outside the map');
    expect(bad).toContain('map zz_hall: switch a listed twice');
    expect(bad).toContain('map zz_hall: switch a needs a whole rectangle of at least 1x1');
    expect(bad).toContain('map zz_hall: switch a needs an openWhen condition');
    expect(bad).toContain('map zz_hall: switch 2 has no id');
    expect(bad.some((p) => p.startsWith('map zz_hall: switch 2 openWhen does not parse'))).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// The kernel walks the live map.

let pending: ((ctx: SystemContext) => void) | null = null;
const probe: GameSystem = {
  id: 'zz_mech_probe',
  order: 99,
  commands: {
    'zz_mech.run'(ctx) {
      pending?.(ctx);
      pending = null;
      return ok();
    },
  },
};
declare module '../src/core/contracts' {
  interface CommandMap {
    'zz_mech.run': Record<string, never>;
  }
}
function inTick(g: Engine, fn: (ctx: SystemContext) => void): void {
  pending = fn;
  g.queue('zz_mech.run', {});
  g.step(1);
}

describe('the world system walks the live map', () => {
  const content = {
    maps: [HALL],
    worldStarts: [{ mapId: 'zz_hall', x: 1.5, y: 2.5, priority: 0 }],
  } as unknown as ContentMap;

  it('cannot path or step through a closed switch, and can once its flag opens it', () => {
    const g = Engine.create(1, content, [world, probe]);
    const player = () => getEntity(g.world, 'player');
    g.queue('world.move_to', { entityId: 'player', x: 8.5, y: 2.5 });
    g.step(1);
    // rows 1, 3 and 4 hold the wall; rows 0 and 2 are closed by rock: no way east
    expect(player()?.move ?? null).toBeNull();
    inTick(g, (ctx) => {
      expect(walkMap(ctx, 'zz_hall')).not.toBe(HALL);
      ctx.setFlag('zz_cleared', true);
      expect(walkMap(ctx, 'zz_hall')).toBe(HALL);
    });
    g.queue('world.move_to', { entityId: 'player', x: 8.5, y: 2.5 });
    g.step(20 * 5);
    expect(Math.floor(player()?.x ?? 0)).toBe(8);
  });

  it('stops a walk at a switch that closes across its path', () => {
    const g = Engine.create(1, content, [world, probe]);
    const failed: string[] = [];
    g.onEvents((evs) => {
      for (const e of evs) if (e.kind === 'world.move_failed') failed.push(e.data.id);
    });
    inTick(g, (ctx) => ctx.setFlag('zz_cleared', true));
    g.queue('world.move_to', { entityId: 'player', x: 8.5, y: 2.5 });
    g.step(2);
    expect(getEntity(g.world, 'player')?.move).not.toBeNull();
    inTick(g, (ctx) => ctx.setFlag('zz_cleared', false));
    g.step(20 * 5);
    const p = getEntity(g.world, 'player');
    expect(p?.move ?? null).toBeNull();
    expect(p?.x ?? 99).toBeLessThan(5);
    expect(failed).toEqual(['player']);
  });

  it('pushes an entity out of a switch that closes on it, and steers around closed tiles', () => {
    const g = Engine.create(1, content, [world, probe]);
    inTick(g, (ctx) => ctx.setFlag('zz_cleared', true));
    g.queue('world.teleport', { entityId: 'player', mapId: 'zz_hall', x: 5.5, y: 2.5 });
    g.step(1);
    expect(getEntity(g.world, 'player')).toMatchObject({ x: 5.5, y: 2.5 });
    inTick(g, (ctx) => ctx.setFlag('zz_cleared', false));
    g.step(1);
    const p = getEntity(g.world, 'player');
    expect(isWalkable(liveMap(HALL, {}), p?.x ?? 0, p?.y ?? 0)).toBe(true);
    // a teleport into the closed area lands beside it; steering does not enter it
    g.queue('world.teleport', { entityId: 'player', mapId: 'zz_hall', x: 5.5, y: 2.5 });
    g.step(1);
    expect(getEntity(g.world, 'player')?.x).not.toBe(5.5);
    g.queue('world.teleport', { entityId: 'player', mapId: 'zz_hall', x: 4.5, y: 2.5 });
    g.queue('world.set_intent', { entityId: 'player', dx: 1, dy: 0 });
    g.step(40);
    expect(Math.floor(getEntity(g.world, 'player')?.x ?? 0)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Spawn rules.

describe('spawn rules: negated flags and map-assigned levels', () => {
  it('holds a list when every plain entry is truthy and every negated entry falsy', () => {
    const flags: Record<string, unknown> = { 'act.1.entered': true, 'act.2.entered': false };
    const read = (k: string) => flags[k];
    expect(flagListMet(undefined, read)).toBe(true);
    expect(flagListMet([], read)).toBe(true);
    expect(flagListMet(['act.1.entered'], read)).toBe(true);
    expect(flagListMet(['!act.2.entered'], read)).toBe(true);
    expect(flagListMet(['!act.3.entered'], read)).toBe(true);
    expect(flagListMet(['act.1.entered', '!act.1.entered'], read)).toBe(false);
    expect(flagListMet(['act.2.entered'], read)).toBe(false);
    expect(flagEntryName('!act.2.entered')).toBe('act.2.entered');
    expect(flagListNames(['a', '!b'])).toEqual(['a', 'b']);
  });

  it('rolls a band on the given stream, keeps a fixed level, and leaves the rest alone', () => {
    const draws: [number, number][] = [];
    const rng = {
      int(lo: number, hi: number) {
        draws.push([lo, hi]);
        return hi;
      },
    };
    expect(rollSpawnLevel({ level: [16, 18] }, rng)).toBe(18);
    expect(rollSpawnLevel({ level: 12 }, rng)).toBe(12);
    expect(rollSpawnLevel({}, rng)).toBeUndefined();
    expect(draws).toEqual([[16, 18]]);
    expect(spawnLevelBand({ level: 12 })).toEqual([12, 12]);
    expect(spawnLevelBand({ level: [3, 5] })).toEqual([3, 5]);
    expect(spawnLevelBand({})).toBeUndefined();
    expect(SPAWN_LEVEL_MAX).toBe(MAX_LEVEL);
  });

  it('reports malformed levels and flag entries', () => {
    const map = {
      id: 'zz_m',
      spawns: [
        {
          id: 'ok',
          kind: 'monster' as const,
          ref: 'r',
          x: 1,
          y: 1,
          level: [16, 18] as [number, number],
          requiresFlags: ['!act.2.entered'],
        },
        {
          id: 'flip',
          kind: 'monster' as const,
          ref: 'r',
          x: 1,
          y: 1,
          level: [9, 4] as [number, number],
        },
        { id: 'high', kind: 'monster' as const, ref: 'r', x: 1, y: 1, level: 61 },
        { id: 'npc', kind: 'npc' as const, ref: 'r', x: 1, y: 1, level: 5 },
        {
          id: 'bad',
          kind: 'monster' as const,
          ref: 'r',
          x: 1,
          y: 1,
          requiresFlags: ['!', 'two words'],
        },
      ],
    };
    expect(spawnRuleProblems(map)).toEqual([
      'map zz_m: spawn flip: level [9,4] is not 1..60 or a band low to high',
      'map zz_m: spawn high: level 61 is not 1..60 or a band low to high',
      'map zz_m: spawn npc: only a monster spawn takes a level',
      "map zz_m: spawn bad: bad flag entry '!'",
      "map zz_m: spawn bad: bad flag entry 'two words'",
    ]);
    expect(flagListProblems('x', 'act.1.entered')).toEqual(['x: requiresFlags must be a list']);
  });
});

describe('combat places spawns by the map rules', () => {
  const base = buildContent();
  const FIELD: MapDef = {
    id: 'zz_field',
    name: '测试原野',
    region: 'test',
    atlasExempt: true,
    width: 12,
    height: 8,
    rows: Array.from({ length: 8 }, () => '............'),
    legend: { '.': 'grass' },
    locations: [],
    exits: [],
    spawns: [
      { id: 'band', kind: 'monster', ref: 'dian_rat', x: 2.5, y: 2.5, count: 4, level: [20, 22] },
      { id: 'fixed', kind: 'monster', ref: 'dian_rat', x: 9.5, y: 2.5, count: 2, level: 33 },
      {
        id: 'early',
        kind: 'monster',
        ref: 'dian_rat',
        x: 2.5,
        y: 6.5,
        requiresFlags: ['!zz_later'],
      },
      { id: 'late', kind: 'monster', ref: 'dian_rat', x: 9.5, y: 6.5, requiresFlags: ['zz_later'] },
    ],
  };
  const content = { ...base, maps: [...base.maps, FIELD] } as ContentMap;

  it('rolls levels inside the map band, takes a fixed level, and gates by negated flags', () => {
    const g = createGame({
      seed: 3,
      content,
      flagPolicy: 'off',
      aiMode: 'off',
      systems: [...allSystems(), probe],
    });
    const combat = (
      g.world.slices as unknown as {
        combat: {
          spawns: Record<string, { alive: string[] }>;
          units: Record<string, { level: number }>;
        };
      }
    ).combat;
    const levels = (key: string) =>
      (combat.spawns[`zz_field/${key}`]?.alive ?? []).map((id) => combat.units[id]?.level);
    const band = levels('band');
    expect(band).toHaveLength(4);
    for (const l of band) expect(l).toBeGreaterThanOrEqual(20);
    for (const l of band) expect(l).toBeLessThanOrEqual(22);
    expect(levels('fixed')).toEqual([33, 33]);
    expect(levels('early')).toHaveLength(1);
    expect(levels('late')).toEqual([]);
    inTick(g, (ctx) => ctx.setFlag('zz_later', true));
    expect(levels('late')).toHaveLength(1);
  });

  it('fills a negated group when its flag turns false, and not while it holds', () => {
    const gated: MapDef = {
      ...FIELD,
      id: 'zz_gated',
      spawns: [
        {
          id: 'a',
          kind: 'monster',
          ref: 'dian_rat',
          x: 2.5,
          y: 2.5,
          requiresFlags: ['zz_a', '!zz_later'],
        },
        {
          id: 'b',
          kind: 'monster',
          ref: 'dian_rat',
          x: 9.5,
          y: 2.5,
          requiresFlags: ['zz_b', '!zz_later'],
        },
      ],
    };
    const g = createGame({
      seed: 3,
      content: { ...base, maps: [...base.maps, gated] } as ContentMap,
      flagPolicy: 'off',
      aiMode: 'off',
      systems: [...allSystems(), probe],
    });
    const combat = (
      g.world.slices as unknown as {
        combat: { spawns: Record<string, { alive: string[] }> };
      }
    ).combat;
    const alive = (key: string) => combat.spawns[`zz_gated/${key}`]?.alive.length ?? 0;
    expect([alive('a'), alive('b')]).toEqual([0, 0]);
    inTick(g, (ctx) => ctx.setFlag('zz_a', true));
    expect(alive('a')).toBe(1);
    inTick(g, (ctx) => ctx.setFlag('zz_later', true));
    inTick(g, (ctx) => ctx.setFlag('zz_b', true));
    expect(alive('b')).toBe(0);
    // the listener reads the negated entry's flag: clearing it fills the group
    inTick(g, (ctx) => ctx.setFlag('zz_later', false));
    expect(alive('b')).toBe(1);
  });

  it('keeps every later placement where it was: a band draws once, like the bestiary roll', () => {
    const run = (level: SpawnDef['level']) => {
      const map: MapDef = {
        ...FIELD,
        id: 'zz_order',
        spawns: [
          {
            id: 'first',
            kind: 'monster',
            ref: 'dian_rat',
            x: 3.5,
            y: 3.5,
            radius: 3,
            count: 3,
            level,
          },
          { id: 'then', kind: 'monster', ref: 'dian_rat', x: 8.5, y: 4.5, radius: 3, count: 3 },
        ],
      };
      const g = createGame({
        seed: 9,
        content: { ...base, maps: [...base.maps, map] } as ContentMap,
        flagPolicy: 'off',
        aiMode: 'off',
      });
      const combat = (
        g.world.slices as unknown as {
          combat: { spawns: Record<string, { alive: string[] }> };
        }
      ).combat;
      return (combat.spawns['zz_order/then']?.alive ?? []).map((id) => {
        const e = getEntity(g.world, id);
        return [e?.x, e?.y];
      });
    };
    const plain = run(undefined);
    expect(plain).toHaveLength(3);
    expect(run([20, 22])).toEqual(plain);
  });

  it('refuses a map level on a story boss that syncs to the party', () => {
    const boss: MapDef = {
      ...FIELD,
      id: 'zz_boss',
      spawns: [{ id: 'king', kind: 'monster', ref: 'rat_king', x: 2.5, y: 2.5, level: 20 }],
    };
    const problems = validateCombat({ ...base, maps: [...base.maps, boss] } as ContentMap);
    expect(problems).toContain('map zz_boss: spawn king sets a level on party-synced rat_king');
    expect(validateCombat(base).filter((p) => p.includes('party-synced'))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Gate sites and validation.

describe('gate sites and the map mechanics validator', () => {
  it('lands on the walkable tile nearest a gate site centre', () => {
    expect(gateSites(HALL).map((l) => l.id)).toEqual(['site']);
    expect(gateSiteLanding(HALL, 'site')).toEqual({ x: 2.5, y: 2.5 });
    // a blocked centre: the first walkable tile of the nearest ring, scanned row by row
    const walled = { ...HALL, rows: HALL.rows.map((r, y) => (y === 2 ? '..#.......' : r)) };
    expect(gateSiteLanding(walled, 'site')).toEqual({ x: 1.5, y: 1.5 });
    expect(gateSiteLanding(HALL, 'west')).toBeNull();
    expect(gateSiteLanding(HALL, 'nowhere')).toBeNull();
    // a hall of another kind tagged as a gate site counts too (the seal ruins' sigil hall)
    const tagged = { ...HALL.locations[0], tags: ['gate_site'] } as MapDef['locations'][number];
    expect(isGateSite(tagged)).toBe(true);
    expect(isGateSite(HALL.locations[0] as MapDef['locations'][number])).toBe(false);
    const real = buildContent().maps;
    const sites = (id: string) =>
      gateSites(real.find((m) => m.id === id) as MapDef).map((l) => l.id);
    expect(sites('seal_ruins')).toEqual(['sigil_hall']);
    expect(sites('ash_waste')).toEqual(['broken_gate_slope', 'waste_gate_site']);
    expect(sites('wallenburg_sewers')).toEqual(['gate_37']);
  });

  it('keeps negated flag entries to spawn points: an exit may not use one', () => {
    const exits = [
      {
        id: 'out',
        x: 0,
        y: 0,
        toMap: 'zz_hall',
        toX: 1,
        toY: 1,
        label: 'x',
        requiresFlags: ['!zz_a'],
      },
      {
        id: 'ok',
        x: 1,
        y: 0,
        toMap: 'zz_hall',
        toX: 1,
        toY: 1,
        label: 'x',
        requiresFlags: ['zz_a'],
      },
    ];
    expect(mapMechanicProblems({ ...HALL, exits })).toEqual([
      'map zz_hall: exit out negated flag entries work on spawn points only',
    ]);
  });

  it('gathers sediment, switch, spawn and gate-site problems for content validation', () => {
    expect(mapMechanicProblems(HALL)).toEqual([]);
    const sealed = {
      ...HALL,
      rows: Array.from({ length: 5 }, () => '##########'),
      sediment: 9,
    };
    expect(mapMechanicProblems(sealed)).toEqual([
      'map zz_hall: sediment 9 is not a canon level 0..6',
      'map zz_hall: gate site site has no walkable tile near its centre',
    ]);
    const content = buildContent();
    expect(validateContent(content).filter((p) => p.startsWith('map '))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Cross-map schedules.

describe('cross-map schedules (map_briefs.md 1.10)', () => {
  const base = buildContent();
  const GLADE: MapDef = {
    id: 'zz_glade',
    name: '测试林间',
    region: 'test',
    atlasExempt: true,
    width: 10,
    height: 8,
    rows: Array.from({ length: 8 }, () => '..........'),
    legend: { '.': 'grass' },
    locations: [
      { id: 'camp', name: '营地', kind: 'camp', x: 2, y: 2, w: 3, h: 3 },
      { id: 'safe', name: '空地', kind: 'safe', x: 6, y: 2, w: 2, h: 2 },
    ],
    exits: [],
    spawns: [],
  };
  const npcs = (base.npcs ?? []).map((p) =>
    p.id === 'gorn'
      ? {
          ...p,
          schedule: [
            { from: 5, to: 11, at: 'zz_glade:camp', act: 'work' as const },
            { from: 11, to: 5, at: '@home', act: 'sleep' as const },
          ],
        }
      : p,
  );
  const content = { ...base, maps: [...base.maps, GLADE], npcs } as ContentMap;

  it('splits, builds and resolves place references with their map', () => {
    expect(splitPlaceRef('zz_glade:camp')).toEqual({ mapId: 'zz_glade', place: 'camp' });
    expect(splitPlaceRef('@home')).toEqual({ mapId: null, place: '@home' });
    expect(placeRef('borderstone', 'borderstone', 'tavern')).toBe('tavern');
    expect(placeRef('borderstone', 'zz_glade', 'camp')).toBe('zz_glade:camp');
    const card = { map: 'borderstone', home: 'east_slope', work: 'gate_forest_edge' };
    expect(resolvePlaceOn(content, card, 'zz_glade:camp')?.mapId).toBe('zz_glade');
    expect(resolvePlaceOn(content, card, 'zz_glade:@safe')?.loc.id).toBe('safe');
    expect(resolvePlaceOn(content, card, '@home')).toMatchObject({ mapId: 'borderstone' });
    expect(resolvePlaceOn(content, card, 'zz_glade:@home')).toBeUndefined();
    expect(resolvePlaceOn(content, card, 'zz_glade:nowhere')).toBeUndefined();
    expect(locationOfRef(content, 'borderstone', 'zz_glade:camp')?.id).toBe('camp');
    expect(locationOfRef(content, 'borderstone', 'east_slope')?.id).toBe('east_slope');
  });

  it('puts the person on the other map at the place for the hours, then back home', () => {
    const g = createGame({ seed: 11, content, flagPolicy: 'off', aiMode: 'off' });
    const npc = (
      g.world.slices as unknown as {
        npc: {
          npcs: Record<
            string,
            { mapId: string; locId: string; entityId: string; track: { loc: string }[] }
          >;
        };
      }
    ).npc.npcs.gorn;
    if (!npc) throw new Error('no gorn');
    // the game starts at 06:00, inside the 05 to 11 segment
    const e = () => getEntity(g.world, npc.entityId);
    expect([npc.mapId, npc.locId]).toEqual(['zz_glade', 'camp']);
    expect(e()?.mapId).toBe('zz_glade');
    expect(e()?.x).toBeGreaterThanOrEqual(2);
    expect(e()?.x).toBeLessThan(5);
    g.step(5 * TICKS_PER_GAME_HOUR + 40);
    expect([npc.mapId, npc.locId]).toEqual(['borderstone', 'east_slope']);
    expect(e()?.mapId).toBe('borderstone');
    // a scripted errand to the other map goes on the track as a reference from home
    g.queue(
      'npc.goto',
      { npcId: 'gorn', locationId: 'zz_glade:safe', hours: 2, act: 'work' },
      { type: 'script', script: 'zz' },
    );
    g.step(1);
    expect([npc.mapId, npc.locId]).toEqual(['zz_glade', 'safe']);
    expect(e()?.mapId).toBe('zz_glade');
    expect(npc.track.map((t) => t.loc)).toContain('zz_glade:safe');
  });

  it('lets a model plan go to another map only where the schedule already goes', () => {
    const g = createGame({ seed: 11, content, flagPolicy: 'off', aiMode: 'off' });
    const slice = (g.world.slices as unknown as { npc: Parameters<typeof cardOf>[0] }).npc;
    const card = cardOf(slice, content, 'gorn');
    if (!card) throw new Error('no card');
    const slot = (at: string) => [{ from: 6, to: 10, at, act: 'work' as const }];
    expect(validatePlan(content, card, slot('zz_glade:camp'), true)).toBeNull();
    expect(validatePlan(content, card, slot('zz_glade:safe'), true)).toMatchObject({
      key: 'sys.npc.plan.reject.bad_place',
    });
  });

  it('validates the place references of schedules against the named map', () => {
    const bad = {
      ...content,
      npcs: npcs.map((p) =>
        p.id === 'gorn'
          ? { ...p, schedule: [{ from: 5, to: 11, at: 'zz_glade:nowhere', act: 'work' as const }] }
          : p,
      ),
    } as ContentMap;
    expect(validateNpcContent(content)).toEqual([]);
    expect(validateNpcContent(bad)).toEqual(['npc gorn: place zz_glade:nowhere not on zz_glade']);
  });
});

// ---------------------------------------------------------------------------
// The readers of map fields: registry, canon rewrite, editor flag index, namespaces.

describe('the content readers understand the map mechanics', () => {
  const spawnMap = {
    id: 'zz_r',
    spawns: [{ id: 's', kind: 'monster', ref: 'r', x: 1, y: 1, requiresFlags: ['!zz_a', 'zz_b'] }],
    exits: [{ id: 'x', requiresFlags: ['!zz_c'] }],
    switches: [
      { id: 'w', x: 0, y: 0, w: 1, h: 1, closedTile: 'rock', openWhen: 'zz_d AND NOT zz_e' },
    ],
  };

  it('reads a negated spawn entry by its name, and nothing else as negated', () => {
    const { uses } = collectFlagUses({
      maps: [spawnMap],
      npcs: [{ id: 'p', requiresFlags: ['!zz_f'] }],
    } as unknown as ContentMap);
    const reads = uses.filter((u) => u.kind === 'read').map((u) => `${u.table}:${u.via}:${u.name}`);
    expect(reads).toEqual(
      expect.arrayContaining([
        'maps:requiresFlags:zz_a',
        'maps:requiresFlags:zz_b',
        'maps:requiresFlags:!zz_c',
        'npcs:requiresFlags:!zz_f',
        'maps:openWhen:zz_d',
        'maps:openWhen:zz_e',
      ]),
    );
    expect(reads).not.toContain('maps:requiresFlags:!zz_a');
  });

  it('canonicalises a negated spawn entry around its name, keeping the prefix', () => {
    const reg = defaultRegistry();
    const r = reg.resolve('met_ash');
    expect(r?.name).toBe('a1_ash_met');
    const maps = [{ id: 'm', spawns: [{ id: 's', requiresFlags: ['!met_ash', 'met_ash'] }] }];
    const edits = canonEdits('maps', maps, reg).map((e) => [e.from, e.to]);
    expect(edits).toEqual([
      ['!met_ash', '!a1_ash_met'],
      ['met_ash', 'a1_ash_met'],
    ]);
    // outside spawn points `!name` is no negation and stays as written
    expect(canonEdits('npcs', [{ id: 'p', requiresFlags: ['!met_ash'] }], reg)).toEqual([]);
  });

  it('indexes the editor flag reads of spawn entries and switch conditions', () => {
    const keys = indexData('combat/maps/zz_r.json', spawnMap)
      .filter((r) => r.kind === 'read')
      .map((r) => r.key);
    expect(keys).toEqual(expect.arrayContaining(['zz_a', 'zz_b', '!zz_c', 'zz_d', 'zz_e']));
    expect(keys).not.toContain('!zz_a');
  });

  it('lets a dungeon sub-scene map keep its dg_ id and X3 keep door_corridor, in map tables only', () => {
    const find = (content: Record<string, unknown>) =>
      namespaceFindings({ content: content as unknown as ContentMap }, { legacy: [] }).map(
        (f) => f.message,
      );
    expect(find({ maps: [{ id: 'dg_cave' }], atlas_maps: [{ id: 'door_corridor' }] })).toEqual([]);
    expect(find({ items: [{ id: 'dg_cave' }] })).toEqual([
      'items:dg_cave: prefix dg_ belongs to catalog_dungeons_bosses.md (tables maps, atlas_maps, dungeons), not to items',
    ]);
    expect(find({ npcResidents: [{ id: 'door_corridor' }] })[0]).toContain(
      'prefix door_ belongs to catalog_doors.md',
    );
    expect(find({ atlas_maps: [{ id: 'door_hall' }] })[0]).toContain(
      'prefix door_ belongs to catalog_doors.md',
    );
  });
});
