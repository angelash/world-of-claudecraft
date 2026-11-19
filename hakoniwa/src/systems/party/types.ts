// Party types: companion content, the party config, the party slice, events and commands.
// Companions are spawned by this system when companion.<id>.recruited turns true
// (implementation_conventions.md 3); their combat units live in the combat slice. Rules and
// numbers follow companions_and_party.md (the sections are named where a field is read).

import type { FlagValue } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import type { Sufferer } from '../ailments/types';
import type { ItemKind } from '../inventory';
import type { Appearance } from '../world/types';

/** The four stances (7.2). */
export type PartyOrder = 'follow' | 'assist' | 'passive' | 'stay';
export const STANCES: readonly PartyOrder[] = ['follow', 'assist', 'passive', 'stay'];

/** The nine tactical orders (7.3); `spread` toggles between spread and gathered. */
export type TacticKind =
  | 'focus'
  | 'interrupt'
  | 'protect'
  | 'heal_only'
  | 'hold_big'
  | 'use_big'
  | 'goto'
  | 'regroup'
  | 'spread';
export const TACTICS: readonly TacticKind[] = [
  'focus',
  'interrupt',
  'protect',
  'heal_only',
  'hold_big',
  'use_big',
  'goto',
  'regroup',
  'spread',
];

/** A tactical order in force on one member (7.3). */
export interface Tactic {
  kind: TacticKind;
  /** the enemy to interrupt, the ally to protect */
  targetId?: string;
  /** the spot of `goto` */
  x?: number;
  y?: number;
  mapId?: string;
  /** `spread`: true spreads the formation out, false gathers it */
  on?: boolean;
  tick: number;
}

export type CompanionRole = 'tank' | 'healer' | 'melee' | 'ranged' | 'caster';

/**
 * A personal rule of the behaviour tree (7.4). `guard`: while the player is under `below`
 * of its health and something hits the player, use `ability` on that attacker whatever
 * the stance. `shield`: allies carrying one of `tags` are defended even under the passive
 * stance (children, the remnants). `retreat`: the retreat line of the survival layer.
 * `spare`: never picks a target of these monster families (while it flees, with
 * `fleeing`): Shiya does not shoot a fleeing beast.
 */
export type CompanionRule =
  | { kind: 'guard'; below: number; ability: string }
  | { kind: 'shield'; tags: string[] }
  | { kind: 'retreat'; below: number }
  | { kind: 'spare'; families: string[]; fleeing?: boolean };

/** The personality weights of the behaviour tree (7.4), 0 to 100 each. */
export interface CompanionAi {
  aggression: number;
  caution: number;
  protect: number;
  obedience: number;
  rules?: CompanionRule[];
}

/** A red line (8.5): when `when` first holds the bond drops and the confrontation hook fires. */
export interface RedLineDef {
  when: string;
  delta: number;
  hook: string;
}

/** A story departure (13): the companion leaves when `when` holds, back when `back.when` holds. */
export interface LeaveDef {
  when: string;
  back?: { when: string };
}

/**
 * A presence record (2.1): when `when` comes to hold and the person stands within `range`
 * tiles of the player on the player's map, the flag `storeAs` is written true (Shiya stood
 * with the player through the beast tide).
 */
export interface PresenceDef {
  when: string;
  storeAs: string;
  range: number;
}

export interface CompanionDef {
  id: string;
  name: string;
  /** short line for the party window */
  title: string;
  /** main companions have personal lines and red lines; escort companions do not (1) */
  tier?: 'main' | 'escort';
  classId: string;
  role: CompanionRole;
  /** level when first recruited (characters.md, U-11) */
  level: number;
  personality: string[];
  appearance: Appearance;
  /** how the companion joins (2.5): story writes the flag; invite and hire ask the rules */
  recruit?: { mode: 'story' | 'invite' | 'hire'; when?: string };
  /** behaviour-tree weights and personal rules (7.4) */
  ai?: CompanionAi;
  /** the signature skill (6), granted on joining */
  signature?: string;
  /** gifts of these kinds or ids count double */
  likes?: { kinds?: ItemKind[]; items?: string[] };
  /** story flags that deepen the bond once (equals: only when the flag has that value) */
  bondFlags?: { flag: string; equals?: FlagValue; amount: number }[];
  /** red lines (8.5) */
  redLines?: RedLineDef[];
  /** story departures and returns (13) */
  leaves?: LeaveDef[];
  /** presence records the recruit conditions read */
  presence?: PresenceDef[];
  /**
   * Ironman protection (11.4): absent, the companion can fall for good under ironman; an
   * empty object protects for the whole game; with `when`, until that condition holds.
   */
  armor?: { when?: string };
  /** abilities the rule AI never uses for this companion */
  avoid?: string[];
  /** a servant (从者): holds one of the pact door's servant places (2.3) */
  servant?: boolean;
}

