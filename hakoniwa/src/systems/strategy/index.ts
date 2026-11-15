// Strategy system (SLG), phase 65: the continent steps once per game day. Before the
// `feature.slg` flag it only keeps books (no AI wars, no marches); the release index is
// written every day (D-043). See docs/40_design/systems/grand_strategy_slg.md.

import type { GameSystem, SystemContext } from '../../core/system';
import { requestRulerPolicies, runAiOperations, runAntiCoalition } from './ai';
import {
  convene,
  diplomacy,
  foundNation,
  moveArmy,
  recruit,
  rulerPolicy,
  setBattleMode,
} from './commands';
import { advanceConclave } from './conclave';
import { marchArmies, resolveBattles, runSieges, settlePending } from './military';
import { runNationDay } from './nations';
import { releaseIndex } from './release';
import { createStrategySlice, driftRelations } from './setup';
import { PLAYER, strat } from './state';

export * from './queries';
export { effectiveReliance, releaseIndex } from './release';
export * from './types';

/** Days a manual battle may wait before it is auto-resolved. */
export const PENDING_BATTLE_DAYS = 2;

export function runStrategyDay(ctx: SystemContext, dayIndex: number): void {
  const s = strat(ctx);
  s.day = dayIndex;
  s.active = !!ctx.flag('feature.slg');
  const player = s.nations[PLAYER];
  if (player) {
    const a = Number(ctx.flag('autonomy'));
    if (Number.isFinite(a) && ctx.flag('autonomy') !== undefined) player.autonomy = a;
  }
  runNationDay(ctx, s.active);
  driftRelations(ctx);
  if (s.active) {
    requestRulerPolicies(ctx);
    runAiOperations(ctx);
    marchArmies(ctx);
    if (
      s.pendingBattle &&
      s.day - s.pendingBattle.createdDay >= PENDING_BATTLE_DAYS &&
      !ctx.world.slices.warfare?.battle
    ) {
      settlePending(ctx);
    }
    resolveBattles(ctx);
    runSieges(ctx);
    runAntiCoalition(ctx);
  }
  advanceConclave(ctx);
  s.releaseIndex = releaseIndex(s, ctx.world.meta.flags, ctx.world.slices.modifiers);
  ctx.setFlag('release_index', s.releaseIndex);
}

export const system: GameSystem = {
  id: 'strategy',
  order: 65,

  init(ctx) {
    ctx.world.slices.strategy = createStrategySlice(ctx.content);
    const s = strat(ctx);
    s.releaseIndex = releaseIndex(s, ctx.world.meta.flags, ctx.world.slices.modifiers);
  },

  on: {
    'world.day'(ctx, e) {
      runStrategyDay(ctx, e.data.dayIndex);
    },
    'flag.changed'(ctx, e) {
      if (e.data.key === 'feature.slg') strat(ctx).active = !!e.data.value;
    },
    'war.battle_report'(ctx, e) {
      const p = strat(ctx).pendingBattle;
      if (p && e.data.scenario === p.scenarioId) {
        settlePending(ctx, { victor: e.data.victor, regiments: e.data.regiments });
      }
    },
  },

  commands: {
    'slg.diplomacy': (ctx, d, src) => diplomacy(ctx, d, src),
    'slg.move_army': (ctx, d, src) => moveArmy(ctx, d, src),
    'slg.recruit': (ctx, d, src) => recruit(ctx, d, src),
    'slg.found_nation': (ctx, d) => foundNation(ctx, d),
    'slg.convene': (ctx, _d, src) => convene(ctx, src),
    'slg.ruler_policy': (ctx, d, src) => rulerPolicy(ctx, d, src),
    'slg.set_battle_mode': (ctx, d) => setBattleMode(ctx, d),
  },
};
