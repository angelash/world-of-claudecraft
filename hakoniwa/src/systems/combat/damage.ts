// Damage and healing resolution: the hit table (miss, dodge, parry, block, crit; spell
// hit and resist), armor, presence pressure (3.5), aura modifiers, the difficulty's enemy
// damage and player healing factors (16), absorbs, threat, rage, the hit-sound selection
// fields every damage event carries (8.3, presentation.ts), spell pushback (3.9), the
// party-side damage tally for credit (8.5), and the hand-off to death or yielding. A ground
// warning's hit skips the whole roll (10.3 `noRoll`); a boss's shields soak or turn away a
// hit before any absorb aura (10.4); a channel loses a quarter of what is left of it per
// hit (3.9); a hit breaks the use of an arena object (10.6); an ambusher's first blow is
// stronger (11). Formulas live in formulas.ts.

import type { SystemContext } from '../../core/system';
import { ambushMult } from './affixes';
import { breakOnDamage, soakAbsorb } from './auras';
import { breakInteract, shieldImmune, soakShield } from './boss';
import { killUnit, maybeYield } from './death';
import { secs } from './defs';
import { combatMod } from './difficulty';
import { duelHit, settleDuels } from './duel';
import {
  armorReduction,
  BLOCK_CHANCE,
  BLOCK_REDUCTION,
  CHANNEL_PUSHBACK,
  dodgeChance,
  MAX_PUSHBACKS,
  MOB_VS_ALLY_MAX_MISS,
  meleeCritChance,
  meleeMissChance,
  PARRY_CHANCE,
  PHYSICAL_CRIT_MULT,
  PUSHBACK_SEC,
  presencePenalty,
  rageFromDealing,
  rageFromTaking,
  SPELL_CRIT_MULT,
  spellCritChance,
  spellHitChance,
} from './formulas';
import { presenceResistOf } from './presence';
import { type HitPresentation, hitPresentation } from './presentation';
import { healthFell } from './proc_points';
import { deriveStats } from './stats';
import { addThreat, engage, markCombat } from './threat';
import type { HitOutcome, School, Unit } from './types';
import { isPartySide, liveUnit } from './units';

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
  /** damage of a fired trigger: triggers nothing further (13.3) */
  fromProc?: boolean;
  /** a ground warning's hit: no miss, dodge, parry, block, resist or crit (10.3) */
  noRoll?: boolean;
}

export interface HitResult {
  outcome: HitOutcome;
  dealt: number;
}

export function resolveHit(ctx: SystemContext, spec: HitSpec): HitResult {
  const { source, target } = spec;
  const sd = deriveStats(ctx.world, ctx.content, source);
  const td = deriveStats(ctx.world, ctx.content, target);
  const look = {
    ...hitPresentation(ctx.world, ctx.content, source, sd, target, td, spec.kind, spec.abilityId),
    ...(spec.fromProc ? { fromProc: true } : {}),
  };
  if (
    !target.attackable ||
    target.ai?.state === 'evade' ||
    target.ai?.state === 'yielded' ||
    shieldImmune(ctx, target)
  ) {
    ctx.emit('combat.damage', {
      sourceId: source.id,
      targetId: target.id,
      abilityId: spec.abilityId,
      amount: 0,
      absorbed: 0,
      school: spec.school,
      outcome: 'immune',
      ...look,
    });
    return { outcome: 'immune', dealt: 0 };
  }
  const rng = ctx.rng('combat.hit');
  const levelGap = target.level - source.level;
  const pressure = presencePenalty(source.tier, target.tier, presenceResistOf(ctx, source, sd));
  let outcome: HitOutcome = 'hit';
  let amount = spec.amount;
  let crit = false;
  if (spec.kind === 'melee' || spec.kind === 'ranged') amount *= ambushMult(source);

  if (spec.noRoll) {
    // the area decided: the hit lands as it is
  } else if (spec.kind === 'melee' || spec.kind === 'ranged') {
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
      ...look,
    });
    if (target.ai) engage(ctx, target, source);
    addThreat(ctx, target, source.id, 1);
    markCombat(ctx, source);
    return { outcome, dealt: 0 };
  }

  amount *= (1 + sd.mods.damageDealt) * (1 + td.mods.damageTaken) * pressure.damageFactor;
  if (source.side === 'enemy') amount *= combatMod(ctx.world, 'enemy_damage');
  if (spec.school === 'physical' && spec.kind !== 'periodic' && spec.kind !== 'reflect') {
    amount *= 1 - armorReduction(td.stats.armor, source.level);
  }
  if (outcome === 'block') amount *= 1 - BLOCK_REDUCTION;
  if (crit) outcome = 'crit';
  amount = Math.max(1, Math.round(amount));
  const shield = soakShield(ctx, target, amount, source);
  const absorbed = shield + soakAbsorb(ctx, target, amount - shield);
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
    look,
  });
  if (spec.leech && dealt > 0)
    healUnit(ctx, source, source, dealt * spec.leech, {
      abilityId: spec.abilityId,
      canCrit: false,
    });
  if (spec.kind === 'melee' && dealt > 0 && !spec.fromProc) reflectThorns(ctx, target, source);
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
  look: HitPresentation & { fromProc?: boolean };
}

function applyDamage(ctx: SystemContext, a: ApplySpec): void {
  const { source, target } = a;
  const before = target.hp;
  target.hp -= a.dealt;
  ctx.emit('combat.damage', {
    sourceId: source.id,
    targetId: target.id,
    abilityId: a.abilityId,
    amount: a.dealt,
    absorbed: a.absorbed,
    school: a.school,
    outcome: a.outcome,
    ...a.look,
  });
  if (target.tapped === null && source.side === 'ally') target.tapped = source.id;
  if (a.dealt > 0 && isPartySide(ctx.world, source))
    target.partyDamage = (target.partyDamage ?? 0) + a.dealt;
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
  if (a.dealt > 0) breakOnDamage(ctx, target, a.dealt);
  if (a.dealt > 0) breakInteract(target);
  if (target.cast?.channel && a.dealt > 0 && target.side === 'ally') {
    // a channel hit loses a quarter of what is left of it (3.9)
    const left = Math.max(0, target.cast.end - ctx.tick);
    target.cast.end -= Math.floor(left * CHANNEL_PUSHBACK);
  } else if (target.cast && a.dealt > 0 && target.side === 'ally') {
    // classic spell pushback (3.9): half a second per hit, at most twice per cast
    const pushes = target.cast.pushes ?? 0;
    if (pushes < MAX_PUSHBACKS) {
      target.cast.end += secs(PUSHBACK_SEC);
      target.cast.pushes = pushes + 1;
    }
  }
  // the fall below 30% is a trigger point (13.3 `low_hp`)
  if (a.dealt > 0) healthFell(ctx, target, before, source.id);
  if (duelHit(ctx, source, target)) return;
  if (maybeYield(ctx, target, source)) {
    settleDuels(ctx);
    return;
  }
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
  /** healing of a fired trigger: triggers nothing further (13.3) */
  fromProc?: boolean;
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
  if (target.id === ctx.world.slices.world.playerId)
    amount *= combatMod(ctx.world, 'player_healing_taken');
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
    ...(opts.fromProc ? { fromProc: true } : {}),
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
