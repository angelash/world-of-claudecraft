// Read-only views for the client and the editor workbench. Pure functions of world plus
// content; the placement preview lives in ./placement and is re-exported from index.
// Text fields are TextRefs or content strings (the `Text` parameter); the client renders
// them (SettlementView<string>).

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextRef, tr } from '../../core/text';
import { itemDef } from '../inventory';
import { actingLevel } from './autonomy';
import {
  buildingDef,
  type CityWorld,
  defenseLevel,
  domainsFor,
  militiaCount,
  siteDef,
  stageCaps,
  stockOf,
  sumEffect,
  totalPop,
  treasuryOf,
} from './common';
import { unlockProblem } from './placement';
import {
  type BuildingDef,
  type BuildingInstance,
  type CityEventKind,
  type Domain,
  domainLabel,
  type SiteState,
  type Stage,
  stageLabel,
} from './types';

type CityContent = Pick<
  ContentMap,
  'city_sites' | 'city_buildings' | 'city_officials' | 'city_policies' | 'maps' | 'items'
>;

/** Kernel text in a view: a TextRef or a content string. */
export type ViewText = TextRef | string;

export interface BuildingView<Text = ViewText> {
  id: string;
  defId: string;
  name: string;
  category: BuildingDef['category'];
  x: number;
  y: number;
  w: number;
  h: number;
  status: BuildingInstance['status'];
  progress: number;
  days: number;
  condition: number;
  workers: number;
  jobs: number;
  note: Text;
}

export interface SettlementView<Text = ViewText> {
  id: string;
  name: string;
  kind: 'settlement' | 'court';
  mapId: string;
  stage: Stage;
  stageName: Text;
  active: boolean;
  outsideDivineSight: boolean;
  population: {
    total: number;
    refugees: number;
    remnants: number;
    migrants: number;
    cap: number;
  };
  housing: number;
  foodDays: number;
  happiness: number;
  happinessFactors: { label: Text; value: number }[];
  security: number;
  health: number;
  needs: SiteState['needs'];
  storage: { used: number; cap: number };
  treasury: number;
  stock: { itemId: string; name: string; count: number }[];
  buildings: BuildingView<Text>[];
  offices: {
    domain: Domain;
    label: Text;
    holderId?: string;
    holderName?: string;
    deputyId?: string;
    authority: number;
    actingLevel: number;
  }[];
  policies: { id: string; name: string; enabled: boolean; domain: Domain; desc: string }[];
  policySlots: number;
  autonomy: {
    value: number;
    raw: number;
    I: number;
    T: number;
    D: number;
    S: number;
    C: number;
    dependency: number;
    trend: number[];
    recent: { day: number; action: Text; delta: number }[];
  };
  upkeep: { perMonth: number; state: SiteState['upkeep']['state']; arrearsDays: number };
  defense: { level: number; militia: number };
  gateLinked: boolean;
  gateRoom: number;
  events: { day: number; kind: CityEventKind; severity: 'minor' | 'severe'; text: Text }[];
  status: Text[];
  sediment: number;
}

export function buildingView(content: CityContent, b: BuildingInstance): BuildingView {
  const def = buildingDef(content, b.defId);
  return {
    id: b.id,
    defId: b.defId,
    name: def?.name ?? b.defId,
    category: def?.category ?? 'special',
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    status: b.status,
    progress: b.progress,
    days: def?.days ?? 0,
    condition: b.condition,
    workers: b.workers,
    jobs: def?.jobs ?? 0,
    note:
      b.status === 'construction'
        ? tr('sys.city.view.building_progress', {
            done: Math.min(b.progress, def?.days ?? 0),
            days: def?.days ?? 0,
          })
        : b.condition < 20
          ? tr('sys.city.view.wrecked')
          : (b.note ?? ''),
  };
}

