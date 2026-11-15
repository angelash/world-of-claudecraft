// Cross-system economy ports: market valuation and settled trades for any inventory
// owner (the player, the company, a settlement treasury). City officials sell surplus
// and buy food through these; the economy's own commands use the same path, so every
// trade obeys stock, legality, tax and the price decomposition.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import {
  addItem,
  addMoney,
  countItem,
  holdingOf,
  itemDef,
  removeItem,
  spendMoney,
} from '../inventory';
import { goodDef, isIllegal, isMarketOpen, marketDef, midPrice, quote } from './market';
import type { TradeResult } from './types';

/** Mid unit price in copper after modifiers; null when not traded or the market is closed. */
export function marketPrice(
  world: World,
  content: ContentMap,
  marketId: string,
  itemId: string,
): number | null {
  return midPrice(world, content, marketId, itemId);
}

export function sellToMarket(
  ctx: SystemContext,
  marketId: string,
  sellerId: string,
  itemId: string,
  qty: number,
  reason: string,
): TradeResult {
  return settleTrade(ctx, marketId, sellerId, itemId, qty, 'sell', reason);
}

export function buyFromMarket(
  ctx: SystemContext,
  marketId: string,
  buyerId: string,
  itemId: string,
  qty: number,
  reason: string,
): TradeResult {
  return settleTrade(ctx, marketId, buyerId, itemId, qty, 'buy', reason);
}

export function settleTrade(
  ctx: SystemContext,
  marketId: string,
  ownerId: string,
  itemId: string,
  qty: number,
  side: 'buy' | 'sell',
  reason: string,
): TradeResult {
  const content = ctx.content;
  const market = marketDef(content, marketId);
  if (!market) return fail('no_market', '没有这个市场');
  if (!isMarketOpen(ctx.world, market))
    return fail('market_closed', `${market.name}的市场还没有开张`);
  const item = itemDef(content, itemId);
  if (!item) return fail('no_item', '没有这种货物');
  if (!Number.isInteger(qty) || qty <= 0) return fail('bad_qty', '数量不对');
  if (side === 'sell' && isIllegal(content.economy_config, item)) {
    return fail('illegal_goods', `${item.name}未经持证工坊净炼，合法市场不收`);
  }
  if (side === 'sell' && item.tags?.includes('no_sell')) {
    return fail('not_for_sale', `${item.name}不能卖`);
  }
  const q = quote(ctx.world, content, marketId, itemId, side, qty);
  if (!q) return fail('not_traded', `${market.name}不卖${item.name}`);
  const state = ctx.world.slices.economy.markets[marketId];
  const listed = !!goodDef(market, itemId) && !!state?.goods[itemId];
  if (side === 'buy') {
    const stock = state?.goods[itemId]?.stock ?? 0;
    if (Math.floor(stock) < qty) {
      return fail('no_stock', `${market.name}的${item.name}只剩 ${Math.floor(stock)} 份`);
    }
    if (holdingOf(ctx.world, ownerId).money < q.total) return fail('no_money', '钱不够');
    spendMoney(ctx, ownerId, q.total, reason);
    addItem(ctx, ownerId, itemId, qty, reason);
    if (state?.goods[itemId]) state.goods[itemId].stock -= qty;
  } else {
    if (q.unit <= 0) return fail('worthless', `商人不收${item.name}`);
    if (countItem(ctx.world, ownerId, itemId) < qty) return fail('missing', '数量不够');
    removeItem(ctx, ownerId, itemId, qty, reason);
    addMoney(ctx, ownerId, q.total, reason);
    if (listed && state?.goods[itemId]) {
      state.goods[itemId].stock += qty;
      const days = state.sales[itemId] ?? [0];
      days[days.length - 1] = (days[days.length - 1] ?? 0) + qty;
      state.sales[itemId] = days;
    }
  }
  if (state) {
    const tax = q.total - q.total / (side === 'buy' ? 1 + market.taxRate : 1 - market.taxRate);
    state.taxCollected += Math.abs(Math.round(tax));
  }
  ctx.emit('economy.traded', { marketId, ownerId, itemId, qty, side, total: q.total });
  return { ok: true, total: q.total };
}

function fail(code: string, reason: string): TradeResult {
  return { ok: false, code, reason };
}
