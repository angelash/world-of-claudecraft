// Population (city_building 5): three groups (refugees, remnants, migrants) kept as an L4
// cohort pool; daily food, housing, the need tiers, the happiness ledger, security,
// health, attraction-based migration capped at 1 percent per day, and a refugee trickle
// while there is a communal stove, housing and food.

import type { SystemContext } from '../../core/system';
import { removeItem } from '../inventory';
import {
  buildingDef,
  clamp,
  FOOD_ORDER,
  FOOD_VALUE,
  foodValue,
  hasActive,
  isWorking,
  militiaCount,
  policyEffectSum,
  policyFactor,
  stageAtLeast,
  stageCaps,
  stockOf,
  sumEffect,
  tempSum,
  totalPop,
} from './common';
import type { HappinessFactor, PopGroup, SiteDef, SiteState } from './types';

const LEAVE_ORDER: PopGroup[] = ['refugees', 'migrants', 'remnants'];

function sedimentHarm(level: number): number {
  if (level < 2) return 0;
  if (level < 3) return 0.3;
  if (level < 4) return 0.7;
  return 1;
}

export function addPopulation(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  group: PopGroup,
  count: number,
  reason: string,
): number {
  const cap = stageCaps(sdef, site.stage).population;
  const n = Math.max(0, Math.min(Math.floor(count), cap - totalPop(site)));
  if (n <= 0) return 0;
  site.pop[group] += n;
  ctx.emit('city.population_changed', { siteId: site.id, total: totalPop(site), delta: n, reason });
  return n;
}

export function removePopulation(
  ctx: SystemContext,
  site: SiteState,
  count: number,
  reason: string,
): number {
  let left = Math.floor(count);
  let removed = 0;
  for (const g of LEAVE_ORDER) {
    const take = Math.min(left, site.pop[g]);
    site.pop[g] -= take;
    left -= take;
    removed += take;
    if (left <= 0) break;
  }
  if (removed > 0) {
    ctx.emit('city.population_changed', {
      siteId: site.id,
      total: totalPop(site),
      delta: -removed,
      reason,
    });
  }
  return removed;
}

/** Eat one day of food; returns the shortage share 0..1. */
function eat(ctx: SystemContext, site: SiteState, sdef: SiteDef, pop: number): number {
  if (pop <= 0) return 0;
  const need = pop * Math.max(0.5, 1 - tempSum(site, 'ration'));
  let remaining = need;
  const stock = stockOf(ctx.world, sdef.stockOwner);
  for (const id of FOOD_ORDER) {
    if (remaining <= 0) break;
    const have = stock[id] ?? 0;
    if (have <= 0) continue;
    const value = FOOD_VALUE[id] ?? 1;
    const units = Math.min(have, Math.ceil(remaining / value));
    removeItem(ctx, sdef.stockOwner, id, units, 'food');
    remaining -= units * value;
  }
  // Clothes, ale and medicine are used up slowly (need tiers 2 and 3).
  for (const [id, per] of [
    ['cloth', 0.02],
    ['ale', 0.03],
    ['medicine', 0.005],
  ] as const) {
    const have = stock[id] ?? 0;
    if (have <= 0) continue;
    const key = `use:${id}`;
    const total = (site.spoil[key] ?? 0) + pop * per;
    const whole = Math.min(have, Math.floor(total));
    site.spoil[key] = total - whole;
    if (whole > 0) removeItem(ctx, sdef.stockOwner, id, whole, 'consumption');
  }
  return clamp(remaining / need, 0, 1);
}

