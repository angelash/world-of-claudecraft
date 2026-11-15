// Domain play of the autoplayer: battles (warfare), the settlement (city), the trading
// company (economy) and the continent (strategy). Same rule as the rest of the bot:
// read the system's public view, answer with player commands. A settlement grows by
// itself once it has a stove, houses, food and officials, so the bot sets it up, hands
// it to its officials (autonomy, D-011) and lets days pass.

import { TICKS_PER_GAME_HOUR } from '../../core/time';
import {
  findSpot,
  officialCandidates,
  type SettlementView,
  settlementView,
} from '../../systems/city';
import { ALL_DOMAINS, siteByRole } from '../../systems/city/common';
import type { CityFoodDef, Domain, SiteDef } from '../../systems/city/types';
import { holdingOf } from '../../systems/inventory';
import { battleView } from '../../systems/warfare';
import { mapById } from '../../systems/world';
import { keptItems, sellable } from './goods';
import { locationPoint } from './nav';
import type { Autoplayer } from './player';
import { type PlanStep, ROUTES } from './routes';
import { WarCommander } from './war';

/** The settlement plans of the route table (data/autoplay/routes.json). */
const PLAN = ROUTES.settlement;

/** The bot's settlement: the village core site (data/city/sites.json roles). */
function homeSite(bot: Autoplayer): SiteDef {
  const site = siteByRole(bot.content, 'village_core');
  if (!site) throw new Error('autoplay: no site holds the village_core role');
  return site;
}

export class DomainPlanner {
  private readonly war: WarCommander;
  /** last day the bot touched the settlement's build plan */
  private lastBuildDay = -1;
  private lastOfficeCheck = -1;
  private lastNationCheck = -1;
  private shortCache: { tick: number; value: Record<string, number> } | null = null;
  private readonly kept: Set<string>;
  /** the settlement site the bot tends (site id, its map and its stock owner) */
  private readonly home: SiteDef;
  /** the residents' foods with their feeding values (city_config.food) */
  private readonly foods: readonly CityFoodDef[];

  constructor(private readonly bot: Autoplayer) {
    this.war = new WarCommander(bot);
    this.kept = keptItems(bot.content);
    this.home = homeSite(bot);
    this.foods = bot.content.city_config.food;
  }

  /** Things that must happen before anything else (a battle in progress or waiting). */
  urgent(): number | null {
    const bot = this.bot;
    const battle = battleView(bot.world, bot.content);
    if (battle && !battle.outcome) return this.war.command(battle);
    const pending = bot.pendingWar();
    if (pending && !this.holdingBack(pending.id)) return this.war.begin(pending.id, pending.scale);
    return null;
  }

  /**
   * The last battle waits until the nation stands on its own (the true ending asks for
   * autonomy, and the fronts the player leaves to others hold by it): a ruler who wants
   * to let go first lets the institutions grow.
   */
  holdingBack(scenarioId: string): boolean {
    const bot = this.bot;
    if (scenarioId !== PLAN.climax || bot.autonomyGoal <= 0) return false;
    return Number(bot.flags.autonomy ?? 0) < bot.autonomyGoal;
  }

  /** One-shot domain actions available right now (null when nothing is due). */
  now(): number | null {
    return this.company() ?? this.nation() ?? this.staffNation() ?? this.settlementOrders();
  }

  /**
   * After founding, fill the nation's offices too (heads, then deputies): the core of the
   * nation's autonomy is its own institutions (city_building 8, act4 4.5).
   */
  private staffNation(): number | null {
    const bot = this.bot;
    if (!bot.flags['slg.nation_founded']) return null;
    const day = this.today();
    if (this.lastNationCheck === day) return null;
    const offices = bot.world.slices.city.nation.offices;
    const busy = new Set<string>();
    for (const o of Object.values(offices)) {
      if (o?.holderId) busy.add(o.holderId);
      if (o?.deputyId) busy.add(o.deputyId);
    }
    const pool = officialCandidates(bot.content);
    for (const rank of ['head', 'deputy'] as const) {
      for (const domain of ALL_DOMAINS) {
        const o = offices[domain];
        if (rank === 'head' ? o?.holderId : o?.deputyId) continue;
        const pick = pool
          .filter((c) => !busy.has(c.id))
          .map((c) => ({ id: c.id, score: (c.competence as Record<string, number>)[domain] ?? 0 }))
          .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
        if (!pick || (rank === 'deputy' && pick.score <= 0)) continue;
        bot.intent = { what: `appoint ${pick.id} to the nation's ${domain} (${rank})` };
        bot.send({ kind: 'city.assign', data: { siteId: 'nation', domain, npcId: pick.id, rank } });
        return 2;
      }
    }
    this.lastNationCheck = day;
    return null;
  }

