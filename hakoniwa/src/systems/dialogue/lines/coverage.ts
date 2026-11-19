// Minimum coverage of a speaker's own line pack (builtin_ai.md 7.8, made concrete by
// catalog_dialogue_lines.md 1.5): every pack of a speaker category must itself provide the
// slots of its category (not through the fallback chain), and should reach the category's
// line count. Missing required slots are errors; a required slot with fewer lines than its
// share, or a pack under its total, is a warning (a batch may write a speaker in parts: the
// goddesses' act-1 batch is partial by design, catalog_dialogue_lines_act1.md 0).
//
// Categories come from the content, never from ids in code (speakerCategories):
//   G  a goddess (content.goddesses)
//   C  a main companion (content.companions tier main) whose recruiting can hold by the
//      written stage; F the same for an escort companion. Before that act the person is
//      checked by the persona category, as the catalog writes them then (1.5 rule 3: Nera
//      is a core person in act 1 and a companion from act 2). The join act is the latest
//      act of the registered variables the recruit condition reads (none: from the start).
//   K  a core persona (core: true); N any other persona
//   T  a resident template pack ln_tpl_<template>; B a crowd bark pool bark_<pool>
// The shared layers (ln_common, ln_role_, ln_class_, ln_party) and packs of no known speaker
// have no category. A speaker with no pack is not checked here (which speakers need a pack
// is pinned by the tests of the batch that writes them).
//
// "Own pack provides a slot": the slot has live lines in the pack's base slots or in any
// act override. What is checked per category (1.5):
//   greet   K and C: every band split by day and night (greet.<band>.day and .night), 3 each;
//           N and F: every band (greet.<band>, or both its day parts), 3 each; T: every band,
//           6 in all; G: every band on every channel her pack greets on, 3 each, and at
//           least one channel
//   farewell 3 (T 2)
//   unbelief deny, explain and waver, 3 each for K and C, 2 for the rest; a knower writes
//           topic.gen_you in the cognition versions doubt, explaining and wavering instead
//           (1.5 rule 5), with as many lines as the three tiers
//   react   K: feat_seen, gift_liked, gift_disliked, insult, thanked, flattered, threatened,
//           helped, saved, identity_claim, accused; C adds the conversation acts, gifts and
//           trade, and recruiting and roles groups (7.5); N: feat_seen, gift_liked, insult;
//           F adds recruit_yes, recruit_terms, recruit_later, recruit_no, gift_plain,
//           gift_disliked; 2 lines each
//   topic   K and C: at least 6 versioned topics; N and F: gen_self, gen_work and one topic
//           outside gen_; T: gen_work, 2 lines; G: gen_self and gen_you
//   bark    K and C: the bark of every activity of the person's schedule, 2 each (sleep
//           excepted: nobody barks asleep, src/systems/npc/brain/barks.ts); C and F also the
//           five fight contexts combat, hurt, victory, ally_down, flee, 2 each; T: some bark,
//           4 in all
//   B       lines with at least three mood or time-of-day preferences (each mood code, and
//           the lines whose condition reads the hour, as one), each a tenth of the pool
// Not checked (their data lives elsewhere): the goddess-only reaction kinds, anchors and
// court stances (catalog_goddess_interventions.md and the goddess package), the belief_*
// a person can reach, every act's greeting and gen_you of a companion, the personal-line
// quest stages, and react.declined by moral tag.
// Pure: no RNG, no clock.

import { defaultRegistry } from '../../../core/registry';
import { referencedVars } from '../../quests/conditions';
import { CHANNELS, DAY_PARTS, REACT_KINDS, TRUST_BAND_KEYS, UNBELIEF_TIERS } from './grammar';
import { isLine, isVersioned, type LineList, type LinePack, type VersionedLines } from './types';

export const SPEAKER_CATEGORIES = ['G', 'C', 'F', 'K', 'N', 'T', 'B'] as const;
export type SpeakerCategory = (typeof SPEAKER_CATEGORIES)[number];

/** Least lines of a pack by category (builtin_ai 7.8, 14.1; catalog 1.5). */
export const MIN_PACK_LINES: Readonly<Record<SpeakerCategory, number>> = {
  G: 250,
  C: 200,
  F: 70,
  K: 80,
  N: 30,
  T: 20,
  B: 30,
};

