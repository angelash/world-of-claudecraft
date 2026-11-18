// Monster and guard brains. Monsters wander near home, aggro on hostile units inside
// their alert radius by what they perceive (perceive.ts: instinct reads presence, the gray
// rule reads a page), chase by threat (raiders take caravans first, door seekers chase the
// biggest door, boss/door_seek.ts), use abilities by priority and their timed registry
// affixes (affixes/timed.ts), flee once at low health (every normal monster; humanoids call
// idle kin within 3 tiles, beasts do not; a lure-fleer runs to dense sediment), and evade
// back home past their leash, healing to full and resetting their boss mechanics. A sealed
// arena (boss/arena.ts) leashes nobody. Wave members march on a target and never leash.
// Allied summons follow their summoner and attack its target, unless their data names a
// quirk for the map (12.3: the colossus remnant drifts toward the ash chamber). Guards
// (combat NPCs placed by other systems) engage hostiles near them and fight in place.
// Ambushers lie in wait until a foe comes near. Nobody picks a fight with a duelist from
// outside the duel.

import type { SystemContext } from '../../core/system';
import { entitiesNear, getEntity, haltEntity, mapById, orderMove, teleportEntity } from '../world';
import type { Entity } from '../world/types';
import { gap, useAbility } from './abilities';
import { ambushWatch, caravanTarget, fleePoint, tickTimedAffixes } from './affixes';
import { pickAbility } from './ai_common';
import { removeAurasWhere } from './auras';
import {
  doorSeekPick,
  drainHolder,
  fightOf,
  hasFight,
  noteSeek,
  oathBound,
  pauseBoss,
  resetBoss,
  tickBoss,
} from './boss';
import { yieldNow } from './death';
import { MELEE_RANGE, monsterDef, secs } from './defs';
import { instinct, SHY_RADIUS, willPick } from './perceive';
import { despawn } from './spawning';
import { deriveStats, isDisabled } from './stats';
import { addThreat, engage, markCombat, syncToParty, threatTarget } from './threat';
import type { Unit } from './types';
import { canAttack, fillUp, inCombat, liveUnit, unitOf } from './units';

const hashes = new Map<string, number>();

/** Stable per-id stagger (memoized: called for every brain every tick). */
function hashId(id: string): number {
  const known = hashes.get(id);
  if (known !== undefined) return known;
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  const v = Math.abs(h);
  hashes.set(id, v);
  return v;
}

/** Every `period` ticks, staggered by unit id. */
function due(ctx: SystemContext, id: string, period: number): boolean {
  return (ctx.tick + hashId(id)) % period === 0;
}

function walkTo(
  ctx: SystemContext,
  u: Unit,
  e: Entity,
  x: number,
  y: number,
  arrive: number,
): void {
  const brain = u.ai;
  if (
    brain &&
    ctx.tick < brain.pathAt &&
    Math.hypot(brain.goalX - x, brain.goalY - y) < 1 &&
    e.move
  ) {
    return;
  }
  if (brain) {
    brain.pathAt = ctx.tick + 8;
    brain.goalX = x;
    brain.goalY = y;
  }
  orderMove(ctx, u.id, x, y, arrive);
}

/** Look for something to fight within the alert radius (perceive.ts decides who). */
function scan(ctx: SystemContext, u: Unit, e: Entity, radius: number): Unit | null {
  const raid = caravanTarget(ctx, u, e, radius);
  if (raid) return raid;
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius + 2)) {
    const other = unitOf(ctx.world, near.id);
    if (!other || other.terrain || !canAttack(ctx.world, u, other)) continue;
    // a duelist is nobody else's to pick a fight with (duel.ts)
    if (other.duel && other.duel !== u.duel) continue;
    if (!willPick(ctx.world, ctx.content, u, other)) continue;
    const r = radius + Math.max(-radius / 2, Math.min(radius / 2, (u.level - other.level) * 0.25));
    if (Math.hypot(near.x - e.x, near.y - e.y) <= r) return other;
  }
  return null;
}

/**
 * A beast's instinct (12.2): something two ranks up within 3 tiles, or three ranks up within
 * the alert radius, sends it running. Returns the one it runs from.
 */
function shyFrom(ctx: SystemContext, u: Unit, e: Entity, radius: number): Entity | null {
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius)) {
    const other = unitOf(ctx.world, near.id);
    if (!other || other.terrain || !canAttack(ctx.world, u, other)) continue;
    const read = instinct(ctx.world, ctx.content, u, other);
    const d = Math.hypot(near.x - e.x, near.y - e.y);
    if (read === 'flee' && d <= radius) return near;
    if (read === 'avoid' && d <= SHY_RADIUS) return near;
  }
  return null;
}

