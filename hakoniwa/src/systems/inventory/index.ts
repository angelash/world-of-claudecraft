// Inventory and money for every owner (player, companions, NPCs, the company,
// settlements). Item definitions live in the `items` content table, contributed by
// several packs (equipment from combat, goods from economy, key and lore items from
// quests); same-forge sets and enchants are the inventory pack's tables. Money is an
// integer number of copper (1 gold = 100 silver = 10000 copper; see
// docs/20_world/society.md currency). Display formatting lives on the client: formatMoney
// in src/shared_ui/i18n.ts, or a {m, money} placeholder in a TextRef.
//
// The instance layer (D-072): stacked goods are counted, equipment, tools and tack keep a
// record per piece (durability, wear marks, signature, sediment grain and purification,
// refining, enchants, holder). `Holding.items` stays the count ledger every reader uses;
// the records sit in `instances`, the worn record of each slot in `worn`, qualified stack
// parts in `stacks`. Modules: types, rules (pure rules), holding (the ledger), ports
// (write ports), gear (what worn gear gives), durability (wear and repair), procs
// (triggers and weapon coatings), use_groups (consumable cooldowns), use_gate (the combat
// side's item gate as a port), workshop (sign, purify, refine, enchant), service (the
// smith's repair, with the smith's trade skills from the `crafters` data), slice (save
// check, rename fields, the backfill of older saves).

import { ok, reject } from '../../core';
import type { GameSystem } from '../../core/system';
import { tr } from '../../core/text';
import { TICK_HZ } from '../../core/time';
import { fieldRepair } from './durability';
import { itemDef } from './gear';
import { syncItem, unwear, wear, wearingOrder } from './holding';
import { holderId, holding, takeItems, transferItem } from './ports';
import type { ProcEffect } from './procs';
import { applyCoating, onDamage, onHeal, onKill } from './procs';
import { hasTag, type Smith } from './rules';
import { chooseRepair, nearSmith, offerRepair, repairAll, smithOf } from './service';
import { freshSlice, INVENTORY_ID_FIELDS, upgradeOnce, validateInventorySlice } from './slice';
import type {
  CrafterDef,
  EnchantDef,
  EquipSlot,
  Holding,
  InventorySlice,
  ItemDef,
  ItemSetDef,
  ProcOn,
} from './types';
import { checkUseGate } from './use_gate';
import { GROUP_RULES, startUseTimers, useWait } from './use_groups';

export * from './durability';
export {
  activeSets,
  effectiveDef,
  equippedDefs,
  gearAuras,
  itemDef,
  ownerSediment,
  setCounts,
  type WornPiece,
  wornPieces,
} from './gear';
export {
  compareInstanceIds,
  INSTANCE_ID_PREFIX,
  instancesOf,
  type Parcel,
  parcelCount,
  plainCount,
  stackCount,
  type TakeOptions,
  wornSlotOf,
} from './holding';
export * from './ports';
export {
  addMarks,
  applyCoating,
  type CoatFailure,
  envFor,
  type FiredProc,
  fireProcs,
  type ProcAmount,
  type ProcCond,
  type ProcEffect,
  type ProcEffectSpec,
  type ProcEnv,
  type ProcSource,
  parseProcDo,
  parseProcWhen,
  procProblems,
  procSources,
  resolveEffect,
  spendCoatingCharges,
} from './procs';
export * from './rules';
export * from './service';
export {
  freshSlice,
  INSTANCE_LAYER_REV,
  INVENTORY_ID_FIELDS,
  itemsSignature,
  upgradeSlice,
  validateInventorySlice,
} from './slice';
export * from './types';
export * from './use_gate';
export { GROUP_RULES, type GroupRule, groupReadyAt, useWait } from './use_groups';
export * from './workshop';

