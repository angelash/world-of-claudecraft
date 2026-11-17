// Death and its alternatives. Enemies die (entity.died, combat.kill, rewards, corpse and
// respawn bookkeeping) or yield at a health threshold (Sasha retreats, the raven falls
// without dying). Companions go down until revived, counting their downs in the fight
// (15.2). The player returns through the door (combat_and_classes.md 15.1;
// thousand_doors.md 6.3), settled in this order in the same tick:
//   1. entity.died; the player leaves every threat table;
//   2. overload: earlier deaths within one game day, at most three;
//   3. the drop bag where the player fell (death_costs.ts);
//   4. durability: equipped pieces -10% (the inventory system's applyDeathWear);
//   5. blockage: +3 per overload stack (the doors system, on combat.player_returned);
//   6. witnesses: believers within sight (feat.performed `door_return`);
//   7. the corridor: the player reforms after one game hour plus half an hour per overload
//      stack, in the inner court once it is open, else in the sigil hall of the ruins (the
//      location tagged `revive` on the wake map); full health and pools, timed auras gone,
//      the revival-fatigue state for 2 + floor(door rank / 10) game hours (at most 10)
//      times (1 + 0.5 x stacks) times the difficulty's death-fatigue factor;
//   8. combat.player_returned with the stacks, the bag, the money, the revival, the fatigue
//      floor (60 times the difficulty factor) and the witnesses.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_MINUTE } from '../../core/time';
import { getEntity, haltEntity, mapById, respawnMap, setLife, teleportEntity } from '../world';
import type { Entity, LocationDef, MapDef } from '../world/types';
import { applyAura, removeAurasWhere } from './auras';
import { deathWear, dropBag, witnessesOf } from './death_costs';
import { CORPSE_TICKS, monsterDef, secs } from './defs';
import { combatMod } from './difficulty';
import { doorFatigueMinutes, RETURN_FATIGUE_FLOOR, revivalMinutes } from './formulas';
import { award } from './rewards';
import { deriveStats } from './stats';
import { forgetAttacker } from './threat';
import type { PendingReturn, Unit } from './types';
import { fillUp, refreshTags } from './units';

/** The revival-fatigue state of a return through the door (15.1). */
export const REVIVAL_FATIGUE = 'aur_st_revival_fatigue';
/** The tag of the location the player reforms at while the inner court is closed. */
export const REVIVE_TAG = 'revive';

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
  haltEntity(ctx, u.id);
  refreshTags(ctx, u);
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
    fallThroughDoor(ctx, u, e);
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
    u.downs = (u.downs ?? 0) + 1;
    setLife(ctx, e.id, false);
    return;
  }
  setLife(ctx, e.id, false);
  if (mon) {
    award(ctx, u, killer, false);
    ctx.world.slices.combat.corpses[u.id] = ctx.tick + CORPSE_TICKS;
  }
}

