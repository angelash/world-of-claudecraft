// The daily pipeline of every site and the flags it publishes: construction, production,
// spoilage, food and population, finances, the purify well, events, autonomy, weekly
// official rounds and settler sync. Also site creation and stage transitions.

import type { SystemContext } from '../../core/system';
import { addItem, addMoney } from '../inventory';
import { addDependency, computeTerms, type DomainInput, newLedger, stepLedger } from './autonomy';
import {
  ALL_DOMAINS,
  clamp,
  defenseLevel,
  domainsFor,
  flagsOk,
  policyDef,
  storageCap,
  storageUsed,
  sumEffect,
  totalPop,
} from './common';
import { progressConstruction } from './construction';
import { runEvents } from './events';
import { officialDef, requestDecisions, tickVacancies } from './officials';
import { runPopulation } from './population';
import { repairOne, runFinances, runProduction, runPurifyWell, runSpoilage } from './production';
import { syncSettlers } from './settlers';
import type { AutonomyLedger, CitySlice, Domain, OfficeState, SiteDef, SiteState } from './types';

/** Starting autonomy of the outpost ledger (act 2 seed, tunable). */
export const START_AUTONOMY = 10;

export function newSiteState(sdef: SiteDef, active: boolean): SiteState {
  return {
    id: sdef.id,
    stage: sdef.kind === 'court' ? 'court' : 'outpost',
    active,
    buildings: [],
    pop: { refugees: 0, remnants: 0, migrants: 0 },
    happiness: 0,
    factors: [],
    security: 30,
    health: 60,
    foodDays: 0,
    housing: 0,
    storageUsed: 0,
    storageCap: 0,
    needs: { survival: 1, stability: 0, prosperity: 0, belonging: 0 },
    offices: {},
    policies: [],
    effects: [],
    decisions: [],
    trials: [],
    autonomy: newLedger(START_AUTONOMY),
    upkeep: { acc: 0, arrearsDays: 0, state: 'ok' },
    severe: [],
    lastSevereDay: -999,
    eventLog: [],
    settlers: [],
    gateUsed: 0,
    sediment: 0,
    sedimentModifier: null,
    status: [],
    workersTotal: 0,
    laborTotal: 0,
    spoil: {},
  };
}

export function initCity(ctx: SystemContext): void {
  const slice: CitySlice = {
    sites: {},
    nation: { founded: false, offices: {}, core: null },
    court: { returnTo: null },
  };
  ctx.world.slices.city = slice;
  for (const sdef of ctx.content.city_sites ?? []) {
    const active = flagsOk(ctx.world.meta.flags, sdef.requiresFlags);
    const site = newSiteState(sdef, active);
    const map = ctx.content.maps.find((m) => m.id === sdef.mapId);
    site.sediment = map?.sediment ?? 0;
    for (const domain of domainsFor(site.stage)) {
      site.offices[domain] = { domain, authority: 2, revision: 0, vacantDays: 0 };
    }
    slice.sites[sdef.id] = site;
    for (const [id, n] of Object.entries(sdef.initialStock)) {
      if (n > 0) addItem(ctx, sdef.stockOwner, id, n, 'ruins');
    }
    if (sdef.initialMoney > 0) addMoney(ctx, sdef.stockOwner, sdef.initialMoney, 'initial');
    site.storageUsed = storageUsed(ctx.world, sdef.stockOwner);
    site.storageCap = storageCap(site, sdef, ctx.content);
  }
}

