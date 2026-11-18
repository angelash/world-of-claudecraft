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

/** Presence resistance sources add up to at most this (combat_and_classes.md 3.5). */
export const PRESENCE_RESIST_CAP = 0.6;

/**
 * The rank pressure table (combat_and_classes.md 3.5, Q-003) by rank gap g = target rank
 * minus attacker rank: hit points lost and the damage factor of the attacker's blows.
 */
const PRESSURE: readonly { hit: number; damage: number }[] = [
  { hit: 0, damage: 1 },
  { hit: 0.03, damage: 0.92 },
  { hit: 0.08, damage: 0.8 },
  { hit: 0.15, damage: 0.65 },
  { hit: 0.25, damage: 0.5 },
];

/**
 * Presence (威压) on attacks against a higher rank (3.5): from one rank of difference the
 * attacker misses more and hits softer (gap 1: -3 points and x0.92; 2: -8 and x0.80; 3:
 * -15 and x0.65; 4 and more: -25 and x0.50). The level miss penalty itself stays capped at
 * three levels (3.4), so pressure is what makes a far stronger foe dangerous. `resist` is
 * the share shrugged off (companions at one's side, will, drink; capped at 0.6): both the
 * hit and the damage part shrink by it. An attacker of the higher rank gains nothing here.
 */
export function presencePenalty(
  attackerTier: number,
  targetTier: number,
  resist = 0,
): { hitPenalty: number; damageFactor: number } {
  const gap = targetTier - attackerTier;
  if (gap < 1) return { hitPenalty: 0, damageFactor: 1 };
  const row = PRESSURE[Math.min(PRESSURE.length - 1, gap)] as { hit: number; damage: number };
  const k = 1 - Math.max(0, Math.min(PRESENCE_RESIST_CAP, resist));
  return { hitPenalty: row.hit * k, damageFactor: 1 - (1 - row.damage) * k };
}

/** Control duration factor by rank gap 1 to 4 (3.5): on the higher rank, by the higher rank. */
const CC_ON_HIGHER: readonly number[] = [1, 0.85, 0.65, 0.45, 0.3];
const CC_BY_HIGHER: readonly number[] = [1, 1.15, 1.35, 1.6, 2];

/**
 * The rank factor of a control's duration (3.5, 9.3): a control applied to a higher rank
 * is shorter (gap 2: x0.65), one a higher rank applies to a lower rank is longer (gap 2:
 * x1.35). A 6-second control on a target two ranks up lasts 3.9 seconds; the same control
 * from two ranks up lasts 8.1.
 */
export function presenceCcFactor(applierTier: number, targetTier: number): number {
  const gap = targetTier - applierTier;
  if (gap === 0) return 1;
  const i = Math.min(CC_ON_HIGHER.length - 1, Math.abs(gap));
  return (gap > 0 ? CC_ON_HIGHER[i] : CC_BY_HIGHER[i]) ?? 1;
}

// ---------------------------------------------------------------------------
// Control (combat_and_classes.md 9)

/** Duration share of the diminishing-returns ladder: full, half, quarter, immune (9.2). */
export const DR_LADDER: readonly number[] = [1, 0.5, 0.25, 0];
/** Seconds without a new control of a category before its ladder is back at full (9.2). */
export const DR_RESET_SEC = 18;
/** Duration modifiers add up and stay within -75% and +100% (9.3). */
export const CC_MOD_MIN = -0.75;
export const CC_MOD_MAX = 1;

/** The summed duration modifier, kept inside its range (9.3). */
export function ccModFactor(sum: number): number {
  return 1 + Math.max(CC_MOD_MIN, Math.min(CC_MOD_MAX, sum));
}

/**
 * Longest base duration a monster's control may carry against the player's side (9.1):
 * stun 3, root 6, silence 4, fear 6, incapacitate 6, disarm 6 seconds. Rank scaling may
 * lengthen it in play; this caps the data.
 */
export const MOB_CC_CAP: Readonly<Partial<Record<string, number>>> = {
  stun: 3,
  root: 6,
  silence: 4,
  fear: 6,
  incapacitate: 6,
  disarm: 6,
};

/** Fear breaks on a hit with chance damage / (scale x max health), at most 1 (9.7). */
export function fearBreakChance(damage: number, maxHp: number, scale = 0.1): number {
  if (damage <= 0 || maxHp <= 0) return 0;
  return Math.min(1, damage / (Math.max(1e-6, scale) * maxHp));
}

/** Classic spell pushback (3.9): half a second per hit, at most twice per cast. */
export const PUSHBACK_SEC = 0.5;
export const MAX_PUSHBACKS = 2;
/** A hit on a channel takes this share of what is left of it (3.9). */
export const CHANNEL_PUSHBACK = 0.25;

// ---------------------------------------------------------------------------
// Standard amount, the skill rack, party size (combat_and_classes.md 3.1, 7, 5.5)

/**
 * The standard amount S(L) = round(0.18 x (40 + 10L + 0.9L^2)) (3.1): 18% of a normal
 * monster's health at level L, the base damage of a 2.5-second single-target spell of
 * rank level L before power. Abilities are written as k x S(R) for their rank level R.
 */
export function standardAmount(level: number): number {
  return Math.round(0.18 * monsterBaseHp(level));
}

