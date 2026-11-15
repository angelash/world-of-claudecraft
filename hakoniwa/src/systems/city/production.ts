// Daily production chains, storage, spoilage, upkeep and head tax (city_building 4.1, 6).
// Output passes through registered modifiers (D-013) on channel 'harvest' or
// 'production' keyed by the site id, except in the inner court, which is immune.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { addItem, addMoney, itemDef, removeItem, spendMoney } from '../inventory';
import { applyModifiers, registerModifier } from '../modifiers';
import { autonomyEfficiency } from './autonomy';
import {
  buildingDef,
  HEAD_TAX,
  hasActive,
  isWorking,
  LABOR_SHARE,
  policyFactor,
  policyFlag,
  stockOf,
  storageCap,
  storageUsed,
  sumEffect,
  tempSum,
  today,
  totalPop,
  treasuryOf,
} from './common';
import type { BuildingInstance, SiteDef, SiteState } from './types';

function carry(site: SiteState, key: string, amount: number): number {
  const total = (site.spoil[key] ?? 0) + amount;
  const whole = Math.floor(total + 1e-9);
  site.spoil[key] = total - whole;
  return whole;
}

function itemName(ctx: SystemContext, id: string): string {
  return itemDef(ctx.content, id)?.name ?? id;
}

/** Efficiency multiplier of one building today (without staffing). */
function buildingEfficiency(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  b: BuildingInstance,
  day: number,
): number {
  if (sdef.kind === 'court') return 1;
  let eff = autonomyEfficiency(site.autonomy.value);
  if (site.upkeep.state === 'degraded') eff *= 0.5;
  if (site.upkeep.state === 'shutdown') return 0;
  if (b.condition < 50) eff *= 0.5;
  if ((b.boostUntilDay ?? -1) >= day) eff *= 1.15;
  eff *= 1 + tempSum(site, 'production');
  eff *= policyFactor(site, ctx.content, 'production');
  if (buildingDef(ctx.content, b.defId)?.tags?.includes('food'))
    eff *= policyFactor(site, ctx.content, 'foodProduction');
  return Math.max(0, eff);
}

