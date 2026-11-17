// Gathering and crafting data shapes (catalog_gathering_crafting.md 1 to 3, 6, 7;
// progression_and_pacing.md 6.3): gathering nodes placed by map and location, work
// stations with their tier, recipes (make an item, refine a piece, put an enchant on it),
// the kernel's numbers, and the slice (livelihood skills, node clocks, the craft throttle,
// drunkenness). The livelihoods themselves and the persons' skills (`crafters`) are the
// inventory's (src/systems/inventory/types.ts), because repairs read them too.

import type { GatherProfession, Profession } from '../inventory/types';

export type { CraftProfession, GatherProfession, Profession } from '../inventory/types';

/** Node kinds (1.3): ore, wood, herb, water, and special places that name their livelihood. */
export const NODE_KINDS = ['ore', 'wood', 'herb', 'water', 'special'] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

/** The livelihood each ordinary node kind is gathered with. */
export const NODE_PROFESSION: Readonly<Record<Exclude<NodeKind, 'special'>, GatherProfession>> = {
  ore: 'mining',
  wood: 'logging',
  herb: 'herbalism',
  water: 'fishing',
};

/**
 * Work stations (2.4): smelter, anvil forge, hearth, alembic room, tan pits, loom,
 * contrivance bench, scribe desk, grain table, lapidary wheel, racks and vats, the folding
 * field forge and the garden workshop.
 */
export const STATION_TYPES = [
  'smelter',
  'forge',
  'kitchens',
  'apothecary',
  'tannery',
  'loom',
  'toolworks',
  'scribe_desk',
  'grain_table',
  'lapidary',
  'racks',
  'field_forge',
  'garden_workshop',
] as const;
export type StationType = (typeof STATION_TYPES)[number];

/** What a recipe does: make an item, refine a worn-able piece, or put an enchant on one. */
export const RECIPE_OPS = ['make', 'refine', 'enchant'] as const;
export type RecipeOp = (typeof RECIPE_OPS)[number];

/** A place on a map: a location of that map document (the map files are not this system's). */
export interface Place {
  mapId: string;
  location: string;
}

export interface YieldDef {
  itemId: string;
  /** count per gather: a number, or a range rolled per gather */
  count: number | [number, number];
  /** chance 0 to 1 (default 1, the main yield) */
  chance?: number;
}

/** A gathering node (`node_`, 6.1): one id, one or more places that refresh together. */
export interface GatherNodeDef {
  id: string;
  name: string;
  desc?: string;
  kind: NodeKind;
  /** the livelihood of a special node; ordinary kinds follow NODE_PROFESSION */
  profession?: GatherProfession;
  /** node tier 1 to 6: the skill and tool tier it asks for (1.2, 1.3) */
  tier: number;
  /** the main yield first, then the by-products and the rare ones */
  yields: YieldDef[];
  /** where it stands; empty until its map location is built */
  places: Place[];
  /** game days until it gives again (default by tier); 0: only when content resets it */
  refreshDays?: number;
  /** gathers before it is gone for good (a nest residue three, a T6 place one) */
  uses?: number;
  /** condition under which it can be gathered (the quest condition language: night, a flag) */
  when?: string;
  /** the taint grade 0 to 3 of what it gives, instead of the one its place's sediment gives */
  taint?: number;
}

/** A work station (`stn_`, 2.4) at one or more places. */
export interface StationDef {
  id: string;
  name: string;
  desc?: string;
  type: StationType;
  /** station tier 1 to 4: the recipe tiers it can make (2.4) */
  tier: number;
  places: Place[];
  /** condition under which it can be used (an expansion of the inner court, a flag) */
  when?: string;
  /** the repair service the station runs: skill, master standing, T6 work (catalog_equipment 2.7) */
  repair?: { skill: number; master?: boolean; t6?: boolean };
}

export interface RecipeInput {
  itemId: string;
  count: number;
  /** items that may stand in for it ("或" in the catalog), tried after it in order */
  alt?: string[];
  /** a main material: its taint decides the product's grain (default: the first input) */
  main?: boolean;
}