/** One step of the catch-up table (4.2): `below` levels under the player or more. */
export interface CatchUpStep {
  below: number;
  factor: number;
}

/** A beast species the hunting door can tame (catalog_creatures_mounts.md 9). */
export interface PetDef {
  id: string;
  name: string;
  /** the wild monster it is tamed from */
  monsterId: string;
  /** species level cap (catalog 1.3) */
  cap: number;
  /** keeps what the player left behind when the player goes through the door (3.6 item 7) */
  guardsBag?: boolean;
}

/** A mount (catalog_creatures_mounts.md 10; travel_and_exploration.md 2.4). */
export interface MountDef {
  id: string;
  name: string;
  desc: string;
  /** price in copper (the item value) */
  price: number;
  /** day's travel in km (the median of the catalog's range) */
  dayKm: number;
  /** load in kg */
  load: number;
  /** the canon sediment grade at which it stops and will not go on (null: never) */
  stopsAtSediment: number | null;
  /** it does not shy from a rank pressure (the donkey, catalog 10.2) */
  fearless?: boolean;
}

/** The numbers of the party system, data/party/config.json. */
export interface PartyConfig {
  /** companion places by act number (3.1); acts not listed take `default` */
  slots: { byAct: Record<string, number>; default: number };
  /** catch-up factors (4.2), the largest `below` first */
  catchUp: CatchUpStep[];
  /** experience cannot lift a companion above the player's level plus this (4.2) */
  levelCapOverPlayer: number;
  /** share of the player's experience a companion away from the party gets (4.2) */
  awayShare: number;
  /** bond gates (8.3): the ceiling of daily bond before personal-line segment `stage` */
  bondGates: { stage: number; max: number }[];
  /** bond from shared kills (8.4) */
  bondKill: { boss: number; elite: number; normal: number; perDay: number; range: number };
  /** bond from gifts (8.4): base + quality, doubled when liked; at most `perWeek` count */
  gift: { base: number; perQuality: number; liked: number; perWeek: number };
  /** a third red line sends a main companion cold (8.5) */
  coldAfter: number;
  /** grave injury rest (11.3), game days */
  rest: {
    baseDays: number;
    fatalDays: number;
    repeatDays: number;
    repeatWindowDays: number;
    minDays: number;
    maxDays: number;
  };
  /** the overflow share of max health that makes a down a fatal blow (11.2) */
  fatalShare: number;
  /** seconds without anyone fighting before a downed companion gets back up (7.6) */
  getUpSec: number;
  /** health share on getting back up */
  getUpHp: number;
  /** spring period of a fallen companion under ironman (11.4), game days */
  spring: { days: number; servantDays: number; petDays: number };
  /** retreat line of the survival layer: base + caution / 100 * span (7.1) */
  retreat: { base: number; span: number };
  /** abilities with at least this cooldown (seconds) are the big ones of 7.3 */
  bigCooldown: number;
  /** sediment exposure enrolment (progression 9.1, 9.3) */
  exposure: { named: boolean; immuneTags: string[]; crystalTaint: number };
  /** the hunting door's half-pact (thousand_doors.md 15.2) */
  pets: { requires: string; overPlayer: number };
  /** the pact door's retainers (thousand_doors.md 3.7, 15.1) */
  retainers: { requires: string; slots: number; fatigue: number };
  /** temporary companions walk with the player for these objective kinds */
  tempObjectives: string[];
  /** the built-in AI's stance choice per fight (builtin_ai.md 11.1); absent: the defaults */
  tactics?: TacticsConfig;
  /** party chatter (builtin_ai.md 11.3; companions_and_party.md 10.1); absent: the defaults */
  banter?: BanterConfig;
  /** grave injuries of named people outside the party (progression_and_pacing.md 10.1) */
  care?: { npcDays: number };
}

