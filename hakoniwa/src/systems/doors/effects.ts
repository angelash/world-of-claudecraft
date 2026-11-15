// Door effects on the player: abilities, stat bonuses, resource pools and passives go
// through the combat ports keyed by the door id (so closing a door revokes exactly what
// it gave); features and flags go through world flags; items through the inventory port.

import type { SystemContext } from '../../core/system';
import {
  addPassive,
  grantAbility,
  grantPool,
  removePassives,
  revokeAbility,
  revokePools,
  setBonus,
} from '../combat';
import { addItem } from '../inventory';
import type { DoorDef } from './types';

function playerId(ctx: SystemContext): string {
  return ctx.world.slices.world.playerId;
}

export function applyDoorEffects(ctx: SystemContext, door: DoorDef): void {
  const pid = playerId(ctx);
  const source = `door:${door.id}`;
  for (const f of door.effects) {
    switch (f.type) {
      case 'abilities':
        for (const a of f.abilities) grantAbility(ctx, pid, a);
        break;
      case 'stats':
        setBonus(ctx, pid, source, f.stats);
        break;
      case 'pool':
        grantPool(ctx, pid, source, f.resource, f.base);
        break;
      case 'passive':
        addPassive(ctx, pid, f.aura, source);
        break;
      case 'feature':
        if (!ctx.flag(`feature.${f.feature}`)) {
          ctx.setFlag(`feature.${f.feature}`, true);
          ctx.emit('feature.unlocked', { feature: f.feature });
        }
        break;
      case 'flag':
        ctx.setFlag(f.key, f.value);
        break;
      case 'item':
        addItem(ctx, pid, f.itemId, f.count ?? 1, `door:${door.id}`);
        if (f.equip)
          ctx.dispatch(
            'inventory.equip',
            { ownerId: pid, itemId: f.itemId },
            { type: 'system', system: 'doors' },
          );
        break;
    }
  }
}

/** Closing a door takes back its powers (items given stay; flags other than features stay). */
export function revertDoorEffects(ctx: SystemContext, door: DoorDef): void {
  const pid = playerId(ctx);
  const source = `door:${door.id}`;
  for (const f of door.effects) {
    switch (f.type) {
      case 'abilities':
        for (const a of f.abilities) revokeAbility(ctx, pid, a);
        break;
      case 'stats':
        setBonus(ctx, pid, source, null);
        break;
      case 'pool':
        revokePools(ctx, pid, source);
        break;
      case 'passive':
        removePassives(ctx, pid, source);
        break;
      case 'feature':
        ctx.setFlag(`feature.${f.feature}`, false);
        break;
      default:
        break;
    }
  }
}
