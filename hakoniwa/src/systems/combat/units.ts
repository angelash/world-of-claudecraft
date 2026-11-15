// Combat units: creation, lookup, sides, level and rank tags, known abilities.
// A unit is keyed by the id of the world entity it belongs to.

import type { ContentMap } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import type { World } from '../../core/world';
import { getEntity, setMoveSpeed, setTag, setTagValue } from '../world';
import type { Entity } from '../world/types';
import { classDef, monsterDef } from './defs';
import { MAX_LEVEL, tierForLevel } from './formulas';
import { deriveStats } from './stats';
import type { CombatSlice, ResourceKind, Side, Unit } from './types';

export function combatSlice(world: World): CombatSlice {
  return world.slices.combat;
}

export function unitOf(world: World, id: string | null | undefined): Unit | undefined {
  if (!id) return undefined;
  return world.slices.combat?.units[id];
}

/** Unit and entity together, only while both exist and the entity is alive and visible. */
export function liveUnit(world: World, id: string | null | undefined): [Unit, Entity] | undefined {
  const u = unitOf(world, id);
  if (!u) return undefined;
  const e = getEntity(world, u.id);
  if (!e?.alive || e.hidden || u.downed) return undefined;
  return [u, e];
}

export interface UnitSpec {
  classId?: string | null;
  monsterId?: string | null;
  level: number;
  side: Side;
  attackable?: boolean;
  power?: number;
  abilities?: string[];
  presence?: number;
  tierFloor?: number;
}

export function clampLevel(level: number): number {
  return Math.max(1, Math.min(MAX_LEVEL, Math.round(level)));
}

export function createUnit(ctx: SystemContext, entityId: string, spec: UnitSpec): Unit | undefined {
  const e = getEntity(ctx.world, entityId);
  if (!e) return undefined;
  const level = clampLevel(spec.level);
  const u: Unit = {
    id: entityId,
    classId: spec.classId ?? null,
    monsterId: spec.monsterId ?? null,
    level,
    tier: Math.max(tierForLevel(level), spec.tierFloor ?? 0),
    xp: 0,
    side: spec.side,
    attackable: spec.attackable ?? true,
    hp: 1,
    res: {},
    pools: {},
    combo: 0,
    auras: [],
    cds: {},
    gcd: 0,
    cast: null,
    threat: {},
    target: null,
    autoAttack: false,
    swingAt: 0,
    combatUntil: 0,
    manaSpentAt: 0,
    abilities: [...(spec.abilities ?? [])],
    bonuses: {},
    baseSpeed: e.speed,
    tapped: null,
    ai: null,
    power: spec.power ?? 1,
    presence: spec.presence,
    tierFloor: spec.tierFloor,
  };
  ctx.world.slices.combat.units[entityId] = u;
  fillUp(ctx.world, ctx.content, u);
  refreshTags(ctx, u);
  return u;
}

/** Restore health and pools to full (rage starts empty, as in combat). */
export function fillUp(world: World, content: ContentMap, u: Unit): void {
  const d = deriveStats(world, content, u);
  u.hp = d.maxHp;
  const res: Partial<Record<ResourceKind, number>> = {};
  for (const kind of Object.keys(d.maxRes) as ResourceKind[]) {
    res[kind] = kind === 'rage' ? 0 : (d.maxRes[kind] ?? 0);
  }
  u.res = res;
}

/** Keep stored health and pools inside the current maxima (after level, gear, aura changes). */
export function clampPools(world: World, content: ContentMap, u: Unit): void {
  const d = deriveStats(world, content, u);
  u.hp = Math.min(u.hp, d.maxHp);
  for (const kind of Object.keys(u.res) as ResourceKind[]) {
    const max = d.maxRes[kind];
    if (max === undefined) delete u.res[kind];
    else u.res[kind] = Math.min(u.res[kind] ?? 0, max);
  }
  for (const kind of Object.keys(d.maxRes) as ResourceKind[]) {
    if (u.res[kind] === undefined) u.res[kind] = kind === 'rage' ? 0 : (d.maxRes[kind] ?? 0);
  }
}

export function refreshTags(ctx: SystemContext, u: Unit): void {
  setTagValue(ctx, u.id, 'lvl', u.level);
  setTagValue(ctx, u.id, 'tier', u.tier);
  setTag(ctx, u.id, 'hostile', u.side === 'enemy');
}

/** Change level (level ups, companion scaling, set_class) keeping the health fraction. */
export function setLevel(ctx: SystemContext, u: Unit, level: number): void {
  const before = deriveStats(ctx.world, ctx.content, u);
  const frac = before.maxHp > 0 ? u.hp / before.maxHp : 1;
  u.level = clampLevel(level);
  u.tier = Math.max(tierForLevel(u.level), u.tierFloor ?? 0);
  const after = deriveStats(ctx.world, ctx.content, u);
  u.hp = Math.max(1, Math.round(after.maxHp * frac));
  clampPools(ctx.world, ctx.content, u);
  refreshTags(ctx, u);
}

/** Abilities a unit can use now: boss phase list, monster list, class list by level, grants. */
export function knownAbilities(content: ContentMap, u: Unit): string[] {
  if (u.phaseAbilities) return u.phaseAbilities;
  const out: string[] = [];
  const mon = monsterDef(content, u.monsterId);
  if (mon?.abilities) out.push(...mon.abilities);
  const cls = classDef(content, u.classId);
  if (cls) for (const a of cls.abilities) if (a.level <= u.level) out.push(a.id);
  for (const a of u.abilities) out.push(a);
  return [...new Set(out)];
}

export function isHostilePair(a: Unit, b: Unit): boolean {
  return a.side !== b.side && a.side !== 'neutral' && b.side !== 'neutral';
}

/** Can `a` attack `b` right now? */
export function canAttack(world: World, a: Unit, b: Unit): boolean {
  if (!b.attackable || a.id === b.id || !isHostilePair(a, b)) return false;
  if (b.ai?.state === 'evade' || b.ai?.state === 'yielded') return false;
  return !!liveUnit(world, b.id);
}

export function isFriendlyPair(a: Unit, b: Unit): boolean {
  return a.side === b.side && a.side !== 'neutral';
}

export function inCombat(world: World, u: Unit): boolean {
  return u.combatUntil > world.meta.tick;
}

/** Apply the speed multiplier of the current auras to the entity. */
export function syncSpeed(ctx: SystemContext, u: Unit): void {
  const e = getEntity(ctx.world, u.id);
  if (!e) return;
  const d = deriveStats(ctx.world, ctx.content, u);
  const want = u.baseSpeed * d.speedMult;
  if (Math.abs(e.speed - want) > 1e-6) setMoveSpeed(ctx, u.id, want);
}

/** Sorted unit ids for deterministic iteration. */
export function sortedUnitIds(world: World): string[] {
  return Object.keys(world.slices.combat.units).sort();
}