  /**
   * Domain work worth travelling or waiting for when the quests have nothing to do:
   * tending the settlement, bringing it food, or waiting there while it grows.
   */
  background(waiting: number): number | null {
    const bot = this.bot;
    const v = this.settlementOpen();
    if (!v) return null;
    const day = this.today();
    const here = bot.player()?.mapId === this.home.mapId;
    const supply = this.supply(v);
    if (supply !== null) return supply;
    if (!here && this.needsVisit(v, day)) return this.goToSettlement('tend the settlement');
    const pending = bot.pendingWar();
    if (pending && this.holdingBack(pending.id)) {
      if (!here) return this.goToSettlement('let the nation grow before the last battle');
      bot.intent = {
        what: `let the nation grow (autonomy ${bot.flags.autonomy ?? 0} of ${bot.autonomyGoal})`,
      };
      return bot.wait(TICKS_PER_GAME_HOUR);
    }
    if (bot.flags['quest.a2_m04_village'] === 'active' && v.stage === 'outpost') {
      if (!here) return this.goToSettlement('wait at the outpost');
      bot.intent = {
        what: `wait for settlers (${v.population.total} people, food ${Math.floor(v.foodDays)} days)`,
      };
      return bot.wait(TICKS_PER_GAME_HOUR);
    }
    // nothing to do but wait (the territory growing toward the founding, a day to pass):
    // wait at home, where it is safe and the settlement can use its lord
    if (!here && waiting >= TICKS_PER_GAME_HOUR) return this.goToSettlement('go home to wait');
    return null;
  }

  private today(): number {
    return Math.floor(this.bot.engine.tick / (TICKS_PER_GAME_HOUR * 24));
  }

  // -------------------------------------------------------------------------
  // economy: the trading company with Nera

  private company(): number | null {
    const bot = this.bot;
    const f = bot.flags;
    if (!f['feature.company'] || f['econ.company_founded']) return null;
    const cost = bot.content.economy_config?.company.foundCost ?? 0;
    const pack = holdingOf(bot.world, bot.world.slices.world.playerId);
    if (pack.money < cost) {
      const loot = sellable(bot.content, pack, this.kept);
      if (loot.length === 0 || bot.recentlyRejected('economy.sell', 2400)) return null;
      return this.sell(loot);
    }
    const partner = bot.content.economy_config?.company.partnerNpc;
    if (!partner) return null;
    return bot.talk(partner, 'economy:found_company', 'found the trading company');
  }

