// Data and state of the guild system (PK-M1-47): the adventurers' guild ranks and its cut
// (society.md 3), the commission boards and templates `cmm_` with their pay and experience
// coefficients (catalog_quests_acts1_3.md 2), and the dynamic event templates `ev_` with
// their triggers, omens, density and hooks (catalog 3; quests_and_events.md 3.8). The
// numbers live in data/guild/; this file only names the shapes and the closed sets.

import type { ModifierTarget } from '../modifiers';
import type { Effect, KeyKind } from '../quests/effect_types';
import type { Clue, WeekWindow } from '../quests/types';

/** Guild ranks F to S, lowest first (society.md 3.1); data and flags spell them lowercase. */
export const GUILD_RANKS = ['f', 'e', 'd', 'c', 'b', 'a', 's'] as const;
export type GuildRank = (typeof GUILD_RANKS)[number];

/** Commission ranks F to A (catalog 2.2 `rank`). */
export const COMMISSION_RANKS: readonly GuildRank[] = ['f', 'e', 'd', 'c', 'b', 'a'];

/**
 * Commission kinds, the closed set of catalog 2.2 `kind`: subjugate 讨伐, clear 清理, find
 * 寻物, escort 护送, gather 采集, investigate 调查, deliver 送信, watch 守夜, hunt 狩猎,
 * drive 驱赶, challenge 挑战, rubbing 拓印, copy 抄录, plant 植种, appraise 鉴定.
 */
export const COMMISSION_KINDS = [
  'subjugate',
  'clear',
  'find',
  'escort',
  'gather',
  'investigate',
  'deliver',
  'watch',
  'hunt',
  'drive',
  'challenge',
  'rubbing',
  'copy',
  'plant',
  'appraise',
] as const;
export type CommissionKind = (typeof COMMISSION_KINDS)[number];

/** Distance bands of the pay formula (catalog 2.3): town, half a day, a day or more, the wilds. */
export const DISTANCE_BANDS = ['town', 'half_day', 'day', 'wild'] as const;
export type DistanceBand = (typeof DISTANCE_BANDS)[number];

/**
 * What an instance asks of the player, in the quest model's objective vocabulary
 * (instance.ts builds the stages): kill targets, bring items to the giver, carry word to a
 * person, find something at the place and bring it back to the giver, investigate a set of
 * clues, or hold the place for some hours. Escort waits for people who follow the player
 * (PK-M1-18).
 */
export const GOAL_TYPES = ['kill', 'deliver', 'talk', 'find', 'investigate', 'watch'] as const;
export type GoalType = (typeof GOAL_TYPES)[number];

/** Number of objective labels (stages) each goal type has. */
export const GOAL_STEPS: Readonly<Record<GoalType, number>> = {
  kill: 1,
  deliver: 1,
  talk: 1,
  find: 2,
  investigate: 1,
  watch: 3,
};

/** Goal types each kind may use. */
export const KIND_GOALS: Readonly<Record<CommissionKind, readonly GoalType[]>> = {
  subjugate: ['kill'],
  clear: ['kill'],
  hunt: ['kill'],
  drive: ['kill'],
  challenge: ['kill'],
  watch: ['watch'],
  gather: ['deliver'],
  plant: ['deliver'],
  deliver: ['talk', 'deliver'],
  copy: ['talk', 'deliver'],
  rubbing: ['find'],
  find: ['find'],
  investigate: ['investigate'],
  appraise: ['deliver'],
  escort: [],
};

export type CommissionGoal =
  /** defeat `count` of one of the targets (monster ids); on the place's map when `onMap` */
  | { type: 'kill'; targets: string[]; count: [number, number]; onMap?: boolean }
  /** bring `count` of one of the items to the person who posted it */
  | { type: 'deliver'; items: string[]; count: [number, number] }
  /** carry word or a letter to one of these people */
  | { type: 'talk'; to: string[] }
  /** reach the place, then report back to the person who posted it */
  | { type: 'find' }
  /** enough clues found (each a world fact) */
  | { type: 'investigate'; clues: Clue[]; need?: number }
  /** reach the post, keep the watch for `hours`, and stand at the post again when it ends */
  | { type: 'watch'; hours: number };

