// The Door Company (门扉商会): founding with Nera, funds and stock held in the company's
// own inventory, Earth-knowledge production runs, and caravans between markets with
// travel time, escorts and raid risk. Completion times are absolute ticks, so a load or
// map change never settles twice. Economy design 3.1 to 3.4.

import { ok, reject } from '../../core';
import { contentRef, contentText } from '../../core/content_key';
import type { CommandResult } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt, TICKS_PER_GAME_DAY } from '../../core/time';
import {
  addItem,
  addMoney,
  countItem,
  holdingOf,
  itemDef,
  putItems,
  removeItem,
  spendMoney,
  takeItems,
} from '../inventory';
import { applyModifiers } from '../modifiers';
import { playerEntity } from '../world';
import { quote } from './market';
import { settleTrade } from './ports';
import type {
  CaravanState,
  CompanyLedgerReason,
  CompanyState,
  EconomyConfig,
  RecipeDef,
  RouteDef,
} from './types';

export function emptyCompany(): CompanyState {
  return {
    founded: false,
    foundedDay: -1,
    partnerShare: 0,
    reputation: 0,
    scale: 0,
    caravans: [],
    jobs: [],
    firstSale: {},
    produced: {},
    caravansDone: 0,
    revenue: 0,
    ledger: [],
  };
}

function today(ctx: SystemContext): number {
  return calendarAt(ctx.tick).dayIndex;
}

function log(ctx: SystemContext, delta: number, reason: CompanyLedgerReason): void {
  const c = ctx.world.slices.economy.company;
  c.ledger.push({ day: today(ctx), delta, reason });
  if (c.ledger.length > 60) c.ledger.splice(0, c.ledger.length - 60);
}

export function companyOwner(config: EconomyConfig): string {
  return config.company.ownerId;
}

/** The company's display name as a content key (economy_config is keyed by section). */
function companyName(config: EconomyConfig): TextParam {
  return config.company.name ? contentRef('economy_config', 'company', 'name') : '';
}

export function canFoundCompany(ctx: SystemContext): CommandResult {
  const config = ctx.content.economy_config;
  const c = ctx.world.slices.economy.company;
  if (c.founded) return reject('already', tr('sys.economy.reject.already'));
  const missing = config.company.requiresFlags?.find((f) => !ctx.flag(f));
  if (missing) return reject('not_yet', tr('sys.economy.reject.not_yet'));
  const player = ctx.world.slices.world.playerId;
  if (holdingOf(ctx.world, player).money < config.company.foundCost) {
    return reject(
      'no_money',
      tr('sys.economy.reject.no_money.found', { cost: config.company.foundCost }),
    );
  }
  return ok();
}

export function foundCompany(ctx: SystemContext): CommandResult {
  const check = canFoundCompany(ctx);
  if (!check.ok) return check;
  const config = ctx.content.economy_config;
  const player = ctx.world.slices.world.playerId;
  const owner = companyOwner(config);
  spendMoney(ctx, player, config.company.foundCost, 'company_founding');
  addMoney(ctx, owner, config.company.foundCost, 'company_founding');
  const c = ctx.world.slices.economy.company;
  const stance = ctx.flag('npc.nera.stance');
  c.founded = true;
  c.foundedDay = today(ctx);
  c.partnerShare =
    typeof stance === 'string' && stance in config.company.partnerShare
      ? (config.company.partnerShare[stance] as number)
      : config.company.defaultPartnerShare;
  c.scale = 1;
  log(ctx, config.company.foundCost, 'founding');
  ctx.setFlag('econ.company_founded', true);
  ctx.setFlag('feature.company', true);
  ctx.setFlag('econ.house_scale', 1);
  ctx.emit('feature.unlocked', { feature: 'company' });
  ctx.emit('economy.company_founded', {
    companyId: config.company.id,
    partnerShare: c.partnerShare,
  });
  const p = playerEntity(ctx.world);
  if (p) {
    ctx.emit('feat.performed', {
      actorId: p.id,
      kind: 'trade',
      tier: 1,
      mapId: p.mapId,
      x: p.x,
      y: p.y,
      note: tr('sys.economy.feat.company_founded', { company: companyName(config) }),
    });
  }
  return ok(tr('sys.economy.info.company_founded', { company: companyName(config) }));
}

