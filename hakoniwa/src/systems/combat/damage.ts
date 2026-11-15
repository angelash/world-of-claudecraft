// Damage and healing resolution: the hit table (miss, dodge, parry, block, crit; spell
// hit and resist), armor, presence pressure, aura modifiers, absorbs, threat, rage, and
// the hand-off to death or yielding. Formulas live in formulas.ts.

import type { SystemContext } from '../../core/system';
import { getEntity } from '../world';
import { breakOnDamage, soakAbsorb } from './auras';
import { killUnit, maybeYield } from './death';
import { secs } from './defs';
import {
  armorReduction,
  BLOCK_CHANCE,
  BLOCK_REDUCTION,
  dodgeChance,
  MOB_VS_ALLY_MAX_MISS,
  meleeCritChance,
  meleeMissChance,
  PARRY_CHANCE,
  PHYSICAL_CRIT_MULT,
  presencePenalty,
  rageFromDealing,
  rageFromTaking,
  SPELL_CRIT_MULT,
  spellCritChance,
  spellHitChance,
} from './formulas';
import { deriveStats } from './stats';
import { addThreat, engage, markCombat } from './threat';
import type { HitOutcome, School, Unit } from './types';
import { liveUnit } from './units';

export type HitKind = 'melee' | 'ranged' | 'spell' | 'periodic' | 'reflect';

export interface HitSpec {
  source: Unit;
  target: Unit;
  /** raw amount before crit and mitigation */
  amount: number;
  school: School;
  kind: HitKind;
  abilityId?: string;
  threatMult?: number;
  leech?: number;
  /** auto-attacks generate rage on both sides (classic white-hit rule) */
  rage?: boolean;
}

export interface HitResult {
  outcome: HitOutcome;
  dealt: number;
}

/** Share of presence pressure shrugged off when an ally stands close (power_system.md 3.5). */
function presenceResist(ctx: SystemContext, u: Unit): number {
  const e = getEntity(ctx.world, u.id);
  if (!e) return 0;
  for (const other of Object.values(ctx.world.slices.combat.units)) {
    if (other === u || other.side !== u.side || other.side === 'neutral') continue;
    const oe = getEntity(ctx.world, other.id);
    if (!oe?.alive || oe.mapId !== e.mapId) continue;
    if (Math.hypot(oe.x - e.x, oe.y - e.y) <= 6) return 0.25;
  }
  return 0;
}

export function resolveHit(ctx: SystemContext, spec: HitSpec): HitResult {
  const { source, target } = spec;
  if (!target.attackable || target.ai?.state === 'evade' || target.ai?.state === 'yielded') {
    ctx.emit('combat.damage', {
      sourceId: source.id,
      targetId: target.id,
      abilityId: spec.abilityId,
      amount: 0,
      absorbed: 0,
      school: spec.school,
      outcome: 'immune',
    });
    return { outcome: 'immune', dealt: 0 };
  }
  const sd = deriveStats(ctx.world, ctx.content, source);
  const td = deriveStats(ctx.world, ctx.content, target);
  const rng = ctx.rng('combat.hit');
  const levelGap = target.level - source.level;
  const pressure = presencePenalty(source.tier, target.tier, presenceResist(ctx, source));
  let outcome: HitOutcome = 'hit';
  let amount = spec.amount;
  let crit = false;

  if (spec.kind === 'melee' || spec.kind === 'ranged') {
    let miss = meleeMissChance(source.level, target.level);
    if (source.side === 'enemy' && target.side === 'ally')
      miss = Math.min(miss, MOB_VS_ALLY_MAX_MISS);
    miss = Math.max(0, miss - sd.stats.hit / 100) + pressure.hitPenalty;
    const dodge = spec.kind === 'melee' ? dodgeChance(td.stats.agi, td.stats.dodge, -levelGap) : 0;
    const parry = spec.kind === 'melee' && td.canParry ? PARRY_CHANCE : 0;
    const block = td.hasShield ? BLOCK_CHANCE : 0;
    const r = rng.next();
    if (r < miss) outcome = 'miss';
    else if (r < miss + dodge) outcome = 'dodge';
    else if (r < miss + dodge + parry) outcome = 'parry';
    else if (r < miss + dodge + parry + block) outcome = 'block';
    if (outcome === 'hit' && rng.next() < meleeCritChance(sd.stats.agi, sd.stats.crit, levelGap)) {
      crit = true;
      amount *= PHYSICAL_CRIT_MULT;
    }
  } else if (spec.kind === 'spell') {
    const hit =
      spellHitChance(source.level, target.level) + sd.stats.hit / 100 - pressure.hitPenalty;
    if (rng.next() >= Math.min(0.99, hit)) outcome = 'resist';
    else if (rng.next() < spellCritChance(sd.stats.int, sd.stats.crit, levelGap)) {
      crit = true;
      amount *= SPELL_CRIT_MULT;
    }
  }

  if (outcome === 'miss' || outcome === 'dodge' || outcome === 'parry' || outcome === 'resist') {
    ctx.emit('combat.damage', {
      sourceId: source.id,
      targetId: target.id,
      abilityId: spec.abilityId,
      amount: 0,
      absorbed: 0,
      school: spec.school,
      outcome,
    });
    if (target.ai) engage(ctx, target, source);
    addThreat(ctx, target, source.id, 1);
    markCombat(ctx, source);
    return { outcome, dealt: 0 };
  }

  amount *= (1 + sd.mods.damageDealt) * (1 + td.mods.damageTaken) * pressure.damageFactor;
  if (spec.school === 'physical' && spec.kind !== 'periodic' && spec.kind !== 'reflect') {
    amount *= 1 - armorReduction(td.stats.armor, source.level);
  }
  if (outcome === 'block') amount *= 1 - BLOCK_REDUCTION;
  if (crit) outcome = 'crit';
  amount = Math.max(1, Math.round(amount));
  const absorbed = soakAbsorb(ctx, target, amount);
  const dealt = amount - absorbed;
  applyDamage(ctx, {
    source,
    target,
    dealt,
    absorbed,
    school: spec.school,
    outcome: dealt <= 0 ? 'absorb' : outcome,
    abilityId: spec.abilityId,
    threat: amount * (spec.threatMult ?? 1),
    rage: spec.rage ?? false,
  });
  if (spec.leech && dealt > 0)
    healUnit(ctx, source, source, dealt * spec.leech, {
      abilityId: spec.abilityId,
      canCrit: false,
    });
  if (spec.kind === 'melee' && dealt > 0) reflectThorns(ctx, target, source);
  return { outcome, dealt };
}