/** Start a fight with no foe on the table yet (a door seeker after a holder, 10.8). */
function wake(ctx: SystemContext, u: Unit, e: Entity): void {
  const brain = u.ai;
  if (!brain) return;
  brain.state = 'chase';
  brain.pullX = e.x;
  brain.pullY = e.y;
  brain.abilityAt = ctx.tick + secs(1);
  syncToParty(ctx, u);
  const ramp = monsterDef(ctx.content, u.monsterId)?.mechanics?.ramp;
  if (ramp) brain.rampAt = ctx.tick + secs(ramp.every);
  markCombat(ctx, u);
}

export function startEvade(ctx: SystemContext, u: Unit): void {
  const brain = u.ai;
  if (!brain) return;
  brain.state = 'evade';
  brain.evadeUntil = ctx.tick + secs(10);
  delete u.partyDamage;
  u.threat = {};
  u.target = null;
  u.autoAttack = false;
  u.cast = null;
  u.forced = undefined;
  resetBoss(ctx, u);
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const o = ctx.world.slices.combat.units[id];
    if (o?.summonerId === u.id && !o.terrain) despawn(ctx, id);
  }
  ctx.emit('combat.evade', { entityId: u.id });
}

function finishEvade(ctx: SystemContext, u: Unit, e: Entity): void {
  const brain = u.ai;
  if (!brain) return;
  if (Math.hypot(e.x - brain.homeX, e.y - brain.homeY) > 1.5) {
    teleportEntity(ctx, u.id, e.mapId, brain.homeX, brain.homeY);
  }
  removeAurasWhere(ctx, u, (a) => a.expires !== 0);
  fillUp(ctx.world, ctx.content, u);
  brain.state = 'idle';
  brain.fled = false;
  brain.wanderAt = ctx.tick + secs(3);
}

/** Close in and fight `target` (shared by monsters, summons and guards). */
function fight(ctx: SystemContext, u: Unit, e: Entity, target: Unit): void {
  u.target = target.id;
  u.autoAttack = true;
  if (u.cast) {
    haltEntity(ctx, e.id);
    return;
  }
  if (u.boss) {
    tickTimedAffixes(ctx, u, e, target);
    if (u.cast) {
      haltEntity(ctx, e.id);
      return;
    }
  }
  const brain = u.ai;
  const nextAbility = brain ? brain.abilityAt : 0;
  if (ctx.tick >= nextAbility && due(ctx, u.id, 10)) {
    if (brain) brain.abilityAt = ctx.tick + secs(1);
    const pick = pickAbility(ctx, u, target, {
      allies: u.side === 'enemy' ? sameSideNear(ctx, u, e) : undefined,
    });
    if (pick) {
      const res = useAbility(ctx, u, pick.abilityId, pick.targetId);
      if (res.ok && u.cast) {
        haltEntity(ctx, e.id);
        return;
      }
    }
  }
  const d = deriveStats(ctx.world, ctx.content, u);
  const reach = d.weapon.range > 0 ? d.weapon.range : MELEE_RANGE;
  const g = gap(ctx.world, u.id, target.id);
  const te = getEntity(ctx.world, target.id);
  if (!te) return;
  if (g > reach) {
    const arrive = d.weapon.range > 0 ? reach * 0.7 : e.radius + te.radius + MELEE_RANGE * 0.6;
    walkTo(ctx, u, e, te.x, te.y, arrive);
  } else if (e.move) {
    haltEntity(ctx, e.id);
  }
}

function sameSideNear(ctx: SystemContext, u: Unit, e: Entity): Unit[] {
  const out: Unit[] = [];
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, 10)) {
    const other = unitOf(ctx.world, near.id);
    if (other && other.side === u.side && !other.terrain) out.push(other);
  }
  return out;
}

/**
 * A pet's quirk (12.3): on the maps its data names it does not obey and walks to the named
 * location instead (the colossus remnant drifts toward the ash chamber near the seal ruins).
 * Returns true while the quirk holds.
 */
function petWanders(ctx: SystemContext, u: Unit, e: Entity): boolean {
  const to = monsterDef(ctx.content, u.monsterId)?.mechanics?.petQuirk?.walkTo[e.mapId];
  if (!to) return false;
  const loc = mapById(ctx.content, e.mapId)?.locations.find((l) => l.id === to);
  if (!loc) return false;
  u.autoAttack = false;
  u.target = null;
  const x = loc.x + loc.w / 2;
  const y = loc.y + loc.h / 2;
  if (Math.hypot(x - e.x, y - e.y) > 1.5) walkTo(ctx, u, e, x, y, 1);
  else if (e.move) haltEntity(ctx, e.id);
  return true;
}

