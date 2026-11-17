// The trigger points combat itself knows (combat_and_classes.md 13.3): `combat_start` when a
// unit enters combat, and `low_hp` when its health falls from 30% or more to below 30%. The
// inventory system checks the worn pieces, sets and enchants and fires what passes
// (`fireProcs`, emitting `item.proc`); combat supplies what the moment is: the inventory's own
// reading (target family, sediment, night, region) plus `solo` (one foe engaged) and the
// holder's health fraction.

import type { SystemContext } from '../../core/system';
import { envFor, fireProcs, type ProcEnv } from '../inventory';
import { deriveStats } from './stats';
import type { Unit } from './types';
import { isHostilePair, liveUnit } from './units';

/** Health fraction below which `low_hp` fires on the way down (13.3). */
export const LOW_HP = 0.3;

/** Foes engaged with a unit: hostile units it fights or that fight it (target or threat). */
export function foesEngaged(ctx: SystemContext, u: Unit): number {
  let n = 0;
  for (const o of Object.values(ctx.world.slices.combat.units)) {
    if (o === u || !isHostilePair(o, u)) continue;
    if (o.target !== u.id && !(u.id in o.threat) && !(o.id in u.threat)) continue;
    if (liveUnit(ctx.world, o.id)) n++;
  }
  return n;
}

/** The moment as the triggers read it, for `u` against `targetId`. */
export function procEnv(ctx: SystemContext, u: Unit, targetId?: string): ProcEnv {
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  return {
    ...envFor(ctx, u.id, targetId),
    solo: foesEngaged(ctx, u) === 1,
    hpFrac: max > 0 ? u.hp / max : 1,
  };
}

/** A unit entered combat (it was out of it until now). */
export function combatStarted(ctx: SystemContext, u: Unit, foeId?: string): void {
  fireProcs(ctx, u.id, 'combat_start', { targetId: foeId, env: () => procEnv(ctx, u, foeId) });
}

/** A unit's health moved from `before` to its current value. */
export function healthFell(ctx: SystemContext, u: Unit, before: number, sourceId?: string): void {
  if (u.hp <= 0 || u.hp >= before) return;
  const max = deriveStats(ctx.world, ctx.content, u).maxHp;
  if (max <= 0 || before < max * LOW_HP || u.hp >= max * LOW_HP) return;
  fireProcs(ctx, u.id, 'low_hp', { targetId: sourceId, env: () => procEnv(ctx, u, sourceId) });
}
