// The act budget and the end reserve of a goddess's own choices (builtin_ai.md 8.4;
// catalog_goddess_interventions.md 5.0): what her dawn plan, her schemes and a model's
// proposals spend in an act stays within the act's budget (hard), and her projected power at
// the act's end stays above the reserve (hard); spending ahead of the act's elapsed share is
// the planner's soft penalty (./score.ts `overspent`). Written acts, return gifts, her gaze,
// an act that lands an open scripted act, and a goddess who takes no part in the dawn round
// (Janu's night round) stand outside it. Reads of the world, and the booking of a spend.

import type { SystemContext } from '../../../core/system';
import { TICKS_PER_GAME_DAY } from '../../../core/time';
import { actionDef, currentAct, defaultMap, type GoddessActCommand, priceCost } from '../actions';
import { goddessDef } from '../state';
import type { GoddessDef } from '../types';
import { marketOn } from './gates';
import { brainConfig, type PersonaAct, personaAct, personaOf } from './persona';
import { keepsReserve } from './score';
import { brainOf } from './state';

export interface BudgetView {
  /** the act's plan row (none: no budget applies) */
  row: PersonaAct | undefined;
  /** power her own choices spent in the act so far */
  spent: number;
  /** share of the act gone by (0 to 1, 1 when the act has no length) */
  elapsed: number;
  /** game days left in the act */
  daysLeft: number;
}

/** Whether her own choices are held to an act budget at all (she plans at dawn). */
export function budgeted(content: SystemContext['content'], goddess: string): boolean {
  return personaOf(content, goddess)?.dawn !== false;
}

/** Her budget in `act` now. */
export function budgetView(ctx: SystemContext, goddess: string, act: string): BudgetView {
  const cfg = brainConfig(ctx.content);
  const p = personaOf(ctx.content, goddess);
  const brain = brainOf(ctx.world.slices.goddess, goddess);
  const actTicks = (cfg.actDays[act] ?? 0) * TICKS_PER_GAME_DAY;
  const started = brain.actStart[act] ?? ctx.tick;
  return {
    row: budgeted(ctx.content, goddess) ? personaAct(p, act) : undefined,
    spent: brain.spent[act] ?? 0,
    elapsed: actTicks > 0 ? (ctx.tick - started) / actTicks : 1,
    daysLeft: actTicks > 0 ? Math.max(0, (started + actTicks - ctx.tick) / TICKS_PER_GAME_DAY) : 0,
  };
}

/** Whether a spend of `cost` from `power` keeps both the budget and the end reserve. */
export function withinBudget(
  view: BudgetView,
  def: GoddessDef,
  power: number,
  cost: number,
  spent = view.spent,
): boolean {
  const row = view.row;
  if (!row) return true;
  if (!keepsReserve(power, cost, def.power.daily, view.daysLeft, row.reserve)) return false;
  return spent + cost <= row.budget;
}

/** Book power her own choice spent in the current act (none for a goddess without a plan). */
export function bookSpend(ctx: SystemContext, goddess: string, power: number): void {
  if (!budgeted(ctx.content, goddess) || power <= 0) return;
  const brain = brainOf(ctx.world.slices.goddess, goddess);
  const act = currentAct(ctx);
  brain.spent[act] = (brain.spent[act] ?? 0) + power;
}

/**
 * Whether a model's proposal would take her past the act budget or the end reserve, as her
 * dawn plan may not (`scripted`: it would land an open scripted act, which stands outside).
 */
export function proposalOverBudget(
  ctx: SystemContext,
  d: GoddessActCommand,
  scripted: boolean,
): boolean {
  const def = goddessDef(ctx.content, d.goddessId);
  const s = ctx.world.slices.goddess.goddesses[d.goddessId];
  const a = actionDef(ctx.content, d.action);
  if (scripted || !def || !s || !a) return false;
  const p = d.params ?? {};
  const mapId = p.mapId ?? defaultMap(ctx, def, s);
  const cost = priceCost(a, !!d.breach, p, marketOn(ctx.content, mapId));
  if (cost <= 0) return false;
  return !withinBudget(budgetView(ctx, def.id, currentAct(ctx)), def, s.power, cost);
}
