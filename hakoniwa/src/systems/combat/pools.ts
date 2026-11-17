// The outsider's door-granted pools (combat_and_classes.md 4.3, R-02): each vocation door
// declares its pool and base; pools of one kind take the largest base (stats.ts). Without
// the dual-pulse door one pool is driven at a time (the active pool): abilities of the other
// pools are greyed out, and the player switches out of combat (half a second). The
// dual-pulse door drives two pools and the triple-pulse door all three; then spending one
// pool feeds another a little (4.3 table; halved at three pools), the first pool not full in
// the order rage, energy, mana. Units with a vocation resource (companions, people) drive
// their one pool as before.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { secs } from './defs';
import type { Derived } from './stats';
import type { ResourceKind, Unit } from './types';
import { inCombat } from './units';

/** Feature flags the dual-pulse door opens (catalog_doors.md, `door_dual_pulse`). */
export const DUAL_PULSE_FLAG = 'feature.dual_pulse';
export const TRIPLE_PULSE_FLAG = 'feature.triple_pulse';
/** The pool order of 4.3 (conversions feed the first one not full). */
export const POOL_ORDER: readonly ResourceKind[] = ['rage', 'energy', 'mana'];
/** Seconds a pool switch takes (4.3). */
export const SWITCH_SEC = 0.5;

/** The door-granted pool kinds a unit holds, in pool order. */
export function grantedPools(u: Unit): ResourceKind[] {
  return POOL_ORDER.filter((k) => {
    const sources = u.pools[k];
    return !!sources && Object.values(sources).some((v) => v > 0);
  });
}

/** How many pools the doors let the outsider drive at once (1, 2 or 3). */
export function pulses(flag: (key: string) => FlagValue | undefined): number {
  if (flag(TRIPLE_PULSE_FLAG)) return 3;
  if (flag(DUAL_PULSE_FLAG)) return 2;
  return 1;
}

/**
 * The pools driven now. A unit with a vocation resource, or one holding a single door pool,
 * drives everything it has. An outsider with several pools drives its active pool, plus the
 * next pools in pool order up to its pulse count.
 */
export function drivenPools(world: World, u: Unit): ResourceKind[] {
  const held = grantedPools(u);
  if (held.length <= 1) return held;
  const n = pulses((k) => world.meta.flags[k]);
  const active = u.activePool && held.includes(u.activePool) ? u.activePool : held[0];
  const out: ResourceKind[] = active ? [active] : [];
  for (const k of held) {
    if (out.length >= n) break;
    if (!out.includes(k)) out.push(k);
  }
  return out;
}

/** Whether an ability paid from `kind` may be used as far as the driven pools go. */
export function poolDriven(world: World, u: Unit, kind: ResourceKind): boolean {
  if (!(kind in u.pools)) return true;
  return drivenPools(world, u).includes(kind);
}

/** Keep the active pool on a pool the unit holds (after a grant or a revoke). */
export function settleActivePool(u: Unit): void {
  const held = grantedPools(u);
  if (held.length === 0) {
    delete u.activePool;
    return;
  }
  if (!u.activePool || !held.includes(u.activePool)) u.activePool = held[0];
}

export type SwitchResult = { ok: true } | { ok: false; code: string };

/** Switch the active pool, out of combat only (4.3). */
export function switchPool(ctx: SystemContext, u: Unit, kind: ResourceKind): SwitchResult {
  if (!grantedPools(u).includes(kind)) return { ok: false, code: 'no_pool' };
  if (inCombat(ctx.world, u)) return { ok: false, code: 'in_combat' };
  if (u.cast) return { ok: false, code: 'busy' };
  if (u.activePool === kind) return { ok: true };
  u.activePool = kind;
  u.gcd = Math.max(u.gcd, ctx.tick + secs(SWITCH_SEC));
  ctx.emit('combat.pool_switched', { entityId: u.id, resource: kind });
  return { ok: true };
}

/**
 * The cross-feed of the pulse doors (4.3 table) after spending `cost` from `kind`: per 10
 * rage 1.5% of max mana or 4 energy; per 20 energy 3 rage or 1% of max mana; per 1% of max
 * mana 0.6 rage or 1 energy; halved when three pools are driven. The first driven pool that
 * is not full, in pool order, takes it.
 */
export function crossFeed(
  world: World,
  u: Unit,
  d: Derived,
  kind: ResourceKind,
  cost: number,
): void {
  if (cost <= 0 || !(kind in u.pools)) return;
  const driven = drivenPools(world, u);
  if (driven.length < 2 || !driven.includes(kind)) return;
  if (u.fedAt === world.meta.tick) return;
  u.fedAt = world.meta.tick;
  const half = driven.length >= 3 ? 0.5 : 1;
  const maxMana = d.maxRes.mana ?? 0;
  for (const to of POOL_ORDER) {
    if (to === kind || !driven.includes(to)) continue;
    const max = d.maxRes[to] ?? 0;
    const cur = u.res[to] ?? 0;
    if (max <= 0 || cur >= max) continue;
    let gain = 0;
    if (kind === 'rage') gain = to === 'mana' ? (cost / 10) * 0.015 * maxMana : (cost / 10) * 4;
    else if (kind === 'energy')
      gain = to === 'rage' ? (cost / 20) * 3 : (cost / 20) * 0.01 * maxMana;
    else if (maxMana > 0) {
      const pct = (cost / maxMana) * 100;
      gain = to === 'rage' ? pct * 0.6 : pct;
    }
    u.res[to] = Math.min(max, cur + gain * half);
    return;
  }
}
