// The act clock (PK-M1-45; act1_borderstone.md 1.2 and 7.3; world_state_registry.md 8.1):
// an act whose data carries a `clock` counts act weeks on the calendar. The week the act
// begins is act week 1, and every calendar week start (weekday 1, 00:00) after it is the
// next one; the clock writes the registered flag `act_week`, applies the act's `weekly`
// effects at each new week (act 1: seal_unrest +9) and the dispute chains' default steps
// (disputes.ts), and runs its night rules at dusk (act 1: the tide night on the dark-moon
// night of weeks 8 to 10). Everything is a function of the tick and the act's start day,
// so the clock agrees tick by tick and across hour-coarse time skips
// (travel_and_exploration.md 7.5), and a save resumes it.
//
// The clock owns only the act-driven part of a quantity: it adds to a flag the way any
// effect does (read, add, clamp), so the other writers (doors opening, quest effects) keep
// their own increments on the same flag.

import type { SystemContext } from '../../core/system';
import {
  calendarAt,
  DAYS_PER_WEEK,
  duskTick,
  isDarkMoonDay,
  tickAtDay,
  weekIndexOf,
} from '../../core/time';
import { currentActId } from './act_order';
import { actDef } from './acts';
import { runDefaults } from './disputes';
import { applyEffects, conditionHolds } from './effects';
import type { ActBeat, ActClockDef, ActClockState, NightRule, QuestsSlice } from './types';

/** The flag the clock writes. */
export const ACT_WEEK_FLAG = 'act_week';

/** "No event pending" (a finite number, so the state stays JSON). */
export const NEVER = Number.MAX_SAFE_INTEGER;

declare module '../../core/contracts' {
  interface EventMap {
    /** a new act week began (act_week is written as well) */
    'act.week': { act: string; week: number };
    /** a night rule of the act clock fired; `forced` on the last night of its window */
    'act.night': { act: string; rule: string; week: number; forced: boolean };
  }
}

// ---------------------------------------------------------------------------
// pure calendar arithmetic

/** The act week of a calendar day for an act that began on `startDay` (1 on that day). */
export function actWeekOf(startDay: number, dayIndex: number): number {
  return weekIndexOf(dayIndex) - weekIndexOf(startDay) + 1;
}

/** The first calendar day of an act week (the start day itself for week 1). */
export function actWeekFirstDay(startDay: number, week: number): number {
  if (week <= 1) return startDay;
  return (weekIndexOf(startDay) + week - 1) * DAYS_PER_WEEK;
}

/** The tick an act week starts (weekday 1 at 00:00; week 1 starts when the act begins). */
export function actWeekStartTick(startDay: number, week: number, startTick = 0): number {
  if (week <= 1) return startTick;
  return tickAtDay(actWeekFirstDay(startDay, week), 0);
}

/** Whether the night of a day qualifies for a rule. */
function qualifies(rule: NightRule, dayIndex: number): boolean {
  return rule.night === 'any' || isDarkMoonDay(dayIndex);
}

export interface NightCandidate {
  dayIndex: number;
  week: number;
  /** dusk of that day */
  tick: number;
}

/**
 * The qualifying nights of a rule for an act that began at `startTick` on `startDay`, in
 * order: nights whose dusk falls inside the rule's week window and after the act began.
 */
export function nightCandidates(
  rule: NightRule,
  startDay: number,
  startTick: number,
): NightCandidate[] {
  const out: NightCandidate[] = [];
  const from = Math.max(1, rule.from);
  for (let week = from; week <= rule.to; week++) {
    const first = actWeekFirstDay(startDay, week);
    const last = actWeekFirstDay(startDay, week + 1) - 1;
    for (let d = first; d <= last; d++) {
      const tick = duskTick(d);
      if (tick <= startTick || !qualifies(rule, d)) continue;
      out.push({ dayIndex: d, week, tick });
    }
  }
  return out;
}

/** The beat of an act week (act1_borderstone.md 1.2), or null outside every beat. */
export function beatOf(clock: ActClockDef | undefined, week: number): ActBeat | null {
  for (const b of clock?.beats ?? []) if (week >= b.from && week <= b.to) return b;
  return null;
}

// ---------------------------------------------------------------------------
// runtime

/** The clock state, if the clock has run (saves before PK-M1-45 have none until it does). */
export function actClockState(world: {
  slices: { quests?: QuestsSlice };
}): ActClockState | undefined {
  return world.slices.quests?.clock;
}

