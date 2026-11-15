// Decision kinds as routing data (docs/50_tech/llm_providers.md 4.2, 4.3 and
// ai_architecture.md 3.2, 9.4, 10.5): which binding role each kind belongs to, which model
// slot it asks for under each tilt, whether it is one of the highest-tier anchors (AQ-18),
// whether it is reserved (kept until level 8 of the ladder), and which rung of the degrade
// ladder hands it to the built-in AI. The current role packs of src/game/ai_roles/ are
// listed next to the design kinds with the rows of the kind they stand for. Pure data.

import type { BindingRole, Slot } from '../contracts';

export type Tilt = 'standard' | 'generous' | 'frugal';

export const TILTS: readonly Tilt[] = ['standard', 'generous', 'frugal'];

/** Facts about one request that some kinds route on; the kernel does not send them yet. */
export interface RouteHints {
  /** npc.chat: the player is one side of the conversation (otherwise NPC with NPC). */
  withPlayer?: boolean;
  /** npc.tidy: the agent's tier, L1 (core NPC, the default) or L2 (present NPC). */
  npcLevel?: 1 | 2;
  /** npc.decision_point: a key figure of the main line (mid tier instead of low). */
  keyFigure?: boolean;
  /** leader.council: routine business of player officials and ministers, or a major event of an AI ruler. */
  weight?: 'routine' | 'major';
  /** goddess.wake: an important wake (reserved). */
  important?: boolean;
  /** Game day number: at ladder level 7 the goddess plans with the model on even days only. */
  gameDay?: number;
}

type Rule<T> = T | ((h: RouteHints) => T);

export interface KindDef {
  binding: Rule<BindingRole>;
  tiers: Readonly<Record<Tilt, Rule<Slot>>>;
  /** Uses the highest configured slot when advanced.highestForAnchors is on (AQ-18). */
  highest?: boolean;
  /** Reserved class: the player's live conversation, important goddess turns, anchors, court. */
  reserved?: Rule<boolean>;
  /** Tidy rounds, deferred from ladder level 3. */
  tidy?: boolean;
  /** Present NPC event rounds, built-in from ladder level 2. */
  event?: boolean;
  /** Goddess planning, every other day from ladder level 7. */
  plan?: boolean;
  /** NPC with NPC conversation, a topic menu from ladder level 5. */
  npcChat?: Rule<boolean>;
}

function t(standard: Rule<Slot>, generous: Rule<Slot>, frugal: Rule<Slot>): KindDef['tiers'] {
  return { standard, generous, frugal };
}

const withPlayer = (h: RouteHints): boolean => h.withPlayer === true;
const leaderStandard = (h: RouteHints): Slot =>
  h.weight === 'major' ? 'top' : h.weight === 'routine' ? 'low' : 'mid';

const GODDESS_PLAN: KindDef = { binding: 'goddess', tiers: t('mid', 'top', 'low'), plan: true };
const GODDESS_TALK: KindDef = { binding: 'goddess', tiers: t('top', 'top', 'mid'), reserved: true };
const ANCHOR = (binding: BindingRole): KindDef => ({
  binding,
  tiers: t('top', 'top', 'top'),
  highest: true,
  reserved: true,
});
const NPC_LIFE: KindDef = { binding: 'core_npc', tiers: t('low', 'mid', 'low') };
const DIARY_BATCH: KindDef = { binding: 'offstage_batch', tiers: t('low', 'low', 'low') };
// Generous lists rulers and generals at mid; a major event of an AI ruler keeps the top
// slot it has under the standard tilt, so the generous tilt never routes lower.
const LEADER: KindDef = {
  binding: 'ruler_general',
  tiers: t(leaderStandard, (h) => (h.weight === 'major' ? 'top' : 'mid'), 'low'),
};
const GENERAL: KindDef = { binding: 'ruler_general', tiers: t('mid', 'mid', 'low') };

