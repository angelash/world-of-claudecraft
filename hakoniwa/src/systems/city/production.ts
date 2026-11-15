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

const SPOIL_RATE: Record<string, number> = {
  grain: 0.003,
  meat: 0.005,
  fish: 0.005,
  bread: 0.01,
  herb: 0.01,
};

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
    for (const [id, n] of Object.entries(def.consumes ?? {})) {
      const take = Math.min(carry(site, `in:${b.id}:${id}`, n * eff * ratio), stock[id] ?? 0);
      if (take > 0) removeItem(ctx, owner, id, take, 'production');
    }
    const channel = def.channel ?? 'production';
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

  const cap = storageCap(site, sdef, ctx.content);
  let free = cap - storageUsed(ctx.world, owner);
  let full = false;
  for (const id of Object.keys(out).sort()) {
    const whole = carry(site, `out:${id}`, out[id] as number);
    if (whole <= 0) continue;
    const put = Math.max(0, Math.min(whole, free));
    if (put > 0) addItem(ctx, owner, id, put, 'production');
    free -= put;
    if (put < whole) {
      full = true;
      for (const b of producersOf[id] ?? []) b.note = '仓库已满，停产';
    }
  }
  if (full) site.status.push('仓库已满：部分产出无处存放，生产停下了');
}

/** Spoilage of food and herbs (0.3 to 1 percent per day; a granary halves food loss). */
export function runSpoilage(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  if (sdef.kind === 'court') return;
  const stock = stockOf(ctx.world, sdef.stockOwner);
  const granary = hasActive(site, 'granary');
  for (const [id, rate] of Object.entries(SPOIL_RATE)) {
    const have = stock[id] ?? 0;
    if (have <= 0) continue;
    const r = granary && id !== 'herb' ? rate / 2 : rate;
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
