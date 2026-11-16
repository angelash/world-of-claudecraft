// Line packs (builtin_ai.md 7, catalog_dialogue_lines.md 1): the pre-written voice of the
// no-model build. A pack holds slots, a slot holds lines (plain source text or a line with
// conditions), and a topic slot holds one list per version. Chinese source text lives in
// the data, never in the code (D-077): the kernel emits the line's text key plus the slot
// parameters and the client renders it.

/** Mood codes (catalog_dialogue_lines.md 4.7): fear, angry, worried, tired, happy, calm. */
export const MOODS = ['fear', 'angry', 'worried', 'tired', 'happy', 'calm'] as const;
export type Mood = (typeof MOODS)[number];

/** Place kinds a line may prefer (builtin_ai.md 7.4). */
export const PLACE_KINDS = [
  'tavern',
  'chapel',
  'market',
  'home',
  'workplace',
  'wild',
  'ruins',
  'court',
  'battlefield',
  'camp',
] as const;
export type PlaceKind = (typeof PLACE_KINDS)[number];

/** Trust bands of the greeting and part of the reactions (builtin_ai.md 7.4). */
export const TRUST_BANDS = ['cold', 'neutral', 'warm'] as const;
export type TrustBand = (typeof TRUST_BANDS)[number];

/** One line with its conditions. */
export interface LineEntry {
  /** source text (Chinese, D-077); the fill slots are {player}, {place}, ... */
  zh: string;
  /** reveal-ledger condition; the line is unavailable while it does not hold */
  when?: string;
  /** moods this line fits; a weighted preference unless `strict` */
  mood?: Mood[];
  /** place kinds this line fits; a weighted preference unless `strict` */
  place?: string[];
  /** make `mood` and `place` hard conditions */
  strict?: boolean;
  /** only on the first meeting */
  first?: boolean;
  /** base weight (default 1) */
  w?: number;
}

export type Line = string | LineEntry;
/**
 * The lines of a slot in index order. A deleted line stays as null (a hole): indexes are
 * only appended, never reused, so the saved line history and the translations keep
 * pointing at the same line (builtin_ai 7.1).
 */
export type LineList = (Line | null)[];
/** Versioned lines: K0..K5, a cognition state, actN, a trust band, a stance, or mis. */
export type VersionedLines = Record<string, LineList>;

export interface LinePack {
  /** ln_<npcId>, ln_role_<role>, ln_class_<class>, ln_tpl_<template>, ln_common, ln_party */
  id: string;
  /** the speaker this pack belongs to (absent on a shared layer) */
  speaker?: string;
  slots: Record<string, LineList | VersionedLines>;
  /** per-act overrides: acts.<actId>.<slot> wins inside that act */
  acts?: Record<string, Record<string, LineList | VersionedLines>>;
}

export function lineEntry(line: Line): LineEntry {
  return typeof line === 'string' ? { zh: line } : line;
}

/** True for a live line (not a deleted hole). */
export function isLine(line: Line | null | undefined): line is Line {
  return line !== null && line !== undefined;
}

export function isVersioned(v: LineList | VersionedLines | undefined): v is VersionedLines {
  return !!v && !Array.isArray(v);
}

declare module '../../../core/contracts' {
  interface ContentMap {
    linePacks: LinePack[];
  }
}
