// Player orders on a settlement: founding the village (city 1.2), policy cards (standing
// orders that raise institution coverage) and micro-management (fast, precise, but each
// adds dependency per city_building 8.2 and counts as a player decision for the D term).

import { type CommandResult, ok, reject } from '../../core';
import type { SystemContext } from '../../core/system';
import { playerEntity } from '../world';
import { addDependency, DECISION_WEIGHT, recordDecision } from './autonomy';
import {
  domainsFor,
  foodValue,
  hasActive,
  policyDef,
  siteDef,
  stageAtLeast,
  stageCaps,
  stockOf,
  sumEffect,
  today,
  totalPop,
} from './common';
import { rushBuilding } from './construction';
import { presence } from './court';
import { writeFlags } from './daily';
import type { MicroAction, SiteState } from './types';

export const FOUND_MIN_POP = 30;
export const FOUND_FOOD_DAYS = 10;

export function policySlots(ctx: SystemContext, site: SiteState): number {
  const sdef = siteDef(ctx.content, site.id);
  if (!sdef) return 0;
  return stageCaps(sdef, site.stage).policySlots + sumEffect(site, ctx.content, 'policySlots');
}

export function foundVillage(ctx: SystemContext, siteId: string): CommandResult {
  const site = ctx.world.slices.city.sites[siteId];
  const sdef = siteDef(ctx.content, siteId);
  if (!site || !sdef || sdef.kind !== 'settlement') return reject('unknown_site', '没有这个聚落');
  if (site.stage !== 'outpost') return reject('already', '这里已经是村落了');
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const pop = totalPop(site);
  if (pop < FOUND_MIN_POP)
    return reject('population', `立村需要 ${FOUND_MIN_POP} 位立誓的居民，现在只有 ${pop} 位`);
  if (!hasActive(site, 'communal_stove')) return reject('stove', '要先建好公灶');
  const food = foodValue(stockOf(ctx.world, sdef.stockOwner), ctx.content.city_config);
  if (food < pop * FOUND_FOOD_DAYS)
    return reject(
      'food',
      `存粮不够 ${FOUND_FOOD_DAYS} 天（需要 ${pop * FOUND_FOOD_DAYS} 份，现有 ${Math.floor(food)} 份）`,
    );
  site.stage = 'village';
  for (const domain of domainsFor('village')) {
    site.offices[domain] = site.offices[domain] ?? {
      domain,
      authority: 2,
      revision: 0,
      vacantDays: 0,
    };
  }
  ctx.setFlag('a2_village_founded', true);
  writeFlags(ctx);
  ctx.emit('city.stage_changed', { siteId, from: 'outpost', to: 'village' });
  ctx.emit('dialogue.line', {
    speakerId: 'narrator',
    speakerName: '',
    text: `${pop} 人立下同住誓，${sdef.name}的第一口公灶点燃了。`,
    kind: 'narrate',
  });
  const p = playerEntity(ctx.world);
  if (p) {
    ctx.emit('feat.performed', {
      actorId: p.id,
      kind: 'build',
      tier: 1,
      mapId: p.mapId,
      x: p.x,
      y: p.y,
      note: `${sdef.name}立村`,
    });
  }
  return ok(`${sdef.name}成为了村落`);
}

export function setPolicy(
  ctx: SystemContext,
  d: { siteId: string; policyId: string; enabled: boolean },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef || sdef.kind !== 'settlement') return reject('unknown_site', '没有这个聚落');
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const def = policyDef(ctx.content, d.policyId);
  if (!def) return reject('unknown_policy', '没有这条政策');
  const has = site.policies.includes(def.id);
  if (!d.enabled) {
    if (!has) return reject('not_enabled', '这条政策本来就没有施行');
    site.policies = site.policies.filter((p) => p !== def.id);
    return ok(`废止了${def.name}`);
  }
  if (has) return reject('already', '这条政策已经在施行');
  if (!stageAtLeast(site.stage, def.minStage)) return reject('stage', '聚落规模还不够施行这条政策');
  const clash = site.policies.find((p) => def.exclusive?.includes(p));
  if (clash) return reject('exclusive', `和${policyDef(ctx.content, clash)?.name ?? clash}冲突`);
  const slots = policySlots(ctx, site);
  if (site.policies.length >= slots) return reject('slots', `政策槽已满（最多 ${slots} 条）`);
  site.policies.push(def.id);
  return ok(`施行${def.name}`);
}

export function micro(
  ctx: SystemContext,
  d: { siteId: string; action: MicroAction; target?: string },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef || sdef.kind !== 'settlement') return reject('unknown_site', '没有这个聚落');
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const day = today(ctx.tick);
  const done = (label: string, dep: number, weight: number, info: string): CommandResult => {
    addDependency(site.autonomy, day, label, dep);
    recordDecision(site.decisions, day, 'player', weight);
    return ok(info);
  };
  switch (d.action) {
    case 'boost': {
      const targets = d.target
        ? site.buildings.filter((b) => b.id === d.target && b.status === 'active')
        : site.buildings.filter((b) => b.status === 'active');
      if (targets.length === 0) return reject('no_building', '没有可以督工的建筑');
      for (const b of targets) b.boostUntilDay = day + 3;
      return done('亲自督工', 0.2, DECISION_WEIGHT[2] as number, '亲自督工，三天内产出提高');
    }
    case 'rush':
      if (!d.target || !rushBuilding(ctx, site, d.target))
        return reject('no_building', '没有正在建造的这座建筑');
      return done('亲自赶工', 0.3, DECISION_WEIGHT[2] as number, '亲自赶工，工期缩短一天');
    case 'handle_dispute':
      site.effects.push({
        id: 'happiness:亲自调解',
        kind: 'happiness',
        value: 2,
        untilDay: day + 3,
        label: '亲自调解',
      });
      return done('越过官员处理纠纷', 0.5, DECISION_WEIGHT[2] as number, '亲自调解了纠纷');
    case 'personal_defense':
      site.effects.push({
        id: 'security:亲自坐镇',
        kind: 'security',
        value: 20,
        untilDay: day + 3,
        label: '亲自坐镇',
      });
      return done('亲自出手解决危机', 3, DECISION_WEIGHT[4] as number, '亲自坐镇，三天内治安大增');
  }
  return reject('bad_action', '不认识的安排');
}
