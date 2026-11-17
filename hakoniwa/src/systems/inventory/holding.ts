// The ledger of one holding (D-072): counts in `items`, instance records in `instances`,
// qualified stack parts in `stacks`, worn instances in `worn` beside the item ids of
// `equipped`. Pure functions over a Holding; ids come from the caller (`newId`), so the
// same calls give the same holding. A holding from a save written before the instance
// layer has counts only; `syncItem` and `syncHolding` give its instanced items their
// records (full durability, the definition's maker) the first time they are touched.

import {
  gradeTier,
  isInstanced,
  isPlain,
  maxDurability,
  type QualifierFields,
  qualifiersOf,
  stackKey,
} from './rules';
import type {
  EquipSlot,
  Holding,
  InstanceInit,
  ItemDef,
  ItemInstance,
  StackPart,
  StackQualifiers,
} from './types';

export type DefLookup = (itemId: string) => ItemDef | undefined;
export type NewId = (prefix: string) => string;

/** The id prefix of item instances (world.ids counter). */
export const INSTANCE_ID_PREFIX = 'it';

/** Named and legendary pieces keep their holder (catalog_equipment.md 1.6). */
export const NAMED_QUALITY = 4;

export function emptyHolding(): Holding {
  return { money: 0, items: {}, equipped: {} };
}

/** Instance ids in creation order (`it2` before `it10`). */
export function compareInstanceIds(a: string, b: string): number {
  return a.length - b.length || (a < b ? -1 : a > b ? 1 : 0);
}

/** The holding's instances of one item, in id order. */
export function instancesOf(h: Holding, itemId: string): ItemInstance[] {
  if (!h.instances) return [];
  return Object.values(h.instances)
    .filter((i) => i?.defId === itemId)
    .sort((a, b) => compareInstanceIds(a.instanceId, b.instanceId));
}

/** The slot an instance is worn in, if any. */
export function wornSlotOf(h: Holding, instanceId: string): EquipSlot | undefined {
  if (!h.worn) return undefined;
  for (const [slot, id] of Object.entries(h.worn)) if (id === instanceId) return slot as EquipSlot;
  return undefined;
}

/** A new instance record: full durability, the maker's signature, then the given fields. */
export function newInstance(
  def: ItemDef,
  instanceId: string,
  init: InstanceInit = {},
): ItemInstance {
  const inst: ItemInstance = { instanceId, defId: def.id };
  const max = maxDurability(def);
  if (max !== undefined) inst.durability = { cur: max, max };
  if (def.maker) inst.signature = def.maker;
  const grain = gradeTier(def.sed?.grade);
  if (grain > 0) inst.sedTier = grain;
  if (grain > 0 && def.sed?.purified) inst.purified = true;
  for (const [k, v] of Object.entries(init)) {
    if (v === undefined) continue;
    (inst as unknown as Record<string, unknown>)[k] = Array.isArray(v)
      ? [...v]
      : typeof v === 'object' && v !== null
        ? { ...v }
        : v;
  }
  return inst;
}

/** Add an instance record (and count it). */
export function putInstance(h: Holding, inst: ItemInstance): void {
  h.instances ??= {};
  h.instances[inst.instanceId] = inst;
  h.items[inst.defId] = (h.items[inst.defId] ?? 0) + 1;
}

/** Take an instance record out (and uncount it); clears its slot when worn. */
export function dropInstance(h: Holding, instanceId: string): ItemInstance | undefined {
  const inst = h.instances?.[instanceId];
  if (!inst || !h.instances) return undefined;
  delete h.instances[instanceId];
  if (Object.keys(h.instances).length === 0) delete h.instances;
  const slot = wornSlotOf(h, instanceId);
  if (slot) unwear(h, slot);
  const n = (h.items[inst.defId] ?? 0) - 1;
  if (n > 0) h.items[inst.defId] = n;
  else delete h.items[inst.defId];
  return inst;
}

/** Take a slot off (`equipped` and `worn` together). */
export function unwear(h: Holding, slot: EquipSlot): void {
  delete h.equipped[slot];
  if (h.worn) {
    delete h.worn[slot];
    if (Object.keys(h.worn).length === 0) delete h.worn;
  }
}

/** Put an instance on in a slot. */
export function wear(h: Holding, slot: EquipSlot, inst: ItemInstance): void {
  h.equipped[slot] = inst.defId;
  h.worn ??= {};
  h.worn[slot] = inst.instanceId;
}

// ---------------------------------------------------------------------------
// Bringing counts and records together (saves from before the instance layer)

/** Who holds a piece by name in this holding (named and legendary pieces keep a holder). */
export type HolderOf = () => string;

/**
 * Make one instanced item's records agree with its count: missing records are made
 * pristine (oldest saves), extra records leave (unworn, most worn, oldest first), a named
 * piece without a holder gets this holding's, and a slot naming the item gets an instance
 * worn in it. Idempotent; cheap when they already agree. Stacked items are left alone
 * (syncHolding folds the records of an item that became stacked).
 */