interface ApplySpec {
  source: Unit;
  target: Unit;
  dealt: number;
  absorbed: number;
  school: School;
  outcome: HitOutcome;
  abilityId?: string;
  threat: number;
  rage: boolean;
}

function applyDamage(ctx: SystemContext, a: ApplySpec): void {
  const { source, target } = a;
  target.hp -= a.dealt;
  ctx.emit('combat.damage', {
    sourceId: source.id,
    targetId: target.id,
    abilityId: a.abilityId,
    amount: a.dealt,
    absorbed: a.absorbed,
    school: a.school,
    outcome: a.outcome,
  });
  if (target.tapped === null && source.side === 'ally') target.tapped = source.id;
  addThreat(ctx, target, source.id, a.threat);
  engage(ctx, target, source);
  markCombat(ctx, source);
  if (a.rage) {
    if (source.res.rage !== undefined) {
      source.res.rage = Math.min(100, source.res.rage + rageFromDealing(a.dealt, source.level));
    }
    if (target.res.rage !== undefined) {
      target.res.rage = Math.min(100, target.res.rage + rageFromTaking(a.dealt, target.level));
    }
  }
  if (a.dealt > 0) breakOnDamage(ctx, target);
  if (target.cast && a.dealt > 0 && target.side === 'ally') {
    // classic spell pushback: 0.5 s per hit, never more than 8 s past the cast start
    target.cast.end = Math.min(target.cast.end + secs(0.5), target.cast.start + secs(8));
  }
  if (maybeYield(ctx, target, source)) return;
  if (target.hp <= 0) killUnit(ctx, target, source);
}

function reflectThorns(ctx: SystemContext, bearer: Unit, attacker: Unit): void {
  for (const aura of bearer.auras) {
    if (!aura.thorns || !liveUnit(ctx.world, attacker.id) || !liveUnit(ctx.world, bearer.id))
      continue;
    resolveHit(ctx, {
      source: bearer,
      target: attacker,
      amount: aura.thorns,
      school: 'nature',
      kind: 'reflect',
      abilityId: aura.id,
    });
  }
}

export interface HealOpts {
  abilityId?: string;
  canCrit?: boolean;
}

/** Heal `target`; returns the effective amount. Healing draws half its amount as threat. */
export function healUnit(
  ctx: SystemContext,
  source: Unit,
  target: Unit,
  raw: number,
  opts: HealOpts = {},
): number {
  if (!liveUnit(ctx.world, target.id)) return 0;
  const sd = deriveStats(ctx.world, ctx.content, source);
  const td = deriveStats(ctx.world, ctx.content, target);
  let amount = raw * (1 + sd.mods.healingDone) * Math.max(0, 1 + td.mods.healingTaken);
  let crit = false;
  if (
    opts.canCrit !== false &&
    ctx.rng('combat.hit').next() < spellCritChance(sd.stats.int, sd.stats.crit, 0)
  ) {
    crit = true;
    amount *= SPELL_CRIT_MULT;
  }
  amount = Math.max(0, Math.round(amount));
  const missing = Math.max(0, td.maxHp - target.hp);
  const effective = Math.min(missing, amount);
  target.hp += effective;
  ctx.emit('combat.heal', {
    sourceId: source.id,
    targetId: target.id,
    abilityId: opts.abilityId,
    amount: effective,
    overheal: amount - effective,
    crit,
  });
  if (effective > 0 && source.side !== 'neutral') {
    for (const u of Object.values(ctx.world.slices.combat.units)) {
      if (u.side === source.side || !(target.id in u.threat)) continue;
      addThreat(ctx, u, source.id, effective * 0.5);
    }
    markCombat(ctx, source);
  }
  return effective;
}
