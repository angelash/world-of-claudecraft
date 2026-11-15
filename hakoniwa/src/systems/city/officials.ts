// Officials (city_building 7.4): appointing named NPCs to domains, the weekly
// official.decide request (AI proposal or utility fallback, carrying a revision), and
// executing an official action within min(authority, 1 + floor(A / 25)).

import { type CommandResult, ok, reject } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { CommandSource } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import { buyFromMarket, marketPrice, sellToMarket } from '../economy/ports';
import { formatMoney, spendMoney } from '../inventory';
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
  DOMAIN_LABELS,
  type Domain,
  type OfficeState,
  type OfficialActionId,
  type OfficialDef,
  type SiteDef,
  type SiteState,
} from './types';

export interface OfficialActionDef {
  domains: Domain[];
  level: number;
  name: string;
  desc: string;
}

export const OFFICIAL_ACTIONS: Record<OfficialActionId, OfficialActionDef> = {
  idle: { domains: [...ALL_DOMAINS], level: 1, name: '按兵不动', desc: '本周不做额外安排' },
  ration: { domains: ['food'], level: 1, name: '定量配给', desc: '口粮减一成，持续七天，民心略降' },
  prioritize_food: {
    domains: ['food'],
    level: 1,
    name: '先保粮食',
    desc: '催促田间与渔猎，七天内产出略增',
  },
  buy_food: {
    domains: ['food', 'commerce'],
    level: 2,
    name: '采购口粮',
    desc: '用金库的钱从集市买粮',
  },
  repair: { domains: ['works'], level: 1, name: '修缮', desc: '用库存材料修好最破的一座建筑' },
  build_housing: {
    domains: ['works', 'civil'],
    level: 2,
    name: '加盖住房',
    desc: '在空地上加盖一座住房',
  },
  build_storage: { domains: ['works'], level: 2, name: '加盖仓房', desc: '在空地上加盖一座仓房' },
  patrol: { domains: ['security', 'military'], level: 1, name: '加强巡逻', desc: '七天内治安提高' },
  curfew: { domains: ['security'], level: 2, name: '宵禁', desc: '七天内治安大幅提高，民心下降' },
  settle: {
    domains: ['civil', 'culture'],
    level: 1,
    name: '安抚人心',
    desc: '走访居民，七天内民心提高',
  },
  welcome_refugees: {
    domains: ['civil'],
    level: 2,
    name: '收留难民',
    desc: '把等在路边的难民接进村',
  },
  festival: {
    domains: ['civil', 'culture'],
    level: 2,
    name: '办节庆',
    desc: '花一笔钱办节庆，民心大涨',
  },
  sell_surplus: {
    domains: ['commerce'],
    level: 2,
    name: '出售余货',
    desc: '把积压的材料拉去集市卖掉',
  },
  drill: {
    domains: ['military', 'security'],
    level: 1,
    name: '操练民兵',
    desc: '七天内可用民兵增加',
  },
  study: { domains: ['research', 'culture'], level: 1, name: '钻研', desc: '整理记录，培养后进' },
};

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
    if (!ctx.flag('slg.nation_founded')) return reject('no_nation', '还没有立国');
    offices = city.nation.offices;
    allowed = ALL_DOMAINS;
  } else {
    const site = city.sites[d.siteId];
    const sdef = siteDef(ctx.content, d.siteId);
    if (!site || !sdef || sdef.kind !== 'settlement') return reject('unknown_site', '没有这个聚落');
    offices = site.offices;
    allowed = domainsFor(site.stage);
  }
  if (!allowed.includes(d.domain))
    return reject('domain_locked', `现在还没有设${DOMAIN_LABELS[d.domain] ?? d.domain}这个职务`);
  const office = offices[d.domain] ?? newOffice(d.domain);
  offices[d.domain] = office;
  const rank = d.rank ?? 'head';
  if (d.authority !== undefined) office.authority = clamp(Math.round(d.authority), 1, 4);
  if (!d.npcId) {
    if (rank === 'head') office.holderId = undefined;
    else office.deputyId = undefined;
    office.revision += 1;
    return ok(`${DOMAIN_LABELS[d.domain]}${rank === 'head' ? '主官' : '副手'}空缺了`);
  }
  const off = officialDef(ctx, d.npcId);
  if (!off || !flagsOk(ctx.world.meta.flags, off.requiresFlags))
    return reject('unknown_official', '这个人现在不能任命');
  for (const o of Object.values(offices)) {
    if (!o || o.domain === d.domain) continue;
    if (o.holderId === d.npcId || o.deputyId === d.npcId)
      return reject('busy', `${off.name}已经在管别的事了`);
  }
  if (rank === 'head') {
    office.holderId = d.npcId;
    if (office.deputyId === d.npcId) office.deputyId = undefined;
  } else {
    if (office.holderId === d.npcId) return reject('busy', `${off.name}已经是主官了`);
    office.deputyId = d.npcId;
  }
  office.vacantDays = 0;
  office.revision += 1;
  return ok(`任命${off.name}为${DOMAIN_LABELS[d.domain]}${rank === 'head' ? '主官' : '副手'}`);
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
  label: string,
): void {
  site.effects.push({ id: `${kind}:${label}`, kind, value, untilDay: day + 7, label });
}