export function syncItem(h: Holding, def: ItemDef, newId: NewId, holderOf?: HolderOf): void {
  if (!isInstanced(def)) return;
  const count = h.items[def.id] ?? 0;
  const have = instancesOf(h, def.id);
  for (let i = have.length; i < count; i++) {
    const inst = newInstance(def, newId(INSTANCE_ID_PREFIX));
    h.instances ??= {};
    h.instances[inst.instanceId] = inst;
  }
  if (have.length > count) {
    for (const extra of leavingOrder(h, def.id).slice(0, have.length - count)) {
      const slot = wornSlotOf(h, extra.instanceId);
      if (slot && h.worn) delete h.worn[slot];
      dropRecord(h, extra.instanceId);
    }
    if (h.worn && Object.keys(h.worn).length === 0) delete h.worn;
  }
  if (def.quality >= NAMED_QUALITY && holderOf) {
    for (const inst of instancesOf(h, def.id)) inst.holder ??= holderOf();
  }
  for (const [slot, id] of Object.entries(h.equipped) as [EquipSlot, string][]) {
    if (id !== def.id) continue;
    const cur = h.worn?.[slot];
    if (cur && h.instances?.[cur]?.defId === def.id) continue;
    const free = wearingOrder(h, def.id).find((x) => !wornSlotOf(h, x.instanceId));
    if (free) wear(h, slot, free);
    else unwear(h, slot);
  }
}

/**
 * Sync every item of a holding (item ids in order): instanced items get their records,
 * an item that became stacked folds its records back into its count, and records the
 * rename table emptied (no item id) and slots without a matching record are dropped.
 */
export function syncHolding(h: Holding, defOf: DefLookup, newId: NewId, holderOf?: HolderOf): void {
  for (const id of Object.keys(h.items).sort()) {
    const def = defOf(id);
    if (def) syncItem(h, def, newId, holderOf);
  }
  if (h.instances) {
    for (const [id, inst] of Object.entries(h.instances)) {
      const def = typeof inst?.defId === 'string' ? defOf(inst.defId) : undefined;
      const orphan = typeof inst?.defId !== 'string' || inst.instanceId !== id;
      if (orphan || (def && !isInstanced(def))) dropRecord(h, id);
    }
    if (h.instances && Object.keys(h.instances).length === 0) delete h.instances;
  }
  if (h.worn) {
    for (const [slot, id] of Object.entries(h.worn) as [EquipSlot, string][]) {
      if (!h.instances?.[id] || h.equipped[slot] !== h.instances[id]?.defId) delete h.worn[slot];
    }
    if (Object.keys(h.worn).length === 0) delete h.worn;
  }
  if (h.stacks) {
    h.stacks = h.stacks.filter((p) => typeof p.itemId === 'string' && p.count > 0);
    if (h.stacks.length === 0) delete h.stacks;
  }
}

function dropRecord(h: Holding, id: string): void {
  if (h.instances) delete h.instances[id];
}

// ---------------------------------------------------------------------------
// Qualified stacks

/** The plain (unqualified) count of a stacked item. */
export function plainCount(h: Holding, itemId: string): number {
  let parts = 0;
  for (const p of h.stacks ?? []) if (p.itemId === itemId) parts += p.count;
  return Math.max(0, (h.items[itemId] ?? 0) - parts);
}

/** The count held under one stack key (qualifiers; none means the plain stack). */
export function stackCount(h: Holding, itemId: string, q: QualifierFields = {}): number {
  const qq = qualifiersOf(q);
  if (isPlain(qq)) return plainCount(h, itemId);
  const key = stackKey(itemId, qq);
  return h.stacks?.find((p) => stackKey(p.itemId, p) === key)?.count ?? 0;
}

function addPart(h: Holding, itemId: string, q: StackQualifiers, count: number): void {
  const key = stackKey(itemId, q);
  h.stacks ??= [];
  const cur = h.stacks.find((p) => stackKey(p.itemId, p) === key);
  if (cur) cur.count += count;
  else {
    h.stacks.push({ itemId, ...q, count });
    h.stacks.sort((a, b) => {
      const x = stackKey(a.itemId, a);
      const y = stackKey(b.itemId, b);
      return x < y ? -1 : x > y ? 1 : 0;
    });
  }
}

function takePart(h: Holding, itemId: string, q: StackQualifiers, count: number): void {
  const key = stackKey(itemId, q);
  const i = h.stacks?.findIndex((p) => stackKey(p.itemId, p) === key) ?? -1;
  const part = i >= 0 ? h.stacks?.[i] : undefined;
  if (!part || !h.stacks) return;
  part.count -= count;
  if (part.count <= 0) h.stacks.splice(i, 1);
  if (h.stacks.length === 0) delete h.stacks;
}

// ---------------------------------------------------------------------------
// Parcels: what moves between holdings (give, sell, a drop bag)

export interface Parcel {
  itemId: string;
  /** plain stacked count */
  plain: number;
  /** qualified stack parts */
  parts: StackPart[];
  /** instance records, kept whole */
  instances: ItemInstance[];
}

