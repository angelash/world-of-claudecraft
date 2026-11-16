// Economy system: markets with daily supply-demand drift and registered price modifiers,
// trading with merchants through the dialogue menu, the Door Company (founded with Nera)
// with production and caravans, and the rule-driven competitor. Phase 50
// (architecture.md 4.6). Other systems trade through ./ports.

import { ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { GameSystem, SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt } from '../../core/time';
import { addMoney } from '../inventory';
import { getEntity } from '../world';
import {
  canFoundCompany,
  companyFunds,
  companyTrade,
  companyTransfer,
  emptyCompany,
  foundCompany,
  rollCaravanRisks,
  sendCaravan,
  settleCaravans,
  settleProduction,
  startProduction,
  updateScale,
} from './company';
import { runCompetitor } from './competitor';
import { driftMarket, initialMarketState, isMarketOpen } from './market';
import { closeTrade, merchantMarket, openTrade, tradeCommand } from './trade';
import './types';

export * from './market';
export * from './ports';
export * from './queries';
export * from './types';

const SYSTEM = 'economy';

function say(ctx: SystemContext, npcId: string, text: TextParam): void {
  const npc = getEntity(ctx.world, npcId);
  ctx.emit('dialogue.line', {
    speakerId: npcId,
    speakerName: npc?.name ?? tr('sys.economy.name.merchant'),
    text,
    listenerId: ctx.world.slices.world.playerId,
    kind: 'say',
  });
}

function runDay(ctx: SystemContext, dayIndex: number): void {
  const slice = ctx.world.slices.economy;
  const config = ctx.content.economy_config;
  slice.day = dayIndex;
  const rng = ctx.rng('economy.market');
  for (const market of ctx.content.markets) {
    let state = slice.markets[market.id];
    if (!state) {
      state = initialMarketState(ctx.content, market, config);
      slice.markets[market.id] = state;
    }
    if (isMarketOpen(ctx.world, market)) driftMarket(ctx.content, market, state, config, rng);
  }
  rollCaravanRisks(ctx);
  runCompetitor(ctx, dayIndex);
  updateScale(ctx);
  ctx.emit('economy.prices_updated', { day: dayIndex });
}

export const system: GameSystem = {
  id: SYSTEM,
  order: 50,

  init(ctx) {
    const config = ctx.content.economy_config;
    const markets: Record<string, ReturnType<typeof initialMarketState>> = {};
    for (const m of ctx.content.markets ?? [])
      markets[m.id] = initialMarketState(ctx.content, m, config);
    ctx.world.slices.economy = {
      markets,
      session: null,
      company: emptyCompany(),
      competitor: { imitating: {}, cooldown: {}, offered: false, actions: [] },
      day: calendarAt(ctx.tick).dayIndex,
    };
    if (config) addMoney(ctx, config.competitor.ownerId, config.competitor.startFunds, 'opening');
  },

  on: {
    'world.day'(ctx, e) {
      runDay(ctx, e.data.dayIndex);
    },
    'world.hour'(ctx) {
      settleProduction(ctx);
      settleCaravans(ctx);
    },
    'world.map_changed'(ctx, e) {
      if (e.data.id === ctx.world.slices.world.playerId) closeTrade(ctx);
    },
    'player.talked'(ctx, e) {
      const npc = getEntity(ctx.world, e.data.npcId);
      const ref = e.data.npcRef ?? npc?.ref;
      const options: { id: string; label: TextParam; hint?: TextParam }[] = [];
      const market = merchantMarket(ctx, npc, ref);
      if (market && isMarketOpen(ctx.world, market)) {
        options.push({
          id: 'trade',
          label: tr('sys.economy.option.trade'),
          hint: tr('sys.economy.option.trade_hint', { market: contentText('markets', market) }),
        });
      }
      const config = ctx.content.economy_config;
      if (ref === config.company.partnerNpc) {
        if (!ctx.world.slices.economy.company.founded) {
          if (!config.company.requiresFlags?.some((f) => !ctx.flag(f))) {
            options.push({
              id: 'found_company',
              label: tr('sys.economy.option.found_company'),
              hint: tr('sys.economy.option.found_company_hint', {
                cost: config.company.foundCost,
              }),
            });
          }
        } else {
          options.push({ id: 'company_status', label: tr('sys.economy.option.company_status') });
        }
      }
      if (options.length > 0) {
        ctx.emit('dialogue.options_offered', { npcId: e.data.npcId, system: SYSTEM, options });
      }
    },
    'dialogue.option_chosen'(ctx, e) {
      if (e.data.system !== SYSTEM) return;
      const npcId = e.data.npcId;
      if (e.data.optionId === 'trade') {
        const res = openTrade(ctx, npcId);
        if (!res.ok) say(ctx, npcId, res.reason);
      } else if (e.data.optionId === 'found_company') {
        const check = canFoundCompany(ctx);
        if (!check.ok) {
          say(ctx, npcId, tr('sys.economy.say.not_yet', { reason: check.reason }));
          return;
        }
        foundCompany(ctx);
        say(ctx, npcId, tr('sys.economy.say.founded'));
      } else if (e.data.optionId === 'company_status') {
        const c = ctx.world.slices.economy.company;
        const travelling = c.caravans.filter((k) => k.status === 'travel').length;
        say(
          ctx,
          npcId,
          tr('sys.economy.say.company_status', {
            revenue: c.revenue,
            caravans: travelling,
            jobs: c.jobs.length,
          }),
        );
      }
    },
  },

  commands: {
    'economy.buy'(ctx, d) {
      return tradeCommand(ctx, 'buy', d.itemId, d.qty, d.ownerId);
    },
    'economy.sell'(ctx, d) {
      return tradeCommand(ctx, 'sell', d.itemId, d.qty, d.ownerId);
    },
    'economy.close_trade'(ctx) {
      if (!ctx.world.slices.economy.session)
        return reject('no_session', tr('sys.economy.reject.no_session.close'));
      closeTrade(ctx);
      return ok();
    },
    'economy.found_company'(ctx) {
      return foundCompany(ctx);
    },
    'economy.company_funds'(ctx, d) {
      return companyFunds(ctx, d.amount);
    },
    'economy.company_transfer'(ctx, d) {
      return companyTransfer(ctx, d.itemId, d.qty, d.to);
    },
    'economy.company_buy'(ctx, d) {
      return companyTrade(ctx, 'buy', d.marketId, d.itemId, d.qty);
    },
    'economy.company_sell'(ctx, d) {
      return companyTrade(ctx, 'sell', d.marketId, d.itemId, d.qty);
    },
    'economy.produce'(ctx, d) {
      return startProduction(ctx, d.recipeId, d.runs);
    },
    'economy.caravan_send'(ctx, d) {
      return sendCaravan(ctx, d.from, d.to, d.cargo ?? {}, d.guards ?? 0);
    },
  },
};