export function runProduction(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  const day = today(ctx.tick);
  const owner = sdef.stockOwner;
  const pop = totalPop(site);
  const labor = sdef.kind === 'court' ? Number.POSITIVE_INFINITY : Math.floor(pop * LABOR_SHARE);
  let remaining = labor;
  const working = site.buildings.filter((b) => {
    if (!isWorking(b)) return false;
    const def = buildingDef(ctx.content, b.defId);
    return !!def && (!!def.produces || (def.jobs ?? 0) > 0);
  });
  if (policyFlag(site, ctx.content, 'foodFirst')) {
    const isFood = (b: BuildingInstance) =>
      buildingDef(ctx.content, b.defId)?.tags?.includes('food') ? 0 : 1;
    working.sort((a, b) => isFood(a) - isFood(b));
  }

  const totals: { harvest: Record<string, number>; production: Record<string, number> } = {
    harvest: {},
    production: {},
  };
  const producersOf: Record<string, BuildingInstance[]> = {};
  // Storage budget (city_building 6.4): a building whose output has nowhere to go does not
  // run, so no input is consumed and nothing is discarded. Output still waiting in the
  // carry buffers from an earlier full day counts against the space.
  let budget = storageCap(site, sdef, ctx.content) - storageUsed(ctx.world, owner) - backlog(site);
  const scale = {
    harvest: modifierScale(ctx, sdef, 'harvest', site.id),
    production: modifierScale(ctx, sdef, 'production', site.id),
  };
  let full = false;
  let assigned = 0;
  for (const b of working) {
    const def = buildingDef(ctx.content, b.defId);
    if (!def) continue;
    b.note = undefined;
    const jobs = def.jobs ?? 0;
    let staffing = 1;
    if (jobs > 0) {
      const w = Math.max(0, Math.min(jobs, remaining));
      remaining -= w;
      assigned += w;
      b.workers = w;
      staffing = w / jobs;
      if (w === 0) b.note = '没有人手';
    } else {
      b.workers = 0;
    }
    if (!def.produces) continue;
    const eff = buildingEfficiency(ctx, site, sdef, b, day) * staffing;
    if (eff <= 0) {
      if (site.upkeep.state === 'shutdown') b.note = '欠缴维护费，停工';
      continue;
    }
    let ratio = 1;
    const stock = stockOf(ctx.world, owner);
    const lacking: string[] = [];
    for (const [id, n] of Object.entries(def.consumes ?? {})) {
      const need = n * eff;
      const have = stock[id] ?? 0;
      if (have < need) {
        ratio = Math.min(ratio, need > 0 ? have / need : 1);
        lacking.push(itemName(ctx, id));
      }
    }
    if (lacking.length > 0) b.note = `缺少原料：${lacking.join('、')}`;
    if (ratio <= 0) continue;
    const channel = def.channel ?? 'production';
    // Net change in stored units if the building runs at `ratio`: projected output (after
    // the site's modifier factor) minus the inputs it takes out of the same storage.
    let net = 0;
    for (const n of Object.values(def.produces)) net += n * eff * ratio * scale[channel];
    for (const n of Object.values(def.consumes ?? {})) net -= n * eff * ratio;
    if (net > 0 && net > budget) {
      full = true;
      if (budget <= 0) {
        b.note = FULL_NOTE;
        continue;
      }
      ratio *= budget / net;
      b.note = '仓库将满，减产';
      net = budget;
    }
    budget -= net;
    for (const [id, n] of Object.entries(def.consumes ?? {})) {
      const take = Math.min(carry(site, `in:${b.id}:${id}`, n * eff * ratio), stock[id] ?? 0);
      if (take > 0) removeItem(ctx, owner, id, take, 'production');
    }
    for (const [id, n] of Object.entries(def.produces)) {
      totals[channel][id] = (totals[channel][id] ?? 0) + n * eff * ratio;
      const list = producersOf[id] ?? [];
      list.push(b);
      producersOf[id] = list;
    }
  }
  site.workersTotal = assigned;
  site.laborTotal = Number.isFinite(labor) ? labor : 0;

  // Apply registered modifiers once per (channel, item) on the site total (D-013).
  const out: Record<string, number> = {};
  for (const channel of ['harvest', 'production'] as const) {
    for (const [id, amount] of Object.entries(totals[channel])) {
      const v = sdef.immuneToModifiers
        ? amount
        : Math.max(0, applyModifiers(ctx.world, channel, site.id, amount));
      out[id] = (out[id] ?? 0) + v;
    }
  }

  // Stored output, including yesterday's waiting backlog. What still does not fit (the
  // additive part of a modifier, rounding) stays in the carry buffer for the next day.
  const cap = storageCap(site, sdef, ctx.content);
  let free = cap - storageUsed(ctx.world, owner);
  const ids = new Set([...Object.keys(out), ...backlogIds(site)]);
  for (const id of [...ids].sort()) {
    const whole = carry(site, `out:${id}`, out[id] ?? 0);
    if (whole <= 0) continue;
    const put = Math.max(0, Math.min(whole, free));
    if (put > 0) addItem(ctx, owner, id, put, 'production');
    free -= put;
    if (put < whole) {
      full = true;
      site.spoil[`out:${id}`] = (site.spoil[`out:${id}`] ?? 0) + (whole - put);
      for (const b of producersOf[id] ?? []) b.note = FULL_NOTE;
    }
  }
  if (full) site.status.push('仓库已满：放不下的产出不再开工，腾出地方后恢复生产');
}

const FULL_NOTE = '仓库已满，停产';

/** Whole units of output already produced but still waiting for storage space. */
function backlog(site: SiteState): number {
  let n = 0;
  for (const [k, v] of Object.entries(site.spoil)) if (k.startsWith('out:')) n += Math.floor(v);
  return n;
}

function backlogIds(site: SiteState): string[] {
  return Object.entries(site.spoil)
    .filter(([k, v]) => k.startsWith('out:') && v >= 1)
    .map(([k]) => k.slice(4));
}

/** The site's combined multiplicative modifier on a channel (1 when immune or none). */
function modifierScale(
  ctx: SystemContext,
  sdef: SiteDef,
  channel: 'harvest' | 'production',
  siteId: string,
): number {
  if (sdef.immuneToModifiers) return 1;
  const base = applyModifiers(ctx.world, channel, siteId, 0);
  return Math.max(0, applyModifiers(ctx.world, channel, siteId, 1) - base);
}