/**
 * The stance score of builtin_ai.md 11.1: affinity (the 7.4 weight / 100) times `weight`;
 * `state` toward assist when the party is full of health and mana, toward stay when
 * potions or mana run low or after `hardStreak` hard fights in a row; `protect` toward
 * follow when the player enters a fight under `protectBelow` of health; `foes` toward
 * assist when every known foe is at or under the player's grey level, toward stay with a
 * boss or an elite among them; `inertia` for the stance held. The thresholds that read
 * "full", "low" and "hard" are proposals (docs/70_packets/pk_m1_21_companion_ai).
 */
export interface TacticsConfig {
  /** the built-in AI picks stances for companions the player gave none */
  auto: boolean;
  weight: number;
  state: number;
  protect: number;
  foes: number;
  inertia: number;
  protectBelow: number;
  hardStreak: number;
  /** "full": every member at least this share of health, and of mana for mana users */
  fullHp: number;
  fullMana: number;
  /** "low": the mana users' mean share under this, or fewer healing items than `lowPotions` */
  lowMana: number;
  lowPotions: number;
  /** a hard fight: someone went down, or the party ended it under this mean health share */
  hardHp: number;
  /** foes within this many tiles of the player are the known foes */
  sight: number;
  /** seconds of the opening move (11.1) before the companion fights as usual */
  openingSec: number;
}

/** The pacing of party chatter (builtin_ai.md 11.3; companions_and_party.md 8.2, 10.1). */
export interface BanterConfig {
  /** the least bond of each companion in the cast (8.2: no chatter before 相识, 20) */
  minBond: number;
  /** the least bond for a camp talk (8.2: 营地谈话 opens at 同行, 40) */
  campTalkBond: number;
  /** seconds between the lines of an exchange */
  lineSec: number;
  /** seconds a reply point waits for the player's answer */
  replySec: number;
  /** ticks between two exchanges outside travel and the campfire (10.1: 10 real minutes) */
  exploreGap: number;
  /** ticks of journey per travel exchange (10.1: one per 30 game minutes of travel) */
  travelGap: number;
  /** exchanges at most per campfire night (10.1: one to three) */
  campfireMax: number;
  /** how much a played repeatable exchange recovers per game day (freshness, 11.3) */
  freshPerDay: number;
  /** the weight of an exchange tied to what just happened (relevance, 11.3) */
  relevance: number;
  /** map roles walked as a journey (the region map stands in for them until PK-M1-17) */
  journeyRoles: string[];
}

/** What starts an exchange (builtin_ai.md 11.3). */
export type BanterKind = 'enter' | 'event' | 'travel' | 'campfire' | 'relation' | 'act';
export const BANTER_KINDS: readonly BanterKind[] = [
  'enter',
  'event',
  'travel',
  'campfire',
  'relation',
  'act',
];

/**
 * One party exchange (builtin_ai.md 11.3, 18 `PartyExchange`): its lines are the slot
 * `party.<id>` of the line pack ln_party (PK-M1-29): first the spoken lines, one per entry
 * of `speakers`, then the reply labels, one per entry of `replies`.
 */
export interface BanterDef {
  id: string;
  /** the persons on stage (1 to 3), all in the party (a temporary companion counts) */
  cast: string[];
  kind: BanterKind;
  /** enter: a map id or a location id of the player's map */
  at?: string;
  /** event: an event key besides the condition turning true (`feat.<kind>`, `boss.defeated`) */
  on?: string;
  /** reveal-ledger condition */
  when?: string;
  /** once a game (default) or again */
  once?: boolean;
  /** story-bound chatter ranks above idle chatter */
  priority: number;
  /** the speaker of each spoken line, in order */
  speakers: string[];
  /** the reply point: the bond change of each option (companions_and_party.md 8.4) */
  replies?: { bond?: Record<string, number> }[];
}

