// The death costs of the player that leave something behind (combat_and_classes.md 15.1;
// thousand_doors.md 6.3): the drop bag (遗落包: a quarter of every stack of stackable goods,
// rounded down, and a share of the carried money by difficulty, kept where the player fell
// for three game days and reclaimed by walking up to it; items with a record of their own,
// such as tools and equipment, never fall), the durability wear of the equipped pieces (the
// inventory system's `applyDeathWear`, -10% of each piece's maximum), and the witnesses
// (believers within sight who saw the body go through a door). Also the wear of one fight
// (13.2: the inventory system's `applyCombatWear` when a fight ends).

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import {
  addMoney,
  applyCombatWear,
  applyDeathWear,
  holdingOf,
  isInstanced,
  itemDef,
  type Parcel,
  parcelCount,
  putItems,
  spendMoney,
  takeItems,
} from '../inventory';
import { entitiesOnMap, getEntity } from '../world';
import type { Entity } from '../world/types';
import { combatMod } from './difficulty';
import { DROP_BAG_DAYS, DROP_STACK_SHARE } from './formulas';
import type { DropBag, Unit } from './types';

/** Kinds of goods that never go into the drop bag (keys, lore, evidence: story items). */
const KEPT_KINDS: ReadonlySet<string> = new Set(['key', 'lore', 'evidence']);
/** A believer this close to the body sees it go (the goddess sight radius). */
export const WITNESS_RADIUS = 12;
/** The player reclaims a bag within this many tiles of it. */
export const RECLAIM_RADIUS = 1.5;

/**
 * Whether an item is stackable goods that may fall into the drop bag: counted goods, not
 * story items, not anything kept as a record per piece (equipment, tools, tack).
 */
export function droppable(content: SystemContext['content'], itemId: string): boolean {
  const def = itemDef(content, itemId);
  if (!def || KEPT_KINDS.has(def.kind) || isInstanced(def)) return false;
  return (def.stack ?? 99) > 1;
}

/** What a bag holds, item by item (the `combat.bag` summary). */
export function bagSummary(bag: DropBag): { itemId: string; count: number }[] {
  return bag.items.map((p) => ({ itemId: p.itemId, count: parcelCount(p) }));
}

/**
 * Fill the drop bag where the player fell (step 3): take the share of every stackable
 * stack and of the money out of the holding, qualifiers intact (inventory parcels). Returns
 * the bag, or undefined when nothing fell (no stack big enough, no money, story difficulty).
 */
export function dropBag(
  ctx: SystemContext,
  playerId: string,
  at: { mapId: string; x: number; y: number },
): DropBag | undefined {
  const holding = holdingOf(ctx.world, playerId);
  const items: Parcel[] = [];
  for (const itemId of Object.keys(holding.items).sort()) {
    if (!droppable(ctx.content, itemId)) continue;
    const n = Math.floor((holding.items[itemId] ?? 0) * DROP_STACK_SHARE);
    if (n <= 0) continue;
    const parcel = takeItems(ctx, playerId, itemId, n, 'death_drop');
    if (parcel && parcelCount(parcel) > 0) items.push(parcel);
  }
  const share = Math.max(0, combatMod(ctx.world, 'death_money'));
  const money = Math.floor(holding.money * share);
  const lost = money > 0 && spendMoney(ctx, playerId, money, 'death_drop') ? money : 0;
  if (items.length === 0 && lost === 0) return undefined;
  const bag: DropBag = {
    id: ctx.newId('bag'),
    ownerId: playerId,
    mapId: at.mapId,
    x: at.x,
    y: at.y,
    items,
    money: lost,
    expires: ctx.tick + DROP_BAG_DAYS * TICKS_PER_GAME_DAY,
  };
  const slice = ctx.world.slices.combat;
  slice.bags = { ...(slice.bags ?? {}), [bag.id]: bag };
  ctx.emit('combat.bag', {
    bagId: bag.id,
    ownerId: playerId,
    op: 'dropped',
    mapId: bag.mapId,
    items: bagSummary(bag),
    money: bag.money,
  });
  return bag;
}

/** The durability step (4): every equipped piece loses 10% of its maximum, never below 0. */
export function deathWear(ctx: SystemContext, entityId: string): string[] {
  return applyDeathWear(ctx, entityId);
}

/**
 * One fight's wear (13.2): from entering combat to leaving it (the 5-second rule, 2.5) is
 * one fight; at its end every worn piece of the player and the companions loses 1. Runs once
 * a second over the party's units.
 */
export function tickFightWear(ctx: SystemContext, units: readonly Unit[]): void {
  for (const u of units) {
    if (u.combatUntil > ctx.tick) {
      u.fighting = true;
      continue;
    }
    if (!u.fighting) continue;
    delete u.fighting;
    applyCombatWear(ctx, u.id);
  }
}

/** The faith tags of every goddess in the content: an entity carrying one is a believer. */
function faithTags(content: SystemContext['content']): Set<string> {
  const out = new Set<string>();
  const gods = (content as { goddesses?: { faithTags?: string[] }[] }).goddesses ?? [];
  for (const g of gods) for (const t of g.faithTags ?? []) out.add(t);
  return out;
}

/** Believers within sight of the place the player fell (step 6), by entity id. */
export function witnessesOf(ctx: SystemContext, at: Entity): string[] {
  const tags = faithTags(ctx.content);
  if (tags.size === 0) return [];
  const out: string[] = [];
  for (const e of entitiesOnMap(ctx.world, at.mapId)) {
    if (e.id === at.id || !e.alive || e.hidden || e.kind === 'player') continue;
    if (Math.hypot(e.x - at.x, e.y - at.y) > WITNESS_RADIUS) continue;
    if (e.tags.some((t) => tags.has(t))) out.push(e.id);
  }
  return out.sort();
}

/** Drop bags crumble after three game days; the player walking up to one reclaims it. */
export function tickBags(ctx: SystemContext): void {
  const slice = ctx.world.slices.combat;
  if (!slice.bags) return;
  for (const id of Object.keys(slice.bags).sort()) {
    const bag = slice.bags[id];
    if (!bag) continue;
    if (bag.expires <= ctx.tick) {
      dropOut(ctx, bag, 'expired');
      continue;
    }
    const owner = getEntity(ctx.world, bag.ownerId);
    if (!owner?.alive || owner.mapId !== bag.mapId) continue;
    if (Math.hypot(owner.x - bag.x, owner.y - bag.y) > RECLAIM_RADIUS) continue;
    for (const parcel of bag.items) putItems(ctx, bag.ownerId, parcel, 'death_reclaim');
    if (bag.money > 0) addMoney(ctx, bag.ownerId, bag.money, 'death_reclaim');
    dropOut(ctx, bag, 'reclaimed');
  }
}

function dropOut(ctx: SystemContext, bag: DropBag, op: 'reclaimed' | 'expired'): void {
  const slice = ctx.world.slices.combat;
  const rest = { ...(slice.bags ?? {}) };
  delete rest[bag.id];
  if (Object.keys(rest).length > 0) slice.bags = rest;
  else delete slice.bags;
  ctx.emit('combat.bag', {
    bagId: bag.id,
    ownerId: bag.ownerId,
    op,
    mapId: bag.mapId,
    items: bagSummary(bag),
    money: bag.money,
  });
}
