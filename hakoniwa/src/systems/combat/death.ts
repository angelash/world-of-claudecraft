// Death and its alternatives. Enemies die (entity.died, combat.kill, rewards, corpse and
// respawn bookkeeping) or yield at a health threshold (Sasha retreats, the raven falls
// without dying). The player returns through the door (power_system.md 9.8): wakes in
// the inner court when feature.inner_court is set, otherwise at the nearest safe point,
// pays with door fatigue and a share of carried money. Companions go down until revived.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_MINUTE } from '../../core/time';
import { holdingOf, spendMoney } from '../inventory';
import { getEntity, mapById, teleportEntity } from '../world';
import type { Entity, LocationDef, MapDef } from '../world/types';
import { applyAura, removeAurasWhere } from './auras';
import { CORPSE_TICKS, monsterDef, secs } from './defs';
import { halt, setAlive } from './entity_ops';
import { DEATH_MONEY_LOSS, doorFatigueMinutes } from './formulas';
import { award } from './rewards';
import { deriveStats } from './stats';
import { forgetAttacker } from './threat';
import type { Unit } from './types';
import { fillUp, refreshTags } from './units';

/** Yield instead of dying when the monster's yield threshold is crossed. */
export function maybeYield(ctx: SystemContext, u: Unit, source: Unit | null): boolean {
  const mon = monsterDef(ctx.content, u.monsterId);
  const at = mon?.mechanics?.yieldAtPct;
  if (at === undefined || !u.ai || u.ai.state === 'yielded') return false;
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  if (u.hp > max * at) return false;
  u.hp = Math.max(1, Math.round(max * at));
  u.ai.state = 'yielded';
  u.ai.despawnAt =
    mon?.mechanics?.despawnAfterYield !== undefined
      ? ctx.tick + secs(mon.mechanics.despawnAfterYield)
      : 0;
  u.side = 'neutral';
  u.threat = {};
  u.target = null;
  u.autoAttack = false;
  u.cast = null;
  u.forced = undefined;
  forgetAttacker(ctx.world, u.id);
  removeAurasWhere(ctx, u, (a) => a.expires !== 0);
  const e = getEntity(ctx.world, u.id);
  if (e) halt(e);
  refreshTags(ctx.world, u);
  if (mon?.mechanics?.yieldSay && e) {
    ctx.emit('dialogue.line', {
      speakerId: u.id,
      speakerName: e.name,
      text: mon.mechanics.yieldSay,
      kind: 'say',
    });
  }
  if (mon) ctx.setFlag(`boss.${mon.id}.yielded`, true);
  award(ctx, u, source, true);
  return true;
}

export function killUnit(ctx: SystemContext, u: Unit, killer: Unit | null): void {
  const e = getEntity(ctx.world, u.id);
  if (!e?.alive || u.downed) return;
  u.hp = 0;
  const died = {
    id: u.id,
    name: e.name,
    ref: e.ref,
    kind: e.kind as string,
    killerId: killer?.id,
    mapId: e.mapId,
    x: e.x,
    y: e.y,
  };
  if (e.id === ctx.world.slices.world.playerId) {
    ctx.emit('entity.died', died);
    returnThroughDoor(ctx, u, e);
    return;
  }
  const mon = monsterDef(ctx.content, u.monsterId);
  ctx.emit('entity.died', died);
  ctx.emit('combat.kill', {
    killerId: killer?.id,
    killerSide: killer?.side,
    victimId: u.id,
    victimRef: e.ref,
    monsterId: mon?.id,
    family: mon?.family,
    rank: mon?.rank ?? (mon ? 'normal' : 'unit'),
    level: u.level,
    tier: u.tier,
    side: u.side,
    mapId: e.mapId,
  });
  u.cast = null;
  u.autoAttack = false;
  u.target = null;
  u.threat = {};
  removeAurasWhere(ctx, u, (a) => a.expires !== 0);
  forgetAttacker(ctx.world, u.id);
  if (e.kind === 'companion') {
    u.downed = true;
    setAlive(e, false);
    return;
  }
  setAlive(e, false);
  if (mon) {
    award(ctx, u, killer, false);
    ctx.world.slices.combat.corpses[u.id] = ctx.tick + CORPSE_TICKS;
  }
}

