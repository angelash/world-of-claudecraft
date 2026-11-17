// Wiring of the combat side's item gate into `inventory.use` (combat_and_classes.md 14.1;
// PK-M1-11 asked that a use straight to the inventory go through the same gate as
// `combat.use_item`). The inventory exposes the gate as a port (src/systems/inventory/
// use_gate.ts); this module registers combat's own check there when the crafting system
// loads, until the combat system registers it itself (then this file goes). Users without a
// combat unit (the company, a settlement's stores) pass.

import { tr } from '../../core/text';
import { unitOf } from '../combat';
import { useItemGate } from '../combat/items_use';
import { registerUseGate } from '../inventory';

registerUseGate((ctx, ownerId, itemId) => {
  if (!ctx.world.slices.combat) return { ok: true };
  const u = unitOf(ctx.world, ownerId);
  if (!u) return { ok: true };
  const g = useItemGate(ctx, u, itemId);
  if (g.ok) return { ok: true };
  return { ok: false, code: g.code, reason: tr(`sys.combat.reject.item.${g.code}`) };
});
