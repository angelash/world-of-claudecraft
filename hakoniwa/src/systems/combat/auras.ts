// Auras: buffs, debuffs, crowd control, shields and passives. One instance per aura id
// on a unit; reapplying refreshes the duration and adds a stack up to maxStacks.
// Periodic effects and pulses tick in aura_tick.ts.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';
import { auraDef, monsterDef, scaled, secs } from './defs';
import { halt } from './entity_ops';
import { deriveStats } from './stats';
import type { Aura, AuraDef, CcKind, Unit } from './types';
import { clampPools, syncSpeed } from './units';

const HARD_CC: ReadonlySet<CcKind> = new Set<CcKind>(['stun', 'fear', 'incapacitate', 'root']);

export function hasAura(u: Unit, id: string): boolean {
  return u.auras.some((a) => a.id === id);
}

export function auraOn(u: Unit, id: string): Aura | undefined {
  return u.auras.find((a) => a.id === id);
}

function ccImmune(ctx: SystemContext, u: Unit, def: AuraDef): boolean {
  if (!def.cc || (!HARD_CC.has(def.cc) && def.cc !== 'silence')) return false;
  const mon = monsterDef(ctx.content, u.monsterId);
  return mon?.rank === 'boss';
}

export interface ApplyOpts {
  /** multiplies periodic power, absorbs and thorns (combo finishers) */
  powerMult?: number;
  origin?: string;
  permanent?: boolean;
  /** overrides the content duration */
  durationTicks?: number;
}

/** Apply or refresh an aura. Returns false when the aura is unknown or resisted by immunity. */
export function applyAura(
  ctx: SystemContext,
  target: Unit,
  auraId: string,
  source: Unit | null,
  opts: ApplyOpts = {},
): boolean {
  const def = auraDef(ctx.content, auraId);
  if (!def) return false;
  if (def.kind === 'debuff' && (target.ai?.state === 'evade' || target.ai?.state === 'yielded')) {
    return false;
  }
  if (ccImmune(ctx, target, def)) return false;
  const src = source ?? target;
  const lvl = src.level;
  const sd = deriveStats(ctx.world, ctx.content, src);
  const school = def.periodic?.school ?? def.pulse?.school ?? 'physical';
  const powerStat = school === 'physical' ? sd.stats.ap : sd.stats.sp;
  const mult = opts.powerMult ?? 1;
  const permanent = opts.permanent || def.duration <= 0;
  const expires = permanent
    ? 0
    : ctx.tick + (opts.durationTicks !== undefined ? opts.durationTicks : secs(def.duration));
  let power: number | undefined;
  if (def.periodic) {
    const amt = def.periodic.damage
      ? scaled(def.periodic.damage, lvl, powerStat) * (1 + sd.mods.damageDealt)
      : scaled(def.periodic.heal, lvl, sd.stats.sp) * (1 + sd.mods.healingDone);
    power = Math.max(1, amt * mult);
  } else if (def.pulse) {
    power = Math.max(
      1,
      scaled(def.pulse.damage, lvl, powerStat) * (1 + sd.mods.damageDealt) * mult,
    );
  }
  const absorb = def.absorb ? Math.round(scaled(def.absorb, lvl, sd.stats.sp) * mult) : undefined;
  const thorns = def.thorns ? Math.max(1, scaled(def.thorns, lvl, 0) * mult) : undefined;
  const every = def.periodic?.every ?? def.pulse?.every;
  const existing = target.auras.find((a) => a.id === auraId);
  if (existing) {
    existing.expires = expires;
    existing.stacks = Math.min(def.maxStacks ?? 1, existing.stacks + 1);
    existing.sourceId = src.id;
    existing.lvl = lvl;
    if (power !== undefined) existing.power = power;
    if (absorb !== undefined) existing.absorb = absorb;
    if (thorns !== undefined) existing.thorns = thorns;
    ctx.emit('combat.aura', {
      targetId: target.id,
      auraId,
      sourceId: src.id,
      op: 'refreshed',
      stacks: existing.stacks,
    });
  } else {
    const a: Aura = { id: auraId, sourceId: src.id, expires, stacks: 1, lvl };
    if (every) a.next = ctx.tick + secs(every);
    if (power !== undefined) a.power = power;
    if (absorb !== undefined) a.absorb = absorb;
    if (thorns !== undefined) a.thorns = thorns;
    if (opts.origin) a.origin = opts.origin;
    target.auras.push(a);
    ctx.emit('combat.aura', {
      targetId: target.id,
      auraId,
      sourceId: src.id,
      op: 'applied',
      stacks: 1,
    });
  }
  if (def.cc && HARD_CC.has(def.cc)) {
    const e = getEntity(ctx.world, target.id);
    if (e) halt(e);
    if (def.cc !== 'root') target.cast = null;
  }
  afterChange(ctx, target);
  return true;
}

