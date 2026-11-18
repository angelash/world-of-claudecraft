// The topic graph (builtin_ai.md 6.2, 6.6, 18; catalog_dialogue_lines.md 3): topics are the
// units of what a person can talk about, as data (data/dialogue/topics/*.json). A topic says
// who may speak of it (scope, owners, region, knowledge tier, knowers), when (requires,
// after, the act window, trust), how its lines are versioned, what talking about it opens,
// how a person refuses it while it is locked (6.6), and the words that name it in free text.
// The lines themselves live in the line packs as `topic.<id>` slots (7.2).

import type { KnowledgeTier } from '../../npc/types';

/** Topic categories (builtin_ai 6.2, a closed set). */
export const TOPIC_CATEGORIES = [
  'self',
  'work',
  'place',
  'person',
  'event',
  'rumor',
  'quest',
  'faith',
  'world',
  'you',
  'danger',
  'service',
  'secret',
] as const;
export type TopicCategory = (typeof TOPIC_CATEGORIES)[number];

/** Who may speak of a topic: its owners only, the people of a region, or everyone. */
export const TOPIC_SCOPES = ['persona', 'region', 'global'] as const;
export type TopicScope = (typeof TOPIC_SCOPES)[number];

/**
 * How the version of a topic's lines is chosen (builtin_ai 6.2 versionBy): the speaker's
 * knowledge tier, their cognition state toward the player, the act, their trust band toward
 * the player; `none` for a plain line list (mood is a line preference, not a version).
 */
export const TOPIC_VERSION_BY = ['knowledge', 'cognition', 'act', 'relation', 'none'] as const;
export type TopicVersionBy = (typeof TOPIC_VERSION_BY)[number];

export const TOPIC_REPEATS = ['once', 'daily', 'evergreen'] as const;
export type TopicRepeat = (typeof TOPIC_REPEATS)[number];

/**
 * The five ledger refusals (builtin_ai 6.6, reveal_ledger.md 0.2 rule 3): deny, evade,
 * mislead with the topic's `mis` version, not know (only where memory is truly gone),
 * hint (only the seers).
 */
export const REFUSALS = ['deny', 'evade', 'mis', 'unknown', 'hint'] as const;
export type Refusal = (typeof REFUSALS)[number];

/** What talking about a topic opens (builtin_ai 6.2 `unlocks`). */
export interface TopicUnlocks {
  /** other topics that become talkable with this person (their `after`) */
  topics?: string[];
  /** quests whose offer this topic leads into (catalog 3.1 quest_ entries) */
  quests?: string[];
}

/**
 * The misdirection version (reveal_ledger.md 5; builtin_ai 6.6): who says the `mis` lines
 * sincerely, and until when. `by` names persona ids, `class:<social class>` or `tier:<K>`.
 */
export interface TopicMisdirection {
  by: string[];
  /** the misdirection is overturned once this holds (absent: for the whole act window) */
  until?: string;
}

export interface TopicDef {
  id: string;
  category: TopicCategory;
  /** menu title (content text); a person topic without one says the person's name */
  title?: string;
  scope: TopicScope;
  /** persona scope: the only speakers; region and global scope: who has own versions */
  owners?: string[];
  /** region scope: the map region of the speakers' home map */
  region?: string;
  /** lowest knowledge tier that knows the topic (builtin_ai 6.2 `tier`) */
  tier: KnowledgeTier;
  /** may speak of it below the tier (reveal_ledger.md 0.2 rule 1); also the locked knowers */
  knowers?: string[];
  /** reveal-ledger condition: the topic is talkable once it holds */
  requires?: string;
  /** trust toward the player under which the person evades it (still on the menu) */
  trustMin?: number;
  /** topics this person must have talked about first */
  after?: string[];
  /** a person topic: on the menu once that person was named to the player */
  introduced?: boolean;
  unlocks?: TopicUnlocks;
  versionBy: TopicVersionBy;
  repeat: TopicRepeat;
  /** persona trait words or functional roles drawn to it (menu order, 6.2) */
  interest?: string[];
  /** how a knower refuses while `requires` does not hold (default evade) */
  locked?: Refusal;
  /** per-speaker refusal overrides while locked */
  lockedBy?: Record<string, Refusal>;
  mis?: TopicMisdirection;
  /** ledger rows the topic touches (lore ids, MIS and bridge numbers), for audits */
  clues?: string[];
  /** entity ids (persona, map, map/location) and lexicon words that name it in free text */
  aliases?: string[];
  /** keyword groups of a free-text question about it (a hit per group with any word) */
  keywords?: string[][];
  /** first act it can come up in (an act flag value) */
  act: string;
  /** last act it can come up in */
  until?: string;
  /** a prologue topic: the scene and the choice of its question menu that answers it */
  scene?: { id: string; choice: string };
  /** a service topic: the functional role that offers it */
  service?: string;
  /** reached by free text only (directions need a place to point at) */
  askOnly?: boolean;
  /** only a troubled speaker has it (a troubled mood or an unmet need, gen_trouble) */
  trouble?: boolean;
}

declare module '../../../core/contracts' {
  interface ContentMap {
    topics: TopicDef[];
    /** people the topics name who are not on stage as personas yet (offstage cast) */
    topicCast: string[];
  }
}

/** What a person does with a topic now (builtin_ai 6.6). */
export type TopicAnswer =
  | { kind: 'answer'; version: string | null }
  | { kind: 'refuse'; refusal: Refusal; reason: RefusalReason };

/** Why a topic is refused, for the audit and the tests. */
export type RefusalReason =
  | 'out_of_scope'
  | 'locked'
  | 'locked_knower'
  | 'tier'
  | 'trust'
  | 'act'
  | 'after';

/** One person's progress with the player on one topic (builtin_ai 18 "话题进度"). */
export interface TopicTalk {
  /** the version asked for last ('' for a plain list) */
  v: string;
  /** line keys heard of that version in the current round of the rotation (7.7) */
  k: string[];
  /** game day it was last talked about */
  day: number;
  /** every line of the version was heard once: the menu marks it as talked (7.7) */
  done?: boolean;
}

/** A refusal in the open conversation (the anti-loop of 6.6). */
export interface TopicRefusalCount {
  topic: string;
  n: number;
}
