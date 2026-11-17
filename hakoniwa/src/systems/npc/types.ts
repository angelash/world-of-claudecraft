// NPC system types: persona cards, schedules, needs, tiers (D-009), memory and
// relations, plus the module augmentation that registers the slice, content tables,
// events and commands. See docs/40_design/systems/npc_society_ai.md.

import type { BtRunnerState } from '../../core/brain/bt';
import type { TextParam } from '../../core/text';
import type { Appearance } from '../world/types';

/** The seven everyday activities a resident can be doing. */
export type Activity = 'work' | 'eat' | 'sleep' | 'pray' | 'chat' | 'shop' | 'wander';

export const ACTIVITIES: readonly Activity[] = [
  'work',
  'eat',
  'sleep',
  'pray',
  'chat',
  'shop',
  'wander',
];

/** Social class (society.md 8.2) that sets the common-sense ceiling and explanation order. */
export type SocialClass =
  | 'peasant'
  | 'artisan'
  | 'adventurer'
  | 'knight'
  | 'merchant'
  | 'clergy'
  | 'scholar'
  | 'noble'
  | 'royal'
  | 'remnant'
  | 'child'
  | 'beastkin';

export type KnowledgeTier = 'K0' | 'K1' | 'K2' | 'K3' | 'K4' | 'K5';

/** Functional roles (content_bible.md 9.2, a closed set; builtin_ai.md 4.2 and 4.3). */
export const FUNCTIONAL_ROLES = [
  'giver',
  'vendor',
  'crafter',
  'trainer',
  'healer',
  'info',
  'rumor',
  'recruit',
  'officer',
  'general',
  'witness',
  'keyholder',
  'rival',
  'patron',
  'cleric',
] as const;
export type FunctionalRole = (typeof FUNCTIONAL_ROLES)[number];

/**
 * A long-term goal's pursuit table (builtin_ai.md 3.2): a segment the brain inserts into
 * the day, at most every `everyDays` days, while the goal is neither done nor abandoned.
 */
export interface GoalPursuit {
  /** stable id of the pursuit (one per goal) */
  id: string;
  /** schedule place reference ('@church', a location id, '<map>:<place>') */
  at: string;
  act: Activity;
  /** earliest hour of the segment and its length in game hours */
  from: number;
  hours: number;
  /** cadence: at most once every this many game days */
  everyDays: number;
  /** reveal-ledger condition that makes the pursuit more pressing (a bonus while it holds) */
  urge?: string;
  /** completion predicate (reveal-ledger syntax; registered variables only) */
  done?: string;
  /** abandon predicate */
  abandon?: string;
}

/** NPC reasoning tier (D-009): 1 core, 2 present, 3 offstage batch, 4 rule crowd. */
export type Tier = 1 | 2 | 3 | 4;

/** How a spreader reshapes a rumor when retelling it (act1_borderstone.md 6.1). */
export type Spin =
  | 'plain'
  | 'cute'
  | 'x5'
  | 'fear'
  | 'ghost'
  | 'flatten'
  | 'self_credit'
  | 'deflect'
  | 'detail'
  | 'price'
  | 'light';

export interface ScheduleSegment {
  /** start hour 0..23 */
  from: number;
  /** end hour 1..24; smaller than from wraps past midnight */
  to: number;
  /**
   * location id on the persona's map, '@home', '@work', '@<location kind>', or a place on
   * another map as '<map>:<location id or @kind>' (cross-map schedules, places.ts)
   */
  at: string;
  act: Activity;
  /** short display note (content text, or a text key for rule and need notes) */
  note?: TextParam;
}

export interface ScheduleTemplate {
  id: string;
  name: string;
  segments: ScheduleSegment[];
}

/** Weights of each need (1 = normal, 0 = does not care, up to 2). */
export interface NeedWeights {
  hunger?: number;
  energy?: number;
  social?: number;
  faith?: number;
  money?: number;
  safety?: number;
  face?: number;
  duty?: number;
  peace?: number;
}

export interface VoiceSpec {
  /** tone rules for the model and the rule templates */
  rules: string[];
  catchphrases: string[];
  /** how this person first addresses the player, for example 这位旅人 */
  address: string;
  /** things this person never says or does (hard constraints) */
  never?: string[];
}

export interface RelationDims {
  /** 0..100 */
  trust: number;
  /** -100..100 */
  like: number;
  /** 0..100 */
  awe: number;
  /** -100..100 */
  interest: number;
  /** -100..100 */
  align: number;
}

