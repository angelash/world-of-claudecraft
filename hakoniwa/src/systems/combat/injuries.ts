// Where injuries come from in combat (progression_and_pacing.md 10.1, 10.2; combat_and_classes
// .md 9.4). The ailments system keeps every injury, its aura and its clock; combat only says
// that one happened, through that system's command `ailments.injure` (applied on the next
// tick), and never decides how long it lasts:
// - a companion or general who went down in a fight and is brought back up: a light wound;
// - a boss skill whose data names an injury, on a hit that lands on the player's side;
// - the tempering gate's backlash: half of all breakthroughs (the breakthrough itself is
//   the progression of companions; `temperBacklash` is its port).
// The player only ever takes the light wound and the maimed limbs (the ailments system
// refuses the rest). Chances roll on `combat.proc`, and only when they are below one.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';
import type { AbilityDef, Unit } from './types';
import { isPartySide } from './units';

/** Half of all tempering breakthroughs backlash (progression_and_pacing.md 8.2). */
export const TEMPER_BACKLASH_CHANCE = 0.5;

type InjuryKind = 'light' | 'maimed_arm' | 'maimed_leg' | 'backlash' | 'relapse';

/** Report an injury to the ailments system. */
export function injure(ctx: SystemContext, entityId: string, kind: InjuryKind): void {
  ctx.dispatch('ailments.injure', { entityId, kind }, { type: 'system', system: 'combat' });
}

/** A boss skill's injury on a hit that landed on the player's side. */
export function injureOnHit(ctx: SystemContext, caster: Unit, def: AbilityDef, t: Unit): void {
  const inj = def.injure;
  if (!inj || caster.side === t.side || !isPartySide(ctx.world, t)) return;
  const chance = inj.chance ?? 1;
  if (chance < 1 && ctx.rng('combat.proc').next() >= chance) return;
  injure(ctx, t.id, inj.kind);
}

/** A companion brought back up after going down in a fight carries a light wound. */
export function injureRevived(ctx: SystemContext, u: Unit, wasDown: boolean): void {
  if (!wasDown || getEntity(ctx.world, u.id)?.kind !== 'companion') return;
  injure(ctx, u.id, 'light');
}

/**
 * The tempering gate's breakthrough (progression_and_pacing.md 8.2): half of them backlash.
 * Returns whether this one did (the caller runs the breakthrough).
 */
export function temperBacklash(ctx: SystemContext, entityId: string): boolean {
  if (ctx.rng('combat.proc').next() >= TEMPER_BACKLASH_CHANCE) return false;
  injure(ctx, entityId, 'backlash');
  return true;
}
