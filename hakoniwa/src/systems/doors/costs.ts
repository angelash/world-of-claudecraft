// Two of the three door costs that are the player's own (thousand_doors.md 6.1 to 6.3):
// blockage (淤塞, 0 to 100, kept in tenths) and door fatigue (门疲, 0 to 100, ten off per
// game hour). Taint turns into blockage at four to one (6.2, C83): doors watches the
// player.taint mirror the taint system writes, so the taint itself keeps accruing as it
// was. A return through the door (combat.player_returned) floors the fatigue at 60 and
// adds 3 blockage per overload stack (deaths within one game day, at most three). Neither
// cost ever moves the door rank or the seal.

import type { SystemContext } from '../../core/system';
import { TICKS_PER_GAME_DAY, TICKS_PER_GAME_HOUR } from '../../core/time';
import { ensureSlice } from './slice';
import type { DoorDef } from './types';

/** Taint per point of blockage (6.2, C83). */
export const TAINT_PER_BLOCKAGE = 4;
/** Blockage per overload stack of a return through the door (6.3). */
export const OVERLOAD_BLOCKAGE = 3;
export const MAX_OVERLOAD = 3;
/** The fatigue a return through the door leaves at least (6.3). */
export const RETURN_FATIGUE = 60;
/** Fatigue that wears off per game hour (6.3). */
export const FATIGUE_PER_HOUR = 10;

/**
 * The blockage and door fatigue opening `door` adds in act `act` (its `openCost`; 6.2 ties
 * the abyss door's +10 to the act 1 opening): the opening settlement and the door card's
 * cost preview read the same numbers.
 */
export function openCostNow(
  door: Pick<DoorDef, 'openCost'>,
  act: number,
): { blockage: number; fatigue: number } {
  const c = door.openCost;
  if (!c || (c.act !== undefined && c.act !== act)) return { blockage: 0, fatigue: 0 };
  return { blockage: c.blockage ?? 0, fatigue: c.fatigue ?? 0 };
}

/** Blockage tiers (6.2): clear, sluggish, clogged, gnawing, drowning, swallowed. */
export function blockageTier(blockage: number): number {
  if (blockage >= 100) return 5;
  if (blockage >= 80) return 4;
  if (blockage >= 60) return 3;
  if (blockage >= 40) return 2;
  if (blockage >= 20) return 1;
  return 0;
}

/** Whole-number blockage of the slice (tenths kept inside). */
export function blockageOf(tenths: number): number {
  return Math.floor(tenths / 10);
}

/** Add blockage (whole points, may be fractional or negative), clamped 0 to 100. */
export function addBlockage(ctx: SystemContext, amount: number): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const before = slice.blockage ?? 0;
  const after = Math.max(0, Math.min(1000, before + Math.round(amount * 10)));
  if (after === before) return;
  slice.blockage = after;
  ctx.setFlag('blockage', blockageOf(after));
  const from = blockageTier(blockageOf(before));
  const tier = blockageTier(blockageOf(after));
  if (tier !== from) ctx.emit('doors.blockage_tier', { tier, from });
}

/**
 * The player's taint moved from `previous` to `value`: every 4 points gained become one
 * point of blockage (a fall, a cure, adds nothing).
 */
export function taintChanged(ctx: SystemContext, value: unknown, previous: unknown): void {
  const now = typeof value === 'number' ? value : 0;
  const was = typeof previous === 'number' ? previous : 0;
  if (now <= was) return;
  const slice = ensureSlice(ctx.world, ctx.content);
  const carry = (slice.taintCarry ?? 0) + (now - was);
  const whole = Math.floor(carry / TAINT_PER_BLOCKAGE);
  slice.taintCarry = carry - whole * TAINT_PER_BLOCKAGE;
  if (whole > 0) addBlockage(ctx, whole);
}

/** Let the fatigue wear off up to the current tick (ten per whole game hour). */
export function settleFatigue(ctx: SystemContext): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const now = ctx.tick;
  const fatigue = slice.fatigue ?? 0;
  if (fatigue <= 0) {
    slice.fatigueAt = now;
    return;
  }
  const hours = Math.floor((now - (slice.fatigueAt ?? now)) / TICKS_PER_GAME_HOUR);
  if (hours <= 0) return;
  slice.fatigueAt = (slice.fatigueAt ?? now) + hours * TICKS_PER_GAME_HOUR;
  setFatigue(ctx, fatigue - hours * FATIGUE_PER_HOUR);
}

/** Set the fatigue (clamped 0 to 100) and its mirror flag. */
export function setFatigue(ctx: SystemContext, value: number): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const v = Math.max(0, Math.min(100, Math.round(value)));
  if (v > 0 && (slice.fatigue ?? 0) <= 0) slice.fatigueAt = ctx.tick;
  slice.fatigue = v;
  ctx.setFlag('door_fatigue', v);
}

/**
 * Content wrote blockage or door_fatigue itself (a scene, a quest effect): take the written
 * value into the slice, so the next change starts from it instead of overwriting it.
 */
export function costFlagWritten(ctx: SystemContext, key: 'blockage' | 'door_fatigue'): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const v = ctx.flag(key);
  const n = typeof v === 'number' && Number.isFinite(v) ? v : 0;
  if (key === 'blockage') {
    if (blockageOf(slice.blockage ?? 0) !== n)
      slice.blockage = Math.max(0, Math.min(1000, Math.round(n * 10)));
    return;
  }
  if ((slice.fatigue ?? 0) !== n) {
    if (n > 0 && (slice.fatigue ?? 0) <= 0) slice.fatigueAt = ctx.tick;
    slice.fatigue = Math.max(0, Math.min(100, Math.round(n)));
  }
}

/** Overload stacks for a return at `tick`: earlier returns within one game day, at most 3. */
export function overloadStacks(deaths: readonly number[], tick: number): number {
  const recent = deaths.filter((t) => t > tick - TICKS_PER_GAME_DAY).length;
  return Math.min(MAX_OVERLOAD, recent);
}

/**
 * The player came back through the door (6.3): count the overload stacks, floor the
 * fatigue at 60 (or at the floor the return names: the difficulty's factor, combat 16) and
 * add the overload blockage. The revival-fatigue aura and the other death costs are the
 * combat system's (combat_and_classes.md 15.1).
 */
export function playerReturned(
  ctx: SystemContext,
  floor = RETURN_FATIGUE,
  overload?: number,
): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const revive = slice.revive ?? { deaths: [], stacks: 0 };
  // combat counts the stacks at the death (15.1 step 2); the return lands later
  const stacks =
    overload !== undefined
      ? Math.min(MAX_OVERLOAD, Math.max(0, overload))
      : overloadStacks(revive.deaths, ctx.tick);
  revive.deaths = [...revive.deaths.filter((t) => t > ctx.tick - TICKS_PER_GAME_DAY), ctx.tick];
  revive.stacks = stacks;
  slice.revive = revive;
  settleFatigue(ctx);
  setFatigue(ctx, Math.max(slice.fatigue ?? 0, floor));
  if (stacks > 0) addBlockage(ctx, OVERLOAD_BLOCKAGE * stacks);
}