/** Persona card (npc_society_ai.md 2.1), the subset the first playable needs. */
export interface PersonaCard {
  id: string;
  name: string;
  race: string;
  gender?: 'm' | 'f';
  age: number;
  job: string;
  /** record level (铭录等级) */
  level: number;
  faction: string;
  class: SocialClass;
  /** personality keywords */
  traits: string[];
  /** one-line public introduction */
  intro: string;
  goals: string[];
  /** private, never shown to the player and never spoken */
  secrets: string[];
  knowledge: KnowledgeTier;
  /** extra facts this person may speak about (already ledger-safe) */
  knowledgeNotes?: string[];
  /** initial trust toward the player, 0..100 (50 neutral) */
  attitude: number;
  map: string;
  home: string;
  work: string;
  /** schedule template id or an explicit list of segments */
  schedule: string | ScheduleSegment[];
  needs?: NeedWeights;
  voice: VoiceSpec;
  appearance: Appearance;
  /** identity tags written on the entity: merchant, priest, guard, ... */
  tags: string[];
  /** written L1 while on the current stage (characters.md AI tier) */
  core?: boolean;
  /** story relevance 0..1 for the tier score */
  plot?: number;
  /** acts (act flag values) in which plot counts; default: the home map's storyActs */
  acts?: string[];
  /** hidden potential, only readable through the talent door */
  potential?: string;
  goddess?: string;
  /** devotion 0..1 */
  devotion?: number;
  /** starting money in copper */
  money?: number;
  /** wage per working hour in copper */
  wage?: number;
  personality?: 'curious' | 'normal' | 'stubborn';
  /** common-sense ceiling override in apparent levels (default from the social class) */
  ceiling?: number;
  /** old-order dependence 0..1 (rebound to hostility) */
  oldOrder?: number;
  /** social pressure sensitivity 0..1 */
  pressure?: number;
  /** how this person retells rumors */
  spin?: Spin;
  /** spreading tendency (1 normal, 2 bards and halflings, 0.2 secret keepers) */
  spread?: number;
  /** how much others believe what this person says, 0..1 */
  reliability?: number;
  /** local fame 0..1; famous strong people attract misattributed deeds */
  fame?: number;
  /** keeps their aura hidden (Martha) */
  concealed?: boolean;
  /** relation seeds toward other persona ids */
  relations?: Record<string, Partial<RelationDims>>;
  /** stance on disputes, -1..1 */
  stances?: Record<string, number>;
  /** spawn only when every listed flag is truthy */
  requiresFlags?: string[];
  /** hide while any listed condition holds: 'flag' (truthy) or 'flag=value' */
  hideWhen?: string[];
  /** world flag mirroring trust toward the player (reveal ledger 0.4); default trust.<id> */
  trustKey?: string;
  /** persona-specific line overrides keyed by dialogue template id */
  lines?: Record<string, string[]>;
  /** functional roles, 1 to 3, in priority order (content_bible.md 9.2) */
  roles?: FunctionalRole[];
  /** pursuit tables of the long-term goals (builtin_ai.md 3.2) */
  pursuits?: GoalPursuit[];
  /** item tags this person likes and dislikes as gifts (builtin_ai.md 5.5) */
  likes?: string[];
  dislikes?: string[];
}

/** Template for nameless L4 residents generated at world creation. */
export interface ResidentTemplate {
  id: string;
  map: string;
  /** display name, a job title (L4 residents are not given personal names) */
  name: string;
  count: number;
  homes: string[];
  works: string[];
  schedule: string;
  class: SocialClass;
  race: string;
  level: [number, number];
  tags: string[];
  faction: string;
  palette: string[][];
  base?: string;
}

/** A world fact a persona may speak about, gated by knowledge tier and flags. */
export interface KnowledgeEntry {
  id: string;
  tier: KnowledgeTier;
  text: string;
  /** limit to these maps (persona.map) */
  maps?: string[];
  /** limit to these factions */
  factions?: string[];
  requiresFlags?: string[];
}

export type MemorySource = 'seen' | 'heard' | 'inferred' | 'self';

export interface MemoryEntry {
  tick: number;
  day: number;
  text: TextParam;
  /** the short phrase the {memory} fill slot uses (builtin_ai.md 5.3) */
  short?: TextParam;
  src: MemorySource;
  /** credibility 0..1 */
  cred: number;
  /** subject: 'player', a persona id or an entity id */
  about?: string;
  /** importance 0..1 */
  imp: number;
  tag?: string;
}

