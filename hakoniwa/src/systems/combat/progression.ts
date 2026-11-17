// Progression rules the combat system applies to experience (progression_and_pacing.md
// 2.2, 3.3, 4.1, 4.3, 4.4; decisions D-060 and D-069): the per-act level bands, the
// catch-up line (band floor minus 2) with its factor 1.5 on quest and kill experience,
// which also gates the story-boss level sync, the split of kill experience (the player
// keeps the solo value, companions are counted on their own), and the pass-on pool
// `xp_overflow` that collects experience earned past the level cap. Pure: no state, no
// randomness; the system modules read the act flag and the units and call these.

import type { FlagValue } from '../../core/contracts';
import type { TextParam } from '../../core/text';
import { groupXpBonus, mobXpValue } from './formulas';

/** Level band per act, 1 to 6 (progression 2.2, 19): `[band_min, band_max]`. */
export const LEVEL_BANDS: Readonly<Record<number, readonly [number, number]>> = {
  1: [1, 15],
  2: [15, 30],
  3: [30, 45],
  4: [45, 55],
  5: [55, 60],
  6: [60, 60],
};

/** Catch-up holds at or below the act's band floor minus this many levels (4.1). */
export const CATCH_UP_GAP = 2;
/** Quest and kill experience factor while catch-up holds (4.1). */
export const CATCH_UP_FACTOR = 1.5;
/** Registry variable of the pass-on pool (4.4; world_state_registry.md). */
export const XP_OVERFLOW_FLAG = 'xp_overflow';

/** The act number of an act flag value (`act1` to `act6`); null for the prologue and epilogue. */
export function actNumber(act: FlagValue | undefined): number | null {
  if (typeof act !== 'string') return null;
  const m = /^act([1-6])$/.exec(act);
  return m ? Number(m[1]) : null;
}

/** The level band of an act flag value, or null outside acts 1 to 6. */
export function levelBand(act: FlagValue | undefined): readonly [number, number] | null {
  const n = actNumber(act);
  return n === null ? null : (LEVEL_BANDS[n] ?? null);
}

/** The highest level at which catch-up holds in this act (band_min - 2), or null. */
export function catchUpLine(act: FlagValue | undefined): number | null {
  const band = levelBand(act);
  return band ? band[0] - CATCH_UP_GAP : null;
}

/**
 * Catch-up (4.1): the player's level is at or below the act's band floor minus 2. Never in
 * act 1 (the line is -1), never in the prologue or epilogue. The same line gates the
 * story-boss level sync (4.3).
 */
export function catchUpActive(level: number, act: FlagValue | undefined): boolean {
  const line = catchUpLine(act);
  return line !== null && level <= line;
}

/**
 * Whether catch-up scales experience of this reason (4.1): quest experience (`quest` and
 * `quest:*`) and kills (`kill:*`); first clears (`first:*`), exploration (`explore:*`) and
 * any other reason keep their value (17.2 lists the reasons).
 */
export function catchUpScales(reason: TextParam): boolean {
  if (typeof reason !== 'string') return false;
  return reason === 'quest' || reason.startsWith('quest:') || reason.startsWith('kill:');
}

/** The factor on the player's experience of this reason at this level and act. */
export function playerXpFactor(
  level: number,
  act: FlagValue | undefined,
  reason: TextParam,
): number {
  return catchUpScales(reason) && catchUpActive(level, act) ? CATCH_UP_FACTOR : 1;
}

/**
 * Kill experience of one credited party member (3.3; companions_and_party.md 4.2). The
 * player takes the classic solo value against its own level: never split by the party
 * size, never multiplied by the group bonus, so dropping the companions gains nothing.
 * Each companion takes the classic solo value against its own level, times the classic
 * group bonus of the whole credited party, divided by the number of companions, so the
 * companions never take from the player's share. `mult` is the monster's layer multiplier.
 */
export function killXpShare(
  victimLevel: number,
  memberLevel: number,
  mult: number,
  isPlayer: boolean,
  partySize: number,
  companions: number,
): number {
  const solo = mobXpValue(victimLevel, memberLevel, mult);
  if (isPlayer) return solo;
  return (solo * groupXpBonus(partySize)) / Math.max(1, companions);
}

/**
 * Story-boss level sync (4.3, 18.2; D-060): the level a monster carrying `partySync` takes
 * on its first pull, or null when the sync does not fire. It fires only while the player
 * is at or below the catch-up line of the current act; the level is then the player's own
 * plus the data offset (0 under 18.2), at least the sync floor, at most the design level.
 */
export function syncLevel(
  sync: { offset: number; min?: number },
  designLevel: number,
  playerLevel: number,
  act: FlagValue | undefined,
): number | null {
  if (!catchUpActive(playerLevel, act)) return null;
  return Math.max(sync.min ?? 1, Math.min(designLevel, playerLevel + sync.offset));
}
