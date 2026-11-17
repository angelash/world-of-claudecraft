// Combat during a time skip (travel_and_exploration.md 7.3 to 7.5, "战斗与刷新"): no
// fighting and no monster brains on an hour-coarse step; respawn timers, corpses, waves
// and presence settle once per step; auras run out; every unit out of combat recovers what
// its regeneration ticks of the hour would have given. A completed sleep restores the
// sleeper and the companions beside it to full.
//
// No content today defines a periodic (damage or heal over time) or pulse aura (checked
// against data/combat/auras.json and the catalogs): a skip's hour-coarse step only expires
// auras, it does not settle a periodic tick's damage or healing, because that would mean
// inventing the interaction with armour, crit and threat for a path nothing exercises
// (CLAUDE.md "don't invent balance numbers"). `noteMissedPeriodic` below flags the one
// case that would make this wrong, as a loud failure rather than a silent one, so the
// package that first ships such an aura sees it instead of a quiet mismatch between the
// short and long tiers.

import type { SkipStep, SystemContext } from '../../core/system';
import { registerSkipHandler } from '../travel/skip_registry';
import { getEntity } from '../world';
import { expireAuras } from './auras';
import { tickRegen } from './auto_attack';
import { auraDef, REGEN_EVERY } from './defs';
import { tickPresence } from './presence';
import { tickSpawns } from './spawning';
import type { Unit } from './types';
import { fillUp, sortedUnitIds } from './units';

/** Regeneration ticks of the live clock that fell inside the step. */
export function regenTicksIn(step: SkipStep): number {
  return Math.floor(step.to / REGEN_EVERY) - Math.floor(step.from / REGEN_EVERY);
}

function pools(u: Unit): string {
  return `${u.hp}|${u.res.mana ?? ''}|${u.res.energy ?? ''}|${u.res.rage ?? ''}`;
}

/**
 * A periodic or pulse aura crossing this coarse step: not settled (see the module note).
 * An internal error, kept out of the string tables (D-077): this is a developer signal
 * that content has outrun this handler, never a player-facing condition.
 */
function noteMissedPeriodic(ctx: SystemContext, u: Unit): void {
  for (const a of u.auras) {
    const def = auraDef(ctx.content, a.id);
    if (def?.periodic || def?.pulse) {
      throw new Error(
        `time skip: aura ${a.id} on ${u.id} has a periodic or pulse effect combat/skip.ts does not settle`,
      );
    }
  }
}

/** One hour-coarse step of combat. */
export function combatSkip(ctx: SystemContext, step: SkipStep): void {
  tickSpawns(ctx);
  const slice = ctx.world.slices.combat;
  const regens = regenTicksIn(step);
  for (const id of sortedUnitIds(ctx.world)) {
    const u = slice.units[id];
    if (!u) continue;
    const e = getEntity(ctx.world, id);
    if (!e) {
      delete slice.units[id];
      continue;
    }
    if (!e.alive || u.downed) continue;
    noteMissedPeriodic(ctx, u);
    expireAuras(ctx, u);
    // regeneration until the pools stop moving (full, or nothing regenerates)
    for (let i = 0; i < regens; i++) {
      const before = pools(u);
      tickRegen(ctx, u);
      if (pools(u) === before) break;
    }
  }
  tickPresence(ctx);
}

/** A sleep that ran to its end: the sleeper and the companions on its map wake rested (7.3). */
export function restAfterSleep(ctx: SystemContext, entityId: string): void {
  const me = getEntity(ctx.world, entityId);
  if (!me) return;
  for (const id of sortedUnitIds(ctx.world)) {
    const e = getEntity(ctx.world, id);
    const u = ctx.world.slices.combat.units[id];
    if (!e || !u || !e.alive || u.downed || e.mapId !== me.mapId) continue;
    if (id === entityId || e.kind === 'companion') fillUp(ctx.world, ctx.content, u);
  }
}

registerSkipHandler('combat', combatSkip);