export function settlementView(
  world: CityWorld,
  content: CityContent,
  siteId: string,
): SettlementView | null {
  const sdef = siteDef(content, siteId);
  const site = world.slices.city.sites[siteId];
  if (!sdef || !site) return null;
  const stock = stockOf(world, sdef.stockOwner);
  let perMonth = 0;
  for (const b of site.buildings) {
    if (b.status === 'active') perMonth += buildingDef(content, b.defId)?.upkeepPerMonth ?? 0;
  }
  const gateCap = sumEffect(site, content, 'gateThroughput');
  return {
    id: site.id,
    name: sdef.name,
    kind: sdef.kind,
    mapId: sdef.mapId,
    stage: site.stage,
    stageName: stageLabel(site.stage),
    active: site.active,
    outsideDivineSight: !!sdef.outsideDivineSight,
    population: {
      total: totalPop(site),
      refugees: site.pop.refugees,
      remnants: site.pop.remnants,
      migrants: site.pop.migrants,
      cap: stageCaps(sdef, site.stage).population,
    },
    housing: site.housing,
    foodDays: site.foodDays,
    happiness: Math.round(site.happiness),
    happinessFactors: site.factors.map((f) => ({ label: f.label, value: f.value })),
    security: Math.round(site.security),
    health: Math.round(site.health),
    needs: { ...site.needs },
    storage: { used: site.storageUsed, cap: site.storageCap },
    treasury: treasuryOf(world, sdef.stockOwner),
    stock: Object.keys(stock)
      .sort()
      .map((id) => ({
        itemId: id,
        name: itemDef(content, id)?.name ?? id,
        count: stock[id] ?? 0,
      })),
    buildings: site.buildings.map((b) => buildingView(content, b)),
    offices: domainsFor(site.stage).map((domain) => {
      const o = site.offices[domain];
      const holder = o?.holderId
        ? content.city_officials.find((x) => x.id === o.holderId)
        : undefined;
      const authority = o?.authority ?? 2;
      return {
        domain,
        label: domainLabel(domain),
        holderId: o?.holderId,
        holderName: holder?.name,
        deputyId: o?.deputyId,
        authority,
        actingLevel: actingLevel(authority, site.autonomy.value),
      };
    }),
    policies: content.city_policies.map((p) => ({
      id: p.id,
      name: p.name,
      enabled: site.policies.includes(p.id),
      domain: p.domain,
      desc: p.desc,
    })),
    policySlots:
      sdef.kind === 'settlement'
        ? stageCaps(sdef, site.stage).policySlots + sumEffect(site, content, 'policySlots')
        : 0,
    autonomy: {
      value: Math.round(site.autonomy.value),
      raw: Math.round(site.autonomy.raw),
      I: site.autonomy.I,
      T: site.autonomy.T,
      D: site.autonomy.D,
      S: site.autonomy.S,
      C: site.autonomy.C,
      dependency: Math.round(site.autonomy.pDep * 10) / 10,
      trend: [...site.autonomy.history],
      recent: site.autonomy.dependency.slice(-10),
    },
    upkeep: { perMonth, state: site.upkeep.state, arrearsDays: site.upkeep.arrearsDays },
    defense: { level: defenseLevel(site, content), militia: militiaCount(site, content) },
    gateLinked: gateCap > 0,
    gateRoom: Math.max(0, gateCap - site.gateUsed),
    events: site.eventLog.slice(-10),
    status: [...site.status],
    sediment: site.sediment,
  };
}

/** Building definitions usable at a site kind (all of them when siteId is omitted). */
export function buildingList(
  content: Pick<ContentMap, 'city_buildings' | 'city_sites'>,
  siteId?: string,
): BuildingDef[] {
  if (!siteId) return [...content.city_buildings];
  const sdef = siteDef(content, siteId);
  if (!sdef) return [];
  return content.city_buildings.filter((b) => b.sites.includes(sdef.kind));
}

/** Building menu with lock reasons ('' when available), for the build window. */
export function buildMenu(
  world: CityWorld,
  content: CityContent,
  siteId: string,
): { def: BuildingDef; available: boolean; reason: KeyText | '' }[] {
  const sdef = siteDef(content, siteId);
  const site = world.slices.city.sites[siteId];
  if (!sdef || !site) return [];
  return buildingList(content, siteId).map((def) => {
    const reason = unlockProblem(world, content, site, sdef, def);
    return { def, available: reason === null, reason: reason ?? '' };
  });
}

export function policyList(content: Pick<ContentMap, 'city_policies'>) {
  return content.city_policies.map((p) => ({ ...p, domainLabel: domainLabel(p.domain) }));
}

export function officialCandidates(content: Pick<ContentMap, 'city_officials'>) {
  return content.city_officials.map((o) => ({
    id: o.id,
    name: o.name,
    desc: o.desc,
    competence: o.competence,
  }));
}
