// Types of the records system (PK-M1-48): deeds and titles (catalog_deeds_titles.md 1.2 to
// 1.6, 2.2, 2.4, 2.8), the codex discovery ledger (ux_and_onboarding.md 6.3.2) and letters
// (6.3.8). Every trigger reads world state that already exists: registry conditions (flags,
// meters, quest and door states, other deeds), the codex ledger (items ever held, persons
// met, kills). Deeds and titles are cosmetic: no record carries a stat, an effect or a
// modifier (catalog_deeds_titles.md 2.8).

import type { FlagValue } from '../../core/contracts';

// ---------------------------------------------------------------------------
// Content

/** Deed classes (catalog_deeds_titles.md 3, the class codes of the `deed_<cls>_` ids). */
export const DEED_CLASSES = [
  'grow',
  'hunt',
  'rare',
  'dg',
  'exp',
  'col',
  'bond',
  'mgmt',
  'war',
  'god',
  'truth',
  'mortal',
  'hid',
  'feat',
] as const;
export type DeedClass = (typeof DEED_CLASSES)[number];

/** Fame bands of one deed (catalog_deeds_titles.md 1.4): a count, never power. */
export const FAME_BANDS = [0, 5, 10, 25, 50] as const;
export type Fame = (typeof FAME_BANDS)[number];

/**
 * How a deed entered the book (catalog_deeds_titles.md 2.2 "被记下"): witnessed by the
 * recorder or someone trusted, corroborated by testimony or an object, or only claimed.
 * A grade can be raised later, never lowered.
 */
export const GRADES = ['claimed', 'corroborated', 'witnessed'] as const;
export type Grade = (typeof GRADES)[number];

/** A lifetime counter the records kernel keeps (catalog_deeds_titles.md 1.3 `stat`). */
export interface StatTrigger {
  /** `kills`, `kills.<monster id>` or `codex.<tab>` (entries discovered on that tab) */
  key: string;
  min: number;
}

/** A gate object whose only field is a registry condition (read by the V4 walk). */
export interface WhenGate {
  when: string;
}

export interface DeedDef {
  /** `deed_<cls>_<name>` */
  id: string;
  /** display name (hidden deeds show nothing until earned) */
  name: string;
  /** what was done, as the book shows it */
  desc?: string;
  cls: DeedClass;
  /** earliest act it can be earned in (0 prologue, 1 to 6, 7 epilogue) */
  act: number;
  fame: Fame;
  /**
   * Trigger: a registry condition (`flag`, `cond`, `quest`, `meter`, `doorState` and `meta`
   * of the catalog are all conditions over registered variables).
   */
  when?: string;
  /** trigger: a lifetime counter threshold */
  stat?: StatTrigger;
  /** trigger: every item listed was held at some point (`collectItems`) */
  held?: string[];
  /** trigger: every person listed has been met (`visit` of `npc:<id>`) */
  met?: string[];
  /**
   * Granted only at an explicit settle point (`records.deed.grant` from a system or a
   * script); the other trigger fields then gate the grant.
   */
  manual?: boolean;
  /** hidden: not shown and not counted before it is earned (隐) */
  hidden?: boolean;
  /** a feat: zero fame, never counted for completion, stays visible (壮) */
  feat?: boolean;
  /**
   * A branch deed (catalog 1.4): it waits on a world branch. While this condition holds and
   * the deed is not earned it reads "did not happen this cycle"; it is never counted before
   * it is earned.
   */
  branch?: WhenGate;
  /** grade written when earned (default `claimed`) */
  grade?: Grade;
  reward?: DeedReward;
  /** value channel codes (content_bible.md 2.1), main channel first; for audits */
  channels?: string[];
}

/** The only rewards a deed gives (catalog 2.8): a title, or a place on the pillar. */
export interface DeedReward {
  title?: string;
  /** the deed may be carved on the pillar of the inner court (记事柱一格) */
  pillar?: boolean;
}

/** Title kinds the player can hold (catalog 2.4): a street name, or an office name. */
export const TITLE_KINDS = ['common', 'office'] as const;
export type TitleKind = (typeof TITLE_KINDS)[number];

/** Title families (catalog_deeds_titles.md 4, the `title_<family>_` ids). */
export const TITLE_FAMILIES = [
  'street',
  'guild',
  'crown',
  'tribe',
  'church',
  'wrong',
  'infamy',
  'col',
  'rare',
  'dg',
  'bond',
  'war',
  'people',
  'late',
  'court',
] as const;
export type TitleFamily = (typeof TITLE_FAMILIES)[number];

export interface TitleDef {
  /** `title_<family>_<name>` */
  id: string;
  /** the title as people say it */
  name: string;
  /** common names only change how people call you; office names can be worn */
  kind: TitleKind;
  family: TitleFamily;
  act: number;
  /** who names it (授予) */
  grantedBy: string;
  /** who can see it */
  visibleTo: string;
  /** how it is lost */
  loss: string;
  /** granted when this holds (a deed reward grants it too) */
  grant?: WhenGate;
  /** lost (superseded, revoked, faded) when this holds; a lost title stays lost */
  lose?: WhenGate;
}

