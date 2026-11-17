// NPC system types: persona cards, schedules, needs, tiers (D-009), memory and
// relations, plus the module augmentation that registers the slice, content tables,
// events and commands. See docs/40_design/systems/npc_society_ai.md.

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
  with?: string;
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

export interface Needs {
  hunger: number;
  energy: number;
  social: number;
  faith: number;
}

export type GoneReason = 'recruited' | 'dead' | 'hidden' | 'absent';

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
  diary: { day: number; kind: DiaryKind; text: TextParam }[];
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
    /** Scripted errand: send an NPC somewhere for a number of game hours. */
    'npc.goto': { npcId: string; locationId: string; hours: number; act?: Activity };
  }
}