  /**
   * Buy what the settlement lacks at the town market: grain for the village oath (carried
   * into the store) and wood and stone for the next buildings (kept in the pack, which
   * construction draws on).
   */
  private supply(v: SettlementView): number | null {
    const bot = this.bot;
    const pid = bot.world.slices.world.playerId;
    const pack = holdingOf(bot.world, pid);
    const room = Math.max(0, v.storage.cap - v.storage.used);
    const staple = bot.content.city_config.staple;
    const grainNeed =
      v.stage === 'outpost' && v.population.total >= 12
        ? Math.max(0, PLAN.foundingFood + 40 - foodIn(v, this.foods))
        : 0;
    const carried = pack.items[staple] ?? 0;
    if (carried > 0 && (carried >= Math.min(grainNeed, 50) || grainNeed === 0)) {
      if (bot.player()?.mapId !== this.home.mapId)
        return this.goToSettlement('bring grain to the outpost');
      const count = Math.min(carried, room);
      if (count > 0 && !bot.recentlyRejected('city.deposit', 600)) {
        bot.intent = { what: `deposit ${count} ${staple}` };
        bot.send({ kind: 'city.deposit', data: { siteId: this.home.id, itemId: staple, count } });
        return 2;
      }
    }
    const want: Record<string, number> = {};
    if (grainNeed - carried > 0 && room >= 20) want[staple] = Math.min(grainNeed - carried, room);
    const reserve = v.stage === 'outpost' && !want[staple] ? PLAN.grainReserve : 0;
    if (pack.money > reserve + 300) {
      for (const [id, n] of Object.entries(this.materialsShort(v))) want[id] = n;
    }
    const shopping = Object.entries(want).filter(([, n]) => n > 0);
    if (shopping.length === 0) return null;
    const loot = sellable(bot.content, pack, this.kept);
    const cost = shopping.reduce((sum, [, n]) => sum + n * 12, 0);
    if (pack.money < Math.min(400, cost) && loot.length === 0) return null;
    if (bot.recentlyRejected('economy.buy', 2400)) return null;
    if (bot.world.slices.economy.session) {
      for (const [itemId, qty] of loot) bot.send({ kind: 'economy.sell', data: { itemId, qty } });
      let budget = pack.money + (loot.length > 0 ? 200 : 0) - reserve;
      bot.intent = { what: `buy ${shopping.map(([id, n]) => `${n} ${id}`).join(', ')}` };
      for (const [itemId, n] of shopping) {
        const qty = Math.min(n, Math.floor(budget / 12));
        if (qty <= 0) break;
        budget -= qty * 12;
        bot.send({ kind: 'economy.buy', data: { itemId, qty } });
      }
      bot.send({ kind: 'economy.close_trade', data: {} });
      return 2;
    }
    const merchant = bot.nearestMerchant(ROUTES.shopMap);
    if (!merchant) return null;
    return bot.talk(merchant, 'economy:trade', 'shop for the settlement');
  }

  /** Wood and stone missing (site store plus pack) for the next two planned buildings. */
  private materialsShort(v: SettlementView): Record<string, number> {
    const bot = this.bot;
    const cached = this.shortCache;
    if (cached && bot.engine.tick - cached.tick < TICKS_PER_GAME_HOUR) return cached.value;
    const value = this.computeShort(v);
    this.shortCache = { tick: bot.engine.tick, value };
    return value;
  }