function afterChange(ctx: SystemContext, u: Unit): void {
  syncSpeed(ctx.world, ctx.content, u);
  clampPools(ctx.world, ctx.content, u);
}

/** Remove auras matching a predicate; emits a removal event for each. */
export function removeAurasWhere(
  ctx: SystemContext,
  u: Unit,
  pred: (a: Aura, def: AuraDef | undefined) => boolean,
): number {
  const keep: Aura[] = [];
  const gone: Aura[] = [];
  for (const a of u.auras) {
    if (pred(a, auraDef(ctx.content, a.id))) gone.push(a);
    else keep.push(a);
  }
  if (gone.length === 0) return 0;
  u.auras = keep;
  for (const a of gone) {
    ctx.emit('combat.aura', {
      targetId: u.id,
      auraId: a.id,
      sourceId: a.sourceId,
      op: 'removed',
      stacks: 0,
    });
  }
  afterChange(ctx, u);
  return gone.length;
}

export function removeAura(ctx: SystemContext, u: Unit, auraId: string): boolean {
  return removeAurasWhere(ctx, u, (a) => a.id === auraId) > 0;
}

/** Drop expired auras (per tick). */
export function expireAuras(ctx: SystemContext, u: Unit): void {
  if (u.auras.length === 0) return;
  if (!u.auras.some((a) => a.expires > 0 && a.expires <= ctx.tick)) return;
  removeAurasWhere(ctx, u, (a) => a.expires > 0 && a.expires <= ctx.tick);
}

/** Damage wakes the sleeper: remove break-on-damage control. */
export function breakOnDamage(ctx: SystemContext, u: Unit): void {
  if (!u.auras.some((a) => auraDef(ctx.content, a.id)?.breakOnDamage)) return;
  removeAurasWhere(ctx, u, (_a, def) => !!def?.breakOnDamage);
}

/** Soak damage with absorb shields (oldest first). Returns the absorbed amount. */
export function soakAbsorb(ctx: SystemContext, u: Unit, amount: number): number {
  let left = amount;
  let absorbed = 0;
  let emptied = false;
  for (const a of u.auras) {
    if (left <= 0) break;
    if (!a.absorb || a.absorb <= 0) continue;
    const take = Math.min(a.absorb, left);
    a.absorb -= take;
    left -= take;
    absorbed += take;
    if (a.absorb <= 0) emptied = true;
  }
  if (emptied) removeAurasWhere(ctx, u, (a) => a.absorb !== undefined && a.absorb <= 0);
  return absorbed;
}

/** Remove up to `count` dispellable auras of a kind; returns how many went. */
export function dispel(
  ctx: SystemContext,
  u: Unit,
  kind: 'buff' | 'debuff',
  count: number,
): number {
  let left = count;
  return removeAurasWhere(ctx, u, (a, def) => {
    if (left <= 0 || !def || def.kind !== kind || a.expires === 0) return false;
    if (def.dispellable === false) return false;
    left--;
    return true;
  });
}

/** Remove every aura granted by an origin (closing a door). */
export function removeByOrigin(ctx: SystemContext, u: Unit, origin: string): number {
  return removeAurasWhere(ctx, u, (a) => a.origin === origin);
}