export interface RelationRecord {
  tick: number;
  to: string;
  delta: Partial<RelationDims>;
  reason: TextParam;
}

export interface Mind {
  mem: MemoryEntry[];
  /** how many memories were folded away by consolidation */
  folded: number;
  /** one line per folded day */
  digest: TextParam[];
  rel: Record<string, RelationDims>;
  /** baseline relations the daily decay returns to */
  base: Record<string, RelationDims>;
  relLog: RelationRecord[];
}

export interface PlanState {
  day: number;
  slots: ScheduleSegment[];
  source: 'rule' | 'ai' | 'fallback' | 'script';
  goal?: TextParam;
  note?: TextParam;
}

/** Things the NPC did today, the raw material of the batch diary. */
export interface TrackItem {
  hour: number;
  kind: DiaryKind;
  /** the place as seen from the persona's map (places.ts placeRef) */
  loc: string;
  /** the other party's display name */
  with?: string;
  /** the other party's id (a persona id, or 'player'), for the diary's salience */
  withId?: string;
}

/** Closed vocabulary of diary events (ai_architecture.md 4.5) plus routine work and chat. */
export type DiaryKind =
  | 'trade'
  | 'quarrel'
  | 'gossip'
  | 'help'
  | 'pray'
  | 'work_issue'
  | 'meet'
  | 'injury'
  | 'leave'
  | 'work'
  | 'chat';

export const DIARY_KINDS: readonly DiaryKind[] = [
  'trade',
  'quarrel',
  'gossip',
  'help',
  'pray',
  'work_issue',
  'meet',
  'injury',
  'leave',
  'work',
  'chat',
];

/**
 * The nine needs (builtin_ai.md 3.3), 0..100, lower is more pressing. `money` is computed
 * from savings each hour; `safety`, `face` and `peace` move on events and drift back to a
 * baseline; `duty` falls while owed work is left undone. Worlds saved before the nine have
 * only the first four: ensureNeeds fills the rest.
 */
export interface Needs {
  hunger: number;
  energy: number;
  social: number;
  faith: number;
  money: number;
  safety: number;
  face: number;
  duty: number;
  peace: number;
}

export const NEED_KEYS = [
  'hunger',
  'energy',
  'social',
  'faith',
  'money',
  'safety',
  'face',
  'duty',
  'peace',
] as const;
export type NeedKey = (typeof NEED_KEYS)[number];

export type GoneReason = 'recruited' | 'dead' | 'hidden' | 'absent' | 'captured';

/** The root layers of an NPC brain, highest first (builtin_ai.md 2.4 and 4.3). */
export type BrainLayer =
  | 'script'
  | 'talk'
  | 'emergency'
  | 'dispute'
  | 'duty'
  | 'need'
  | 'goal'
  | 'initiative'
  | 'social'
  | 'schedule';

/** Why an NPC walks up to the player (builtin_ai.md 3.4). */
export type ApproachReason =
  | 'commission'
  | 'confirm_rumor'
  | 'thanks'
  | 'worship'
  | 'warning'
  | 'acquaintance';

