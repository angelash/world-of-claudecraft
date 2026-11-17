// The time-skip kernel (travel_and_exploration.md 7.4 to 7.6, 9.1): every way of letting
// game time pass in one go (waiting, sleeping, region-map travel) becomes one running skip
// in the travel slice, started by a logged command. Two tiers:
//   short: every tick runs as usual (off-screen work is the systems' own business), with
//     model requests held;
//   long: the clock jumps one game hour per step (SkipClockStep.stride), and the systems'
//     registered skip handlers settle the hour instead of their ticks.
// Both tiers check the rest rules and roll the night ambush at the same hour marks, stop at
// the tick an interrupting event arrives, and write a short summary. The skip is world
// state, so a save made mid-skip resumes it and a replay takes the same steps.

import type { CommandResult } from '../../core/contracts';
import { ok, reject } from '../../core/contracts';
import type { SkipClockStep, SystemContext } from '../../core/system';
import { type TextRef, tr } from '../../core/text';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import type { World } from '../../core/world';
import { getEntity } from '../world';
import { canSleep, canWait, type RestCheck, sleepAmbushChance, sleepPlaceCheck } from './rest';
import type { SkipKind, SkipMode, SkipNote, SkipOutcome, SkipState, TravelSlice } from './types';

export {
  attachSkipHandlers,
  registerSkipHandler,
  type SkipHandler,
  skipHandlerIds,
  skipHandlerOf,
} from './skip_registry';

/** Skips up to this many hours run tick by tick (short tier) unless told otherwise (7.5). */
export const SHORT_SKIP_MAX_HOURS = 8;
/** The longest single skip (a region-map leg is cut into skips no longer than this). */
export const MAX_SKIP_HOURS = 24 * 14;
/** Text-only model requests a skip may hold for after its end (T-11). */
export const BACKFILL_CAP = 12;
/** Summary lines kept (7.6); later ones are counted in `more`. */
export const SUMMARY_CAP = 8;
/** The random stream of skip rolls (the night ambush). */
export const SKIP_STREAM = 'travel.skip';

type WorldWithTravel = { slices: { travel?: TravelSlice } };

export function emptyTravelSlice(): TravelSlice {
  return { skip: null, last: null };
}

/** The travel slice, created on first use (a save from before the travel system has none). */
export function travelSlice(world: World): TravelSlice {
  const w = world as World & WorldWithTravel;
  if (!w.slices.travel) w.slices.travel = emptyTravelSlice();
  return w.slices.travel as TravelSlice;
}

/** The running skip, if any. */
export function skipState(world: WorldWithTravel): SkipState | null {
  return world.slices.travel?.skip ?? null;
}

export function skipActive(world: WorldWithTravel): boolean {
  return !!world.slices.travel?.skip;
}

/** The tier a skip of this length takes when nobody names one (7.5). */
export function defaultMode(hours: number): SkipMode {
  return hours <= SHORT_SKIP_MAX_HOURS ? 'short' : 'long';
}

/** The first hour mark after `tick` (ticks count from 06:00, so hour marks are multiples). */
export function nextHourMark(tick: number): number {
  return tick - (tick % TICKS_PER_GAME_HOUR) + TICKS_PER_GAME_HOUR;
}

/**
 * The clock hook (GameSystem.clock): while a skip runs, model requests are held; a long
 * skip steps to the next hour mark (or its end), a short one tick by tick.
 */
export function skipClock(world: World): SkipClockStep | null {
  const skip = skipState(world as World & WorldWithTravel);
  if (!skip) return null;
  const hold = { backfill: BACKFILL_CAP };
  if (skip.mode === 'short') return { stride: 1, hold };
  const t = world.meta.tick;
  return { stride: Math.max(1, Math.min(skip.endTick - t, nextHourMark(t) - t)), hold };
}

export interface SkipSpec {
  kind: SkipKind;
  /** the tick the skip reaches when nothing stops it */
  endTick: number;
  mode?: SkipMode;
}

/** The rest rule a kind of skip answers to, checked at the start and at every hour mark. */
function restRule(ctx: SystemContext, kind: SkipKind, id: string, starting: boolean): RestCheck {
  if (kind === 'wait') return canWait(ctx, id);
  if (kind === 'sleep') return starting ? canSleep(ctx, id) : sleepPlaceCheck(ctx, id);
  return { ok: true };
}

