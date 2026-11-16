// Pure combat formulas. Classic-era MMO originals, adapted from world-of-claudecraft
// (MIT) `src/sim/types.ts` (`armorReduction`, `meleeMissChance`, `spellHitChance`,
// `mobXpValue`, `zeroDiff`, `rageConversion`, `rageFromDealing`) and extended to the
// 60-level Record cap (decision D-005). Each function names its source. No state, no
// randomness: callers roll dice with their own named Rng streams.

import { type KeyText, tr } from '../../core/text';
import type { ClassDef } from './types';

export const MAX_LEVEL = 60;

// ---------------------------------------------------------------------------
// Experience

/**
 * Experience needed to go from `level` to `level + 1` (0 at the cap).
 * Classic 1 to 60 curve: XP = round100((8L + diff(L)) x (45 + 5L)), where diff is 0
 * up to 28, then 1, 3, 6 for 29 to 31 and 5 x (L - 30) from 32. Reproduces the
 * classic table (400, 900, 1400 ... 209800); the main project's `XP_TABLE` is its
 * first 20 rows.
 */
export function xpForLevel(level: number): number {
  if (level >= MAX_LEVEL || level < 1) return 0;
  let diff = 0;
  if (level === 29) diff = 1;
  else if (level === 30) diff = 3;
  else if (level === 31) diff = 6;
  else if (level >= 32) diff = 5 * (level - 30);
  return Math.round(((8 * level + diff) * (45 + 5 * level)) / 100) * 100;
}

/** Classic zero-difference band: how many levels below a player a mob stops giving XP. */
export function zeroDiff(level: number): number {
  if (level <= 7) return 5;
  if (level <= 9) return 6;
  if (level <= 11) return 7;
  if (level <= 15) return 8;
  if (level <= 19) return 9;
  if (level <= 29) return 11;
  if (level <= 39) return 12;
  if (level <= 44) return 13;
  if (level <= 49) return 14;
  if (level <= 54) return 15;
  if (level <= 59) return 16;
  return 17;
}

/** Classic gray level: mobs at or below it give no XP and do not aggro on sight. */
export function grayLevel(level: number): number {
  if (level <= 5) return 0;
  if (level <= 39) return level - Math.floor(level / 10) - 5;
  return level - Math.floor(level / 5) - 1;
}

/**
 * Classic mob XP: 45 + 5 x mobLevel; +5% per level the mob is above the player (up to
 * 4 levels); scaled down by (1 - diff / ZD) below, 0 once gray. `mult` carries elite x2.
 */
export function mobXpValue(mobLevel: number, playerLevel: number, mult = 1): number {
  const base = 45 + 5 * mobLevel;
  const diff = mobLevel - playerLevel;
  if (diff >= 0) return Math.round(base * (1 + 0.05 * Math.min(diff, 4)) * mult);
  const zd = zeroDiff(playerLevel);
  if (-diff >= zd) return 0;
  return Math.round(base * (1 - -diff / zd) * mult);
}

/** Classic group XP bonus by group size (1, 1, 1.166, 1.3, 1.43). */
export function groupXpBonus(size: number): number {
  const table = [1, 1, 1, 1.166, 1.3, 1.43];
  return table[Math.max(0, Math.min(table.length - 1, size))] ?? 1;
}

// ---------------------------------------------------------------------------
// Hit table

/** Classic armor mitigation: armor / (armor + 85 x attackerLevel + 400), capped at 75%. */
export function armorReduction(armor: number, attackerLevel: number): number {
  const a = Math.max(0, armor);
  return Math.min(0.75, a / (a + 85 * attackerLevel + 400));
}

/**
 * Melee miss by level, classic weapon-skill form (5 skill per level): skill gap up to 10
 * adds 0.1% per point, beyond 10 adds 0.4% per point on top of 7% (so a +3 target is 9%);
 * targets below the attacker shave 0.04% per point. Clamped to 0.5% .. 60%.
 */
export function meleeMissChance(attackerLevel: number, targetLevel: number): number {
  const gap = 5 * (targetLevel - attackerLevel);
  let miss: number;
  if (gap > 10) miss = 7 + (gap - 10) * 0.4;
  else if (gap >= 0) miss = 5 + gap * 0.1;
  else miss = 5 + gap * 0.04;
  return Math.min(0.6, Math.max(0.005, miss / 100));
}

