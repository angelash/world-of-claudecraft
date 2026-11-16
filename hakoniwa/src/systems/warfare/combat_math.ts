// Regiment combat math (warfare_rts.md 2.2, 3.2, 3.4, 5.3): damage-vs-armor counters,
// role counters, formations, the classic armor reduction and hit formulas, aspect
// (front, flank, rear) and the expected-damage product. Pure functions.

import type { ArmorType, DamageType, Formation, KernelUnit, UnitRole, UnitTypeDef } from './types';

/** Damage type vs armor type multipliers (warfare_rts.md 3.2). */
export const DAMAGE_VS_ARMOR: Record<DamageType, Record<ArmorType, number>> = {
  slash: {
    none: 1.2,
    light: 1.0,
    medium: 0.8,
    heavy: 0.5,
    monster: 0.8,
    building: 0.2,
    spirit: 0.5,
  },
  pierce: {
    none: 1.0,
    light: 1.0,
    medium: 1.0,
    heavy: 0.8,
    monster: 1.2,
    building: 0.2,
    spirit: 0.5,
  },
  blunt: {
    none: 0.9,
    light: 0.9,
    medium: 1.0,
    heavy: 1.2,
    monster: 1.0,
    building: 0.6,
    spirit: 0.8,
  },
  missile: {
    none: 1.2,
    light: 1.0,
    medium: 0.7,
    heavy: 0.4,
    monster: 0.8,
    building: 0.1,
    spirit: 0.3,
  },
  magic: {
    none: 1.0,
    light: 1.0,
    medium: 1.0,
    heavy: 1.0,
    monster: 0.9,
    building: 0.5,
    spirit: 1.2,
  },
  holy: {
    none: 0.8,
    light: 0.8,
    medium: 0.8,
    heavy: 0.8,
    monster: 1.0,
    building: 0.3,
    spirit: 2.0,
  },
  siege: {
    none: 0.8,
    light: 0.8,
    medium: 0.8,
    heavy: 0.8,
    monster: 1.0,
    building: 3.0,
    spirit: 0.5,
  },
};

export interface FormationInfo {
  /** share of the regiment in the front rank (contact slots) */
  frontage: number;
  move: number;
  /** area-of-effect damage taken */
  aoeTaken: number;
  /** ranged damage taken on the front aspect */
  rangedFront: number;
  /** melee damage dealt */
  meleeDealt: number;
  /** flank damage multiplier (column is worse) */
  flank: number;
  /** charge morale shock multiplier */
  chargeShock: number;
}

/** Formation table (warfare_rts.md 5.3, initial values). */
export const FORMATIONS: Record<Formation, FormationInfo> = {
  line: {
    frontage: 0.5,
    move: 1.0,
    aoeTaken: 1.0,
    rangedFront: 1.0,
    meleeDealt: 1.0,
    flank: 1.25,
    chargeShock: 1,
  },
  column: {
    frontage: 0.2,
    move: 1.3,
    aoeTaken: 1.3,
    rangedFront: 1.0,
    meleeDealt: 0.9,
    flank: 1.5,
    chargeShock: 1,
  },
  square: {
    frontage: 0.35,
    move: 0.6,
    aoeTaken: 1.3,
    rangedFront: 1.0,
    meleeDealt: 1.0,
    flank: 1.0,
    chargeShock: 1,
  },
  wedge: {
    frontage: 0.3,
    move: 1.0,
    aoeTaken: 1.1,
    rangedFront: 1.0,
    meleeDealt: 1.1,
    flank: 1.35,
    chargeShock: 1.5,
  },
  skirmish: {
    frontage: 0.4,
    move: 1.1,
    aoeTaken: 0.6,
    rangedFront: 0.6,
    meleeDealt: 0.8,
    flank: 1.25,
    chargeShock: 1,
  },
  shield_wall: {
    frontage: 0.45,
    move: 0.3,
    aoeTaken: 1.0,
    rangedFront: 0.5,
    meleeDealt: 0.95,
    flank: 1.25,
    chargeShock: 1,
  },
  circle: {
    frontage: 0.3,
    move: 0.5,
    aoeTaken: 1.2,
    rangedFront: 0.9,
    meleeDealt: 0.9,
    flank: 1.0,
    chargeShock: 1,
  },
};

/** Absolute cap on soldiers in contact per regiment per enemy. */
export const MAX_CONTACT = 30;
/** Contact slots around a hero (warfare_rts.md 2.5). */
export const HERO_CONTACT_SLOTS = 6;

export const CAVALRY: ReadonlySet<UnitRole> = new Set<UnitRole>(['light_cav', 'heavy_cav']);
export const BACKLINE: ReadonlySet<UnitRole> = new Set<UnitRole>(['archer', 'mage', 'healer']);

export function isRanged(u: KernelUnit): boolean {
  return u.range >= 3;
}

/** Classic-era armor reduction: armor / (armor + 400 + 85 x attacker level), capped at 75%. */
export function armorReduction(armor: number, attackerLevel: number): number {
  if (armor <= 0) return 0;
  const dr = armor / (armor + 400 + 85 * Math.max(1, attackerLevel));
  return Math.min(0.75, Math.max(0, dr));
}

export function hitChance(attacker: KernelUnit, defenderDodge: number): number {
  return Math.min(0.98, Math.max(0.3, attacker.hitBase - defenderDodge));
}

/** Regiment footprint radius in battle tiles. */
export function regimentRadius(count: number): number {
  return 0.45 + Math.sqrt(Math.max(1, count)) / 12;
}

