// The seal (封印松动, thousand_doors.md 6.4): the kernel keeps half points (seal_points,
// 0 to 200) and mirrors seal_looseness = seal_points / 2 for every condition, ledger and
// prompt; the stage rises with the thresholds 5, 15, 30, 45, 60, 100, never past the
// current act, and never falls. Doors add their tier's increment (plus the forbidden
// weight) and stop at 99; closing settles part of it back. seal_unrest follows the act
// rule of 6.4.4. Pure functions first, then the writers on a SystemContext.

import type { SystemContext } from '../../core/system';
import { actNumber } from './keys';
import { ensureSlice } from './slice';
import type { DoorDef, SealTier } from './types';

/** Half points per tier (6.4.1). */
export const SEAL_POINTS: Readonly<Record<SealTier, number>> = {
  none: 0,
  micro: 1,
  small: 2,
  medium: 4,
  large: 8,
  extreme: 16,
};

/** Points a closed door gives back, by tier (3.6, 6.4.1). */
export const SEAL_SETTLE: Readonly<Record<SealTier, number>> = {
  none: 0,
  micro: 0,
  small: 0,
  medium: 2,
  large: 4,
  extreme: 8,
};

/** The forbidden-door weight in half points (+2 looseness); it never settles back. */
export const FORBIDDEN_POINTS = 4;

/** Doors stop at 99 (198 points); only the restoration door reaches 100 (6.4.3). */
export const SATURATION_POINTS = 198;
export const MAX_POINTS = 200;

/** Stage thresholds in looseness (6.4.3): stage i starts at STAGE_AT[i]. */
export const STAGE_AT: readonly number[] = [0, 5, 15, 30, 45, 60, 100];

/** Seal points a door adds when it opens. */
export function openPoints(door: DoorDef): number {
  return (SEAL_POINTS[door.seal] ?? 0) + (door.forbidden ? FORBIDDEN_POINTS : 0);
}

/** Seal points a door gives back when it is closed (the forbidden weight stays). */
export function closePoints(door: DoorDef): number {
  return SEAL_SETTLE[door.seal] ?? 0;
}

/** The stage the looseness reaches with no act cap. */
export function rawStage(looseness: number): number {
  let s = 0;
  for (let i = 1; i < STAGE_AT.length; i++) if (looseness >= (STAGE_AT[i] ?? Infinity)) s = i;
  return s;
}

/** The stage for a looseness in an act: capped at the act (prologue 0, act 6 and later 6). */
export function cappedStage(looseness: number, act: number): number {
  return Math.min(rawStage(looseness), Math.max(0, Math.min(6, act)));
}

/**
 * seal_unrest a door adds when it opens in `act` (6.4.4): acts 1 and 2 add 3 for every door
 * but the `none` ones (the first door and the inner court), the forbidden weight is 15 in
 * act 1 and 6 from act 2; from act 3 only the doors keyed in the ruins add 3. The prologue
 * adds nothing.
 */
export function unrestDelta(door: DoorDef, act: number): number {
  if (act < 1) return 0;
  const rule = door.unrest ?? 'default';
  let base = 0;
  if (rule === 'ruins') base = 3;
  else if (rule === 'default' && act <= 2) base = 3;
  const weight = door.forbidden ? (act === 1 ? 15 : 6) : 0;
  return base + weight;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Write the seal points and their mirrors, then raise the stage if it moved. */
function writeSeal(ctx: SystemContext, points: number): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const p = Math.max(0, Math.min(MAX_POINTS, Math.round(points)));
  slice.sealPoints = p;
  ctx.setFlag('seal_points', p);
  ctx.setFlag('seal_looseness', p / 2);
  raiseStage(ctx);
}

/**
 * The half points as the flags hold them now. Content (scenes, quests) may have written
 * seal_looseness or seal_points earlier in this tick, before doors heard of it: a written
 * looseness wins, then written points, else the slice.
 */
function currentPoints(ctx: SystemContext, prefer?: 'seal_points' | 'seal_looseness'): number {
  const slice = ensureSlice(ctx.world, ctx.content);
  const held = slice.sealPoints ?? 0;
  const loose = ctx.flag('seal_looseness');
  const pts = ctx.flag('seal_points');
  const fromLoose = typeof loose === 'number' ? Math.round(num(loose) * 2) : undefined;
  const fromPoints = typeof pts === 'number' ? Math.round(num(pts)) : undefined;
  if (prefer === 'seal_points' && fromPoints !== undefined && fromPoints !== held)
    return fromPoints;
  if (fromLoose !== undefined && fromLoose !== held) return fromLoose;
  if (fromPoints !== undefined && fromPoints !== held) return fromPoints;
  return held;
}

/** Take a content write of the seal into the slice and both mirrors. */
function syncSeal(ctx: SystemContext, prefer?: 'seal_points' | 'seal_looseness'): number {
  const slice = ensureSlice(ctx.world, ctx.content);
  const points = currentPoints(ctx, prefer);
  if (
    points !== slice.sealPoints ||
    ctx.flag('seal_points') !== points ||
    ctx.flag('seal_looseness') !== points / 2
  ) {
    if (points !== 0 || ctx.flag('seal_points') !== undefined || slice.sealPoints !== 0)
      writeSeal(ctx, points);
  }
  return points;
}

/** Raise the stage to what the looseness and the act allow (never lower it). */
function raiseStage(ctx: SystemContext): void {
  const slice = ensureSlice(ctx.world, ctx.content);
  const act = actNumber(ctx.flag('act'));
  const from = slice.sealStage ?? 0;
  const to = Math.max(from, cappedStage((slice.sealPoints ?? 0) / 2, act));
  if (to === from) return;
  slice.sealStage = to;
  ctx.setFlag('seal_stage', to);
  ctx.emit('seal.stage_up', { stage: to, from });
}

/** Bring in any content write of the seal, then raise the stage (act changes, the tick). */
export function updateStage(ctx: SystemContext): void {
  syncSeal(ctx);
  raiseStage(ctx);
}

/** A door opened: its tier's increment and the forbidden weight, saturating at 99. */
export function sealOnOpen(ctx: SystemContext, door: DoorDef): number {
  const before = syncSeal(ctx);
  const add = openPoints(door);
  const after = before >= SATURATION_POINTS ? before : Math.min(SATURATION_POINTS, before + add);
  if (after !== before) writeSeal(ctx, after);
  return (after - before) / 2;
}

/** A door closed: part of its increment settles back (looseness delta, negative). */
export function sealOnClose(ctx: SystemContext, door: DoorDef): number {
  const before = syncSeal(ctx);
  const after = Math.max(0, before - closePoints(door));
  if (after !== before) writeSeal(ctx, after);
  return (after - before) / 2;
}

/**
 * Content wrote seal_looseness or seal_points itself (scenes, quests): keep the half points
 * and both mirrors in step, then raise the stage.
 */
export function sealFlagWritten(ctx: SystemContext, key: string): void {
  syncSeal(ctx, key === 'seal_points' ? 'seal_points' : 'seal_looseness');
  raiseStage(ctx);
}

/** seal_unrest for an opened door (clamped 0 to 100). */
export function unrestOnOpen(ctx: SystemContext, door: DoorDef): number {
  const add = unrestDelta(door, actNumber(ctx.flag('act')));
  if (add === 0) return 0;
  const cur = num(ctx.flag('seal_unrest'));
  ctx.setFlag('seal_unrest', Math.max(0, Math.min(100, cur + add)));
  return add;
}
