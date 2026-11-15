// Market model: opening stock, the daily supply-demand multiplier with smoothing, and
// price quotes with an explicit decomposition (base, supply and demand, registered
// modifiers, spread, tax). Pure functions over world and content; the daily drift is
// the only writer and takes its own random stream. Economy design 4.1 to 4.3.

import type { ContentMap } from '../../core/contracts';
import type { Rng } from '../../core/rng';
import type { World } from '../../core/world';
import { type ItemDef, itemDef } from '../inventory';
import { activeModifiers } from '../modifiers';
import type {
  EconomyConfig,
  MarketDef,
  MarketGoodDef,
  MarketState,
  PriceQuote,
  QuoteLine,
} from './types';

export function marketDef(content: ContentMap, marketId: string): MarketDef | undefined {
  return content.markets.find((m) => m.id === marketId);
}

export function goodDef(market: MarketDef, itemId: string): MarketGoodDef | undefined {
  return market.goods.find((g) => g.itemId === itemId);
}

export function isMarketOpen(world: World, market: MarketDef): boolean {
  return !market.requiresFlags?.some((f) => !world.meta.flags[f]);
}

export function isIllegal(config: EconomyConfig, item: ItemDef | undefined): boolean {
  if (!item) return false;
  return config.illegalItems.includes(item.id) || !!item.tags?.includes('illegal');
}

export type ItemClass = 'staple' | 'general' | 'luxury';

export function itemClass(item: ItemDef | undefined): ItemClass {
  if (item?.tags?.includes('staple')) return 'staple';
  if (item?.tags?.includes('luxury')) return 'luxury';
  return 'general';
}

export function targetStock(config: EconomyConfig, good: MarketGoodDef): number {
  return good.demand * config.targetDays;
}

/** Supply-demand multiplier the market drifts toward: clamp((T / stock)^k, lo, hi). */
export function targetMultiplier(
  config: EconomyConfig,
  good: MarketGoodDef,
  cls: ItemClass,
  stock: number,
): number {
  const [lo, hi] = cls === 'staple' ? config.bounds.staple : config.bounds.other;
  const T = targetStock(config, good);
  if (T <= 0) return lo;
  const raw = (T / Math.max(stock, 1)) ** config.k[cls];
  return Math.min(hi, Math.max(lo, raw));
}

export function initialMarketState(
  content: ContentMap,
  market: MarketDef,
  config: EconomyConfig,
): MarketState {
  const state: MarketState = { goods: {}, sales: {}, taxCollected: 0 };
  for (const g of market.goods) {
    const stock = Math.round(g.demand * (g.stockDays ?? config.targetDays));
    const cls = itemClass(itemDef(content, g.itemId));
    state.goods[g.itemId] = { stock, mult: round3(targetMultiplier(config, g, cls, stock)) };
  }
  return state;
}

/** One game day of local production, consumption and multiplier smoothing. */
export function driftMarket(
  content: ContentMap,
  market: MarketDef,
  state: MarketState,
  config: EconomyConfig,
  rng: Rng,
): void {
  for (const g of market.goods) {
    const s = state.goods[g.itemId];
    if (!s) continue;
    const produced = g.supply * rng.range(0.9, 1.1);
    const consumed = g.demand * rng.range(0.9, 1.1);
    const cap = Math.max(10, targetStock(config, g) * 3);
    s.stock = Math.round(Math.min(cap, Math.max(0, s.stock + produced - consumed)) * 10) / 10;
    const cls = itemClass(itemDef(content, g.itemId));
    const target = targetMultiplier(config, g, cls, s.stock);
    const step = config.maxDailyChange;
    s.mult = round3(Math.min(s.mult * (1 + step), Math.max(s.mult * (1 - step), target)));
  }
  for (const [itemId, days] of Object.entries(state.sales)) {
    days.push(0);
    while (days.length > 7) days.shift();
    if (days.every((n) => n === 0)) delete state.sales[itemId];
  }
}