/** The reaction kinds of the conversation acts group (builtin_ai 7.5). */
export const REACT_CONVERSATION: readonly string[] = [
  'thanked',
  'apology_accept',
  'apology_reject',
  'flattered',
  'insult',
  'threatened',
  'joke',
  'advance',
  'boast',
  'identity_claim',
  'accused',
  'persuaded',
  'unpersuaded',
  'promise_noted',
  'declined',
  'nothing_more',
  'confused',
  'nonsense',
];
/** The reaction kinds of the gifts and trade group (builtin_ai 7.5). */
export const REACT_TRADE: readonly string[] = [
  'gift_liked',
  'gift_plain',
  'gift_disliked',
  'haggle_ok',
  'haggle_no',
  'bribe_accept',
  'bribe_refuse',
  'wrong_person',
  'no_work',
  'decline',
];
/** The reaction kinds of the recruiting and roles group (builtin_ai 7.5). */
export const REACT_RECRUIT: readonly string[] = [
  'recruit_yes',
  'recruit_terms',
  'recruit_later',
  'recruit_no',
  'self_recommend',
  'request_battle',
  'rival_taunt',
  'rival_concede',
  'call_favor',
  'ask_help',
  'invite',
];
/** The reactions a core person writes (catalog 1.5 K). */
export const REACT_CORE: readonly string[] = [
  'feat_seen',
  'gift_liked',
  'gift_disliked',
  'insult',
  'thanked',
  'flattered',
  'threatened',
  'helped',
  'saved',
  'identity_claim',
  'accused',
];
/** The reactions any other named person writes (catalog 1.5 N). */
export const REACT_NAMED: readonly string[] = ['feat_seen', 'gift_liked', 'insult'];
/** What an escort companion adds to N (catalog 1.5 F). */
export const REACT_ESCORT: readonly string[] = [
  'recruit_yes',
  'recruit_terms',
  'recruit_later',
  'recruit_no',
  'gift_plain',
  'gift_disliked',
];
/** The fight barks of every companion (catalog 1.5 C and F). */
export const FIGHT_BARKS: readonly string[] = ['combat', 'hurt', 'victory', 'ally_down', 'flee'];
/** The cognition versions a knower writes instead of the three unbelief tiers (1.5 rule 5). */
export const KNOWER_VERSIONS: readonly string[] = ['doubt', 'explaining', 'wavering'];

export interface SpeakerInfo {
  category: SpeakerCategory;
  /** schedule activities whose bark the person writes (K and C; sleep left out) */
  activities?: readonly string[];
}

/** The content a roster reads (structural, so ContentMap fits). */
export interface CoverageContent {
  goddesses?: readonly { id: string }[];
  companions?: readonly { id: string; tier?: string; recruit?: { when?: string } }[];
  npcs?: readonly {
    id: string;
    core?: boolean;
    schedule: string | readonly { act: string }[];
  }[];
  npcSchedules?: readonly { id: string; segments: readonly { act: string }[] }[];
}

/** The act from which a recruit condition can hold: the latest act of the variables it reads. */
export function joinAct(when: string | undefined): number {
  if (!when) return 0;
  let act = 0;
  for (const name of referencedVars(when)) {
    const a = defaultRegistry().resolve(name)?.def.act;
    if (typeof a === 'number' && a > act) act = a;
  }
  return act;
}

/**
 * The speaker category of every goddess, companion and persona (pack id ln_<speaker>), as
 * the batches written through act `stage` write them (stage 1: prologue and act 1).
 */
