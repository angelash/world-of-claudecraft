// Test harness for the dungeon runtime (PK-M1-50): fixture maps (a town with a cellar drawn
// as an area of it, a two-level cave whose lower level has a deeper area, a field and a
// meadow with nests and a collapse switch), fixture dungeon and nest records written the
// way the catalog writes the act 1 ones (dg_old_mine, dg_moon_cellar, nest_furrow_rat_queen),
// a probe that stands in for the systems the runtime only reads (deaths, the party, the
// left packs), and an hour strider for long waits (the long tier of a time skip). The
// records' effects write registered act 1 story flags, so the registry guard (policy
// throw) checks every write the runtime makes.

import { pack as dungeonsPack } from '../src/content/packs/dungeons';
import { ok } from '../src/core';
import type { AnyWorldEvent, ContentMap, FlagValue } from '../src/core/contracts';
import type { Engine } from '../src/core/engine';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import type { World } from '../src/core/world';
import { createGame, resumeGame } from '../src/game/create';
import {
  type DungeonConfig,
  type DungeonDef,
  type DungeonsSlice,
  system as dungeons,
  type LeftItem,
  type LeftItemPort,
  leftItemPort,
  type NestDef,
  registerLeftItemPort,
} from '../src/systems/dungeons';
import { system as world } from '../src/systems/world';
import type { LocationDef, MapDef } from '../src/systems/world/types';

declare module '../src/core/contracts' {
  interface CommandMap {
    'zd.die': { kind: string; ref?: string; mapId: string; x: number; y: number };
    'zd.party': { ids: string[] };
    'zd.drop': { id: string; mapId: string; x: number; y: number };
  }
}

function map(
  id: string,
  opts: {
    w?: number;
    h?: number;
    sediment?: number;
    locations?: LocationDef[];
    exits?: MapDef['exits'];
    switches?: MapDef['switches'];
  } = {},
): MapDef {
  const w = opts.w ?? 30;
  const h = opts.h ?? 20;
  const rows = Array.from({ length: h }, (_, y) =>
    y === 0 || y === h - 1 ? '#'.repeat(w) : `#${'.'.repeat(w - 2)}#`,
  );
  const out: MapDef = {
    id,
    name: id,
    region: 'fixture',
    width: w,
    height: h,
    rows,
    legend: { '#': 'wall', '.': 'floor' },
    locations: opts.locations ?? [],
    spawns: [],
    exits: opts.exits ?? [],
  };
  if (opts.sediment !== undefined) out.sediment = opts.sediment;
  if (opts.switches) out.switches = opts.switches;
  return out;
}

const loc = (id: string, x: number, y: number, w = 3, h = 3, extra = {}): LocationDef => ({
  id,
  name: id,
  kind: 'place',
  x,
  y,
  w,
  h,
  ...extra,
});

export const MAPS: MapDef[] = [
  map('town', {
    locations: [
      loc('square', 2, 2),
      loc('mine_gate', 10, 2),
      loc('cellar_gate', 20, 2, 3, 3),
      loc('cellar', 20, 10, 6, 6),
    ],
    exits: [
      {
        id: 'to_mine',
        x: 11,
        y: 3,
        toMap: 'mine_upper',
        toX: 2,
        toY: 2,
        toLocation: 'mine_mouth',
        label: 'mine',
      },
    ],
  }),
  map('mine_upper', {
    sediment: 2,
    locations: [loc('mine_mouth', 2, 2), loc('cave_in', 20, 10)],
    exits: [
      {
        id: 'to_town',
        x: 3,
        y: 5,
        toMap: 'town',
        toX: 11,
        toY: 3,
        toLocation: 'mine_gate',
        label: 'out',
      },
    ],
  }),
  map('mine_lower', {
    sediment: 3,
    locations: [loc('landing', 2, 2), loc('vein', 15, 5, 10, 10)],
  }),
  map('field', {
    sediment: 3,
    locations: [loc('den', 10, 8, 4, 4), loc('far_corner', 24, 14)],
    switches: [
      {
        id: 'den_mouth',
        x: 9,
        y: 6,
        w: 6,
        h: 1,
        closedTile: 'rock',
        openWhen: 'NOT dg.nest_fx_queen.collapsed',
      },
    ],
  }),
  map('meadow', {
    sediment: 1,
    locations: [loc('burrow', 5, 5, 4, 4, { sediment: 2 })],
  }),
];

