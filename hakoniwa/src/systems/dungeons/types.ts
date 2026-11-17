// Dungeon runtime data and state (PK-M1-50; catalog_dungeons_bosses.md 1.1 to 1.4;
// catalog_bestiary.md 2.8 and 6; world_state_registry.md 8.6). A dungeon record (`dg_`) lists
// its floors (a map, or a location rectangle of a map), the gate outside and the arrival
// inside, its party cap and its starting state quantities (pressure, activity); a nest
// record (`nest_`) sits on one location of a map and grows by the season. Both share the
// three dispositions (nurture, destroy, purify) and the state mirror family `dg.<id>.<field>`.

import type { Effect } from '../quests/effect_types';

/** The forms of a dungeon by its core pressure (1.1): lair, shallow, dungeon, great. */
export const DUNGEON_FORMS = ['lair', 'shallow', 'dungeon', 'great'] as const;
export type DungeonForm = (typeof DUNGEON_FORMS)[number];

/** The sources of a dungeon's sediment (content_bible 4.4; 1.2 the purification table). */
export const SEDIMENT_SOURCES = [
  'ancient',
  'light',
  'war',
  'pact',
  'life',
  'record',
  'mixed',
] as const;
export type SedimentSource = (typeof SEDIMENT_SOURCES)[number];

/** The three dispositions (1.2); `untouched` is the state before any. */
export const CHOICES = ['nurture', 'destroy', 'purify'] as const;
export type Choice = (typeof CHOICES)[number];
export type ChoiceState = Choice | 'untouched';

/** The values of `dg.<id>.phase` (registry 8.6). */
export const PHASES = ['lair', 'shallow', 'dungeon', 'great', 'overflow', 'purified'] as const;
export type DungeonPhase = (typeof PHASES)[number];

/** A place: a location on a map. */
export interface PlaceRef {
  mapId: string;
  location: string;
}

/**
 * One floor of a dungeon: a whole map, or one location rectangle of a map (an upper and a
 * lower level drawn on one map, or a cellar under an ordinary town map). A map has at most
 * one whole-map floor; it holds every point of the map no area floor covers, and on a map
 * without one only the area rectangles belong to a dungeon.
 */
export interface FloorDef {
  id: string;
  name?: string;
  mapId: string;
  /** a location of the map narrowing the floor to its rectangle */
  area?: string;
  /** 0 the ground level, then one per level down (`dg.<id>.depth` is the deepest reached) */
  depth: number;
  /** the floor's boss, shown on the field status bar as beaten or not (boss.<id>.defeated) */
  boss?: string;
}

/**
 * One disposition a record offers. `ownerRefuses`: the owner will not have it (the cellar's
 * keeper refuses a nurtured nest under her inn); `when` must hold to choose it now; `days`
 * is the collapse (destroy) or the ritual (purify) in game days, a band rolled on the
 * stream `dungeons.collapse`; `start` applies when the choice is made, `effects` when it
 * takes hold (at once for nurture, at the collapse, at the ritual's end).
 */
export interface ChoiceDef {
  when?: string;
  ownerRefuses?: boolean;
  days?: number | [number, number];
  start?: Effect[];
  effects?: Effect[];
}

export type ChoiceTable = Partial<Record<Choice, ChoiceDef>>;

export interface DungeonDef {
  id: string;
  name: string;
  /** the act it first opens in */
  act: string;
  /** the form the record is written at (1.1); the starting pressure lies in its band */
  form: DungeonForm;
  /** starting core pressure (default: the floor of the form's band) */
  pressure?: number;
  /** starting activity, 0 to 100 (default 0) */
  activity?: number;
  /** [lowest, highest] content level (catalog 2) */
  level: [number, number];
  source?: SedimentSource;
  /** who decides the disposition (a person or a faction code) */
  owner?: string;
  /** companions allowed besides the player (default: the form's cap, 1.4) */
  party?: number;
  /** where the dungeon is entered and left, outside it */
  gate: PlaceRef;
  /** where an entry puts the player, on a floor */
  entry: PlaceRef;
  floors: FloorDef[];
  /** the boss that guards the core (the last one): its death clears the dungeon */
  coreBoss?: string;
  /** game days from the start of the active period to the overflow (none: no clock) */
  overflowDays?: number;
  /** the settlement map an overflow surges toward */
  overflowTo?: string;
  choices?: ChoiceTable;
}

export interface NestDef {
  id: string;
  name: string;
  act: string;
  mapId: string;
  /** the nest's location rectangle on the map */
  location: string;
  /** the nest lord (from stage 2), whose death clears the nest */
  lord?: string;
  /** the plain leader of a stage 1 nest, whose death clears it too */
  head?: string;
  /** the stage the record starts at, 1 to 3 (default 1) */
  stage?: number;
  /** the nest exists and grows once this holds (default: from the start) */
  when?: string;
  /** the shallow dungeon the nest turns into at stage 4 */
  becomes?: string;
  choices?: ChoiceTable;
}

