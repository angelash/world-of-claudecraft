// Auto-attack (white swings and auto shots) and the 2-second regeneration tick.

import type { SystemContext } from '../../core/system';
import { gap } from './abilities';
import { applyAura } from './auras';
import { resolveHit } from './damage';
import { FIVE_SECOND_RULE, MELEE_RANGE, monsterDef, secs } from './defs';
import { ENERGY_PER_TICK, hpRegenPerTick, manaRegenPerTick, RAGE_DECAY_PER_TICK } from './formulas';
import { deriveStats, isDisabled } from './stats';
import type { Unit } from './types';
import { canAttack, liveUnit, unitOf } from './units';

export function tickAutoAttack(ctx: SystemContext, u: Unit): void {
  if (!u.autoAttack || u.cast || u.downed) return;
  const target = unitOf(ctx.world, u.target);
  if (!target || !liveUnit(ctx.world, target.id) || !canAttack(ctx.world, u, target)) {
    u.autoAttack = false;
    return;
  }
  if (ctx.tick < u.swingAt) return;
  const d = deriveStats(ctx.world, ctx.content, u);
  if (isDisabled(d)) return;
  const reach = d.weapon.range > 0 ? d.weapon.range : MELEE_RANGE;
  if (gap(ctx.world, u.id, target.id) > reach) return;
  const haste = 1 + Math.max(-0.5, d.stats.haste / 100);
  u.swingAt = ctx.tick + Math.max(4, Math.round(secs(d.weapon.speed) / haste));
  const roll = ctx.rng('combat.dmg').range(d.weapon.min, Math.max(d.weapon.min, d.weapon.max));
  const amount = d.weapon.flat ? roll : roll + (d.stats.ap / 14) * d.weapon.speed;
  const mon = monsterDef(ctx.content, u.monsterId);
  const school = mon?.school ?? 'physical';
  const kind = school !== 'physical' ? 'spell' : d.weapon.range > 2 ? 'ranged' : 'melee';
  const r = resolveHit(ctx, { source: u, target, amount, school, kind, rage: true });
  if (r.dealt > 0 && mon?.mechanics?.onHit && liveUnit(ctx.world, target.id)) {
    const rng = ctx.rng('combat.ai');
    for (const h of mon.mechanics.onHit) {
      if (rng.next() < h.chance) applyAura(ctx, target, h.aura, u);
    }
  }
}

export function tickRegen(ctx: SystemContext, u: Unit): void {
  if (!liveUnit(ctx.world, u.id)) return;
  const d = deriveStats(ctx.world, ctx.content, u);
  const fighting = u.combatUntil > ctx.tick;
  if (!fighting && u.hp < d.maxHp) {
    u.hp = Math.min(d.maxHp, u.hp + hpRegenPerTick(d.stats.sta, d.maxHp));
  }
  if (u.res.mana !== undefined && ctx.tick - u.manaSpentAt >= FIVE_SECOND_RULE) {
    u.res.mana = Math.min(
      d.maxRes.mana ?? 0,
      u.res.mana + manaRegenPerTick(u.classId, d.stats.spi),
    );
  }
  if (u.res.energy !== undefined) {
    u.res.energy = Math.min(d.maxRes.energy ?? 100, u.res.energy + ENERGY_PER_TICK);
  }
  if (u.res.rage !== undefined && !fighting) {
    u.res.rage = Math.max(0, u.res.rage - RAGE_DECAY_PER_TICK);
  }
}