/** Codex tabs (ux_and_onboarding.md 6.3.2). */
export const CODEX_TABS = [
  'people',
  'monsters',
  'creatures',
  'items',
  'books',
  'collections',
  'memories',
] as const;
export type CodexTab = (typeof CODEX_TABS)[number];

/** Where a codex note comes from (6.3.2 "每条带来源标记"). */
export const CODEX_SOURCES = ['seen', 'talk', 'rumor', 'appraisal', 'book', 'mortal'] as const;
export type CodexSource = (typeof CODEX_SOURCES)[number];

/** One discoverable codex note: what you know about a subject, and how you know it. */
export interface CodexEntryDef {
  /** `cdx_<subject>_<topic>` */
  id: string;
  tab: CodexTab;
  /** the person, monster, item, book, collection or scene it is about */
  subject: string;
  source: CodexSource;
  text: string;
  /** discovered once the subject is discovered and this holds */
  when?: string;
  act: number;
}

/** Seals of a letter (6.3.8 印记). */
export const LETTER_SEALS = ['official', 'church', 'merchant', 'private'] as const;
export type LetterSeal = (typeof LETTER_SEALS)[number];

export interface LetterParagraph {
  id: string;
  text: string;
  /** the paragraph is written only when this holds at sending time */
  when?: string;
}

export interface LetterReply {
  id: string;
  label: string;
  /** the reply is offered only while this holds */
  when?: string;
}

export interface LetterAttachment {
  item: string;
  count?: number;
}

export interface LetterDef {
  /** `ltr_<act>_<name>` */
  id: string;
  act: number;
  /** a person of the content (npcs or companions), when the sender is one */
  sender?: string;
  /** the sender's display name when the sender is no person of the content */
  senderName?: string;
  seal: LetterSeal;
  subject: string;
  /** sent when this holds */
  deliver: WhenGate;
  /** game hours on the road after sending (0: delivered at once) */
  transitHours?: number;
  /** paragraphs; the ones whose `when` holds at sending time are frozen into the letter */
  body: LetterParagraph[];
  attachments?: LetterAttachment[];
  replies?: LetterReply[];
}

/** Book forms by act (catalog_deeds_titles.md 2.11): same data, other paper. */
export const BOOK_STAGES = ['carvings', 'handbook', 'register', 'court'] as const;
export type BookStage = (typeof BOOK_STAGES)[number];

export interface PillarTier {
  slots: number;
  /** the tier applies while this holds (no condition: always) */
  when?: string;
}

/** Tunables of the records kernel (data/records/config.json). */
export interface RecordsConfig {
  /** the pillar of the inner court (catalog 2.8): unlocked by `requires`, size by tier */
  pillar: { requires?: string; tiers: PillarTier[] };
  /** book form from an act on (first matching from the highest `fromAct`) */
  stages: { stage: BookStage; fromAct: number }[];
}

// ---------------------------------------------------------------------------
// Slice

export interface DeedRecord {
  tick: number;
  grade: Grade;
}

export interface TitleRecord {
  tick: number;
  /** the deed whose reward granted it */
  deed?: string;
  /** tick it was lost; a lost title cannot be worn */
  lost?: number;
}

/** First and last time a codex subject was met, and how often. */
export interface CodexSubject {
  first: number;
  last: number;
  /** meetings (people), kills by the player's side (monsters), acquisitions (items) */
  count: number;
  /** map of the last meeting (people) */
  map?: string;
}

export type CodexBook = Record<CodexTab, Record<string, CodexSubject>>;

export const LETTER_STATES = ['transit', 'delivered', 'read', 'replied'] as const;
export type LetterState = (typeof LETTER_STATES)[number];

export interface LetterRecord {
  state: LetterState;
  sent: number;
  arrives: number;
  delivered?: number;
  read?: number;
  /** paragraph ids frozen at sending time, in order */
  body: string[];
  taken?: boolean;
  reply?: string;
}

export interface RecordsSlice {
  /**
   * World state changed since the last settle: deeds, titles, codex notes and letters are
   * re-evaluated at the next tick (catalog 1.3: settle at the end, only when dirty).
   */
  dirty: boolean;
  deeds: Record<string, DeedRecord>;
  titles: Record<string, TitleRecord>;
  /** the office title worn, or null */
  worn: string | null;
  /** deed ids carved on the pillar, by slot (null: empty) */
  pillar: (string | null)[];
  codex: CodexBook;
  /** codex notes discovered: entry id to tick */
  notes: Record<string, number>;
  letters: Record<string, LetterRecord>;
  /** earliest arrival tick of a letter on the road, or -1 */
  mailDue: number;
  /** fingerprint of the records content the slice last settled under ('' before the first) */
  content: string;
}

/** A condition resolver over the world flags (quests/conditions flagResolver). */
export type Resolve = (name: string) => FlagValue | undefined;