/** The brain's own saved state of one named NPC (builtin_ai.md 18: only what cannot be recomputed). */
export interface NpcBrainState {
  /** the root layer that decided last */
  layer: BrainLayer;
  /** the brain action being executed (inertia, builtin_ai 2.1) */
  current: string;
  /** need layer latched: a need fell under 35; released once all are back at 45 */
  needLatch: boolean;
  /** the emergency layer holds until this tick (30 game minutes past the threat) */
  emergencyUntil: number;
  /** brain action id to the tick it was last chosen (cooldowns) */
  used: Record<string, number>;
  /** behavior-tree runner state per functional role (survives save and load) */
  bt: Record<string, BtRunnerState>;
  /** goal pursuit id to the game day it was last pursued */
  pursued: Record<string, number>;
  /** proactive approaches (builtin_ai 3.4 limits) */
  approach: {
    /** the game day of the last approach */
    day: number;
    /** the player walked away twice in a row: no approach in this game week */
    stopWeek: number;
    /** approaches the player walked away from in a row */
    ignored: number;
    /** an approach under way: walking up, or waiting for the player to answer */
    pending: { tick: number; reason: ApproachReason; spoke: boolean } | null;
    /** reasons used up for good (a thanks is said once per deed) */
    spent: string[];
  };
  /** a line kept for the next conversation (a cognition transition seen offscreen) */
  opener: { slot: string; params: Record<string, TextParam>; until: number } | null;
  /** recent happenings the mood reads: threat, pressure, insulted, harmed, gift, helped, saved, mourning */
  recent: Record<string, number>;
  /** whoever offended this person last ('player' when the angry mood is the player's doing) */
  offender: string;
  /** today's hours and how many of them left the template (alive metric 2), and yesterday's */
  dayLog: {
    day: number;
    hours: number;
    off: number;
    /** executed segments (runs of hours with one activity and place) and those off the template */
    segs?: number;
    offSegs?: number;
    /** the running segment's key (activity, place, off) */
    run?: string;
    last?: { day: number; hours: number; off: number; segs: number; offSegs: number };
  };
  /** bark context to the tick it was last barked (one per context per 2 game hours) */
  barked: Record<string, number>;
  /** the last quarrel, for reconciliation within 3 game days */
  quarrel: { with: string; tick: number } | null;
  /** the tick a reaction line was last spoken (a transition voiced in view is not kept) */
  spokeTick: number;
  /** a death that sends this person's soul to the spring until this game day (registry npc.<id>.at_spring) */
  springUntil?: number;
}

/** An NPC walking with the player (escort, rescue, accompany objectives). */
export interface FollowOrder {
  until: number;
  /** tiles kept from the player at most */
  range: number;
  /** released when this quest is no longer active (and off this stage, when set) */
  questId?: string;
  stage?: string;
}

/** A cross-map errand under way on foot: walking to the exit toward the next map. */
export interface Transit {
  /** the final destination */
  mapId: string;
  locId: string;
  /** the exit on the current map being walked to */
  exitId: string;
  /** the tick the walk to that exit began (a walk stuck past an hour is snapped) */
  since?: number;
}

/** A place where watchers look out for the sneaking player (stealth objectives). */
export interface WatchZone {
  mapId: string;
  location?: string;
  questId?: string;
  /** released once the quest leaves this stage */
  stage?: string;
  /** the player was already seen on this visit (cleared when the player leaves the map) */
  spotted: boolean;
}

export interface NpcState {
  id: string;
  entityId: string;
  mapId: string;
  resident: boolean;
  tier: Tier;
  activity: Activity;
  locId: string;
  note?: TextParam;
  needs: Needs;
  plan: PlanState | null;
  planRev: number;
  sayRev: number;
  /** schedule frozen until this tick (player conversation) */
  freezeUntil: number;
  talking: boolean;
  /** script override until this tick */
  override: { until: number; at: string; act: Activity } | null;
  gone: GoneReason | null;
  /** copper earned since the last settlement */
  earned: number;
  /** copper spent since the last settlement, by payee entity id ('' for none) */
  spent: Record<string, number>;
  track: TrackItem[];
  lastChatTick: number;
  lastSayTick: number;
  /** recent heat for the tier score (decays daily) */
  heat: number;
  diary: { day: number; kind: DiaryKind; text: TextParam; mood?: string }[];
  /** the brain of a named NPC (absent on residents, and on worlds saved before it) */
  brain?: NpcBrainState;
  /** walking with the player */
  follow?: FollowOrder | null;
  /** crossing maps on foot */
  transit?: Transit | null;
}

/** Generated L4 resident card (kept in the slice because it comes from the world seed). */
export interface ResidentCard {
  id: string;
  name: string;
  map: string;
  home: string;
  work: string;
  schedule: string;
  class: SocialClass;
  race: string;
  level: number;
  tags: string[];
  faction: string;
  appearance: Appearance;
}

export interface DiaryRound {
  rev: number;
  day: number;
  roster: string[];
  /** track kinds per roster member; proposals may only pick from these */
  tracks: Record<string, DiaryKind[]>;
  done: boolean;
}

export interface NpcSlice {
  npcs: Record<string, NpcState>;
  minds: Record<string, Mind>;
  residents: Record<string, ResidentCard>;
  /** batch diary revision, roster and the day's track kinds per map */
  diary: Record<string, DiaryRound>;
  playerMap: string;
  /** stealth watch zones (absent on worlds saved before them) */
  watch?: WatchZone[];
  /** proactive approaches on the player's map in one game hour (the per-screen cap) */
  approaches?: { hour: number; count: number };
}

