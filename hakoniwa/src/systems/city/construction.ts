// Construction: paying for a building (settlement stock first, then the player's pack;
// money from the treasury first, then the player's purse), daily progress, completion and
// cancellation refunds (city_building 4.1).

import { type CommandResult, ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { joinText, type KeyText, tr } from '../../core/text';
import { addItem, addMoney, itemDef, removeItem, spendMoney } from '../inventory';
import { addDependency, DECISION_WEIGHT, recordDecision } from './autonomy';
import { buildingDef, siteDef, stockOf, today, totalPop, treasuryOf } from './common';
import { previewPlacement } from './placement';
import type { BuildingDef, SiteDef, SiteState } from './types';

const PLAYER = 'player';

/** Readable reason the cost cannot be paid, or null when it can. */
export function costProblem(
  ctx: SystemContext,
  sdef: SiteDef,
  cost: BuildingDef['cost'],
): KeyText | null {
  const site = stockOf(ctx.world, sdef.stockOwner);
  const pack = stockOf(ctx.world, PLAYER);
  const missing: string[] = [];
  for (const [id, n] of Object.entries(cost.items)) {
    const have = (site[id] ?? 0) + (pack[id] ?? 0);
    if (have < n) missing.push(`${itemDef(ctx.content, id)?.name ?? id} ${n - have}`);
  }
  if (missing.length > 0)
    return tr('sys.city.reject.cost_materials', { missing: joinText('list', missing) });
  const money = cost.money ?? 0;
  if (money > 0) {
    const have = treasuryOf(ctx.world, sdef.stockOwner) + treasuryOf(ctx.world, PLAYER);
    if (have < money) return tr('sys.city.reject.cost_money', { n: money - have });
  }
  return null;
}

/** Deduct a cost; call costProblem first. */
export function payCost(
  ctx: SystemContext,
  sdef: SiteDef,
  cost: BuildingDef['cost'],
  reason: string,
): void {
  for (const [id, n] of Object.entries(cost.items)) {
    const fromSite = Math.min(n, stockOf(ctx.world, sdef.stockOwner)[id] ?? 0);
    if (fromSite > 0) removeItem(ctx, sdef.stockOwner, id, fromSite, reason);
    if (n - fromSite > 0) removeItem(ctx, PLAYER, id, n - fromSite, reason);
  }
  const money = cost.money ?? 0;
  if (money > 0) {
    const fromSite = Math.min(money, treasuryOf(ctx.world, sdef.stockOwner));
    if (fromSite > 0) spendMoney(ctx, sdef.stockOwner, fromSite, reason);
    if (money - fromSite > 0) spendMoney(ctx, PLAYER, money - fromSite, reason);
  }
}

export interface PlaceOutcome {
  result: CommandResult;
  buildingId?: string;
}

export function placeBuilding(
  ctx: SystemContext,
  siteId: string,
  defId: string,
  x: number,
  y: number,
  by: 'player' | 'official',
): PlaceOutcome {
  const sdef = siteDef(ctx.content, siteId);
  const site = ctx.world.slices.city.sites[siteId];
  const def = buildingDef(ctx.content, defId);
  if (!sdef || !site) return { result: reject('unknown_site', tr('sys.city.reject.unknown_site')) };
  if (!def) return { result: reject('unknown_building', tr('sys.city.reject.unknown_building')) };
  const check = previewPlacement(ctx.world, ctx.content, siteId, defId, x, y);
  if (!check.ok) return { result: reject(check.code, check.reason) };
  const problem = costProblem(ctx, sdef, def.cost);
  if (problem) return { result: reject('cost', problem) };
  payCost(ctx, sdef, def.cost, `build:${def.id}`);
  const day = today(ctx.tick);
  const id = ctx.newId('bld');
  site.buildings.push({
    id,
    defId,
    x: Math.floor(x),
    y: Math.floor(y),
    w: def.footprint.w,
    h: def.footprint.h,
    status: 'construction',
    progress: 0,
    condition: 100,
    workers: 0,
    placedDay: day,
    placedBy: by,
  });
  if (sdef.kind === 'settlement' && by === 'player') {
    // Building an ordinary building yourself bypasses the works official (8.2: +0.3).
    // Official builds are recorded by the official act itself.
    recordDecision(site.decisions, day, 'player', DECISION_WEIGHT[2] as number);
    addDependency(
      site.autonomy,
      day,
      tr('sys.city.dep.build', { building: contentText('city_buildings', def) }),
      0.3,
    );
  }
  ctx.emit('city.building_placed', { siteId, buildingId: id, defId, by });
  return {
    result: ok(tr('sys.city.info.build_started', { building: contentText('city_buildings', def) })),
    buildingId: id,
  };
}

export function cancelBuilding(
  ctx: SystemContext,
  siteId: string,
  buildingId: string,
): CommandResult {
  const sdef = siteDef(ctx.content, siteId);
  const site = ctx.world.slices.city.sites[siteId];
  if (!sdef || !site) return reject('unknown_site', tr('sys.city.reject.unknown_site'));
  const idx = site.buildings.findIndex((b) => b.id === buildingId);
  if (idx < 0) return reject('no_building', tr('sys.city.reject.no_building_found'));
  const b = site.buildings[idx] as SiteState['buildings'][number];
  const def = buildingDef(ctx.content, b.defId);
  site.buildings.splice(idx, 1);
  const share = b.status === 'construction' ? 0.5 : 0.25;
  if (def) {
    for (const [id, n] of Object.entries(def.cost.items)) {
      const back = Math.floor(n * share);
      if (back > 0) addItem(ctx, sdef.stockOwner, id, back, 'refund');
    }
    const money = Math.floor((def.cost.money ?? 0) * share);
    if (money > 0) addMoney(ctx, sdef.stockOwner, money, 'refund');
  }
  const day = today(ctx.tick);
  if (sdef.kind === 'settlement') {
    recordDecision(site.decisions, day, 'player', DECISION_WEIGHT[2] as number);
    addDependency(
      site.autonomy,
      day,
      tr('sys.city.dep.demolish', { building: contentText('city_buildings', def, b.defId) }),
      0.3,
    );
  }
  ctx.emit('city.building_cancelled', { siteId, buildingId, defId: b.defId });
  return ok(
    b.status === 'construction'
      ? tr('sys.city.info.build_cancelled')
      : tr('sys.city.info.demolished'),
  );
}

function complete(ctx: SystemContext, siteId: string, b: SiteState['buildings'][number]): void {
  b.status = 'active';
  b.condition = 100;
  b.progress = buildingDef(ctx.content, b.defId)?.days ?? b.progress;
  if (b.defId === 'court_study') ctx.setFlag('city.court_study', true);
  ctx.emit('building.completed', { buildingId: b.id, defId: b.defId, siteId });
}

/** Add construction days; the player alone builds at half speed until 5 people live here. */
export function progressConstruction(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  const rate = sdef.kind === 'court' || totalPop(site) >= 5 ? 1 : 0.5;
  for (const b of site.buildings) {
    if (b.status !== 'construction') continue;
    b.progress += rate;
    const def = buildingDef(ctx.content, b.defId);
    if (!def || b.progress >= def.days) complete(ctx, site.id, b);
  }
}

/** Rush one building by a day (micro-management). */
export function rushBuilding(ctx: SystemContext, site: SiteState, buildingId: string): boolean {
  const b = site.buildings.find((x) => x.id === buildingId && x.status === 'construction');
  if (!b) return false;
  b.progress += 1;
  const def = buildingDef(ctx.content, b.defId);
  if (!def || b.progress >= def.days) complete(ctx, site.id, b);
  return true;
}
