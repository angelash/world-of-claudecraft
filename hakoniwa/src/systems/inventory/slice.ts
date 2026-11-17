// The inventory slice in saves (release_engineering.md 5.5): the save check, where content
// ids sit for the rename table, and the instance-layer backfill. Development saves before
// the compatibility promise (M2) get no world-version step; a save written before the
// instance layer (D-072) has counts only, and its first tick gives every instanced item a
// record (full durability, the definition's maker, the holder of a named piece) and every
// slot its worn instance, then marks the slice with the layer's revision. The slice also
// keeps the fingerprint of the item rules it settled under: a save loaded under other
// item content (an item turned stacked or instanced, a rename that removed an item) is
// swept once more on its first tick. Ports touching an item before the sweep sync that
// item first (holding.ts `syncItem`); either way every piece gets one record, though
// record ids follow the order things were touched.

import type { ContentMap } from '../../core/contracts';
import type { IdField } from '../../core/save/renames';
import type { SystemContext } from '../../core/system';
import { type DefLookup, type NewId, syncHolding } from './holding';
import { holderId } from './ports';
import { isInstanced, maxDurability } from './rules';
import { type InventorySlice, type ItemDef, SLOT_ORDER } from './types';

const SLOTS: ReadonlySet<string> = new Set(SLOT_ORDER);

/** The instance layer's revision; a slice without it is from before the layer. */
export const INSTANCE_LAYER_REV = 1;

/**
 * Where the slice keeps content ids (5.5 `idFields`): item ids in counts, slots, records
 * and stack parts (a removed item refunds its value into the holder's money once, from the
 * count), enchant ids on records, and person ids in signatures, holders and bonds.
 */
export const INVENTORY_ID_FIELDS: readonly IdField[] = [
  { path: 'owners.*.items.@keys', kind: 'item', merge: 'sum', refund: { money: 'money' } },
  { path: 'owners.*.equipped.*', kind: 'item' },
  { path: 'owners.*.instances.*.defId', kind: 'item' },
  { path: 'owners.*.stacks.*.itemId', kind: 'item' },
  { path: 'owners.*.instances.*.affixes.*', kind: 'enchant' },
  { path: 'owners.*.instances.*.signature', kind: 'npc' },
  { path: 'owners.*.instances.*.holder', kind: 'npc' },
  { path: 'owners.*.instances.*.boundTo', kind: 'npc' },
  { path: 'owners.*.stacks.*.signature', kind: 'npc' },
];

const signatures = new WeakMap<object, string>();

/**
 * A short fingerprint of what the sweep reads from the item content (ids, which are
 * instanced, durability caps, makers): a slice settled under another one is swept again.
 */
export function itemsSignature(content: { items?: ItemDef[] }): string {
  const items = content.items ?? [];
  let sig = signatures.get(items);
  if (sig === undefined) {
    const text = JSON.stringify(
      items.map((d) => [d.id, isInstanced(d), maxDurability(d) ?? 0, d.maker ?? '']),
    );
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    sig = (h >>> 0).toString(16).padStart(8, '0');
    signatures.set(items, sig);
  }
  return sig;
}

/** Bring every holding to its records and mark the slice. */
export function upgradeSlice(
  slice: InventorySlice,
  defOf: DefLookup,
  newId: NewId,
  holderOf?: (ownerId: string) => string,
): void {
  for (const id of Object.keys(slice.owners).sort()) {
    const h = slice.owners[id];
    if (h) syncHolding(h, defOf, newId, holderOf ? () => holderOf(id) : undefined);
  }
  slice.rev = INSTANCE_LAYER_REV;
}

/** A fresh slice, at the layer's revision and the content's fingerprint. */
export function freshSlice(content: ContentMap): InventorySlice {
  return { owners: {}, rev: INSTANCE_LAYER_REV, content: itemsSignature(content) };
}

/**
 * The tick hook: one sweep on the first tick of a save from before the layer, or of a
 * save that settled under other item content.
 */
