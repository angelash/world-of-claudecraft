// Choosing a party exchange (builtin_ai.md 11.3): among the exchanges whose cast is all in
// the party and whose condition holds, the one with the highest
//   priority x freshness x relevance
// wins, where freshness is 1 for an exchange never played and, for a repeatable one,
// `freshPerDay` per game day since it last played (at most 1); relevance multiplies by
// `relevance` when the exchange is the one the cause just raised (the event or the place
// that fired now). A once-only exchange already played never competes again, and an
// exchange cut twice is void. Pure: no world, no clock, no draws; the runtime hands in the
// facts. Ties break by exchange id, so the same situation always picks the same exchange.

import type { BanterDef, BanterKind, BanterState } from './types';

/** What the selection knows about one candidate. */
export interface BanterFacts {
  /** every person of the cast is in the party, and over the bond floor */
  castReady: boolean;
  /** the condition holds (no condition: true) */
  holds: boolean;
  /** game days since it last played (null: never played) */
  daysSince: number | null;
  /** the cause raised this exchange right now (the event, the place just entered) */
  caused: boolean;
}

export interface BanterCandidate {
  def: BanterDef;
  facts: BanterFacts;
}

export interface BanterScored {
  id: string;
  score: number;
  freshness: number;
}

/** Freshness of an exchange (11.3): 1 unplayed, else recovering per game day, capped at 1. */
export function freshness(def: BanterDef, daysSince: number | null, perDay: number): number {
  if (daysSince === null) return 1;
  if (def.once !== false) return 0;
  return Math.max(0, Math.min(1, daysSince * perDay));
}

/** Whether an exchange may play at all now. */
export function playable(def: BanterDef, facts: BanterFacts, state: BanterState): boolean {
  if (!facts.castReady || !facts.holds) return false;
  if (state.void?.includes(def.id)) return false;
  if (def.once !== false && state.played[def.id] !== undefined) return false;
  return true;
}

/** The scored candidates, highest first, ties by id (pure). */
export function scoreBanter(
  candidates: readonly BanterCandidate[],
  state: BanterState,
  opts: { freshPerDay: number; relevance: number },
): BanterScored[] {
  const out: BanterScored[] = [];
  for (const c of candidates) {
    if (!playable(c.def, c.facts, state)) continue;
    const fresh = freshness(c.def, c.facts.daysSince, opts.freshPerDay);
    if (fresh <= 0) continue;
    const score = c.def.priority * fresh * (c.facts.caused ? opts.relevance : 1);
    out.push({ id: c.def.id, score: Math.round(score * 1e6) / 1e6, freshness: fresh });
  }
  return out.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** The winner, or null when nothing may play. */
export function pickBanter(
  candidates: readonly BanterCandidate[],
  state: BanterState,
  opts: { freshPerDay: number; relevance: number },
): string | null {
  return scoreBanter(candidates, state, opts)[0]?.id ?? null;
}

/**
 * Whether the pacing of a kind allows an exchange now (companions_and_party.md 10.1):
 * exploring (enter, event, relation, act) one per `exploreGap` ticks; travel one per
 * `travelGap` ticks of journey; the campfire `campfireMax` a night.
 */
export function pacingAllows(
  kind: BanterKind,
  state: BanterState,
  tick: number,
  night: number,
  cfg: { exploreGap: number; travelGap: number; campfireMax: number },
): boolean {
  if (kind === 'travel') return (state.journey ?? 0) >= cfg.travelGap;
  if (kind === 'campfire') {
    const camp = state.camp;
    return !camp || camp.night !== night || camp.count < cfg.campfireMax;
  }
  return state.lastAt === undefined || tick - state.lastAt >= cfg.exploreGap;
}

/** The content text key of one line of an exchange (the slot party.<id> of ln_party). */
export function banterLineKey(exchangeId: string, index: number): string {
  return `c.line_packs.ln_party.slots.party_${exchangeId}.${index}`;
}

/** The content text key of one reply label of an exchange (after the spoken lines). */
export function banterReplyKey(def: BanterDef, option: number): string {
  return banterLineKey(def.id, def.speakers.length + option);
}
