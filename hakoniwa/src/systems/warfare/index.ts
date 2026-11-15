// Warfare system (RTS), phase 60: grid battle instances with regiments resolved by
// expected value and heroes as multipliers (D-012). A battle opens when the player (or a
// script) answers `war.pending`; manual battles advance one kernel step every 4 ticks.
// See docs/40_design/systems/warfare_rts.md.

import type { GameSystem } from '../../core/system';
import {
  autoResolveCommand,
  generalPlan,
  heroAbility,
  orderUnit,
  startBattle,
  withdraw,
} from './commands';
import { stepBattle } from './kernel';
import {
  dataOf,
  emitFlashes,
  finishBattle,
  PLAN_REQUEST_EVERY,
  requestPlans,
  warfare,
} from './session';

export * from './autoresolve';
export * from './ports';
export * from './queries';
export * from './types';

/** Engine ticks per kernel step in manual battles (5 Hz at 20 Hz ticks). */
export const TICKS_PER_STEP = 4;

export const system: GameSystem = {
  id: 'warfare',
  order: 60,

  init(ctx) {
    ctx.world.slices.warfare = { battle: null, custom: {}, results: [], nextBattle: 0 };
  },

  tick(ctx) {
    const slice = warfare(ctx);
    const b = slice.battle;
    if (b?.mode !== 'manual' || ctx.tick % TICKS_PER_STEP !== 0) return;
    stepBattle(b, dataOf(ctx));
    emitFlashes(ctx, b);
    if (b.outcome) {
      finishBattle(ctx);
      return;
    }
    if (b.step % PLAN_REQUEST_EVERY === 0) requestPlans(ctx, b);
  },

  commands: {
    'war.start': (ctx, d) => startBattle(ctx, d),
    'war.order': (ctx, d) => orderUnit(ctx, d),
    'war.hero_ability': (ctx, d) => heroAbility(ctx, d),
    'war.retreat': (ctx) => withdraw(ctx),
    'war.auto_resolve': (ctx, d) => autoResolveCommand(ctx, d),
    'war.general_plan': (ctx, d, src) => generalPlan(ctx, d, src),
  },
};
