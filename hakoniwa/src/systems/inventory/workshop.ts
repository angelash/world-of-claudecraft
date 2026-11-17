// What a workshop does to a piece (catalog_equipment.md 2.6, 2.8, 6;
// catalog_gathering_crafting.md 1.4, 1.5): signing, purifying a piece or a stack,
// refining (+1 to +3 by the smith's layer), and enchanting (new enchants push out the
// oldest when the slots are full). The recipe's materials, fees and the station are the
// crafting system's (PK-M1-49); these ports change the records and tell the client.

import type { SystemContext } from '../../core/system';
import { addStacked, syncItem, take } from './holding';
import { holderId } from './ports';
import {
  ENCHANT_SLOT_OF,
  enchantSlots,
  grainOf,
  isInstanced,
  maxRefine,
  REFINE_SKILL,
  type Smith,
  smithSkill,
} from './rules';
import type {
  EnchantDef,
  Holding,
  ItemDef,
  ItemInstance,
  RefineLevel,
  StackQualifiers,
} from './types';

/** The signature of the player's own work: the record keeps no name for them. */
export const UNRECORDED = 'unrecorded';

type Found = { h: Holding; inst: ItemInstance; def: ItemDef | undefined };

function find(ctx: SystemContext, ownerId: string, instanceId: string): Found | null {
  const h = ctx.world.slices.inventory.owners[ownerId];
  const inst = h?.instances?.[instanceId];
  if (!h || !inst) return null;
  return { h, inst, def: ctx.content.items.find((i) => i.id === inst.defId) };
}

/** Engrave a maker's signature on a piece (a person id, or UNRECORDED for the player). */
export function signInstance(
  ctx: SystemContext,
  ownerId: string,
  instanceId: string,
  signature: string,
): boolean {
  const f = find(ctx, ownerId, instanceId);
  if (!f || !signature) return false;
  f.inst.signature = signature;
  ctx.emit('item.signed', { ownerId, instanceId, itemId: f.inst.defId, signature });
  return true;
}

/** Purify a grained piece: its bonus turns into sediment resistance; the tier stays. */
export function purifyInstance(ctx: SystemContext, ownerId: string, instanceId: string): boolean {
  const f = find(ctx, ownerId, instanceId);
  if (!f || f.inst.purified) return false;
  const tier = f.def ? grainOf(f.def, f.inst).tier : (f.inst.sedTier ?? 0);
  if (tier === 0) return false;
  f.inst.sedTier = tier;
  f.inst.purified = true;
  ctx.emit('item.purified', { ownerId, itemId: f.inst.defId, instanceId, count: 1 });
  return true;
}

/**
 * Purify `count` of a tainted stack (its sediment tier): they move to the purified stack
 * key. The count does not change, so no `inventory.changed`; `item.purified` tells.
 */
export function purifyStack(
  ctx: SystemContext,
  ownerId: string,
  itemId: string,
  count: number,
  sedTier: 1 | 2 | 3,
  q: StackQualifiers = {},
): boolean {
  const h = ctx.world.slices.inventory.owners[ownerId];
  const def = ctx.content.items.find((i) => i.id === itemId);
  if (!h || count <= 0 || (def && isInstanced(def))) return false;
  const from: StackQualifiers = { ...q, sedTier };
  const parcel = take(h, def, itemId, count, { qualifiers: from });
  if (!parcel) return false;
  addStacked(h, itemId, count, { ...from, purified: true });
  ctx.emit('item.purified', { ownerId, itemId, count });
  return true;
}

export type RefineFailure = 'no_instance' | 'max' | 'smith';

/**
 * Refine a piece one level (the recipe's materials are the crafting system's): up to +3,
 * +4 on deep-hammer work; the smith needs the level's skill in the piece's trade, a named
 * piece a master.
 */
export function refineInstance(
  ctx: SystemContext,
  ownerId: string,
  instanceId: string,
  smith: Smith,
): { ok: boolean; failure?: RefineFailure; refine?: number } {
  const f = find(ctx, ownerId, instanceId);
  if (!f?.def?.slot) return { ok: false, failure: 'no_instance' };
  const next = (f.inst.refine ?? 0) + 1;
  if (next > maxRefine(f.def)) return { ok: false, failure: 'max' };
  const skill = REFINE_SKILL[next] ?? Number.POSITIVE_INFINITY;
  const named = f.def.quality >= 4;
  if ((named && !smith.master) || (!smith.master && smithSkill(smith, f.def) < skill)) {
    return { ok: false, failure: 'smith' };
  }
  f.inst.refine = next as RefineLevel;
  ctx.emit('item.refined', { ownerId, instanceId, itemId: f.inst.defId, refine: next });
  return { ok: true, refine: next };
}

export type EnchantFailure = 'no_instance' | 'no_enchant' | 'slot' | 'no_room';

/**
 * Put an enchant on a piece: it must fit the piece's slot; when the slots are full the
 * oldest enchant is replaced (catalog_equipment.md 6).
 */
export function enchantInstance(
  ctx: SystemContext,
  ownerId: string,
  instanceId: string,
  enchantId: string,
): { ok: boolean; failure?: EnchantFailure; replaced?: string } {
  const f = find(ctx, ownerId, instanceId);
  if (!f?.def?.slot) return { ok: false, failure: 'no_instance' };
  const ench = (ctx.content.enchants as EnchantDef[] | undefined)?.find((e) => e.id === enchantId);
  if (!ench) return { ok: false, failure: 'no_enchant' };
  if (ENCHANT_SLOT_OF[f.def.slot] !== ench.slot) return { ok: false, failure: 'slot' };
  const room = enchantSlots(f.def);
  if (room <= 0) return { ok: false, failure: 'no_room' };
  const list = (f.inst.affixes ?? []).filter((a) => a !== enchantId);
  let replaced: string | undefined;
  while (list.length >= room) replaced = list.shift();
  list.push(enchantId);
  f.inst.affixes = list;
  ctx.emit('item.enchanted', { ownerId, instanceId, itemId: f.inst.defId, enchantId, replaced });
  return { ok: true, replaced };
}

/** Bring every instanced item of an owner to its records (before a workshop lists them). */
export function syncOwner(ctx: SystemContext, ownerId: string): void {
  const h = ctx.world.slices.inventory.owners[ownerId];
  if (!h) return;
  for (const id of Object.keys(h.items).sort()) {
    const def = ctx.content.items.find((i) => i.id === id);
    if (def)
      syncItem(
        h,
        def,
        (p) => ctx.newId(p),
        () => holderId(ctx, ownerId),
      );
  }
}
