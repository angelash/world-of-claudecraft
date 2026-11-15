// Consumable effects owned by combat (item.used from the inventory system):
//   heal    restore `amount` health      mana    restore `amount` mana
//   aura    apply the aura named in `ability`   cleanse  remove up to `amount` debuffs
//   return  step back through the door to the nearest safe point, without the death cost
// Unknown effects are left to the systems that define them.

import type { EventMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { getEntity, teleportEntity } from '../world';
import { applyAura, dispel } from './auras';
import { healUnit } from './damage';
import { returnPoint } from './death';
import { deriveStats } from './stats';
import { liveUnit, unitOf } from './units';

export function onItemUsed(ctx: SystemContext, d: EventMap['item.used']): void {
  const user = unitOf(ctx.world, d.ownerId);
  if (!user || !liveUnit(ctx.world, user.id)) return;
  const target = unitOf(ctx.world, d.targetId ?? d.ownerId) ?? user;
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
    case 'aura':
      if (d.ability) applyAura(ctx, target, d.ability, user);
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
