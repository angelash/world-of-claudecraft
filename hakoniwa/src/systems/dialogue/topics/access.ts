// Who may speak of a topic now, and how (builtin_ai.md 6.2 "可用性", 6.6 the ledger refusal
// table; reveal_ledger.md 0.2 rules 1 to 3). Pure: the caller passes a view of the speaker
// and a condition reader; nothing here draws or reads the clock.
//
//   out of scope (not an owner, another region, not the topic's act)  -> unknown
//   requires does not hold:  a knower -> its locked handling (deny, evade, mis, unknown,
//                            hint; evade by default); anyone else -> mis when the topic
//                            misleads them, else unknown
//   below the topic's tier and not a knower                           -> mis or unknown
//   a prerequisite topic not talked yet                               -> unknown
//   trust under trustMin                                              -> evade
//   the misdirection holds for this speaker                           -> answer with mis
//   otherwise                                                         -> answer

import type { KnowledgeTier } from '../../npc/types';
import { actIndex } from '../../quests/conditions';
import type { Refusal, TopicAnswer, TopicDef } from './types';

export interface SpeakerView {
  /** persona id, resident id, companion or goddess id */
  id: string;
  tier: KnowledgeTier;
  socialClass?: string;
  roles: readonly string[];
  /** map region of the speaker's home map */
  region?: string;
  /** trust toward the player */
  trust: number;
}

export interface TopicEnv {
  /** reveal-ledger condition reader */
  holds(cond: string): boolean;
  /** current act flag value */
  act: string;
  /** whether this person already talked about the topic with the player */
  talked(topicId: string): boolean;
}

const TIERS: readonly KnowledgeTier[] = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];

export function tierRank(t: string | undefined): number {
  const i = TIERS.indexOf(t as KnowledgeTier);
  return i < 0 ? 0 : i;
}

/** Whether the topic's act window holds the current act. */
export function inActWindow(t: TopicDef, act: string): boolean {
  const now = actIndex(act);
  if (Number.isNaN(now)) return false;
  const from = actIndex(t.act);
  const to = t.until ? actIndex(t.until) : Number.POSITIVE_INFINITY;
  return now >= from && now <= to;
}

/** Whether this speaker may speak of the topic at all (scope and service role). */
export function inScope(t: TopicDef, sp: SpeakerView): boolean {
  if (t.service && !sp.roles.includes(t.service)) return false;
  if (t.scope === 'persona') return (t.owners ?? []).includes(sp.id);
  if (t.scope === 'region')
    return sp.region === t.region || (t.owners ?? []).includes(sp.id) || isKnower(t, sp);
  return true;
}

export function isKnower(t: TopicDef, sp: SpeakerView): boolean {
  return (t.knowers ?? []).includes(sp.id) || (t.scope === 'persona' && isOwner(t, sp));
}

function isOwner(t: TopicDef, sp: SpeakerView): boolean {
  return (t.owners ?? []).includes(sp.id);
}

/** Whether the topic's misdirection names this speaker (an id, `class:` or `tier:`). */
export function misleads(t: TopicDef, sp: SpeakerView): boolean {
  if (!t.mis) return false;
  return t.mis.by.some((b) => {
    if (b.startsWith('class:')) return sp.socialClass === b.slice(6);
    if (b.startsWith('tier:')) return sp.tier === b.slice(5);
    return b === sp.id;
  });
}

function misNow(t: TopicDef, sp: SpeakerView, env: TopicEnv): boolean {
  return misleads(t, sp) && !(t.mis?.until && env.holds(t.mis.until));
}

function refuse(refusal: Refusal, reason: Extract<TopicAnswer, { kind: 'refuse' }>['reason']) {
  return { kind: 'refuse', refusal, reason } as const;
}

/**
 * What the speaker does with the topic now (the 6.6 table). An `answer` carries the
 * misdirection version when it applies; the caller picks every other version (versionOf).
 */
export function decideTopic(t: TopicDef, sp: SpeakerView, env: TopicEnv): TopicAnswer {
  if (!inActWindow(t, env.act)) return refuse('unknown', 'act');
  if (!inScope(t, sp)) return refuse('unknown', 'out_of_scope');
  const knower = isKnower(t, sp);
  if (t.requires && !env.holds(t.requires)) {
    if (knower) return refuse(t.lockedBy?.[sp.id] ?? t.locked ?? 'evade', 'locked_knower');
    return misNow(t, sp, env) ? refuse('mis', 'locked') : refuse('unknown', 'locked');
  }
  if (tierRank(sp.tier) < tierRank(t.tier) && !knower)
    return misNow(t, sp, env) ? refuse('mis', 'tier') : refuse('unknown', 'tier');
  if ((t.after ?? []).some((a) => !env.talked(a))) return refuse('unknown', 'after');
  if (t.trustMin !== undefined && sp.trust < t.trustMin) return refuse('evade', 'trust');
  if (misNow(t, sp, env)) return { kind: 'answer', version: 'mis' };
  return { kind: 'answer', version: null };
}

/**
 * The version keys to try for a topic's lines, nearest first (builtin_ai 6.2, 7.3): the
 * speaker's tier (the pack falls back to lower tiers), the act, the cognition state, the
 * trust band and its neighbours; null for a plain list.
 */
export function versionsOf(
  t: TopicDef,
  sp: SpeakerView,
  state: { act: string; cognition?: string; band?: string },
): string[] | null {
  switch (t.versionBy) {
    case 'knowledge':
      return [sp.tier];
    case 'act':
      return [state.act];
    case 'cognition':
      return [state.cognition ?? 'unaware'];
    case 'relation': {
      const band = state.band ?? 'neutral';
      if (band === 'warm') return ['warm', 'neutral', 'cold'];
      if (band === 'cold') return ['cold', 'neutral'];
      return ['neutral', 'cold', 'warm'];
    }
    default:
      return null;
  }
}
