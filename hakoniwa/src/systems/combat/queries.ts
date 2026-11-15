// Read-only views for the client and the editor workbench: unit frames, the ability
// bar with cooldowns, target info with the strength reading of power_system.md 3.6,
// hostility, experience progress, and movement locks. Pure functions of the world.

import type { ContentMap } from '../../core/contracts';
import { TICK_HZ } from '../../core/time';
import type { World } from '../../core/world';
import { getEntity } from '../world';
import { abilityCost, checkAbility } from './abilities';
import { abilityDef, auraDef } from './defs';
import { TIER_NAMES, xpForLevel } from './formulas';
import { deriveStats } from './stats';
import type { ResourceKind, Side } from './types';
import { canAttack, isHostilePair, knownAbilities, liveUnit, unitOf } from './units';

const RESOURCE_NAMES: Record<ResourceKind, string> = { mana: '灵力', rage: '战意', energy: '气息' };

export interface UnitView {
  id: string;
  name: string;
  kind: string;
  level: number;
  tier: number;
  tierName: string;
  side: Side;
  alive: boolean;
  hp: number;
  maxHp: number;
  resources: { kind: ResourceKind; name: string; cur: number; max: number }[];
  combo: number;
  auras: {
    id: string;
    name: string;
    kind: 'buff' | 'debuff';
    remaining: number | null;
    stacks: number;
  }[];
  cast: { abilityId: string; name: string; progress: number; remaining: number } | null;
  targetId: string | null;
  inCombat: boolean;
  attackable: boolean;
}

export function unitView(world: World, content: ContentMap, id: string): UnitView | null {
  const u = unitOf(world, id);
  const e = getEntity(world, id);
  if (!u || !e) return null;
  const d = deriveStats(world, content, u);
  const tick = world.meta.tick;
  return {
    id,
    name: e.name,
    kind: e.kind,
    level: u.level,
    tier: u.tier,
    tierName: TIER_NAMES[u.tier] ?? '',
    side: u.side,
    alive: e.alive && !u.downed,
    hp: Math.max(0, Math.round(u.hp)),
    maxHp: d.maxHp,
    resources: (Object.keys(d.maxRes) as ResourceKind[]).map((k) => ({
      kind: k,
      name: RESOURCE_NAMES[k],
      cur: Math.round(u.res[k] ?? 0),
      max: d.maxRes[k] ?? 0,
    })),
    combo: u.combo,
    auras: u.auras.map((a) => {
      const def = auraDef(content, a.id);
      return {
        id: a.id,
        name: def?.name ?? a.id,
        kind: def?.kind ?? 'buff',
        remaining: a.expires === 0 ? null : Math.max(0, (a.expires - tick) / TICK_HZ),
        stacks: a.stacks,
      };
    }),
    cast: u.cast
      ? {
          abilityId: u.cast.abilityId,
          name: abilityDef(content, u.cast.abilityId)?.name ?? u.cast.abilityId,
          progress: Math.min(1, (tick - u.cast.start) / Math.max(1, u.cast.end - u.cast.start)),
          remaining: Math.max(0, (u.cast.end - tick) / TICK_HZ),
        }
      : null,
    targetId: u.target,
    inCombat: u.combatUntil > tick,
    attackable: u.attackable,
  };
}

export interface AbilitySlot {
  id: string;
  name: string;
  desc: string;
  resource: ResourceKind | null;
  cost: number;
  castTime: number;
  cooldown: number;
  cooldownLeft: number;
  gcdLeft: number;
  range: number;
  usable: boolean;
  reason?: string;
}

/** The ability bar of a unit (the player by default) with live cooldowns and usability. */
export function abilityBar(world: World, content: ContentMap, id?: string): AbilitySlot[] {
  const uid = id ?? world.slices.world.playerId;
  const u = unitOf(world, uid);
  if (!u) return [];
  const d = deriveStats(world, content, u);
  const tick = world.meta.tick;
  const out: AbilitySlot[] = [];
  for (const aid of knownAbilities(content, u)) {
    const def = abilityDef(content, aid);
    if (!def) continue;
    const check = checkAbility(world, content, u, aid);
    out.push({
      id: aid,
      name: def.name,
      desc: def.desc,
      resource: def.resource ?? null,
      cost: abilityCost(def, d),
      castTime: def.castTime ?? 0,
      cooldown: def.cooldown ?? 0,
      cooldownLeft: Math.max(0, ((u.cds[aid] ?? 0) - tick) / TICK_HZ),
      gcdLeft: def.gcd === false ? 0 : Math.max(0, (u.gcd - tick) / TICK_HZ),
      range: def.range ?? 0,
      usable: check.ok,
      reason: check.ok ? undefined : check.reason,
    });
  }
  return out;
}