/**
 * Classic spell hit: 96% at equal level, 97/98/99% against lower targets, 95/94% at +1/+2,
 * then 11 points less per further level (83% at +3, 72% at +4); floor 5%.
 */
export function spellHitChance(casterLevel: number, targetLevel: number): number {
  const diff = targetLevel - casterLevel;
  let hit: number;
  if (diff <= 0) hit = Math.min(99, 96 - diff);
  else if (diff <= 2) hit = 96 - diff;
  else hit = 94 - (diff - 2) * 11;
  return Math.max(0.05, hit / 100);
}

/** Melee crit: 5% + agility / 20 (classic warriors and rogues) + gear, -1% per target level above. */
export function meleeCritChance(agi: number, critPct: number, levelGap: number): number {
  return Math.max(0, Math.min(0.6, (5 + agi / 20 + critPct - Math.max(0, levelGap)) / 100));
}

/** Spell crit: 5% + intellect / 60 (classic caster rule of thumb) + gear, -1% per level above. */
export function spellCritChance(int: number, critPct: number, levelGap: number): number {
  return Math.max(0, Math.min(0.5, (5 + int / 60 + critPct - Math.max(0, levelGap)) / 100));
}

/** Classic critical multipliers: physical x2, spells and heals x1.5. */
export const PHYSICAL_CRIT_MULT = 2;
export const SPELL_CRIT_MULT = 1.5;

/** Dodge: 5% + agility x 0.05% for classes (main project `recalcPlayerStats`); mobs 5% + 0.5% per level above. */
export function dodgeChance(agi: number, dodgePct: number, levelGap: number): number {
  return Math.max(
    0,
    Math.min(0.6, (5 + agi * 0.05 + dodgePct + Math.max(0, levelGap) * 0.5) / 100),
  );
}

/** Parry and block are flat 5% for units that can parry or carry a shield (main project `SHIELD_BLOCK_BASE`). */
export const PARRY_CHANCE = 0.05;
export const BLOCK_CHANCE = 0.05;
/** A blocked hit loses this fraction (simplified block value). */
export const BLOCK_REDUCTION = 0.3;
/** Wild mobs always connect at least 80% against the player side (main project `MOB_VS_PLAYER_MAX_MISS`). */
export const MOB_VS_ALLY_MAX_MISS = 0.2;

// ---------------------------------------------------------------------------
// Resources

/** Classic rage conversion constant: c = 0.0091 L^2 + 3.23 L + 4.27. */
export function rageConversion(level: number): number {
  return 0.0091 * level * level + 3.23 * level + 4.27;
}

/** Classic rage from dealing damage: 7.5 x damage / c. */
export function rageFromDealing(damage: number, level: number): number {
  return (7.5 * damage) / rageConversion(level);
}

/** Classic rage from taking damage: 2.5 x damage / c. */
export function rageFromTaking(damage: number, level: number): number {
  return (2.5 * damage) / rageConversion(level);
}

/** Classic health from stamina: the first 20 points give 1 each, the rest 10 each. */
export function hpFromStamina(sta: number): number {
  const s = Math.max(0, sta);
  return Math.min(20, s) + Math.max(0, s - 20) * 10;
}

/** Classic mana from intellect: the first 20 points give 1 each, the rest 15 each. */
export function manaFromIntellect(int: number): number {
  const i = Math.max(0, int);
  return Math.min(20, i) + Math.max(0, i - 20) * 15;
}

/**
 * Classic out-of-five-second-rule mana regeneration per 2-second tick, by class
 * (priest and mage 13 + spi/4, druid hunter paladin 15 + spi/5, shaman 17 + spi/5,
 * warlock 8 + spi/4). The outsider and unlisted classes use the druid row.
 */
export function manaRegenPerTick(classId: string | null, spi: number): number {
  switch (classId) {
    case 'priest':
    case 'mage':
      return 13 + spi / 4;
    case 'shaman':
      return 17 + spi / 5;
    case 'warlock':
      return 8 + spi / 4;
    default:
      return 15 + spi / 5;
  }
}

/** Energy: 20 per 2-second tick (classic). */
export const ENERGY_PER_TICK = 20;
/** Rage decays out of combat (main project `updateRegen`: -2 per 2 seconds). */
export const RAGE_DECAY_PER_TICK = 2;

/**
 * Out-of-combat health regeneration per 2-second tick. Project tuning (main project
 * `updateRegen` uses stamina x 0.3 + 2); a 2% max-health term keeps 60-level pools
 * recovering at a playable pace in a world without food yet.
 */