export interface PlanSlotData {
  from: number;
  to: number;
  at: string;
  act: Activity;
  note?: TextParam;
}

export interface DiaryEntryData {
  npcId: string;
  kind: DiaryKind;
  /** the model's line, or a rule diary text key */
  text: TextParam;
  /** the day's mood (builtin_ai.md 5.4: the rule diary ends with a mood line) */
  mood?: string;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    npc: NpcSlice;
  }
  interface ContentMap {
    npcs: PersonaCard[];
    npcSchedules: ScheduleTemplate[];
    npcResidents: ResidentTemplate[];
    npcKnowledge: KnowledgeEntry[];
  }
  interface EventMap {
    /** An NPC started a new activity (emitted for NPCs on the player's map). */
    'npc.activity': {
      npcId: string;
      entityId: string;
      activity: Activity;
      locationId: string;
      mapId: string;
      note?: TextParam;
    };
    /** Two residents talked; cognition exchanges rumors on this. */
    'npc.conversed': {
      a: string;
      b: string;
      mapId: string;
      locationId: string;
      locationKind: string;
      /** true when the player's map, so lines are shown */
      visible: boolean;
    };
    'npc.tier_changed': { npcId: string; from: Tier; to: Tier };
    /** A relation toward the player changed (NPC to NPC changes stay internal). */
    'npc.relation_changed': {
      from: string;
      to: string;
      delta: Partial<RelationDims>;
      reason: TextParam;
    };
    'npc.plan_set': { npcId: string; day: number; source: PlanState['source'] };
    /** One batch diary landed for a map (entries live in each NPC's diary). */
    'npc.diary_written': { mapId: string; day: number; count: number; source: string };
    /** A devout resident prayed (goddess systems may sample this). */
    'npc.prayed': { npcId: string; goddess?: string; devotion: number; mapId: string };
    /** An NPC walked up to the player and spoke first (builtin_ai.md 3.4). */
    'npc.approached': {
      npcId: string;
      entityId: string;
      reason: ApproachReason;
      mapId: string;
    };
    /** Two named NPCs interacted (builtin_ai.md 5.1); the kind is a closed set. */
    'npc.interaction': {
      kind: InteractionKind;
      a: string;
      b: string;
      mapId: string;
      locationId: string;
      visible: boolean;
    };
    /** A reaction-table row fired for an NPC (builtin_ai.md 5.6). */
    'npc.reaction': { npcId: string; row: string; eventKind: string; subject: string };
    /** A brain-driven bark (builtin_ai.md 7.6) was said on the player's map. */
    'npc.barked': { npcId: string; context: string; mapId: string };
  }
  interface CommandMap {
    /** Daily plan (L1, L2): proposal of the npc.daily AI role or its rule fallback. */
    'npc.plan': {
      npcId: string;
      revision: number;
      day: number;
      slots: PlanSlotData[];
      goal?: TextParam;
      note?: TextParam;
    };
    /** A spoken line in an NPC-to-NPC chat (rule template or the model's wording). */
    'npc.say': { npcId: string; toId?: string; text: TextParam; revision: number };
    /** Batch diary of offstage (L3) residents of one map for one day. */
    'npc.diary_batch': {
      mapId: string;
      day: number;
      revision: number;
      entries: DiaryEntryData[];
    };
    /**
     * Scripted errand: send an NPC somewhere for a number of game hours. `mapId` names a
     * place on another map (a cross-map errand: on the player's map the person walks the
     * exits, elsewhere they snap); without it the place is on the person's own map.
     */
    'npc.goto': {
      npcId: string;
      locationId: string;
      hours: number;
      act?: Activity;
      mapId?: string;
    };
    /** Walk with the player (escort, rescue, accompany); `on: false` releases. */
    'npc.follow': {
      npcId: string;
      on: boolean;
      hours?: number;
      range?: number;
      questId?: string;
      stage?: string;
    };
    /** Watchers on a map look out for the sneaking player (stealth objectives). */
    'npc.watch': { mapId: string; location?: string; on: boolean; questId?: string };
  }
}

/** Interactions between named NPCs (builtin_ai.md 5.1, a closed set). */
export const INTERACTION_KINDS = [
  'chat',
  'gossip',
  'ask_help',
  'invite',
  'gift',
  'quarrel',
  'reconcile',
  'inform',
  'trade',
] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];