function tickPet(ctx: SystemContext, u: Unit, e: Entity): void {
  const owner = liveUnit(ctx.world, u.summonerId);
  if (!owner) {
    despawn(ctx, u.id);
    return;
  }
  if (petWanders(ctx, u, e)) return;
  const [ou, oe] = owner;
  const pick = unitOf(ctx.world, ou.target) ?? unitOf(ctx.world, threatTarget(ctx.world, u));
  // a pet does not join its master's duel (duel.ts)
  const want = pick?.duel && pick.duel !== u.duel ? undefined : pick;
  if (want && canAttack(ctx.world, u, want) && (ou.combatUntil > ctx.tick || want.id in u.threat)) {
    fight(ctx, u, e, want);
    return;
  }
  u.autoAttack = false;
  if (Math.hypot(oe.x - e.x, oe.y - e.y) > 3 && oe.mapId === e.mapId)
    walkTo(ctx, u, e, oe.x, oe.y, 1.5);
}

/** Run from `from` for five seconds (once a fight): beasts alone, people call idle kin. */
function startFlee(ctx: SystemContext, u: Unit, e: Entity, from: Entity | undefined): void {
  const brain = u.ai;
  if (!brain) return;
  brain.state = 'flee';
  brain.fled = true;
  brain.fleeUntil = ctx.tick + secs(5);
  u.cast = null;
  if (!from) return;
  const p = fleePoint(ctx, u, e, from);
  orderMove(ctx, u.id, p.x, p.y, 0.5);
  // a fleeing person pulls idle kin within 3 tiles into the fight (11 `flee`)
  if (monsterDef(ctx.content, u.monsterId)?.family !== 'humanoid') return;
  const attacker = unitOf(ctx.world, from.id);
  if (!attacker) return;
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, 3)) {
    const kin = unitOf(ctx.world, near.id);
    if (!kin || kin === u || kin.monsterId !== u.monsterId || kin.ai?.state !== 'idle') continue;
    if (canAttack(ctx.world, kin, attacker)) engage(ctx, kin, attacker);
  }
}

/** Whether this monster may still flee (11: every normal monster, once, not oath-bound). */
function mayFlee(ctx: SystemContext, u: Unit): boolean {
  const mon = monsterDef(ctx.content, u.monsterId);
  if (!mon || mon.mechanics?.flee === undefined || u.ai?.fled) return false;
  return (mon.rank ?? 'normal') === 'normal' && !oathBound(ctx.content, u) && !u.summonerId;
}

/** A door seeker's chase tick (10.8); true when the seek took the tick. */
function seekDoors(ctx: SystemContext, u: Unit, e: Entity): boolean {
  const pick = doorSeekPick(ctx, u, e);
  if (!pick) return false;
  noteSeek(ctx, u, pick);
  if (pick.kind === 'player') {
    if (!(pick.unit.id in u.threat)) addThreat(ctx, u, pick.unit.id, 1);
    tickBoss(ctx, u);
    if (u.ai?.state === 'chase') fight(ctx, u, e, pick.unit);
    return true;
  }
  if (pick.kind === 'mark') {
    tickBoss(ctx, u);
    if (u.ai?.state !== 'chase') return true;
    drainHolder(ctx, u, e, pick.entity, (x, y, arrive) => walkTo(ctx, u, e, x, y, arrive));
    return true;
  }
  return false;
}

