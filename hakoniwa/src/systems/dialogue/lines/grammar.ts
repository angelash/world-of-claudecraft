// The slot grammar of line packs (builtin_ai.md 7.2, 7.5, 7.6, 7.9; catalog_dialogue_lines.md
// 1.6, 2.2, 4): closed sets of slot families, reaction kinds, bark contexts, topic versions,
// quest stages, act ids and fill slots, the per-family length limits, and the repetition
// suppression window of each family (7.7). Pure data and pure checks; shared by the
// selector and the content validators (tools/content/validators/lines.ts).

import { defaultRegistry } from '../../../core/registry';

/** react.<eventKind> (builtin_ai 7.5); goddess-only kinds come from her catalog (react_<x>). */
export const REACT_KINDS: readonly string[] = [
  // deeds and rumors
  'feat_seen',
  'feat_heard',
  'rumor_self',
  'awe_fear',
  'miracle_awe',
  'heresy_alarm',
  // identity exposure
  'identity_pageless',
  'identity_door',
  'identity_guest',
  'identity_gatemark',
  'identity_pressure',
  'identity_matched',
  'gatefolk_recognize',
  'challenge',
  // cognition forks
  'belief_worship',
  'belief_hostile',
  'belief_exploit',
  'belief_depend',
  'switch',
  // debts and grudges
  'helped',
  'saved',
  'harmed',
  'cheated',
  'mourning',
  // conversation acts
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
  // gifts and trade
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
  // ledger refusals
  'deny',
  'evade',
  'unknown',
  'hint',
  // recruiting and roles
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
  // goddesses and faith
  'goddess_invoked',
  'earth_talk',
  'earth_refuse',
];

/** bark.<context> (builtin_ai 7.6). */
export const BARK_CONTEXTS: readonly string[] = [
  // activities
  'work',
  'eat',
  'sleep',
  'pray',
  'chat',
  'shop',
  'wander',
  'home',
  'travel',
  'patrol',
  'sermon',
  'vendor_call',
  'camp',
  // time and weather
  'morning',
  'evening',
  'night',
  'rain',
  'snow',
  'storm',
  'fog',
  'ashfall',
  // mood
  'fear',
  'angry',
  'worried',
  'tired',
  'happy',
  // situation
  'danger',
  'combat',
  'hurt',
  'flee',
  'victory',
  'ally_down',
  'festival',
  'holy_day',
  'market_day',
  'wartime',
  'monster_season',
  'see_player',
  'see_feat',
  'crowd',
  'dream',
];

export const TRUST_BAND_KEYS: readonly string[] = ['cold', 'neutral', 'warm'];
export const DAY_PARTS: readonly string[] = ['day', 'night'];
/** Goddess greeting channels (builtin_ai 7.2, catalog 1.6). */
export const CHANNELS: readonly string[] = ['coin', 'shrine', 'dream', 'avatar'];
export const UNBELIEF_TIERS: readonly string[] = ['deny', 'explain', 'waver'];
export const QUEST_STAGES: readonly string[] = [
  'offer',
  'accept',
  'decline',
  'progress',
  'complete',
  'fail',
  'after',
];
/**
 * acts.<actId> (builtin_ai 7.2): a value of the act flag's enum in the variable registry
 * (world_state_registry.md 8.1), the one list of act names.
 */
export function isActId(v: string): boolean {
  return defaultRegistry().resolve('act')?.def.values?.includes(v) ?? false;
}
export const KNOWLEDGE_VERSIONS: readonly string[] = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];
/** Cognition versions of topic.gen_you and kin (builtin_ai 7.2; accepted is the unforked state). */
export const COGNITION_VERSIONS: readonly string[] = [
  'unaware',
  'doubt',
  'explaining',
  'wavering',
  'accepted',
  'worship',
  'hostile',
  'exploit',
  'depend',
];
/** Fixed topic version keys (builtin_ai 7.2): knowledge, cognition, trust band, mis (acts: isActId). */
export const TOPIC_VERSIONS: ReadonlySet<string> = new Set([
  ...KNOWLEDGE_VERSIONS,
  ...COGNITION_VERSIONS,
  ...TRUST_BAND_KEYS,
  'mis',
]);

/** Topics versioned by stance (builtin_ai 8.10): any lowercase stance code is a version. */
export function stanceVersioned(topicId: string): boolean {
  return topicId.startsWith('court_') || topicId === 'revelation_ops';
}

/** Why a topic version key is illegal, or null. */
export function versionProblem(slot: string, version: string): string | null {
  const topic = slot.startsWith('topic.') ? slot.slice(6) : '';
  if (TOPIC_VERSIONS.has(version) || isActId(version)) return null;
  if (stanceVersioned(topic) && ID.test(version)) return null;
  return `version ${version} of ${slot} is not a knowledge tier, cognition state, act, trust band, stance or mis`;
}

/** Topic id prefixes (builtin_ai 6.2, catalog 3.1); goddess topics add revelation_ and court_. */
export const TOPIC_PREFIXES: readonly string[] = [
  'gen_',
  'self_',
  'place_',
  'person_',
  'event_',
  'lore_',
  'faith_',
  'danger_',
  'quest_',
  'secret_',
  'revelation_',
  'court_',
];

/** Template families of the shared layers (builtin_ai 7.3 step 7, catalog 4.6 to 4.13). */
export const TEMPLATE_FAMILIES: readonly string[] = [
  'mem',
  'diary',
  'rumor',
  'feat',
  'expl',
  'banter',
  'doc',
  'interp',
];

