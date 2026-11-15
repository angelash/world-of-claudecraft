// Domain adapters: trade company, territory (settlements, build menu, placement preview),
// the battlefield and the continent. Pure functions of GameView plus the economy, city,
// warfare and strategy queries.

import { buildMenu, COURT_ID, previewPlacement, settlementView } from '../../systems/city';
import { companyView } from '../../systems/economy';
import { formatMoney } from '../../systems/inventory';
import { continentView, diplomacyView, nationView } from '../../systems/strategy';
import { battleView, pendingScenario } from '../../systems/warfare';
import type {
  BattleAdapter,
  CompanyAdapter,
  SiteSummary,
  StrategyAdapter,
  TerritoryAdapter,
} from '../view/adapters';
import type { GameView } from '../view/game_view';
import { flagOn } from '../view/game_view';

export function createCompanyAdapter(): CompanyAdapter {
  return {
    company: (view) => companyView(view.world as never, view.content as never),
    found: () => [{ kind: 'economy.found_company', data: {} }],
    funds: (_view, amount) => [{ kind: 'economy.company_funds', data: { amount } }],
    produce: (_view, recipeId, runs) => [{ kind: 'economy.produce', data: { recipeId, runs } }],
  };
}

/** Cost of a building as one short line: "木材 x20  石料 x5  3 银". */
export function costText(
  cost: { items: Record<string, number>; money?: number },
  itemName: (id: string) => string,
): string {
  const parts = Object.entries(cost.items).map(([id, n]) => `${itemName(id)} x${n}`);
  if (cost.money) parts.push(formatMoney(cost.money));
  return parts.join('  ');
}

export function siteSummaries(view: GameView): SiteSummary[] {
  const sites =
    (view.world.slices as { city?: { sites: Record<string, { active: boolean }> } }).city?.sites ??
    {};
  return (view.content.city_sites ?? []).map((d) => ({
    id: d.id,
    name: d.name,
    mapId: d.mapId,
    founded: !!sites[d.id]?.active || d.id === COURT_ID,
    usable: !(d.requiresFlags ?? []).some((f) => !flagOn(view.flag(f))),
  }));
}

export function createTerritoryAdapter(): TerritoryAdapter {
  return {
    sites: siteSummaries,
    settlement: (view, siteId) =>
      settlementView(view.world as never, view.content as never, siteId),
    buildMenu(view, siteId) {
      return buildMenu(view.world as never, view.content as never, siteId).map((m) => ({
        id: m.def.id,
        name: m.def.name,
        desc: m.def.desc,
        w: m.def.footprint.w,
        h: m.def.footprint.h,
        cost: costText(m.def.cost, (id) => view.itemDef(id)?.name ?? id),
        available: m.available,
        reason: m.reason,
      }));
    },
    preview: (view, siteId, defId, x, y) =>
      previewPlacement(view.world as never, view.content as never, siteId, defId, x, y),
    found: (_view, siteId) => [{ kind: 'city.found', data: { siteId } }],
    place: (_view, siteId, defId, x, y) => [{ kind: 'city.place', data: { siteId, defId, x, y } }],
    cancel: (_view, siteId, buildingId) => [{ kind: 'city.cancel', data: { siteId, buildingId } }],
    policy: (_view, siteId, policyId, enabled) => [
      { kind: 'city.policy', data: { siteId, policyId, enabled } },
    ],
    enterCourt: () => [{ kind: 'city.enter_court', data: {} }],
    leaveCourt: () => [{ kind: 'city.leave_court', data: {} }],
  };
}

export function createBattleAdapter(): BattleAdapter {
  return {
    battle: (view) => battleView(view.world as never, view.content as never),
    pending: (view) => pendingScenario(view.world as never, view.content as never),
    start: (_view, scenarioId) => [{ kind: 'war.start', data: { scenarioId } }],
    order: (_view, o) => [{ kind: 'war.order', data: { ...o } }],
    heroAbility: (_view, heroId, abilityId, target) => [
      { kind: 'war.hero_ability', data: { heroId, abilityId, ...target } },
    ],
    retreat: () => [{ kind: 'war.retreat', data: {} }],
    autoResolve: (_view, scenarioId) => [{ kind: 'war.auto_resolve', data: { scenarioId } }],
  };
}

export function createStrategyAdapter(): StrategyAdapter {
  return {
    continent: (view) => continentView(view.world as never, view.content as never),
    nation: (view, id) => nationView(view.world as never, view.content as never, id),
    diplomacy: (view) => diplomacyView(view.world as never, view.content as never),
    recruitOptions(view) {
      const ids = view.content.slg_config?.playerNation?.recruits ?? [];
      const types = view.content.regiment_types ?? [];
      return ids.map((typeId) => ({
        typeId,
        name: types.find((t) => t.id === typeId)?.name ?? typeId,
      }));
    },
    moveArmy: (_view, armyId, to) => [{ kind: 'slg.move_army', data: { armyId, to } }],
    recruit: (_view, provinceId, typeId, count) => [
      { kind: 'slg.recruit', data: { provinceId, typeId, count } },
    ],
    diplomacyAct: (_view, to, action, treaty) => [
      { kind: 'slg.diplomacy', data: { to, action, treaty } },
    ],
    foundNation: (_view, name) => [{ kind: 'slg.found_nation', data: { name } }],
    convene: () => [{ kind: 'slg.convene', data: {} }],
    setBattleMode: (_view, mode) => [{ kind: 'slg.set_battle_mode', data: { mode } }],
  };
}
