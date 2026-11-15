// Threat tables and engagement. Every unit keeps a table (monsters and guards use it to
// choose targets). Target switching follows the classic 110% rule. Engaging an idle
// monster also pulls idle kin of the same kind nearby (social aggro).

import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { entitiesNear, getEntity } from '../world';
import { COMBAT_LINGER, monsterDef, secs } from './defs';
import type { Unit } from './types';
import { canAttack, fillUp, liveUnit, setLevel, unitOf } from './units';

export function markCombat(ctx: SystemContext, u: Unit): void {
  u.combatUntil = Math.max(u.combatUntil, ctx.tick + COMBAT_LINGER);
}

export function addThreat(
  ctx: SystemContext,
  holder: Unit,
  attackerId: string,
  amount: number,
): void {
  if (holder.ai?.state === 'evade' || holder.ai?.state === 'yielded') return;
  holder.threat[attackerId] = (holder.threat[attackerId] ?? 0) + Math.max(0, amount);
  markCombat(ctx, holder);
}

/** Put an idle monster into the fight against `attacker` and pull its idle kin. */
export function engage(ctx: SystemContext, u: Unit, attacker: Unit): void {
  if (!(attacker.id in u.threat)) u.threat[attacker.id] = 1;
  markCombat(ctx, u);
  markCombat(ctx, attacker);
  const brain = u.ai;
  if (brain?.state !== 'idle') return;
  const e = getEntity(ctx.world, u.id);
  if (!e) return;
  brain.state = 'chase';
  brain.pullX = e.x;
  brain.pullY = e.y;
  brain.abilityAt = ctx.tick + secs(1);
  const mon = monsterDef(ctx.content, u.monsterId);
  syncToParty(ctx, u);
  if (mon?.mechanics?.ramp) brain.rampAt = ctx.tick + secs(mon.mechanics.ramp.every);
  const radius = mon?.mechanics?.social ?? 3;
  if (radius <= 0 || !u.monsterId) return;
  for (const other of entitiesNear(ctx.world, e.mapId, e.x, e.y, radius)) {
    const ou = unitOf(ctx.world, other.id);
    if (!ou || ou === u || ou.monsterId !== u.monsterId || ou.ai?.state !== 'idle') continue;
    if (!canAttack(ctx.world, ou, attacker)) continue;
    engage(ctx, ou, attacker);
  }
}

/**
 * Story encounters level-synced to the party (mechanics.partySync): when the monster is
 * first pulled, its level becomes the player's level plus the offset, kept between the
 * sync floor and the monster's own maximum (its design level). A scripted story beat the
 * player cannot defer stays a fight of the intended shape at any story-following level.
 */
export function syncToParty(ctx: SystemContext, u: Unit): void {
  const mon = monsterDef(ctx.content, u.monsterId);
  const sync = mon?.mechanics?.partySync;
  if (!mon || !sync) return;
  const player = unitOf(ctx.world, ctx.world.slices.world.playerId);
  if (!player) return;
  const level = Math.max(sync.min ?? 1, Math.min(mon.maxLevel, player.level + sync.offset));
  if (level === u.level) return;
  setLevel(ctx, u, level);
  fillUp(ctx.world, ctx.content, u);
}

/** The unit's current target by threat (110% rule; taunts force the target for a while). */
export function threatTarget(world: World, u: Unit): string | null {
  if (u.forced && u.forced.until > world.meta.tick) {
    const f = liveUnit(world, u.forced.id);
    if (f && canAttack(world, u, f[0]) && sameMap(world, u.id, f[0].id)) return u.forced.id;
  }
  let best: string | null = null;
  let bestThreat = -1;
  for (const id of Object.keys(u.threat).sort()) {
    const t = liveUnit(world, id);
    if (!t || !canAttack(world, u, t[0]) || !sameMap(world, u.id, id)) continue;
    const v = u.threat[id] ?? 0;
    if (v > bestThreat) {
      best = id;
      bestThreat = v;
    }
  }
  const cur = u.target;
  if (cur && cur !== best && cur in u.threat) {
    const t = liveUnit(world, cur);
    if (t && canAttack(world, u, t[0]) && sameMap(world, u.id, cur)) {
      if (bestThreat <= (u.threat[cur] ?? 0) * 1.1) return cur;
    }
  }
  return best;
}

export function sameMap(world: World, a: string, b: string): boolean {
  const ea = getEntity(world, a);
  const eb = getEntity(world, b);
  return !!ea && !!eb && ea.mapId === eb.mapId;
}

/** Remove one attacker from every table (it left, died, or went through the door). */
export function forgetAttacker(world: World, id: string): void {
  for (const u of Object.values(world.slices.combat.units)) {
    if (id in u.threat) delete u.threat[id];
    if (u.target === id) u.target = null;
    if (u.forced?.id === id) u.forced = undefined;
  }
}

/** Taunt: jump to the top of the table and force the target for three seconds. */
export function taunt(ctx: SystemContext, holder: Unit, taunter: Unit): void {
  let top = 0;
  for (const v of Object.values(holder.threat)) top = Math.max(top, v);
  holder.threat[taunter.id] = Math.max(holder.threat[taunter.id] ?? 0, top * 1.1 + 1);
  holder.forced = { id: taunter.id, until: ctx.tick + secs(3) };
  holder.target = taunter.id;
  engage(ctx, holder, taunter);
}