/** Bring a downed or dead unit back with a share of health (companions, guards). */
export function reviveUnit(ctx: SystemContext, u: Unit, hpPct: number): void {
  const e = getEntity(ctx.world, u.id);
  if (!e) return;
  setLife(ctx, e.id, true);
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

/** The inner court's arrival point, once feature.inner_court is set. */
function courtPoint(ctx: SystemContext): { mapId: string; x: number; y: number } | undefined {
  if (!ctx.flag('feature.inner_court')) return undefined;
  const court = respawnMap(ctx.content, 'door');
  if (!court) return undefined;
  const spot = safeLocations(court)[0];
  const p = spot ? centre(spot) : { x: court.width / 2, y: court.height / 2 };
  return { mapId: court.id, ...p };
}

/**
 * Where the door puts the player back without a death (the return charm, 14.2): the inner
 * court, else the nearest safe point.
 */
export function returnPoint(
  ctx: SystemContext,
  e: Entity,
): { mapId: string; x: number; y: number; innerCourt: boolean } {
  const court = courtPoint(ctx);
  if (court) return { ...court, innerCourt: true };
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
  const ruins = respawnMap(ctx.content, 'wake');
  const wake = ruins ? safeLocations(ruins)[0] : undefined;
  if (ruins && wake) return { mapId: ruins.id, ...centre(wake), innerCourt: false };
  return { mapId: e.mapId, x: e.x, y: e.y, innerCourt: false };
}

/**
 * Where the player reforms after a death (15.1): the inner court once it is open, else the
 * sigil hall of the ruins where the first door stands (the location tagged `revive` on the
 * wake map), else the wake point.
 */
export function revivalPoint(
  ctx: SystemContext,
  e: Entity,
): { mapId: string; x: number; y: number; innerCourt: boolean } {
  const court = courtPoint(ctx);
  if (court) return { ...court, innerCourt: true };
  const ruins = respawnMap(ctx.content, 'wake');
  const hall = ruins?.locations.find((l) => l.tags?.includes(REVIVE_TAG));
  if (ruins && hall) return { mapId: ruins.id, ...centre(hall), innerCourt: false };
  return returnPoint(ctx, e);
}

/** Steps 1 to 6 of 15.1 at the fatal blow; steps 7 and 8 when the revival is over. */
function fallThroughDoor(ctx: SystemContext, u: Unit, e: Entity): void {
  const slice = ctx.world.slices.combat;
  // 1. out of every fight
  forgetAttacker(ctx.world, u.id);
  u.cast = null;
  u.autoAttack = false;
  u.target = null;
  u.threat = {};
  u.combo = 0;
  u.combatUntil = 0;
  // the fight ends in a death: the death's wear replaces the fight's (13.2)
  delete u.fighting;
  // 2. overload
  slice.deaths = slice.deaths.filter((t) => t > ctx.tick - TICKS_PER_GAME_DAY);
  const overload = Math.min(3, slice.deaths.length);
  slice.deaths.push(ctx.tick);
  // 3. the drop bag
  const bag = dropBag(ctx, u.id, { mapId: e.mapId, x: e.x, y: e.y });
  // 4. durability
  deathWear(ctx, u.id);
  // 5. blockage is the doors system's, on combat.player_returned
  // 6. witnesses
  const witnesses = witnessesOf(ctx, e);
  if (witnesses.length > 0) {
    ctx.emit('feat.performed', {
      actorId: u.id,
      kind: 'door_return',
      tier: u.tier,
      mapId: e.mapId,
      x: e.x,
      y: e.y,
    });
  }
  // 7. into the corridor: the body is gone until the revival is over
  setLife(ctx, u.id, false);
  const dest = revivalPoint(ctx, e);
  const rank = ctx.flag('door_rank');
  const factor = combatMod(ctx.world, 'death_fatigue');
  const fatigueMinutes = doorFatigueMinutes(typeof rank === 'number' ? rank : 1, overload, factor);
  const revivalTicks = revivalMinutes(overload) * TICKS_PER_GAME_MINUTE;
  const pending: PendingReturn = {
    at: ctx.tick + revivalTicks,
    playerId: u.id,
    fromMap: e.mapId,
    x: e.x,
    y: e.y,
    toMap: dest.mapId,
    toX: dest.x,
    toY: dest.y,
    innerCourt: dest.innerCourt,
    overload,
    moneyLost: bag?.money ?? 0,
    revivalTicks,
    fatigueTicks: fatigueMinutes * TICKS_PER_GAME_MINUTE,
    fatigueMinutes,
    fatigueFloor: Math.round(RETURN_FATIGUE_FLOOR * factor),
    witnessed: witnesses.length,
  };
  if (bag) pending.packId = bag.id;
  slice.pendingReturn = pending;
}

/** The revival is over (or a skip ran past it): reform the player and report the return. */
export function tickReturn(ctx: SystemContext, upTo = ctx.tick): void {
  const slice = ctx.world.slices.combat;
  const p = slice.pendingReturn;
  if (!p || p.at > upTo) return;
  delete slice.pendingReturn;
  const e = getEntity(ctx.world, p.playerId);
  if (!e) return;
  teleportEntity(ctx, p.playerId, p.toMap, p.toX, p.toY);
  setLife(ctx, p.playerId, true);
  const u = slice.units[p.playerId];
  if (!u) return;
  // timed auras are gone; taint, blockage and door fatigue stay (8.2); the injuries are the
  // ailment system's passives, which it clears on this event
  removeAurasWhere(ctx, u, (a) => a.expires !== 0);
  fillUp(ctx.world, ctx.content, u);
  applyAura(ctx, u, REVIVAL_FATIGUE, u, { durationTicks: Math.max(1, p.fatigueTicks) });
  const after = getEntity(ctx.world, u.id);
  ctx.emit('combat.player_returned', {
    fromMap: p.fromMap,
    x: p.x,
    y: p.y,
    toMap: after?.mapId ?? p.toMap,
    toX: after?.x ?? p.toX,
    toY: after?.y ?? p.toY,
    innerCourt: p.innerCourt,
    moneyLost: p.moneyLost,
    fatigueMinutes: p.fatigueMinutes,
    overload: p.overload,
    ...(p.packId ? { packId: p.packId } : {}),
    revivalTicks: p.revivalTicks,
    fatigueFloor: p.fatigueFloor,
    witnessed: p.witnessed,
  });
}
