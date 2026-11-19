// Thousand Doors (千门回廊) types: door content, keys (钥), effects, per-door state and
// the doors slice, plus the events and commands doors registers.
// Canon: docs/20_world/power_system.md 9; mechanics: docs/40_design/systems/thousand_doors.md
// (corridor 2, states 3, door rank 4, keys 5, the three costs 6, exclusion 9, data 21).

import type { FlagValue } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import type { ResourceKind, StatBlock } from '../combat/types';

export type DoorCategory =
  | 'origin'
  | 'insight'
  | 'vocation'
  | 'school'
  | 'craft'
  | 'bond'
  | 'passage'
  | 'domain'
  | 'truth'
  | 'forbidden'
  | 'last';

/** The twelve wings plus the front hall and the far end (thousand_doors.md 2.2). */
export const WINGS = [
  'hall_front',
  'mirror',
  'steles',
  'vocations',
  'schools',
  'crossing',
  'crafts',
  'six_chairs',
  'knots',
  'paths',
  'court',
  'grey',
  'draft',
  'end',
] as const;
export type WingId = (typeof WINGS)[number];

/** Seal tiers of a door (thousand_doors.md 6.4.1); `none` for the doors that do not loosen it. */
export const SEAL_TIERS = ['none', 'micro', 'small', 'medium', 'large', 'extreme'] as const;
export type SealTier = (typeof SEAL_TIERS)[number];

/** How a door moves seal_unrest (6.4.4): the act rule, never, or the ruins-key rule. */
export type UnrestRule = 'default' | 'none' | 'ruins';

/**
 * The five danger bands of a door (catalog_doors.md 1.7: none, low, medium, high, extreme),
 * the cracks on the door frame of the corridor (ux_and_onboarding.md 9.2).
 */
export const DANGER_BANDS = ['none', 'low', 'medium', 'high', 'extreme'] as const;
export type DoorDanger = (typeof DANGER_BANDS)[number];

/** The six prologue tendencies (prologue_antechamber.md 4.8; registry p_hint.<tendency>). */
export const TENDENCIES = ['blade', 'beast', 'breath', 'pact', 'shadow', 'spirit'] as const;
export type Tendency = (typeof TENDENCIES)[number];

/** Exclusion mechanisms (thousand_doors.md 9.1). */
export const EXCLUSIVE_MODES = [
  'lock',
  'actLock',
  'forceClose',
  'freeze',
  'rack',
  'vanish',
] as const;
export type ExclusiveMode = (typeof EXCLUSIVE_MODES)[number];

export interface ExclusiveEntry {
  /** group code (X1 to X13 of thousand_doors.md 9.1) */
  group: string;
  /** what happens to this door when another door of the group opens */
  mode: ExclusiveMode;
  /** actLock: the act during which the lock applies */
  act?: number;
  /** actLock: the act from which the door returns to unseen (default act + 1) */
  until?: number;
  /**
   * a one-way group's source (X9, X12): opening this door sets the group off, another
   * member opening leaves it alone
   */
  source?: boolean;
}

/**
 * A key condition (thousand_doors.md 5.1, 21.2): sixteen primitives and four combinators.
 * Every key carries a short label for the corridor view (content text) and may name the
 * quest where it is found (`link`, the door card's "where to find", ux_and_onboarding.md
 * 9.3, 9.5), shown once the player knows that quest.
 */
export type KeyCond = KeyCondCore & { link?: string };