export function requireCompany(ctx: SystemContext): CommandResult | null {
  return ctx.world.slices.economy.company.founded
    ? null
    : reject('no_company', tr('sys.economy.reject.no_company'));
}

export function companyFunds(ctx: SystemContext, amount: number): CommandResult {
  const need = requireCompany(ctx);
  if (need) return need;
  if (!Number.isInteger(amount) || amount === 0)
    return reject('bad_amount', tr('sys.economy.reject.bad_amount'));
  const owner = companyOwner(ctx.content.economy_config);
  const player = ctx.world.slices.world.playerId;
  if (amount > 0) {
    if (!spendMoney(ctx, player, amount, 'company_deposit'))
      return reject('no_money', tr('sys.economy.reject.no_money.short'));
    addMoney(ctx, owner, amount, 'company_deposit');
  } else {
    if (!spendMoney(ctx, owner, -amount, 'company_withdraw')) {
      return reject('no_funds', tr('sys.economy.reject.no_funds.withdraw'));
    }
    addMoney(ctx, player, -amount, 'company_withdraw');
  }
  log(ctx, amount, amount > 0 ? 'deposit' : 'withdraw');
  return ok();
}

export function companyTransfer(
  ctx: SystemContext,
  itemId: string,
  qty: number,
  to: 'company' | 'player',
): CommandResult {
  const need = requireCompany(ctx);
  if (need) return need;
  if (!Number.isInteger(qty) || qty <= 0)
    return reject('bad_qty', tr('sys.economy.reject.bad_qty.count'));
  const owner = companyOwner(ctx.content.economy_config);
  const player = ctx.world.slices.world.playerId;
  const [from, dest] = to === 'company' ? [player, owner] : [owner, player];
  // move the pieces themselves: records and stack qualifiers go along (D-072)
  const parcel = takeItems(ctx, from, itemId, qty, 'company_transfer');
  if (!parcel) return reject('missing', tr('sys.economy.reject.missing.count'));
  putItems(ctx, dest, parcel, 'company_transfer');
  return ok();
}

export function companyTrade(
  ctx: SystemContext,
  side: 'buy' | 'sell',
  marketId: string,
  itemId: string,
  qty: number,
): CommandResult {
  const need = requireCompany(ctx);
  if (need) return need;
  const owner = companyOwner(ctx.content.economy_config);
  const res = settleTrade(ctx, marketId, owner, itemId, qty, side, `company_${side}`);
  if (!res.ok) return reject(res.code, res.reason);
  const c = ctx.world.slices.economy.company;
  if (side === 'sell') {
    c.revenue += res.total;
    if (!c.firstSale[itemId]) c.firstSale[itemId] = { day: today(ctx), marketId };
  }
  log(ctx, side === 'sell' ? res.total : -res.total, `${side}:${itemId}`);
  return ok();
}

// ---------------------------------------------------------------------------
// Production

export function recipeUnlocked(ctx: SystemContext, recipe: RecipeDef): boolean {
  return !recipe.requiresFlags?.some((f) => !ctx.flag(f));
}

export function startProduction(ctx: SystemContext, recipeId: string, runs: number): CommandResult {
  const need = requireCompany(ctx);
  if (need) return need;
  const config = ctx.content.economy_config;
  const recipe = ctx.content.trade_recipes.find((r) => r.id === recipeId);
  if (!recipe) return reject('no_recipe', tr('sys.economy.reject.no_recipe'));
  if (!recipeUnlocked(ctx, recipe))
    return reject(
      'locked',
      tr('sys.economy.reject.locked', { recipe: contentText('trade_recipes', recipe) }),
    );
  if (!Number.isInteger(runs) || runs <= 0 || runs > 20)
    return reject('bad_runs', tr('sys.economy.reject.bad_runs'));
  const c = ctx.world.slices.economy.company;
  if (c.jobs.length >= config.company.maxQueue)
    return reject('queue_full', tr('sys.economy.reject.queue_full'));
  const owner = companyOwner(config);
  for (const [itemId, n] of Object.entries(recipe.inputs)) {
    if (countItem(ctx.world, owner, itemId) < n * runs) {
      const name = contentText('items', itemDef(ctx.content, itemId), itemId);
      return reject('no_input', tr('sys.economy.reject.no_input', { item: name, n: n * runs }));
    }
  }
  for (const [itemId, n] of Object.entries(recipe.inputs)) {
    removeItem(ctx, owner, itemId, n * runs, 'production_input');
  }
  const start = c.jobs.reduce((t, j) => Math.max(t, j.doneTick), ctx.tick);
  c.jobs.push({
    id: ctx.newId('job'),
    recipeId,
    runs,
    doneTick: start + Math.round(recipe.days * runs * TICKS_PER_GAME_DAY),
  });
  return ok();
}

