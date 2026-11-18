// The left-item port of the dungeons (catalog_dungeons_bosses.md 1.1; dungeons/left_items.ts):
// combat owns the drop bags, so it registers the port the dungeon runtime swallows them
// through. A bag lying in a standing dungeon is kept past its three days (death_costs.ts)
// until the dungeon swallows it at seven; it then leaves the world (`combat.bag` swallowed).
// Registered once when the combat system loads; the port reads only the world it is given.

import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { type LeftItemPort, registerLeftItemPort } from '../dungeons/left_items';
import { bagSince, dropOut } from './death_costs';

export const BAG_PORT: LeftItemPort = {
  items(world: World) {
    const bags = world.slices.combat?.bags ?? {};
    return Object.keys(bags)
      .sort()
      .flatMap((id) => {
        const b = bags[id];
        return b ? [{ id: b.id, mapId: b.mapId, x: b.x, y: b.y, since: bagSince(b) }] : [];
      });
  },
  swallow(ctx: SystemContext, id: string) {
    const bag = ctx.world.slices.combat?.bags?.[id];
    if (!bag) return false;
    dropOut(ctx, bag, 'swallowed');
    return true;
  },
};

registerLeftItemPort(BAG_PORT);