export function hpRegenPerTick(sta: number, maxHp: number): number {
  return Math.max(2, sta * 0.3 + 2) + maxHp * 0.02;
}

/** Classic attack power from strength and agility by class family. */
export function attackPower(rule: ClassDef['apFrom'], str: number, agi: number): number {
  if (rule === 'str2') return str * 2;
  if (rule === 'str_agi') return str + agi;
  return str;
}

/** Spell power from intellect (main project tuning: 1 per 2 intellect). */
export function spellPowerFromInt(int: number): number {
  return int / 2;
}

/** Classic weapon swing: weapon roll + attack power / 14 x weapon speed. */
export function weaponSwing(roll: number, ap: number, speed: number): number {
  return roll + (ap / 14) * speed;
}

// ---------------------------------------------------------------------------
// Monsters (fits to classic normal-mob curves across levels 1 to 60)

/** Health of a normal mob: about 50 at 1, 600 at 20, 1880 at 40, 3880 at 60. */
export function monsterBaseHp(level: number): number {
  return 40 + 10 * level + 0.9 * level * level;
}

/** Damage per 2-second swing of a normal mob: about 4 at 1, 39 at 20, 183 at 60. */
export function monsterBaseDamage(level: number): number {
  return 3 + 1.2 * level + 0.03 * level * level;
}

/** Armor of a normal mob (main project `armorPerLevel` around 20). */
export function monsterArmor(level: number): number {
  return 20 * level;
}

/** Classic elite scaling used by the main project `createMob`: health x2.3, damage x1.5, XP x2. */
export const ELITE_HP = 2.3;
export const ELITE_DMG = 1.5;
export const ELITE_XP = 2;

// ---------------------------------------------------------------------------
// Ranks and presence (power_system.md 3.1 and 3.5; decision log Q-003)

/**
 * Rank (位阶) on the 0..7 scale: 0 凡阶初 (1-9), 1 凡阶熟 (10-19), 2 精英 (20-34),
 * 3 英雄 (35-49), 4 传说 (50-59), 5 神话 (60), 6 超越边缘 (door rank past 60),
 * 7 超越 (beyond the Record, door rank 80 and up).
 */
export function tierForLevel(level: number): number {
  if (level <= 9) return 0;
  if (level <= 19) return 1;
  if (level <= 34) return 2;
  if (level <= 49) return 3;
  if (level <= 59) return 4;
  if (level <= 60) return 5;
  if (level < 80) return 6;
  return 7;
}

/** Display name of a rank (tier 0 to 7, power_system.md 3), as a fresh text key. */
export function tierName(tier: number): KeyText | '' {
  return Number.isInteger(tier) && tier >= 0 && tier <= 7 ? tr(`sys.combat.tier.${tier}`) : '';
}

/**
 * Presence (威压) on attacks against a higher rank. Q-003 keeps the level miss penalty
 * capped and adds rank pressure on top: one rank of difference is felt but free, two or
 * more cost 10 hit points and 20% damage per rank beyond the first (hit penalty capped
 * at 40 points, damage floored at 30%). `resist` (0..1) is the share shrugged off by
 * will, faith or a companion at one's side.
 */
export function presencePenalty(
  attackerTier: number,
  targetTier: number,
  resist = 0,
): { hitPenalty: number; damageFactor: number } {
  const gap = targetTier - attackerTier;
  if (gap < 2) return { hitPenalty: 0, damageFactor: 1 };
  const k = Math.max(0, Math.min(1, 1 - resist));
  const hitPenalty = Math.min(0.4, 0.1 * (gap - 1)) * k;
  const damageFactor = 1 - (1 - Math.max(0.3, 1 - 0.2 * (gap - 1))) * k;
  return { hitPenalty, damageFactor };
}

// ---------------------------------------------------------------------------
// Death (power_system.md 9.8)

/**
 * Door fatigue (门疲) in game minutes after returning through the door: one game hour
 * plus one more per ten levels, multiplied by 1.5 for each other death in the recent
 * window (overload). Mirrors the main project's resurrection sickness scaling with level.
 */
export function doorFatigueMinutes(level: number, recentDeaths: number): number {
  const base = 60 * (1 + Math.floor(level / 10));
  return Math.round(base * (1 + 0.5 * Math.max(0, recentDeaths)));
}

/** Share of carried money left behind where the player fell (遗落). */
export const DEATH_MONEY_LOSS = 0.1;