/** The cave: a shallow dungeon of two levels, the lower one with a deeper vein. */
export const MINE: DungeonDef = {
  id: 'dg_fx_mine',
  name: '试验矿',
  act: 'act1',
  form: 'shallow',
  level: [6, 12],
  source: 'mixed',
  owner: 'magistrate',
  party: 2,
  gate: { mapId: 'town', location: 'mine_gate' },
  entry: { mapId: 'mine_upper', location: 'mine_mouth' },
  floors: [
    { id: 'upper', name: '上层', mapId: 'mine_upper', depth: 0 },
    { id: 'lower', name: '下层', mapId: 'mine_lower', depth: 1 },
    { id: 'vein', name: '晶脉', mapId: 'mine_lower', area: 'vein', depth: 2, boss: 'fx_mother' },
  ],
  coreBoss: 'fx_mother',
  overflowDays: 2,
  overflowTo: 'town',
  choices: {
    nurture: { effects: [{ type: 'flag', key: 'a1_lair_located', value: true }] },
    destroy: {
      start: [{ type: 'flag', key: 'a1_core_choice_made', value: true }],
      effects: [{ type: 'flag', key: 'a1_mine_cleared', value: true }],
    },
    purify: {
      when: 'fx_herbs_ready',
      days: 3,
      effects: [{ type: 'flag', key: 'a1_graveyard_purified', value: true }],
    },
  },
};

/** The cellar: a lair-form dungeon drawn as an area of the town, its keeper refuses a nest. */
export const CELLAR: DungeonDef = {
  id: 'dg_fx_cellar',
  name: '试验地窖',
  act: 'act1',
  form: 'lair',
  pressure: 40,
  level: [5, 8],
  source: 'pact',
  owner: 'keeper',
  party: 0,
  gate: { mapId: 'town', location: 'cellar_gate' },
  entry: { mapId: 'town', location: 'cellar' },
  floors: [{ id: 'cellar', mapId: 'town', area: 'cellar', depth: 0 }],
  coreBoss: 'fx_crone',
  choices: {
    nurture: { ownerRefuses: true },
    destroy: { days: 1, effects: [{ type: 'flag', key: 'a1_martha_strike', value: true }] },
    purify: { days: 3 },
  },
};

/** The burrow the meadow nest turns into once it matures. */
export const BURROW: DungeonDef = {
  id: 'dg_fx_burrow',
  name: '试验巢穴',
  act: 'act1',
  form: 'shallow',
  level: [8, 10],
  gate: { mapId: 'meadow', location: 'burrow' },
  entry: { mapId: 'mine_upper', location: 'cave_in' },
  floors: [{ id: 'burrow', mapId: 'mine_upper', area: 'cave_in', depth: 0 }],
};

/** A nest with a lord on dense ground: grows to full, raises its map, can be disposed of. */
export const QUEEN_NEST: NestDef = {
  id: 'nest_fx_queen',
  name: '试验鼠后巢',
  act: 'act1',
  mapId: 'field',
  location: 'den',
  lord: 'fx_queen',
  head: 'fx_rat',
  stage: 2,
  choices: {
    nurture: {},
    destroy: { effects: [{ type: 'flag', key: 'a1_culvert_sealed', value: true }] },
    purify: { when: 'fx_herbs_ready', days: 2 },
  },
};

/** A nest on thin ground that wakes later and turns into the burrow. */
export const MEADOW_NEST: NestDef = {
  id: 'nest_fx_meadow',
  name: '试验草甸巢',
  act: 'act1',
  mapId: 'meadow',
  location: 'burrow',
  when: 'fx_meadow_wakes',
  becomes: 'dg_fx_burrow',
};

export const MONSTERS = [
  { id: 'fx_mother', family: 'burrower', rank: 'boss' },
  { id: 'fx_crone', family: 'burrower', rank: 'elite' },
  { id: 'fx_queen', family: 'burrower', rank: 'boss' },
  { id: 'fx_rat', family: 'burrower' },
  { id: 'fx_bandit', family: 'humanoid' },
];

export const CONFIG: DungeonConfig = dungeonsPack.tables.dungeonConfig as DungeonConfig;

export function fixtureContent(over: Partial<ContentMap> = {}): ContentMap {
  return {
    maps: MAPS,
    worldStarts: [{ mapId: 'town', x: 4, y: 4, priority: 1 }],
    acts: [{ id: 'act1' }],
    dungeonConfig: CONFIG,
    dungeons: [MINE, CELLAR, BURROW],
    nests: [QUEEN_NEST, MEADOW_NEST],
    companions: [{ id: 'cmp_a' }, { id: 'cmp_b' }, { id: 'cmp_c' }],
    monsters: MONSTERS,
    ...over,
  } as unknown as ContentMap;
}

