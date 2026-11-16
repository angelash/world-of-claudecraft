import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { pack as economyPack } from '../src/content/packs/economy';
import { type Engine, ok, type TextRef, tr, worldHash } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { t } from '../src/shared_ui/i18n';
import {
  buyFromMarket,
  companyView,
  marketPrice,
  marketView,
  priceQuote,
  sellToMarket,
  tradeSessionView,
} from '../src/systems/economy';
import { addItem, addMoney, countItem, holdingOf } from '../src/systems/inventory';

declare module '../src/core/contracts' {
  interface CommandMap {
    'econtest.grant': { ownerId: string; itemId?: string; count?: number; money?: number };
    'econtest.port': {
      side: 'buy' | 'sell';
      marketId: string;
      ownerId: string;
      itemId: string;
      qty: number;
    };
  }
}

const portResults: { ok: boolean; code?: string; reason?: TextRef; total?: number }[] = [];

/** Test-only helper: grants items and money, and calls the economy ports. */
const probe: GameSystem = {
  id: 'zz_econ_probe',
  order: 999,
  commands: {
    'econtest.grant'(ctx, d) {
      if (d.itemId) addItem(ctx, d.ownerId, d.itemId, d.count ?? 1, 'test');
      if (d.money) addMoney(ctx, d.ownerId, d.money, 'test');
      return ok();
    },
    'econtest.port'(ctx, d) {
      const fn = d.side === 'buy' ? buyFromMarket : sellToMarket;
      portResults.push(fn(ctx, d.marketId, d.ownerId, d.itemId, d.qty, 'test'));
      return ok();
    },
  },
};

const CORE = new Set(['modifiers', 'world', 'inventory', 'economy']);

/** A light game (kernel plus economy) so multi-day runs stay fast. */
function lightGame(seed = 7, content?: ContentMap): Engine {
  const systems = [...allSystems().filter((s) => CORE.has(s.id)), probe];
  return createGame({ seed, systems, content });
}