/** A modifier a commission or an event registers (modifiers system, D-013), lasting `days`. */
export interface ModifierWrite {
  target: ModifierTarget;
  key: string;
  factor?: number;
  add?: number;
  days: number;
  visibility?: 'public' | 'hidden';
}

/** Modifier channels (the modifiers system's targets). */
export const MODIFIER_TARGETS = [
  'price',
  'harvest',
  'production',
  'monster',
  'faith',
  'morale',
  'sediment',
  'xp',
  'travel',
] as const satisfies readonly ModifierTarget[];

export interface PlaceRef {
  mapId: string;
  location?: string;
}

/** A commission template `cmm_` (catalog 2.2). */
export interface CommissionDef {
  id: string;
  rank: GuildRank;
  kind: CommissionKind;
  title: string;
  desc: string;
  /** one label per stage of the goal type (GOAL_STEPS) */
  labels: string[];
  /** what the client says about the risk ("委托人称"), shown apart from the system's facts */
  claims?: string[];
  boards: string[];
  acts: number[];
  /** the commission level: the median level of its targets or of its place (catalog 2.4) */
  level: number;
  distance: DistanceBand;
  /** who posts it (persons); empty: the board's publisher, no named client */
  givers?: string[];
  places: PlaceRef[];
  /** days to finish once taken, a range the instance draws from */
  days: [number, number];
  goal: CommissionGoal;
  /** posting condition (reveal-ledger syntax) */
  when?: string;
  /** posting window in act weeks of the current act */
  weekWindow?: WeekWindow;
  /** days after a posting of this template comes down before it may post again */
  cooldownDays?: number;
  /** total completions after which it no longer posts */
  limit?: number;
  weight?: number;
  /** subjugation merit points the guild records on completion (society.md 3.1) */
  merit?: number;
  /** world writes on completion: flag, add, append and line effects only */
  writes?: Effect[];
  modifiers?: ModifierWrite[];
  /** a pre-registered key slot: completion grants this key event (catalog 2.2 `keySlot`) */
  keySlot?: { doorId: string; keyKind: KeyKind; keyId: string };
  /**
   * The template's first instance is part of this quest (A1-M04 holds the first cellar, herb
   * and letter commissions): the template does not post while that quest is open, and when
   * the quest is done the guild records one completed instance of it (no pay, no experience:
   * the quest pays).
   */
  firstIn?: string;
}

/** A board where commissions are posted (catalog 2.1). */
export interface BoardDef {
  id: string;
  name: string;
  mapId: string;
  location?: string;
  /** the clerk commissions are turned in to; absent on a notice board (paid on the spot) */
  receptionist?: string;
  acts: number[];
  /** commission ranks the board posts */
  ranks: GuildRank[];
  /**
   * How far above the taker's own rank (or their party leader's) a posting may be; null:
   * anyone may take anything (a notice board).
   */
  reach: number | null;
  /**
   * The highest rank any registered member may take here alone, whatever their own rank
   * (the borderstone branch serves F and E: catalog 2.1); higher postings need the rank or
   * an adventurer of the guild of that rank leading the party.
   */
  lone?: GuildRank;
  /** postings up at once (catalog 2.2 `density`) */
  cap: number;
  /** postings the board is topped up to at each week start, a range (progression 3.1.5) */
  refill: [number, number];
  /** weeks an untaken posting stays up */
  postWeeks: number;
  /** the guild takes its cut from the client (guild boards, not the magistrate's writs) */
  cut: boolean;
}

