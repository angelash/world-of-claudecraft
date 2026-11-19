// Types of the free-input pipeline (builtin_ai.md 6.3 to 6.5): the lexicon and the intent
// rules (data under data/dialogue/, loaded into the content map by the dialogue pack), the
// analysed input (normalized clauses, entities, sentence features), the scored result, and
// the response table that turns an intent into a line and its world consequences.

/** The 52 intents of builtin_ai.md 6.4, in table order. */
export const INTENT_IDS = [
  'greet',
  'farewell',
  'thanks',
  'apologize',
  'compliment',
  'insult',
  'threaten',
  'joke',
  'advance',
  'small_talk',
  'ask_identity',
  'ask_job',
  'ask_wellbeing',
  'ask_plan',
  'ask_past',
  'ask_view_person',
  'ask_view_player',
  'ask_person',
  'ask_place',
  'ask_directions',
  'ask_news',
  'ask_rumor',
  'ask_event',
  'ask_lore',
  'ask_goddess',
  'ask_danger',
  'trade_buy',
  'trade_sell',
  'haggle',
  'ask_work',
  'quest_report',
  'request_service',
  'ask_help',
  'offer_help',
  'give_gift',
  'recruit',
  'persuade',
  'bribe',
  'promise',
  'claim_feat',
  'reveal_identity',
  'accuse',
  'ask_secret',
  'forbidden_name',
  'earth_talk',
  'meta',
  'injection',
  'invoke_goddess',
  'agree',
  'refuse',
  'clarify',
  'unknown',
] as const;
export type IntentId = (typeof INTENT_IDS)[number];

/**
 * Merge groups (builtin_ai 6.3 step 8): the main intent of a multi-clause input is the one
 * whose group comes first in IntentRuleSet.merge.
 */
export const MERGE_GROUPS = [
  'safety',
  'ledger',
  'answer',
  'conflict',
  'service',
  'ask',
  'act',
  'social',
  'none',
] as const;
export type MergeGroup = (typeof MERGE_GROUPS)[number];

/**
 * Every `if` name a response step may name (builtin_ai 6.6): respond.ts's `holds()`
 * handles exactly this set, and content.ts's `ruleSetProblems` checks every `if` in
 * data/dialogue/intents.json against it, so a typo'd condition name is a data error
 * instead of a silently-always-true branch.
 */
export const RESPOND_IF_NAMES = [
  'grudge',
  'forgiven',
  'not_offended',
  'guard',
  'clergy',
  'merchant',
  'service',
  'low_trust',
  'troubled',
  'repeat_today',
  'third_insult',
  'pending',
  'in_topic',
  'known_person',
  'earth_refuse',
] as const;

/** Entity kinds the extractor tags (builtin_ai 6.3 steps 3 and 4). */
export const ENTITY_KINDS = [
  'person',
  'goddess',
  'honorific',
  'forbidden',
  'place',
  'item',
  'monster',
  'faction',
  'event',
  'lore',
  'earth',
  'unknown_name',
] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

/** Sentence features (builtin_ai 6.3 step 5). */
export const FEATURE_NAMES = [
  'question',
  'imperative',
  'negation',
  'first',
  'second',
  'polite',
  'positive',
  'negative',
] as const;
export type FeatureName = (typeof FEATURE_NAMES)[number];

// ---------------------------------------------------------------------------
// Data: data/dialogue/lexicon.json and data/dialogue/intents.json

/**
 * The lexicon: normalization tables and word groups. Vocabulary matched against the
 * player's typed words and the content's names; data, never display text (D-077).
 */
export interface IntentLexicon {
  fold: {
    /** source punctuation to its canonical half-width form */
    punct: Record<string, string>;
    /** traditional-simplified character pairs, concatenated (even index traditional) */
    traditional: string[];
  };
  /** whole-substring corrections applied after folding (common typos, slang, pinyin) */
  typos: Record<string, string>;
  /** filler particles stripped from both ends of a clause before anchored matching */
  particles: string;
  /** clause connectives (builtin_ai 6.3 step 2) */
  split: string[];
  /**
   * the whole text between a modifier entity and its head ("X的Y", "X里的Y"): an entity
   * followed by one of these and then another entity only modifies it (6.3 step 3, head.ts)
   */
  modifierLinks?: string[];
  /** title words stripped from content names to derive the short names players type */
  affixes: { prefix: string[]; suffix: string[]; joiner: string };
  /** words that refer back to the last entity of the conversation (6.3 step 6) */
  pronouns: Record<string, string[]>;
  /** unknown proper-name cues (6.3 step 4): `叫X的`-style frames and place endings */
  unknown: { before: string[]; after: string[]; endings: string[] };
  /** sentence feature words; `question_end` are particles that ask only at the clause end */
  features: Record<FeatureName | 'question_end', string[]>;
  /** generic words per entity kind (content names are added from the content tables) */
  entities: Partial<Record<EntityKind | 'earth_refuse', string[]>>;
  /** keyword groups referenced from rules as @name */
  groups: Record<string, string[]>;
  /** persona trait words per behavioural trait (matched against PersonaCard.traits) */
  traits: Record<string, string[]>;
  /** entity tags per functional reading (merchant, service, guard, clergy) for response branches */
  roles: Record<string, string[]>;
}

/** Context bonuses (builtin_ai 6.3: agree and refuse after a question, clarify in a topic). */
export interface RuleContext {
  afterQuestion?: number;
  inTopic?: number;
}

