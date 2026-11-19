// Alive metric 12, party chatter (builtin_ai.md 14.2): with companions in the party, the
// travel and campfire exchanges per game hour of travel and campfire (threshold: at least 1),
// and the exchanges heard more than once (threshold: 0). Computed from the event stream
// (`party.banter_end`) and the exposure the party slice counts (ticks of travel and camp
// with companions present). Pure.

import { TICKS_PER_GAME_HOUR } from '../../core/time';
import type { BanterKind } from './types';

/** One finished exchange as the event stream reports it. */
export interface BanterEnded {
  exchangeId: string;
  kind: BanterKind;
  outcome: 'done' | 'cut' | 'void';
}

export interface BanterMetric {
  /** travel and campfire exchanges heard to the end */
  roadExchanges: number;
  /** game hours of travel and campfire with companions in the party */
  hours: number;
  /** road exchanges per game hour (0 when there was no exposure) */
  perHour: number;
  /** exchanges heard to the end more than once (each extra hearing counts) */
  repeats: number;
  /** every exchange heard to the end, by kind */
  byKind: Partial<Record<BanterKind, number>>;
}

/** Metric 12 over a run: the ended exchanges and the exposure ticks (BanterState.exposure). */
export function banterMetric(ended: readonly BanterEnded[], exposureTicks: number): BanterMetric {
  const seen = new Set<string>();
  let road = 0;
  let repeats = 0;
  const byKind: Partial<Record<BanterKind, number>> = {};
  for (const e of ended) {
    if (e.outcome !== 'done') continue;
    byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
    if (e.kind === 'travel' || e.kind === 'campfire') road += 1;
    if (seen.has(e.exchangeId)) repeats += 1;
    else seen.add(e.exchangeId);
  }
  const hours = exposureTicks / TICKS_PER_GAME_HOUR;
  return {
    roadExchanges: road,
    hours: Math.round(hours * 1000) / 1000,
    perHour: hours > 0 ? Math.round((road / hours) * 1000) / 1000 : 0,
    repeats,
    byKind,
  };
}
