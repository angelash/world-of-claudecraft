// The release index (D-043): population-weighted mean over living nations of
// (autonomy - divine reliance), clamped to -100..100. Divine reliance adds the structural
// value and the goddess modifiers currently benefiting the nation (D-013). The player
// nation's autonomy comes from the `autonomy` flag that the city system writes.

import type { FlagValue } from '../../core/contracts';
import type { ModifiersSlice } from '../modifiers';
import { aliveNations, PLAYER, populationOf } from './state';
import type { NationState, StrategySlice } from './types';

/** Sources that are not goddesses (their modifiers do not count as divine reliance). */
const MORTAL_SOURCES = new Set(['maker', 'director', 'script', 'policy', 'event']);

export function effectiveReliance(n: NationState, modifiers: ModifiersSlice | undefined): number {
  let extra = 0;
  for (const m of modifiers?.active ?? []) {
    if (m.key !== n.id || MORTAL_SOURCES.has(m.source)) continue;
    extra += 2;
  }
  return Math.max(0, Math.min(100, n.divineReliance + extra));
}

export function playerAutonomy(n: NationState, flags: Record<string, FlagValue>): number {
  const v = Number(flags.autonomy);
  return Number.isFinite(v) && flags.autonomy !== undefined ? v : n.autonomy;
}

export function releaseIndex(
  s: StrategySlice,
  flags: Record<string, FlagValue>,
  modifiers: ModifiersSlice | undefined,
): number {
  let weighted = 0;
  let total = 0;
  for (const n of aliveNations(s)) {
    const pop = populationOf(s, n.id);
    if (pop <= 0) continue;
    const autonomy = n.id === PLAYER ? playerAutonomy(n, flags) : n.autonomy;
    weighted += pop * (autonomy - effectiveReliance(n, modifiers));
    total += pop;
  }
  if (total <= 0) return 0;
  return Math.max(-100, Math.min(100, Math.round(weighted / total)));
}
