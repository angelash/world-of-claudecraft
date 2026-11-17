// Durability and repair (D-072; catalog_equipment.md 2.7; combat_and_classes.md 13.2,
// 15.1): wear on worn pieces (each fight, a share at death, a companion's retreat), the
// warning at 20%, a piece at 0 that stays on but gives nothing (a poor piece breaks into
// its salvage instead), repair at a smith (cost, materials, who may) and the field kit.
// Combat calls the wear ports; this module never reads the combat slice.

import type { SystemContext } from '../../core/system';
import { ownerSediment, wornPieces } from './gear';
import { dropInstance, syncItem } from './holding';
import { addItem, holderId, removeItem, spendMoney } from './ports';
import {
  canRepair,
  DEATH_WEAR,
  FIELD_REPAIR_SHARE,
  FIGHT_WEAR,
  fieldKitMends,
  LOW_DURABILITY,
  type RepairQuote,
  repairQuote,
  roundDurability,
  type Smith,
  sedimentWearFactor,
} from './rules';
import type { Holding, ItemDef, ItemInstance } from './types';

export type WearReason = 'death' | 'fight' | 'retreat' | 'revive' | 'tool' | string;

function holdingFor(ctx: SystemContext, ownerId: string): Holding | undefined {
  return ctx.world.slices.inventory.owners[ownerId];
}

function defOf(ctx: SystemContext, id: string): ItemDef | undefined {
  return ctx.content.items.find((i) => i.id === id);
}

/** A named piece does not wear in the hands its will recognizes (catalog_equipment.md 2.7). */
function wearsHere(def: ItemDef, inst: ItemInstance): boolean {
  return !(def.recognizes && inst.holder === def.recognizes);
}

/**
 * Take `amount` durability off one instance (not below 0). Emits `item.durability` when it
 * crosses the 20% line (`low`) or reaches 0 (`broken`); a poor piece at 0 breaks into its
 * salvage and is gone (`shattered`). Returns the durability left.
 */
export function wearInstance(
  ctx: SystemContext,
  ownerId: string,
  instanceId: string,
  amount: number,
  reason: WearReason,
): number | undefined {
  const h = holdingFor(ctx, ownerId);
  const inst = h?.instances?.[instanceId];
  const d = inst?.durability;
  if (!h || !inst || !d || amount <= 0) return d?.cur;
  const def = defOf(ctx, inst.defId);
  if (def && !wearsHere(def, inst)) return d.cur;
  const before = d.cur;
  d.cur = roundDurability(Math.max(0, before - amount));
  const base = { ownerId, instanceId, itemId: inst.defId, max: d.max, reason };
  if (d.cur <= 0 && before > 0) {
    if (def && def.quality <= 0) {
      dropInstance(h, instanceId);
      ctx.emit('inventory.changed', {
        ownerId,
        itemId: inst.defId,
        delta: -1,
        reason: 'shattered',
      });
      ctx.emit('item.durability', { ...base, cur: 0, state: 'shattered' });
      if (def.salvage) addItem(ctx, ownerId, def.salvage.itemId, def.salvage.count ?? 1, 'salvage');
      return 0;
    }
    ctx.emit('item.durability', { ...base, cur: 0, state: 'broken' });
  } else if (d.cur <= d.max * LOW_DURABILITY && before > d.max * LOW_DURABILITY) {
    ctx.emit('item.durability', { ...base, cur: d.cur, state: 'low' });
  }
  return d.cur;
}

/** Bring an owner's worn items to their records (a save from before the instance layer). */
function syncWorn(ctx: SystemContext, ownerId: string, h: Holding): void {
  for (const id of new Set(Object.values(h.equipped))) {
    const def = id ? defOf(ctx, id) : undefined;
    if (def)
      syncItem(
        h,
        def,
        (p) => ctx.newId(p),
        () => holderId(ctx, ownerId),
      );
  }
}

/**
 * Every worn piece loses `share` of its maximum (death 10%, a companion's retreat 10%, an
 * ironman revival 25%). Pieces that do not wear are skipped. Returns the instances worn.
 */
export function applyWearShare(
  ctx: SystemContext,
  ownerId: string,
  share: number,
  reason: WearReason,
): string[] {
  const h = holdingFor(ctx, ownerId);
  if (!h || share <= 0) return [];
  syncWorn(ctx, ownerId, h);
  const out: string[] = [];
  for (const p of wornPieces(ctx.world, ctx.content, ownerId)) {
    const d = p.inst?.durability;
    if (!p.inst || !d || d.cur <= 0) continue;
    const before = d.cur;
    if (wearInstance(ctx, ownerId, p.inst.instanceId, d.max * share, reason) !== before) {
      out.push(p.inst.instanceId);
    }
  }
  return out;
}

/**
 * The death cost on gear (D-072; thousand_doors.md 6.3; combat_and_classes.md 15.1 step
 * 4): every equipped piece of the entity loses 10% of its maximum, not below 0. Worn
 * pieces are never dropped. Returns the instances worn. Combat calls this on a death.
 */