/** A guild rank and what promotion into it needs (society.md 3.1, 3.2). */
export interface RankDef {
  id: GuildRank;
  /** the level the card must read (0: none) */
  level: number;
  /** completed commissions of a rank */
  commissions?: { rank: GuildRank; count: number };
  /** no default on record */
  clean?: boolean;
  /** subjugation merit points */
  merit?: number;
  /** the examination it needs (branch, region, hq, council); none: promotion is automatic */
  exam?: string;
}

/** Pay and experience row of one commission rank (catalog 2.3, 2.4; society.md 3.3). */
export interface RankPay {
  /** base pay in copper */
  base: number;
  /** the society.md 3.3 band the pay is clamped into */
  min: number;
  max: number;
  /** the rank's median target level (difficulty reference) */
  median: number;
  /** experience coefficient */
  xp: number;
}

/** A difficulty band: target level minus the rank median up to `upTo` (none: above). */
export interface DifficultyBand {
  upTo?: number;
  factor: number;
}

export interface GuildConfig {
  ranks: RankDef[];
  pay: Partial<Record<GuildRank, RankPay>>;
  kinds: Record<CommissionKind, { pay: number; xp: number }>;
  difficulty: DifficultyBand[];
  distance: Record<DistanceBand, number>;
  /** experience multiplier by completions of a template earlier in the same week */
  decay: number[];
  /** pay and experience round to this many */
  round: number;
  /** the guild's cut, paid by the client on top (society.md 3.3) */
  cut: number;
  /** the default penalty as a share of the pay (society.md 3.3) */
  penalty: number;
  /** pay multiplier of an urgent posting (catalog 5.6) */
  urgent: number;
  /** commissions held at once (ux_and_onboarding.md 6.3.7) */
  maxAccepted: number;
  registration: {
    /** registration fee in copper (society.md 3.4) */
    fee: number;
    /** the level the crystal writes on the player's card: no page, so it never reads more */
    cardLevel: number;
    /** registration by the story: once this holds the guild registers the player */
    when?: string;
  };
  /** adventurers of the guild who may lead the player's party, with their ranks */
  adventurers: { id: string; rank: GuildRank }[];
  /** weeks a closed instance is kept (its quest record and posting) */
  keepWeeks: number;
  events: EventRules;
}

/** Density and arbitration of the dynamic events (catalog 3.2; quests_and_events.md 2.2). */
export interface EventRules {
  /** severe events running at once in one settlement */
  severeCap: number;
  /** days between the starts of two severe events in one settlement */
  severeGapDays: number;
  /** days between two monster tides in one region */
  tideCooldownDays: number;
  /** least omen lead of a tide or a disaster, days */
  omenMinDays: number;
  /** the first act in which a goddess may lead a tide to the player */
  goddessTideFromAct: number;
  /** days a deferred event waits before it is dropped */
  deferDays: number;
  /** landed occurrences kept in the log */
  logKeep: number;
}

/**
 * Event categories (catalog 3.1, 5.7): tide 魔物潮, omen 灾害前兆, sky 天象, divine 女神干预,
 * caravan 商队, weather 天气, disaster 灾害, plague 疫病, rumor 传闻, settlement 聚落, search
 * 逮捕与搜查, find 寻物, gather 稀有采集, surge 澱涌, coincidence 巧合, respite 喘息.
 */
export const EVENT_CATEGORIES = [
  'tide',
  'omen',
  'sky',
  'divine',
  'caravan',
  'weather',
  'disaster',
  'plague',
  'rumor',
  'settlement',
  'search',
  'find',
  'gather',
  'surge',
  'coincidence',
  'respite',
] as const;
export type EventCategory = (typeof EVENT_CATEGORIES)[number];

/** Categories that must announce themselves days ahead (catalog 3.2 预兆). */
export const OMEN_CATEGORIES: readonly EventCategory[] = ['tide', 'disaster'];
/** Categories that need a precursor event first (AI architecture 5.8 NEEDS_PRECURSOR). */
export const PRECURSOR_CATEGORIES: readonly EventCategory[] = ['search'];