declare module '../../core/contracts' {
  interface WorldSlices {
    inventory: InventorySlice;
  }
  interface ContentMap {
    items: ItemDef[];
    itemSets: ItemSetDef[];
    enchants: EnchantDef[];
    /** persons' livelihood skills (the crafting pack's data; smiths read them for repairs) */
    crafters: CrafterDef[];
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
      /** used before its group's timer ran out: no effect (a sediment cure's poison) */
      early?: boolean;
      /** the sediment grain of the portion used (1 light, 2 mid, 3 heavy; unpurified stacks) */
      sedTier?: 1 | 2 | 3;
    };
    'item.equipped': { ownerId: string; itemId: string; slot: EquipSlot; instanceId?: string };
    /** low at 20%, broken at 0, shattered (a poor piece gone), repaired */
    'item.durability': {
      ownerId: string;
      instanceId: string;
      itemId: string;
      cur: number;
      max: number;
      state: 'low' | 'broken' | 'shattered' | 'repaired';
      reason: string;
    };
    /** a fired item, enchant or set trigger (combat applies the effect, 13.3) */
    'item.proc': {
      ownerId: string;
      targetId?: string;
      on: ProcOn;
      source: 'item' | 'enchant' | 'set' | 'coating';
      sourceId: string;
      itemId?: string;
      instanceId?: string;
      effect: ProcEffect;
    };
    'item.signed': { ownerId: string; instanceId: string; itemId: string; signature: string };
    'item.purified': { ownerId: string; itemId: string; instanceId?: string; count: number };
    'item.refined': { ownerId: string; instanceId: string; itemId: string; refine: number };
    'item.enchanted': {
      ownerId: string;
      instanceId: string;
      itemId: string;
      enchantId: string;
      replaced?: string;
    };
    /** a weapon was coated (charges: the hits it lasts), or its coating ran out (charges 0) */
    'item.coating': {
      ownerId: string;
      instanceId: string;
      itemId: string;
      coatingId: string;
      charges: number;
    };
  }
  interface CommandMap {
    'inventory.use': { ownerId: string; itemId: string; targetId?: string };
    'inventory.equip': { ownerId: string; itemId: string; instanceId?: string };
    'inventory.unequip': { ownerId: string; slot: EquipSlot };
    'inventory.give': {
      fromId: string;
      toId: string;
      itemId: string;
      count: number;
      instanceId?: string;
    };
    /**
     * Repair at a smith: one instance, or every damaged one (worn first). From the
     * player: `smithId` must name a smith standing near, who counts as an ordinary smith,
     * and the owner pays. From a system running a smith's service: `skill`, `master` and
     * `smithId` describe the smith and `payerId` pays (default the owner).
     */
    'inventory.repair': {
      ownerId: string;
      instanceId?: string;
      payerId?: string;
      smithId?: string;
      skill?: number;
      master?: boolean;
    };
  }
}

// ---------------------------------------------------------------------------
// Queries

function emptyView(): Holding {
  return { money: 0, items: {}, equipped: {} };
}

export function holdingOf(
  world: { slices: { inventory: InventorySlice } },
  ownerId: string,
): Holding {
  return world.slices.inventory.owners[ownerId] ?? emptyView();
}

/** How many of an item an owner holds (stacks and instances alike). */
export function countItem(
  world: { slices: { inventory: InventorySlice } },
  ownerId: string,
  itemId: string,
): number {
  return world.slices.inventory.owners[ownerId]?.items[itemId] ?? 0;
}

function canUse(h: Holding, def: ItemDef): boolean {
  return (h.items[def.id] ?? 0) > 0;
}

const SLOT_CLASH: Partial<Record<EquipSlot, EquipSlot>> = {
  main_hand: 'off_hand',
  off_hand: 'main_hand',
};

/** A two-handed main hand and an off hand do not go together (catalog_equipment.md 1.2). */
function clearClash(
  h: Holding,
  slot: EquipSlot,
  def: ItemDef,
  content: { items: ItemDef[] },
): void {
  const other = SLOT_CLASH[slot];
  if (!other || !h.equipped[other]) return;
  const main = slot === 'main_hand' ? def : itemDef(content, h.equipped.main_hand ?? '');
  if (main && hasTag(main, 'two_hand')) unwear(h, other);
}