/** The party's chatter state (builtin_ai.md 18: the exchanges already heard). */
export interface BanterState {
  /** exchange id: the tick it was last played to the end */
  played: Record<string, number>;
  /** exchange id: times it was cut short (11.3: twice and it is void) */
  cut?: Record<string, number>;
  /** exchanges voided after their second cut */
  void?: string[];
  /** the exchange playing now */
  running?: {
    id: string;
    /** the next line to say */
    line: number;
    /** the tick the next line is due */
    next: number;
    /** waiting for the reply until this tick (after the last line) */
    replyUntil?: number;
    kind: BanterKind;
  };
  /** event exchanges waiting for a calm moment, with the tick they were raised */
  pending?: Record<string, number>;
  /** conditions of repeatable event exchanges that held at the last look (rising edge) */
  held?: Record<string, boolean>;
  /** the places the player stands in now: the map id and the location ids */
  here?: string[];
  /** the player's spot at the last look (a journey counts while the player moves) */
  pos?: [string, number, number];
  /** the tick the last exchange outside travel and the campfire began */
  lastAt?: number;
  /** ticks of journey since the last travel exchange */
  journey?: number;
  /** the night (the game day it began on) of the last campfire and the exchanges at it */
  camp?: { night: number; count: number };
  /** the camp talk of a night (8.4): the night and the companion the player sat with */
  talked?: { night: number; companionId: string };
  /** a talk or a scene holds the stage (11.3: either breaks an exchange in) */
  talk?: boolean;
  scene?: boolean;
  /** ticks of travel and campfire with companions in the party (alive metric 12) */
  exposure?: number;
}

/** The built-in AI's per-fight bookkeeping (builtin_ai.md 11.1, 18: the tendency). */
export interface FightState {
  /** a fight is going on */
  on: boolean;
  /** fights begun so far (the revision of companion.tactics requests) */
  count: number;
  /** the tick the current or last fight began */
  start: number;
  /** party members gone down in the current fight */
  downs: number;
  /** hard fights in a row up to the last one */
  hardStreak: number;
  /** companions the player rescued in this fight (the 8.4 bond, once a fight) */
  rescued?: string[];
}

/** Where a roster member is (3.2). */
export type MemberState =
  | 'party'
  | 'standby'
  | 'waiting'
  | 'resting'
  | 'away'
  | 'cold'
  | 'spring'
  | 'dead';

