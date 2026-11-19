// The inner court's display (catalog_relics_lore.md 1.7). A piece on display is held by
// the display's own inventory owner (the court block's `displayOwner`), not the player: it
// cannot be used, sold or turn a door's item key while it stands there (rule 1; the doors
// read only the player's holding), and it gives nothing in combat (rule 5). Cases and
// their slots come from the court tier (court_tiers.ts). Taking a piece down takes
// `takeDownDays` (rule 1: "取下要等一日"): the piece stays on display, locked and in its
// slot, until the take-down is due, then goes into the court's storage on the next game
// hour (settleDisplay on world.hour); a take-down starts only when the storage has room for
// it, and that room stays held back from deposits until it lands (displayReserve). Records
// and stack qualifiers move with the piece. The entries' item ids follow the rename table
// (COURT_ID_FIELDS, the city system's idFields).

import { type CommandResult, ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { IdField } from '../../core/save/renames';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import {
  countItem,
  holdingOf,
  itemDef,
  type Parcel,
  putItems,
  type StackQualifiers,
  stackCount,
  type TakeOptions,
  takeItems,
} from '../inventory';
import { courtSite, storageCap, storageUsed } from './common';
import { displayReserve, presence } from './court';
import { courtTier } from './court_tiers';
import type { CitySlice, CourtConfig, CourtDisplayEntry, SiteDef, SiteState } from './types';

/** Content ids in the city slice for the save rename table (release_engineering.md 5.5). */
export const COURT_ID_FIELDS: readonly IdField[] = [
  { path: 'court.display.*.itemId', kind: 'item' },
  { path: 'court.display.*.qualifiers.signature', kind: 'npc' },
];

/** The pieces on display (empty on saves from before the display). */
export function displayEntries(world: { slices: { city: CitySlice } }): CourtDisplayEntry[] {
  return world.slices.city.court.display ?? [];
}

function courtReady(
  ctx: SystemContext,
): { sdef: SiteDef; site: SiteState; cfg: CourtConfig } | { error: CommandResult } {
  const sdef = courtSite(ctx.content);
  const site = sdef ? ctx.world.slices.city.sites[sdef.id] : undefined;
  if (!sdef?.court || !site) return { error: reject('no_court', tr('sys.city.reject.no_court')) };
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return { error: reject(pres.code, pres.reason) };
  return { sdef, site, cfg: sdef.court };
}

/** How a one-piece parcel is found again: its record, its stack key, or the plain stack. */
function unitOf(parcel: Parcel): Pick<CourtDisplayEntry, 'instanceId' | 'qualifiers'> {
  const inst = parcel.instances[0];
  if (inst) return { instanceId: inst.instanceId };
  const part = parcel.parts[0];
  if (!part) return {};
  const { itemId: _item, count: _count, ...qualifiers } = part;
  return { qualifiers };
}

export function putOnDisplay(
  ctx: SystemContext,
  d: { itemId: string; instanceId?: string; qualifiers?: StackQualifiers; caseId?: string },
): CommandResult {
  const ready = courtReady(ctx);
  if ('error' in ready) return ready.error;
  const { sdef, cfg } = ready;
  const def = itemDef(ctx.content, d.itemId);
  if (!def) return reject('bad_item', tr('sys.city.reject.display_item'));
  const pack = holdingOf(ctx.world, 'player');
  const held =
    d.instanceId !== undefined
      ? pack.instances?.[d.instanceId]?.defId === d.itemId
      : d.qualifiers !== undefined
        ? stackCount(pack, d.itemId, d.qualifiers) > 0
        : countItem(ctx.world, 'player', d.itemId) > 0;
  if (!held) return reject('missing', tr('sys.city.reject.missing_pack'));
  const entries = displayEntries(ctx.world);
  const cases = courtTier(sdef, ctx.world.meta.flags)?.cases ?? [];
  const room = (id: string, slots: number) => slots - entries.filter((e) => e.caseId === id).length;
  let target = cases.find((c) => c.id === d.caseId);
  if (d.caseId !== undefined && !target)
    return reject('no_case', tr('sys.city.reject.display_case'));
  if (!target) target = cases.find((c) => room(c.id, c.slots) > 0);
  if (!target || room(target.id, target.slots) <= 0)
    return reject('display_full', tr('sys.city.reject.display_full'));
  const opts: TakeOptions =
    d.instanceId !== undefined
      ? { instanceId: d.instanceId }
      : d.qualifiers !== undefined
        ? { qualifiers: d.qualifiers }
        : {};
  const parcel = takeItems(ctx, 'player', d.itemId, 1, 'display', opts);
  if (!parcel) return reject('missing', tr('sys.city.reject.missing_pack'));
  const entry: CourtDisplayEntry = {
    id: ctx.newId('disp'),
    itemId: d.itemId,
    caseId: target.id,
    ...unitOf(parcel),
    since: ctx.tick,
  };
  putItems(ctx, cfg.displayOwner, parcel, 'display');
  ctx.world.slices.city.court.display = [...entries, entry];
  ctx.emit('city.court_display', {
    op: 'put',
    entryId: entry.id,
    itemId: entry.itemId,
    caseId: entry.caseId,
  });
  return ok(tr('sys.city.info.displayed', { item: contentText('items', def, d.itemId) }));
}

export function startTakeDown(ctx: SystemContext, d: { entryId: string }): CommandResult {
  const ready = courtReady(ctx);
  if ('error' in ready) return ready.error;
  const entry = displayEntries(ctx.world).find((e) => e.id === d.entryId);
  if (!entry) return reject('missing', tr('sys.city.reject.display_missing'));
  if (entry.takeDue !== undefined) return reject('pending', tr('sys.city.reject.display_pending'));
  const { sdef, site } = ready;
  const cap = storageCap(site, sdef, ctx.content, ctx.world.meta.flags);
  if (storageUsed(ctx.world, sdef.stockOwner) + displayReserve(ctx.world) + 1 > cap)
    return reject('storage_full', tr('sys.city.reject.storage_full'));
  const wait = Math.max(0, ready.cfg.takeDownDays) * TICKS_PER_GAME_DAY;
  entry.takeDue = ctx.tick + wait;
  ctx.emit('city.court_display', {
    op: 'taking',
    entryId: entry.id,
    itemId: entry.itemId,
    caseId: entry.caseId,
  });
  const item = contentText('items', itemDef(ctx.content, entry.itemId), entry.itemId);
  if (wait === 0) settleDisplay(ctx);
  return ok(tr('sys.city.info.display_taking', { item, t: wait }));
}

/**
 * Finish the take-downs that are due: each piece leaves the display holder (its record or
 * stack key) and goes into the court's storage, into the room held back for it (garden
 * output of the waiting day can still take that room: the piece lands all the same, it was
 * in the court already). An entry whose piece is no longer there is dropped.
 */
export function settleDisplay(ctx: SystemContext): void {
  const entries = displayEntries(ctx.world);
  if (!entries.some((e) => e.takeDue !== undefined && e.takeDue <= ctx.tick)) return;
  const sdef = courtSite(ctx.content);
  const cfg = sdef?.court;
  if (!sdef || !cfg) return;
  const keep: CourtDisplayEntry[] = [];
  for (const e of entries) {
    if (e.takeDue === undefined || e.takeDue > ctx.tick) {
      keep.push(e);
      continue;
    }
    const opts: TakeOptions =
      e.instanceId !== undefined
        ? { instanceId: e.instanceId }
        : { qualifiers: e.qualifiers ?? {} };
    const parcel =
      takeItems(ctx, cfg.displayOwner, e.itemId, 1, 'display_taken', opts) ??
      takeItems(ctx, cfg.displayOwner, e.itemId, 1, 'display_taken');
    if (!parcel) continue;
    putItems(ctx, sdef.stockOwner, parcel, 'display_taken');
    ctx.emit('city.court_display', {
      op: 'taken',
      entryId: e.id,
      itemId: e.itemId,
      caseId: e.caseId,
    });
  }
  ctx.world.slices.city.court.display = keep;
}