export const DECISION_KINDS: Readonly<Record<string, KindDef>> = {
  // Goddess (the director, Janu and the prologue and epilogue records included).
  'goddess.plan': GODDESS_PLAN,
  'goddess.wake': {
    binding: 'goddess',
    tiers: t('mid', 'top', 'low'),
    reserved: (h) => h.important === true,
  },
  'goddess.talk': GODDESS_TALK,
  'goddess.interpret': { binding: 'goddess', tiers: t('top', 'top', 'low') },
  'goddess.tidy': { binding: 'goddess', tiers: t('mid', 'top', 'low'), tidy: true },
  'goddess.trial': { binding: 'goddess', tiers: t('mid', 'top', 'low') },
  'goddess.season_summary': { binding: 'goddess', tiers: t('low', 'top', 'low') },
  'director.pick': { binding: 'goddess', tiers: t('low', 'top', 'low') },
  'janu.night': { binding: 'goddess', tiers: t('mid', 'top', 'low') },
  'janu.dream': { binding: 'goddess', tiers: t('top', 'top', 'mid') },
  'prologue.turn': ANCHOR('goddess'),
  'prologue.extract': ANCHOR('goddess'),
  'court.stance': ANCHOR('goddess'),
  'epilogue.records': ANCHOR('goddess'),
  // Core NPC (L1, companions, any named NPC the player talks to).
  'npc.life': NPC_LIFE,
  'npc.recover': { binding: 'core_npc', tiers: t('low', 'mid', 'low') },
  'npc.chat': {
    binding: 'core_npc',
    tiers: t((h) => (withPlayer(h) ? 'mid' : 'low'), 'mid', 'low'),
    reserved: withPlayer,
    npcChat: (h) => !withPlayer(h),
  },
  'npc.tidy': {
    binding: (h) => (h.npcLevel === 2 ? 'present_npc' : 'core_npc'),
    tiers: t('low', (h) => (h.npcLevel === 2 ? 'low' : 'mid'), 'low'),
    tidy: true,
  },
  'npc.decision_point': {
    binding: 'core_npc',
    tiers: t((h) => (h.keyFigure ? 'mid' : 'low'), 'mid', 'low'),
  },
  'companion.tactics': { binding: 'core_npc', tiers: t('low', 'mid', 'low') },
  // Present NPC (L2).
  'npc.dayplan': { binding: 'present_npc', tiers: t('low', 'low', 'low') },
  'npc.event': { binding: 'present_npc', tiers: t('low', 'low', 'low'), event: true },
  // Offstage batch (L3 regional diaries).
  'npc.diary_batch': DIARY_BATCH,
  // Rulers and generals.
  'leader.council': LEADER,
  'general.plan': GENERAL,
  // Court reviewer (act six eloquence, an A-class request).
  'court.eloquence': ANCHOR('court_reviewer'),
  // The role packs of src/game/ai_roles/ (llm_providers.md 4.2, third column).
  'npc.daily': NPC_LIFE,
  'npc.dialogue': {
    binding: 'core_npc',
    tiers: t('mid', 'mid', 'low'),
    reserved: true,
  },
  'npc.batch_diary': DIARY_BATCH,
  'goddess.dialogue': GODDESS_TALK,
  'scene.improv': ANCHOR('goddess'),
  'ruler.policy': LEADER,
  'official.decide': { binding: 'ruler_general', tiers: t('mid', 'mid', 'low') },
  'general.order': GENERAL,
  'court.review': ANCHOR('court_reviewer'),
};

/** Kinds that always use the highest configured slot (AQ-18; llm_providers.md 4.3). */
export const HIGHEST_KINDS: ReadonlySet<string> = new Set(
  Object.entries(DECISION_KINDS)
    .filter(([, d]) => d.highest)
    .map(([k]) => k),
);

/** A representative kind per binding role, for the per-role driver view (screen A). */
export const ROLE_PROBE_KIND: Readonly<Record<BindingRole, string>> = {
  goddess: 'goddess.plan',
  core_npc: 'npc.life',
  present_npc: 'npc.dayplan',
  offstage_batch: 'npc.diary_batch',
  ruler_general: 'leader.council',
  court_reviewer: 'court.eloquence',
};

function rule<T>(r: Rule<T>, h: RouteHints): T {
  return typeof r === 'function' ? (r as (h: RouteHints) => T)(h) : r;
}

/**
 * The routing row of a kind. Unknown kinds are treated like the generic role pack ('*'):
 * present NPC, at `fallbackTier` (the pack's default) under the standard and generous tilts
 * and low under frugal.
 */
export function kindDef(kind: string, fallbackTier: Slot = 'low'): KindDef {
  return (
    DECISION_KINDS[kind] ?? {
      binding: 'present_npc',
      tiers: t(fallbackTier, fallbackTier, 'low'),
    }
  );
}

export function bindingOf(kind: string, hints: RouteHints = {}): BindingRole {
  return rule(kindDef(kind).binding, hints);
}

export function tierOf(
  kind: string,
  tilt: Tilt,
  hints: RouteHints = {},
  fallbackTier?: Slot,
): Slot {
  return rule(kindDef(kind, fallbackTier).tiers[tilt], hints);
}

export function isReservedKind(kind: string, hints: RouteHints = {}): boolean {
  const r = kindDef(kind).reserved;
  return r === undefined ? false : rule(r, hints);
}

/** Why the global ladder (ai_architecture.md 9.4) hands a request to the built-in AI. */
export type LadderReason =
  | 'degraded_all'
  | 'degraded_reserved_only'
  | 'degraded_goddess_plan'
  | 'degraded_ruler'
  | 'degraded_npc_chat'
  | 'degraded_present'
  | 'degraded_tidy'
  | 'degraded_present_event'
  | 'degraded_offstage';

/**
 * The ladder rung (cumulative) that declines this request at `level`, or undefined when it
 * still goes to a model. Reserved requests only stop at level 9. The kernel-side parts of a
 * rung (longer life-round shelving at level 5) are not the AI layer's.
 */
export function ladderDecline(
  level: number,
  kind: string,
  hints: RouteHints = {},
  reserved = isReservedKind(kind, hints),
): LadderReason | undefined {
  if (level >= 9) return 'degraded_all';
  if (reserved) return undefined;
  if (level >= 8) return 'degraded_reserved_only';
  const def = kindDef(kind);
  const role = rule(def.binding, hints);
  if (level >= 7 && def.plan && (hints.gameDay === undefined || hints.gameDay % 2 !== 0)) {
    return 'degraded_goddess_plan';
  }
  if (level >= 6 && role === 'ruler_general') return 'degraded_ruler';
  if (level >= 5 && def.npcChat !== undefined && rule(def.npcChat, hints)) {
    return 'degraded_npc_chat';
  }
  if (level >= 4 && role === 'present_npc') return 'degraded_present';
  if (level >= 3 && def.tidy) return 'degraded_tidy';
  if (level >= 2 && def.event) return 'degraded_present_event';
  if (level >= 1 && role === 'offstage_batch') return 'degraded_offstage';
  return undefined;
}