type KeyCondCore =
  /** a deed was granted (flag deed.<id>, written by the records system) */
  | { type: 'deed'; deed: string; label: string }
  /**
   * count events of a kind whose data fields equal `where` (and are at least `atLeast`),
   * for example combat.kill where { family: 'beast', killerSide: 'ally' }
   */
  | {
      type: 'count';
      event: string;
      where?: Record<string, FlagValue>;
      atLeast?: Record<string, number>;
      count: number;
      /**
       * add this numeric field of the event instead of one per event (a gather of three ore
       * counts three, catalog_doors.md 5.6 "采够二十份")
       */
      sum?: string;
      label: string;
    }
  /** a flag is truthy, equals a value, or (numbers) is at least `min` */
  | { type: 'flag'; key: string; equals?: FlagValue; min?: number; label: string }
  /** goddess trial wins (trial_wins.<goddess> >= min) or one trial won (trial_done.<trial>) */
  | { type: 'trial'; goddess?: string; trial?: string; min?: number; label: string }
  /** the player holds an item (optionally consumed when the door opens) */
  | { type: 'item'; itemId: string; count?: number; consume?: boolean; label: string }
  /** trust.<npc> >= min (a non-companion person); `*` reads anyone's trust */
  | { type: 'trust'; npc: string; min: number; label: string }
  /** a companion's bond (party state) has reached `min` */
  | { type: 'bond'; companion: string; min: number; label: string }
  /** one of the mentors taught this door (flag taught.<door>.<mentor>) */
  | { type: 'taught'; door: string; mentors: string[]; label: string }
  /** a choice flag holds a value */
  | { type: 'choice'; key: string; equals: FlagValue; label: string }
  /** the player has stood on a map, or inside one of its locations */
  | { type: 'visit'; mapId: string; location?: string; label: string }
  /** a dungeon was cleared (dg.<id>.cleared), to a depth (dg.<id>.depth) */
  | { type: 'dungeon'; dungeon: string; depth?: number; label: string }
  /** door rank (门阶) at least `min` */
  | { type: 'rank'; min: number; label: string }
  /** a reading or knowledge flag is set (read.<lb_id> and the like) */
  | { type: 'know'; key: string; label: string }
  /** a story-moment flag is set, and/or the act is at least `act` */
  | { type: 'time'; key?: string; act?: number; label: string }
  /** another door is open (to `tier` for a two-tier door) */
  | { type: 'door'; doorId: string; tier?: number; label: string }
  /** a condition in the reveal-ledger syntax */
  | { type: 'cond'; expr: string; label: string }
  /** every listed key */
  | { type: 'all'; of: KeyCond[]; label: string }
  /** at least `need` (default 1) of the listed keys */
  | { type: 'any'; of: KeyCond[]; need?: number; label: string }
  /** the listed keys in this order; one met out of order is void (5.1) */
  | { type: 'seq'; of: KeyCond[]; label: string }
  /**
   * the first key, or (once the person it leans on is absent, or `when` holds) one of the
   * substitutes after it (替钥, 5.4)
   */
  | { type: 'alt'; of: KeyCond[]; when?: string; label: string };

export type KeyType = KeyCond['type'];

/** Event kinds a count key may count (the doors system listens to exactly these). */
export const COUNTABLE_EVENTS = [
  'combat.kill',
  'combat.boss_defeated',
  'combat.presence_felt',
  'combat.player_returned',
  'combat.wave_cleared',
  'combat.level_up',
  'entity.died',
  'feat.performed',
  'item.used',
  'player.talked',
  'dialogue.option_chosen',
  'building.completed',
  'battle.ended',
  'world.map_changed',
  'door.opened',
  'feature.unlocked',
  // the craft doors' counts (catalog_doors.md 5.6: gather or make so many, PK-M1-49 emits them)
  'gather.done',
  'craft.done',
  // the granary door's history key: a companion healed back to standby (catalog_doors 5.5)
  'party.recovered',
] as const;

/** The sixteen primitives and four combinators a key may be (5.1). */
export const KEY_TYPES: readonly KeyType[] = [
  'deed',
  'count',
  'flag',
  'trial',
  'item',
  'trust',
  'bond',
  'taught',
  'choice',
  'visit',
  'dungeon',
  'rank',
  'know',
  'time',
  'door',
  'cond',
  'all',
  'any',
  'seq',
  'alt',
];

export type DoorEffect =
  | { type: 'abilities'; abilities: string[] }
  | { type: 'stats'; stats: StatBlock }
  /** a resource pool for the outsider (R-02); mana `base` is the level-1 size */
  | { type: 'pool'; resource: ResourceKind; base: number }
  | { type: 'passive'; aura: string }
  /** sets feature.<name> = true and emits feature.unlocked */
  | { type: 'feature'; feature: string }
  | { type: 'flag'; key: string; value: FlagValue }
  | { type: 'item'; itemId: string; count?: number; equip?: boolean }
  /**
   * opens another door as part of this one (thousand_doors.md 14, last line: the hearth
   * past life's cooking door, layer one, open from the start): that door's effects, its
   * flag and the opened state, with no rank value, no seal, no counts and no exclusion;
   * closing the giver leaves it open, as an item given stays
   */
  | { type: 'door'; doorId: string };