function loyaltyOf(ctx: SystemContext, offices: Partial<Record<Domain, OfficeState>>): number {
  const vals: number[] = [];
  for (const o of Object.values(offices)) {
    if (!o?.holderId) continue;
    const off = officialDef(ctx, o.holderId);
    if (off) vals.push(off.loyalty);
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 50;
}

function domainInputs(
  ctx: SystemContext,
  domains: Domain[],
  offices: Partial<Record<Domain, OfficeState>>,
  policies: string[],
): DomainInput[] {
  return domains.map((domain) => {
    const o = offices[domain];
    const off = o?.holderId ? officialDef(ctx, o.holderId) : undefined;
    return {
      hasHead: !!o?.holderId,
      hasDeputy: !!o?.deputyId,
      hasPolicy: policies.some((p) => policyDef(ctx.content, p)?.domain === domain),
      competence: off?.competence[domain] ?? 30,
    };
  });
}

function updateAutonomy(ctx: SystemContext, site: SiteState, day: number): void {
  const vacancyDep = tickVacancies(site);
  if (vacancyDep > 0) addDependency(site.autonomy, day, '职务长期空缺', vacancyDep);
  const terms = computeTerms({
    domains: domainInputs(ctx, domainsFor(site.stage), site.offices, site.policies),
    talentBonus: sumEffect(site, ctx.content, 'talent'),
    decisions: site.decisions,
    trials: site.trials,
    day,
    happiness: site.happiness,
    security: site.security,
    loyalty: loyaltyOf(ctx, site.offices),
    pDep: site.autonomy.pDep,
  });
  const before = Math.round(site.autonomy.value);
  stepLedger(site.autonomy, terms);
  if (Math.round(site.autonomy.value) !== before) {
    ctx.emit('city.autonomy_changed', {
      siteId: site.id,
      value: Math.round(site.autonomy.value),
      raw: Math.round(site.autonomy.raw),
    });
  }
}

function updateNation(ctx: SystemContext, site: SiteState, day: number): void {
  const nation = ctx.world.slices.city.nation;
  if (!nation.founded || !nation.core) return;
  const terms = computeTerms({
    domains: domainInputs(ctx, ALL_DOMAINS, nation.offices, site.policies),
    talentBonus: sumEffect(site, ctx.content, 'talent'),
    decisions: site.decisions,
    trials: site.trials,
    day,
    happiness: site.happiness,
    security: site.security,
    loyalty: loyaltyOf(ctx, nation.offices),
    pDep: site.autonomy.pDep,
  });
  stepLedger(nation.core, terms);
}

/** Publish the story variables (reveal_ledger 0.4 and the act 2 to 4 arc variables). */
export function writeFlags(ctx: SystemContext): void {
  const city = ctx.world.slices.city;
  const sdef = ctx.content.city_sites.find((s) => s.kind === 'settlement');
  const site = sdef ? city.sites[sdef.id] : undefined;
  if (!sdef || !site) return;
  const pop = totalPop(site);
  const a = Math.round(site.autonomy.value);
  if (site.stage === 'territory') {
    ctx.setFlag('territory_autonomy', a);
    ctx.setFlag('territory_pop', pop);
  } else {
    if (site.stage === 'village') ctx.setFlag('village_autonomy', a);
    if (pop > 0 || ctx.flag('village_pop') !== undefined) ctx.setFlag('village_pop', pop);
  }
  if (pop > 0 || site.stage !== 'outpost')
    ctx.setFlag('village_defense', defenseLevel(site, ctx.content));
  if (city.nation.founded && city.nation.core) {
    ctx.setFlag(
      'autonomy',
      Math.round(clamp(0.6 * site.autonomy.value + 0.4 * city.nation.core.value, 0, 100)),
    );
  }
}

function runSite(ctx: SystemContext, site: SiteState, sdef: SiteDef, day: number): void {
  site.effects = site.effects.filter((e) => e.untilDay >= day);
  site.gateUsed = 0;
  site.status = [];
  progressConstruction(ctx, site, sdef);
  runProduction(ctx, site, sdef);
  runSpoilage(ctx, site, sdef);
  runPopulation(ctx, site, sdef);
  runFinances(ctx, site, sdef);
  runPurifyWell(ctx, site);
  if (site.policies.some((p) => policyDef(ctx.content, p)?.effects.autoRepair)) {
    repairOne(ctx, site, sdef, 50);
  }
  runEvents(ctx, site, sdef);
  if (sdef.kind === 'settlement') {
    updateAutonomy(ctx, site, day);
    updateNation(ctx, site, day);
    if (day % 7 === 0) requestDecisions(ctx, site, sdef);
    syncSettlers(ctx, site, sdef);
  }
  site.storageUsed = storageUsed(ctx.world, sdef.stockOwner);
  site.storageCap = storageCap(site, sdef, ctx.content);
}

export function runDay(ctx: SystemContext, day: number): void {
  const city = ctx.world.slices.city;
  for (const sdef of ctx.content.city_sites) {
    const site = city.sites[sdef.id];
    if (!site) continue;
    site.active = flagsOk(ctx.world.meta.flags, sdef.requiresFlags);
    if (!site.active) continue;
    runSite(ctx, site, sdef, day);
  }
  writeFlags(ctx);
}

/** Narrative grants the territory (flag city.territory_granted): expand zones and caps. */
export function grantTerritory(ctx: SystemContext): void {
  const city = ctx.world.slices.city;
  for (const sdef of ctx.content.city_sites) {
    if (sdef.kind !== 'settlement') continue;
    const site = city.sites[sdef.id];
    if (!site || site.stage === 'territory') continue;
    const from = site.stage;
    const village = site.autonomy.value;
    site.stage = 'territory';
    // act3 7.2: territory_autonomy = 10 + village_autonomy x 0.4 (+10 under the citizens' council)
    const seed = 10 + village * 0.4 + (ctx.flag('wb_ruler') === 'citizen_council' ? 10 : 0);
    site.autonomy.value = clamp(seed, 0, 100);
    site.autonomy.history.push(Math.round(site.autonomy.value * 10) / 10);
    for (const domain of domainsFor('territory')) {
      site.offices[domain] = site.offices[domain] ?? {
        domain,
        authority: 2,
        revision: 0,
        vacantDays: 0,
      };
    }
    ctx.emit('city.stage_changed', { siteId: sdef.id, from, to: 'territory' });
  }
  writeFlags(ctx);
}

/** The nation is founded (flag slg.nation_founded): start the core ledger (A_core). */
export function foundNation(ctx: SystemContext): void {
  const city = ctx.world.slices.city;
  if (city.nation.founded) return;
  const sdef = ctx.content.city_sites.find((s) => s.kind === 'settlement');
  const site = sdef ? city.sites[sdef.id] : undefined;
  const seed: AutonomyLedger = newLedger(site ? site.autonomy.value : START_AUTONOMY);
  city.nation = { founded: true, offices: city.nation.offices, core: seed };
  writeFlags(ctx);
}

export function refreshActive(ctx: SystemContext): void {
  for (const sdef of ctx.content.city_sites) {
    const site = ctx.world.slices.city.sites[sdef.id];
    if (site) site.active = flagsOk(ctx.world.meta.flags, sdef.requiresFlags);
  }
}