/** Where an event comes from (quests_and_events.md 3.8 `source`). */
export const EVENT_SOURCES = [
  'world',
  'settlement',
  'npc',
  'economy',
  'goddess',
  'director',
  'cognition',
  'gather',
  'dungeon',
] as const;
export type EventSource = (typeof EVENT_SOURCES)[number];

export const SEVERITIES = ['minor', 'moderate', 'severe', 'crisis'] as const;
export type Severity = (typeof SEVERITIES)[number];
/** Severities that take a density slot of their settlement (catalog 3.2). */
export const SEVERE: readonly Severity[] = ['severe', 'crisis'];

/** The cognition engine's comedy bits an event may be throttled by (reputation_and_cognition.md 10). */
export const COMEDY_BITS = ['crystal', 'refute', 'misattribute', 'light'] as const;

/** A rumor an event seeds through the cognition engine (reputation_and_cognition.md 4). */
export interface EventRumor {
  /** the feat topic the rumor voice describes */
  topic: string;
  /** where it happened, as townsfolk say it */
  place: string;
  /** what everyone remembers (up to four) */
  details: string[];
  /** the first people who hold it and pass it on */
  tellers: string[];
  /** the feat tier: hotter rumors spread further */
  tier?: number;
}

/** A dynamic event template `ev_` (quests_and_events.md 3.8; catalog 3, 5.7). */
export interface DynamicEventDef {
  id: string;
  category: EventCategory;
  source: EventSource;
  title: string;
  /** one narration line when it lands (the director speaks its own) */
  narration?: string;
  acts: number[];
  /** where it lands; the first is the settlement its density counts in (none: anywhere) */
  maps: string[];
  severity: Severity;
  /** trigger condition */
  when?: string;
  /** daily probability while `when` holds (none: it happens as soon as `when` holds) */
  chance?: number;
  /** only on this day of the week (1 to 7) */
  weekday?: number;
  /** at most once ever */
  once?: boolean;
  /** days after a landing before it may trigger again */
  cooldownDays?: number;
  /** held while this holds (a dispute node's window, quests_and_events.md 2.2 rule 2) */
  yieldWhile?: string;
  /** announced `days` ahead: the omen effects apply at once, the event lands later */
  omen?: { days: number; effects?: Effect[] };
  /** another event that must have landed first, within `withinDays` when given */
  precursor?: { event: string; withinDays?: number };
  /** days it stays active after landing (none: a moment) */
  days?: number;
  effects?: Effect[];
  modifiers?: ModifierWrite[];
  /** default settlement when an active event runs out */
  end?: Effect[];
  hooks?: {
    /** commission templates posted at once as emergencies on the boards that carry them */
    post?: string[];
    /** commission templates paid as urgent while it is active */
    urgent?: string[];
    /** extra postings at each refill of the boards on its maps while it is active */
    board?: { bonus: number; kinds?: CommissionKind[] };
  };
  rumor?: EventRumor;
  /** the comedy bit: one per settlement and day (cognition's comedy gate) */
  comedy?: (typeof COMEDY_BITS)[number];
  /** offered to the narrative director as a menu item of this move instead of triggering itself */
  director?: {
    move: 'coincidence' | 'respite';
    power: number;
    cooldownHours: number;
    weight?: number;
  };
}

// ---------------------------------------------------------------------------
// State

/** Life of a posting: up on the board, taken, then closed one way or another. */
export type PostingState = 'posted' | 'accepted' | 'done' | 'failed' | 'expired' | 'withdrawn';

