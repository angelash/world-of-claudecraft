// Test harness for the gathering and crafting kernel (PK-M1-49): a fixture field with a yard
// (two ore nodes, a night herb patch, a one-use special place, an event-only node), a
// workshop corner (a smelter, a forge of tier 3, a gate-bronze repair site), a dark corner
// of sediment 3 and a deep one of sediment 5; fixture items (ore, coal, ingots, swords one
// quality apart, pick tools of T1 and T2, a coating, a drink and a sober pill, a gold-scale
// ring, a deep-hammer plate, a T6 piece); recipes that make, refine and enchant; and the
// shipped kernel numbers. The engine runs the world, the inventory and the crafting system,
// plus a probe that runs one closure per step inside a context.

import { pack as craftingPack } from '../src/content/packs/crafting';
import { Engine } from '../src/core';
import type { AnyWorldEvent, CommandSource, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import {
  type CraftingConfig,
  system as crafting,
  type GatherNodeDef,
  type RecipeDef,
  type StationDef,
} from '../src/systems/crafting';
import {
  type EnchantDef,
  type Holding,
  type ItemDef,
  system as inventory,
} from '../src/systems/inventory';
import { system as world } from '../src/systems/world';
import type { MapDef } from '../src/systems/world/types';

export const SCRIPT: CommandSource = { type: 'script', script: 'test' };

const W = 24;
const H = 14;

export const FIELD: MapDef = {
  id: 'zc_field',
  name: 'field',
  region: 'test',
  width: W,
  height: H,
  rows: Array.from({ length: H }, (_, y) =>
    y === 0 || y === H - 1 ? '#'.repeat(W) : `#${'.'.repeat(W - 2)}#`,
  ),
  legend: { '#': 'wall', '.': 'floor' },
  locations: [
    { id: 'yard', name: 'yard', kind: 'field', x: 2, y: 2, w: 3, h: 3 },
    { id: 'shop', name: 'shop', kind: 'smithy', x: 9, y: 2, w: 3, h: 3 },
    { id: 'dark', name: 'dark', kind: 'wild', x: 16, y: 2, w: 3, h: 3, sediment: 3 },
    { id: 'deep', name: 'deep', kind: 'wild', x: 16, y: 9, w: 3, h: 3, sediment: 5 },
  ],
  spawns: [],
  exits: [],
  atlasExempt: true,
};

/** Tile centres of the fixture places. */
export const AT = {
  yard: { x: 3.5, y: 3.5 },
  shop: { x: 10.5, y: 3.5 },
  dark: { x: 17.5, y: 3.5 },
  deep: { x: 17.5, y: 10.5 },
  away: { x: 10.5, y: 11.5 },
} as const;

function item(p: Partial<ItemDef> & { id: string }): ItemDef {
  return { name: p.id, kind: 'material', quality: 1, value: 10, desc: '', ...p } as ItemDef;
}

export const ITEMS: ItemDef[] = [
  item({ id: 'x_ore', value: 2 }),
  item({ id: 'x_coal', value: 1 }),
  item({ id: 'x_herb', value: 1 }),
  item({ id: 'x_ingot', value: 4 }),
  item({
    id: 'x_sword',
    kind: 'weapon',
    slot: 'main_hand',
    value: 6,
    level: 5,
    stats: { str: 10 },
  }),
  item({
    id: 'x_sword_good',
    kind: 'weapon',
    slot: 'main_hand',
    quality: 2,
    value: 8,
    level: 5,
    stats: { str: 12 },
  }),
  item({ id: 'x_pick_t1', kind: 'goods', tags: ['tool', 'tool:pick'], level: 1, durability: 200 }),
  item({ id: 'x_pick_t2', kind: 'goods', tags: ['tool', 'tool:pick'], level: 10, durability: 200 }),
  item({
    id: 'x_hammer',
    kind: 'goods',
    tags: ['tool', 'tool:hammer'],
    level: 1,
    durability: 200,
  }),
  item({
    id: 'x_poison',
    kind: 'consumable',
    use: { effect: 'coat', amount: 3, group: 'cd_coat' },
    procs: [{ on: 'hit', chance: 1, do: 'dmg:nature:5' }],
  }),
  item({
    id: 'x_ale',
    kind: 'consumable',
    use: { effect: 'drink', group: 'cd_drink', drunk: 2 },
  }),
  item({ id: 'x_sober', kind: 'consumable', use: { effect: 'sober', group: 'cd_none' } }),
  item({
    id: 'x_ring_gold',
    kind: 'trinket',
    slot: 'trinket',
    tags: ['style:goldscale'],
    stats: { int: 2 },
  }),
  item({
    id: 'x_plate_deep',
    kind: 'armor',
    slot: 'chest',
    tags: ['style:deephammer', 'plate'],
    stats: { sta: 10 },
  }),
  item({
    id: 'x_t6_blade',
    kind: 'weapon',
    slot: 'main_hand',
    quality: 3,
    value: 1000,
    level: 60,
    repairMaterial: 'x_ingot',
  }),
];

export const ENCHANTS: EnchantDef[] = [
  { id: 'ench_zc_wpn', name: 'w', slot: 'wpn', tier: 1, stats: { agi: 3 } },
  { id: 'ench_zc_trk', name: 't', slot: 'trk', tier: 1, stats: { int: 1 } },
];

const yard = [{ mapId: 'zc_field', location: 'yard' }];
const shop = [{ mapId: 'zc_field', location: 'shop' }];

export const NODES: GatherNodeDef[] = [
  {
    id: 'node_zc_ore',
    name: 'ore',
    kind: 'ore',
    tier: 1,
    yields: [
      { itemId: 'x_ore', count: 2 },
      { itemId: 'x_coal', count: 1, chance: 0.5 },
    ],
    places: yard,
  },
  {
    id: 'node_zc_ore2',
    name: 'ore2',
    kind: 'ore',
    tier: 2,
    yields: [{ itemId: 'x_ore', count: 4 }],
    places: yard,
  },
  {
    id: 'node_zc_night',
    name: 'night',
    kind: 'herb',
    tier: 1,
    yields: [{ itemId: 'x_herb', count: 2 }],
    places: yard,
    when: 'night',
  },
  {
    id: 'node_zc_once',
    name: 'once',
    kind: 'special',
    profession: 'mining',
    tier: 1,
    yields: [{ itemId: 'x_ore', count: 2 }],
    places: yard,
    uses: 1,
  },
  {
    id: 'node_zc_event',
    name: 'event',
    kind: 'ore',
    tier: 1,
    yields: [{ itemId: 'x_ore', count: 2 }],
    places: yard,
    refreshDays: 0,
  },
  {
    id: 'node_zc_dark',
    name: 'dark',
    kind: 'herb',
    tier: 1,
    yields: [{ itemId: 'x_herb', count: 2 }],
    places: [{ mapId: 'zc_field', location: 'dark' }],
  },
  {
    id: 'node_zc_deep',
    name: 'deep',
    kind: 'herb',
    tier: 1,
    yields: [{ itemId: 'x_herb', count: 2 }],
    places: [{ mapId: 'zc_field', location: 'deep' }],
  },
];

export const STATIONS: StationDef[] = [
  { id: 'stn_zc_smelter', name: 'smelter', type: 'smelter', tier: 1, places: shop },
  { id: 'stn_zc_forge', name: 'forge', type: 'forge', tier: 3, places: shop },
  {
    id: 'stn_zc_court',
    name: 'court',
    type: 'garden_workshop',
    tier: 4,
    places: [{ mapId: 'zc_field', location: 'deep' }],
    repair: { skill: 100, t6: true },
  },
];

export const RECIPES: RecipeDef[] = [
  {
    id: 'rcp_zc_ingot',
    name: 'ingot',
    profession: 'mining',
    tier: 1,
    station: 'smelter',
    inputs: [{ itemId: 'x_ore', count: 2 }],
    output: { itemId: 'x_ingot', count: 1 },
  },
  {
    id: 'rcp_zc_sword',
    name: 'sword',
    profession: 'weaponcrafting',
    tier: 1,
    station: 'forge',
    inputs: [
      { itemId: 'x_ingot', count: 2 },
      { itemId: 'x_coal', count: 1, alt: ['x_herb'] },
    ],
    output: { itemId: 'x_sword' },
    masterwork: { itemId: 'x_sword_good' },
  },
  {
    id: 'rcp_zc_sword_t2',
    name: 'sword t2',
    profession: 'weaponcrafting',
    tier: 2,
    station: 'forge',
    inputs: [{ itemId: 'x_ingot', count: 1 }],
    output: { itemId: 'x_sword' },
  },
  {
    id: 'rcp_zc_secret',
    name: 'secret',
    profession: 'mining',
    tier: 1,
    station: 'smelter',
    inputs: [{ itemId: 'x_ore', count: 1 }],
    output: { itemId: 'x_ingot' },
    requires: 'a1_guild_registered',
  },
  {
    id: 'rcp_zc_refine1',
    name: 'refine',
    profession: 'weaponcrafting',
    tier: 2,
    station: 'forge',
    op: 'refine',
    level: 1,
    inputs: [{ itemId: 'x_ingot', count: 2 }],
  },
  {
    id: 'rcp_zc_enchant',
    name: 'enchant',
    profession: 'enchanting',
    tier: 2,
    station: 'forge',
    op: 'enchant',
    enchant: 'ench_zc_wpn',
    inputs: [{ itemId: 'x_herb', count: 1 }],
    fee: 5,
  },
];

export const SHIPPED_CONFIG = craftingPack.tables.craftingConfig as CraftingConfig;

export function fixtureContent(cfg: Partial<CraftingConfig> = {}): ContentMap {
  return {
    maps: [FIELD],
    worldStarts: [{ mapId: 'zc_field', x: AT.yard.x, y: AT.yard.y, priority: 0 }],
    items: ITEMS,
    itemSets: [],
    enchants: ENCHANTS,
    crafters: [],
    craftingConfig: { ...SHIPPED_CONFIG, ...cfg },
    gatherNodes: NODES,
    craftStations: STATIONS,
    recipes: RECIPES,
  } as unknown as ContentMap;
}

export class Harness {
  readonly g: Engine;
  private job: ((ctx: SystemContext) => void) | null = null;
  constructor(opts: { seed?: number; content?: ContentMap; systems?: GameSystem[] } = {}) {
    const probe: GameSystem = {
      id: 'zz_probe',
      order: 999,
      tick: (ctx) => {
        const j = this.job;
        this.job = null;
        j?.(ctx);
      },
    };
    this.g = Engine.create(
      opts.seed ?? 11,
      opts.content ?? fixtureContent(),
      [...(opts.systems ?? [world, inventory, crafting]), probe],
      { aiMode: 'off' },
    );
  }
  run<T>(fn: (ctx: SystemContext) => T): T {
    let out: T | undefined;
    this.job = (ctx) => {
      out = fn(ctx);
    };
    this.g.step(1);
    return out as T;
  }
  h(owner = 'player'): Holding {
    return this.g.world.slices.inventory.owners[owner] as Holding;
  }
  events<K extends AnyWorldEvent['kind']>(kind: K) {
    return this.g.world.recent.filter(
      (e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind,
    );
  }
  result(kind: string) {
    const r = [...this.g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === kind);
    return r?.kind === 'command.result' ? r.data : undefined;
  }
  /** Queue a command (the player's, or a script's) and step one tick. */
  command(kind: string, data: unknown, script = false) {
    this.g.queue(kind as never, data as never, script ? SCRIPT : undefined);
    this.g.step(1);
    return this.result(kind);
  }
  /** Stand the player at a fixture place. */
  standAt(where: keyof typeof AT): void {
    const e = this.g.world.slices.world.entities.player;
    if (!e) throw new Error('no player');
    e.x = AT[where].x;
    e.y = AT[where].y;
    e.move = null;
  }
  setFlag(key: string, value: string | number | boolean): void {
    this.command('flag.set', { key, value }, true);
  }
  skill(p: string, v: number): void {
    this.command('crafting.set_skill', { profession: p, skill: v }, true);
  }
}
