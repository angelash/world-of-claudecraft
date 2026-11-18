// Read-only views for the client and the editor workbench: unit frames, the ability
// bar with cooldowns and the outsider's skill rack, target info with the strength reading
// of power_system.md 3.6, hostility, experience progress, movement locks and the drop bags.
// The readability list (combat_and_classes.md 18) reads its kernel side here: each aura's
// bar category, dispel class and ladder stage, and whether a cast bar can be interrupted.
// Pure functions of the world.

import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextParam, tr } from '../../core/text';
import { TICK_HZ } from '../../core/time';
import type { World } from '../../core/world';
import { getEntity } from '../world';
import { abilityCost, checkAbility, resourceName } from './abilities';
import { interruptibleNow, STAGGER } from './boss';
import { abilityDef, auraDef, monsterDef } from './defs';
import { tierName, xpForLevel } from './formulas';
import { drivenPools } from './pools';
import { rackCapacity, usesRack } from './rack';
import { deriveStats } from './stats';
import type { AuraCategory, DispelType, DropBag, ResourceKind, Side, Unit } from './types';
import { canAttack, isHostilePair, knownAbilities, liveUnit, unitOf } from './units';

export interface UnitView {
  id: string;
  name: string;
  kind: string;
  level: number;
  tier: number;
  tierName: KeyText | '';
  side: Side;
  alive: boolean;
  hp: number;
  maxHp: number;
  resources: { kind: ResourceKind; name: KeyText; cur: number; max: number }[];
  combo: number;
  auras: {
    id: string;
    name: string;
    kind: 'buff' | 'debuff';
    remaining: number | null;
    stacks: number;
    /** bar category (8.2): sorting and the frame */
    category: AuraCategory;
    /** dispel class (9.5): the border shape; none is undispellable */
    dispelType: DispelType | null;
    /** the ladder step this control landed at (9.2 icon corner): 0 full, 1 half, 2 quarter */
    drStage: number;
  }[];
  cast: {
    abilityId: string;
    name: string;
    progress: number;
    remaining: number;
    /** false draws the shield border: uninterruptible, a shield up, or outside its window (10.4) */
    interruptible: boolean;
    /** a channel: the bar empties instead of filling (3.9) */
    channel: boolean;
  } | null;
  targetId: string | null;
  inCombat: boolean;
  attackable: boolean;
  /** a boss's shields up (10.4): the absorb left above the health bar, or an immune shield */
  shield: { kind: 'absorb' | 'immune'; left: number } | null;
  /** an untargetable phase in progress (10.2) */
  untargetable: boolean;
  /** the boss's stagger (10.4, `aur_st_stagger`) */
  staggered: boolean;
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
    tierName: tierName(u.tier),
    side: u.side,
    alive: e.alive && !u.downed,
    hp: Math.max(0, Math.round(u.hp)),
    maxHp: d.maxHp,
    resources: (Object.keys(d.maxRes) as ResourceKind[]).map((k) => ({
      kind: k,
      name: resourceName(k),
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
        category: def?.category ?? def?.kind ?? 'buff',
        dispelType: def?.dispelType ?? null,
        drStage: a.dr ?? 0,
      };
    }),
    cast: u.cast
      ? {
          abilityId: u.cast.abilityId,
          name: abilityDef(content, u.cast.abilityId)?.name ?? u.cast.abilityId,
          progress: Math.min(1, (tick - u.cast.start) / Math.max(1, u.cast.end - u.cast.start)),
          remaining: Math.max(0, (u.cast.end - tick) / TICK_HZ),
          interruptible: interruptibleNow(world, content, u),
          channel: !!u.cast.channel,
        }
      : null,
    targetId: u.target,
    inCombat: u.combatUntil > tick,
    attackable: u.attackable,
    shield: shieldView(content, u),
    untargetable: (u.boss?.untargetableUntil ?? 0) > tick,
    staggered: u.auras.some((a) => a.id === STAGGER),
  };
}

/** The shields a boss holds up, for its frame (10.4, 18). */
function shieldView(content: ContentMap, u: Unit): UnitView['shield'] {
  const up = u.boss?.shields;
  if (!up) return null;
  const defs = monsterDef(content, u.monsterId)?.mechanics?.shields ?? [];
  let left = 0;
  let immune = false;
  for (const d of defs) {
    const st = up[d.id];
    if (!st?.up) continue;
    if (d.kind === 'immune') immune = true;
    else left += st.left ?? 0;
  }
  if (immune) return { kind: 'immune', left: 0 };
  return left > 0 ? { kind: 'absorb', left } : null;
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
  reason?: KeyText;
  /** on the outsider's skill rack (always true for units without a rack) */
  racked: boolean;
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
      racked: !u.rack || u.rack.includes(aid),
    });
  }
  return out;
}

/** The outsider's skill rack (7): slots in use, capacity, and the driven pools (4.3). */
export function rackView(
  world: World,
  content: ContentMap,
  id?: string,
): { slots: string[]; capacity: number; pools: ResourceKind[] } | null {
  const u = unitOf(world, id ?? world.slices.world.playerId);
  if (!u || !usesRack(content, u)) return null;
  return { slots: [...(u.rack ?? [])], capacity: rackCapacity(u), pools: drivenPools(world, u) };
}

/** Drop bags left where the player fell (15.1), for the map markers; oldest first. */
export function dropBags(world: World): DropBag[] {
  return Object.values(world.slices.combat?.bags ?? {}).sort(
    (a, b) => a.expires - b.expires || a.id.localeCompare(b.id),
  );
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
  /** the level range (sys.combat.level_range) with the Tide-sight door, otherwise "?" */
  levelText: TextParam;
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
    levelText:
      sight && reading !== 'unreadable'
        ? tr('sys.combat.level_range', { lo, hi: t.level + 2 })
        : '?',
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
