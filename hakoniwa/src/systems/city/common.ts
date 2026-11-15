// Shared lookups and small pure helpers for the city modules.

import type { ContentMap, FlagValue } from '../../core/contracts';
import { calendarAt } from '../../core/time';
import type { InventorySlice } from '../inventory';
import {
  type BuildingDef,
  type BuildingInstance,
  type CityConfig,
  type CitySlice,
  type Domain,
  type PolicyDef,
  type SiteDef,
  type SiteRole,
  type SiteState,
  STAGE_ORDER,
  type Stage,
  type StageCaps,
} from './types';

export interface CityWorld {
  meta: { tick: number; flags: Record<string, FlagValue> };
  slices: { city: CitySlice; inventory: InventorySlice };
}

/** Copper of head tax per resident per day at the normal rate. */
export const HEAD_TAX = 3;
/** Share of residents who can work. */
export const LABOR_SHARE = 0.6;

export function today(tick: number): number {
  return calendarAt(tick).dayIndex;
}

export function siteDef(content: Pick<ContentMap, 'city_sites'>, id: string): SiteDef | undefined {
  return content.city_sites.find((s) => s.id === id);
}

/** The site that holds a story role (SiteDef.roles), e.g. the village core. */
export function siteByRole(
  content: Pick<ContentMap, 'city_sites'>,
  role: SiteRole,
): SiteDef | undefined {
  return content.city_sites.find((s) => s.roles?.includes(role));
}

/** The inner court (the one site of kind 'court'). */
export function courtSite(content: Pick<ContentMap, 'city_sites'>): SiteDef | undefined {
  return content.city_sites.find((s) => s.kind === 'court');
}

export function buildingDef(
  content: Pick<ContentMap, 'city_buildings'>,
  id: string,
): BuildingDef | undefined {
  return content.city_buildings.find((b) => b.id === id);
}

export function policyDef(
  content: Pick<ContentMap, 'city_policies'>,
  id: string,
): PolicyDef | undefined {
  return content.city_policies.find((p) => p.id === id);
}

export function siteState(
  world: { slices: { city: CitySlice } },
  id: string,
): SiteState | undefined {
  return world.slices.city.sites[id];
}

export function flagsOk(flags: Record<string, FlagValue>, list: string[] | undefined): boolean {
  return !list || list.every((f) => !!flags[f]);
}

export function stageAtLeast(stage: Stage, min: Stage | undefined): boolean {
  if (!min) return true;
  if (stage === 'court' || min === 'court') return stage === min;
  return STAGE_ORDER[stage] >= STAGE_ORDER[min];
}

export function stageCaps(def: SiteDef, stage: Stage): StageCaps {
  return (
    def.caps[stage] ??
    def.caps.village ??
    def.caps.court ?? { population: 0, policySlots: 0, storageBase: 100 }
  );
}

/** Office domains open at a stage (city_building 7.4). */
export function domainsFor(stage: Stage): Domain[] {
  switch (stage) {
    case 'outpost':
      return ['food', 'works'];
    case 'village':
      return ['food', 'works', 'security', 'civil'];
    case 'territory':
      return ['food', 'works', 'security', 'civil', 'commerce', 'military'];
    default:
      return [];
  }
}

export const ALL_DOMAINS: Domain[] = [
  'food',
  'works',
  'security',
  'civil',
  'commerce',
  'military',
  'culture',
  'research',
];

export function totalPop(site: SiteState): number {
  return site.pop.refugees + site.pop.remnants + site.pop.migrants;
}

export function isWorking(b: BuildingInstance): boolean {
  return b.status === 'active' && b.condition >= 20;
}

export function activeBuildings(site: SiteState): BuildingInstance[] {
  return site.buildings.filter((b) => b.status === 'active');
}

export function countBuildings(
  site: SiteState,
  defId: string,
  includeConstruction = false,
): number {
  return site.buildings.filter(
    (b) => b.defId === defId && (includeConstruction || b.status === 'active'),
  ).length;
}

export function hasActive(site: SiteState, defId: string): boolean {
  return site.buildings.some((b) => b.defId === defId && isWorking(b));
}