/** What opening a door costs the player at once (thousand_doors.md 6.2, 6.3; ux 9.3). */
export interface DoorOpenCost {
  /** blockage points (the act 1 abyss door: +10, 6.2) */
  blockage?: number;
  /** door fatigue points */
  fatigue?: number;
  /** only an opening in this act costs it (6.2: "第一幕握住澱核"); any act when absent */
  act?: number;
}

/**
 * The readers of door features that need numbers or places (PK-M1-56), one record in
 * data/doors/readers.json. Every reader stays silent while its `feature` flag is false.
 */
export interface DoorReaders {
  /** the abacus past life: the rough purchase-price band while trading (prologue 2.2) */
  priceBand?: { feature: string; spread: number };
  /** the nightlight past life: the sight radius at night, in tiles (prologue 2.2) */
  nightSight?: { feature: string; radius: number };
  /** the notes past life: a rumour names its teller and "may be distorted" (prologue 2.2) */
  rumorSource?: { feature: string };
  /**
   * the shapeshift door: purify a sediment spring (act1_borderstone.md 7.2), `amount` on the
   * variable `var`, once per value of `weekFlag`, while `when` holds, inside one of `places`
   */
  springPurify?: {
    feature: string;
    places: { mapId: string; location: string }[];
    var: string;
    amount: number;
    min?: number;
    weekFlag: string;
    when?: string;
  };
}

export interface DoorDef {
  id: string;
  name: string;
  /** canonical code from power_system.md 9.9 */
  code?: string;
  category: DoorCategory;
  /** 0 prologue, 1 to 6 acts, 7 finale */
  act: number;
  /** main corridor segment 1 to 7 (2.1) */
  segment: number;
  /** the wing the door opens in (2.2) */
  wing: WingId;
  /** the door stands in its segment's end hall (it shows when the segment grows) */
  hall?: boolean;
  /** a main-line door (the minimal route of 17.3) */
  main?: boolean;
  /** the prologue tendency whose crack shows this door at the start of act 1 (18.1) */
  tendency?: Tendency;
  /** the crack sentence (门缝句) shown while the keys are unknown */
  hint: string;
  /** what the door gives, shown once open */
  desc: string;
  keys: KeyCond[];
  /** any of these reveals the door (default: any key met or in progress) */
  reveal?: KeyCond[];
  effects: DoorEffect[];
  /** exclusion groups and what each does to this door (9.1) */
  exclusive?: ExclusiveEntry[];
  /** seal tier (6.4.1) */
  seal: SealTier;
  /** forbidden-door weight: +4 seal points, counts in danger_doors_opened (6.4) */
  forbidden?: boolean;
  /** danger band (catalog_doors.md 1.7, 6); the content validator requires it */
  dangerBand?: DoorDanger;
  /** blockage and fatigue the opening adds at once (shown as the door card's cost preview) */
  openCost?: DoorOpenCost;
  /** seal_unrest rule (6.4.4), default `default` */
  unrest?: UnrestRule;
  /** door-rank value 0, 1 or 2 (4.2) */
  rankValue: number;
  /** whether blockage can jam the door (6.2) */
  jam: 'combat' | 'never';
  closable: boolean;
  /** story doors open as soon as their keys are met */
  auto?: boolean;
  /** open by itself this many seconds after becoming openable (the door that opens on its own) */
  autoAfter?: number;
}

export type DoorStatus = 'hidden' | 'hinted' | 'openable' | 'opened' | 'locked' | 'closed';

export interface DoorRuntime {
  state: DoorStatus;
  /** tick the current state began */
  since: number;
  openedTick?: number;
  /** display strength of a hinted door: 1 crack, 2 glimpse, 3 full glimpse, 4 waypoint (3.2) */
  hintLevel?: number;
  /** actLock: the act from which the lock lifts and the door returns to unseen */
  lockedUntil?: number;
}