export function speakerCategories(
  content: CoverageContent,
  opts: { stage: number },
): Map<string, SpeakerInfo> {
  const out = new Map<string, SpeakerInfo>();
  const schedules = new Map((content.npcSchedules ?? []).map((s) => [s.id, s.segments]));
  const activitiesOf = (id: string): string[] | undefined => {
    const p = (content.npcs ?? []).find((x) => x.id === id);
    if (!p) return undefined;
    const segs = typeof p.schedule === 'string' ? schedules.get(p.schedule) : p.schedule;
    if (!segs) return undefined;
    const acts: string[] = [];
    for (const s of segs) if (s.act !== 'sleep' && !acts.includes(s.act)) acts.push(s.act);
    return acts;
  };
  for (const p of content.npcs ?? [])
    out.set(p.id, { category: p.core ? 'K' : 'N', activities: activitiesOf(p.id) });
  for (const c of content.companions ?? []) {
    if (joinAct(c.recruit?.when) > opts.stage) continue;
    out.set(c.id, { category: c.tier === 'escort' ? 'F' : 'C', activities: activitiesOf(c.id) });
  }
  for (const g of content.goddesses ?? []) out.set(g.id, { category: 'G' });
  return out;
}

const SHARED = /^(ln_common$|ln_party$|ln_role_|ln_class_)/;

/** The category of a pack, or null for a shared layer or a pack of no known speaker. */
export function packCategory(
  pack: Pick<LinePack, 'id' | 'speaker'>,
  speakers: ReadonlyMap<string, SpeakerInfo>,
): SpeakerInfo | null {
  if (pack.id.startsWith('bark_')) return { category: 'B' };
  if (SHARED.test(pack.id)) return null;
  if (pack.id.startsWith('ln_tpl_')) return { category: 'T' };
  const speaker = pack.speaker ?? (pack.id.startsWith('ln_') ? pack.id.slice(3) : '');
  return speakers.get(speaker) ?? null;
}

type Slots = Record<string, LineList | VersionedLines>;

function sourcesOf(pack: LinePack): Slots[] {
  return [pack.slots ?? {}, ...Object.values(pack.acts ?? {})];
}

function live(entry: LineList | VersionedLines | undefined): number {
  if (!entry) return 0;
  const lists = isVersioned(entry) ? Object.values(entry) : [entry];
  let n = 0;
  for (const l of lists) if (Array.isArray(l)) n += l.filter(isLine).length;
  return n;
}

/** Live lines of a slot in the pack's base slots and act overrides together. */
export function slotLines(pack: LinePack, slot: string): number {
  return sourcesOf(pack).reduce((n, s) => n + live(s[slot]), 0);
}

/** Version keys of a slot that hold live lines (base and act overrides). */
function versionsOf(pack: LinePack, slot: string): Set<string> {
  const out = new Set<string>();
  for (const s of sourcesOf(pack)) {
    const e = s[slot];
    if (e && isVersioned(e))
      for (const [v, l] of Object.entries(e)) if (Array.isArray(l) && l.some(isLine)) out.add(v);
  }
  return out;
}

/** Every slot name with live lines (base and act overrides). */
function slotNames(pack: LinePack): string[] {
  const out = new Set<string>();
  for (const s of sourcesOf(pack)) for (const k of Object.keys(s)) if (live(s[k]) > 0) out.add(k);
  return [...out];
}

/** Every live line of a pack, act overrides included, holes excluded (catalog 1.5 rule 1). */
export function packLineCount(pack: LinePack): number {
  return sourcesOf(pack).reduce((n, s) => n + Object.values(s).reduce((m, e) => m + live(e), 0), 0);
}

export interface CoverageFinding {
  level: 'error' | 'warning';
  pack: string;
  category: SpeakerCategory;
  /** the slot (or slot family) the finding is about; absent for the pack total */
  slot?: string;
  message: string;
}

interface Need {
  slot: string;
  present: boolean;
  lines: number;
  min: number;
  /** what else satisfies it, named in the message */
  or?: string;
}

const need = (pack: LinePack, slot: string, min: number): Need => {
  const lines = slotLines(pack, slot);
  return { slot, present: lines > 0, lines, min };
};