/** Bring a downed or dead unit back with a share of health (companions, guards). */
export function reviveUnit(ctx: SystemContext, u: Unit, hpPct: number): void {
  const e = getEntity(ctx.world, u.id);
  if (!e) return;
  setAlive(e, true);
  u.downed = false;
  fillUp(ctx.world, ctx.content, u);
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  u.hp = Math.max(1, Math.round(max * Math.max(0.01, Math.min(1, hpPct))));
  ctx.emit('combat.revived', { entityId: u.id, hpPct });
}

function safeLocations(map: MapDef): LocationDef[] {
  return map.locations.filter(
    (l) => l.kind === 'safe' || l.kind === 'wake_point' || l.id === 'wake_point',
  );
}

function centre(l: LocationDef): { x: number; y: number } {
  return { x: l.x + l.w / 2, y: l.y + l.h / 2 };
}

/** Where the door puts the player back (inner court, else the nearest safe point). */
export function returnPoint(
  ctx: SystemContext,
  e: Entity,
): { mapId: string; x: number; y: number; innerCourt: boolean } {
  if (ctx.flag('feature.inner_court')) {
    const court = mapById(ctx.content, 'inner_court');
    if (court) {
      const spot = safeLocations(court)[0];
      const p = spot ? centre(spot) : { x: court.width / 2, y: court.height / 2 };
      return { mapId: court.id, ...p, innerCourt: true };
    }
  }
  const here = mapById(ctx.content, e.mapId);
  if (here) {
    const spots = safeLocations(here)
      .map((l) => ({ l, d: Math.hypot(centre(l).x - e.x, centre(l).y - e.y) }))
      .sort((a, b) => a.d - b.d);
    if (spots[0]) return { mapId: here.id, ...centre(spots[0].l), innerCourt: false };
    for (const exit of here.exits) {
      const next = mapById(ctx.content, exit.toMap);
      const spot = next ? safeLocations(next)[0] : undefined;
      if (next && spot) return { mapId: next.id, ...centre(spot), innerCourt: false };
    }
  }
  const ruins = mapById(ctx.content, 'seal_ruins');
  const wake = ruins ? safeLocations(ruins)[0] : undefined;
  if (ruins && wake) return { mapId: ruins.id, ...centre(wake), innerCourt: false };
  return { mapId: e.mapId, x: e.x, y: e.y, innerCourt: false };
}

function returnThroughDoor(ctx: SystemContext, u: Unit, e: Entity): void {
  const slice = ctx.world.slices.combat;
  slice.deaths = slice.deaths.filter((t) => t > ctx.tick - TICKS_PER_GAME_DAY);
  const recent = slice.deaths.length;
  slice.deaths.push(ctx.tick);
  const from = { mapId: e.mapId, x: e.x, y: e.y };
  const dest = returnPoint(ctx, e);
  forgetAttacker(ctx.world, u.id);
  u.cast = null;
  u.autoAttack = false;
  u.target = null;
  u.threat = {};
  u.combo = 0;
  u.combatUntil = 0;
  removeAurasWhere(ctx, u, (a) => a.expires !== 0);
  teleportEntity(ctx, u.id, dest.mapId, dest.x, dest.y);
  fillUp(ctx.world, ctx.content, u);
  const minutes = doorFatigueMinutes(u.level, recent);
  applyAura(ctx, u, 'door_fatigue', u, { durationTicks: minutes * TICKS_PER_GAME_MINUTE });
  const money = holdingOf(ctx.world, u.id).money;
  const lost = Math.floor(money * DEATH_MONEY_LOSS);
  if (lost > 0) spendMoney(ctx, u.id, lost, 'door_return');
  const after = getEntity(ctx.world, u.id);
  ctx.emit('combat.player_returned', {
    fromMap: from.mapId,
    x: from.x,
    y: from.y,
    toMap: after?.mapId ?? dest.mapId,
    toX: after?.x ?? dest.x,
    toY: after?.y ?? dest.y,
    innerCourt: dest.innerCourt,
    moneyLost: lost,
    fatigueMinutes: minutes,
  });
}
