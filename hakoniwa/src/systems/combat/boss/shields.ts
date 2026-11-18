// Shield phases and stagger (combat_and_classes.md 10.4). A shield goes up by health line,
// fight time or phase (or a `shield` action): an `absorb` shield soaks damage before every
// absorb aura and shows its amount, an `immune` one turns every hit to `immune`. It breaks
// by its `breakBy`: the absorb run dry or plain damage (`damage`), every add of the boss
// down (`adds`), an arena object broken or used (`terrain`), a hit of a named ability
// (`ability`), or its seconds (`timer`). While a shield holds, every cast of the boss counts
// as uninterruptible. A break may stagger the boss (at most 6 seconds) and lay an aura. The
// stagger (`aur_st_stagger`) is a state, not a control: it lands through the boss's control
// immunity, outside the ladders, and breaks the cast in progress.

import type { SystemContext } from '../../../core/system';
import { interruptCast } from '../abilities';
import { applyAura } from '../auras';
import { scaled, secs } from '../defs';
import type { ShieldPhaseDef } from '../mech_types';
import { deriveStats } from '../stats';
import type { Unit } from '../types';
import { liveUnit } from '../units';
import { fightOf, healthFrac, mechOf, pastSec } from './fight';

/** The stagger state of bosses (catalog_abilities_talents.md 7.4). */
export const STAGGER = 'aur_st_stagger';
/** The longest stagger (10.4: as long as the longest control cap). */
export const STAGGER_CAP = 6;

/** Stagger a boss: its cast breaks, it cannot move, cast or swing for the seconds given. */
export function staggerBoss(ctx: SystemContext, u: Unit, seconds: number, source?: Unit): boolean {
  if (!liveUnit(ctx.world, u.id) || seconds <= 0) return false;
  interruptCast(ctx, u);
  return applyAura(ctx, u, STAGGER, source ?? u, {
    state: true,
    durationTicks: secs(Math.min(STAGGER_CAP, seconds)),
  });
}

function defOf(ctx: SystemContext, u: Unit, id: string): ShieldPhaseDef | undefined {
  return mechOf(ctx, u)?.m.shields?.find((s) => s.id === id);
}

/** Raise a shield of the boss's data (a trigger or a `shield` action). */
export function raiseShield(ctx: SystemContext, u: Unit, id: string): boolean {
  const mm = mechOf(ctx, u);
  const def = defOf(ctx, u, id);
  if (!mm || !def) return false;
  const fight = fightOf(ctx, u);
  const shields = fight.shields ?? {};
  if (shields[id]?.up || shields[id]?.broken) return false;
  const amount =
    def.kind === 'absorb'
      ? Math.max(
          1,
          Math.round(scaled(def.amount, u.level, deriveStats(ctx.world, ctx.content, u).stats.sp)),
        )
      : undefined;
  shields[id] = {
    up: true,
    ...(amount !== undefined ? { left: amount } : {}),
    ...(def.breakBy === 'timer' && def.seconds ? { until: ctx.tick + secs(def.seconds) } : {}),
  };
  fight.shields = shields;
  ctx.emit('combat.boss_shield', {
    entityId: u.id,
    bossId: mm.mon.id,
    shieldId: id,
    op: 'up',
    kind: def.kind,
    ...(amount !== undefined ? { amount } : {}),
  });
  return true;
}

/** Break a raised shield: the stagger and the aura of its `onBreak`. */
export function breakShield(
  ctx: SystemContext,
  u: Unit,
  id: string,
  op: 'broken' | 'expired' = 'broken',
  by?: Unit,
): void {
  const mm = mechOf(ctx, u);
  const def = defOf(ctx, u, id);
  const st = u.boss?.shields?.[id];
  if (!mm || !def || !st?.up) return;
  st.up = false;
  st.broken = true;
  delete st.left;
  delete st.until;
  ctx.emit('combat.boss_shield', {
    entityId: u.id,
    bossId: mm.mon.id,
    shieldId: id,
    op,
    kind: def.kind,
  });
  if (op !== 'broken') return;
  if (def.onBreak?.stagger) staggerBoss(ctx, u, def.onBreak.stagger, by);
  if (def.onBreak?.aura) applyAura(ctx, u, def.onBreak.aura, by ?? u);
}