/** Combined registered price modifiers for an item at a market (D-013), clamped. */
export function priceModifierLines(
  world: World,
  config: EconomyConfig,
  marketId: string,
  itemId: string,
): { factor: number; add: number; lines: QuoteLine[] } {
  const lines: QuoteLine[] = [];
  let factor = 1;
  let add = 0;
  const seen = new Set<string>();
  const mods = [
    ...activeModifiers(world, 'price', itemId),
    ...activeModifiers(world, 'price', `${marketId}:${itemId}`).filter((m) => m.key !== '*'),
    ...activeModifiers(world, 'price', marketId).filter((m) => m.key !== '*'),
  ];
  for (const m of mods) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    factor *= m.factor ?? 1;
    add += m.add ?? 0;
    const label = m.visibility === 'public' ? m.note : '异常波动（来源未查明）';
    lines.push({ kind: 'modifier', label, value: m.factor ?? 1, modifierId: m.id });
  }
  const [lo, hi] = config.modifierBounds;
  return { factor: Math.min(hi, Math.max(lo, factor)), add, lines };
}

/**
 * Unit price quote. Buy prices round up and sell prices round down, so a market never
 * buys back for more than it sells (arbitrage audit, economy design 5.5).
 */
export function quote(
  world: World,
  content: ContentMap,
  marketId: string,
  itemId: string,
  side: 'buy' | 'sell',
  qty: number,
): PriceQuote | null {
  const config = content.economy_config;
  const market = marketDef(content, marketId);
  const item = itemDef(content, itemId);
  if (!market || !item) return null;
  const state = world.slices.economy.markets[marketId];
  const good = goodDef(market, itemId);
  const legal = !isIllegal(config, item);
  const lines: QuoteLine[] = [];
  let mid: number;
  if (good && state?.goods[itemId]) {
    const base = item.value * (good.priceMult ?? 1);
    lines.push({ kind: 'base', label: '基准价', value: base });
    const mult = state.goods[itemId].mult;
    lines.push({ kind: 'supply', label: supplyLabel(mult), value: mult });
    const mod = priceModifierLines(world, config, marketId, itemId);
    lines.push(...mod.lines);
    mid = base * mult * mod.factor + mod.add;
  } else {
    // unlisted goods: merchants only buy them back at a fixed share of their value
    if (side === 'buy') return null;
    mid = item.value * market.buybackRate;
    lines.push({ kind: 'base', label: '收购价', value: mid });
  }
  const spread = side === 'buy' ? 1 + market.spread / 2 : 1 - market.spread / 2;
  lines.push({ kind: 'spread', label: side === 'buy' ? '商人加价' : '商人压价', value: spread });
  const tax = side === 'buy' ? 1 + market.taxRate : 1 - market.taxRate;
  lines.push({ kind: 'tax', label: `交易税 ${Math.round(market.taxRate * 100)}%`, value: tax });
  const raw = mid * spread * tax;
  const unit = side === 'buy' ? Math.max(1, Math.ceil(raw)) : Math.max(0, Math.floor(raw));
  return { marketId, itemId, side, qty, unit, total: unit * qty, lines, legal };
}

/** Mid price before spread and tax (what other systems use for valuation). */
export function midPrice(
  world: World,
  content: ContentMap,
  marketId: string,
  itemId: string,
): number | null {
  const config = content.economy_config;
  const market = marketDef(content, marketId);
  const item = itemDef(content, itemId);
  const state = world.slices.economy.markets[marketId];
  if (!market || !item || !state || !isMarketOpen(world, market)) return null;
  const good = goodDef(market, itemId);
  const s = state.goods[itemId];
  if (!good || !s) return null;
  const mod = priceModifierLines(world, config, marketId, itemId);
  return Math.max(
    0,
    Math.round(item.value * (good.priceMult ?? 1) * s.mult * mod.factor + mod.add),
  );
}

function supplyLabel(mult: number): string {
  if (mult >= 1.3) return '供需：紧缺';
  if (mult >= 1.1) return '供需：偏紧';
  if (mult <= 0.75) return '供需：积压';
  if (mult <= 0.9) return '供需：宽松';
  return '供需：平稳';
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
