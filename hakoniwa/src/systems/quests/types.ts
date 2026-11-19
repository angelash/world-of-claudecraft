// Quest and act data model (docs/40_design/systems/quests_and_events.md 3, 5, 7).

import type { Effect } from './effect_types';

export type Objective = (
  | {
      type: 'kill';
      /** monster content id (entity ref) or any of refs */
      ref?: string;
      refs?: string[];
      /** entity kind of the victim (monster by default) */
      kind?: string;
      /** only on this map */
      mapId?: string;
      count: number;
    }
  | { type: 'talk'; npc: string }
  | { type: 'reach'; mapId: string; location?: string }
  | { type: 'collect'; item: string; count: number; consume?: boolean }
  | { type: 'flag'; when: string }
  | {
      type: 'choice';
      /** offered when talking to this NPC; without npc it is chosen from the quest log */
      npc?: string;
      options: {
        id: string;
        label: string;
        when?: string;
        cost?: { money?: number; items?: { item: string; count: number }[] };
        effects?: Effect[];
        path?: string;
      }[];
    }
  | { type: 'build'; defId?: string; count: number }
  | { type: 'battle'; scenario: string; onLose?: Effect[] }
  | { type: 'level'; level: number }
  | { type: 'door'; doorId: string }
  | { type: 'wait'; hours?: number; days?: number }
  | { type: 'scene'; scene: string }
  // --- the quest model of PK-M1-58 (quests_and_events.md 5; objectives.ts) ---
  /** bring items to an NPC: talking to them while holding `count` hands them over */
  | { type: 'deliver'; item: string; count?: number; npc: string; consume?: boolean }
  /** the NPC (entity ref) stands alive at the destination; their death fails it */
  | { type: 'escort'; npc: string; mapId: string; location?: string }
  /** enough clues found: each clue is a world fact (a condition), found once and kept */
  | { type: 'investigate'; clues: Clue[]; need?: number }
  /** talking to the NPC while the threshold (evidence and relation) holds */
  | { type: 'persuade'; npc: string; when: string }
  /** reach the place unseen: a stealth.detected of the player spoils the approach */
  | { type: 'stealth'; mapId: string; location?: string; retry?: boolean }
  /** a duel.ended against the NPC with this outcome; killing them fails it */
  | { type: 'duel'; npc: string; outcome?: 'win' | 'lose' | 'any' }
  /** the NPC leads (npc.goto) to the destination with the player staying within range */
  | {
      type: 'follow';
      npc: string;
      mapId: string;
      location: string;
      range?: number;
      hours?: number;
      retry?: boolean;
    }
  /** free the captive (talk, or `when`), then, with a destination, bring them there alive */
  | { type: 'rescue'; npc: string; when?: string; mapId?: string; location?: string }
  /** gather.done events (the gathering system, PK-M1-49) */
  | { type: 'gather'; item?: string; node?: string; count: number }
  /** craft.done events (the crafting system, PK-M1-49) */
  | {
      type: 'craft';
      item?: string;
      recipe?: string;
      profession?: string;
      families?: string[];
      count: number;
      quality?: number;
      masterwork?: boolean;
      signedInput?: boolean;
      when?: string;
    }
  /** an actual successful item use, optionally on a named target or the player's beast */
  | {
      type: 'use';
      item?: string;
      effect?: string;
      targetRef?: string;
      pet?: boolean;
      count: number;
    }
  /** one of these companions or beasts has actually joined the player's roster */
  | { type: 'recruit'; companions: string[] }
  /** the party's feeding executor accepted and applied a meal to the player's beast */
  | { type: 'feed'; companions?: string[]; count: number }
  /** a real combat purification replaced the named monster */
  | { type: 'purify'; monster: string }
  /** a commission actually settled by the guild, with an optional cargo animal held */
  | { type: 'commission'; kind?: string; carrying?: string; count: number }
  /** economy.traded by the player: side, item, market, unit price cap (buy) or floor (sell) */
  | {
      type: 'trade';
      item?: string;
      side?: 'buy' | 'sell';
      market?: string;
      count?: number;
      price?: number;
    }
  /** time spent with the NPC within range, in game minutes */
  | { type: 'accompany'; npc: string; minutes: number; range?: number }
) & {
  label: string;
  /** robust alternative completion: satisfied as soon as this condition holds */
  orWhen?: string;
  optional?: boolean;
  /** the solution path this objective stands for: written to quest.<id>.path when met */
  path?: string;
  /**
   * World writes of meeting this objective, applied once when it is met (an optional
   * preparation that writes its own flag, a clue that adds to an evidence count): the
   * stage's own effects still wait for the stage.
   */
  effects?: Effect[];
};

