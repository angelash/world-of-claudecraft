// Read-only economy views for the client and the editor workbench: market price tables,
// the open trade session, and the company dashboard. Pure over world and content.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, tr } from '../../core/text';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import type { World } from '../../core/world';
import { countItem, holdingOf, itemDef } from '../inventory';
import { goodDef, isIllegal, isMarketOpen, marketDef, quote, targetStock } from './market';
import type { CompetitorAction, PriceQuote, RecipeDef } from './types';

function recipeUnlockedFlags(world: World, recipe: RecipeDef): boolean {
  return !recipe.requiresFlags?.some((f) => !world.meta.flags[f]);
}

/** Market row condition: scarce below half the target stock, else stable or volatile. */
export type MarketCondition = 'stable' | 'volatile' | 'scarce';

export interface MarketRow {
  itemId: string;
  name: string;
  stock: number;
  /** what the player pays per unit */
  buy: number;
  /** what the merchant pays per unit */
  sell: number;
  mult: number;
  state: MarketCondition;
  /** display label of `state` */
  stateLabel: KeyText;
  legal: boolean;
}

export interface MarketView {
  id: string;
  name: string;
  open: boolean;
  taxRate: number;
  rows: MarketRow[];
}

export function marketView(world: World, content: ContentMap, marketId: string): MarketView | null {
  const market = marketDef(content, marketId);
  const state = world.slices.economy.markets[marketId];
  if (!market || !state) return null;
  const config = content.economy_config;
  const rows: MarketRow[] = [];
  for (const g of market.goods) {
    const s = state.goods[g.itemId];
    const item = itemDef(content, g.itemId);
    if (!s || !item) continue;
    const buy = quote(world, content, marketId, g.itemId, 'buy', 1)?.unit ?? 0;
    const sell = quote(world, content, marketId, g.itemId, 'sell', 1)?.unit ?? 0;
    const T = targetStock(config, g);
    const scarce = s.stock < T * 0.5;
    const cond: MarketCondition = scarce
      ? 'scarce'
      : s.mult >= 0.9 && s.mult <= 1.1
        ? 'stable'
        : 'volatile';
    rows.push({
      itemId: g.itemId,
      name: item.name,
      stock: Math.floor(s.stock),
      buy,
      sell,
      mult: s.mult,
      state: cond,
      stateLabel: tr(`sys.economy.market_state.${cond}`),
      legal: !isIllegal(config, item),
    });
  }
  return {
    id: market.id,
    name: market.name,
    open: isMarketOpen(world, market),
    taxRate: market.taxRate,
    rows,
  };
}

export function marketList(
  world: World,
  content: ContentMap,
): { id: string; name: string; open: boolean; region: string }[] {
  return content.markets.map((m) => ({
    id: m.id,
    name: m.name,
    open: isMarketOpen(world, m),
    region: m.region,
  }));
}

export interface TradeSessionView {
  npcId: string;
  marketId: string;
  marketName: string;
  money: number;
  /** goods the merchant sells */
  wares: MarketRow[];
  /** goods in the player's bag and what the merchant pays for them */
  bag: {
    itemId: string;
    name: string;
    count: number;
    sell: number;
    legal: boolean;
    reason?: KeyText;
  }[];
}

export function tradeSessionView(world: World, content: ContentMap): TradeSessionView | null {
  const s = world.slices.economy.session;
  if (!s) return null;
  const market = marketDef(content, s.marketId);
  const mv = marketView(world, content, s.marketId);
  if (!market || !mv) return null;
  const playerId = world.slices.world.playerId;
  const holding = holdingOf(world, playerId);
  const config = content.economy_config;
  const bag: TradeSessionView['bag'] = [];
  for (const [itemId, count] of Object.entries(holding.items).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const item = itemDef(content, itemId);
    if (!item || count <= 0) continue;
    const legal = !isIllegal(config, item);
    const q = legal ? quote(world, content, s.marketId, itemId, 'sell', 1) : null;
    bag.push({
      itemId,
      name: item.name,
      count,
      sell: q?.unit ?? 0,
      legal,
      reason: legal ? undefined : tr('sys.economy.trade.illegal_hint'),
    });
  }
  return {
    npcId: s.npcId,
    marketId: s.marketId,
    marketName: market.name,
    money: holding.money,
    wares: mv.rows.filter((r) => r.stock > 0 || goodDef(market, r.itemId)),
    bag,
  };
}

/** Itemised quote for a confirmation dialog (price decomposition, economy design 4.3). */
export function priceQuote(
  world: World,
  content: ContentMap,
  marketId: string,
  itemId: string,
  side: 'buy' | 'sell',
  qty: number,
): PriceQuote | null {
  return quote(world, content, marketId, itemId, side, qty);
}

export interface CompanyView {
  founded: boolean;
  name: string;
  funds: number;
  partnerShare: number;
  scale: number;
  revenue: number;
  stock: { itemId: string; name: string; count: number }[];
  recipes: {
    id: string;
    name: string;
    product: string;
    unlocked: boolean;
    inputs: Record<string, number>;
    days: number;
    imitated: boolean;
  }[];
  jobs: { id: string; recipeId: string; runs: number; daysLeft: number }[];
  caravans: {
    id: string;
    from: string;
    to: string;
    status: string;
    daysLeft: number;
    cargo: Record<string, number>;
    revenue: number;
  }[];
  competitor: CompetitorAction[];
  ledger: { day: number; delta: number; reason: string }[];
}

export function companyView(world: World, content: ContentMap): CompanyView {
  const config = content.economy_config;
  const c = world.slices.economy.company;
  const owner = config.company.ownerId;
  const holding = holdingOf(world, owner);
  const now = world.meta.tick;
  const left = (tick: number) =>
    Math.max(0, Math.round(((tick - now) / TICKS_PER_GAME_DAY) * 10) / 10);
  return {
    founded: c.founded,
    name: config.company.name,
    funds: holding.money,
    partnerShare: c.partnerShare,
    scale: c.scale,
    revenue: c.revenue,
    stock: Object.entries(holding.items)
      .filter(([, n]) => n > 0)
      .map(([itemId, count]) => ({
        itemId,
        name: itemDef(content, itemId)?.name ?? itemId,
        count,
      })),
    recipes: content.trade_recipes.map((r) => ({
      id: r.id,
      name: r.name,
      product: r.product,
      unlocked: recipeUnlockedFlags(world, r),
      inputs: r.inputs,
      days: r.days,
      imitated: !!world.slices.economy.competitor.imitating[r.product],
    })),
    jobs: c.jobs.map((j) => ({
      id: j.id,
      recipeId: j.recipeId,
      runs: j.runs,
      daysLeft: left(j.doneTick),
    })),
    caravans: c.caravans.map((k) => ({
      id: k.id,
      from: k.from,
      to: k.to,
      status: k.status,
      daysLeft: k.status === 'travel' ? left(k.arriveTick) : 0,
      cargo: k.cargo,
      revenue: k.revenue,
    })),
    competitor: world.slices.economy.competitor.actions.slice(-10),
    ledger: c.ledger.slice(-20),
  };
}

/** Count of an item the company holds (used by tests and the client). */
export function companyStock(world: World, content: ContentMap, itemId: string): number {
  return countItem(world, content.economy_config.company.ownerId, itemId);
}