export function tickMonster(ctx: SystemContext, u: Unit): void {
  const brain = u.ai;
  const e = getEntity(ctx.world, u.id);
  if (!brain || !e?.alive || brain.state === 'yielded') return;
  const mon = monsterDef(ctx.content, u.monsterId);
  // Crowd control only comes from auras, so an aura-free unit skips the stat derivation
  // (this runs every tick for every monster near the party).
  if (u.auras.length > 0 && isDisabled(deriveStats(ctx.world, ctx.content, u))) {
    if (e.move) haltEntity(ctx, e.id);
    return;
  }
  if (u.summonerId && u.side === 'ally') {
    tickPet(ctx, u, e);
    return;
  }
  switch (brain.state) {
    case 'idle': {
      // a paused wave boss healed back to full out of the fight starts its fight over
      const paused = u.boss?.pausedAt !== undefined && !inCombat(ctx.world, u);
      if (paused && u.hp >= deriveStats(ctx.world, ctx.content, u).maxHp) resetBoss(ctx, u);
      if (u.side === 'enemy' && !u.attackable) {
        // an ambusher in wait (11 `ambushEmerge`)
        const foe = ambushWatch(ctx, u, e);
        if (foe) engage(ctx, u, foe);
        return;
      }
      if (u.side === 'enemy' && due(ctx, u.id, 10)) {
        const radius = mon?.aggroRadius ?? 5;
        const shy = shyFrom(ctx, u, e, radius);
        if (shy) {
          const p = fleePoint(ctx, u, e, shy);
          orderMove(ctx, u.id, p.x, p.y, 0.5);
          return;
        }
        const foe = scan(ctx, u, e, radius);
        if (foe) {
          engage(ctx, u, foe);
          return;
        }
        // a door seeker wakes for a door in range (10.8)
        if (doorSeekPick(ctx, u, e)?.kind === 'mark') {
          wake(ctx, u, e);
          return;
        }
      }
      if (u.march) {
        if (Math.hypot(u.march.x - e.x, u.march.y - e.y) <= 1.5) {
          brain.homeX = e.x;
          brain.homeY = e.y;
          u.march = undefined;
        } else if (!e.move || ctx.tick >= brain.pathAt) {
          walkTo(ctx, u, e, u.march.x, u.march.y, 1);
        }
        return;
      }
      if (ctx.tick >= brain.wanderAt) {
        const rng = ctx.rng('combat.ai');
        brain.wanderAt = ctx.tick + rng.int(secs(4), secs(10));
        const a = rng.next() * Math.PI * 2;
        const r = rng.next() * 2.5;
        orderMove(ctx, u.id, brain.homeX + Math.cos(a) * r, brain.homeY + Math.sin(a) * r, 0.3);
      }
      return;
    }
    case 'chase': {
      if (hasFight(mon?.mechanics)) fightOf(ctx, u);
      if (mon?.mechanics?.doorSeek && seekDoors(ctx, u, e)) return;
      const raid = caravanTarget(ctx, u, e, mon?.aggroRadius ?? 5);
      const targetId = raid?.id ?? threatTarget(ctx.world, u);
      const target = unitOf(ctx.world, targetId);
      if (!target) {
        if (u.waveId || u.summonerId) {
          brain.state = 'idle';
          u.target = null;
          u.autoAttack = false;
          // a wave boss stands where it is: its fight goes on (phases passed and adds
          // called stay so) until it is whole again; only its arena opens meanwhile
          if (u.boss) pauseBoss(ctx, u);
          if (u.summonerId) despawn(ctx, u.id);
        } else startEvade(ctx, u);
        return;
      }
      const leashed = !u.waveId && !u.summonerId && !u.boss?.sealed;
      if (leashed && Math.hypot(e.x - brain.pullX, e.y - brain.pullY) > (mon?.leash ?? 18)) {
        startEvade(ctx, u);
        return;
      }
      const flee = mon?.mechanics?.flee;
      if (mayFlee(ctx, u) && u.hp < deriveStats(ctx.world, ctx.content, u).maxHp * (flee ?? 0)) {
        startFlee(ctx, u, e, getEntity(ctx.world, target.id));
        return;
      }
      // a person faced with a presence two ranks up (12.2): yields or flees at once
      const read = instinct(ctx.world, ctx.content, u, target);
      if (read === 'yield' && yieldNow(ctx, u, target)) return;
      if (read === 'flee' && mayFlee(ctx, u)) {
        startFlee(ctx, u, e, getEntity(ctx.world, target.id));
        return;
      }
      tickBoss(ctx, u);
      if (brain.state !== 'chase') return;
      fight(ctx, u, e, target);
      return;
    }
    case 'flee':
      u.autoAttack = false;
      if (ctx.tick >= brain.fleeUntil) brain.state = 'chase';
      return;
    case 'evade':
      if (ctx.tick >= brain.evadeUntil || Math.hypot(e.x - brain.homeX, e.y - brain.homeY) < 0.8) {
        finishEvade(ctx, u, e);
      } else if (!e.move) {
        walkTo(ctx, u, e, brain.homeX, brain.homeY, 0.3);
      }
      return;
  }
}

/** Combat NPCs placed by other systems (guards): engage nearby hostiles and fight. */
export function tickGuard(ctx: SystemContext, u: Unit): void {
  const e = getEntity(ctx.world, u.id);
  if (!e?.alive || u.side === 'neutral') return;
  if (u.auras.length > 0 && isDisabled(deriveStats(ctx.world, ctx.content, u))) return;
  let target = unitOf(ctx.world, threatTarget(ctx.world, u));
  if (!target && due(ctx, u.id, 10)) {
    const foe = scan(ctx, u, e, 6);
    if (foe) {
      engage(ctx, u, foe);
      u.threat[foe.id] = (u.threat[foe.id] ?? 0) + 1;
      target = foe;
    }
  }
  if (!target) {
    if (u.autoAttack) {
      u.autoAttack = false;
      u.target = null;
    }
    return;
  }
  const home = e.home ?? { x: e.x, y: e.y };
  const te = getEntity(ctx.world, target.id);
  if (te && Math.hypot(te.x - home.x, te.y - home.y) > 15) {
    delete u.threat[target.id];
    u.target = null;
    u.autoAttack = false;
    return;
  }
  fight(ctx, u, e, target);
}
