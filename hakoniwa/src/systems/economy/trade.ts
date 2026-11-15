// Trading with merchants: the "交易" option offered on player.talked, the trade session
// (one at a time, bound to the merchant's market), and the buy and sell commands. The
// session closes when the player walks away or changes map.

import { ok, reject } from '../../core';
import type { CommandResult } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { distance, type Entity, getEntity, playerEntity } from '../world';
import { isMarketOpen } from './market';
import { settleTrade } from './ports';
import type { MarketDef, TradeSession } from './types';

const TRADE_RANGE = 6;

/** The market a merchant entity trades at, or undefined when it is not a merchant. */
export function merchantMarket(
  ctx: SystemContext,
  npc: Entity | undefined,
  npcRef?: string,
): MarketDef | undefined {
  if (!npc) return undefined;
  const ref = npcRef ?? npc.ref;
  return ctx.content.markets.find(
    (m) =>
      m.mapIds.includes(npc.mapId) &&
      (npc.tags.includes('merchant') || (!!ref && !!m.merchantRefs?.includes(ref))),
  );
}

export function openTrade(ctx: SystemContext, npcId: string, npcRef?: string): CommandResult {
  const npc = getEntity(ctx.world, npcId);
  const market = merchantMarket(ctx, npc, npcRef);
  if (!npc || !market) return reject('not_merchant', '对方不做买卖');
  if (!isMarketOpen(ctx.world, market)) return reject('market_closed', `${market.name}还没有集市`);
  const slice = ctx.world.slices.economy;
  slice.session = { npcId, npcRef: npcRef ?? npc.ref, marketId: market.id, openedTick: ctx.tick };
  ctx.emit('economy.trade_opened', { npcId, marketId: market.id });
  ctx.emit('dialogue.line', {
    speakerId: npc.id,
    speakerName: npc.name,
    text: '要看看货吗？价钱都写在板子上。',
    listenerId: ctx.world.slices.world.playerId,
    kind: 'say',
  });
  return ok();
}

export function closeTrade(ctx: SystemContext): void {
  const slice = ctx.world.slices.economy;
  const s = slice.session;
  if (!s) return;
  slice.session = null;
  ctx.emit('economy.trade_closed', { npcId: s.npcId, marketId: s.marketId });
}

/** The open session when the player is still within reach of the merchant. */
export function liveSession(ctx: SystemContext): TradeSession | null {
  const s = ctx.world.slices.economy.session;
  if (!s) return null;
  const npc = getEntity(ctx.world, s.npcId);
  const player = playerEntity(ctx.world);
  if (
    !npc ||
    !player ||
    !npc.alive ||
    npc.mapId !== player.mapId ||
    distance(npc, player) > TRADE_RANGE
  ) {
    closeTrade(ctx);
    return null;
  }
  return s;
}

export function tradeCommand(
  ctx: SystemContext,
  side: 'buy' | 'sell',
  itemId: string,
  qty: number,
  ownerId?: string,
): CommandResult {
  const s = liveSession(ctx);
  if (!s) return reject('no_session', '现在没有在和商人交易');
  const owner = ownerId ?? ctx.world.slices.world.playerId;
  const config = ctx.content.economy_config;
  const companyOk = owner === config.company.ownerId && ctx.world.slices.economy.company.founded;
  if (owner !== ctx.world.slices.world.playerId && !companyOk) {
    return reject('bad_owner', '只能替自己或自己的商会交易');
  }
  const res = settleTrade(
    ctx,
    s.marketId,
    owner,
    itemId,
    qty,
    side,
    side === 'buy' ? 'buy' : 'sell',
  );
  return res.ok ? ok() : reject(res.code, res.reason);
}