  private computeShort(v: SettlementView): Record<string, number> {
    const bot = this.bot;
    const plan = v.stage === 'outpost' ? PLAN.outpostPlan : PLAN.growthPlan;
    const need: Record<string, number> = {};
    let planned = 0;
    for (const step of plan) {
      const have = v.buildings.filter((b) => b.defId === step.defId).length;
      if (have >= step.count || planned >= 2) continue;
      if (!findSpot(bot.world, bot.content, this.home.id, step.defId)) continue;
      const def = bot.content.city_buildings.find((b) => b.id === step.defId);
      if (!def) continue;
      for (const [id, n] of Object.entries(def.cost.items)) need[id] = (need[id] ?? 0) + n;
      planned++;
    }
    const site = holdingOf(bot.world, this.home.stockOwner);
    const pack = holdingOf(bot.world, bot.world.slices.world.playerId);
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(need)) {
      if (!ROUTES.buildMaterials.includes(id)) continue;
      const short = n - (site.items[id] ?? 0) - (pack.items[id] ?? 0);
      if (short > 0) out[id] = short + 10;
    }
    return out;
  }

  /** Sell loot at the town market (talk to a merchant, open the trade, sell, close). */
  private sell(loot: [string, number][]): number | null {
    const bot = this.bot;
    if (bot.world.slices.economy.session) {
      bot.intent = { what: `sell ${loot.length} kinds of loot` };
      for (const [itemId, qty] of loot) bot.send({ kind: 'economy.sell', data: { itemId, qty } });
      bot.send({ kind: 'economy.close_trade', data: {} });
      return 2;
    }
    const merchant = bot.nearestMerchant(ROUTES.shopMap);
    if (!merchant) return null;
    return bot.talk(merchant, 'economy:trade', 'sell loot');
  }

  // -------------------------------------------------------------------------
  // city: the old outpost

  view(): SettlementView | null {
    return settlementView(this.bot.world, this.bot.content, this.home.id);
  }

  private settlementOpen(): SettlementView | null {
    const f = this.bot.flags;
    if (!f['feature.village'] && !f['feature.city']) return null;
    const v = this.view();
    return v?.active ? v : null;
  }

  /** Orders given in person at the settlement (build, appoint, enact, found). */
  private settlementOrders(): number | null {
    const bot = this.bot;
    const v = this.settlementOpen();
    if (!v || bot.player()?.mapId !== this.home.mapId) return null;
    const day = this.today();
    if (v.stage === 'outpost') {
      const build = this.buildNext(v, PLAN.outpostPlan, day);
      if (build !== null) return build;
    }
    const office = this.staffOffices(v, day);
    if (office !== null) return office;
    const policy = this.setPolicies(v);
    if (policy !== null) return policy;
    const purse = holdingOf(bot.world, bot.world.slices.world.playerId).money;
    if (v.stage !== 'outpost' && v.treasury < 300 && purse >= 1500) {
      // the treasury pays upkeep and the food official's purchases (money adds no dependency)
      bot.intent = { what: 'fund the treasury' };
      bot.send({
        kind: 'city.deposit',
        data: { siteId: this.home.id, itemId: 'money', count: Math.floor(purse / 2) },
      });
      return 2;
    }
    if (v.stage === 'outpost') {
      if (this.canFound(v)) {
        bot.intent = { what: 'found the village' };
        bot.send({ kind: 'city.found', data: { siteId: this.home.id } });
        return 2;
      }
      return null;
    }
    return this.buildNext(v, PLAN.growthPlan, day);
  }

  private canFound(v: SettlementView): boolean {
    if (v.population.total < 30) return false;
    if (!v.buildings.some((b) => b.defId === 'communal_stove' && b.status === 'active')) {
      return false;
    }
    return foodIn(v, this.foods) >= v.population.total * 10;
  }

  /** Does the settlement need the lord in person (an empty office, a free policy slot)? */
  private needsVisit(v: SettlementView, day: number): boolean {
    if (v.offices.some((o) => !o.holderId)) return true;
    if (v.policies.filter((p) => p.enabled).length < v.policySlots && this.policyCandidate(v)) {
      return true;
    }
    return this.lastBuildDay !== day && this.nextBuild(v, PLAN.growthPlan) !== null;
  }

  private goToSettlement(why: string): number {
    const bot = this.bot;
    const map = mapById(bot.content, this.home.mapId);
    const pt = map ? locationPoint(map, this.home.centerLocation) : { x: 22, y: 19 };
    bot.intent = { what: why };
    return bot.walkTo(this.home.mapId, pt.x, pt.y - 3, 2) === 'blocked' ? 60 : 4;
  }

  private nextBuild(v: SettlementView, plan: readonly PlanStep[]): string | null {
    for (const step of plan) {
      const have = v.buildings.filter((b) => b.defId === step.defId).length;
      if (have >= step.count) continue;
      return step.defId;
    }
    return null;
  }

  private buildNext(v: SettlementView, plan: readonly PlanStep[], day: number): number | null {
    const bot = this.bot;
    if (this.lastBuildDay === day && v.stage !== 'outpost') return null;
    for (const step of plan) {
      const have = v.buildings.filter((b) => b.defId === step.defId).length;
      if (have >= step.count) continue;
      if (!this.affordable(step.defId)) continue;
      const spot = findSpot(bot.world, bot.content, this.home.id, step.defId);
      if (!spot) continue;
      bot.intent = { what: `build ${step.defId}` };
      bot.send({
        kind: 'city.place',
        data: { siteId: this.home.id, defId: step.defId, x: spot.x, y: spot.y },
      });
      return 2;
    }
    this.lastBuildDay = day;
    return null;
  }

  private affordable(defId: string): boolean {
    const bot = this.bot;
    const def = bot.content.city_buildings.find((b) => b.id === defId);
    if (!def) return false;
    const site = holdingOf(bot.world, this.home.stockOwner);
    const pack = holdingOf(bot.world, bot.world.slices.world.playerId);
    for (const [id, n] of Object.entries(def.cost.items)) {
      if ((site.items[id] ?? 0) + (pack.items[id] ?? 0) < n) return false;
    }
    return (def.cost.money ?? 0) <= site.money + pack.money;
  }

  /** Appoint the most competent free official to every empty office (head, then deputy). */
  private staffOffices(v: SettlementView, day: number): number | null {
    const bot = this.bot;
    if (this.lastOfficeCheck === day && !v.offices.some((o) => !o.holderId)) return null;
    const busy = new Set<string>();
    for (const o of v.offices) {
      if (o.holderId) busy.add(o.holderId);
      if (o.deputyId) busy.add(o.deputyId);
    }
    const pool = officialCandidates(bot.content);
    const best = (domain: Domain) =>
      pool
        .filter((c) => !busy.has(c.id))
        .map((c) => ({ id: c.id, score: (c.competence as Record<string, number>)[domain] ?? 0 }))
        .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))[0];
    for (const o of v.offices) {
      if (o.holderId) continue;
      const pick = best(o.domain);
      if (!pick) continue;
      bot.intent = { what: `appoint ${pick.id} to ${o.domain}` };
      bot.send({
        kind: 'city.assign',
        data: { siteId: this.home.id, domain: o.domain, npcId: pick.id, rank: 'head' },
      });
      return 2;
    }
    for (const o of v.offices) {
      if (o.deputyId) continue;
      const pick = best(o.domain);
      if (!pick || pick.score <= 0) continue;
      bot.intent = { what: `appoint ${pick.id} as ${o.domain} deputy` };
      bot.send({
        kind: 'city.assign',
        data: { siteId: this.home.id, domain: o.domain, npcId: pick.id, rank: 'deputy' },
      });
      return 2;
    }
    this.lastOfficeCheck = day;
    return null;
  }

  private policyCandidate(v: SettlementView): string | null {
    const enabled = new Set(v.policies.filter((p) => p.enabled).map((p) => p.id));
    const covered = new Set(v.policies.filter((p) => p.enabled).map((p) => p.domain));
    const rows = this.bot.content.city_policies;
    // settlers first (the outpost needs people), then one policy per staffed domain
    const domains: Domain[] = ['civil', ...v.offices.map((o) => o.domain)];
    for (const domain of domains) {
      if (covered.has(domain)) continue;
      for (const id of PLAN.policies[domain] ?? []) {
        const def = rows.find((r) => r.id === id);
        if (!def || enabled.has(id)) continue;
        if (!stageAtLeast(v.stage, def.minStage)) continue;
        if (def.exclusive?.some((x) => enabled.has(x))) continue;
        return id;
      }
    }
    return null;
  }

  private setPolicies(v: SettlementView): number | null {
    const site = this.bot.world.slices.city.sites[this.home.id];
    if (!site) return null;
    const enabled = v.policies.filter((p) => p.enabled).length;
    if (enabled >= v.policySlots) return null;
    const id = this.policyCandidate(v);
    if (!id) return null;
    this.bot.intent = { what: `enact policy ${id}` };
    this.bot.send({
      kind: 'city.policy',
      data: { siteId: this.home.id, policyId: id, enabled: true },
    });
    return 2;
  }

  // -------------------------------------------------------------------------
  // strategy: founding the nation and the conclave

  private nation(): number | null {
    const bot = this.bot;
    const f = bot.flags;
    if (f['feature.slg'] && !f['slg.nation_founded']) {
      if (Number(f.territory_autonomy ?? 0) >= 40) {
        bot.intent = { what: 'found the nation' };
        bot.send({ kind: 'slg.found_nation', data: {} });
        return 2;
      }
      return null;
    }
    if (
      f['slg.nation_founded'] &&
      f['quest.a4_m04_conclave'] === 'active' &&
      !f['slg.conclave_done'] &&
      !bot.world.slices.strategy?.conference &&
      !bot.world.slices.strategy?.summit
    ) {
      bot.intent = { what: 'convene the seven nations' };
      bot.send({ kind: 'slg.convene', data: {} });
      return 2;
    }
    return null;
  }
}

const STAGES = ['outpost', 'village', 'territory'];

function stageAtLeast(stage: string, min: string | undefined): boolean {
  if (!min) return true;
  return STAGES.indexOf(stage) >= STAGES.indexOf(min);
}

/** Food in the settlement's store (bread counts a little more, as the city counts it). */
/** Residents fed for a day by the settlement's stock, at the foods' feeding values. */
function foodIn(v: SettlementView, foods: readonly CityFoodDef[]): number {
  let n = 0;
  for (const row of v.stock) {
    const food = foods.find((f) => f.itemId === row.itemId);
    if (food) n += row.count * food.value;
  }
  return n;
}