/** One clue of an investigate objective: a world fact (quests_and_events.md 5, 调查). */
export interface Clue {
  id: string;
  when: string;
  label?: string;
}

export interface QuestStage {
  id: string;
  desc: string;
  objectives: Objective[];
  /** 'all' (default): every required objective; 'any': the first one done completes the stage */
  complete?: 'all' | 'any';
  onEnter?: Effect[];
  onComplete?: Effect[];
  /** a required objective failed (an escortee died, the player was seen): these apply */
  onFail?: Effect[];
  /** ...and the quest moves to this stage (a failure branch) instead of failing */
  failTo?: string;
}

export interface QuestDef {
  id: string;
  /** act key: act1 .. act6 */
  act: string;
  kind: QuestKind;
  title: string;
  /** NPC id offering it; absent means it starts automatically when the trigger holds */
  giver?: string;
  /** NPC id to turn in to; absent means it completes when the last stage is done */
  turnIn?: string;
  desc: string;
  /** availability condition (reveal-ledger syntax) */
  trigger?: string;
  stages: QuestStage[];
  onStart?: Effect[];
  /** completion effects and rewards (xp, money, items, flags, features, scenes, act) */
  rewards?: Effect[];
  /** log ordering inside an act */
  order?: number;
  /**
   * Acceptance window in act weeks of the quest's own act, inclusive (quests_and_events.md
   * 3.1 `window`): offered or auto-started only while act_week is inside it.
   */
  weekWindow?: WeekWindow;
  /** a node quest: the dispute chain quest it belongs to, and its node letter (A1-D01.a) */
  chain?: string;
  node?: string;
  /** a dispute chain's default development, one step per act week (disputes.ts) */
  defaults?: DefaultStep[];
  /** someone else gets there first: once `when` holds the quest closes as by_other */
  byOther?: { when: string; effects?: Effect[] };
  /** the quest runs out: past act week `week` of its act (or a later act), or `when` */
  expiry?: { week?: number; when?: string; effects?: Effect[] };
  /** forward failure (quests_and_events.md 3.5): effects on failing, and a condition that fails it */
  failure?: { when?: string; effects?: Effect[] };
  /**
   * Where a run-time instance's display text lives (instances.ts): a commission instance
   * renders its title from its template's content record, not from a quests row.
   */
  textOf?: { table: string; id: string };
}

/** Quest kinds (quests_and_events.md 3.1; catalog_quests_acts1_3.md 1.3). */
export const QUEST_KINDS = [
  'main',
  'side',
  'dispute',
  'node',
  'commission',
  'goddess',
  'companion',
  'craft',
  'dungeon',
  'explore',
] as const;
export type QuestKind = (typeof QUEST_KINDS)[number];

/** Objective types, in the order of the union above. */
export const OBJECTIVE_TYPES: readonly Objective['type'][] = [
  'kill',
  'talk',
  'reach',
  'collect',
  'flag',
  'choice',
  'build',
  'battle',
  'level',
  'door',
  'wait',
  'scene',
  'deliver',
  'escort',
  'investigate',
  'persuade',
  'stealth',
  'duel',
  'follow',
  'rescue',
  'gather',
  'craft',
  'use',
  'recruit',
  'feed',
  'purify',
  'commission',
  'trade',
  'accompany',
];

/**
 * One week of a dispute chain's default development (act1_borderstone.md 4: the kernel
 * advances the chain one cell at every week start when the player does not step in): at
 * the start of act week `week` of the quest's act, `effects` apply unless `unless` holds
 * (the player intervened). Each step settles once, applied or not.
 */
export interface DefaultStep {
  id: string;
  week: number;
  unless?: string;
  effects: Effect[];
}

