// Cross-system ports of the warfare system. Strategy and city register generated battles
// here (so `war.start` can open them when `war.pending` names them) and read results.

import type { SystemContext } from '../../core/system';
import type { BattleResultRecord, BattleSetup, WarfareSlice } from './types';

type WorldWithWarfare = { slices: { warfare: WarfareSlice } };

/** Store a generated setup under a scenario id; it is consumed when that battle ends. */
export function registerCustomBattle(
  ctx: SystemContext,
  scenarioId: string,
  setup: BattleSetup,
): void {
  ctx.world.slices.warfare.custom[scenarioId] = setup;
}

/** The most recent recorded result for a scenario id, if any. */
export function latestResult(
  world: WorldWithWarfare,
  scenarioId: string,
): BattleResultRecord | undefined {
  const list = world.slices.warfare.results;
  for (let i = list.length - 1; i >= 0; i--) {
    const r = list[i] as BattleResultRecord;
    if (r.scenarioId === scenarioId) return r;
  }
  return undefined;
}
