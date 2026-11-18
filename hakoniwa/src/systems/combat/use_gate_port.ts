// The combat side's item gate on `inventory.use` (combat_and_classes.md 14.1): a use straight to
// the inventory goes through the same gate as `combat.use_item` (a cooldown group not allowed
// while fighting is refused, an action waits for the global cooldown, a dead or disabled user
// acts not at all). The inventory exposes the gate as a port (src/systems/inventory/
// use_gate.ts); combat registers its check when the combat system loads. Users without a
// combat unit (the company, a settlement's stores) pass.

import { tr } from '../../core/text';
import { registerUseGate } from '../inventory';
import { useItemGate } from './items_use';
import { unitOf } from './units';

registerUseGate((ctx, ownerId, itemId) => {
  if (!ctx.world.slices.combat) return { ok: true };
  const u = unitOf(ctx.world, ownerId);
  if (!u) return { ok: true };
  const g = useItemGate(ctx, u, itemId);
  if (g.ok) return { ok: true };
  return { ok: false, code: g.code, reason: tr(`sys.combat.reject.item.${g.code}`) };
});