/** Spoilage of food and herbs (0.3 to 1 percent per day; a granary halves food loss). */
export function runSpoilage(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  if (sdef.kind === 'court') return;
  const stock = stockOf(ctx.world, sdef.stockOwner);
  const granary = hasActive(site, 'granary');
  for (const { itemId: id, rate, granaryHalves } of ctx.content.city_config.spoilage) {
    const have = stock[id] ?? 0;
    if (have <= 0) continue;
    const r = granary && granaryHalves ? rate / 2 : rate;
    const lost = Math.min(have, carry(site, `spoil:${id}`, have * r));
    if (lost > 0) removeItem(ctx, sdef.stockOwner, id, lost, 'spoilage');
  }
}

/** Head tax in, upkeep out, with grace, degraded and shutdown arrears (no hidden debt); from the village stage on. */
export function runFinances(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  // The court runs on door breath; an outpost is run by hand (no tax, no upkeep yet).
  if (sdef.kind === 'court' || site.stage === 'outpost') return;
  const owner = sdef.stockOwner;
  const pop = totalPop(site);
  if (pop > 0) {
    const tax = Math.round(
      pop * HEAD_TAX * policyFactor(site, ctx.content, 'tax') * (site.happiness < -10 ? 0.5 : 1),
    );
    if (tax > 0) addMoney(ctx, owner, tax, 'head_tax');
  }
  let monthly = 0;
  for (const b of site.buildings) {
    if (b.status === 'active') monthly += buildingDef(ctx.content, b.defId)?.upkeepPerMonth ?? 0;
  }
  site.upkeep.acc += monthly / 30;
  const due = Math.floor(site.upkeep.acc);
  if (due <= 0) return;
  site.upkeep.acc -= due;
  if (treasuryOf(ctx.world, owner) >= due) {
    spendMoney(ctx, owner, due, 'upkeep');
    site.upkeep.arrearsDays = 0;
    site.upkeep.state = 'ok';
    return;
  }
  const partial = treasuryOf(ctx.world, owner);
  if (partial > 0) spendMoney(ctx, owner, partial, 'upkeep');
  site.upkeep.arrearsDays += 1;
  const d = site.upkeep.arrearsDays;
  site.upkeep.state = d <= 7 ? 'grace' : d <= 21 ? 'degraded' : 'shutdown';
  site.status.push(
    site.upkeep.state === 'grace'
      ? `维护费欠缴第 ${d} 天（宽限期）`
      : site.upkeep.state === 'degraded'
        ? `维护费欠缴第 ${d} 天：建筑降效`
        : `维护费欠缴第 ${d} 天：建筑停工`,
  );
}

/** Repair the most damaged building below a threshold, paying 30 percent of its materials. */
export function repairOne(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  threshold: number,
): string | null {
  const damaged = site.buildings
    .filter((b) => b.status === 'active' && b.condition < threshold)
    .sort((a, b) => a.condition - b.condition || a.id.localeCompare(b.id));
  const b = damaged[0];
  if (!b) return null;
  const def = buildingDef(ctx.content, b.defId);
  if (!def) return null;
  const stock = stockOf(ctx.world, sdef.stockOwner);
  const need: [string, number][] = Object.entries(def.cost.items).map(([id, n]) => [
    id,
    Math.max(1, Math.ceil(n * 0.3)),
  ]);
  if (need.some(([id, n]) => (stock[id] ?? 0) < n)) return null;
  for (const [id, n] of need) removeItem(ctx, sdef.stockOwner, id, n, 'repair');
  b.condition = 100;
  return def.name;
}

/** The purify well keeps a registered 'sediment' modifier on the site (D-013). */
export function runPurifyWell(ctx: SystemContext, site: SiteState): void {
  const strength = sumEffect(site, ctx.content, 'sediment');
  if (strength <= 0) return;
  site.sediment = Math.max(0, site.sediment - 0.05 * strength);
  const mod = site.sedimentModifier;
  if (mod && mod.untilTick > ctx.tick + TICKS_PER_GAME_DAY) return;
  const m = registerModifier(ctx, {
    target: 'sediment',
    key: site.id,
    add: -strength,
    untilTick: ctx.tick + 30 * TICKS_PER_GAME_DAY,
    source: 'city',
    visibility: 'public',
    note: '净澱井：聚落的澱在缓慢沉降',
  });
  site.sedimentModifier = { id: m.id, untilTick: m.untilTick };
}