export interface IntentRule {
  /** rule id, unique; ties go to the higher priority, then to the earlier rule */
  id: string;
  intent: IntentId;
  priority: number;
  base: number;
  /** keyword groups: each inner list is one group, a hit when any term occurs */
  any?: string[][];
  /** a hard co-occurrence gate: every term must be present, or the rule never scores */
  all?: string[];
  /** ordered word-and-slot templates (see ./pattern.ts) */
  patterns?: string[];
  /** entity kinds that score when present */
  needs?: EntityKind[];
  /** the rule is out of play without one of `needs` */
  needsOnly?: boolean;
  /** the rule is out of play without a keyword group or template hit, even with `needs` present */
  needsKeyword?: boolean;
  /** sentence features that score when they match (true: present, false: absent) */
  features?: Partial<Record<FeatureName, boolean>> & { maxLen?: number };
  /** terms whose presence costs the exclude weight each */
  exclude?: string[];
  context?: RuleContext;
}

/** One step of an intent's response (builtin_ai 6.5). */
export type ResponseStep =
  | {
      code: 'R1';
      /** topic id; {person}, {place}, {event}, {lore} take the main clause's entity, {topic} the current topic */
      topic: string;
      /** how the version is chosen (builtin_ai 6.2 versionBy) */
      version?: 'knowledge' | 'cognition' | 'band' | 'act';
      /** fallback slots when the topic has no line; @intro and @rumor are built-in answers */
      else?: string[];
      if?: string;
    }
  | { code: 'R2'; slots?: string[]; use?: BuiltinReply; if?: string }
  | { code: 'R3'; if?: string }
  | { code: 'R4'; if?: string }
  | { code: 'R5'; entry: string; if?: string }
  | { code: 'R6'; weight: number; if?: string }
  | {
      code: 'R7';
      like?: number;
      trust?: number;
      awe?: number;
      /** a gain counts once per person and game day (builtin_ai 5.5 anti-farming) */
      daily?: boolean;
      /** trait multipliers or overrides: the first listed trait the persona has wins */
      traits?: { trait: string; like?: number; trust?: number }[];
      /** restore this share of the last offense's losses instead of a fixed change */
      restore?: number;
      if?: string;
    }
  | { code: 'R8'; notify: string; if?: string }
  | { code: 'R9'; if?: string };

/** Replies that already exist as built-in options (session, small talk, rumors, opinion). */
export type BuiltinReply = 'small_talk' | 'opinion' | 'rumor' | 'farewell' | 'unbelief';

export interface IntentDef {
  group: MergeGroup;
  respond: ResponseStep[];
  /** reaction slot used when this intent is the secondary clause */
  short?: string;
  /** patience change of the round (builtin_ai 6.1), 0 by default */
  patience?: number;
  /** a "valid" round that never costs patience even when repeated */
  valid?: boolean;
}

export interface IntentRuleSet {
  threshold: number;
  weights: {
    keyword: number;
    pattern: number;
    entity: number;
    feature: number;
    exclude: number;
  };
  /** merge order of the groups, highest first */
  merge: MergeGroup[];
  intents: Record<IntentId, IntentDef>;
  rules: IntentRule[];
}

declare module '../../../core/contracts' {
  interface ContentMap {
    intentLexicon: IntentLexicon;
    intentRules: IntentRuleSet;
  }
}

// ---------------------------------------------------------------------------
// Analysis and result

export interface EntityHit {
  kind: EntityKind;
  /** content id (persona, goddess, map, location, item, monster) or the matched word */
  id: string;
  /** the matched surface in the normalized clause */
  text: string;
  /** where the word came from: 'content' or a lexicon entity list name */
  source: string;
  start: number;
  end: number;
}

export interface ClauseFeatures {
  question: boolean;
  imperative: boolean;
  negation: boolean;
  first: boolean;
  second: boolean;
  polite: boolean;
  positive: boolean;
  negative: boolean;
  /** characters of the clause without punctuation and fillers */
  length: number;
}

export interface Clause {
  /** normalized clause text with punctuation */
  text: string;
  /** punctuation removed, entities masked by one private-use character each */
  masked: string;
  /** `masked` without the filler particles at both ends (anchored patterns) */
  core: string;
  entities: EntityHit[];
  features: ClauseFeatures;
}

export interface ScoreTerm {
  name: string;
  value: number;
}

export interface IntentScore {
  intent: IntentId;
  rule: string;
  score: number;
  priority: number;
  /** rule order in the table (tie-break after priority) */
  order: number;
  terms: ScoreTerm[];
}

export interface ClauseResult {
  clause: Clause;
  intent: IntentId;
  /** the winning score, 0 for unknown */
  score: number;
  /** every rule over zero, best first */
  ranked: IntentScore[];
}

export interface ClassifyContext {
  /** the NPC's last line asked something (offer, condition, yes or no) */
  afterQuestion?: boolean;
  /** a topic is being discussed */
  inTopic?: boolean;
  /** the last entity of the conversation, for pronouns (6.3 step 6) */
  lastEntity?: EntityHit;
  /** flag reader: hidden goddess names count as the forbidden name until revealed */
  flag?: (key: string) => unknown;
}

export interface ClassifyResult {
  /** the normalized input */
  normalized: string;
  clauses: ClauseResult[];
  main: IntentId;
  /** the second answered clause's intent (a short reaction only), or null */
  secondary: IntentId | null;
  /** index of the main clause */
  mainClause: number;
  entities: EntityHit[];
}