/** Run an action; returns a readable note and whether it did something. */
export function executeAction(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  domain: Domain,
  action: OfficialActionId,
  off: OfficialDef | undefined,
): { ok: boolean; note: string } {
  const day = today(ctx.tick);
  const f = 0.5 + competence(off, domain) / 100;
  const owner = sdef.stockOwner;
  const leak = off ? (1 - off.integrity / 100) * 0.1 : 0;
  switch (action) {
    case 'idle':
    case 'study':
      return { ok: true, note: '本周照常' };
    case 'ration':
      addTemp(site, 'ration', 0.1, day, '定量配给');
      addTemp(site, 'happiness', -1, day, '定量配给');
      return { ok: true, note: '口粮减一成' };
    case 'prioritize_food':
      addTemp(site, 'production', 0.05 * f, day, '先保粮食');
      return { ok: true, note: '田间与渔猎加紧' };
    case 'buy_food': {
      const market = sdef.tradeMarket;
      if (!market) return { ok: false, note: '附近没有能买粮的集市' };
      const staple = ctx.content.city_config.staple;
      const price = marketPrice(ctx.world, ctx.content, market, staple);
      if (!price || price <= 0) return { ok: false, note: '集市上买不到粮' };
      const budget = Math.floor(treasuryOf(ctx.world, owner) * 0.5);
      const qty = Math.min(totalPop(site) * 7, Math.floor(budget / (price * 1.2)));
      if (qty <= 0) return { ok: false, note: '金库没钱买粮' };
      const res = buyFromMarket(ctx, market, owner, staple, qty, 'city.buy_food');
      if (!res.ok) return { ok: false, note: res.reason };
      const lost = Math.floor(res.total * leak);
      if (lost > 0) spendMoney(ctx, owner, Math.min(lost, treasuryOf(ctx.world, owner)), 'graft');
      return {
        ok: true,
        note: `买进 ${qty} 份粮，花了 ${formatMoney(res.total)}${lost > 0 ? `（账上另少了 ${formatMoney(lost)}）` : ''}`,
      };
    }
    case 'repair': {
      const name = repairOne(ctx, site, sdef, 70);
      return name
        ? { ok: true, note: `修好了${name}` }
        : { ok: false, note: '没有可修的，或材料不够' };
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
        if (res.result.ok) return { ok: true, note: res.result.info ?? '开工了' };
      }
      return { ok: false, note: '找不到合适的空地或材料不够' };
    }
    case 'patrol':
      addTemp(site, 'security', 10 * f, day, '加强巡逻');
      return { ok: true, note: '巡逻加密' };
    case 'curfew':
      addTemp(site, 'security', 15 * f, day, '宵禁');
      addTemp(site, 'happiness', -2, day, '宵禁');
      return { ok: true, note: '实行宵禁' };
    case 'settle':
      addTemp(site, 'happiness', Math.round(2 * f), day, '官员安抚');
      return { ok: true, note: '走访安抚' };
    case 'welcome_refugees': {
      const room = Math.min(
        site.housing - totalPop(site),
        stageCaps(sdef, site.stage).population - totalPop(site),
      );
      const n = addPopulation(ctx, site, sdef, 'refugees', Math.min(5, room), '官员收留难民');
      return n > 0 ? { ok: true, note: `收留了 ${n} 名难民` } : { ok: false, note: '没有住处了' };
    }
    case 'festival': {
      const cost = 200;
      if (treasuryOf(ctx.world, owner) < cost) return { ok: false, note: '金库没钱办节庆' };
      spendMoney(ctx, owner, cost, 'festival');
      addTemp(site, 'happiness', Math.round(4 * f), day, '节庆');
      return { ok: true, note: '办了一场节庆' };
    }
    case 'sell_surplus': {
      const market = sdef.tradeMarket;
      if (!market) return { ok: false, note: '附近没有集市' };
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
        ? { ok: true, note: `卖掉余货，进账 ${formatMoney(total)}` }
        : { ok: false, note: '没卖出去' };
    }
    case 'drill':
      addTemp(site, 'militia', Math.round(3 * f), day, '操练民兵');
      addTemp(site, 'security', 3, day, '操练民兵');
      return { ok: true, note: '民兵操练' };
  }
  return { ok: false, note: '不认识的安排' };
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
      .map((a) => ({ id: a.id, name: a.name, level: a.level, desc: a.desc }));
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
      persona: off ? `${off.name}：${off.desc}` : office.holderId,
      situation:
        `${sdef.name}人口 ${pop}，存粮约 ${site.foodDays} 天，幸福 ${Math.round(site.happiness)}，` +
        `治安 ${Math.round(site.security)}，库房 ${site.storageUsed}/${site.storageCap}，` +
        `金库 ${formatMoney(treasuryOf(ctx.world, sdef.stockOwner))}。你主管${DOMAIN_LABELS[domain]}，本周能自行决定的最高等级是 ${level}。`,
      goals: ['让聚落不靠领主也能运转', `把${DOMAIN_LABELS[domain]}的事办好`],
      commands: {
        'city.official_act':
          '数据 {siteId, domain, officialId, action, revision}，action 从 extra.menu 里选一个 id，其余字段照抄 extra。',
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
  if (source.type === 'player') return reject('not_official', '这是官员自己的决定，不能代为下达');
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef) return reject('unknown_site', '没有这个聚落');
  const office = site.offices[d.domain];
  if (!office || office.holderId !== d.officialId)
    return reject('not_holder', '这个人现在不管这件事');
  if (office.revision !== d.revision) return reject('stale', '情况已经变了，这个安排作废');
  const def = OFFICIAL_ACTIONS[d.action];
  if (!def?.domains.includes(d.domain)) return reject('bad_action', '这不是这个职务能做的安排');
  const level = actingLevel(office.authority, site.autonomy.value);
  office.revision += 1;
  if (def.level > level) {
    site.status.push(
      `${officialDef(ctx, d.officialId)?.name ?? d.officialId}想要${def.name}，但职权不够，等你批示`,
    );
    return reject('no_authority', `${def.name}超出了职权（目前最多能自行决定等级 ${level} 的事）`);
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