function lastResult(engine: Engine, kind: string) {
  const r = [...engine.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

function stepDays(engine: Engine, days: number): void {
  engine.step(Math.round(days * TICKS_PER_GAME_DAY));
}

const COMPANY = 'company:door';

describe('economy content', () => {
  it('validates goods, markets, recipes and routes', () => {
    const content = buildContent();
    expect(economyPack.validate?.(content)).toEqual([]);
    const ids = content.items.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(content.items.find((i) => i.id === 'grey_crystal')?.tags).toContain('illegal');
    for (const id of ['soap', 'glass_lens', 'double_entry_ledger']) {
      expect(content.items.find((i) => i.id === id)?.tags).toContain('earth');
    }
  });
});

describe('markets', () => {
  it('drifts prices once a day and applies registered price modifiers', () => {
    const engine = lightGame();
    const before = marketPrice(engine.world, engine.content, 'borderstone', 'grain');
    expect(before).toBeGreaterThan(0);
    engine.queue('modifier.register', {
      target: 'price',
      key: 'borderstone:iron_ingot',
      factor: 1.5,
      untilTick: 10 * TICKS_PER_GAME_DAY,
      source: 'merca',
      visibility: 'public',
      note: '梅尔卡·稀缺：边石镇铁价上涨',
    });
    const ingotBefore = marketPrice(
      engine.world,
      engine.content,
      'borderstone',
      'iron_ingot',
    ) as number;
    engine.step(1);
    const ingotAfter = marketPrice(
      engine.world,
      engine.content,
      'borderstone',
      'iron_ingot',
    ) as number;
    expect(ingotAfter / ingotBefore).toBeCloseTo(1.5, 1);
    const q = priceQuote(engine.world, engine.content, 'borderstone', 'iron_ingot', 'buy', 1);
    expect(q?.lines.some((l) => l.kind === 'modifier' && t(l.label).includes('梅尔卡'))).toBe(true);
    // the same item at another market is untouched
    const wb = marketPrice(engine.world, engine.content, 'wallenburg', 'iron_ingot') as number;
    expect(wb).toBeLessThan(ingotAfter);

    stepDays(engine, 1.2);
    expect(engine.world.recent.some((e) => e.kind === 'economy.prices_updated')).toBe(true);
    const view = marketView(engine.world, engine.content, 'borderstone');
    for (const row of view?.rows ?? []) expect(row.buy).toBeGreaterThanOrEqual(row.sell);
  });

  it('keeps the outpost market closed until the village is founded', () => {
    const engine = lightGame();
    expect(marketPrice(engine.world, engine.content, 'old_outpost', 'grain')).toBeNull();
    engine.queue('econtest.grant', { ownerId: 'player', itemId: 'grain', count: 5 });
    engine.queue('econtest.port', {
      side: 'sell',
      marketId: 'old_outpost',
      ownerId: 'player',
      itemId: 'grain',
      qty: 5,
    });
    engine.step(1);
    expect(portResults.at(-1)?.code).toBe('market_closed');
    engine.queue('flag.set', { key: 'a2_village_founded', value: true });
    engine.queue('econtest.port', {
      side: 'sell',
      marketId: 'old_outpost',
      ownerId: 'player',
      itemId: 'grain',
      qty: 5,
    });
    engine.step(1);
    expect(portResults.at(-1)?.ok).toBe(true);
    expect(countItem(engine.world, 'player', 'grain')).toBe(0);
  });

  it('refuses grey crystal on legal markets (D-040)', () => {
    const engine = lightGame();
    engine.queue('econtest.grant', { ownerId: 'player', itemId: 'grey_crystal', count: 3 });
    engine.queue('econtest.port', {
      side: 'sell',
      marketId: 'wallenburg',
      ownerId: 'player',
      itemId: 'grey_crystal',
      qty: 3,
    });
    engine.step(1);
    const res = portResults.at(-1);
    expect(res?.ok).toBe(false);
    expect(res?.code).toBe('illegal_goods');
    expect(res?.reason).toEqual(tr('sys.economy.reject.illegal_goods', { item: '灰晶' }));
    expect(countItem(engine.world, 'player', 'grey_crystal')).toBe(3);
  });
});

describe('trading with a merchant', () => {
  it('opens a trade from the conversation with Nera and settles buy and sell', () => {
    const engine = createGame({ seed: 11, systems: [...allSystems(), probe] });
    engine.step(2);
    const nera = Object.values(engine.world.slices.world.entities).find((e) => e.ref === 'nera');
    expect(nera, 'npc system should spawn nera').toBeDefined();
    if (!nera) return;
    engine.queue('world.teleport', { entityId: 'player', mapId: nera.mapId, x: nera.x, y: nera.y });
    engine.queue('econtest.grant', { ownerId: 'player', money: 5000 });
    engine.step(1);
    engine.queue('dialogue.talk', { npcId: nera.id });
    engine.step(1);
    expect(lastResult(engine, 'dialogue.talk')?.ok).toBe(true);
    const offered = engine.world.recent.find(
      (e) => e.kind === 'dialogue.options_offered' && e.data.system === 'economy',
    );
    const ids =
      offered?.kind === 'dialogue.options_offered' ? offered.data.options.map((o) => o.id) : [];
    expect(ids).toContain('trade');
    expect(ids).toContain('found_company');

    engine.queue('dialogue.choose', { optionId: 'economy:trade' });
    engine.step(1);
    const session = tradeSessionView(engine.world, engine.content);
    expect(session?.marketId).toBe('borderstone');

    const quote = priceQuote(engine.world, engine.content, 'borderstone', 'grain', 'buy', 10);
    const stockBefore = engine.world.slices.economy.markets.borderstone?.goods.grain?.stock ?? 0;
    const moneyBefore = holdingOf(engine.world, 'player').money;
    engine.queue('economy.buy', { itemId: 'grain', qty: 10 });
    engine.step(1);
    expect(lastResult(engine, 'economy.buy')?.ok).toBe(true);
    expect(countItem(engine.world, 'player', 'grain')).toBe(10);
    expect(holdingOf(engine.world, 'player').money).toBe(moneyBefore - (quote?.total ?? 0));
    expect(engine.world.slices.economy.markets.borderstone?.goods.grain?.stock).toBe(
      stockBefore - 10,
    );

    engine.queue('economy.sell', { itemId: 'grain', qty: 4 });
    engine.step(1);
    expect(lastResult(engine, 'economy.sell')?.ok).toBe(true);
    expect(countItem(engine.world, 'player', 'grain')).toBe(6);

    engine.queue('economy.buy', { itemId: 'grain', qty: 100000 });
    engine.step(1);
    const tooMuch = lastResult(engine, 'economy.buy');
    expect(tooMuch?.ok).toBe(false);
    expect(tooMuch?.code).toBe('no_stock');

    // founding the company from the same conversation
    engine.queue('dialogue.choose', { optionId: 'economy:found_company' });
    engine.step(1);
    expect(engine.world.meta.flags['econ.company_founded']).toBe(true);
    expect(engine.world.meta.flags['feature.company']).toBe(true);
    expect(holdingOf(engine.world, COMPANY).money).toBe(
      engine.content.economy_config.company.foundCost,
    );

    // walking away ends the trade session
    engine.queue('world.teleport', {
      entityId: 'player',
      mapId: nera.mapId,
      x: nera.x + 15,
      y: nera.y,
    });
    engine.step(1);
    engine.queue('economy.buy', { itemId: 'grain', qty: 1 });
    engine.step(1);
    expect(lastResult(engine, 'economy.buy')?.code).toBe('no_session');
  });

  it('rejects founding without the capital', () => {
    const engine = lightGame();
    engine.queue('economy.found_company', {});
    engine.step(1);
    const res = lastResult(engine, 'economy.found_company');
    expect(res?.ok).toBe(false);
    expect(res?.reason).toEqual(
      tr('sys.economy.reject.no_money.found', {
        cost: engine.content.economy_config.company.foundCost,
      }),
    );
    expect(engine.world.meta.flags['econ.company_founded']).toBeUndefined();
  });
});

describe('the Door Company', () => {
  function foundedGame(seed = 7, content?: ContentMap): Engine {
    const engine = lightGame(seed, content);
    engine.queue('econtest.grant', { ownerId: 'player', money: 100000 });
    engine.step(1);
    engine.queue('economy.found_company', {});
    engine.queue('economy.company_funds', { amount: 50000 });
    engine.step(1);
    expect(lastResult(engine, 'economy.company_funds')?.ok).toBe(true);
    return engine;
  }

  it('produces Earth goods, sells them, and the competitor imitates after the protection period', () => {
    const base = buildContent();
    const content: ContentMap = {
      ...base,
      trade_recipes: base.trade_recipes.map((r) =>
        r.id === 'soap' ? { ...r, imitationDays: 2 } : r,
      ),
    };
    const engine = foundedGame(7, content);
    engine.queue('economy.company_buy', { marketId: 'borderstone', itemId: 'tallow', qty: 4 });
    engine.queue('economy.company_buy', { marketId: 'borderstone', itemId: 'charcoal', qty: 2 });
    engine.queue('economy.company_buy', { marketId: 'borderstone', itemId: 'herb', qty: 2 });
    engine.step(1);
    engine.queue('economy.produce', { recipeId: 'soap', runs: 2 });
    engine.step(1);
    expect(lastResult(engine, 'economy.produce')?.ok).toBe(true);
    engine.queue('economy.produce', { recipeId: 'glass_lens', runs: 1 });
    engine.step(1);
    expect(lastResult(engine, 'economy.produce')?.code).toBe('locked');

    stepDays(engine, 2.1);
    expect(countItem(engine.world, COMPANY, 'soap')).toBe(6);
    const soapPrice = marketPrice(engine.world, engine.content, 'wallenburg', 'soap') as number;
    expect(soapPrice).toBeGreaterThan(40); // nobody else sells it yet: monopoly premium
    engine.queue('economy.company_sell', { marketId: 'wallenburg', itemId: 'soap', qty: 6 });
    engine.step(1);
    expect(lastResult(engine, 'economy.company_sell')?.ok).toBe(true);
    expect(engine.world.slices.economy.company.firstSale.soap?.marketId).toBe('wallenburg');

    stepDays(engine, 3);
    const actions = engine.world.slices.economy.competitor.actions;
    expect(actions.some((a) => a.kind === 'imitate' && a.itemId === 'soap')).toBe(true);
    const later = marketPrice(engine.world, engine.content, 'wallenburg', 'soap') as number;
    expect(later).toBeLessThan(soapPrice);
    expect(
      companyView(engine.world, engine.content).recipes.find((r) => r.id === 'soap')?.imitated,
    ).toBe(true);
  });

  it('sends a caravan that travels for days and sells at the destination', () => {
    const engine = foundedGame(21);
    engine.queue('economy.company_buy', { marketId: 'borderstone', itemId: 'wood', qty: 150 });
    engine.step(1);
    expect(countItem(engine.world, COMPANY, 'wood')).toBe(150);
    engine.queue('economy.caravan_send', {
      from: 'borderstone',
      to: 'wallenburg',
      cargo: { wood: 150 },
      guards: 2,
    });
    engine.step(1);
    expect(lastResult(engine, 'economy.caravan_send')?.ok).toBe(true);
    const caravan = engine.world.slices.economy.company.caravans[0];
    expect(caravan?.carts).toBe(2);
    expect(countItem(engine.world, COMPANY, 'wood')).toBe(0);

    stepDays(engine, 2);
    expect(engine.world.slices.economy.company.caravans[0]?.status).toBe('travel');
    stepDays(engine, 1.2);
    const done = engine.world.slices.economy.company.caravans[0];
    expect(done?.status === 'arrived' || done?.status === 'lost').toBe(true);
    if (done?.status === 'arrived') {
      expect(done.revenue).toBeGreaterThan(0);
      expect(engine.world.recent.some((e) => e.kind === 'economy.caravan_arrived')).toBe(true);
    }

    engine.queue('economy.caravan_send', {
      from: 'borderstone',
      to: 'nowhere',
      cargo: {},
      guards: 0,
    });
    engine.step(1);
    expect(lastResult(engine, 'economy.caravan_send')?.code).toBe('no_route');
  });

  it('undercuts a company that floods a staple market', () => {
    const engine = foundedGame(5);
    engine.queue('econtest.grant', { ownerId: COMPANY, itemId: 'grain', count: 900 });
    engine.step(1);
    engine.queue('economy.company_sell', { marketId: 'borderstone', itemId: 'grain', qty: 300 });
    engine.step(1);
    stepDays(engine, 4);
    const kinds = engine.world.slices.economy.competitor.actions.map((a) => a.kind);
    expect(kinds).toContain('undercut');
  });
});

describe('determinism', () => {
  it('produces the same economy for the same seed and inputs', () => {
    const run = () => {
      const engine = lightGame(99);
      engine.queue('econtest.grant', { ownerId: 'player', money: 20000 });
      engine.step(1);
      engine.queue('economy.found_company', {});
      engine.queue('economy.company_buy', { marketId: 'borderstone', itemId: 'wood', qty: 50 });
      engine.step(2);
      engine.queue('economy.caravan_send', {
        from: 'borderstone',
        to: 'old_outpost',
        cargo: { wood: 50 },
        guards: 0,
      });
      engine.step(TICKS_PER_GAME_HOUR);
      stepDays(engine, 2);
      return engine;
    };
    const a = run();
    const b = run();
    expect(JSON.stringify(a.world.slices.economy)).toBe(JSON.stringify(b.world.slices.economy));
    expect(worldHash(a.world)).toBe(worldHash(b.world));
  });
});