export function upgradeOnce(ctx: SystemContext): void {
  const slice = ctx.world.slices.inventory;
  if (!slice) return;
  const sig = itemsSignature(ctx.content);
  if (slice.rev === INSTANCE_LAYER_REV && slice.content === sig) return;
  const items = ctx.content.items ?? [];
  upgradeSlice(
    slice,
    (id) => items.find((i) => i.id === id),
    (p) => ctx.newId(p),
    (owner) => holderId(ctx, owner),
  );
  slice.content = sig;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** The save check of the slice: the problems found, empty when it is sound. */
export function validateInventorySlice(slice: unknown): string[] {
  if (slice === undefined) return [];
  if (!isObj(slice)) return ['inventory is not an object'];
  if (!isObj(slice.owners)) return ['inventory.owners is not an object'];
  const out: string[] = [];
  if (slice.rev !== undefined && !isCount(slice.rev)) out.push('inventory.rev is not a revision');
  if (slice.content !== undefined && typeof slice.content !== 'string') {
    out.push('inventory.content is not a fingerprint');
  }
  if (slice.timers !== undefined) {
    if (!isObj(slice.timers)) out.push('inventory.timers is not an object');
    else
      for (const [o, t] of Object.entries(slice.timers)) {
        if (!isObj(t) || !Object.values(t).every(isCount)) out.push(`inventory.timers.${o} is bad`);
      }
  }
  for (const [owner, raw] of Object.entries(slice.owners)) {
    const at = `inventory.owners.${owner}`;
    if (!isObj(raw)) {
      out.push(`${at} is not a holding`);
      continue;
    }
    if (typeof raw.money !== 'number' || !Number.isFinite(raw.money))
      out.push(`${at}.money is bad`);
    if (!isObj(raw.items)) {
      out.push(`${at}.items is not an object`);
      continue;
    }
    for (const [k, n] of Object.entries(raw.items)) {
      if (!isCount(n)) out.push(`${at}.items.${k} is not a count`);
    }
    if (!isObj(raw.equipped)) out.push(`${at}.equipped is not an object`);
    else
      for (const [slot, id] of Object.entries(raw.equipped)) {
        if (!SLOTS.has(slot)) out.push(`${at}.equipped.${slot} is not a slot`);
        if (typeof id !== 'string') out.push(`${at}.equipped.${slot} is not an item id`);
      }
    const items = raw.items as Record<string, number>;
    const perDef = new Map<string, number>();
    if (raw.instances !== undefined) {
      if (!isObj(raw.instances)) out.push(`${at}.instances is not an object`);
      else
        for (const [id, inst] of Object.entries(raw.instances)) {
          if (!isObj(inst) || inst.instanceId !== id) {
            out.push(`${at}.instances.${id} is not an instance`);
            continue;
          }
          // a record whose item the rename table removed: dropped at the next sync
          if (typeof inst.defId !== 'string') continue;
          perDef.set(inst.defId, (perDef.get(inst.defId) ?? 0) + 1);
          const d = inst.durability;
          if (d !== undefined) {
            const ok =
              isObj(d) &&
              typeof d.cur === 'number' &&
              typeof d.max === 'number' &&
              d.cur >= 0 &&
              d.cur <= d.max;
            if (!ok) out.push(`${at}.instances.${id}.durability is bad`);
          }
          const caps = { marks: 100, refine: 3, sedTier: 3 } as const;
          for (const k of ['marks', 'refine', 'sedTier'] as const) {
            const v = inst[k];
            if (v !== undefined && !(isCount(v) && v <= caps[k])) {
              out.push(`${at}.instances.${id}.${k} is bad`);
            }
          }
          const aff = inst.affixes;
          if (
            aff !== undefined &&
            !(Array.isArray(aff) && aff.every((a) => typeof a === 'string'))
          ) {
            out.push(`${at}.instances.${id}.affixes is bad`);
          }
        }
    }
    for (const [def, n] of perDef) {
      if (n > (items[def] ?? 0)) out.push(`${at}: ${n} records of ${def} for ${items[def] ?? 0}`);
    }
    if (raw.worn !== undefined) {
      if (!isObj(raw.worn)) out.push(`${at}.worn is not an object`);
      else
        for (const [slot, id] of Object.entries(raw.worn)) {
          const inst = isObj(raw.instances) ? raw.instances[id as string] : undefined;
          const equipped = isObj(raw.equipped) ? raw.equipped[slot] : undefined;
          // a slot the rename table emptied: dropped at the next sync
          if (equipped === undefined || (isObj(inst) && inst.defId === undefined)) continue;
          if (!isObj(inst) || inst.defId !== equipped)
            out.push(`${at}.worn.${slot} does not match`);
        }
    }
    if (raw.stacks !== undefined) {
      if (!Array.isArray(raw.stacks)) out.push(`${at}.stacks is not a list`);
      else {
        const parts = new Map<string, number>();
        raw.stacks.forEach((p, i) => {
          // a part whose item the rename table removed: dropped at the next sweep
          if (isObj(p) && p.itemId === undefined) return;
          if (!isObj(p) || typeof p.itemId !== 'string' || !isCount(p.count) || p.count === 0) {
            out.push(`${at}.stacks[${i}] is not a stack part`);
            return;
          }
          parts.set(p.itemId, (parts.get(p.itemId) ?? 0) + p.count);
        });
        for (const [def, n] of parts) {
          if (n > (items[def] ?? 0))
            out.push(`${at}: ${n} qualified ${def} for ${items[def] ?? 0}`);
        }
      }
    }
  }
  return out;
}
