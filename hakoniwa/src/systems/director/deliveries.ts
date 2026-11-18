// The director's side of the reveal ledger (goddess_gm.md 8.4; builtin_ai.md 13.2 rows 1
// and 6): each entry the director may hand over names its lore entry (the unlock condition
// is the entry's), the menu item that carries it, the words it is told in, and whether it is
// a must. The director only hands over what is unlocked; a must entry still undelivered
// `dueDays` after it unlocked is handed over by the executor at once; an open entry waits for
// a quiet hour at least an hour of real time (72000 ticks) after the last major reveal.

import { contentKey } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { conditionHolds } from '../quests/effects';
import type { DirectorSlice } from './index';

export interface DirectorDeliveryDef {
  id: string;
  /** the lore entry (reveal ledger) it hands over */
  lore: string;
  must: boolean;
  /** a must entry is due this many game days after it unlocked */
  dueDays?: number;
  /** the menu item that carries it */
  item: string;
  /** the words it is told in (player text) */
  narration: string;
}

/** Ticks between two major reveals (D-079 AQ-19: one real hour at normal speed). */
export const REVEAL_GAP = 72000;

type DeliveryContent = {
  directorDeliveries?: DirectorDeliveryDef[];
  lore?: { id: string; unlock: string }[];
};

function unlocked(ctx: SystemContext, d: DirectorDeliveryDef): boolean {
  const lore = (ctx.content as DeliveryContent).lore?.find((l) => l.id === d.lore);
  return !!lore && conditionHolds(ctx, lore.unlock);
}

/** Note when each entry first unlocked (hourly; a must entry's due day counts from it). */
export function trackDeliveries(ctx: SystemContext, slice: DirectorSlice): void {
  slice.unlockedAt ??= {};
  for (const d of (ctx.content as DeliveryContent).directorDeliveries ?? []) {
    if (slice.unlockedAt[d.id] !== undefined) continue;
    if (unlocked(ctx, d)) slice.unlockedAt[d.id] = ctx.tick;
  }
}

function pending(ctx: SystemContext, slice: DirectorSlice): DirectorDeliveryDef[] {
  const done = new Set(slice.delivered ?? []);
  return ((ctx.content as DeliveryContent).directorDeliveries ?? []).filter(
    (d) => !done.has(d.id) && slice.unlockedAt?.[d.id] !== undefined,
  );
}

/** A must entry past its due time (row 1). */
export function dueDelivery(ctx: SystemContext, slice: DirectorSlice): DirectorDeliveryDef | null {
  for (const d of pending(ctx, slice)) {
    if (!d.must) continue;
    const at = slice.unlockedAt?.[d.id] ?? ctx.tick;
    if (ctx.tick - at >= (d.dueDays ?? 0) * TICKS_PER_GAME_DAY) return d;
  }
  return null;
}

/** An open entry (row 6): unlocked, undelivered, not a must. */
export function openDelivery(ctx: SystemContext, slice: DirectorSlice): DirectorDeliveryDef | null {
  return pending(ctx, slice).find((d) => !d.must) ?? null;
}

/** Whether anything unlocked waits to be handed over (the 13.3 story fit of a carrier). */
export function anyUndelivered(ctx: SystemContext, slice: DirectorSlice): boolean {
  return pending(ctx, slice).length > 0;
}

/** The words of a delivery as content text. */
export function deliveryText(d: DirectorDeliveryDef) {
  return { key: contentKey('directorDeliveries', d.id, 'narration') };
}

/** Mark an entry handed over now (a major reveal). */
export function markDelivered(ctx: SystemContext, slice: DirectorSlice, d: DirectorDeliveryDef) {
  slice.delivered ??= [];
  slice.delivered.push(d.id);
  slice.lastReveal = ctx.tick;
  ctx.emit('director.delivered', { deliveryId: d.id, lore: d.lore, must: d.must });
}

/** Load-time problems of the delivery table. */
export function deliveryProblems(
  content: DeliveryContent & {
    directorMenu?: readonly { id: string }[];
  },
): string[] {
  const out: string[] = [];
  for (const d of content.directorDeliveries ?? []) {
    const at = `delivery ${d.id}`;
    if (content.lore && !content.lore.some((l) => l.id === d.lore))
      out.push(`${at}: unknown lore entry ${d.lore}`);
    if (content.directorMenu && !content.directorMenu.some((m) => m.id === d.item))
      out.push(`${at}: unknown menu item ${d.item}`);
    if (d.must && !(d.dueDays !== undefined && d.dueDays >= 0))
      out.push(`${at}: a must delivery names dueDays`);
  }
  return out;
}