export function runPopulation(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  if (sdef.kind === 'court') {
    site.happiness = 0;
    site.security = 100;
    site.health = 100;
    return;
  }
  const content = ctx.content;
  let pop = totalPop(site);
  const shortage = eat(ctx, site, sdef, pop);
  const stock = stockOf(ctx.world, sdef.stockOwner);
  const food = foodValue(stock);
  site.foodDays = pop > 0 ? Math.floor((food / pop) * 10) / 10 : food;

  let housing = 0;
  let shackHousing = 0;
  for (const b of site.buildings) {
    if (!isWorking(b)) continue;
    const def = buildingDef(content, b.defId);
    const h = def?.housing ?? 0;
    housing += h;
    if (def?.tags?.includes('shack')) shackHousing += h;
  }
  site.housing = housing;

  const crowd = Math.max(0, pop - housing);
  const officeBonus = (() => {
    const holder = site.offices.security?.holderId;
    if (!holder) return 0;
    const off = content.city_officials.find((o) => o.id === holder);
    return (off?.competence.security ?? 30) / 10;
  })();
  site.security = clamp(
    30 +
      sumEffect(site, content, 'security') +
      policyEffectSum(site, content, 'security') +
      tempSum(site, 'security') +
      officeBonus +
      militiaCount(site, content) * 0.3 -
      crowd / 2 -
      Math.max(0, (pop - 200) / 20),
    0,
    100,
  );
  site.health = clamp(
    60 +
      sumEffect(site, content, 'health') +
      ((stock.medicine ?? 0) > 0 ? 5 : 0) +
      tempSum(site, 'health') -
      (shortage > 0 ? 15 : 0) -
      (crowd > 0 ? 10 : 0) -
      sedimentHarm(site.sediment) * 10,
    0,
    100,
  );

  // Need tiers (5.4): an upper tier counts only while the one below is mostly met.
  const survival =
    pop > 0
      ? (1 -
          shortage +
          (housing >= pop ? 1 : housing / pop) +
          (site.security >= 20 ? 1 : site.security / 20)) /
        3
      : 1;
  const quarter = (xs: boolean[]) => xs.filter(Boolean).length / xs.length;
  const stability =
    survival >= 0.75
      ? quarter([
          (stock.cloth ?? 0) > 0 || hasActive(site, 'weaving'),
          (stock.medicine ?? 0) > 0 || (stock.herb ?? 0) > 0 || hasActive(site, 'clinic'),
          site.security >= 40,
          sumEffect(site, content, 'faith') > 0,
        ])
      : 0;
  const foodKinds = FOOD_ORDER.filter((id) => (stock[id] ?? 0) > 0).length;
  const prosperity =
    stability >= 0.75
      ? quarter([
          (stock.ale ?? 0) > 0 || hasActive(site, 'tavern'),
          hasActive(site, 'market'),
          foodKinds >= 2,
          hasActive(site, 'plaza') || hasActive(site, 'tavern'),
        ])
      : 0;
  const belonging =
    prosperity >= 0.75
      ? quarter([
          hasActive(site, 'plaza'),
          site.policies.includes('festival_days'),
          hasActive(site, 'school'),
          site.policies.length > 0,
        ])
      : 0;
  site.needs = { survival, stability, prosperity, belonging };

  const factors: HappinessFactor[] = [];
  if (pop > 0) {
    factors.push(
      shortage > 0
        ? { source: 'food', label: '挨饿', value: -6 }
        : { source: 'food', label: '吃得饱', value: 2 },
    );
    factors.push(
      crowd > 0
        ? { source: 'housing', label: '住不下', value: -4 }
        : { source: 'housing', label: '有住处', value: 1 },
    );
    if (housing > 0 && shackHousing / housing > 0.5)
      factors.push({ source: 'shack', label: '多数人住窝棚', value: -2 });
    if (stability >= 0.75) factors.push({ source: 'stability', label: '生活安定', value: 2 });
    if (prosperity >= 0.75) factors.push({ source: 'prosperity', label: '日子红火', value: 2 });
    if (belonging >= 0.75) factors.push({ source: 'belonging', label: '有归属感', value: 2 });
    const fac = Math.min(6, sumEffect(site, content, 'happiness'));
    if (fac !== 0) factors.push({ source: 'buildings', label: '设施', value: fac });
    const pol = policyEffectSum(site, content, 'happiness');
    if (pol !== 0) factors.push({ source: 'policies', label: '政策', value: pol });
    for (const e of site.effects) {
      if (e.kind === 'happiness') factors.push({ source: e.id, label: e.label, value: e.value });
    }
    if (site.security < 30) factors.push({ source: 'security', label: '不安全', value: -3 });
    if (site.health < 40) factors.push({ source: 'health', label: '病痛缠身', value: -3 });
    if (site.sediment >= 2) factors.push({ source: 'sediment', label: '澱斑', value: -1 });
  }
  site.factors = factors;
  site.happiness = clamp(
    factors.reduce((s, f) => s + f.value, 0),
    -30,
    30,
  );

  // Migration (5.6).
  const cap = stageCaps(sdef, site.stage).population;
  const rng = ctx.rng('city.population');
  if (pop > 0 && (site.happiness < -10 || shortage > 0.3)) {
    const leave = Math.max(1, Math.floor(pop * 0.01)) * (shortage > 0.3 ? 2 : 1);
    removePopulation(ctx, site, leave, site.happiness < -10 ? '不满离开' : '挨饿离开');
    pop = totalPop(site);
  }
  const room = Math.max(0, Math.min(housing - pop, cap - pop));
  const needsAvg = (survival + stability + prosperity + belonging) / 4;
  const employment = site.laborTotal > 0 ? site.workersTotal / site.laborTotal : 0;
  const reputation = clamp((site.happiness + 30) / 60, 0, 1);
  const taxFeel = Math.max(0, policyFactor(site, content, 'tax') - 1);
  const attraction =
    needsAvg * 0.35 +
    (site.security / 100) * 0.15 +
    employment * 0.15 +
    reputation * 0.15 +
    0.5 * 0.1 +
    0.8 * 0.05 +
    (1 - sedimentHarm(site.sediment)) * 0.05 -
    taxFeel * 0.1 +
    sumEffect(site, content, 'attraction') +
    policyEffectSum(site, content, 'attraction');
  if (stageAtLeast(site.stage, 'village') && room > 0 && pop > 0 && attraction >= 0.45) {
    if (rng.chance(clamp(attraction, 0, 1))) {
      const n = Math.min(
        room,
        Math.max(1, Math.floor(pop * 0.01)),
        1 + Math.floor((attraction - 0.45) * 10),
      );
      addPopulation(ctx, site, sdef, 'migrants', n, '移民迁入');
    }
  }
  const roomNow = Math.max(0, Math.min(housing - totalPop(site), cap - totalPop(site)));
  const trickleStage =
    site.stage === 'outpost' || site.stage === 'village' || site.policies.includes('open_refugees');
  const foodOk = totalPop(site) > 0 ? site.foodDays >= 3 : food >= 10;
  if (trickleStage && hasActive(site, 'communal_stove') && roomNow > 0 && foodOk) {
    const n = rng.int(1, 3) + Math.max(0, Math.round(policyEffectSum(site, content, 'refugees')));
    addPopulation(ctx, site, sdef, 'refugees', Math.min(roomNow, n), '难民投奔');
  }
}
