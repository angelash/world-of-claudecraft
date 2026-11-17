// The inner court (city_building 2) and the presence rule for settlement orders: direct
// orders reach the settlement the player stands in, or one gate-linked by a door node
// (8.3). The court is private storage, a small build site and the respawn point; it lies
// outside every goddess's sight (data flag outsideDivineSight). enter_court / leave_court
// teleport the player in and back so the court works before the doors ability is wired.
// The court is the site of kind 'court'; the way back from nowhere leads to the site with
// the village_core role (data/city/sites.json).

import { type CommandResult, ok, reject } from '../../core';
import type { SystemContext } from '../../core/system';
import { type TextRef, tr } from '../../core/text';
import { addMoney, countItem, holdingOf, putItems, spendMoney, takeItems } from '../inventory';
import { mapById, playerEntity, teleportEntity } from '../world';
import { addDependency } from './autonomy';
import {
  courtSite,
  siteByRole,
  siteDef,
  storageCap,
  storageUsed,
  sumEffect,
  today,
} from './common';
import type { SiteDef, SiteState } from './types';

export type Presence = { ok: true; remote: boolean } | { ok: false; code: string; reason: TextRef };

export function presence(ctx: SystemContext, site: SiteState, sdef: SiteDef): Presence {
  if (!site.active)
    return { ok: false, code: 'site_closed', reason: tr('sys.city.reject.site_closed') };
  const p = playerEntity(ctx.world);
  if (p && p.mapId === sdef.mapId) return { ok: true, remote: false };
  if (sdef.kind === 'settlement' && sumEffect(site, ctx.content, 'gateThroughput') > 0)
    return { ok: true, remote: true };
  return {
    ok: false,
    code: 'not_here',
    reason:
      sdef.kind === 'court' ? tr('sys.city.reject.not_here_court') : tr('sys.city.reject.not_here'),
  };
}

function gateRoom(ctx: SystemContext, site: SiteState): number {
  return Math.max(0, sumEffect(site, ctx.content, 'gateThroughput') - site.gateUsed);
}

export function deposit(
  ctx: SystemContext,
  d: { siteId: string; itemId: string; count: number },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef) return reject('unknown_site', tr('sys.city.reject.unknown_place'));
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const count = Math.floor(d.count);
  if (count <= 0) return reject('bad_count', tr('sys.city.reject.bad_count'));
  if (d.itemId === 'money') {
    if (!spendMoney(ctx, 'player', count, `deposit:${d.siteId}`))
      return reject('no_money', tr('sys.city.reject.no_money'));
    addMoney(ctx, sdef.stockOwner, count, 'deposit');
    return ok();
  }
  if (countItem(ctx.world, 'player', d.itemId) < count)
    return reject('missing', tr('sys.city.reject.missing_pack'));
  if (storageUsed(ctx.world, sdef.stockOwner) + count > storageCap(site, sdef, ctx.content))
    return reject('storage_full', tr('sys.city.reject.storage_full'));
  if (pres.remote) {
    if (gateRoom(ctx, site) < count) return reject('gate_cap', tr('sys.city.reject.gate_cap'));
    site.gateUsed += count;
  }
  // move the pieces themselves: records and stack qualifiers go along (D-072)
  const parcel = takeItems(ctx, 'player', d.itemId, count, `deposit:${d.siteId}`);
  if (parcel) putItems(ctx, sdef.stockOwner, parcel, 'deposit');
  // Direct injection by the player feeds dependency (8.2: 1 point per 100 units).
  if (sdef.kind === 'settlement')
    addDependency(site.autonomy, today(ctx.tick), tr('sys.city.dep.deposit'), count / 100);
  return ok();
}

export function withdraw(
  ctx: SystemContext,
  d: { siteId: string; itemId: string; count: number },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef) return reject('unknown_site', tr('sys.city.reject.unknown_place'));
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const count = Math.floor(d.count);
  if (count <= 0) return reject('bad_count', tr('sys.city.reject.bad_count'));
  if (d.itemId === 'money') {
    if (holdingOf(ctx.world, sdef.stockOwner).money < count)
      return reject('no_money', tr('sys.city.reject.no_money_stock'));
    spendMoney(ctx, sdef.stockOwner, count, 'withdraw');
    addMoney(ctx, 'player', count, `withdraw:${d.siteId}`);
    return ok();
  }
  if (countItem(ctx.world, sdef.stockOwner, d.itemId) < count)
    return reject('missing', tr('sys.city.reject.missing_stock'));
  if (pres.remote) {
    if (gateRoom(ctx, site) < count) return reject('gate_cap', tr('sys.city.reject.gate_cap'));
    site.gateUsed += count;
  }
  const parcel = takeItems(ctx, sdef.stockOwner, d.itemId, count, 'withdraw');
  if (parcel) putItems(ctx, 'player', parcel, `withdraw:${d.siteId}`);
  return ok();
}

export function enterCourt(ctx: SystemContext): CommandResult {
  if (!ctx.flag('feature.inner_court')) return reject('locked', tr('sys.city.reject.court_locked'));
  const p = playerEntity(ctx.world);
  if (!p) return reject('no_player', tr('sys.city.reject.no_player'));
  const court = courtSite(ctx.content);
  if (court && p.mapId === court.mapId)
    return reject('already', tr('sys.city.reject.already_in_court'));
  const map = court ? mapById(ctx.content, court.mapId) : undefined;
  const arrival =
    map?.locations.find((l) => l.id === court?.arrivalLocation) ??
    map?.locations.find((l) => l.kind === 'safe');
  if (!map || !arrival) return reject('no_court', tr('sys.city.reject.no_court'));
  ctx.world.slices.city.court.returnTo = { mapId: p.mapId, x: p.x, y: p.y };
  return teleportEntity(ctx, p.id, map.id, arrival.x + arrival.w / 2, arrival.y + arrival.h / 2)
    ? ok(tr('sys.city.info.entered_court'))
    : reject('blocked', tr('sys.city.reject.blocked'));
}

export function leaveCourt(ctx: SystemContext): CommandResult {
  const p = playerEntity(ctx.world);
  if (!p) return reject('no_player', tr('sys.city.reject.no_player'));
  const courtDef = courtSite(ctx.content);
  if (!courtDef || p.mapId !== courtDef.mapId)
    return reject('not_in_court', tr('sys.city.reject.not_in_court'));
  const court = ctx.world.slices.city.court;
  let target = court.returnTo;
  if (!target || !mapById(ctx.content, target.mapId)) {
    const sdef = siteByRole(ctx.content, 'village_core');
    const map = sdef ? mapById(ctx.content, sdef.mapId) : undefined;
    const c = map?.locations.find((l) => l.id === sdef?.centerLocation);
    if (!map || !c) return reject('nowhere', tr('sys.city.reject.nowhere'));
    target = { mapId: map.id, x: c.x + c.w / 2, y: c.y + c.h / 2 };
  }
  court.returnTo = null;
  return teleportEntity(ctx, p.id, target.mapId, target.x, target.y)
    ? ok(tr('sys.city.info.left_court'))
    : reject('blocked', tr('sys.city.reject.blocked'));
}
