// Cross-system economy ports: market valuation and settled trades for any inventory
// owner (the player, the company, a settlement treasury). City officials sell surplus
// and buy food through these; the economy's own commands use the same path, so every
// trade obeys stock, legality, tax and the price decomposition.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { type KeyText, tr } from '../../core/text';
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
  if (!market) return fail('no_market', tr('sys.economy.reject.no_market'));
  if (!isMarketOpen(ctx.world, market))
    return fail(
      'market_closed',
      tr('sys.economy.reject.market_closed.port', { market: market.name }),
    );
  const item = itemDef(content, itemId);
  if (!item) return fail('no_item', tr('sys.economy.reject.no_item'));
  if (!Number.isInteger(qty) || qty <= 0)
    return fail('bad_qty', tr('sys.economy.reject.bad_qty.count'));
  if (side === 'sell' && isIllegal(content.economy_config, item)) {
    return fail('illegal_goods', tr('sys.economy.reject.illegal_goods', { item: item.name }));
  }
  if (side === 'sell' && item.tags?.includes('no_sell')) {
    return fail('not_for_sale', tr('sys.economy.reject.not_for_sale', { item: item.name }));
  }
  const q = quote(ctx.world, content, marketId, itemId, side, qty);
  if (!q)
    return fail(
      'not_traded',
      tr('sys.economy.reject.not_traded', { market: market.name, item: item.name }),
    );
  const state = ctx.world.slices.economy.markets[marketId];
  const listed = !!goodDef(market, itemId) && !!state?.goods[itemId];
  if (side === 'buy') {
    const stock = state?.goods[itemId]?.stock ?? 0;
    if (Math.floor(stock) < qty) {
      return fail(
        'no_stock',
        tr('sys.economy.reject.no_stock', {
          market: market.name,
          item: item.name,
          n: Math.floor(stock),
        }),
      );
    }
    if (holdingOf(ctx.world, ownerId).money < q.total)
      return fail('no_money', tr('sys.economy.reject.no_money.short'));
    spendMoney(ctx, ownerId, q.total, reason);
    addItem(ctx, ownerId, itemId, qty, reason);
    if (state?.goods[itemId]) state.goods[itemId].stock -= qty;
  } else {
    if (q.unit <= 0)
      return fail('worthless', tr('sys.economy.reject.worthless', { item: item.name }));
    if (countItem(ctx.world, ownerId, itemId) < qty)
      return fail('missing', tr('sys.economy.reject.missing.count'));
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

function fail(code: string, reason: KeyText): TradeResult {
  return { ok: false, code, reason };
}
