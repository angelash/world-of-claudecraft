// Player orders on a settlement: founding the village (city 1.2), policy cards (standing
// orders that raise institution coverage) and micro-management (fast, precise, but each
// adds dependency per city_building 8.2 and counts as a player decision for the D term).

import { type CommandResult, ok, reject } from '../../core';
import { contentText } from '../../core/content_key';
import type { SystemContext } from '../../core/system';
import { joinText, type KeyText, tr } from '../../core/text';
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
  if (!site || !sdef || sdef.kind !== 'settlement')
    return reject('unknown_site', tr('sys.city.reject.unknown_site'));
  if (site.stage !== 'outpost') return reject('already', tr('sys.city.reject.already_village'));
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const pop = totalPop(site);
  if (pop < FOUND_MIN_POP)
    return reject(
      'population',
      tr('sys.city.reject.found_population', { need: FOUND_MIN_POP, pop }),
    );
  if (!hasActive(site, 'communal_stove')) return reject('stove', tr('sys.city.reject.found_stove'));
  const food = foodValue(stockOf(ctx.world, sdef.stockOwner), ctx.content.city_config);
  if (food < pop * FOUND_FOOD_DAYS)
    return reject(
      'food',
      tr('sys.city.reject.found_food', {
        days: FOUND_FOOD_DAYS,
        need: pop * FOUND_FOOD_DAYS,
        have: Math.floor(food),
      }),
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
    text: tr('sys.city.log.village_founded', { pop, site: contentText('city_sites', sdef) }),
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
      note: tr('sys.city.feat.village_founded', { site: contentText('city_sites', sdef) }),
    });
  }
  return ok(tr('sys.city.info.village_founded', { site: contentText('city_sites', sdef) }));
}

export function setPolicy(
  ctx: SystemContext,
  d: { siteId: string; policyId: string; enabled: boolean },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef || sdef.kind !== 'settlement')
    return reject('unknown_site', tr('sys.city.reject.unknown_site'));
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const def = policyDef(ctx.content, d.policyId);
  if (!def) return reject('unknown_policy', tr('sys.city.reject.unknown_policy'));
  const has = site.policies.includes(def.id);
  if (!d.enabled) {
    if (!has) return reject('not_enabled', tr('sys.city.reject.policy_inactive'));
    site.policies = site.policies.filter((p) => p !== def.id);
    return ok(tr('sys.city.info.policy_revoked', { policy: contentText('city_policies', def) }));
  }
  if (has) return reject('already', tr('sys.city.reject.policy_active'));
  if (!stageAtLeast(site.stage, def.minStage))
    return reject('stage', tr('sys.city.reject.policy_stage'));
  const clash = site.policies.find((p) => def.exclusive?.includes(p));
  if (clash)
    return reject(
      'exclusive',
      tr('sys.city.reject.policy_clash', {
        policy: contentText('city_policies', policyDef(ctx.content, clash), clash),
      }),
    );
  const slots = policySlots(ctx, site);
  if (site.policies.length >= slots)
    return reject('slots', tr('sys.city.reject.policy_slots', { n: slots }));
  site.policies.push(def.id);
  return ok(tr('sys.city.info.policy_enacted', { policy: contentText('city_policies', def) }));
}

export function micro(
  ctx: SystemContext,
  d: { siteId: string; action: MicroAction; target?: string },
): CommandResult {
  const site = ctx.world.slices.city.sites[d.siteId];
  const sdef = siteDef(ctx.content, d.siteId);
  if (!site || !sdef || sdef.kind !== 'settlement')
    return reject('unknown_site', tr('sys.city.reject.unknown_site'));
  const pres = presence(ctx, site, sdef);
  if (!pres.ok) return reject(pres.code, pres.reason);
  const day = today(ctx.tick);
  const done = (label: KeyText, dep: number, weight: number, info: KeyText): CommandResult => {
    addDependency(site.autonomy, day, label, dep);
    recordDecision(site.decisions, day, 'player', weight);
    return ok(info);
  };
  switch (d.action) {
    case 'boost': {
      const targets = d.target
        ? site.buildings.filter((b) => b.id === d.target && b.status === 'active')
        : site.buildings.filter((b) => b.status === 'active');
      if (targets.length === 0) return reject('no_building', tr('sys.city.reject.no_boost_target'));
      for (const b of targets) b.boostUntilDay = day + 3;
      return done(
        tr('sys.city.dep.boost'),
        0.2,
        DECISION_WEIGHT[2] as number,
        tr('sys.city.info.boost'),
      );
    }
    case 'rush':
      if (!d.target || !rushBuilding(ctx, site, d.target))
        return reject('no_building', tr('sys.city.reject.no_rush_target'));
      return done(
        tr('sys.city.dep.rush'),
        0.3,
        DECISION_WEIGHT[2] as number,
        tr('sys.city.info.rush'),
      );
    case 'handle_dispute':
      site.effects.push({
        // the readable id renders as before: '<kind>:<label>'
        id: joinText('none', ['happiness:', tr('sys.city.effect.dispute')]),
        kind: 'happiness',
        value: 2,
        untilDay: day + 3,
        label: tr('sys.city.effect.dispute'),
      });
      return done(
        tr('sys.city.dep.dispute'),
        0.5,
        DECISION_WEIGHT[2] as number,
        tr('sys.city.info.dispute'),
      );
    case 'personal_defense':
      site.effects.push({
        id: joinText('none', ['security:', tr('sys.city.effect.defense')]),
        kind: 'security',
        value: 20,
        untilDay: day + 3,
        label: tr('sys.city.effect.defense'),
      });
      return done(
        tr('sys.city.dep.defense'),
        3,
        DECISION_WEIGHT[4] as number,
        tr('sys.city.info.defense'),
      );
  }
  return reject('bad_action', tr('sys.city.reject.unknown_action'));
}