export interface Member {
  id: string;
  /** the entity while it is in the world ('' while it is not) */
  entityId: string;
  order: PartyOrder;
  /** absent on saves from before the roster: in the party */
  state?: MemberState;
  tactic?: Tactic;
  bond: number;
  /** bond thresholds already announced */
  reached: number[];
  /** bondFlags already applied */
  told: string[];
  joinedTick: number;
  downedTick: number;
  pathAt: number;
  /** kill bond counted today (8.4) */
  killBond?: { day: number; amount: number };
  /** gifts counted this week (8.4) */
  gifts?: { week: number; count: number };
  /** red lines crossed, in order (8.5; keyed by hook and condition) */
  redLines?: string[];
  /** red lines that already held when the companion joined (not crossed with it) */
  redSeen?: string[];
  /** a third red line: the companion stays cold until the reconciliation scene (8.5) */
  cold?: boolean;
  /** resting until this tick (11.3) */
  restUntil?: number;
  /** ticks of the grave injuries of the last days (11.3: the repeat penalty) */
  wounds?: number[];
  /** at the spring until this tick (11.4) */
  springUntil?: number;
  /** the story departure in force (the condition of the def's leave) */
  leftBy?: string;
  /** story departures already served (each happens once) */
  leavesDone?: string[];
  /** the spot a waiting companion keeps (dungeon entrance) */
  waitAt?: { mapId: string; x: number; y: number };
  /** the spot of the stay stance */
  stayAt?: { mapId: string; x: number; y: number };
  /** health seen at the last two party ticks: [previous, current] (the fatal blow, 11.2) */
  hpSeen?: [number, number];
  /** damage taken in this tick by the events seen so far: [tick, amount] */
  hitTick?: [number, number];
  /** first tick the member stood inside each warning it is reacting to */
  danger?: Record<string, number>;
  /** a temporary companion: an NPC walking with the player for a quest objective */
  temp?: { questId: string; stage: string };
  /** a beast companion (half-pact) or a retainer (pact): its species and the bag it guards */
  pet?: { species: string; kind: 'half' | 'retainer'; monsterId: string; guarding?: string };
  /** level, experience and the ailments body kept while the member is out of the world (3.2) */
  level?: number;
  xp?: number;
  body?: Sufferer;
  /** going back into the world on the next tick (its old combat unit is still being removed) */
  pendingIn?: boolean;
  /** the tick the member last left the world */
  outTick?: number;
  /** a scripted spot that overrides everything (7.1 layer 2) */
  scripted?: { mapId: string; x: number; y: number };
  /** the player chose this stance: the built-in AI leaves it (builtin_ai.md 11.1) */
  stanceBy?: 'player';
  /** the stance before the built-in AI's pick for the current fight (back to it after) */
  stanceBase?: PartyOrder;
  /** the stance the built-in AI or a model gave for the last fight (the inertia term) */
  stanceLast?: PartyOrder;
  /** the tick a heal last landed on the member (the light wound's treatment, 10.1) */
  treated?: number;
  /** the grave injury (its tick in `wounds`) the player has already visited (8.4) */
  visited?: number;
  /** the opening move of the current fight (11.1) and the tick it lapses */
  opening?: { kind: OpeningKind; until: number };
}

/** The first act of a fight by stance (builtin_ai.md 11.1). */
export type OpeningKind = 'burst' | 'buff' | 'close';

