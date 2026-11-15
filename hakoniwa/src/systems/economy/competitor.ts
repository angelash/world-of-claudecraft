// The rule-driven competitor (金冠商行, represented by 西里尔 in act 2). It plays by the
// same market rules, never edits prices directly: it imitates Earth-knowledge goods after
// their imitation period, dumps stock to undercut a company that dominates a staple,
// hoards scarce staples, and makes a buyout offer once the company grows. Economy design
// 3.6 ("竞争者守同一规则").

import type { SystemContext } from '../../core/system';
import { addItem, itemDef, spendMoney } from '../inventory';
import { goodDef, isMarketOpen, itemClass, targetStock } from './market';
import type { CompetitorAction } from './types';

function act(ctx: SystemContext, a: CompetitorAction): void {
  const comp = ctx.world.slices.economy.competitor;
  comp.actions.push(a);
  if (comp.actions.length > 40) comp.actions.splice(0, comp.actions.length - 40);
  ctx.emit('economy.competitor_action', {
    ...a,
    competitorId: ctx.content.economy_config.competitor.id,
  });
}

export function runCompetitor(ctx: SystemContext, day: number): void {
  const slice = ctx.world.slices.economy;
  const config = ctx.content.economy_config;
  const rules = config.competitor;
  const comp = slice.competitor;
  const company = slice.company;
  const rng = ctx.rng('economy.competitor');

  // 1. imitation of Earth-knowledge goods once their protection period has passed
  for (const recipe of ctx.content.trade_recipes) {
    const first = company.firstSale[recipe.product];
    if (!first || comp.imitating[recipe.product]) continue;
    if (day - first.day < recipe.imitationDays) continue;
    comp.imitating[recipe.product] = true;
    const name = itemDef(ctx.content, recipe.product)?.name ?? recipe.product;
    act(ctx, {
      day,
      kind: 'imitate',
      marketId: first.marketId,
      itemId: recipe.product,
      note: `金冠商行开始仿制${name}`,
    });
  }
  for (const market of ctx.content.markets) {
    const state = slice.markets[market.id];
    if (!state || !isMarketOpen(ctx.world, market)) continue;
    for (const itemId of Object.keys(comp.imitating)) {
      const good = goodDef(market, itemId);
      const s = state.goods[itemId];
      if (!good || !s) continue;
      // imitators top the market up toward its target stock, so the premium decays
      const T = targetStock(config, good);
      s.stock += Math.max(0, Math.round(Math.min(T - s.stock, T * rules.imitationShare)));
    }

    // 2. undercut a staple the company or player dominates; 3. hoard scarce staples
    for (const good of market.goods) {
      const s = state.goods[good.itemId];
      if (!s) continue;
      const cls = itemClass(itemDef(ctx.content, good.itemId));
      if (cls !== 'staple') continue;
      const key = `${market.id}:${good.itemId}`;
      if ((comp.cooldown[key] ?? -1) > day) continue;
      const weekly = (state.sales[good.itemId] ?? []).reduce((a, b) => a + b, 0);
      const T = targetStock(config, good);
      const name = itemDef(ctx.content, good.itemId)?.name ?? good.itemId;
      if (company.founded && weekly > good.demand * 7 * rules.undercutTrigger && rng.chance(0.6)) {
        s.stock += Math.round(T * rules.undercutShare);
        comp.cooldown[key] = day + rules.cooldownDays;
        act(ctx, {
          day,
          kind: 'undercut',
          marketId: market.id,
          itemId: good.itemId,
          note: `金冠商行在${market.name}抛售${name}压价`,
        });
      } else if (s.stock < T * rules.hoardBelow && rng.chance(0.3)) {
        const qty = Math.floor(s.stock * rules.hoardShare);
        const cost = qty * (itemDef(ctx.content, good.itemId)?.value ?? 0);
        if (qty <= 0 || !spendMoney(ctx, rules.ownerId, cost, 'hoard')) continue;
        addItem(ctx, rules.ownerId, good.itemId, qty, 'hoard');
        s.stock -= qty;
        comp.cooldown[key] = day + rules.cooldownDays;
        act(ctx, {
          day,
          kind: 'hoard',
          marketId: market.id,
          itemId: good.itemId,
          note: `金冠商行在${market.name}囤积${name}`,
        });
      }
    }
  }

  // 4. a buyout offer once the company has grown (A2-S04)
  if (company.founded && !comp.offered && company.scale >= rules.offerAtScale) {
    comp.offered = true;
    act(ctx, {
      day,
      kind: 'offer',
      marketId: 'wallenburg',
      note: '西里尔带着金契上门，报价收购门扉商会三成股份',
    });
  }
}
