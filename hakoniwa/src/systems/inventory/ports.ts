// The inventory's write ports (implementation_conventions.md 6.3): items and money for
// every owner. Instanced items (D-072) get a record per piece as they arrive, stacked
// items a count (or a qualified part); removals and transfers move whole records. A
// holding from before the instance layer is brought to its records the first time an
// instanced item of it is touched.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';
import {
  addStacked,
  emptyHolding,
  INSTANCE_ID_PREFIX,
  NAMED_QUALITY,
  newInstance,
  type Parcel,
  parcelCount,
  put,
  putInstance,
  syncItem,
  type TakeOptions,
  take,
} from './holding';
import { isInstanced } from './rules';
import type { Holding, InstanceInit, ItemDef } from './types';

function defOf(ctx: SystemContext, id: string): ItemDef | undefined {
  return ctx.content.items.find((i) => i.id === id);
}

/** The holding for writing, created on first use. */
export function holding(ctx: SystemContext, ownerId: string): Holding {
  const owners = ctx.world.slices.inventory.owners;
  let h = owners[ownerId];
  if (!h) {
    h = emptyHolding();
    owners[ownerId] = h;
  }
  return h;
}

/** Bring one item of a holding to its records (no-op for stacked items). */
export function syncOwnerItem(ctx: SystemContext, ownerId: string, itemId: string): void {
  const def = defOf(ctx, itemId);
  const h = ctx.world.slices.inventory.owners[ownerId];
  if (def && h)
    syncItem(
      h,
      def,
      (p) => ctx.newId(p),
      () => holderId(ctx, ownerId),
    );
}

/** Who holds a piece by name: the entity's person id, else the owner id. */
export function holderId(ctx: SystemContext, ownerId: string): string {
  const w = ctx.world as unknown as Parameters<typeof getEntity>[0];
  return (w.slices.world ? getEntity(w, ownerId)?.ref : undefined) ?? ownerId;
}

/** What `addItem` may set: instance fields (instanced items) or stack qualifiers (stacks). */
export type ItemGrant = InstanceInit & { spoilDay?: number };

/**
 * Give an owner `count` of an item. An instanced item gets a new record per piece (full
 * durability, the definition's maker as signature, the holder for named pieces, then
 * `init`); a stacked item is counted, under its qualifiers when `init` names any.
 * Returns the new instance ids (empty for stacks).
 */
export function addItem(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  count = 1,
  reason = 'gain',
  init?: ItemGrant,
): string[] {
  if (count <= 0) return [];
  const h = holding(ctx, ownerId);
  const def = defOf(ctx, itemId);
  const ids: string[] = [];
  if (def && isInstanced(def)) {
    syncItem(
      h,
      def,
      (p) => ctx.newId(p),
      () => holderId(ctx, ownerId),
    );
    for (let i = 0; i < count; i++) {
      const inst = newInstance(def, ctx.newId(INSTANCE_ID_PREFIX), instanceInit(init));
      if (def.quality >= NAMED_QUALITY && inst.holder === undefined) {
        inst.holder = holderId(ctx, ownerId);
      }
      putInstance(h, inst);
      ids.push(inst.instanceId);
    }
  } else {
    addStacked(h, itemId, count, init);
  }
  ctx.emit('inventory.changed', { ownerId, itemId, delta: count, reason });
  return ids;
}

function instanceInit(init: ItemGrant | undefined): InstanceInit {
  if (!init) return {};
  const out: InstanceInit = { ...init };
  delete (out as { spoilDay?: number }).spoilDay;
  return out;
}

/** One new instance for crafting and quest rewards; returns its id. */
export function addInstance(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  init: InstanceInit = {},
  reason = 'gain',
): string | undefined {
  return addItem(ctx, ownerId, itemId, 1, reason, init)[0];
}

/** Take items out of a holding as a parcel (instances whole), or null when it holds fewer. */
export function takeItems(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  count = 1,
  reason = 'spend',
  opts: TakeOptions = {},
): Parcel | null {
  const h = holding(ctx, ownerId);
  const def = defOf(ctx, itemId);
  if (def)
    syncItem(
      h,
      def,
      (p) => ctx.newId(p),
      () => holderId(ctx, ownerId),
    );
  const parcel = take(h, def, itemId, count, opts);
  if (!parcel) return null;
  const n = parcelCount(parcel);
  if (n > 0) ctx.emit('inventory.changed', { ownerId, itemId, delta: -n, reason });
  return parcel;
}

export function removeItem(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  count = 1,
  reason = 'spend',
  opts: TakeOptions = {},
): boolean {
  return takeItems(ctx, ownerId, itemId, count, reason, opts) !== null;
}

/** Put a parcel into a holding; named pieces change holder. */
export function putItems(
  ctx: SystemContext,
  ownerId: string,
  parcel: Parcel,
  reason = 'receive',
): void {
  const h = holding(ctx, ownerId);
  const def = defOf(ctx, parcel.itemId);
  if (def)
    syncItem(
      h,
      def,
      (p) => ctx.newId(p),
      () => holderId(ctx, ownerId),
    );
  const named = (def?.quality ?? 0) >= NAMED_QUALITY;
  for (const inst of parcel.instances) {
    if (named || inst.holder !== undefined) inst.holder = holderId(ctx, ownerId);
  }
  put(h, parcel);
  const n = parcelCount(parcel);
  if (n > 0) ctx.emit('inventory.changed', { ownerId, itemId: parcel.itemId, delta: n, reason });
}

/** Move items between owners, records and qualifiers intact. */
export function transferItem(
  ctx: SystemContext,
  fromId: string,
  toId: string,
  itemId: string,
  count = 1,
  opts: TakeOptions = {},
): boolean {
  const parcel = takeItems(ctx, fromId, itemId, count, 'give', opts);
  if (!parcel) return false;
  putItems(ctx, toId, parcel, 'receive');
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