export interface PartySlice {
  members: Record<string, Member>;
  /** the ironman switch: decided by its first write, off for good once off (11.4) */
  ironman?: 'on' | 'off';
  /** formation preset (3.3) and the spread toggle of 7.3 */
  formation?: 'wedge' | 'ring' | 'spread';
  /** the mount ridden (an item id the player holds) */
  mount?: string;
  /** the built-in AI's fight bookkeeping (absent on saves before PK-M1-21) */
  fight?: FightState;
  /** party chatter (absent on saves before PK-M1-21) */
  banter?: BanterState;
  /** named people outside the party gravely hurt: person id to the tick they are well */
  care?: Record<string, number>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    party: PartySlice;
  }
  interface ContentMap {
    companions: CompanionDef[];
    partyConfig: PartyConfig;
    pets: PetDef[];
    mounts: MountDef[];
    partyBanter: BanterDef[];
  }
  interface EventMap {
    'party.joined': { companionId: string; entityId: string };
    'party.left': { companionId: string };
    'party.bond': { companionId: string; bond: number; delta: number; reason: string };
    'party.order': { companionId: string; order: PartyOrder };
    /** a roster member moved (3.2) */
    'party.state': { companionId: string; from: MemberState; to: MemberState };
    /** an invite or a join was refused (the place or the conditions) */
    'party.refused': { companionId: string; reason: TextParam };
    /** a tactical order was given (7.3) */
    'party.tactic': { companionId: string; tactic: TacticKind };
    /** a red line was crossed (8.5): the confrontation of `hook` is due */
    'party.red_line': { companionId: string; hook: string; delta: number; count: number };
    /** a personal-line segment was completed (9.1) */
    'party.segment': { companionId: string; stage: number };
    /** grave injury (11.2): off to rest until `until` (a tick) */
    'party.wounded': { companionId: string; cause: WoundCause; until: number; days: number };
    'party.recovered': { companionId: string };
    /** fell for good under ironman (11.4): at the spring until `until` */
    'party.died': { companionId: string; cause: WoundCause; until: number };
    /** the ironman switch changed or a change was refused (11.4) */
    'party.ironman': { op: 'on' | 'off' | 'refused' };
    /** a personal rule fired (7.4) */
    'party.rule': { companionId: string; rule: CompanionRule['kind']; targetId: string };
    /** the mount ridden changed */
    'party.mount': { mountId: string | null };
    /**
     * The built-in AI chose a companion's stance and opening move for a fight (builtin_ai.md
     * 11.1); `fight` is the fight count, the revision of the companion.tactics request.
     */
    'party.tactics': {
      companionId: string;
      order: PartyOrder;
      opening: OpeningKind;
      fight: number;
      by: 'builtin' | 'ai';
    };
    /** a line of party chatter (17.3: speaker and line, for the talk log) */
    'party.banter': {
      exchangeId: string;
      kind: BanterKind;
      /** the line's index in the slot party.<exchangeId> of ln_party */
      line: number;
      speakerId: string;
      text: TextParam;
    };
    /** the player sat with a companion at the fire (8.4) */
    'party.camp_talk': { companionId: string; night: number };
    /** the reply point of an exchange: the player may answer until `until` (a tick) */
    'party.banter_ask': { exchangeId: string; options: TextParam[]; until: number };
    /**
     * An exchange ended: `done` (to its last line or the reply), `cut` (combat, a talk or a
     * scene broke in; it starts again later), `void` (cut twice, never again); `reply` is the
     * option the player chose.
     */
    'party.banter_end': {
      exchangeId: string;
      kind: BanterKind;
      outcome: 'done' | 'cut' | 'void';
      reply?: number;
    };
  }
  interface CommandMap {
    /** companionId omitted: every member */
    'party.order': { companionId?: string; order: PartyOrder };
    'party.gift': { companionId: string; itemId: string };
    /** a tactical order (7.3); companionId omitted: every member in the party */
    'party.tactic': {
      tactic: TacticKind | 'none';
      companionId?: string;
      targetId?: string;
      x?: number;
      y?: number;
      on?: boolean;
    };
    /** formation preset out of combat (3.3) */
    'party.formation': { formation: 'wedge' | 'ring' | 'spread' };
    /** "come with me" (2.5): the rules decide */
    'party.invite': { companionId: string };
    /** send a companion to stand by (3.2) */
    'party.dismiss': { companionId: string };
    /** swap a standby companion into the party for one in it (3.2) */
    'party.swap': { inId: string; outId?: string };
    /** wait here (outside a dungeon entrance) or come along again */
    'party.wait': { companionId?: string; on: boolean };
    /** turn ironman off for good (11.4) */
    'party.ironman_off': Record<string, never>;
    /** a personal-line segment is done (9.1; story and quests), with its bond change */
    'party.segment': { companionId: string; stage: number; bond?: number };
    /** the reconciliation scene after a companion went cold (8.5) */
    'party.reconcile': { companionId: string };
    /** story grave injury (11.2 scripted) */
    'party.wound': { companionId: string };
    /** tame the beast the player stands over (thousand_doors.md 15.2) */
    'party.tame': { targetId: string };
    /** reach out to a yielded being and bind it (thousand_doors.md 3.7, 15.1) */
    'party.pact': { targetId: string };
    /** release a beast companion or a retainer */
    'party.release': { companionId: string };
    /** ride a mount the player owns, or none */
    'party.ride': { mountId: string | null };
    /**
     * The built-in AI or a model sets a companion's stance for the fight `revision` (the
     * companion.tactics decision, builtin_ai.md 11.1); never the player, whose stance is
     * `party.order` and which this never overrides.
     */
    'party.stance': { companionId: string; order: PartyOrder; revision: number };
    /** hand a companion's stance back to the built-in AI (on), or keep the current one */
    'party.auto_stance': { companionId?: string; on: boolean };
    /** answer the reply point of the exchange playing now (builtin_ai.md 11.3) */
    'party.banter_reply': { exchangeId: string; option: number };
    /** visit a companion resting from a grave injury (8.4: +1 bond, once per injury) */
    'party.visit': { companionId: string };
    /** sit with one companion at a camp before sleep (8.4: +1 bond, one a night) */
    'party.camp_talk': { companionId: string };
  }
}

export type WoundCause = 'fatal' | 'second_down' | 'defeat' | 'story' | 'crystal';