/** Skill rack capacity by level (7): 8 up to 9, 12 to 19, 16 to 34, 20 to 49, 24 from 50. */
export function skillRackSize(level: number): number {
  if (level <= 9) return 8;
  if (level <= 19) return 12;
  if (level <= 34) return 16;
  if (level <= 49) return 20;
  return 24;
}

/**
 * Health scale of a boss fought by fewer than its full party (5.5): (actual / full)^0.8,
 * never above 1. A lair lord (full party 3) fought alone keeps 0.415 of its health.
 */
export function partySizeHpScale(actual: number, full: number): number {
  if (full <= 0) return 1;
  return Math.min(1, Math.max(0, actual) / full) ** 0.8;
}

/**
 * Full party of each boss layer for the health scale (5.5: lair 2 to 3, dungeon 4 to 5,
 * great dungeon 6 to 10; the upper end, which gives 17.4's lone duel with Seg: 8 x
 * (1 / 3)^0.8 = 3.32). The surge lord's open fight has no full party.
 */
export const FULL_PARTY: Readonly<Record<string, number>> = {
  lair: 3,
  dungeon: 5,
  raid: 10,
};

// ---------------------------------------------------------------------------
// Death (power_system.md 9.8)

/**
 * The revival-fatigue state (复苏门疲) in game minutes after returning through the door
 * (thousand_doors.md 6.3, combat_and_classes.md 15.1): 2 game hours plus one per ten door
 * ranks, at most 10, times (1 + 0.5 x overload stacks), the stacks being the other deaths
 * within one game day, at most three, times the difficulty's death-fatigue factor (16:
 * story 0.5, legend 1.5). Door rank 45 gives 6 hours; two stacks make it 12.
 */
export function doorFatigueMinutes(doorRank: number, recentDeaths: number, factor = 1): number {
  const hours = Math.min(10, 2 + Math.floor(Math.max(1, doorRank) / 10));
  const stacks = Math.min(3, Math.max(0, recentDeaths));
  return Math.round(60 * hours * (1 + 0.5 * stacks) * Math.max(0, factor));
}

/**
 * Game minutes the player spends reforming in the corridor before the return lands (15.1):
 * one game hour plus half an hour per overload stack.
 */
export function revivalMinutes(stacks: number): number {
  return 60 + 30 * Math.min(3, Math.max(0, stacks));
}

/** Share of carried money left behind where the player fell (遗落) at standard difficulty. */
export const DEATH_MONEY_LOSS = 0.1;
/** Share of every stack of stackable goods left in the drop bag, rounded down (15.1). */
export const DROP_STACK_SHARE = 0.25;
/** Game days a drop bag stays where the player fell (15.1). */
export const DROP_BAG_DAYS = 3;
/** Door fatigue a return through the door leaves at least, before difficulty (15.1). */
export const RETURN_FATIGUE_FLOOR = 60;
/** Share of a monster's health the player's side must deal for the credit (8.5). */
export const CREDIT_SHARE = 0.1;

// ---------------------------------------------------------------------------
// Boss kill-time targets (combat_and_classes.md 17.3, 17.4) and the hard enrage (10.5)

/** Health multiple of each boss layer over a normal monster (5.5; tutorial as an elite). */
export const LAYER_HP: Readonly<Record<string, number>> = {
  tutorial: 2.3,
  lair: 8,
  dungeon: 15,
  raid: 30,
  surge: 40,
};

/** Full party of each layer for the kill-time target (17.4: 1, 2.5, 4.5, 8, 8). */
export const LAYER_PARTY: Readonly<Record<string, number>> = {
  tutorial: 1,
  lair: 2.5,
  dungeon: 4.5,
  raid: 8,
  surge: 8,
};

/** Effective output of a party of 1 to 10 in standard outputs (17.3). */
const EFFECTIVE: readonly number[] = [0, 1, 1.65, 2.65, 2.9, 3.9, 4.9, 5.9, 6.55, 6.8, 7.8];

/** A party's effective output (17.3), interpolated for fractional sizes. */
export function effectiveOutput(size: number): number {
  const n = Math.max(1, Math.min(10, size));
  const lo = Math.floor(n);
  const hi = Math.min(10, lo + 1);
  const a = EFFECTIVE[lo] ?? 1;
  const b = EFFECTIVE[hi] ?? a;
  return a + (b - a) * (n - lo);
}

/**
 * The target kill time of a boss (17.4): layer health x party factor x the standard kill
 * time (8 + L / 10) / the effective output of the party that fights it. The rat king (a
 * dungeon lord, level 18, two of a full 4.5) gives 46.5 seconds.
 */
export function bossTargetKillTime(level: number, layer: string, actual?: number): number {
  const hp = LAYER_HP[layer] ?? LAYER_HP.lair ?? 8;
  const full = LAYER_PARTY[layer] ?? 2.5;
  const n = actual ?? full;
  const factor = Math.min(1, n / full) ** 0.8;
  return (hp * factor * (8 + level / 10)) / effectiveOutput(n);
}

/** The hard enrage's default time (10.5): 2.5 target kill times, rounded to 5 seconds. */
export function berserkSeconds(level: number, layer: string, actual?: number): number {
  return Math.round((2.5 * bossTargetKillTime(level, layer, actual)) / 5) * 5;
}