/** A recipe (`rcp_`, 7): one craft of a family branch. */
export interface RecipeDef {
  id: string;
  name: string;
  desc?: string;
  /** the recipe family it belongs to (7.1), for grouping only */
  family?: string;
  profession: Profession;
  /** recipe tier 1 to 6 */
  tier: number;
  /** skill it needs (default the tier's first point, (tier - 1) x 25) */
  skill?: number;
  station: StationType;
  /** lowest station tier (default by recipe tier: 2.4) */
  stationTier?: number;
  inputs: RecipeInput[];
  /** default make */
  op?: RecipeOp;
  /** make: the item and how many */
  output?: { itemId: string; count?: number };
  /** make: what a masterwork gives instead (the next quality); default the output, signed */
  masterwork?: { itemId: string; count?: number };
  /** make: what comes out beside the product every time (the lead of silver, 7.2), unsigned */
  byproducts?: { itemId: string; count?: number }[];
  /** refine: the level it brings a piece to (1 to 4) */
  level?: number;
  /** enchant: the `ench_` it puts on */
  enchant?: string;
  /** copper the station takes per craft */
  fee?: number;
  /** condition under which the crafter knows it (a book read, a master's teaching) */
  requires?: string;
}

/** The kernel's numbers (data/crafting/config.json). */
export interface CraftingConfig {
  /** the layer every livelihood starts at (layer n caps the skill at 25n) */
  baseLayer: number;
  /** later layers by condition, highest that holds wins (the act now; the livelihood doors later) */
  layers: { when: string; layer: number; professions?: Profession[] }[];
  /** skill per action at full gain */
  gain: number;
  /** gain factor by tiers the crafter stands above the work: 0, 1, 2, 3 and more */
  gainCurve: number[];
  masterwork: {
    base: number;
    perTierAbove: number;
    signed: number;
    specialization: number;
    /** bonus by station tier ("3": 0.01) */
    stationTier: Record<string, number>;
    cap: number;
  };
  /** the highest quality crafting makes (fine; named pieces are never made, catalog_equipment 2.3) */
  maxCraftQuality: number;
  /** station tier each recipe tier needs, T1 first */
  stationTiers: number[];
  gather: {
    /** a rare gathering event once in this many gathers */
    rareOneIn: number;
    rareMultiplier: number;
    /** refresh days by node tier, T1 first (0: only when content resets it) */
    refreshDays: number[];
    /** tiles around a node's location the gatherer may stand */
    reach: number;
  };
  /** at most `count` crafts in `minutes` game minutes per crafter */
  throttle: { count: number; minutes: number };
  /** runs one craft command may ask for */
  maxRuns: number;
  /** tool kinds: the item tag `tool:<tag>` and the livelihoods it serves (consumables 3.15) */
  tools: { tag: string; professions: Profession[] }[];
  /** durability a tool loses per gather or craft */
  toolWear: number;
  /** drunkenness (consumables 2.1, 3.10; combat_and_classes 9.4) */
  drunk: {
    max: number;
    /** layers lost each game hour */
    decayPerHour: number;
    /** game minutes a sober pill keeps new layers off */
    soberMinutes: number;
    /** the state aura that shows the layers as stacks (combat's data); none: layers only */
    aura?: string;
  };
}

/** A node's clock: when it gives again (-1: when content resets it) and gathers spent. */
export interface NodeState {
  readyAt: number;
  used: number;
}

export interface DrunkState {
  layers: number;
  /** a sober pill keeps new layers off until this tick */
  soberUntil: number;
}

export interface CraftingSlice {
  /** slice layout version (slice.ts CRAFTING_SLICE_VERSION) */
  version: number;
  /** livelihood skills by entity id (fractional; shown floored) */
  skills: Record<string, Partial<Record<Profession, number>>>;
  /** nodes that were gathered */
  nodes: Record<string, NodeState>;
  /** ticks of each crafter's recent crafts (the throttle window) */
  recent: Record<string, number[]>;
  /** drunkenness by entity id */
  drunk: Record<string, DrunkState>;
  /** masterworks made, by entity id (the first is a deed's moment) */
  masterworks: Record<string, number>;
}