export interface FormDef {
  id: DungeonForm;
  /** lowest pressure of the band (the band runs to the next form's floor) */
  minPressure: number;
  /** companions allowed besides the player at full strength (1.4) */
  party: number;
}

export interface DungeonConfig {
  forms: FormDef[];
  activity: {
    max: number;
    /** the active period from this activity on (1.3) */
    active: number;
    /** activity right after an overflow */
    afterOverflow: number;
    /** each paged creature dying inside */
    pagedDeath: number;
    /** the core boss killed (a negative change) */
    coreKill: number;
    /** a purification ritual starting */
    ritual: number;
    /** each week a nurtured dungeon goes without a clearing sweep */
    idleNurture: number;
  };
  /** who has a page: entity kinds, and monster families (people, catalog_bestiary 2.9) */
  paged: { kinds: string[]; families: string[] };
  /** core pressure growth per season of nurture, as a share */
  nurtureGrowth: number;
  /** game days a left item lies in a dungeon before the dungeon swallows it */
  leftItemDays: number;
  /** collapse after destroy, in game days (a band) */
  collapseDays: [number, number];
  nest: {
    /** a season: the uncleared span after which a nest grows a stage */
    stageDays: number;
    /** the sediment level a nest needs to grow at all */
    minSediment: number;
    /** the sediment level stage 3 needs (and the stage that raises its map's level) */
    fullSediment: number;
    fullStage: number;
    /** the stage at which the nest is a shallow dungeon */
    maxStage: number;
    /** the stage nurture holds a nest at */
    nurtureStage: number;
    /** days the map's level stays one up after a destroyed nest collapses */
    destroyDays: number;
    /** the stage the lord shows at; before it the head's death clears the nest */
    lordStage: number;
    /** tiles around the nest rectangle where the lord's or head's death counts */
    clearMargin: number;
  };
}

// ---------------------------------------------------------------------------
// runtime state

/** A destroy collapsing or a purification ritual running until `until`. */
export interface PendingChoice {
  choice: 'destroy' | 'purify';
  until: number;
  /** the disposition before it (a failed ritual falls back to it) */
  from: ChoiceState;
}

export interface DungeonState {
  /** the record this instance runs (equal to its key for the written dungeons) */
  def: string;
  pressure: number;
  activity: number;
  /** tick the overflow clock runs out, -1 without a running clock */
  overflowAt: number;
  /** tick of the last overflow, -1 never */
  overflowed: number;
  choice: ChoiceState;
  /** tick of the last choice, -1 none */
  choiceTick: number;
  /** seasons of nurture growth applied */
  grown: number;
  /** tick of the last clearing sweep (a garrison, a guild branch, the core boss down), -1 none */
  patrol: number;
  /** weeks of nurture without a sweep already counted */
  idle: number;
  pending: PendingChoice | null;
  collapsed: boolean;
  purified: boolean;
  /** the core boss was killed */
  cleared: boolean;
  /** deepest floor depth reached, -1 never entered */
  depth: number;
  entries: number;
  swallowed: number;
}

export interface NestState {
  /** its `when` held: the nest exists */
  live: boolean;
  stage: number;
  /** start of the growth window (the last stage change or clear) */
  since: number;
  /** the lord (or head) was killed since the nest last grew */
  cleared: boolean;
  clearedTick: number;
  choice: ChoiceState;
  choiceTick: number;
  pending: PendingChoice | null;
  collapsed: boolean;
  /** tick the nest collapsed, -1 not collapsed */
  collapsedTick: number;
  purified: boolean;
  /** reached the last stage: a shallow dungeon now */
  matured: boolean;
}

/** How a run began or ended. */
export type RunVia = 'command' | 'walk' | 'collapse' | 'purify';

/** The player's current visit to a dungeon. */
export interface DungeonRun {
  dungeon: string;
  floor: string;
  enteredTick: number;
  via: RunVia;
  /** the party was over the cap at the entry */
  overCap: boolean;
}

export interface DungeonsSlice {
  /** slice layout version (slice.ts DUNGEONS_SLICE_VERSION) */
  version: number;
  /** dungeon instances by instance key */
  instances: Record<string, DungeonState>;
  nests: Record<string, NestState>;
  run: DungeonRun | null;
  /** a flag moved since the last settle */
  dirty: boolean;
}

/** What a left item (a drop bag) is to the dungeon runtime (left_items.ts). */
export interface LeftItem {
  id: string;
  mapId: string;
  x: number;
  y: number;
  /** the tick it was left */
  since: number;
}
