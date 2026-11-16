// Officials (city_building 7.4): appointing named NPCs to domains, the weekly
// official.decide request (AI proposal or utility fallback, carrying a revision), and
// executing an official action within min(authority, 1 + floor(A / 25)).

import { type CommandResult, ok, reject } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import { contentText } from '../../core/content_key';
import type { CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { joinText, type KeyText, type TextRef, tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { buyFromMarket, marketPrice, sellToMarket } from '../economy/ports';
import { spendMoney } from '../inventory';
import { actingLevel, DECISION_WEIGHT, recordDecision } from './autonomy';
import {
  ALL_DOMAINS,
  clamp,
  domainsFor,
  flagsOk,
  siteDef,
  stageCaps,
  stockOf,
  storageUsed,
  today,
  totalPop,
  treasuryOf,
} from './common';
import { placeBuilding } from './construction';
import { findSpot } from './placement';
import { addPopulation } from './population';
import { repairOne } from './production';
import {
  type Domain,
  domainLabel,
  type OfficeState,
  type OfficialActionId,
  type OfficialDef,
  type SiteDef,
  type SiteState,
} from './types';

export interface OfficialActionDef {
  domains: Domain[];
  level: number;
}

export const OFFICIAL_ACTIONS: Record<OfficialActionId, OfficialActionDef> = {
  idle: { domains: [...ALL_DOMAINS], level: 1 },
  ration: { domains: ['food'], level: 1 },
  prioritize_food: { domains: ['food'], level: 1 },
  buy_food: { domains: ['food', 'commerce'], level: 2 },
  repair: { domains: ['works'], level: 1 },
  build_housing: { domains: ['works', 'civil'], level: 2 },
  build_storage: { domains: ['works'], level: 2 },
  patrol: { domains: ['security', 'military'], level: 1 },
  curfew: { domains: ['security'], level: 2 },
  settle: { domains: ['civil', 'culture'], level: 1 },
  welcome_refugees: { domains: ['civil'], level: 2 },
  festival: { domains: ['civil', 'culture'], level: 2 },
  sell_surplus: { domains: ['commerce'], level: 2 },
  drill: { domains: ['military', 'security'], level: 1 },
  study: { domains: ['research', 'culture'], level: 1 },
};

const ACTION_TEXT: Record<OfficialActionId, { name: () => KeyText; desc: () => KeyText }> = {
  idle: {
    name: () => tr('sys.city.action.idle.name'),
    desc: () => tr('sys.city.action.idle.desc'),
  },
  ration: {
    name: () => tr('sys.city.action.ration.name'),
    desc: () => tr('sys.city.action.ration.desc'),
  },
  prioritize_food: {
    name: () => tr('sys.city.action.prioritize_food.name'),
    desc: () => tr('sys.city.action.prioritize_food.desc'),
  },
  buy_food: {
    name: () => tr('sys.city.action.buy_food.name'),
    desc: () => tr('sys.city.action.buy_food.desc'),
  },
  repair: {
    name: () => tr('sys.city.action.repair.name'),
    desc: () => tr('sys.city.action.repair.desc'),
  },
  build_housing: {
    name: () => tr('sys.city.action.build_housing.name'),
    desc: () => tr('sys.city.action.build_housing.desc'),
  },
  build_storage: {
    name: () => tr('sys.city.action.build_storage.name'),
    desc: () => tr('sys.city.action.build_storage.desc'),
  },
  patrol: {
    name: () => tr('sys.city.action.patrol.name'),
    desc: () => tr('sys.city.action.patrol.desc'),
  },
  curfew: {
    name: () => tr('sys.city.action.curfew.name'),
    desc: () => tr('sys.city.action.curfew.desc'),
  },
  settle: {
    name: () => tr('sys.city.action.settle.name'),
    desc: () => tr('sys.city.action.settle.desc'),
  },
  welcome_refugees: {
    name: () => tr('sys.city.action.welcome_refugees.name'),
    desc: () => tr('sys.city.action.welcome_refugees.desc'),
  },
  festival: {
    name: () => tr('sys.city.action.festival.name'),
    desc: () => tr('sys.city.action.festival.desc'),
  },
  sell_surplus: {
    name: () => tr('sys.city.action.sell_surplus.name'),
    desc: () => tr('sys.city.action.sell_surplus.desc'),
  },
  drill: {
    name: () => tr('sys.city.action.drill.name'),
    desc: () => tr('sys.city.action.drill.desc'),
  },
  study: {
    name: () => tr('sys.city.action.study.name'),
    desc: () => tr('sys.city.action.study.desc'),
  },
};

/** Display name of an official action (a fresh TextRef). */
export function actionName(id: OfficialActionId): KeyText {
  return ACTION_TEXT[id].name();
}

/** One-line description of an official action (a fresh TextRef). */
export function actionDesc(id: OfficialActionId): KeyText {
  return ACTION_TEXT[id].desc();
}

export function officialDef(
  ctx: { content: { city_officials: OfficialDef[] } },
  id: string,
): OfficialDef | undefined {
  return ctx.content.city_officials.find((o) => o.id === id);
}

function competence(off: OfficialDef | undefined, domain: Domain): number {
  return off?.competence[domain] ?? 30;
}

function newOffice(domain: Domain): OfficeState {
  return { domain, authority: 2, revision: 0, vacantDays: 0 };
}

export function assignOffice(
  ctx: SystemContext,
  d: {
    siteId: string;
    domain: Domain;
    npcId: string;
    rank?: 'head' | 'deputy';
    authority?: number;
  },
): CommandResult {
  const city = ctx.world.slices.city;
  let offices: Partial<Record<Domain, OfficeState>>;
  let allowed: Domain[];
  if (d.siteId === 'nation') {
    if (!ctx.flag('a4_nation_founded')) return reject('no_nation', tr('sys.city.reject.no_nation'));
    offices = city.nation.offices;
    allowed = ALL_DOMAINS;
  } else {
    const site = city.sites[d.siteId];
    const sdef = siteDef(ctx.content, d.siteId);
    if (!site || !sdef || sdef.kind !== 'settlement')
      return reject('unknown_site', tr('sys.city.reject.unknown_site'));
    offices = site.offices;
    allowed = domainsFor(site.stage);
  }
  if (!allowed.includes(d.domain))
    return reject(
      'domain_locked',
      tr('sys.city.reject.domain_locked', { domain: domainLabel(d.domain) }),
    );
  const office = offices[d.domain] ?? newOffice(d.domain);
  offices[d.domain] = office;
  const rank = d.rank ?? 'head';
  if (d.authority !== undefined) office.authority = clamp(Math.round(d.authority), 1, 4);
  if (!d.npcId) {
    if (rank === 'head') office.holderId = undefined;
    else office.deputyId = undefined;
    office.revision += 1;
    return ok(
      tr('sys.city.info.office_vacated', { domain: domainLabel(d.domain), rank: rankLabel(rank) }),
    );
  }
  const off = officialDef(ctx, d.npcId);
  if (!off || !flagsOk(ctx.world.meta.flags, off.requiresFlags))
    return reject('unknown_official', tr('sys.city.reject.unknown_official'));
  for (const o of Object.values(offices)) {
    if (!o || o.domain === d.domain) continue;
    if (o.holderId === d.npcId || o.deputyId === d.npcId)
      return reject(
        'busy',
        tr('sys.city.reject.busy_other', { name: contentText('city_officials', off) }),
      );
  }
  if (rank === 'head') {
    office.holderId = d.npcId;
    if (office.deputyId === d.npcId) office.deputyId = undefined;
  } else {
    if (office.holderId === d.npcId)
      return reject(
        'busy',
        tr('sys.city.reject.busy_head', { name: contentText('city_officials', off) }),
      );
    office.deputyId = d.npcId;
  }
  office.vacantDays = 0;
  office.revision += 1;
  return ok(
    tr('sys.city.info.appointed', {
      name: contentText('city_officials', off),
      domain: domainLabel(d.domain),
      rank: rankLabel(rank),
    }),
  );
}

function rankLabel(rank: 'head' | 'deputy'): KeyText {
  return rank === 'head' ? tr('sys.city.rank.head') : tr('sys.city.rank.deputy');
}

/** Utility fallback: the action an official picks without a model. */
export function utilityAction(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  domain: Domain,
): OfficialActionId {
  const pop = totalPop(site);
  const stock = stockOf(ctx.world, sdef.stockOwner);
  const treasury = treasuryOf(ctx.world, sdef.stockOwner);
  const used = storageUsed(ctx.world, sdef.stockOwner);
  const freeHousing = site.housing - pop;
  switch (domain) {
    case 'food':
      if (pop > 0 && site.foodDays < 5 && treasury >= 200 && sdef.tradeMarket) return 'buy_food';
      if (pop > 0 && site.foodDays < 2) return 'ration';
      if (pop > 0 && site.foodDays < 10) return 'prioritize_food';
      return 'idle';
    case 'works':
      if (site.buildings.some((b) => b.status === 'active' && b.condition < 70)) return 'repair';
      if (pop > 0 && freeHousing < 2) return 'build_housing';
      if (site.storageCap > 0 && used / site.storageCap > 0.85) return 'build_storage';
      return 'idle';
    case 'security':
      if (site.security < 40) return 'patrol';
      return 'idle';
    case 'civil':
      if (site.happiness < 0) return 'settle';
      if (freeHousing > 4 && site.policies.includes('open_refugees')) return 'welcome_refugees';
      if (site.happiness < 5 && treasury > 1000) return 'festival';
      return 'idle';
    case 'commerce':
      if (ctx.content.city_config.surplusKeep.some((k) => (stock[k.itemId] ?? 0) > k.keep + 20))
        return 'sell_surplus';
      if (pop > 0 && site.foodDays < 5 && treasury >= 200) return 'buy_food';
      return 'idle';
    case 'military':
      return site.security < 60 ? 'drill' : 'idle';
    default:
      return 'study';
  }
}

function addTemp(
  site: SiteState,
  kind: SiteState['effects'][number]['kind'],
  value: number,
  day: number,
  label: KeyText,
): void {
  // the readable id renders as before: '<kind>:<label>'
  const id = joinText('none', [`${kind}:`, label]);
  site.effects.push({ id, kind, value, untilDay: day + 7, label: { ...label } });
}

/** Run an action; returns a readable note and whether it did something. */
export function executeAction(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  domain: Domain,
  action: OfficialActionId,
  off: OfficialDef | undefined,
): { ok: true; note: TextRef | string } | { ok: false; note: TextRef } {
  const day = today(ctx.tick);
  const f = 0.5 + competence(off, domain) / 100;
  const owner = sdef.stockOwner;
  const leak = off ? (1 - off.integrity / 100) * 0.1 : 0;
  switch (action) {
    case 'idle':
    case 'study':
      return { ok: true, note: tr('sys.city.note.idle') };
    case 'ration':
      addTemp(site, 'ration', 0.1, day, tr('sys.city.effect.ration'));
      addTemp(site, 'happiness', -1, day, tr('sys.city.effect.ration'));
      return { ok: true, note: tr('sys.city.note.ration') };
    case 'prioritize_food':
      addTemp(site, 'production', 0.05 * f, day, tr('sys.city.effect.prioritize_food'));
      return { ok: true, note: tr('sys.city.note.prioritize_food') };
    case 'buy_food': {
      const market = sdef.tradeMarket;
      if (!market) return { ok: false, note: tr('sys.city.note.no_food_market') };
      const staple = ctx.content.city_config.staple;
      const price = marketPrice(ctx.world, ctx.content, market, staple);
      if (!price || price <= 0) return { ok: false, note: tr('sys.city.note.no_grain') };
      const budget = Math.floor(treasuryOf(ctx.world, owner) * 0.5);
      const qty = Math.min(totalPop(site) * 7, Math.floor(budget / (price * 1.2)));
      if (qty <= 0) return { ok: false, note: tr('sys.city.note.no_funds_food') };
      const res = buyFromMarket(ctx, market, owner, staple, qty, 'city.buy_food');
      if (!res.ok) return { ok: false, note: res.reason };
      const lost = Math.floor(res.total * leak);
      if (lost > 0) spendMoney(ctx, owner, Math.min(lost, treasuryOf(ctx.world, owner)), 'graft');
      return {
        ok: true,
        note: tr('sys.city.note.bought_food', {
          qty,
          total: res.total,
          graft: lost > 0 ? tr('sys.city.note.graft', { lost }) : '',
        }),
      };
    }
    case 'repair': {
      const name = repairOne(ctx, site, sdef, 70);
      return name
        ? { ok: true, note: tr('sys.city.note.repaired', { building: name }) }
        : { ok: false, note: tr('sys.city.note.no_repair') };
    }
    case 'build_housing':
    case 'build_storage': {
      const choices =
        action === 'build_housing'
          ? site.stage === 'outpost'
            ? ['shack']
            : ['cabin', 'shack']
          : ['granary', 'shed'];
      for (const defId of choices) {
        const spot = findSpot(ctx.world, ctx.content, site.id, defId);
        if (!spot) continue;
        const res = placeBuilding(ctx, site.id, defId, spot.x, spot.y, 'official');
        if (res.result.ok)
          return { ok: true, note: res.result.info ?? tr('sys.city.note.build_started') };
      }
      return { ok: false, note: tr('sys.city.note.no_spot') };
    }
    case 'patrol':
      addTemp(site, 'security', 10 * f, day, tr('sys.city.effect.patrol'));
      return { ok: true, note: tr('sys.city.note.patrol') };
    case 'curfew':
      addTemp(site, 'security', 15 * f, day, tr('sys.city.effect.curfew'));
      addTemp(site, 'happiness', -2, day, tr('sys.city.effect.curfew'));
      return { ok: true, note: tr('sys.city.note.curfew') };
    case 'settle':
      addTemp(site, 'happiness', Math.round(2 * f), day, tr('sys.city.effect.settle'));
      return { ok: true, note: tr('sys.city.note.settle') };
    case 'welcome_refugees': {
      const room = Math.min(
        site.housing - totalPop(site),
        stageCaps(sdef, site.stage).population - totalPop(site),
      );
      const n = addPopulation(
        ctx,
        site,
        sdef,
        'refugees',
        Math.min(5, room),
        tr('sys.city.reason.official_refugees'),
      );
      return n > 0
        ? { ok: true, note: tr('sys.city.note.welcomed', { n }) }
        : { ok: false, note: tr('sys.city.note.no_housing') };
    }
    case 'festival': {
      const cost = 200;
      if (treasuryOf(ctx.world, owner) < cost)
        return { ok: false, note: tr('sys.city.note.no_funds_festival') };
      spendMoney(ctx, owner, cost, 'festival');
      addTemp(site, 'happiness', Math.round(4 * f), day, tr('sys.city.effect.festival'));
      return { ok: true, note: tr('sys.city.note.festival') };
    }
    case 'sell_surplus': {
      const market = sdef.tradeMarket;
      if (!market) return { ok: false, note: tr('sys.city.note.no_market') };
      const stock = stockOf(ctx.world, owner);
      let total = 0;
      const sold: string[] = [];
      for (const { itemId: id, keep } of ctx.content.city_config.surplusKeep) {
        const extra = (stock[id] ?? 0) - keep;
        if (extra <= 20) continue;
        const res = sellToMarket(ctx, market, owner, id, extra, 'city.sell_surplus');
        if (res.ok) {
          total += res.total;
          sold.push(id);
        }
      }
      return sold.length > 0
        ? { ok: true, note: tr('sys.city.note.sold', { total }) }
        : { ok: false, note: tr('sys.city.note.not_sold') };
    }
    case 'drill':
      addTemp(site, 'militia', Math.round(3 * f), day, tr('sys.city.effect.drill'));
      addTemp(site, 'security', 3, day, tr('sys.city.effect.drill'));
      return { ok: true, note: tr('sys.city.note.drill') };
  }
  return { ok: false, note: tr('sys.city.note.unknown_action') };
}

/** Weekly planning round: one official.decide request per appointed head. */
export function requestDecisions(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  const pop = totalPop(site);
  for (const domain of domainsFor(site.stage)) {
    const office = site.offices[domain];
    if (!office?.holderId) continue;
    const off = officialDef(ctx, office.holderId);
    office.revision += 1;
    const level = actingLevel(office.authority, site.autonomy.value);
    const menu = (Object.keys(OFFICIAL_ACTIONS) as OfficialActionId[])
      .filter((id) => OFFICIAL_ACTIONS[id].domains.includes(domain))
      .map((id) => ({ id, ...OFFICIAL_ACTIONS[id] }))
      .filter((a) => a.level <= level)
      .map((a) => ({ id: a.id, name: actionName(a.id), level: a.level, desc: actionDesc(a.id) }));
    const fallbackAction = utilityAction(ctx, site, sdef, domain);
    const action = menu.some((m) => m.id === fallbackAction) ? fallbackAction : 'idle';
    const data = {
      siteId: site.id,
      domain,
      officialId: office.holderId,
      action,
      revision: office.revision,
    };
    const context: AiContextV1 = {
      v: 1,
      persona: off
        ? tr('sys.city.prompt.persona', { name: off.name, desc: off.desc })
        : office.holderId,
      situation: tr('sys.city.prompt.situation', {
        site: sdef.name,
        pop,
        food: site.foodDays,
        happiness: Math.round(site.happiness),
        security: Math.round(site.security),
        used: site.storageUsed,
        cap: site.storageCap,
        treasury: treasuryOf(ctx.world, sdef.stockOwner),
        domain: domainLabel(domain),
        level,
      }),
      goals: [
        tr('sys.city.prompt.goal_autonomy'),
        tr('sys.city.prompt.goal_domain', { domain: domainLabel(domain) }),
      ],
      commands: {
        'city.official_act': tr('sys.city.prompt.command_act'),
      },
      extra: {
        menu,
        siteId: site.id,
        domain,
        officialId: office.holderId,
        revision: office.revision,
      },
    };
    ctx.ai.request({
      agentId: office.holderId,
      role: 'official.decide',
      purpose: `${site.id}.${domain}`,
      revision: office.revision,
      context,
      allowed: ['city.official_act'],
      fallback: [
        {
          kind: 'city.official_act',
          data,
          source: { type: 'system', system: 'city' },
        },
      ],
      deadlineTicks: TICKS_PER_GAME_HOUR,
      priority: 1,
    });
  }
}

export function officialAct(
  ctx: SystemContext,
  d: {
    siteId: string;
    domain: Domain;
    officialId: string;
    action: OfficialActionId;
    revision: number;
  },
  source: CommandSource,
): CommandResult {
  if (source.type === 'player') return reject('not_official', tr('sys.city.reject.not_official'));
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef) return reject('unknown_site', tr('sys.city.reject.unknown_site'));
  const office = site.offices[d.domain];
  if (!office || office.holderId !== d.officialId)
    return reject('not_holder', tr('sys.city.reject.not_holder'));
  if (office.revision !== d.revision) return reject('stale', tr('sys.city.reject.stale'));
  const def = OFFICIAL_ACTIONS[d.action];
  if (!def?.domains.includes(d.domain))
    return reject('bad_action', tr('sys.city.reject.bad_action'));
  const level = actingLevel(office.authority, site.autonomy.value);
  office.revision += 1;
  if (def.level > level) {
    site.status.push(
      tr('sys.city.status.no_authority', {
        name: contentText('city_officials', officialDef(ctx, d.officialId), d.officialId),
        action: actionName(d.action),
      }),
    );
    return reject(
      'no_authority',
      tr('sys.city.reject.no_authority', { action: actionName(d.action), level }),
    );
  }
  const off = officialDef(ctx, d.officialId);
  const res = executeAction(ctx, site, sdef, d.domain, d.action, off);
  const day = today(ctx.tick);
  if (d.action !== 'idle') {
    recordDecision(site.decisions, day, 'official', DECISION_WEIGHT[def.level] as number);
  }
  ctx.emit('city.official_decided', {
    siteId: d.siteId,
    domain: d.domain,
    officialId: d.officialId,
    action: d.action,
    ok: res.ok,
    note: res.note,
  });
  return res.ok ? ok(res.note) : reject('failed', res.note);
}

/** Vacant head posts slowly add dependency after 30 days (8.2: 0.1 per day). */
export function tickVacancies(site: SiteState): number {
  let dep = 0;
  for (const domain of domainsFor(site.stage)) {
    const office = site.offices[domain] ?? newOffice(domain);
    site.offices[domain] = office;
    if (office.holderId) {
      office.vacantDays = 0;
      continue;
    }
    office.vacantDays += 1;
    if (office.vacantDays > 30) dep += 0.1;
  }
  return dep;
}