export function settleProduction(ctx: SystemContext): void {
  const c = ctx.world.slices.economy.company;
  if (c.jobs.length === 0) return;
  const owner = companyOwner(ctx.content.economy_config);
  const keep = [];
  for (const job of c.jobs) {
    if (job.doneTick > ctx.tick) {
      keep.push(job);
      continue;
    }
    const recipe = ctx.content.trade_recipes.find((r) => r.id === job.recipeId);
    if (!recipe) continue;
    const count = recipe.output * job.runs;
    addItem(ctx, owner, recipe.product, count, 'production');
    c.produced[recipe.product] = (c.produced[recipe.product] ?? 0) + count;
    ctx.emit('economy.production_done', {
      jobId: job.id,
      recipeId: recipe.id,
      itemId: recipe.product,
      count,
    });
  }
  c.jobs = keep;
}

// ---------------------------------------------------------------------------
// Caravans

export function routeBetween(routes: RouteDef[], a: string, b: string): RouteDef | undefined {
  return routes.find((r) => (r.a === a && r.b === b) || (r.a === b && r.b === a));
}

export function caravanCost(
  config: EconomyConfig,
  route: RouteDef,
  carts: number,
  guards: number,
): number {
  return Math.round(
    (carts * config.company.cartCostPerDay + guards * config.company.guardCostPerDay) * route.days,
  );
}

export function sendCaravan(
  ctx: SystemContext,
  from: string,
  to: string,
  cargo: Record<string, number>,
  guards: number,
): CommandResult {
  const need = requireCompany(ctx);
  if (need) return need;
  const config = ctx.content.economy_config;
  const route = routeBetween(ctx.content.trade_routes, from, to);
  if (!route) return reject('no_route', tr('sys.economy.reject.no_route'));
  const c = ctx.world.slices.economy.company;
  if (c.caravans.filter((k) => k.status === 'travel').length >= config.company.maxCaravans) {
    return reject('too_many', tr('sys.economy.reject.too_many'));
  }
  if (!Number.isInteger(guards) || guards < 0 || guards > 30)
    return reject('bad_guards', tr('sys.economy.reject.bad_guards'));
  const owner = companyOwner(config);
  let units = 0;
  let basis = 0;
  for (const [itemId, n] of Object.entries(cargo)) {
    if (!Number.isInteger(n) || n <= 0)
      return reject('bad_qty', tr('sys.economy.reject.bad_qty.cargo'));
    if (!itemDef(ctx.content, itemId)) return reject('no_item', tr('sys.economy.reject.no_item'));
    if (countItem(ctx.world, owner, itemId) < n)
      return reject('missing', tr('sys.economy.reject.missing.cargo'));
    units += n;
    basis += quote(ctx.world, ctx.content, from, itemId, 'buy', n)?.total ?? 0;
  }
  if (units === 0) return reject('empty', tr('sys.economy.reject.empty'));
  const carts = Math.ceil(units / config.company.cartCapacity);
  const cost = caravanCost(config, route, carts, guards);
  if (!spendMoney(ctx, owner, cost, 'caravan_cost')) {
    return reject('no_funds', tr('sys.economy.reject.no_funds.caravan', { cost }));
  }
  for (const [itemId, n] of Object.entries(cargo))
    removeItem(ctx, owner, itemId, n, 'caravan_load');
  const days = applyModifiers(ctx.world, 'travel', route.id, route.days);
  const k: CaravanState = {
    id: ctx.newId('caravan'),
    routeId: route.id,
    from,
    to,
    cargo: { ...cargo },
    costBasis: basis + cost,
    carts,
    guards,
    departTick: ctx.tick,
    arriveTick: ctx.tick + Math.max(1, Math.round(days * TICKS_PER_GAME_DAY)),
    status: 'travel',
    raids: 0,
    revenue: 0,
  };
  c.caravans.push(k);
  log(ctx, -cost, 'caravan_cost');
  ctx.emit('economy.caravan_departed', { caravanId: k.id, from, to, arriveTick: k.arriveTick });
  return ok();
}