/** Fill slots a line may use (builtin_ai 7.9; {rumor} parts and {other} of banter included). */
export const FILL_SLOTS: ReadonlySet<string> = new Set([
  'player',
  'name',
  'who',
  'other',
  'place',
  'next',
  'dir',
  'landmark',
  'dist',
  'item',
  'num',
  'price',
  'feat',
  'event',
  'rumor',
  'expl',
  'memory',
  'diary',
  'topic_hint',
  'catch',
  'goddess',
]);

const SLOT_TOKEN = /\{([a-z_]+)\}/g;

/** The {fill} slots a line's text uses, in order of first use. */
export function fillSlotsOf(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(SLOT_TOKEN))
    if (!out.includes(m[1] as string)) out.push(m[1] as string);
  return out;
}

const ID = /^[a-z0-9_]+$/;
const has = (list: readonly string[], v: string | undefined) => v !== undefined && list.includes(v);

/**
 * Why a slot name is outside the grammar (builtin_ai 7.2), or null when it is legal. The
 * version of a topic is not part of the slot name (it is the key inside a versioned slot);
 * a goddess-only reaction kind is legal when `extraReact` lists it.
 */
export function slotProblem(
  slot: string,
  extraReact: ReadonlySet<string> = new Set(),
): string | null {
  const p = slot.split('.');
  const [family, a, b] = p;
  switch (family) {
    case 'greet':
      if (p.length > 3) return 'greet takes at most greet.<band>.<day part or channel>';
      if (a !== undefined && !has(TRUST_BAND_KEYS, a))
        return `greet band ${a} is not cold, neutral or warm`;
      if (b !== undefined && !has(DAY_PARTS, b) && !has(CHANNELS, b))
        return `greet suffix ${b} is not a day part or a channel`;
      return null;
    case 'farewell':
      return p.length === 1 ? null : 'farewell takes no suffix';
    case 'topic': {
      if (p.length !== 2 || !a) return 'topic takes topic.<topicId>';
      if (!ID.test(a) || !TOPIC_PREFIXES.some((x) => a.startsWith(x)))
        return `topic id ${a} has no registered prefix`;
      return null;
    }
    case 'react': {
      if (!a) return 'react takes react.<eventKind>';
      if (a === 'switch') {
        if (p.length > 3) return 'react.switch takes at most one explanation';
        return b === undefined || ID.test(b) ? null : `react.switch explanation ${b} is not an id`;
      }
      if (p.length !== 2) return `react.${a} takes no suffix`;
      if (!REACT_KINDS.includes(a) && !extraReact.has(a))
        return `react kind ${a} is not registered`;
      return null;
    }
    case 'quest':
      if (p.length !== 3 || !a || !ID.test(a)) return 'quest takes quest.<questId>.<stage>';
      if (!has(QUEST_STAGES, b)) return `quest stage ${b} is not one of ${QUEST_STAGES.join(', ')}`;
      return null;
    case 'bark':
      if (p.length !== 2) return 'bark takes bark.<context>';
      return has(BARK_CONTEXTS, a) ? null : `bark context ${a} is not registered`;
    case 'unbelief':
      // unbelief.explain.<explanation>: the explanation-specific lines of the second tier
      // (the former react.explain.* rule lines, catalog 4.14); the selector shortens a
      // missing one to unbelief.explain (7.3 step 3)
      if (p.length > 3 || (p.length === 3 && a !== 'explain'))
        return 'unbelief takes unbelief.<tier>, or unbelief.explain.<explanation>';
      if (b !== undefined && !ID.test(b)) return `unbelief explanation ${b} is not an id`;
      return has(UNBELIEF_TIERS, a) ? null : `unbelief tier ${a} is not deny, explain or waver`;
    case 'party':
      return p.length === 2 && a && ID.test(a) ? null : 'party takes party.<exchangeId>';
    default:
      if (family !== undefined && TEMPLATE_FAMILIES.includes(family)) {
        return p.every((x) => ID.test(x)) ? null : `${family} slot parts must be lowercase ids`;
      }
      return `unknown slot family ${family}`;
  }
}

/** Slot families whose lines may be split into versions (builtin_ai 7.2: topics only). */
export function versionedFamily(slot: string): boolean {
  return slot.startsWith('topic.');
}

/** Pack ids a slot family is confined to (party exchanges live only in ln_party, 7.2). */
export function slotPackProblem(slot: string, packId: string): string | null {
  if (slot.startsWith('party.') && packId !== 'ln_party')
    return 'party slots live only in ln_party';
  return null;
}

/** Per-family character limits (catalog_dialogue_lines.md 2.2; builtin_ai 7.10). */
export function lengthLimit(slot: string): number {
  const family = slot.split('.')[0] ?? '';
  switch (family) {
    case 'greet':
    case 'farewell':
    case 'bark':
      return 30;
    case 'react':
    case 'unbelief':
    case 'party':
      return 50;
    case 'topic':
    case 'quest':
      return 80;
    case 'doc':
      return 160;
    default:
      return 60; // mem, diary, rumor, feat, expl, banter, interp
  }
}

/**
 * The repetition-suppression window of a slot family in game days (builtin_ai 7.7):
 * greetings, farewells, reactions and unbelief 7 days; barks 3 days; topics rotate in
 * order instead (0); the template families are composed parts, never suppressed (0).
 */
export function suppressionDays(slot: string): number {
  const family = slot.split('.')[0] ?? '';
  if (family === 'greet' || family === 'farewell' || family === 'react' || family === 'unbelief')
    return 7;
  if (family === 'bark') return 3;
  return 0;
}

/** Topics rotate through their lines in order rather than drawing (builtin_ai 7.7). */
export function rotates(slot: string): boolean {
  return slot.startsWith('topic.');
}