/** Start a skip for the player (validated); the command handlers all come here. */
export function startSkip(ctx: SystemContext, spec: SkipSpec): CommandResult {
  const slice = travelSlice(ctx.world);
  if (slice.skip) return reject('busy', tr('sys.travel.skip.reject.busy'));
  const id = ctx.world.slices.world.playerId;
  const ticks = spec.endTick - ctx.tick;
  if (!(ticks > 0) || ticks > MAX_SKIP_HOURS * TICKS_PER_GAME_HOUR) {
    return reject('bad_hours', tr('sys.travel.skip.reject.bad_hours'));
  }
  const rule = restRule(ctx, spec.kind, id, true);
  if (!rule.ok) return reject(rule.code, rule.reason);
  const mode = spec.mode ?? defaultMode(ticks / TICKS_PER_GAME_HOUR);
  slice.skip = {
    kind: spec.kind,
    mode,
    entityId: id,
    startTick: ctx.tick,
    endTick: Math.round(spec.endTick),
    checkTick: nextHourMark(ctx.tick),
    ambush: 0,
    notes: [],
    more: 0,
  };
  ctx.emit('time.skip_started', {
    kind: spec.kind,
    mode,
    entityId: id,
    startTick: ctx.tick,
    endTick: slice.skip.endTick,
  });
  return ok();
}

/** Add a summary line to the running skip (7.6); bounded. */
export function noteSkip(ctx: SystemContext, event: string, ref?: string): void {
  const skip = travelSlice(ctx.world).skip;
  if (!skip) return;
  if (skip.notes.length >= SUMMARY_CAP) {
    skip.more += 1;
    return;
  }
  const note: SkipNote = { tick: ctx.tick, event };
  if (ref !== undefined) note.ref = ref;
  skip.notes.push(note);
}

/** End the running skip now: the world stays at this tick (7.4), the summary goes out. */
export function endSkip(ctx: SystemContext, outcome: SkipOutcome, reason?: TextRef): void {
  const slice = travelSlice(ctx.world);
  const skip = slice.skip;
  if (!skip) return;
  slice.skip = null;
  const hours = Math.round(((ctx.tick - skip.startTick) / TICKS_PER_GAME_HOUR) * 100) / 100;
  slice.last = {
    kind: skip.kind,
    mode: skip.mode,
    startTick: skip.startTick,
    endTick: ctx.tick,
    plannedTick: skip.endTick,
    outcome,
    notes: skip.notes,
    more: skip.more,
  };
  if (reason) slice.last.reason = reason;
  ctx.emit('time.skipped', {
    kind: skip.kind,
    mode: skip.mode,
    entityId: skip.entityId,
    outcome,
    hours,
    reason,
    notes: skip.notes.map((n) => ({ ...n })),
    more: skip.more,
  });
}

/** Stop the running skip because something happened (7.4). */
export function interruptSkip(ctx: SystemContext, reason: TextRef): void {
  if (!travelSlice(ctx.world).skip) return;
  endSkip(ctx, 'interrupted', reason);
}

/**
 * The hour-mark checks (7.4): the rest rule still holds, and a sleeper out in the field
 * rolls the night ambush. Returns false when the skip stopped.
 */
function hourMark(ctx: SystemContext, skip: SkipState): boolean {
  const rule = restRule(ctx, skip.kind, skip.entityId, false);
  if (!rule.ok) {
    interruptSkip(ctx, rule.reason);
    return false;
  }
  if (skip.kind === 'sleep') {
    const chance = sleepAmbushChance(ctx, skip.entityId, ctx.tick);
    skip.ambush = chance;
    if (chance > 0 && ctx.rng(SKIP_STREAM).chance(chance)) {
      const e = getEntity(ctx.world, skip.entityId);
      noteSkip(ctx, 'time.ambush', e?.mapId);
      if (e) ctx.emit('time.ambush', { entityId: e.id, mapId: e.mapId, x: e.x, y: e.y });
      interruptSkip(ctx, tr('sys.travel.skip.stop.ambush'));
      return false;
    }
  }
  return true;
}

/**
 * Advance the running skip's bookkeeping at the current tick: the hour-mark checks once
 * the clock reaches them, then the end. The travel system calls it on every tick of a
 * short skip and on every step of a long one.
 */
export function advanceSkip(ctx: SystemContext): void {
  const skip = travelSlice(ctx.world).skip;
  if (!skip) return;
  if (ctx.tick >= skip.checkTick && ctx.tick < skip.endTick) {
    if (!hourMark(ctx, skip)) return;
  }
  while (skip.checkTick <= ctx.tick) skip.checkTick += TICKS_PER_GAME_HOUR;
  if (ctx.tick >= skip.endTick) endSkip(ctx, 'done');
}