export function applyDeathWear(ctx: SystemContext, entityId: string): string[] {
  return applyWearShare(ctx, entityId, DEATH_WEAR, 'death');
}

/**
 * One fight's wear (combat_and_classes.md 13.2): every worn piece loses 1, metal more in
 * sediment 3 to 5, bone half that surcharge. Combat calls this when a fight ends.
 */
export function applyCombatWear(ctx: SystemContext, entityId: string): string[] {
  const h = holdingFor(ctx, entityId);
  if (!h) return [];
  syncWorn(ctx, entityId, h);
  const pieces = wornPieces(ctx.world, ctx.content, entityId);
  if (!pieces.some((p) => p.inst?.durability)) return [];
  const sediment = ownerSediment(ctx.world, ctx.content, entityId);
  const out: string[] = [];
  for (const p of pieces) {
    const d = p.inst?.durability;
    if (!p.inst || !d || d.cur <= 0) continue;
    const before = d.cur;
    const factor = sedimentWearFactor(p.def, sediment);
    if (wearInstance(ctx, entityId, p.inst.instanceId, FIGHT_WEAR * factor, 'fight') !== before) {
      out.push(p.inst.instanceId);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Repair

export type RepairFailure = 'no_instance' | 'intact' | 'smith' | 'money' | 'material';

export interface RepairResult {
  ok: boolean;
  failure?: RepairFailure;
  quote?: RepairQuote;
}

function restore(ctx: SystemContext, ownerId: string, inst: ItemInstance, to: number): void {
  const d = inst.durability;
  if (!d) return;
  d.cur = roundDurability(Math.min(d.max, Math.max(d.cur, to)));
  ctx.emit('item.durability', {
    ownerId,
    instanceId: inst.instanceId,
    itemId: inst.defId,
    cur: d.cur,
    max: d.max,
    state: 'repaired',
    reason: 'repair',
  });
}

/**
 * Repair one instance at a smith: the payer (default the owner) pays the quote and the
 * fine-piece material; the piece is restored to full. Nothing changes on a failure.
 */
export function repairInstance(
  ctx: SystemContext,
  ownerId: string,
  instanceId: string,
  smith: Smith,
  payerId: string = ownerId,
): RepairResult {
  const h = holdingFor(ctx, ownerId);
  const inst = h?.instances?.[instanceId];
  const def = inst ? defOf(ctx, inst.defId) : undefined;
  if (!h || !inst || !def) return { ok: false, failure: 'no_instance' };
  const quote = repairQuote(def, inst);
  if (!quote) return { ok: false, failure: 'intact' };
  if (!canRepair(def, inst, smith)) return { ok: false, failure: 'smith', quote };
  const payer = holdingFor(ctx, payerId);
  if (quote.copper > 0 && (payer?.money ?? 0) < quote.copper) {
    return { ok: false, failure: 'money', quote };
  }
  const mat = quote.material;
  if (mat && (payer?.items[mat.itemId] ?? 0) < mat.count) {
    return { ok: false, failure: 'material', quote };
  }
  if (quote.copper > 0) spendMoney(ctx, payerId, quote.copper, 'repair');
  if (mat) removeItem(ctx, payerId, mat.itemId, mat.count, 'repair');
  restore(ctx, ownerId, inst, inst.durability?.max ?? 0);
  return { ok: true, quote };
}

/** The owner's damaged instances (worn first, slot order; then the bag in id order). */
export function damagedInstances(ctx: SystemContext, ownerId: string): ItemInstance[] {
  const h = holdingFor(ctx, ownerId);
  if (!h?.instances) return [];
  const worn = new Set(Object.values(h.worn ?? {}));
  const all = Object.values(h.instances).filter(
    (i) => i.durability && i.durability.cur < i.durability.max,
  );
  const first = wornPieces(ctx.world, ctx.content, ownerId)
    .map((p) => p.inst)
    .filter((i): i is ItemInstance => !!i && all.includes(i));
  const rest = all
    .filter((i) => !worn.has(i.instanceId))
    .sort(
      (a, b) => a.instanceId.length - b.instanceId.length || (a.instanceId < b.instanceId ? -1 : 1),
    );
  return [...first, ...rest];
}

/**
 * A field repair kit (use effect `repair`): mends `share` (default 30%) of the maximum on
 * every worn piece the kit may mend (fine or lesser, its tier or below, never T6). Returns
 * the instances mended.
 */
export function fieldRepair(
  ctx: SystemContext,
  ownerId: string,
  kit: ItemDef,
  share?: number,
): string[] {
  const s = share ?? FIELD_REPAIR_SHARE;
  const out: string[] = [];
  for (const p of wornPieces(ctx.world, ctx.content, ownerId)) {
    const d = p.inst?.durability;
    if (!p.inst || !d || d.cur >= d.max || !fieldKitMends(kit, p.def)) continue;
    restore(ctx, ownerId, p.inst, d.cur + d.max * s);
    out.push(p.inst.instanceId);
  }
  return out;
}
