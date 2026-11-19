// Consumable effects owned by combat (item.used from the inventory system):
//   heal    restore `amount` health      mana    restore `amount` mana
//   aura    apply the aura named in `ability`   cleanse  remove up to `amount` debuffs
//   return  step back through the door to the nearest safe point, without the death cost
// Unknown effects are left to the systems that define them. A use in play goes through
// `useItemGate` (14.1): a cooldown group not allowed in combat is refused while fighting
// (bandages, food and drink, sediment cures, coatings, movement charms, repair kits), and a
// group that is an action waits for and starts the global cooldown (elixirs, charms,
// throwables); potions never touch the global cooldown.

import type { EventMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import {
  checkUseEffect,
  GROUP_RULES,
  type ItemDef,
  type ItemUseRequest,
  itemDef,
  registerUseEffectGate,
} from '../inventory';
import { getEntity, teleportEntity } from '../world';
import { applyAura, dispel } from './auras';
import { healUnit } from './damage';
import { returnPoint } from './death';
import { auraDef, GCD_TICKS } from './defs';
import { canDrink, canEat, startDrink, startFood } from './item_consumption';
import { deriveStats, isDisabled } from './stats';
import type { Unit } from './types';
import { inCombat, liveUnit, unitOf } from './units';

/** Run again at inventory settlement: a queued combat use may have lost its target. */
function primaryEffectGate(ctx: SystemContext, request: ItemUseRequest, def: ItemDef) {
  if (!ctx.world.slices.combat) return { ok: true } as const;
  const user = unitOf(ctx.world, request.ownerId);
  let code: string | null = null;
  if (!user || !liveUnit(ctx.world, user.id)) code = 'dead';
  else if (request.targetId && !liveUnit(ctx.world, request.targetId)) code = 'not_usable';
  else if (
    (def.use?.effect === 'drink' || def.use?.group === 'cd_food') &&
    inCombat(ctx.world, user)
  )
    code = 'in_combat';
  else if (def.use?.effect === 'aura' && !auraDef(ctx.content, def.use.ability ?? ''))
    code = 'not_usable';
  else if (def.use?.group === 'cd_food') {
    if (
      (request.targetId !== undefined && request.targetId !== user.id) ||
      !canEat(ctx, user, def.use.ability)
    )
      code = 'not_usable';
  } else if (def.use?.effect === 'drink') {
    if (
      (request.targetId !== undefined && request.targetId !== user.id) ||
      (def.use.amount !== undefined
        ? !canDrink(ctx, user, def.use.amount)
        : !(def.use.drunk && ctx.world.slices.crafting))
    )
      code = 'not_usable';
  }
  return code
    ? { ok: false as const, code, reason: tr(`sys.combat.reject.item.${code}`) }
    : { ok: true as const };
}

for (const effect of ['heal', 'mana', 'aura', 'cleanse', 'return', 'drink'])
  registerUseEffectGate(effect, primaryEffectGate);

/** Effects that move the user (movement charms: never in combat, 14.1). */
const MOVEMENT_EFFECTS: ReadonlySet<string> = new Set(['return']);

export type GateResult = { ok: true; gcd: boolean } | { ok: false; code: string };

/** Whether `u` may use `itemId` now as combat goes (14.1); the inventory checks the rest. */
export function useItemGate(
  ctx: SystemContext,
  u: Unit,
  itemId: string,
  targetId?: string,
): GateResult {
  const def = itemDef(ctx.content, itemId);
  if (!def?.use) return { ok: false, code: 'not_usable' };
  const effect = checkUseEffect(ctx, { ownerId: u.id, itemId, targetId }, def);
  if (!effect.ok) return { ok: false, code: effect.code };
  if (targetId && !liveUnit(ctx.world, targetId)) return { ok: false, code: 'not_usable' };
  if (!liveUnit(ctx.world, u.id)) return { ok: false, code: 'dead' };
  if (isDisabled(deriveStats(ctx.world, ctx.content, u))) return { ok: false, code: 'disabled' };
  const rule = GROUP_RULES[def.use.group ?? 'cd_none'];
  const fighting = inCombat(ctx.world, u);
  if (fighting) {
    const allowed =
      rule?.inCombat === 'item' ? !MOVEMENT_EFFECTS.has(def.use.effect) : !!rule?.inCombat;
    if (!allowed) return { ok: false, code: 'in_combat' };
  }
  const gcd = !!rule?.gcd;
  if (gcd && u.gcd > ctx.tick) return { ok: false, code: 'gcd' };
  return { ok: true, gcd };
}

export function onItemUsed(ctx: SystemContext, d: EventMap['item.used']): void {
  const user = unitOf(ctx.world, d.ownerId);
  if (!user || !liveUnit(ctx.world, user.id)) return;
  // an item that is an action takes a global cooldown however it was used (14.1)
  const group = itemDef(ctx.content, d.itemId)?.use?.group;
  if (group && GROUP_RULES[group]?.gcd) user.gcd = Math.max(user.gcd, ctx.tick + GCD_TICKS);
  if (d.early) return;
  const target = unitOf(ctx.world, d.targetId ?? d.ownerId);
  if (!target || !liveUnit(ctx.world, target.id)) return;
  switch (d.effect) {
    case 'heal':
      healUnit(ctx, user, target, d.amount ?? 0, { abilityId: d.itemId, canCrit: false });
      return;
    case 'mana': {
      if (target.res.mana === undefined) return;
      const max = deriveStats(ctx.world, ctx.content, target).maxRes.mana ?? 0;
      target.res.mana = Math.min(max, target.res.mana + (d.amount ?? 0));
      return;
    }
    case 'drink':
      if (typeof d.amount === 'number' && canDrink(ctx, user, d.amount))
        startDrink(ctx, user, d.itemId, d.amount);
      return;
    case 'aura':
      if (d.ability) {
        if (group === 'cd_food') startFood(ctx, user, d.itemId, d.ability);
        else applyAura(ctx, target, d.ability, user);
      }
      return;
    case 'cleanse':
      dispel(ctx, target, 'debuff', d.amount ?? 1);
      return;
    case 'return': {
      const e = getEntity(ctx.world, user.id);
      if (!e || user.combatUntil > ctx.tick) return;
      const dest = returnPoint(ctx, e);
      teleportEntity(ctx, user.id, dest.mapId, dest.x, dest.y);
      return;
    }
  }
}
