// Independent food and drink slots (consumables catalog 2.1): 18 seconds sitting down.
// Amounts are cumulative, so save/resume and skipped ticks neither lose nor duplicate a sip.

import type { SystemContext } from '../../core/system';
import { TICK_HZ } from '../../core/time';
import { getEntity, haltEntity } from '../world';
import { applyAura, removeAurasWhere } from './auras';
import { auraDef, secs } from './defs';
import { deriveStats } from './stats';
import type { FoodConsumption, ItemConsumption, Unit } from './types';
import { inCombat } from './units';

export const DRINK_TICKS = 18 * TICK_HZ;

/** Eligible food has an explicit known buff and the eater has a free food slot. */
export function canEat(ctx: SystemContext, u: Unit, auraId: string | undefined): boolean {
  const aura = auraDef(ctx.content, auraId ?? '');
  return !!aura && aura.kind === 'buff' && !u.eating && !u.cast && !u.interact;
}

export function startFood(ctx: SystemContext, u: Unit, itemId: string, auraId: string): void {
  const e = getEntity(ctx.world, u.id);
  if (!e) return;
  haltEntity(ctx, e.id);
  u.eating = {
    itemId,
    auraId,
    started: ctx.tick,
    until: ctx.tick + DRINK_TICKS,
    mapId: e.mapId,
    x: e.x,
    y: e.y,
  };
}

function interrupted(ctx: SystemContext, u: Unit, s: FoodConsumption | ItemConsumption): boolean {
  const e = getEntity(ctx.world, u.id);
  return (
    !e?.alive ||
    !!u.downed ||
    e.mapId !== s.mapId ||
    e.x !== s.x ||
    e.y !== s.y ||
    inCombat(ctx.world, u) ||
    !!u.cast ||
    !!u.interact
  );
}

function valid(s: ItemConsumption): boolean {
  return (
    typeof s.itemId === 'string' &&
    typeof s.mapId === 'string' &&
    [s.started, s.until, s.amount, s.applied, s.x, s.y].every(Number.isFinite) &&
    s.until > s.started &&
    s.amount > 0 &&
    s.applied >= 0 &&
    s.applied <= s.amount
  );
}

/** Rejected before inventory consumption when there is no mana pool to replenish. */
export function canDrink(ctx: SystemContext, u: Unit, amount: number | undefined): boolean {
  return (
    typeof amount === 'number' &&
    Number.isFinite(amount) &&
    amount > 0 &&
    u.res.mana !== undefined &&
    !u.drinking &&
    !u.cast &&
    !u.interact &&
    !inCombat(ctx.world, u)
  );
}

/** Starting a drink stops existing movement. New actual movement interrupts the slot. */
export function startDrink(ctx: SystemContext, u: Unit, itemId: string, amount: number): void {
  const e = getEntity(ctx.world, u.id);
  if (!e) return;
  haltEntity(ctx, e.id);
  u.drinking = {
    itemId,
    started: ctx.tick,
    until: ctx.tick + DRINK_TICKS,
    amount,
    applied: 0,
    mapId: e.mapId,
    x: e.x,
    y: e.y,
  };
}

/** Interrupted consumption keeps prior restoration and does not refund the spent portions. */
export function stopConsumption(u: Unit): void {
  delete u.drinking;
  delete u.eating;
}

/** Called only in the existing per-unit loop; there is no second scan over realm units. */
export function tickConsumption(ctx: SystemContext, u: Unit): void {
  const food = u.eating;
  if (food) {
    const aura = auraDef(ctx.content, food.auraId);
    if (!aura || !Number.isFinite(food.until) || interrupted(ctx, u, food)) delete u.eating;
    else if (ctx.tick >= food.until) {
      removeAurasWhere(ctx, u, (_instance, def) => def?.group === 'food');
      const remaining = secs(aura.duration) - (ctx.tick - food.until);
      if (aura.duration <= 0 || remaining > 0)
        applyAura(ctx, u, food.auraId, u, { durationTicks: Math.max(0, remaining) });
      delete u.eating;
    }
  }
  const s = u.drinking;
  if (!s) return;
  if (!valid(s) || interrupted(ctx, u, s) || u.res.mana === undefined) {
    delete u.drinking;
    return;
  }
  const share = Math.max(0, Math.min(1, (ctx.tick - s.started) / (s.until - s.started)));
  const due = Math.floor(s.amount * share);
  if (due > s.applied) {
    const max = deriveStats(ctx.world, ctx.content, u).maxRes.mana ?? 0;
    u.res.mana = Math.min(max, u.res.mana + due - s.applied);
    s.applied = due;
  }
  if (ctx.tick >= s.until) delete u.drinking;
}
