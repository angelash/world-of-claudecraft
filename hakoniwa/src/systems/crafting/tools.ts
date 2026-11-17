// Gathering and crafting tools (catalog_consumables_magitools.md 3.15): instanced items with
// the `tool` tag and a kind tag `tool:<kind>` naming the livelihoods they serve (the kinds are
// data, craftingConfig.tools). A tool's tier is its item tier (by item level, T1 to T6); one at
// 0 durability works as bare hands. Each gather or craft with a tool wears it.

import type { SystemContext } from '../../core/system';
import { compareInstanceIds, isWorking, tierOfLevel, wearInstance } from '../inventory';
import type { InventorySlice, ItemDef } from '../inventory/types';
import type { CraftingConfig, Profession } from './types';

export const TOOL_TAG = 'tool';
export const TOOL_KIND_PREFIX = 'tool:';

/** The tool kinds that serve a livelihood. */
function kindsFor(cfg: CraftingConfig, p: Profession): string[] {
  return cfg.tools.filter((t) => t.professions.includes(p)).map((t) => t.tag);
}

export interface ToolPick {
  instanceId: string;
  tier: number;
}

/** The best working tool an owner holds for a livelihood (highest tier, oldest on a tie). */
export function bestTool(
  world: { slices: { inventory: InventorySlice } },
  content: { items: ItemDef[] },
  cfg: CraftingConfig,
  ownerId: string,
  p: Profession,
): ToolPick | undefined {
  const kinds = kindsFor(cfg, p);
  const h = world.slices.inventory.owners[ownerId];
  if (kinds.length === 0 || !h?.instances) return undefined;
  let best: ToolPick | undefined;
  const ids = Object.keys(h.instances).sort(compareInstanceIds);
  for (const id of ids) {
    const inst = h.instances[id];
    const def = inst ? content.items.find((i) => i.id === inst.defId) : undefined;
    if (!inst || !def?.tags?.includes(TOOL_TAG) || !isWorking(inst)) continue;
    if (!kinds.some((k) => def.tags?.includes(`${TOOL_KIND_PREFIX}${k}`))) continue;
    const tier = tierOfLevel(def.level);
    if (!best || tier > best.tier) best = { instanceId: id, tier };
  }
  return best;
}

/** Wear a tool by one use. */
export function wearTool(
  ctx: SystemContext,
  cfg: CraftingConfig,
  ownerId: string,
  t: ToolPick,
): void {
  if (cfg.toolWear > 0) wearInstance(ctx, ownerId, t.instanceId, cfg.toolWear, 'tool');
}