// ---------------------------------------------------------------------------
// stand-ins

interface Bags {
  items: Record<string, LeftItem>;
}

/** Stand-in for the systems the runtime reads: deaths, party members, left packs. */
const probe: GameSystem = {
  id: 'zz_dungeon_probe',
  order: 5,
  init(ctx) {
    (ctx.world.slices as unknown as { zz_bags: Bags }).zz_bags = { items: {} };
  },
  commands: {
    'zd.die'(ctx, d) {
      ctx.emit('entity.died', {
        id: ctx.newId('victim'),
        ...(d.ref ? { ref: d.ref } : {}),
        kind: d.kind,
        mapId: d.mapId,
        x: d.x,
        y: d.y,
      });
      return ok();
    },
    'zd.party'(ctx, d) {
      const members: Record<string, unknown> = {};
      for (const id of d.ids) members[id] = { id };
      (ctx.world.slices as unknown as { party: unknown }).party = { members };
      return ok();
    },
    'zd.drop'(ctx, d) {
      const bags = (ctx.world.slices as unknown as { zz_bags: Bags }).zz_bags;
      bags.items[d.id] = { id: d.id, mapId: d.mapId, x: d.x, y: d.y, since: ctx.tick };
      return ok();
    },
  },
};

/** The port registered before a test (none in this build), given back by restorePort. */
let before: LeftItemPort | null | undefined;

/** Give back the port that was registered before usePort (call after each test). */
export function restorePort(): void {
  if (before !== undefined) registerLeftItemPort(before);
  before = undefined;
}

/** The left pack port over the probe's bags. */
export function usePort(): void {
  if (before === undefined) before = leftItemPort();
  registerLeftItemPort({
    items: (w) => Object.values((w.slices as unknown as { zz_bags: Bags }).zz_bags.items),
    swallow(ctx, id) {
      const bags = (ctx.world.slices as unknown as { zz_bags: Bags }).zz_bags;
      if (!bags.items[id]) return false;
      delete bags.items[id];
      return true;
    },
  });
}

export function bags(g: Engine): Record<string, LeftItem> {
  return (g.world.slices as unknown as { zz_bags: Bags }).zz_bags.items;
}

const stride = { on: false };
const strider: GameSystem = {
  id: 'zz_dungeon_stride',
  order: 1,
  clock(w) {
    if (!stride.on) return null;
    const t = w.meta.tick;
    return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
  },
};

export const SYSTEMS: GameSystem[] = [world, dungeons, probe, strider];

export interface T {
  g: Engine;
  events: AnyWorldEvent[];
}

export function game(content: ContentMap = fixtureContent(), seed = 5050): T {
  stride.on = false;
  const g = createGame({ seed, content, systems: SYSTEMS, flagPolicy: 'throw' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  g.step(1);
  return { g, events };
}

export function resume(w: World, content: ContentMap = fixtureContent()): T {
  stride.on = false;
  const g = resumeGame(w, { content, systems: SYSTEMS, flagPolicy: 'throw' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  return { g, events };
}

/** Advance whole game hours on the hour strider (each step is one hour-coarse skip step). */
export function hours(t: T, n: number): void {
  stride.on = true;
  t.g.step(n * TICKS_PER_GAME_HOUR);
  stride.on = false;
  t.g.step(1);
}

export function days(t: T, n: number): void {
  hours(t, n * 24);
}

export const DAY = TICKS_PER_GAME_DAY;

export const flags = (g: Engine): Record<string, FlagValue> => g.world.meta.flags;
export const ds = (g: Engine): DungeonsSlice => g.world.slices.dungeons;

/** Put the player somewhere at once (a map change goes through the world's teleport). */
export function put(t: T, mapId: string, x: number, y: number): void {
  t.g.queue('world.teleport', { entityId: 'player', mapId, x, y });
  t.g.step(1);
}

export function kinds(t: T, kind: string): AnyWorldEvent[] {
  return t.events.filter((e) => e.kind === kind);
}

export const SCRIPT = { type: 'script', script: 'test' } as const;
export const AI = { type: 'ai', agentId: 'npc', requestId: 'r1' } as const;