/** Sum of a numeric building effect over working buildings. */
export function sumEffect(
  site: SiteState,
  content: Pick<ContentMap, 'city_buildings'>,
  key: keyof NonNullable<BuildingDef['effects']>,
): number {
  let total = 0;
  for (const b of site.buildings) {
    if (!isWorking(b)) continue;
    const v = buildingDef(content, b.defId)?.effects?.[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

export function stockOf(
  world: { slices: { inventory: InventorySlice } },
  owner: string,
): Record<string, number> {
  return world.slices.inventory.owners[owner]?.items ?? {};
}

export function treasuryOf(
  world: { slices: { inventory: InventorySlice } },
  owner: string,
): number {
  return world.slices.inventory.owners[owner]?.money ?? 0;
}

export function storageUsed(
  world: { slices: { inventory: InventorySlice } },
  owner: string,
): number {
  let n = 0;
  for (const v of Object.values(stockOf(world, owner))) n += v;
  return n;
}

export function storageCap(
  site: SiteState,
  def: SiteDef,
  content: Pick<ContentMap, 'city_buildings'>,
): number {
  let cap = stageCaps(def, site.stage).storageBase;
  for (const b of site.buildings) {
    if (b.status !== 'active') continue;
    cap += buildingDef(content, b.defId)?.storage ?? 0;
  }
  return cap;
}

/** Residents fed for a day by the food in a stock (eating order of city_config.food). */
export function foodValue(stock: Record<string, number>, config: CityConfig): number {
  let v = 0;
  for (const f of config.food) v += (stock[f.itemId] ?? 0) * f.value;
  return v;
}

/** Does the stock hold any of these goods (a need tier met by goods, city_building 5.4)? */
export function stocksAny(stock: Record<string, number>, ids: readonly string[]): boolean {
  return ids.some((id) => (stock[id] ?? 0) > 0);
}

export function policyEffectSum(
  site: SiteState,
  content: Pick<ContentMap, 'city_policies'>,
  key: 'happiness' | 'security' | 'health' | 'refugees' | 'militia' | 'attraction',
): number {
  let total = 0;
  for (const id of site.policies) {
    const v = policyDef(content, id)?.effects[key];
    if (typeof v === 'number') total += v;
  }
  return total;
}

export function policyFactor(
  site: SiteState,
  content: Pick<ContentMap, 'city_policies'>,
  key: 'production' | 'foodProduction' | 'tax',
): number {
  let f = 1;
  for (const id of site.policies) {
    const v = policyDef(content, id)?.effects[key];
    if (typeof v === 'number') f *= v;
  }
  return f;
}

export function policyFlag(
  site: SiteState,
  content: Pick<ContentMap, 'city_policies'>,
  key: 'autoRepair' | 'foodFirst',
): boolean {
  return site.policies.some((id) => !!policyDef(content, id)?.effects[key]);
}

export function tempSum(site: SiteState, kind: SiteState['effects'][number]['kind']): number {
  let total = 0;
  for (const e of site.effects) if (e.kind === kind) total += e.value;
  return total;
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Militia available for raids (village_defense and the raid kernel). */
export function militiaCount(
  site: SiteState,
  content: Pick<ContentMap, 'city_buildings' | 'city_policies'>,
): number {
  const pop = totalPop(site);
  const trained =
    sumEffect(site, content, 'militia') +
    policyEffectSum(site, content, 'militia') +
    tempSum(site, 'militia');
  // Without training, able-bodied villagers still take up arms (about one in eight).
  return Math.max(0, Math.min(pop, Math.round(trained + pop / 8)));
}

/** village_defense 0..3: a palisade ring, a tower, a guard post (city_building V2 to V4). */
export function defenseLevel(site: SiteState, content: Pick<ContentMap, 'city_buildings'>): number {
  let level = 0;
  if (site.buildings.filter((b) => b.defId === 'palisade' && isWorking(b)).length >= 4) level++;
  if (hasActive(site, 'watchtower')) level++;
  const guardPost = site.buildings.some(
    (b) =>
      isWorking(b) &&
      b.defId !== 'watchtower' &&
      (buildingDef(content, b.defId)?.effects?.defense ?? 0) > 0,
  );
  if (guardPost) level++;
  return Math.min(3, level);
}
