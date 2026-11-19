// Inventory window model: the player's purse, equipment slots and bag items grouped by
// kind, with the actions each item allows. Pieces with their own record (D-072; the instance
// layer of PK-M1-13) show their durability "cur/max" (at 0 the line reads that the attributes
// have lapsed: the piece stays wearable, ux_and_onboarding.md 6.2.2), the maker's signature
// (the player's own work reads as by one without a record), the sediment grain and whether it
// is purified; qualified stack parts carry the same notes. The grain uses the mortal word
// until the player hears the real one (`term.dian_known`, D-030). Built from inventory
// queries; pure.

import { formatMoney, t, tOr } from '../../shared_ui/i18n';
import {
  type EquipSlot,
  type Holding,
  type ItemDef,
  type ItemInstance,
  type ItemKind,
  type StackPart,
  UNRECORDED,
} from '../../systems/inventory';

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

/** One piece with its own record, as the bag row or the equipment slot shows it. */
export interface InstanceLine {
  instanceId: string;
  /** "耐久 cur/max", or null for a piece that never wears */
  durability: string | null;
  /** durability 0: the attributes have lapsed (the piece is still worn) */
  lapsed: boolean;
  /** the maker's signature line, or null when unsigned */
  signature: string | null;
  /** the sediment grain, or null when none */
  sed: string | null;
  purified: boolean;
  /** every note above in one line, for the row and the hover text */
  notes: string[];
}

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
  /** the pieces in the bag with their own record (worn pieces sit in their slot) */
  instances: InstanceLine[];
  /** qualified stack parts ("已净化 x3"), one note each */
  parts: string[];
}

export interface EquippedSlotView {
  slot: EquipSlot;
  label: string;
  itemId?: string;
  name?: string;
  quality?: number;
  /** the worn piece's record, when it has one */
  instance?: InstanceLine;
}

export interface InventoryView {
  money: string;
  equipped: EquippedSlotView[];
  groups: { kind: ItemKind | 'unknown'; label: string; items: ItemRowView[] }[];
  empty: boolean;
}

export interface InventoryViewOptions {
  /** a person's display name (signatures); the id shows without it */
  personName?: (id: string) => string;
  /** the player knows the word (`term.dian_known`): grains use it instead of the mortal word */
  dianKnown?: boolean;
}

export function qualityLabel(q: number): string {
  return t(`ui.win.inventory.quality.${Math.max(0, Math.min(5, Math.round(q)))}`);
}

function signatureLine(sig: string | undefined, opts: InventoryViewOptions): string | null {
  if (!sig) return null;
  if (sig === UNRECORDED) return t('ui.win.inventory.signed_unrecorded');
  return t('ui.win.inventory.signed', { name: opts.personName?.(sig) ?? sig });
}

function sedLine(tier: number | undefined, opts: InventoryViewOptions): string | null {
  if (!tier || tier < 1) return null;
  const n = Math.min(3, Math.round(tier));
  return opts.dianKnown ? t(`ui.win.inventory.sed.${n}`) : t(`ui.win.inventory.sed_mortal.${n}`);
}

/** The display line of one piece with its own record. */
export function instanceLine(inst: ItemInstance, opts: InventoryViewOptions = {}): InstanceLine {
  const d = inst.durability;
  const lapsed = !!d && d.cur <= 0;
  const durability = d
    ? t('ui.win.inventory.durability', { cur: Math.max(0, Math.round(d.cur)), max: d.max })
    : null;
  const signature = signatureLine(inst.signature, opts);
  const sed = sedLine(inst.sedTier, opts);
  const purified = !!inst.purified;
  const notes = [
    durability,
    lapsed ? t('ui.win.inventory.lapsed') : null,
    signature,
    sed,
    purified ? t('ui.win.inventory.purified') : null,
  ].filter((n): n is string => !!n);
  return { instanceId: inst.instanceId, durability, lapsed, signature, sed, purified, notes };
}

/** The note of a qualified stack part, or null for a plain one. */
function partNote(p: StackPart, opts: InventoryViewOptions): string | null {
  const notes = [
    signatureLine(p.signature, opts),
    sedLine(p.sedTier, opts),
    p.purified ? t('ui.win.inventory.purified') : null,
  ].filter((n): n is string => !!n);
  if (notes.length === 0) return null;
  return t('ui.win.inventory.part', { notes: notes.join(' '), count: p.count });
}

export function buildInventoryView(
  holding: Readonly<Holding>,
  itemDef: (id: string) => ItemDef | undefined,
  opts: InventoryViewOptions = {},
): InventoryView {
  const equippedIds = new Set(Object.values(holding.equipped).filter((v): v is string => !!v));
  const instances = holding.instances ?? {};
  const wornIds = new Set(Object.values(holding.worn ?? {}).filter((v): v is string => !!v));
  const equipped = EQUIP_SLOTS.map((slot): EquippedSlotView => {
    const id = holding.equipped[slot];
    const def = id ? itemDef(id) : undefined;
    const instId = holding.worn?.[slot];
    const inst = instId ? instances[instId] : undefined;
    const row: EquippedSlotView = {
      slot,
      label: tOr(`ui.win.inventory.slot.${slot}`, slot),
      itemId: id,
      name: id ? (def?.name ?? id) : undefined,
      quality: def?.quality,
    };
    if (inst) row.instance = instanceLine(inst, opts);
    return row;
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
      instances: Object.values(instances)
        .filter((i) => i.defId === id && !wornIds.has(i.instanceId))
        .sort((a, b) => (a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0))
        .map((i) => instanceLine(i, opts)),
      parts: (holding.stacks ?? [])
        .filter((p) => p.itemId === id && p.count > 0)
        .map((p) => partNote(p, opts))
        .filter((n): n is string => !!n),
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
