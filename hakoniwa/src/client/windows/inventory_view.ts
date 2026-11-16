// Inventory window model: the player's purse, equipment slots and bag items grouped by
// kind, with the actions each item allows. Built from inventory queries; pure.

import { formatMoney, t, tOr } from '../../shared_ui/i18n';
import type { EquipSlot, Holding, ItemDef, ItemKind } from '../../systems/inventory';

export const EQUIP_SLOTS: readonly EquipSlot[] = [
  'main_hand',
  'off_hand',
  'head',
  'chest',
  'legs',
  'hands',
  'feet',
  'trinket',
];

const KIND_ORDER: readonly ItemKind[] = [
  'weapon',
  'armor',
  'trinket',
  'consumable',
  'key',
  'evidence',
  'lore',
  'material',
  'goods',
];

export type ItemAction = 'equip' | 'use';

export interface ItemRowView {
  id: string;
  name: string;
  count: number;
  quality: number;
  qualityLabel: string;
  desc: string;
  value: string;
  actions: ItemAction[];
  equipped: boolean;
  levelNote?: string;
}

export interface InventoryView {
  money: string;
  equipped: { slot: EquipSlot; label: string; itemId?: string; name?: string; quality?: number }[];
  groups: { kind: ItemKind | 'unknown'; label: string; items: ItemRowView[] }[];
  empty: boolean;
}

export function qualityLabel(q: number): string {
  return t(`ui.win.inventory.quality.${Math.max(0, Math.min(5, Math.round(q)))}`);
}

export function buildInventoryView(
  holding: Readonly<Holding>,
  itemDef: (id: string) => ItemDef | undefined,
): InventoryView {
  const equippedIds = new Set(Object.values(holding.equipped).filter((v): v is string => !!v));
  const equipped = EQUIP_SLOTS.map((slot) => {
    const id = holding.equipped[slot];
    const def = id ? itemDef(id) : undefined;
    return {
      slot,
      label: tOr(`ui.win.inventory.slot.${slot}`, slot),
      itemId: id,
      name: id ? (def?.name ?? id) : undefined,
      quality: def?.quality,
    };
  });
  const byKind = new Map<ItemKind | 'unknown', ItemRowView[]>();
  for (const [id, count] of Object.entries(holding.items)) {
    if (count <= 0) continue;
    const def = itemDef(id);
    const kind: ItemKind | 'unknown' = def?.kind ?? 'unknown';
    const actions: ItemAction[] = [];
    if (def?.slot) actions.push('equip');
    if (def?.use) actions.push('use');
    const row: ItemRowView = {
      id,
      name: def?.name ?? id,
      count,
      quality: def?.quality ?? 1,
      qualityLabel: qualityLabel(def?.quality ?? 1),
      desc: def?.desc ?? '',
      value: t('ui.win.inventory.value', { money: formatMoney(def?.value ?? 0) }),
      actions,
      equipped: equippedIds.has(id),
      levelNote: def?.level
        ? t('ui.win.inventory.requires_level', { level: def.level })
        : undefined,
    };
    const list = byKind.get(kind) ?? [];
    list.push(row);
    byKind.set(kind, list);
  }
  const order = [...KIND_ORDER, 'unknown' as const];
  const groups = order
    .filter((k) => byKind.has(k))
    .map((k) => ({
      kind: k,
      label: k === 'unknown' ? t('ui.hud.log.unknown_item') : tOr(`ui.win.inventory.kind.${k}`, k),
      items: (byKind.get(k) as ItemRowView[]).sort(
        (a, b) => b.quality - a.quality || a.name.localeCompare(b.name, 'zh-CN'),
      ),
    }));
  return {
    money: formatMoney(holding.money),
    equipped,
    groups,
    empty: groups.length === 0,
  };
}
