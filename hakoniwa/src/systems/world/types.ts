// World system types: tile maps, entities, movement, weather.
// Coordinates are in tile units (floats, tile centre at n + 0.5); one tile is one metre.

import type { MapLook } from './look';

export type TileKind =
  | 'grass'
  | 'dirt'
  | 'road'
  | 'stone'
  | 'floor'
  | 'sand'
  | 'ash'
  | 'snow'
  | 'crop'
  | 'bridge'
  | 'door'
  | 'water'
  | 'deep_water'
  | 'wall'
  | 'tree'
  | 'rock'
  | 'void';

export const BLOCKING_TILES: ReadonlySet<TileKind> = new Set<TileKind>([
  'water',
  'deep_water',
  'wall',
  'tree',
  'rock',
  'void',
]);

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A named place on a map (building, plaza, field, ruin room). */
export interface LocationDef extends Rect {
  id: string;
  name: string;
  /** home, work, shop, church, guild, tavern, plaza, field, ruin, gate, camp, ... */
  kind: string;
  tags?: string[];
}

export interface SpawnDef {
  id: string;
  kind: 'monster' | 'npc' | 'object';
  /** content id of the thing to spawn (monster id, npc id, object id) */
  ref: string;
  x: number;
  y: number;
  count?: number;
  /** wander radius in tiles */
  radius?: number;
  /** respawn delay in game minutes (monsters) */
  respawnMinutes?: number;
  /** spawn only when every listed flag is truthy */
  requiresFlags?: string[];
}

export interface ExitDef {
  id: string;
  x: number;
  y: number;
  toMap: string;
  toX: number;
  toY: number;
  /** arrival location id on the target map; when set it wins over toX/toY */
  toLocation?: string;
  label: string;
  requiresFlags?: string[];
}

/**
 * A map document in three layers (art_pipeline.md 5.1): the logic layer (locations,
 * spawns, exits), the spatial layer (rows and legend: walkability, collision, pathing)
 * and the look layer (MapLook: style pack, building looks, decor), which only the
 * renderer reads.
 */
export interface MapDef extends MapLook {
  id: string;
  name: string;
  /** region id from docs/20_world/geography.md */
  region: string;
  width: number;
  height: number;
  /** one string per row, one character per tile */
  rows: string[];
  legend: Record<string, TileKind>;
  locations: LocationDef[];
  spawns: SpawnDef[];
  exits: ExitDef[];
  /** 0..7, the sediment (澱) level scale of power_system.md */
  sediment?: number;
  indoor?: boolean;
  /**
   * Respawn role (thousand_doors.md 6.3): 'door' is where the door puts a fallen player once
   * the inner court is open, 'wake' the last-resort wake point; at most one map per role.
   */
  respawn?: MapRespawnRole;
  /** act ids (act flag values) whose story this map carries, for persona cards without acts */
  storyActs?: string[];
  /** a test or tooling map that is not part of the world and needs no atlas entry */
  atlasExempt?: boolean;
}

export type MapRespawnRole = 'door' | 'wake';

export type EntityKind = 'player' | 'npc' | 'monster' | 'companion' | 'object' | 'unit';

/**
 * How an entity looks (art_pipeline.md 3.1). `base`, `colors`, `scale` and `glyph` drive the
 * procedural placeholder and the paper-doll recolouring; the asset fields name AI art by asset
 * id (art_pipeline.md 6.5). Only the client reads any of it: the kernel copies it from content
 * to entities and never branches on it, and a missing or unapproved asset falls back to the
 * procedural placeholder.
 */
export interface Appearance {
  /**
   * body archetype or a body alias: human, elf, dwarf, halfling, beastkin, demon, undead,
   * slime, wolf, bird, golem, spirit, goddess, object, or a creature body such as rat, boar,
   * bear, spider, centipede, leech, worm, drake (art_pipeline.md 3.2 and 3.8)
   */
  base: string;
  /** palette: [primary, secondary, skin/accent, hair/detail] as #rrggbb */
  colors: string[];
  scale?: number;
  /** optional single glyph drawn on objects (e.g. a sign) */
  glyph?: string;
  /** frame sheet of a main character: the asset id without the strip suffix (art_chr_yeyu) */
  sheet?: string;
  /** paper-doll recipe (everyone with a body who has no sheet) */
  doll?: DollRecipe;
  /** portrait expression sheet (art_por_<subject>) */
  portrait?: string;
  /** half-body portrait (art_bust_<subject>; expressions in <id>_expr) */
  bust?: string;
  /**
   * state variants keyed by a ledger condition (art_pipeline.md 3.1): while the condition
   * holds, the variant's assets replace the base ones; fields it leaves out keep the base
   */
  variants?: Record<string, AppearanceVariant>;
}

/** Paper-doll body (art_pipeline.md 3.2): standard, small and big humanoid mannequins. */
export type DollBody = 'h' | 'hs' | 'hb';

/**
 * A paper-doll recipe (art_pipeline.md 3.3): the mannequin body plus one asset id per layer
 * (art_doll_...); the outfit names the strip family (art_doll_gear_garb, whose strips are
 * art_doll_gear_garb_idle and so on). `swatch` picks the colour row the key colours map to.
 */
export interface DollRecipe {
  body: DollBody;
  outfit?: string;
  head?: string;
  hair?: string;
  /** ears or horns */
  ears?: string;
  headwear?: string;
  beard?: string;
  back?: string;
  mainHand?: string;
  offHand?: string;
  swatch?: string;
}

export interface AppearanceVariant {
  sheet?: string;
  portrait?: string;
  bust?: string;
}

export interface Waypoint {
  x: number;
  y: number;
}

export interface MoveOrder {
  path: Waypoint[];
  goal: Waypoint;
  arriveRadius: number;
}

export interface Entity {
  id: string;
  kind: EntityKind;
  name: string;
  mapId: string;
  x: number;
  y: number;
  facing: number;
  /** tiles per real second at 1x */
  speed: number;
  radius: number;
  faction: string;
  appearance: Appearance;
  tags: string[];
  alive: boolean;
  hidden?: boolean;
  /** content id this entity was created from */
  ref?: string;
  /** spawn point it belongs to, for respawn and leashing */
  spawnId?: string;
  home?: Waypoint;
  move?: MoveOrder | null;
  intent?: { dx: number; dy: number } | null;
}

export type Weather = 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'ashfall';

export interface WorldSlice {
  playerId: string;
  entities: Record<string, Entity>;
  weather: Weather;
  /** weather forced by a registered modifier (goddess intervention) until a tick */
  weatherOverride: { weather: Weather; untilTick: number; source: string } | null;
  lastHour: number;
  lastDay: number;
  /** pending respawns: spawnId -> tick */
  respawns: Record<string, number>;
}

export interface SpawnEntitySpec {
  kind: EntityKind;
  name: string;
  mapId: string;
  x: number;
  y: number;
  faction: string;
  appearance: Appearance;
  speed?: number;
  radius?: number;
  tags?: string[];
  ref?: string;
  spawnId?: string;
  id?: string;
}
