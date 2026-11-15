// Settlement events (city_building 10): fire, plague and monster raids, rolled daily on
// ctx.rng('city.events'). Raid odds pass through the registered 'monster' modifier keyed
// by the site (D-013); raids are settled by the warfare auto-resolve kernel with the
// village militia against the raiders (city_building 11). At most 2 concurrent severe
// events and at least 7 days between severe events. Events while the player is away
// count as trials for the autonomy S term.

import type { Rng } from '../../core/rng';
import type { SystemContext } from '../../core/system';
import { removeItem } from '../inventory';
import { applyModifiers } from '../modifiers';
import { autoResolve, buildFieldSetup } from '../warfare/autoresolve';
import type { ForceSpec } from '../warfare/types';
import { playerEntity } from '../world';
import { recordTrial } from './autonomy';
import {
  buildingDef,
  clamp,
  hasActive,
  isWorking,
  militiaCount,
  stageAtLeast,
  stockOf,
  sumEffect,
  today,
  totalPop,
} from './common';
import { removePopulation } from './population';
import type { CityEventKind, SiteDef, SiteState } from './types';

const RAIDERS = ['sediment_rat', 'bone_hound', 'mud_fiend'];

function logEvent(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  kind: CityEventKind,
  severity: 'minor' | 'severe',
  text: string,
  ok: boolean,
): void {
  const day = today(ctx.tick);
  site.eventLog.push({ day, kind, severity, text });
  if (site.eventLog.length > 30) site.eventLog.splice(0, site.eventLog.length - 30);
  if (severity === 'severe') site.lastSevereDay = day;
  const away = playerEntity(ctx.world)?.mapId !== sdef.mapId;
  if (away) recordTrial(site.trials, day, ok, severity === 'severe' ? 3 : 1);
  ctx.emit('city.event', { siteId: site.id, kind, severity, text, ok });
}

function tempEffect(
  site: SiteState,
  day: number,
  kind: 'happiness' | 'health',
  value: number,
  label: string,
  days = 7,
): void {
  site.effects.push({ id: `${kind}:${label}`, kind, value, untilDay: day + days, label });
}

function rollFire(
  ctx: SystemContext,
  site: SiteState,
  sdef: SiteDef,
  rng: Rng,
  canSevere: boolean,
): void {
  const working = site.buildings.filter(isWorking);
  if (working.length === 0) return;
  const wooden = working.filter((b) =>
    buildingDef(ctx.content, b.defId)?.tags?.includes('wooden'),
  ).length;
  const p = clamp(
    0.004 +
      0.0015 * wooden +
      sumEffect(site, ctx.content, 'fireRisk') -
      (hasActive(site, 'guardhouse') ? 0.003 : 0),
    0,
    0.08,
  );
  if (!rng.chance(p)) return;
  const target = working[Math.floor(rng.next() * working.length)];
  if (!target) return;
  const severe = canSevere && rng.chance(0.3);
  const fought = site.security >= 50;
  const damage = Math.round((severe ? 70 : 35) * (fought ? 0.5 : 1));
  target.condition = Math.max(0, target.condition - damage);
  const day = today(ctx.tick);
  tempEffect(site, day, 'happiness', -3, '火灾');
  const name = buildingDef(ctx.content, target.defId)?.name ?? target.defId;
  if (severe) site.severe.push({ kind: 'fire', untilDay: day + 3 });
  logEvent(
    ctx,
    site,
    sdef,
    'fire',
    severe ? 'severe' : 'minor',
    fought ? `${name}起火，巡夜的人及时扑救，损失不大` : `${name}起火，烧坏了不少`,
    fought,
  );
}

function rollPlague(ctx: SystemContext, site: SiteState, sdef: SiteDef, rng: Rng): void {
  const pop = totalPop(site);
  const crowd = site.housing > 0 ? Math.max(0, pop - site.housing) / site.housing : 1;
  const clinic = hasActive(site, 'clinic');
  const p = 0.002 * (1 + crowd) * (site.health < 50 ? 2 : 1) * (clinic ? 0.3 : 1);
  if (!rng.chance(p)) return;
  const day = today(ctx.tick);
  site.severe.push({ kind: 'plague', untilDay: day + 7 });
  tempEffect(site, day, 'health', -30, '疫病');
  tempEffect(site, day, 'happiness', -4, '疫病');
  const dead = Math.max(1, Math.floor(pop * (clinic ? 0.01 : 0.03)));
  removePopulation(ctx, site, dead, '疫病');
  logEvent(
    ctx,
    site,
    sdef,
    'plague',
    'severe',
    clinic ? `疫病流行，医馆控制住了，${dead} 人没能熬过去` : `疫病流行，${dead} 人病死`,
    clinic,
  );
}