export const system: GameSystem & {
  validateSlice: typeof validateInventorySlice;
  idFields: typeof INVENTORY_ID_FIELDS;
} = {
  id: 'inventory',
  order: 15,
  validateSlice: validateInventorySlice,
  idFields: INVENTORY_ID_FIELDS,
  init(ctx) {
    ctx.world.slices.inventory = freshSlice(ctx.content);
  },
  tick(ctx) {
    upgradeOnce(ctx);
  },
  on: {
    'combat.damage'(ctx, ev) {
      onDamage(ctx, ev.data);
    },
    'combat.heal'(ctx, ev) {
      onHeal(ctx, ev.data);
    },
    'combat.kill'(ctx, ev) {
      onKill(ctx, ev.data);
    },
    'player.talked'(ctx, ev) {
      offerRepair(ctx, ev.data.npcId);
    },
    'dialogue.option_chosen'(ctx, ev) {
      if (ev.data.system === 'inventory') chooseRepair(ctx, ev.data.npcId, ev.data.optionId);
    },
  },
  commands: {
    'inventory.use'(ctx, d, source) {
      const def = itemDef(ctx.content, d.itemId);
      if (!def) return reject('no_item', tr('sys.inventory.reject.no_item'));
      if (!def.use) return reject('not_usable', tr('sys.inventory.reject.not_usable'));
      const h = holding(ctx, d.ownerId);
      if (!canUse(h, def)) return reject('missing', tr('sys.inventory.reject.missing.bag'));
      // the combat side's item gate (14.1): in-combat bans, the global cooldown, a downed user
      const gate = checkUseGate(ctx, d.ownerId, d.itemId, source);
      if (!gate.ok) return reject(gate.code, gate.reason);
      const slice = ctx.world.slices.inventory;
      const wait = useWait(slice, d.ownerId, def, ctx.tick, d.targetId);
      // a sediment cure taken early goes down but does nothing and poisons a little; the
      // ailments system reads `early` (catalog_consumables_magitools.md 2.1 `cd_sed`)
      const early = wait > 0 && GROUP_RULES[def.use.group ?? 'cd_none']?.earlyUse === true;
      if (wait > 0 && !early) {
        return reject(
          'cooldown',
          tr('sys.inventory.reject.cooldown', { s: Math.ceil(wait / TICK_HZ) }),
        );
      }
      if (def.use.effect === 'repair' && !early) {
        const share = def.use.amount !== undefined ? def.use.amount / 100 : undefined;
        if (fieldRepair(ctx, d.ownerId, def, share).length === 0) {
          return reject('nothing_to_mend', tr('sys.inventory.reject.nothing_to_mend'));
        }
      }
      if (def.use.effect === 'coat' && !early) {
        const coat = applyCoating(ctx, d.ownerId, def);
        if (coat.failure === 'no_weapon')
          return reject('no_weapon', tr('sys.inventory.reject.no_weapon'));
        if (!coat.ok) return reject('not_usable', tr('sys.inventory.reject.not_usable'));
      }
      // the portion eaten carries its stack's sediment grain unless purified; the ailments
      // system adds the taint of that grade (catalog_consumables_magitools.md 2.4)
      const portion =
        def.kind === 'consumable' ? takeItems(ctx, d.ownerId, d.itemId, 1, 'use') : null;
      const part = portion?.parts[0];
      const sedTier = part && !part.purified ? part.sedTier : undefined;
      if (!early) startUseTimers(slice, d.ownerId, def, ctx.tick, d.targetId);
      ctx.emit('item.used', {
        ownerId: d.ownerId,
        itemId: d.itemId,
        targetId: d.targetId,
        effect: def.use.effect,
        amount: def.use.amount,
        ability: def.use.ability,
        ...(early ? { early: true } : {}),
        ...(sedTier ? { sedTier } : {}),
      });
      return ok();
    },
    'inventory.equip'(ctx, d) {
      const def = itemDef(ctx.content, d.itemId);
      if (!def?.slot) return reject('not_equipment', tr('sys.inventory.reject.not_equipment'));
      const h = holding(ctx, d.ownerId);
      if ((h.items[d.itemId] ?? 0) <= 0) {
        return reject('missing', tr('sys.inventory.reject.missing.bag'));
      }
      syncItem(
        h,
        def,
        (p) => ctx.newId(p),
        () => holderId(ctx, d.ownerId),
      );
      const inst =
        d.instanceId !== undefined
          ? h.instances?.[d.instanceId]
          : (wearingOrder(h, d.itemId)[0] ?? undefined);
      if (d.instanceId !== undefined && inst?.defId !== d.itemId) {
        return reject('no_instance', tr('sys.inventory.reject.no_instance'));
      }
      clearClash(h, def.slot, def, ctx.content);
      unwear(h, def.slot);
      if (inst) wear(h, def.slot, inst);
      else h.equipped[def.slot] = d.itemId;
      ctx.emit('item.equipped', {
        ownerId: d.ownerId,
        itemId: d.itemId,
        slot: def.slot,
        instanceId: inst?.instanceId,
      });
      return ok();
    },
    'inventory.unequip'(ctx, d) {
      const h = holding(ctx, d.ownerId);
      if (!h.equipped[d.slot]) return reject('empty', tr('sys.inventory.reject.empty'));
      unwear(h, d.slot);
      return ok();
    },
    'inventory.give'(ctx, d) {
      if (d.count <= 0) return reject('bad_count', tr('sys.inventory.reject.bad_count'));
      const opts = d.instanceId !== undefined ? { instanceId: d.instanceId } : {};
      if (!transferItem(ctx, d.fromId, d.toId, d.itemId, d.count, opts))
        return reject('missing', tr('sys.inventory.reject.missing.count'));
      return ok();
    },
    'inventory.repair'(ctx, d, source) {
      // The player's own command names a smith standing near: an ordinary smith, the
      // owner pays. Systems that run a smith's service (dialogue, crafting) pass the
      // smith's skill and the payer (a companion's repairs come out of the player's purse).
      let smith: Smith;
      let payer = d.ownerId;
      if (source.type === 'player') {
        const found = d.smithId ? smithOf(ctx, d.smithId) : undefined;
        if (!found || !d.smithId || !nearSmith(ctx, d.ownerId, d.smithId)) {
          return reject('no_smith', tr('sys.inventory.reject.no_smith'));
        }
        smith = found;
      } else {
        smith = { skill: d.skill ?? 0, master: d.master, id: d.smithId };
        payer = d.payerId ?? d.ownerId;
      }
      const run = repairAll(ctx, d.ownerId, smith, payer, d.instanceId);
      if (run.repaired > 0) return ok();
      switch (run.failure) {
        case 'no_instance':
          return reject('no_instance', tr('sys.inventory.reject.no_instance'));
        case 'smith':
          return reject('smith', tr('sys.inventory.reject.smith'));
        case 'money':
          return reject('money', tr('sys.inventory.reject.money'));
        case 'material':
          return reject('material', tr('sys.inventory.reject.material'));
        default:
          return reject('intact', tr('sys.inventory.reject.intact'));
      }
    },
  },
};
