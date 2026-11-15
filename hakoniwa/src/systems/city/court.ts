// The inner court (city_building 2) and the presence rule for settlement orders: direct
// orders reach the settlement the player stands in, or one gate-linked by a door node
// (8.3). The court is private storage, a small build site and the respawn point; it lies
// outside every goddess's sight (data flag outsideDivineSight). enter_court / leave_court
// teleport the player in and back so the court works before the doors ability is wired.
// The court is the site of kind 'court'; the way back from nowhere leads to the site with
// the village_core role (data/city/sites.json).

import { type CommandResult, ok, reject } from '../../core';
import type { SystemContext } from '../../core/system';
import { addItem, addMoney, countItem, holdingOf, removeItem, spendMoney } from '../inventory';
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

export type Presence = { ok: true; remote: boolean } | { ok: false; code: string; reason: string };

export function presence(ctx: SystemContext, site: SiteState, sdef: SiteDef): Presence {
  if (!site.active) return { ok: false, code: 'site_closed', reason: '这里现在还去不了' };
  const p = playerEntity(ctx.world);
  if (p && p.mapId === sdef.mapId) return { ok: true, remote: false };
  if (sdef.kind === 'settlement' && sumEffect(site, ctx.content, 'gateThroughput') > 0)
    return { ok: true, remote: true };
  return {
    ok: false,
    code: 'not_here',
    reason: sdef.kind === 'court' ? '要先回到门内庭院' : '你不在这个聚落，命令送不到',
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
  if (!site || !sdef) return reject('unknown_site', '没有这个地方');
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const count = Math.floor(d.count);
  if (count <= 0) return reject('bad_count', '数量不对');
  if (d.itemId === 'money') {
    if (!spendMoney(ctx, 'player', count, `deposit:${d.siteId}`))
      return reject('no_money', '钱不够');
    addMoney(ctx, sdef.stockOwner, count, 'deposit');
    return ok();
  }
  if (countItem(ctx.world, 'player', d.itemId) < count)
    return reject('missing', '背包里没有这么多');
  if (storageUsed(ctx.world, sdef.stockOwner) + count > storageCap(site, sdef, ctx.content))
    return reject('storage_full', '库房放不下了');
  if (pres.remote) {
    if (gateRoom(ctx, site) < count) return reject('gate_cap', '门扉今天能通过的物资已到上限');
    site.gateUsed += count;
  }
  removeItem(ctx, 'player', d.itemId, count, `deposit:${d.siteId}`);
  addItem(ctx, sdef.stockOwner, d.itemId, count, 'deposit');
  // Direct injection by the player feeds dependency (8.2: 1 point per 100 units).
  if (sdef.kind === 'settlement')
    addDependency(site.autonomy, today(ctx.tick), '直接调入物资', count / 100);
  return ok();
}

export function withdraw(
  ctx: SystemContext,
  d: { siteId: string; itemId: string; count: number },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef) return reject('unknown_site', '没有这个地方');
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const count = Math.floor(d.count);
  if (count <= 0) return reject('bad_count', '数量不对');
  if (d.itemId === 'money') {
    if (holdingOf(ctx.world, sdef.stockOwner).money < count)
      return reject('no_money', '库里没有这么多钱');
    spendMoney(ctx, sdef.stockOwner, count, 'withdraw');
    addMoney(ctx, 'player', count, `withdraw:${d.siteId}`);
    return ok();
  }
  if (countItem(ctx.world, sdef.stockOwner, d.itemId) < count)
    return reject('missing', '库里没有这么多');
  if (pres.remote) {
    if (gateRoom(ctx, site) < count) return reject('gate_cap', '门扉今天能通过的物资已到上限');
    site.gateUsed += count;
  }
  removeItem(ctx, sdef.stockOwner, d.itemId, count, 'withdraw');
  addItem(ctx, 'player', d.itemId, count, `withdraw:${d.siteId}`);
  return ok();
}

export function enterCourt(ctx: SystemContext): CommandResult {
  if (!ctx.flag('feature.inner_court')) return reject('locked', '还没有通往门内庭院的门');
  const p = playerEntity(ctx.world);
  if (!p) return reject('no_player', '找不到玩家');
  const court = courtSite(ctx.content);
  if (court && p.mapId === court.mapId) return reject('already', '已经在庭院里了');
  const map = court ? mapById(ctx.content, court.mapId) : undefined;
  const arrival =
    map?.locations.find((l) => l.id === court?.arrivalLocation) ??
    map?.locations.find((l) => l.kind === 'safe');
  if (!map || !arrival) return reject('no_court', '庭院不存在');
  ctx.world.slices.city.court.returnTo = { mapId: p.mapId, x: p.x, y: p.y };
  return teleportEntity(ctx, p.id, map.id, arrival.x + arrival.w / 2, arrival.y + arrival.h / 2)
    ? ok('穿过门扉，回到了庭院')
    : reject('blocked', '门打不开');
}

export function leaveCourt(ctx: SystemContext): CommandResult {
  const p = playerEntity(ctx.world);
  if (!p) return reject('no_player', '找不到玩家');
  const courtDef = courtSite(ctx.content);
  if (!courtDef || p.mapId !== courtDef.mapId) return reject('not_in_court', '你不在庭院里');
  const court = ctx.world.slices.city.court;
  let target = court.returnTo;
  if (!target || !mapById(ctx.content, target.mapId)) {
    const sdef = siteByRole(ctx.content, 'village_core');
    const map = sdef ? mapById(ctx.content, sdef.mapId) : undefined;
    const c = map?.locations.find((l) => l.id === sdef?.centerLocation);
    if (!map || !c) return reject('nowhere', '门的另一头无处可去');
    target = { mapId: map.id, x: c.x + c.w / 2, y: c.y + c.h / 2 };
  }
  court.returnTo = null;
  return teleportEntity(ctx, p.id, target.mapId, target.x, target.y)
    ? ok('穿过门扉回到了外面')
    : reject('blocked', '门打不开');
}