/** Defending force from militia, tower archers and hunters. */
export function defenders(ctx: SystemContext, site: SiteState): ForceSpec {
  const regiments: ForceSpec['regiments'] = [];
  const militia = militiaCount(site, ctx.content);
  if (militia > 0) regiments.push({ typeId: 'militia', count: militia, id: 'militia' });
  let longbow = 0;
  let hunters = 0;
  for (const b of site.buildings) {
    if (!isWorking(b)) continue;
    const n = buildingDef(ctx.content, b.defId)?.effects?.archers ?? 0;
    if (b.defId === 'hunter_lodge') hunters += n;
    else longbow += n;
  }
  if (longbow > 0)
    regiments.push({ typeId: 'longbow_militia', count: longbow, id: 'tower_archers' });
  if (hunters > 0) regiments.push({ typeId: 'hunters', count: hunters, id: 'hunters' });
  return { regiments };
}

function rollRaid(ctx: SystemContext, site: SiteState, sdef: SiteDef, rng: Rng): void {
  const base = stageAtLeast(site.stage, 'village') ? 0.012 : 0.006;
  const p = clamp(
    applyModifiers(ctx.world, 'monster', site.id, base) + (site.sediment >= 2 ? 0.005 : 0),
    0,
    1,
  );
  if (!rng.chance(p)) return;
  const day = today(ctx.tick);
  const pop = totalPop(site);
  const raiderType = RAIDERS[Math.floor(rng.next() * RAIDERS.length)] as string;
  const raiderCount = 8 + rng.int(0, 8) + Math.floor(pop / 15);
  const guard = defenders(ctx, site);
  const units = ctx.content.regiment_types ?? [];
  const seed = rng.int(1, 0x7ffffff0);
  let won = false;
  let lost = 0;
  const raiderName = units.find((u) => u.id === raiderType)?.name ?? '魔物';
  if (guard.regiments.length > 0 && units.some((u) => u.id === raiderType)) {
    const setup = buildFieldSetup({
      name: `${sdef.name}遭袭`,
      teams: { player: guard, enemy: { regiments: [{ typeId: raiderType, count: raiderCount }] } },
      terrain: 'plain',
      width: 24,
      height: 14,
      timeLimit: 300,
    });
    const res = autoResolve({
      setup,
      units,
      abilities: ctx.content.hero_abilities ?? [],
      seed,
      flags: ctx.world.meta.flags,
      maxSeconds: 300,
    });
    won = res.victor === 'player';
    lost = Math.max(0, res.teams.player.start - res.teams.player.end);
  } else {
    lost = Math.min(pop, Math.ceil(raiderCount / 3));
  }
  site.severe.push({ kind: 'raid', untilDay: day + 3 });
  const dead = Math.min(totalPop(site), Math.round(lost * 0.4));
  if (dead > 0) removePopulation(ctx, site, dead, '袭击伤亡');
  if (won) {
    logEvent(
      ctx,
      site,
      sdef,
      'raid',
      'severe',
      `${raiderName}来袭，民兵击退了它们${dead > 0 ? `，${dead} 人阵亡` : ''}`,
      true,
    );
    return;
  }
  const stock = stockOf(ctx.world, sdef.stockOwner);
  const staple = ctx.content.city_config.staple;
  const grainLost = Math.floor((stock[staple] ?? 0) * 0.2);
  if (grainLost > 0) removeItem(ctx, sdef.stockOwner, staple, grainLost, 'raid');
  const working = site.buildings.filter(isWorking);
  const hit = working[Math.floor(rng.next() * working.length)];
  if (hit) hit.condition = Math.max(0, hit.condition - 40);
  tempEffect(site, day, 'happiness', -5, '遭袭');
  logEvent(
    ctx,
    site,
    sdef,
    'raid',
    'severe',
    `${raiderName}冲进了村子，抢走 ${grainLost} 份粮${dead > 0 ? `，${dead} 人遇难` : ''}`,
    false,
  );
}

export function runEvents(ctx: SystemContext, site: SiteState, sdef: SiteDef): void {
  if (sdef.kind !== 'settlement') return;
  const day = today(ctx.tick);
  site.severe = site.severe.filter((s) => s.untilDay >= day);
  if (totalPop(site) <= 0) return;
  const rng = ctx.rng('city.events');
  const canSevere = site.severe.length < 2 && day - site.lastSevereDay >= 7;
  rollFire(ctx, site, sdef, rng, canSevere);
  if (canSevere && site.severe.length < 2 && day - site.lastSevereDay >= 7)
    rollRaid(ctx, site, sdef, rng);
  if (site.severe.length < 2 && day - site.lastSevereDay >= 7) rollPlague(ctx, site, sdef, rng);
}