export function parcelCount(p: Parcel): number {
  return p.plain + p.parts.reduce((n, x) => n + x.count, 0) + p.instances.length;
}

/** Instances in the order they leave a holding: not worn, most worn, oldest. */
function leavingOrder(h: Holding, itemId: string): ItemInstance[] {
  const ratio = (i: ItemInstance) => (i.durability ? i.durability.cur / i.durability.max : 1);
  return instancesOf(h, itemId).sort((a, b) => {
    const wa = wornSlotOf(h, a.instanceId) ? 1 : 0;
    const wb = wornSlotOf(h, b.instanceId) ? 1 : 0;
    return wa - wb || ratio(a) - ratio(b) || compareInstanceIds(a.instanceId, b.instanceId);
  });
}

export interface TakeOptions {
  /** take this instance only */
  instanceId?: string;
  /** take from this stack key only (plain when empty) */
  qualifiers?: QualifierFields;
}

/**
 * Take `count` of an item out of a holding, or nothing (null) when it holds fewer. Stacked
 * items leave plain first, then their qualified parts in key order (unless a stack key is
 * named); instanced items leave unworn first, most worn first, then oldest.
 */
export function take(
  h: Holding,
  def: ItemDef | undefined,
  itemId: string,
  count: number,
  opts: TakeOptions = {},
): Parcel | null {
  const parcel: Parcel = { itemId, plain: 0, parts: [], instances: [] };
  if (count <= 0) return parcel;
  if (opts.instanceId !== undefined) {
    const inst = h.instances?.[opts.instanceId];
    if (!inst || inst.defId !== itemId || count !== 1) return null;
    parcel.instances.push(dropInstance(h, inst.instanceId) as ItemInstance);
    return parcel;
  }
  if (def && isInstanced(def) && h.instances) {
    const order = leavingOrder(h, itemId);
    if (order.length >= count) {
      for (const inst of order.slice(0, count)) {
        parcel.instances.push(dropInstance(h, inst.instanceId) as ItemInstance);
      }
      return parcel;
    }
  }
  if ((h.items[itemId] ?? 0) < count) return null;
  const named = opts.qualifiers !== undefined ? qualifiersOf(opts.qualifiers) : undefined;
  if (named && !isPlain(named)) {
    if (stackCount(h, itemId, named) < count) return null;
    takePart(h, itemId, named, count);
    parcel.parts.push({ itemId, ...named, count });
  } else {
    const plain = Math.min(count, plainCount(h, itemId));
    // the plain stack was named and holds too few
    if (named && plain < count) return null;
    parcel.plain = plain;
    let left = count - plain;
    for (const p of (h.stacks ?? []).filter((x) => x.itemId === itemId)) {
      if (left <= 0) break;
      const n = Math.min(left, p.count);
      const q = qualifiersOf(p);
      takePart(h, itemId, q, n);
      parcel.parts.push({ itemId, ...q, count: n });
      left -= n;
    }
  }
  const n = (h.items[itemId] ?? 0) - count;
  if (n > 0) h.items[itemId] = n;
  else delete h.items[itemId];
  if (!h.items[itemId]) {
    for (const [slot, id] of Object.entries(h.equipped) as [EquipSlot, string][]) {
      if (id === itemId) unwear(h, slot);
    }
  }
  return parcel;
}

/** Put a parcel into a holding (the records keep every field). */
export function put(h: Holding, parcel: Parcel): void {
  if (parcel.plain > 0) h.items[parcel.itemId] = (h.items[parcel.itemId] ?? 0) + parcel.plain;
  for (const p of parcel.parts) {
    addPart(h, p.itemId, qualifiersOf(p), p.count);
    h.items[p.itemId] = (h.items[p.itemId] ?? 0) + p.count;
  }
  for (const inst of parcel.instances) putInstance(h, inst);
}

/** Add `count` of a stacked item, plain or under its qualifiers. */
export function addStacked(h: Holding, itemId: string, count: number, q?: QualifierFields): void {
  const qq = qualifiersOf(q);
  if (!isPlain(qq)) addPart(h, itemId, qq, count);
  h.items[itemId] = (h.items[itemId] ?? 0) + count;
}

/** Instances for wearing: working first, best kept first, the worn one on a tie, oldest. */
export function wearingOrder(h: Holding, itemId: string): ItemInstance[] {
  const ratio = (i: ItemInstance) => (i.durability ? i.durability.cur / i.durability.max : 1);
  const broken = (i: ItemInstance) => (i.durability && i.durability.cur <= 0 ? 1 : 0);
  return instancesOf(h, itemId).sort((a, b) => {
    // working pieces first, best kept first; on a tie the piece already worn stays on
    const wa = wornSlotOf(h, a.instanceId) ? 0 : 1;
    const wb = wornSlotOf(h, b.instanceId) ? 0 : 1;
    return (
      broken(a) - broken(b) ||
      ratio(b) - ratio(a) ||
      wa - wb ||
      compareInstanceIds(a.instanceId, b.instanceId)
    );
  });
}