/** The raised shields of a unit, in data order. */
export function shieldsUp(ctx: SystemContext, u: Unit): ShieldPhaseDef[] {
  const up = u.boss?.shields;
  if (!up) return [];
  return (mechOf(ctx, u)?.m.shields ?? []).filter((s) => up[s.id]?.up);
}

/** Whether a shield holds the boss (its casts count as uninterruptible, 10.4). */
export function shielded(ctx: SystemContext, u: Unit): boolean {
  return !!u.boss?.shields && shieldsUp(ctx, u).length > 0;
}

/** An immune shield turns the hit away. */
export function shieldImmune(ctx: SystemContext, u: Unit): boolean {
  return !!u.boss?.shields && shieldsUp(ctx, u).some((s) => s.kind === 'immune');
}

/**
 * Soak a hit with the boss's absorb shields (before absorb auras). Returns the amount
 * soaked; a shield run dry breaks.
 */
export function soakShield(ctx: SystemContext, u: Unit, amount: number, by?: Unit): number {
  if (!u.boss?.shields) return 0;
  let left = amount;
  let soaked = 0;
  for (const def of shieldsUp(ctx, u)) {
    const st = u.boss.shields[def.id];
    if (!st || def.kind !== 'absorb' || left <= 0) continue;
    const take = Math.min(st.left ?? 0, left);
    st.left = (st.left ?? 0) - take;
    left -= take;
    soaked += take;
    if ((st.left ?? 0) <= 0) breakShield(ctx, u, def.id, 'broken', by);
  }
  return soaked;
}

/** A hit of a named ability breaks the shields it names (10.4 `breakBy: ability`). */
export function abilityHitShield(ctx: SystemContext, u: Unit, abilityId: string, by: Unit): void {
  for (const def of shieldsUp(ctx, u))
    if (def.breakBy === 'ability' && def.breakRef === abilityId)
      breakShield(ctx, u, def.id, 'broken', by);
}

/** An arena object broke or was used: shields that wait on it break. */
export function terrainBreaksShield(ctx: SystemContext, u: Unit, object: string): void {
  for (const def of shieldsUp(ctx, u))
    if (def.breakBy === 'terrain' && def.breakRef === object) breakShield(ctx, u, def.id);
}

/**
 * Once a tick in a fight: shields whose trigger came go up; timer shields run out; shields
 * broken by adds break once none of the boss's adds stands.
 */
export function tickShields(
  ctx: SystemContext,
  u: Unit,
  maxHp: number,
  phase: number,
  addsAlive: boolean,
): void {
  const mm = mechOf(ctx, u);
  const defs = mm?.m.shields;
  if (!defs || defs.length === 0) return;
  const fight = fightOf(ctx, u);
  const frac = healthFrac(u, maxHp);
  for (const def of defs) {
    const st = fight.shields?.[def.id];
    if (!st) {
      const t = def.trigger;
      const due =
        (t.belowPct !== undefined && frac <= t.belowPct) ||
        (t.atSec !== undefined && pastSec(ctx, u, t.atSec)) ||
        (t.phase !== undefined && phase >= t.phase);
      if (due) raiseShield(ctx, u, def.id);
      continue;
    }
    if (!st.up) continue;
    if (st.until !== undefined && ctx.tick >= st.until) breakShield(ctx, u, def.id, 'expired');
    else if (def.breakBy === 'adds' && !addsAlive && (fight.spawned ?? 0) > 0)
      breakShield(ctx, u, def.id);
  }
}