/** A commission instance on a board (GC-F-001). */
export interface Posting {
  /** quest id of the instance (gc_f_001) */
  id: string;
  /** display number GC-F-001 (quests_and_events.md 3.9) */
  display: string;
  template: string;
  board: string;
  rank: GuildRank;
  giver: string | null;
  place: PlaceRef;
  /** the drawn goal parameters */
  target?: string;
  item?: string;
  count?: number;
  recipient?: string;
  days: number;
  /** pay to the adventurer, copper */
  reward: number;
  /** the guild's cut, copper, paid by the client */
  cut: number;
  urgent: boolean;
  emergency: boolean;
  postedDay: number;
  /** the last day it stays up untaken */
  untilDay: number;
  state: PostingState;
  acceptedDay?: number;
  /** the last day to finish it */
  deadline?: number;
  /** the day it closed (done, failed, expired, withdrawn) */
  closedDay?: number;
  /**
   * A resident's own request (quests_and_events.md 6.2 step 3, PK-M1-19): the giver pays
   * the reward out of their own purse and the guild takes no cut.
   */
  personal?: boolean;
}

/** One change of the player's rank. */
export interface RankChange {
  tick: number;
  rank: GuildRank;
  how: 'register' | 'auto' | 'exam' | 'practical' | 'story';
}

/** The player's record with the guild (the flag guild_rank stays the one truth of the rank). */
export interface MemberRecord {
  /** the rank the guild last recorded (it follows the flag when someone else writes it) */
  rank: GuildRank;
  registeredTick: number;
  /** completed commissions by commission rank */
  done: Partial<Record<GuildRank, number>>;
  defaults: number;
  merit: number;
  history: RankChange[];
}

export interface PendingEvent {
  template: string;
  mapId: string;
  /** day the omen went out (or the trigger fired) */
  omenDay: number;
  /** the day it lands (an announced event) or was first due (a deferred one) */
  landDay: number;
  /** the first tick it may land: an omen's whole days after the announcement */
  landTick: number;
  /** announced by an omen: its slot is reserved and it always arrives */
  announced: boolean;
}

export interface ActiveEvent {
  template: string;
  mapId: string;
  startDay: number;
  /** the day it ends */
  untilDay: number;
}

export interface EventLogEntry {
  template: string;
  mapId: string;
  day: number;
  tick: number;
  severity: Severity;
  category: EventCategory;
  /** day of its omen (or trigger), when it had one */
  omenDay?: number;
  comedy?: string;
  via: 'kernel' | 'director';
}

export interface EventsState {
  pending: PendingEvent[];
  active: ActiveEvent[];
  log: EventLogEntry[];
  /** day of the last landing, by template */
  last: Record<string, number>;
  /** landings, by template */
  count: Record<string, number>;
  /** day of the last tide landing, by region */
  tide: Record<string, number>;
  /** day of the last severe landing, by settlement (map) */
  severe: Record<string, number>;
  /** the last day the chance rolls ran (-1 before any) */
  rolled: number;
  /** triggered events that never landed (deferred too long), by template */
  dropped: Record<string, number>;
}

export interface BoardState {
  /** the calendar week the board was last topped up (-1 before any) */
  week: number;
  open: boolean;
}

export interface GuildSlice {
  member: MemberRecord | null;
  boards: Record<string, BoardState>;
  postings: Record<string, Posting>;
  /** the next posting number, by rank */
  serial: Partial<Record<GuildRank, number>>;
  /** the calendar week whose counts are current (-1 before any) */
  week: number;
  /** completions of each template in the current week (mirrors cmm_count.<template>) */
  weekly: Record<string, number>;
  /** completions of each template ever (the template's `limit`) */
  total: Record<string, number>;
  /** day a template may post again, after its cooldown */
  cooldown: Record<string, number>;
  /** templates whose first instance a quest already settled (firstIn) */
  firstDone: string[];
  /** the guild's books: cut collected and pay handed out, copper */
  ledger: { cut: number; paid: number };
  events: EventsState;
  /** something it reads changed: settle registration and promotion on the next tick */
  dirty: boolean;
}
