// Inventory and money for every owner (player, companions, NPCs, the company,
// settlements). Item definitions live in the `items` content table, contributed by
// several packs (equipment from combat, goods from economy, key and lore items from
// quests). Phase 15. Money is an integer number of copper (1 gold = 100 silver =
// 10000 copper; see docs/20_world/society.md currency). Display formatting lives on the
// client: formatMoney in src/shared_ui/i18n.ts, or a {m, money} placeholder in a TextRef.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { tr } from '../../core/text';

export type ItemKind =
  | 'weapon'
  | 'armor'
  | 'trinket'
  | 'consumable'
  | 'material'
  | 'goods'
  | 'key'
  | 'lore'
  | 'evidence';

export type EquipSlot =
  | 'main_hand'
  | 'off_hand'
  | 'head'
  | 'chest'
  | 'legs'
  | 'hands'
  | 'feet'
  | 'trinket';

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** 0 poor, 1 common, 2 uncommon, 3 rare, 4 epic, 5 legendary (main project quality scale) */
  quality: number;
  /** base value in copper */
  value: number;
  desc: string;
  slot?: EquipSlot;
  /** flat stat bonuses while equipped (combat reads these) */
  stats?: Record<string, number>;
  /** weapon damage range and speed (combat reads these) */
  weapon?: { min: number; max: number; speed: number; range: number };
  /** consumable effect id interpreted by the owning system (combat, quests) */
  use?: { effect: string; amount?: number; ability?: string };
  /** max stack size (default 1 for equipment, 99 otherwise) */
  stack?: number;
  /** required player level to equip */
  level?: number;
  tags?: string[];
}

export interface Holding {
  money: number;
  items: Record<string, number>;
  equipped: Partial<Record<EquipSlot, string>>;
}

export interface InventorySlice {
  owners: Record<string, Holding>;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    inventory: InventorySlice;
  }
  interface ContentMap {
    items: ItemDef[];
  }
  interface EventMap {
    'inventory.changed': { ownerId: string; itemId: string; delta: number; reason: string };
    'money.changed': { ownerId: string; delta: number; balance: number; reason: string };
    'item.used': {
      ownerId: string;
      itemId: string;
      targetId?: string;
      effect: string;
      amount?: number;
      ability?: string;
    };
    'item.equipped': { ownerId: string; itemId: string; slot: EquipSlot };
  }
  interface CommandMap {
    'inventory.use': { ownerId: string; itemId: string; targetId?: string };
    'inventory.equip': { ownerId: string; itemId: string };
    'inventory.unequip': { ownerId: string; slot: EquipSlot };
    'inventory.give': { fromId: string; toId: string; itemId: string; count: number };
  }
}

// ---------------------------------------------------------------------------
// Queries

export function itemDef(content: { items: ItemDef[] }, id: string): ItemDef | undefined {
  return content.items.find((i) => i.id === id);
}

export function holdingOf(
  world: { slices: { inventory: InventorySlice } },
  ownerId: string,
): Holding {
  return world.slices.inventory.owners[ownerId] ?? { money: 0, items: {}, equipped: {} };
}

export function countItem(
  world: { slices: { inventory: InventorySlice } },
  ownerId: string,
  itemId: string,
): number {
  return world.slices.inventory.owners[ownerId]?.items[itemId] ?? 0;
}

export function equippedDefs(
  world: { slices: { inventory: InventorySlice } },
  content: { items: ItemDef[] },
  ownerId: string,
): ItemDef[] {
  const h = world.slices.inventory.owners[ownerId];
  if (!h) return [];
  return Object.values(h.equipped)
    .map((id) => (id ? itemDef(content, id) : undefined))
    .filter((d): d is ItemDef => !!d);
}

// ---------------------------------------------------------------------------
// Ports