function greetNeeds(pack: LinePack, cat: SpeakerCategory): Need[] {
  const out: Need[] = [];
  if (cat === 'G') {
    const channels = CHANNELS.filter((c) =>
      TRUST_BAND_KEYS.some((b) => slotLines(pack, `greet.${b}.${c}`) > 0),
    );
    if (channels.length === 0)
      out.push({ slot: 'greet.<band>.<channel>', present: false, lines: 0, min: 3 });
    for (const c of channels)
      for (const b of TRUST_BAND_KEYS) out.push(need(pack, `greet.${b}.${c}`, 3));
    return out;
  }
  if (cat === 'K' || cat === 'C') {
    for (const b of TRUST_BAND_KEYS)
      for (const part of DAY_PARTS) out.push(need(pack, `greet.${b}.${part}`, 3));
    return out;
  }
  for (const b of TRUST_BAND_KEYS) {
    const plain = slotLines(pack, `greet.${b}`);
    const day = slotLines(pack, `greet.${b}.day`);
    const night = slotLines(pack, `greet.${b}.night`);
    out.push({
      slot: `greet.${b}`,
      present: plain > 0 || (day > 0 && night > 0),
      lines: plain + day + night,
      // a template writes six greetings over its three bands (checked on the total)
      min: cat === 'T' ? 0 : 3,
    });
  }
  if (cat === 'T') {
    const total = out.reduce((n, x) => n + x.lines, 0);
    out.push({ slot: 'greet', present: true, lines: total, min: 6 });
  }
  return out;
}

function unbeliefNeeds(pack: LinePack, cat: SpeakerCategory): Need[] {
  const per = cat === 'K' || cat === 'C' ? 3 : 2;
  const tiers = UNBELIEF_TIERS.map((t) => need(pack, `unbelief.${t}`, per));
  if (tiers.every((t) => t.present)) return tiers;
  const versions = versionsOf(pack, 'topic.gen_you');
  if (KNOWER_VERSIONS.every((v) => versions.has(v)))
    return [
      {
        slot: 'topic.gen_you',
        present: true,
        lines: slotLines(pack, 'topic.gen_you'),
        min: per * UNBELIEF_TIERS.length,
      },
    ];
  const alt = `a knower writes topic.gen_you in the versions ${KNOWER_VERSIONS.join(', ')}`;
  return tiers.map((t) => ({ ...t, or: alt }));
}

function topicNeeds(pack: LinePack, cat: SpeakerCategory): Need[] {
  const topics = slotNames(pack).filter((s) => s.startsWith('topic.'));
  if (cat === 'K' || cat === 'C') {
    const versioned = topics.filter((s) => versionsOf(pack, s).size > 0).length;
    return [
      {
        slot: 'topic.*',
        present: versioned >= 6,
        lines: versioned,
        min: 0,
        or: `at least 6 versioned topics, ${versioned} written`,
      },
    ];
  }
  if (cat === 'N' || cat === 'F') {
    const own = topics.some((s) => !s.startsWith('topic.gen_'));
    return [
      need(pack, 'topic.gen_self', 1),
      need(pack, 'topic.gen_work', 1),
      {
        slot: 'topic.<own>',
        present: own,
        lines: own ? 1 : 0,
        min: 0,
        or: 'one topic outside gen_',
      },
    ];
  }
  if (cat === 'T') return [need(pack, 'topic.gen_work', 2)];
  return [need(pack, 'topic.gen_self', 1), need(pack, 'topic.gen_you', 1)];
}

function reactNeeds(pack: LinePack, cat: SpeakerCategory): Need[] {
  let kinds: readonly string[] = [];
  if (cat === 'K') kinds = REACT_CORE;
  else if (cat === 'C')
    kinds = [...new Set([...REACT_CORE, ...REACT_CONVERSATION, ...REACT_TRADE, ...REACT_RECRUIT])];
  else if (cat === 'N') kinds = REACT_NAMED;
  else if (cat === 'F') kinds = [...new Set([...REACT_NAMED, ...REACT_ESCORT])];
  return kinds.map((k) => need(pack, `react.${k}`, 2));
}

function barkNeeds(pack: LinePack, info: SpeakerInfo): Need[] {
  const cat = info.category;
  const out: Need[] = [];
  if (cat === 'K' || cat === 'C')
    for (const a of info.activities ?? []) out.push(need(pack, `bark.${a}`, 2));
  if (cat === 'C' || cat === 'F') for (const b of FIGHT_BARKS) out.push(need(pack, `bark.${b}`, 2));
  if (cat === 'T') {
    const total = slotNames(pack)
      .filter((s) => s.startsWith('bark.'))
      .reduce((n, s) => n + slotLines(pack, s), 0);
    out.push({ slot: 'bark.*', present: total > 0, lines: total, min: 4 });
  }
  return out;
}

