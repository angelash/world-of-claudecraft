// Monster and guard brains. Monsters wander near home, aggro on hostile units inside
// their alert radius (gray targets are ignored), chase by threat, use abilities by
// priority, flee once at low health (humanoids and burrowers), and evade back home
// past their leash, healing to full. Wave members march on a target and never leash.
// Allied summons follow their summoner and attack its target. Guards (combat NPCs
// placed by other systems) engage hostiles near them and fight in place.

import type { SystemContext } from '../../core/system';
import { entitiesNear, getEntity, orderMove, teleportEntity } from '../world';
import type { Entity } from '../world/types';
import { gap, useAbility } from './abilities';
import { pickAbility } from './ai_common';
import { removeAurasWhere } from './auras';
import { resetBoss, tickBoss } from './boss';
import { MELEE_RANGE, monsterDef, secs } from './defs';
import { halt } from './entity_ops';
import { grayLevel } from './formulas';
import { despawn } from './spawning';
import { deriveStats, isDisabled } from './stats';
import { engage, threatTarget } from './threat';
import type { Unit } from './types';
import { canAttack, fillUp, liveUnit, unitOf } from './units';

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

/** Look for something to fight within the alert radius. */
function scan(ctx: SystemContext, u: Unit, e: Entity, radius: number): Unit | null {
  const mon = monsterDef(ctx.content, u.monsterId);
  const elite = mon?.rank && mon.rank !== 'normal';
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius + 2)) {
    const other = unitOf(ctx.world, near.id);
    if (!other || !canAttack(ctx.world, u, other)) continue;
    if (!elite && u.side === 'enemy' && grayLevel(other.level) >= u.level) continue;
    const r = radius + Math.max(-radius / 2, Math.min(radius / 2, (u.level - other.level) * 0.25));
    if (Math.hypot(near.x - e.x, near.y - e.y) <= r) return other;
  }
  return null;
}

export function startEvade(ctx: SystemContext, u: Unit): void {
  const brain = u.ai;
  if (!brain) return;
  brain.state = 'evade';
  brain.evadeUntil = ctx.tick + secs(10);
  u.threat = {};
  u.target = null;
  u.autoAttack = false;
  u.cast = null;
  u.forced = undefined;
  resetBoss(u);
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    if (ctx.world.slices.combat.units[id]?.summonerId === u.id) despawn(ctx, id);
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
    halt(e);
    return;
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
        halt(e);
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
    halt(e);
  }
}

function sameSideNear(ctx: SystemContext, u: Unit, e: Entity): Unit[] {
  const out: Unit[] = [];
  for (const near of entitiesNear(ctx.world, e.mapId, e.x, e.y, 10)) {
    const other = unitOf(ctx.world, near.id);
    if (other && other.side === u.side) out.push(other);
  }
  return out;
}

function tickPet(ctx: SystemContext, u: Unit, e: Entity): void {
  const owner = liveUnit(ctx.world, u.summonerId);
  if (!owner) {
    despawn(ctx, u.id);
    return;
  }
  const [ou, oe] = owner;
  const want = unitOf(ctx.world, ou.target) ?? unitOf(ctx.world, threatTarget(ctx.world, u));
  if (want && canAttack(ctx.world, u, want) && (ou.combatUntil > ctx.tick || want.id in u.threat)) {
    fight(ctx, u, e, want);
    return;
  }
  u.autoAttack = false;
  if (Math.hypot(oe.x - e.x, oe.y - e.y) > 3 && oe.mapId === e.mapId)
    walkTo(ctx, u, e, oe.x, oe.y, 1.5);
}

export function tickMonster(ctx: SystemContext, u: Unit): void {
  const brain = u.ai;
  const e = getEntity(ctx.world, u.id);
  if (!brain || !e?.alive || brain.state === 'yielded') return;
  const mon = monsterDef(ctx.content, u.monsterId);
  // Crowd control only comes from auras, so an aura-free unit skips the stat derivation
  // (this runs every tick for every monster near the party).
  if (u.auras.length > 0 && isDisabled(deriveStats(ctx.world, ctx.content, u))) {
    if (e.move) halt(e);
    return;
  }
  if (u.summonerId && u.side === 'ally') {
    tickPet(ctx, u, e);
    return;
  }
  switch (brain.state) {
    case 'idle': {
      if (u.side === 'enemy' && due(ctx, u.id, 10)) {
        const foe = scan(ctx, u, e, mon?.aggroRadius ?? 5);
        if (foe) {
          engage(ctx, u, foe);
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
      const targetId = threatTarget(ctx.world, u);
      const target = unitOf(ctx.world, targetId);
      if (!target) {
        if (u.waveId || u.summonerId) {
          brain.state = 'idle';
          u.target = null;
          u.autoAttack = false;
          if (u.summonerId) despawn(ctx, u.id);
        } else startEvade(ctx, u);
        return;
      }
      const leashed = !u.waveId && !u.summonerId;
      if (leashed && Math.hypot(e.x - brain.pullX, e.y - brain.pullY) > (mon?.leash ?? 18)) {
        startEvade(ctx, u);
        return;
      }
      const flee = mon?.mechanics?.flee;
      const canFlee =
        flee !== undefined &&
        (mon?.rank ?? 'normal') === 'normal' &&
        (mon?.family === 'humanoid' || mon?.family === 'burrower');
      if (
        canFlee &&
        !brain.fled &&
        u.hp < deriveStats(ctx.world, ctx.content, u).maxHp * (flee ?? 0)
      ) {
        brain.state = 'flee';
        brain.fled = true;
        brain.fleeUntil = ctx.tick + secs(5);
        u.cast = null;
        const te = getEntity(ctx.world, target.id);
        if (te) {
          const dx = e.x - te.x;
          const dy = e.y - te.y;
          const len = Math.hypot(dx, dy) || 1;
          orderMove(ctx, u.id, e.x + (dx / len) * 6, e.y + (dy / len) * 6, 0.5);
        }
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