function holding(ctx: SystemContext, ownerId: string): Holding {
  const owners = ctx.world.slices.inventory.owners;
  let h = owners[ownerId];
  if (!h) {
    h = { money: 0, items: {}, equipped: {} };
    owners[ownerId] = h;
  }
  return h;
}

export function addItem(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  count = 1,
  reason = 'gain',
): void {
  if (count <= 0) return;
  const h = holding(ctx, ownerId);
  h.items[itemId] = (h.items[itemId] ?? 0) + count;
  ctx.emit('inventory.changed', { ownerId, itemId, delta: count, reason });
}

export function removeItem(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  count = 1,
  reason = 'spend',
): boolean {
  const h = holding(ctx, ownerId);
  const have = h.items[itemId] ?? 0;
  if (have < count) return false;
  if (have === count) delete h.items[itemId];
  else h.items[itemId] = have - count;
  for (const [slot, id] of Object.entries(h.equipped)) {
    if (id === itemId && !h.items[itemId]) delete h.equipped[slot as EquipSlot];
  }
  ctx.emit('inventory.changed', { ownerId, itemId, delta: -count, reason });
  return true;
}

export function addMoney(
  ctx: SystemContext,
  ownerId: string,
  copper: number,
  reason: string,
): void {
  if (copper === 0) return;
  const h = holding(ctx, ownerId);
  h.money += Math.round(copper);
  ctx.emit('money.changed', { ownerId, delta: Math.round(copper), balance: h.money, reason });
}

export function spendMoney(
  ctx: SystemContext,
  ownerId: string,
  copper: number,
  reason: string,
): boolean {
  const h = holding(ctx, ownerId);
  if (h.money < copper) return false;
  addMoney(ctx, ownerId, -copper, reason);
  return true;
}

export const system: GameSystem = {
  id: 'inventory',
  order: 15,
  init(ctx) {
    ctx.world.slices.inventory = { owners: {} };
  },
  commands: {
    'inventory.use'(ctx, d) {
      const def = itemDef(ctx.content, d.itemId);
      if (!def) return reject('no_item', tr('sys.inventory.reject.no_item'));
      if (!def.use) return reject('not_usable', tr('sys.inventory.reject.not_usable'));
      if (countItem(ctx.world, d.ownerId, d.itemId) <= 0)
        return reject('missing', tr('sys.inventory.reject.missing.bag'));
      if (def.kind === 'consumable') removeItem(ctx, d.ownerId, d.itemId, 1, 'use');
      ctx.emit('item.used', {
        ownerId: d.ownerId,
        itemId: d.itemId,
        targetId: d.targetId,
        effect: def.use.effect,
        amount: def.use.amount,
        ability: def.use.ability,
      });
      return ok();
    },
    'inventory.equip'(ctx, d) {
      const def = itemDef(ctx.content, d.itemId);
      if (!def?.slot) return reject('not_equipment', tr('sys.inventory.reject.not_equipment'));
      if (countItem(ctx.world, d.ownerId, d.itemId) <= 0)
        return reject('missing', tr('sys.inventory.reject.missing.bag'));
      holding(ctx, d.ownerId).equipped[def.slot] = d.itemId;
      ctx.emit('item.equipped', { ownerId: d.ownerId, itemId: d.itemId, slot: def.slot });
      return ok();
    },
    'inventory.unequip'(ctx, d) {
      const h = holding(ctx, d.ownerId);
      if (!h.equipped[d.slot]) return reject('empty', tr('sys.inventory.reject.empty'));
      delete h.equipped[d.slot];
      return ok();
    },
    'inventory.give'(ctx, d) {
      if (d.count <= 0) return reject('bad_count', tr('sys.inventory.reject.bad_count'));
      if (!removeItem(ctx, d.fromId, d.itemId, d.count, 'give'))
        return reject('missing', tr('sys.inventory.reject.missing.count'));
      addItem(ctx, d.toId, d.itemId, d.count, 'receive');
      return ok();
    },
  },
};
