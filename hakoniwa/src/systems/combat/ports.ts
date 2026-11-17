// Ports: the cross-system writes combat offers. Doors grant abilities (they land on the
// outsider's skill rack while it has room, 7), stat bonuses, resource pools (R-02; the first
// pool becomes the driven one, 4.3) and passives to the outsider; party creates, levels,
// orders and revives companions; quests and dialogue start duels. Every grant is keyed by a
// source id so it can be revoked (closing a door). Callers never touch the combat slice.

import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import { type Check, checkAbility, interruptCast, useAbility } from './abilities';
import { applyAura, removeByOrigin } from './auras';
import { abilityDef } from './defs';
import { settleActivePool } from './pools';
import { syncRack } from './rack';
import type { ResourceKind, StatBlock, Unit } from './types';
import { canAttack, clampPools, createUnit, liveUnit, type UnitSpec, unitOf } from './units';

export { pickAbility } from './ai_common';
export { reviveUnit } from './death';
export { startDuel } from './duel';
export { gainXp } from './rewards';
export { canAttack, liveUnit, setLevel, unitOf } from './units';

export function addUnit(ctx: SystemContext, entityId: string, spec: UnitSpec): Unit | undefined {
  return unitOf(ctx.world, entityId) ?? createUnit(ctx, entityId, spec);
}

export function grantAbility(ctx: SystemContext, unitId: string, abilityId: string): boolean {
  const u = unitOf(ctx.world, unitId);
  if (!u || !abilityDef(ctx.content, abilityId)) return false;
  if (!u.abilities.includes(abilityId)) u.abilities.push(abilityId);
  syncRack(ctx.content, u);
  return true;
}

export function revokeAbility(ctx: SystemContext, unitId: string, abilityId: string): void {
  const u = unitOf(ctx.world, unitId);
  if (!u) return;
  u.abilities = u.abilities.filter((a) => a !== abilityId);
  syncRack(ctx.content, u);
}

/** Set (or with null clear) the flat stat bonus a source grants. */
export function setBonus(
  ctx: SystemContext,
  unitId: string,
  source: string,
  stats: StatBlock | null,
): void {
  const u = unitOf(ctx.world, unitId);
  if (!u) return;
  if (stats) u.bonuses[source] = { ...stats };
  else delete u.bonuses[source];
  clampPools(ctx.world, ctx.content, u);
}

/** Grant a resource pool from a source; mana `base` is the level-1 size, rage and energy cap at 100. */
export function grantPool(
  ctx: SystemContext,
  unitId: string,
  source: string,
  kind: ResourceKind,
  base: number,
): void {
  const u = unitOf(ctx.world, unitId);
  if (!u) return;
  const pools = u.pools[kind] ?? {};
  pools[source] = Math.max(1, base);
  u.pools[kind] = pools;
  settleActivePool(u);
  clampPools(ctx.world, ctx.content, u);
}

export function revokePools(ctx: SystemContext, unitId: string, source: string): void {
  const u = unitOf(ctx.world, unitId);
  if (!u) return;
  for (const kind of Object.keys(u.pools) as ResourceKind[]) {
    const pools = u.pools[kind];
    if (!pools || !(source in pools)) continue;
    delete pools[source];
    if (Object.keys(pools).length === 0) delete u.pools[kind];
  }
  settleActivePool(u);
  clampPools(ctx.world, ctx.content, u);
}

export function addPassive(
  ctx: SystemContext,
  unitId: string,
  auraId: string,
  origin: string,
): boolean {
  const u = unitOf(ctx.world, unitId);
  return !!u && applyAura(ctx, u, auraId, u, { permanent: true, origin });
}

/** Apply a timed aura from content (revival weakness, scripted buffs). */
export function applyAuraTo(
  ctx: SystemContext,
  unitId: string,
  auraId: string,
  sourceId?: string,
): boolean {
  const u = unitOf(ctx.world, unitId);
  if (!u) return false;
  return applyAura(ctx, u, auraId, unitOf(ctx.world, sourceId) ?? u);
}

export function removePassives(ctx: SystemContext, unitId: string, origin: string): void {
  const u = unitOf(ctx.world, unitId);
  if (u) removeByOrigin(ctx, u, origin);
}

export function setTarget(ctx: SystemContext, unitId: string, targetId: string | null): boolean {
  const u = unitOf(ctx.world, unitId);
  if (!u) return false;
  if (targetId !== null && !liveUnit(ctx.world, targetId)) return false;
  u.target = targetId;
  return true;
}

/** Start (or stop) auto-attacking; starting needs an attackable target. */
export function setAutoAttack(
  ctx: SystemContext,
  unitId: string,
  on: boolean,
  targetId?: string,
): boolean {
  const u = unitOf(ctx.world, unitId);
  if (!u) return false;
  if (targetId !== undefined) u.target = targetId;
  if (!on) {
    u.autoAttack = false;
    return true;
  }
  const t = unitOf(ctx.world, u.target);
  if (!t || !canAttack(ctx.world, u, t)) return false;
  u.autoAttack = true;
  return true;
}

export function castAs(
  ctx: SystemContext,
  unitId: string,
  abilityId: string,
  targetId?: string,
): Check {
  const u = unitOf(ctx.world, unitId);
  if (!u) return { ok: false, code: 'no_unit', reason: tr('sys.combat.reject.no_unit') };
  return useAbility(ctx, u, abilityId, targetId);
}

export function canCast(
  ctx: SystemContext,
  unitId: string,
  abilityId: string,
  targetId?: string,
): boolean {
  const u = unitOf(ctx.world, unitId);
  return !!u && checkAbility(ctx.world, ctx.content, u, abilityId, targetId).ok;
}

export function stopActions(ctx: SystemContext, unitId: string): void {
  const u = unitOf(ctx.world, unitId);
  if (!u) return;
  interruptCast(ctx, u);
  u.autoAttack = false;
}