/** Start the clock for the act the world is in now. */
function startClock(ctx: SystemContext, act: string): ActClockState {
  const clock = actDef(ctx.content, act)?.clock;
  const cal = calendarAt(ctx.tick);
  const st: ActClockState = {
    act,
    startDay: cal.dayIndex,
    startTick: ctx.tick,
    week: clock ? 1 : 0,
    fired: [],
    at: ctx.tick - 1,
    next: clock ? ctx.tick : NEVER,
  };
  ctx.world.slices.quests.clock = st;
  if (clock) {
    ctx.setFlag(ACT_WEEK_FLAG, 1);
    ctx.emit('act.week', { act, week: 1 });
    runDefaults(ctx);
  } else if (ctx.flag(ACT_WEEK_FLAG) !== undefined && ctx.flag(ACT_WEEK_FLAG) !== 0) {
    // an act without weeks (the prologue, the epilogue): week windows and expiries read 0
    ctx.setFlag(ACT_WEEK_FLAG, 0);
  }
  markEntered(ctx, act);
  return st;
}

/** The flag that says an act has been entered (registry family act.<act_no>.entered). */
export function enteredFlag(index: number): string {
  return `act.${index}.entered`;
}

/**
 * Write act.<n>.entered for the act just entered and every clocked act before it, so the
 * flag equals its derivation `act >= n` (world_state_registry.md 8.5; read by map spawn
 * groups and exits through requiresFlags, which take flags only). Only acts with a clock
 * count (acts 1 to 6 by the acts table); a jump over an act writes the skipped ones too.
 */
function markEntered(ctx: SystemContext, act: string): void {
  const here = actDef(ctx.content, act);
  if (!here) return;
  for (const a of ctx.content.acts ?? []) {
    if (!a.clock || a.index > here.index) continue;
    const key = enteredFlag(a.index);
    if (ctx.flag(key) !== true) ctx.setFlag(key, true);
  }
}

/** The earliest unprocessed dusk of the unfired night rules, with the rules due then. */
function nextNight(
  clock: ActClockDef,
  st: ActClockState,
): { tick: number; due: { rule: NightRule; forced: boolean; week: number }[] } {
  let tick = NEVER;
  let due: { rule: NightRule; forced: boolean; week: number }[] = [];
  for (const rule of clock.nights ?? []) {
    if (st.fired.includes(rule.id)) continue;
    const list = nightCandidates(rule, st.startDay, st.startTick);
    const i = list.findIndex((c) => c.tick > st.at);
    const c = list[i];
    if (!c || c.tick > tick) continue;
    const entry = { rule, forced: i === list.length - 1, week: c.week };
    if (c.tick < tick) {
      tick = c.tick;
      due = [entry];
    } else due.push(entry);
  }
  return { tick, due };
}

/**
 * Bring the clock up to the current tick: restart it when the act changed, then settle every
 * week start and dusk between the last settled tick and now, in time order. Cheap when
 * nothing is due (one comparison), so the quests system calls it every tick and on every
 * hour-coarse skip step.
 */
export function advanceActClock(ctx: SystemContext): void {
  const act = currentActId(ctx);
  let st = ctx.world.slices.quests.clock;
  if (!st || st.act !== act) st = startClock(ctx, act);
  if (ctx.tick < st.next) return;
  const clock = actDef(ctx.content, act)?.clock;
  if (!clock) {
    st.next = NEVER;
    return;
  }
  // a guard against a malformed clock; a real jump crosses at most a few dozen events
  for (let guard = 0; guard < 4096; guard++) {
    const weekTick = actWeekStartTick(st.startDay, st.week + 1, st.startTick);
    const night = nextNight(clock, st);
    const at = Math.min(weekTick, night.tick);
    // an act effect fired by this loop moved the world on: the new act's clock takes over
    if (currentActId(ctx) !== act) return;
    if (at > ctx.tick) {
      st.at = ctx.tick;
      st.next = at;
      return;
    }
    st.at = at;
    if (night.tick <= weekTick) {
      for (const d of night.due) {
        if (d.rule.unless && conditionHolds(ctx, d.rule.unless)) {
          st.fired.push(d.rule.id);
          continue;
        }
        const holds = conditionHolds(ctx, d.rule.when);
        if (!holds && !d.forced) continue;
        const forced = !holds;
        st.fired.push(d.rule.id);
        applyEffects(ctx, d.rule.effects);
        ctx.emit('act.night', { act, rule: d.rule.id, week: d.week, forced });
      }
      continue;
    }
    st.week += 1;
    ctx.setFlag(ACT_WEEK_FLAG, st.week);
    ctx.emit('act.week', { act, week: st.week });
    applyEffects(ctx, clock.weekly);
    runDefaults(ctx);
  }
  st.next = ctx.tick + 1;
}

/** Ticks from now to the clock's next event (a week start or a pending dusk); NEVER if none. */
export function ticksToClockEvent(world: {
  meta: { tick: number };
  slices: { quests?: QuestsSlice };
}): number {
  const st = world.slices.quests?.clock;
  if (!st || st.next >= NEVER) return NEVER;
  return Math.max(0, st.next - world.meta.tick);
}