export function engagedSlots(count: number, formation: Formation, broken: boolean): number {
  const f = FORMATIONS[formation].frontage * (broken ? 0.5 : 1);
  return Math.max(1, Math.min(MAX_CONTACT, count, Math.ceil(count * f)));
}

export type Aspect = 'front' | 'flank' | 'rear';

/** Which side of the defender the attacker stands on, from the defender's facing. */
export function aspectOf(
  defender: { x: number; y: number; facing: number },
  ax: number,
  ay: number,
): Aspect {
  const ang = Math.atan2(ay - defender.y, ax - defender.x);
  let d = Math.abs(ang - defender.facing) % (Math.PI * 2);
  if (d > Math.PI) d = Math.PI * 2 - d;
  if (d <= Math.PI / 3) return 'front';
  if (d <= (Math.PI * 2) / 3) return 'flank';
  return 'rear';
}

export function moraleDamageFactor(morale: number): number {
  if (morale >= 70) return 1.05;
  if (morale >= 40) return 1;
  return 0.9;
}

export function fatigueDamageFactor(fatigue: number): number {
  return fatigue > 50 ? 1 - ((fatigue - 50) / 50) * 0.3 : 1;
}

export function fatigueSpeedFactor(fatigue: number): number {
  return fatigue > 50 ? 1 - ((fatigue - 50) / 50) * 0.35 : 1;
}

export interface RoleCounterInput {
  attacker: KernelUnit;
  defender: KernelUnit;
  attackerFormation: Formation;
  defenderFormation: Formation;
  aspect: Aspect;
  ranged: boolean;
}

/** Role counters stacked on the damage table (warfare_rts.md 3.2). */
export function roleCounter(c: RoleCounterInput): number {
  let m = 1;
  const a = c.attacker;
  const d = c.defender;
  if (a.role === 'spear' && CAVALRY.has(d.role) && c.attackerFormation !== 'column') m *= 1.6;
  if (CAVALRY.has(a.role) && BACKLINE.has(d.role) && !c.ranged) m *= 1.5;
  if (c.ranged && c.aspect === 'front') m *= FORMATIONS[c.defenderFormation].rangedFront;
  if (a.dmgType === 'magic' && c.ranged) m *= FORMATIONS[c.defenderFormation].aoeTaken;
  if (a.role === 'scout' && BACKLINE.has(d.role) && c.aspect !== 'front') m *= 1.4;
  if (d.role === 'flying' && a.dmgType === 'missile') m *= 1.5;
  const dTags = d.tags ?? [];
  if (
    (a.tags ?? []).includes('anti_monster') &&
    (dTags.includes('monster') || dTags.includes('undead'))
  )
    m *= 1.3;
  return m;
}

export function aspectFactor(aspect: Aspect, formation: Formation): number {
  if (aspect === 'front') return 1;
  if (aspect === 'flank') return FORMATIONS[formation].flank;
  return 1.5;
}

export interface ExpectedDamageInput {
  attacker: KernelUnit;
  defender: KernelUnit;
  engaged: number;
  interval: number;
  attackerFormation: Formation;
  defenderFormation: Formation;
  aspect: Aspect;
  ranged: boolean;
  /** terrain, morale, fatigue, aura and modifier factors multiplied together */
  situational: number;
}

/**
 * Expected damage dealt by `engaged` soldiers during `interval` seconds:
 * engaged x (interval / attackInterval) x avg dmg x hit x (1 - armor DR) x counters x situational.
 */
export function expectedDamage(e: ExpectedDamageInput): number {
  const a = e.attacker;
  const d = e.defender;
  const avg = (a.dmgMin + a.dmgMax) / 2;
  const dmgType: DamageType = e.ranged || !isRanged(a) ? a.dmgType : 'slash';
  const meleeByShooter = !e.ranged && isRanged(a) ? 0.6 : 1;
  const hit = hitChance(a, d.dodgeBase);
  const dr = armorReduction(d.armor, a.level);
  const table = DAMAGE_VS_ARMOR[dmgType][d.armorType];
  const role = roleCounter({
    attacker: a,
    defender: d,
    attackerFormation: e.attackerFormation,
    defenderFormation: e.defenderFormation,
    aspect: e.aspect,
    ranged: e.ranged,
  });
  const melee = e.ranged ? 1 : FORMATIONS[e.attackerFormation].meleeDealt;
  return (
    e.engaged *
    (e.interval / Math.max(0.5, a.attackInterval)) *
    avg *
    hit *
    (1 - dr) *
    table *
    role *
    aspectFactor(e.aspect, e.defenderFormation) *
    melee *
    meleeByShooter *
    e.situational
  );
}

/** Per-soldier expected damage per second against a neutral target (C-layer power). */
export function soldierDps(u: KernelUnit): number {
  const avg = (u.dmgMin + u.dmgMax) / 2;
  return (avg / Math.max(0.5, u.attackInterval)) * Math.min(0.98, Math.max(0.3, u.hitBase - 0.05));
}

/** Effective hit points of one soldier against an average attacker (level 15). */
export function soldierEhp(u: KernelUnit): number {
  return u.hp / (1 - armorReduction(u.armor, 15)) / Math.max(0.5, 1 - u.dodgeBase);
}

export const QUALITY_COEF: Record<UnitTypeDef['quality'], number> = {
  recruit: 0.9,
  regular: 1,
  elite: 1.15,
};