/** Share of a pool's lines one preference must reach to count (catalog 1.5 B). */
export const POOL_PREFERENCE_SHARE = 0.1;
/** Preferences a pool needs at that share (builtin_ai 7.8). */
export const POOL_PREFERENCES = 3;

/** The mood and time-of-day preferences of a bark pool with their line counts. */
export function poolPreferences(pack: LinePack): { total: number; by: Map<string, number> } {
  const by = new Map<string, number>();
  let total = 0;
  for (const s of sourcesOf(pack))
    for (const e of Object.values(s)) {
      const lists = isVersioned(e) ? Object.values(e) : [e];
      for (const list of lists)
        for (const line of list ?? []) {
          if (!isLine(line)) continue;
          total++;
          if (typeof line === 'string') continue;
          for (const m of line.mood ?? []) by.set(`mood:${m}`, (by.get(`mood:${m}`) ?? 0) + 1);
          if (line.when && /\bhour\b/.test(line.when)) by.set('time', (by.get('time') ?? 0) + 1);
        }
    }
  return { total, by };
}

function poolFindings(pack: LinePack): CoverageFinding[] {
  const { total, by } = poolPreferences(pack);
  const enough = [...by.values()].filter((n) => total > 0 && n / total >= POOL_PREFERENCE_SHARE);
  if (enough.length >= POOL_PREFERENCES) return [];
  return [
    {
      level: 'error',
      pack: pack.id,
      category: 'B',
      slot: 'mood',
      message: `a bark pool needs ${POOL_PREFERENCES} mood or time preferences at a tenth of its lines each, has ${enough.length}`,
    },
  ];
}

/** The coverage findings of one pack whose category is known. */
export function packCoverage(pack: LinePack, info: SpeakerInfo): CoverageFinding[] {
  const cat = info.category;
  const out: CoverageFinding[] = [];
  if (cat === 'B') out.push(...poolFindings(pack));
  else {
    const needs = [
      ...greetNeeds(pack, cat),
      need(pack, 'farewell', cat === 'T' ? 2 : 3),
      ...(cat === 'G' ? [] : unbeliefNeeds(pack, cat)),
      ...reactNeeds(pack, cat),
      ...topicNeeds(pack, cat),
      ...barkNeeds(pack, info),
    ];
    for (const n of needs) {
      if (!n.present)
        out.push({
          level: 'error',
          pack: pack.id,
          category: cat,
          slot: n.slot,
          message: `category ${cat} needs ${n.slot} in its own pack${n.or ? ` (${n.or})` : ''}`,
        });
      else if (n.lines < n.min)
        out.push({
          level: 'warning',
          pack: pack.id,
          category: cat,
          slot: n.slot,
          message: `${n.slot} has ${n.lines} of the ${n.min} lines of category ${cat}`,
        });
    }
  }
  const total = packLineCount(pack);
  const min = MIN_PACK_LINES[cat];
  if (total < min)
    out.push({
      level: 'warning',
      pack: pack.id,
      category: cat,
      message: `${total} lines, ${min - total} short of the ${min} of category ${cat}`,
    });
  return out;
}

/** The coverage findings of a set of packs (builtin_ai 7.8; catalog 1.5). */
export function coverageFindings(
  packs: readonly LinePack[],
  speakers: ReadonlyMap<string, SpeakerInfo>,
): CoverageFinding[] {
  const out: CoverageFinding[] = [];
  for (const pack of packs) {
    if (typeof pack.id !== 'string') continue;
    const info = packCategory(pack, speakers);
    if (info) out.push(...packCoverage(pack, info));
  }
  return out;
}

/** Every reaction group named here is a registered kind (pinned by the tests). */
export function unregisteredCoverageKinds(): string[] {
  return [
    ...REACT_CONVERSATION,
    ...REACT_TRADE,
    ...REACT_RECRUIT,
    ...REACT_CORE,
    ...REACT_ESCORT,
  ].filter((k) => !REACT_KINDS.includes(k));
}