/** Daily raid rolls for caravans on the road (economy design 3.4: risk by route and escort). */
export function rollCaravanRisks(ctx: SystemContext): void {
  const c = ctx.world.slices.economy.company;
  const config = ctx.content.economy_config;
  const rng = ctx.rng('economy.caravan');
  for (const k of c.caravans) {
    if (k.status !== 'travel') continue;
    const route = ctx.content.trade_routes.find((r) => r.id === k.routeId);
    if (!route) continue;
    const cover = Math.min(0.8, (k.guards / Math.max(1, k.carts)) * config.company.guardCover);
    const risk = applyModifiers(ctx.world, 'monster', route.id, route.risk) * (1 - cover);
    if (!rng.chance(Math.max(0, risk))) continue;
    const lost = Math.round(rng.range(0.2, 0.6) * 100) / 100;
    for (const itemId of Object.keys(k.cargo)) {
      k.cargo[itemId] = Math.floor((k.cargo[itemId] as number) * (1 - lost));
      if (k.cargo[itemId] === 0) delete k.cargo[itemId];
    }
    k.raids += 1;
    if (Object.keys(k.cargo).length === 0) k.status = 'lost';
    ctx.emit('economy.caravan_raided', { caravanId: k.id, lostShare: lost });
  }
}

export function settleCaravans(ctx: SystemContext): void {
  const c = ctx.world.slices.economy.company;
  const config = ctx.content.economy_config;
  const owner = companyOwner(config);
  for (const k of c.caravans) {
    if (k.status !== 'travel' || k.arriveTick > ctx.tick) continue;
    const route = ctx.content.trade_routes.find((r) => r.id === k.routeId);
    let revenue = 0;
    for (const [itemId, n] of Object.entries(k.cargo)) {
      addItem(ctx, owner, itemId, n, 'caravan_unload');
      const res = settleTrade(ctx, k.to, owner, itemId, n, 'sell', 'caravan_sale');
      if (res.ok) {
        revenue += res.total;
        if (!c.firstSale[itemId]) c.firstSale[itemId] = { day: today(ctx), marketId: k.to };
      }
    }
    const toll = Math.round(revenue * (route?.tollRate ?? 0));
    if (toll > 0) spendMoney(ctx, owner, Math.min(toll, holdingOf(ctx.world, owner).money), 'toll');
    revenue -= toll;
    const profit = revenue - k.costBasis;
    if (profit > 0 && c.partnerShare > 0) {
      const cut = Math.floor(profit * c.partnerShare);
      if (spendMoney(ctx, owner, cut, 'partner_share')) {
        addMoney(ctx, config.company.partnerNpc, cut, 'partner_share');
      }
    }
    k.revenue = revenue;
    k.status = 'arrived';
    c.revenue += revenue;
    c.caravansDone += 1;
    log(ctx, revenue, `caravan:${k.to}`);
    ctx.emit('economy.caravan_arrived', { caravanId: k.id, to: k.to, revenue, profit });
  }
  const done = c.caravans.filter((k) => k.status !== 'travel');
  if (done.length > 10) {
    const drop = new Set(done.slice(0, done.length - 10).map((k) => k.id));
    c.caravans = c.caravans.filter((k) => !drop.has(k.id));
  }
}

/** house_scale 0..5 derived from the company's reach (act2 4.5, economy design 3.1). */
export function companyScale(c: CompanyState): number {
  if (!c.founded) return 0;
  let s = 1;
  if (c.caravansDone >= 3 || c.revenue >= 5000) s = 2;
  if (s >= 2 && c.revenue >= 50000) s = 3;
  if (s >= 3 && Object.keys(c.produced).length >= 3 && c.revenue >= 200000) s = 4;
  if (s >= 4 && c.revenue >= 1000000) s = 5;
  return s;
}

export function updateScale(ctx: SystemContext): void {
  const c = ctx.world.slices.economy.company;
  const s = companyScale(c);
  if (s !== c.scale) {
    c.scale = s;
    ctx.setFlag('econ.house_scale', s);
  }
}