export type StrengthReading = 'weaker' | 'similar' | 'stronger' | 'unreadable';

/**
 * How strong a target feels (power_system.md 3.6). Without the Tide-sight door
 * (feature.tide_sight) only four readings exist; two ranks above the viewer the reading
 * saturates to "unreadable".
 */
export function strengthReading(world: World, viewerId: string, targetId: string): StrengthReading {
  const v = unitOf(world, viewerId);
  const t = unitOf(world, targetId);
  if (!v || !t) return 'unreadable';
  if (t.tier >= v.tier + 2) return 'unreadable';
  const diff = t.level - v.level;
  if (diff >= 3) return 'stronger';
  if (diff <= -3) return 'weaker';
  return 'similar';
}

export interface TargetInfo {
  unit: UnitView;
  hostile: boolean;
  attackable: boolean;
  reading: StrengthReading;
  /** "Lv 12 到 15" with the Tide-sight door, otherwise "?" */
  levelText: string;
}

export function targetInfo(
  world: World,
  content: ContentMap,
  viewerId?: string,
): TargetInfo | null {
  const vid = viewerId ?? world.slices.world.playerId;
  const v = unitOf(world, vid);
  if (!v?.target) return null;
  const view = unitView(world, content, v.target);
  const t = unitOf(world, v.target);
  if (!view || !t) return null;
  const reading = strengthReading(world, vid, t.id);
  const sight = !!world.meta.flags['feature.tide_sight'];
  const lo = Math.max(1, t.level - 2);
  return {
    unit: view,
    hostile: isHostilePair(v, t),
    attackable: canAttack(world, v, t),
    reading,
    levelText: sight && reading !== 'unreadable' ? `Lv ${lo} 到 ${t.level + 2}` : '?',
  };
}

export function isHostile(world: World, aId: string, bId: string): boolean {
  const a = unitOf(world, aId);
  const b = unitOf(world, bId);
  return !!a && !!b && isHostilePair(a, b);
}

export function xpProgress(
  world: World,
  id?: string,
): { level: number; xp: number; next: number; pct: number } {
  const u = unitOf(world, id ?? world.slices.world.playerId);
  if (!u) return { level: 1, xp: 0, next: xpForLevel(1), pct: 0 };
  const next = xpForLevel(u.level);
  return { level: u.level, xp: u.xp, next, pct: next > 0 ? u.xp / next : 1 };
}

/** False while rooted, stunned, feared or incapacitated (the client should drop movement input). */
export function canMove(world: World, content: ContentMap, id?: string): boolean {
  const u = unitOf(world, id ?? world.slices.world.playerId);
  if (!u) return true;
  return deriveStats(world, content, u).speedMult > 0;
}

/** Hostile units near the viewer, nearest first (tab targeting). */
export function enemiesNear(world: World, radius: number, viewerId?: string): string[] {
  const vid = viewerId ?? world.slices.world.playerId;
  const v = unitOf(world, vid);
  const ve = getEntity(world, vid);
  if (!v || !ve) return [];
  const out: { id: string; d: number }[] = [];
  for (const u of Object.values(world.slices.combat.units)) {
    const pair = liveUnit(world, u.id);
    if (!pair || !canAttack(world, v, u)) continue;
    const e = pair[1];
    if (e.mapId !== ve.mapId) continue;
    const d = Math.hypot(e.x - ve.x, e.y - ve.y);
    if (d <= radius) out.push({ id: u.id, d });
  }
  return out.sort((a, b) => a.d - b.d || a.id.localeCompare(b.id)).map((x) => x.id);
}