/** Door fatigue and the revival stacks (thousand_doors.md 6.3). */
export interface ReviveState {
  /** ticks of the player's returns through the door within the last game day */
  deaths: number[];
  /** overload stacks of the latest return (0 to 3) */
  stacks: number;
}

/** One hint the director gave (18.3), kept in a bounded log. */
export interface HintLogEntry {
  doorId: string;
  tick: number;
  channel: HintChannel;
  level: number;
}

/** tendency: the prologue's crack (18.1); dream: Janu's dream; rumor: a rumour of a site or mentor */
export type HintChannel = 'tendency' | 'dream' | 'rumor';

export interface HintState {
  /** calendar day of `today` */
  day: number;
  /** hints given on that game day (at most two) */
  today: number;
  log: HintLogEntry[];
  /** calendar day of the last dream (one a night) */
  dreamDay?: number;
  /** calendar day the drought last tried a rumour (one a day) */
  rumorDay?: number;
}

export interface DoorsSlice {
  doors: Record<string, DoorRuntime>;
  /** event counters keyed `${doorId}:${keyPath}`; sequence steps keyed `seq:${doorId}:${path}` */
  counters: Record<string, number>;
  /** `map:<id>` and `loc:<mapId>/<locationId>` the player has visited */
  visited: Record<string, true>;
  /** sum of the rank values of every door opened (4.3); absent in saves before PK-M1-14 */
  rankPoints?: number;
  /** door rank from the curve */
  rank?: number;
  /** seal looseness in half points (6.4.1), mirrored to the flags seal_points, seal_looseness */
  sealPoints?: number;
  /** reached seal stage (6.4.3), mirrored to the flag seal_stage */
  sealStage?: number;
  /** blockage in tenths (6.2), mirrored as a whole number to the flag blockage */
  blockage?: number;
  /** taint gained but not yet turned into blockage (4 taint is 1 blockage) */
  taintCarry?: number;
  /** door fatigue 0 to 100 (6.3), mirrored to the flag door_fatigue */
  fatigue?: number;
  /** tick up to which the fatigue decay was settled */
  fatigueAt?: number;
  revive?: ReviveState;
  hints?: HintState;
  /** live play ticks since the last door opened or became openable (the drought, 17.4) */
  drought?: number;
  lastOpenTick?: number;
  /**
   * what each opened door has given: `ability:<id>`, `feature:<name>`, `door:<id>` (written
   * at the opening and by the catch-up, cleared by the closing). The catch-up gives an
   * effect only while it is missing here (a save from before the door's data named it,
   * PK-M1-26's abyss summon), so each is given once and never again
   */
  granted?: Record<string, string[]>;
  /** the purified spring's last week, `<act>:<week>` (one purification a week, PK-M1-56) */
  purifiedWeek?: string;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    doors: DoorsSlice;
  }
  interface ContentMap {
    doors: DoorDef[];
    /** door rank thresholds: entry r - 1 is the rank-value sum that reaches rank r (4.3) */
    door_rank_curve?: { thresholds: number[] };
    /** numbers and places of the door feature readers (PK-M1-56) */
    door_readers?: DoorReaders;
  }
  interface EventMap {
    'doors.state': { doorId: string; from: DoorStatus; to: DoorStatus };
    'doors.closed': { doorId: string; sealDelta: number };
    /** the door rank crossed into a new value (4.3) */
    'doors.rank_up': { rank: number; from: number };
    /** the blockage tier changed (6.2) */
    'doors.blockage_tier': { tier: number; from: number };
    /** the hint director (or the prologue crack) showed a door (18) */
    'doors.hint': { doorId: string; channel: HintChannel; level: number; text: TextParam };
    /** the seal stage rose (6.4.3); for kernel subscribers and the goddess GM only */
    'seal.stage_up': { stage: number; from: number };
    /** the shapeshift door purified a spring (act1_borderstone.md 7.2) */
    'doors.purified': { mapId: string; location: string; var: string; from: number; to: number };
  }
  interface CommandMap {
    'doors.open': { doorId: string };
    'doors.close': { doorId: string };
    /** purify the spring the player stands at (the shapeshift door's reader) */
    'doors.purify': Record<string, never>;
  }
}