/** An inclusive range of act weeks; a missing end is open. */
export interface WeekWindow {
  from?: number;
  to?: number;
}

/**
 * A night trigger of the act clock (act1_borderstone.md 7.3, the tide night): checked at
 * dusk of every qualifying night inside the week window; it fires on the first one whose
 * dusk finds `when` true (no `when`: the first qualifying night), and on the last
 * qualifying night of the window whatever `when` says (the kernel clamp). Fires once per
 * act.
 */
export interface NightRule {
  id: string;
  /** which nights qualify: the dark-moon night of each week, or every night */
  night: 'dark_moon' | 'any';
  /** inclusive act-week window */
  from: number;
  to: number;
  when?: string;
  /** checked first at every qualifying dusk: when it holds the rule is dropped unfired */
  unless?: string;
  effects: Effect[];
}

/** A beat of the act's timeline by act week (act1_borderstone.md 1.2). */
export interface ActBeat {
  id: string;
  from: number;
  to: number;
}

/**
 * The act clock (PK-M1-45): an act with a clock counts act_week from 1 on the calendar
 * (a new act week starts with every calendar week, weekday 1 at 00:00), applies `weekly`
 * at the start of every act week after the first, and runs its night rules.
 */
export interface ActClockDef {
  /** nominal length of the act in weeks (act_week keeps counting past it) */
  weeks?: number;
  /** effects at the start of every act week after the first (the act's weekly drift) */
  weekly?: Effect[];
  beats?: ActBeat[];
  nights?: NightRule[];
}

export interface ActDef {
  id: string;
  index: number;
  title: string;
  /** where the player is put when the act begins */
  entry?: { mapId: string; location?: string };
  /** scene played when the act begins */
  introScene?: string;
  /** flags written when the act begins */
  onEnter?: Effect[];
  /** the act's week clock; an act without one (prologue, epilogue) counts no weeks */
  clock?: ActClockDef;
}

/** Runtime state of the act clock (quests slice; absent in saves before PK-M1-45). */
export interface ActClockState {
  /** the act the clock last saw ('' before any) */
  act: string;
  /** calendar day (0-based) the act began */
  startDay: number;
  /** tick the act began */
  startTick: number;
  /** current act week (0 for an act without a clock) */
  week: number;
  /** night rules already settled in this act (fired, or dropped by `unless`) */
  fired: string[];
  /** the clock has settled every event up to and including this tick */
  at: number;
  /** the tick of the clock's next event (a week start or a pending dusk; NEVER when none) */
  next: number;
}

export type QuestStatus = 'active' | 'ready' | 'done' | 'failed' | 'expired' | 'by_other';

export interface QuestProgress {
  id: string;
  status: QuestStatus;
  stage: number;
  /** objective index -> progress count */
  counts: number[];
  /** objective index -> satisfied */
  met: boolean[];
  stageStartTick: number;
  startedTick: number;
  doneTick?: number;
  /** chosen option ids of choice objectives */
  choices: Record<string, string>;
  /** the solution path taken so far (mirrored to quest.<id>.path) */
  path?: string;
  /** investigate objectives: objective index -> clue ids found */
  clues?: Record<string, string[]>;
  /** accompany objectives: the tick time spent together was last added up to */
  accrued?: number;
  /** tick the quest closed as failed, expired or by_other */
  endedTick?: number;
}

export interface QuestsSlice {
  quests: Record<string, QuestProgress>;
  /** quest ids in start order */
  order: string[];
  /** availability needs a re-check */
  dirty: boolean;
  /** player level as last reported */
  level: number;
  /** completed buildings by def id */
  built: Record<string, number>;
  /** opened doors */
  doors: string[];
  /** scenes seen to the end */
  scenesSeen: string[];
  lastBeatTick: number;
  /** the act clock (created on first use; saves before PK-M1-45 have none) */
  clock?: ActClockState;
  /** dispute default steps already settled, by quest id (saves before PK-M1-58 have none) */
  defaultsDone?: Record<string, string[]>;
  /** quests built at run time from a template, by id (instances.ts; absent before PK-M1-47) */
  instances?: Record<string, QuestDef>;
}
