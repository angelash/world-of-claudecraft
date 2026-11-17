// The act clock (PK-M1-45; act1_borderstone.md 1.2 and 7.3; world_state_registry.md 8.1):
// act_week counted on the calendar and written as a flag (tick by tick and across an
// hour-coarse time skip), the act 1 weekly drift of seal_unrest (+9), the tide night on the
// dark-moon night of weeks 8 to 10 (the kernel clamp), the beats of the act 1 timeline,
// week windows and calendar terms in quest conditions, save and resume, the autoplayer's
// view of the same clock, and the 20-seed acceptance of the tide night.

import { describe, expect, it } from 'vitest';
import { clockProblems, windowProblems } from '../src/content/packs/quests';
import { Engine, worldHash } from '../src/core';
import type { AnyWorldEvent, ContentMap, FlagValue } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import type { GameSystem, SystemContext } from '../src/core/system';
import {
  calendarAt,
  DARK_MOON_WEEKDAY,
  duskTick,
  isDarkMoonDay,
  moonAge,
  nightDayOf,
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  tickAtDay,
  weekIndexOf,
  weekStartTick,
} from '../src/core/time';
import type { World } from '../src/core/world';
import { clockExtras, clockWait, waitsOnClock, windowOpenIn } from '../src/game/autoplay/clock';
import { createGame } from '../src/game/create';
import type { ActDef } from '../src/systems/quests';
import {
  actWeekOf,
  actWeekStartTick,
  beatOf,
  calendarTerms,
  enteredFlag,
  NEVER,
  nightCandidates,
  type QuestDef,
  ticksToClockEvent,
} from '../src/systems/quests';
import { skipState } from '../src/systems/travel';
import { attachSkipHandlers } from '../src/systems/travel/skip_registry';
import { NARRATIVE_SYSTEMS, narrativeContent, otherTeamsStub } from './narrative_harness';

// ---------------------------------------------------------------------------
// harness: the narrative systems with an hour-coarse clock that can be switched on

const CONTENT = narrativeContent();
const ACT1 = CONTENT.acts.find((a) => a.id === 'act1');
const TIDE = ACT1?.clock?.nights?.find((n) => n.id === 'tide');

/** Steps the clock to the next hour mark while `on` (the long-skip tier of the kernel). */
function strideSystem(state: { on: boolean }): GameSystem {
  return {
    id: 'zz_stride',
    order: 1,
    clock(world) {
      if (!state.on) return null;
      const t = world.meta.tick;
      return { stride: TICKS_PER_GAME_HOUR - (t % TICKS_PER_GAME_HOUR), hold: null };
    },
  };
}

interface Bump {
  tick: number;
  amount: number;
}

/** Other writers of seal_unrest (quest effects, doors): add and clamp at scheduled ticks. */
function bumpSystem(bumps: Bump[]): GameSystem {
  const due = (ctx: SystemContext) => {
    while (bumps.length && (bumps[0] as Bump).tick <= ctx.tick) {
      const b = bumps.shift() as Bump;
      const cur = Number(ctx.flag('seal_unrest') ?? 0);
      ctx.setFlag('seal_unrest', Math.max(0, Math.min(100, cur + b.amount)));
    }
  };
  return { id: 'zz_bumps', order: 5, tick: due, skip: due };
}

interface Lean {
  g: Engine;
  stride: { on: boolean };
  events: AnyWorldEvent[];
}

/** A lean game in act 1 from `startTick` (seal_unrest 10, the prologue's value). */
function lean(
  opts: { seed?: number; startTick?: number; bumps?: Bump[]; content?: ContentMap } = {},
): Lean {
  const stride = { on: true };
  const systems = attachSkipHandlers([
    ...NARRATIVE_SYSTEMS,
    otherTeamsStub,
    strideSystem(stride),
    bumpSystem([...(opts.bumps ?? [])].sort((a, b) => a.tick - b.tick)),
  ]);
  const g = Engine.create(opts.seed ?? 7, opts.content ?? CONTENT, systems, { aiMode: 'off' });
  const events: AnyWorldEvent[] = [];
  g.onEvents((evs) => events.push(...evs));
  const start = opts.startTick ?? 0;
  if (start > g.tick + 1) g.step(start - g.tick - 1);
  stride.on = false;
  g.queue('flag.set', { key: 'seal_unrest', value: 10 });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.step(1);
  stride.on = true;
  return { g, stride, events };
}

/** Run to a tick (hour-coarse while the stride is on). */
function runTo(l: Lean, tick: number): void {
  while (l.g.tick < tick) l.g.step(1);
}

const flags = (g: Engine): Record<string, FlagValue> => g.world.meta.flags;

function nights(l: Lean) {
  return l.events.filter(
    (e): e is Extract<AnyWorldEvent, { kind: 'act.night' }> => e.kind === 'act.night',
  );
}

/** The tick act week `week` starts for the lean game's act (it began on day 0). */
const weekStart = (week: number) => actWeekStartTick(0, week, 1);

// ---------------------------------------------------------------------------

describe('the calendar of the clock (time.ts)', () => {
  it('counts calendar weeks from weekday 1 at 00:00', () => {
    expect([weekIndexOf(0), weekIndexOf(6), weekIndexOf(7), weekIndexOf(83)]).toEqual([
      0, 0, 1, 11,
    ]);
    expect(weekStartTick(0)).toBe(0);
    expect(calendarAt(weekStartTick(1))).toMatchObject({ dayIndex: 7, weekday: 1, hour: 0 });
    expect(calendarAt(weekStartTick(1) - 1)).toMatchObject({ dayIndex: 6, weekday: 7 });
  });

  it('puts one dark-moon night in every week, the night of its sixth day', () => {
    expect(DARK_MOON_WEEKDAY).toBe(6);
    for (let d = 0; d < 84; d++) {
      expect(isDarkMoonDay(d), `day ${d}`).toBe(calendarAt(tickAtDay(d, 12)).weekday === 6);
    }
    expect([moonAge(5), moonAge(6), moonAge(0), moonAge(4)]).toEqual([0, 1, 2, 6]);
    expect(calendarAt(duskTick(5))).toMatchObject({ dayIndex: 5, hour: 20, minute: 0 });
  });

  it('gives the calendar terms of a tick, the night belonging to the day of its dusk', () => {
    const noon = calendarTerms(tickAtDay(5, 12));
    expect(noon).toMatchObject({ day: 5, weekday: 6, hour: 12, night: false, dark_moon: false });
    expect(noon.season).toBe('spring');
    expect(noon.year).toBe(998);
    expect(calendarTerms(tickAtDay(5, 21))).toMatchObject({ night: true, dark_moon: true });
    // 03:00 of day 6 is still the dark-moon night of day 5, inside the same week
    const before = calendarTerms(tickAtDay(6, 3));
    expect(before).toMatchObject({ day: 6, weekday: 7, night: true, dark_moon: true });
    expect(nightDayOf(calendarAt(tickAtDay(6, 3)))).toBe(5);
    expect(calendarTerms(tickAtDay(6, 21))).toMatchObject({ night: true, dark_moon: false });
    expect(calendarTerms(tickAtDay(7, 3))).toMatchObject({ weekday: 1, dark_moon: false });
    expect(calendarTerms(tickAtDay(91, 12)).season).toBe('summer');
  });
});

describe('act weeks (pure)', () => {
  it('counts the week the act begins as week 1 and every calendar week start after it', () => {
    expect(actWeekOf(0, 0)).toBe(1);
    expect(actWeekOf(0, 6)).toBe(1);
    expect(actWeekOf(0, 7)).toBe(2);
    expect(actWeekOf(0, 83)).toBe(12);
    // an act that begins mid-week: its week 1 runs to the end of that calendar week
    expect(actWeekOf(10, 13)).toBe(1);
    expect(actWeekOf(10, 14)).toBe(2);
    expect(actWeekStartTick(10, 1, 12345)).toBe(12345);
    expect(actWeekStartTick(10, 2)).toBe(tickAtDay(14, 0));
  });

  it('lists the tide rule candidates: the dark-moon dusks of weeks 8 to 10', () => {
    if (!TIDE) throw new Error('act 1 has no tide rule');
    const list = nightCandidates(TIDE, 0, 1);
    expect(list.map((c) => [c.dayIndex, c.week])).toEqual([
      [54, 8],
      [61, 9],
      [68, 10],
    ]);
    expect(list.every((c) => c.tick === duskTick(c.dayIndex))).toBe(true);
  });

  it('has the four beats of act 1 by week (act1_borderstone.md 1.2)', () => {
    const beats = Array.from({ length: 12 }, (_, i) => beatOf(ACT1?.clock, i + 1)?.id);
    expect(beats).toEqual([
      'landing',
      'landing',
      'landing',
      'landing',
      'landing',
      'dark',
      'dark',
      'dark',
      'dark',
      'climax',
      'pullback',
      'pullback',
    ]);
    expect(ACT1?.clock?.weeks).toBe(12);
    expect(beatOf(ACT1?.clock, 13)).toBeNull();
  });

  it('gives every act from 1 to 6 a clock with the weeks of progression 13.6, none to the rest', () => {
    const weeks = Object.fromEntries(CONTENT.acts.map((a) => [a.id, a.clock?.weeks ?? 0]));
    expect(weeks).toEqual({
      prologue: 0,
      act1: 12,
      act2: 14,
      act3: 24,
      act4: 31,
      act5: 33,
      epilogue: 0,
      act6: 26,
    });
  });
});

describe('the act 1 timeline (act1_borderstone.md 1.2, 7.3)', () => {
  it('writes act_week 1 when the act begins and adds seal_unrest 9 at every week start', () => {
    const l = lean();
    expect(flags(l.g).act_week).toBe(1);
    expect(flags(l.g).seal_unrest).toBe(10);
    const seen: number[] = [];
    for (let w = 2; w <= 10; w++) {
      runTo(l, weekStart(w));
      expect(flags(l.g).act_week, `week ${w}`).toBe(w);
      seen.push(Number(flags(l.g).seal_unrest));
    }
    // 10 at the prologue's end, +9 a week: 91 when week 10 begins
    expect(seen).toEqual([19, 28, 37, 46, 55, 64, 73, 82, 91]);
    const weeks = l.events.filter((e) => e.kind === 'act.week').map((e) => e.data.week);
    expect(weeks).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('with no player action the clamp brings the tide on the dark-moon night of week 10', () => {
    const l = lean();
    runTo(l, weekStart(12));
    const n = nights(l);
    expect(n.map((e) => [e.data.rule, e.data.week, e.data.forced])).toEqual([['tide', 10, true]]);
    expect(n[0]?.tick).toBe(duskTick(68));
    expect(flags(l.g).a1_tide_night).toBe(true);
    // the clamp lifts seal_unrest to 100; after the tide night the weekly drift stops
    expect(flags(l.g).seal_unrest).toBe(100);
    expect(flags(l.g).act_week).toBe(12);
  });

  it('the fall and the raven (+5, +10 in week 1) bring it to 100 at week 10: the default night', () => {
    const l = lean({
      bumps: [
        { tick: tickAtDay(0, 9), amount: 5 },
        { tick: tickAtDay(1, 10), amount: 10 },
      ],
    });
    runTo(l, weekStart(10));
    expect(flags(l.g).seal_unrest).toBe(100);
    expect(flags(l.g).a1_tide_night).toBeUndefined();
    runTo(l, weekStart(11));
    expect(nights(l).map((e) => [e.data.week, e.data.forced, e.tick])).toEqual([
      [10, false, duskTick(68)],
    ]);
  });

  it('the mine (+10 in week 4) moves the tide to week 9', () => {
    const l = lean({
      bumps: [
        { tick: tickAtDay(0, 9), amount: 5 },
        { tick: tickAtDay(1, 10), amount: 10 },
        { tick: tickAtDay(24, 15), amount: 10 },
      ],
    });
    runTo(l, weekStart(11));
    expect(nights(l).map((e) => [e.data.week, e.data.forced, e.tick])).toEqual([
      [9, false, duskTick(61)],
    ]);
  });

  it('reaching 100 in week 6 still waits for the earliest night, week 8 (the clamp)', () => {
    const doors = [30, 31, 32, 33, 34, 35].map((d) => ({ tick: tickAtDay(d, 11), amount: 3 }));
    const l = lean({
      bumps: [
        { tick: tickAtDay(0, 9), amount: 5 },
        { tick: tickAtDay(1, 10), amount: 10 },
        { tick: tickAtDay(24, 15), amount: 10 },
        ...doors,
        { tick: tickAtDay(36, 16), amount: 3 },
      ],
    });
    runTo(l, weekStart(7));
    expect(flags(l.g).seal_unrest).toBe(100);
    expect(flags(l.g).a1_tide_night).toBeUndefined();
    runTo(l, weekStart(11));
    expect(nights(l).map((e) => [e.data.week, e.data.forced, e.tick])).toEqual([
      [8, false, duskTick(54)],
    ]);
  });

  it('a door opened on the evening of the week-9 dark moon counts for that night', () => {
    // 35 at week 1 (fall, raven, mine), 98 at week 8 start: below 100 at week 8's night
    const l = lean({
      bumps: [
        { tick: tickAtDay(0, 9), amount: 5 },
        { tick: tickAtDay(1, 10), amount: 10 },
        { tick: tickAtDay(2, 15), amount: 10 },
        { tick: tickAtDay(53, 9), amount: -9 },
        { tick: tickAtDay(61, 18), amount: 3 },
      ],
    });
    runTo(l, weekStart(9));
    expect(flags(l.g).seal_unrest).toBe(98);
    runTo(l, weekStart(11));
    expect(nights(l).map((e) => [e.data.week, e.data.forced])).toEqual([[9, false]]);
  });

  it('the culvert and the crystal (-5, -5) hold it back until the clamp at week 10', () => {
    const l = lean({
      bumps: [
        { tick: tickAtDay(0, 9), amount: 5 },
        { tick: tickAtDay(1, 10), amount: 10 },
        { tick: tickAtDay(30, 12), amount: -5 },
        { tick: tickAtDay(45, 12), amount: -5 },
      ],
    });
    runTo(l, weekStart(11));
    expect(nights(l).map((e) => [e.data.week, e.data.forced])).toEqual([[10, true]]);
  });

  it('a tide already over (a1_beast_tide_cleared) drops the rule and stops the drift', () => {
    const l = lean();
    runTo(l, weekStart(3));
    l.g.queue('flag.set', { key: 'a1_beast_tide_cleared', value: true });
    l.g.queue('flag.set', { key: 'seal_unrest', value: 0 });
    l.g.step(1);
    runTo(l, weekStart(12));
    expect(nights(l)).toEqual([]);
    expect(flags(l.g).a1_tide_night).toBeUndefined();
    expect(flags(l.g).seal_unrest).toBe(0);
    expect(l.g.world.slices.quests.clock?.fired).toEqual(['tide']);
  });
});

describe('the clock across skips, ticks, acts and saves', () => {
  it('agrees tick by tick and hour by hour across a week boundary', () => {
    const coarse = lean({ startTick: 0 });
    const fine = lean({ startTick: 0 });
    runTo(coarse, tickAtDay(6, 12));
    runTo(fine, tickAtDay(6, 12));
    fine.stride.on = false;
    runTo(coarse, tickAtDay(7, 12));
    runTo(fine, tickAtDay(7, 12));
    expect(coarse.g.tick).toBe(fine.g.tick);
    for (const l of [coarse, fine]) {
      expect(flags(l.g).act_week).toBe(2);
      expect(flags(l.g).seal_unrest).toBe(19);
    }
    const at = (l: Lean) => l.events.find((e) => e.kind === 'act.week' && e.data.week === 2)?.tick;
    expect(at(coarse)).toBe(weekStart(2));
    expect(at(fine)).toBe(weekStart(2));
  });

  it('starts week 1 on the day the act begins, mid-week, and turns at the next calendar week', () => {
    const l = lean({ startTick: tickAtDay(10, 15) });
    expect(flags(l.g).act_week).toBe(1);
    expect(l.g.world.slices.quests.clock).toMatchObject({ act: 'act1', startDay: 10, week: 1 });
    runTo(l, tickAtDay(13, 23));
    expect(flags(l.g).act_week).toBe(1);
    runTo(l, tickAtDay(14, 1));
    expect(flags(l.g).act_week).toBe(2);
  });

  it('restarts at week 1 when the act changes, and counts no weeks in an act without a clock', () => {
    const l = lean();
    runTo(l, weekStart(4));
    expect(flags(l.g).act_week).toBe(4);
    l.g.queue('flag.set', { key: 'act', value: 'act2' });
    l.g.step(1);
    expect(flags(l.g).act_week).toBe(1);
    expect(l.g.world.slices.quests.clock?.act).toBe('act2');
    runTo(l, l.g.tick + 7 * TICKS_PER_GAME_DAY);
    expect(flags(l.g).act_week).toBe(2);
    l.g.queue('flag.set', { key: 'act', value: 'epilogue' });
    l.g.step(1);
    expect(l.g.world.slices.quests.clock).toMatchObject({ act: 'epilogue', week: 0, next: NEVER });
    expect(ticksToClockEvent(l.g.world)).toBe(NEVER);
    // the epilogue counts no weeks: windows and expiries read 0, not act 6's last week
    expect(flags(l.g).act_week).toBe(0);
  });

  it('runs a night rule on any night of its window, firing early or at the clamp', () => {
    const rule = (id: string, when?: string) => ({
      id,
      night: 'any' as const,
      from: 2,
      to: 2,
      when,
      effects: [{ type: 'flag' as const, key: `zz_${id}`, value: true }],
    });
    const acts = CONTENT.acts.map((a) =>
      a.id === 'act1'
        ? {
            ...a,
            clock: { weeks: 12, nights: [rule('early', 'zz_now'), rule('late', 'zz_never')] },
          }
        : a,
    );
    const l = lean({ content: { ...CONTENT, acts } });
    runTo(l, tickAtDay(8, 12));
    l.g.queue('flag.set', { key: 'zz_now', value: true });
    l.g.step(1);
    runTo(l, weekStart(3));
    const fired = nights(l).map((e) => [e.data.rule, e.tick, e.data.forced]);
    expect(fired).toEqual([
      ['early', duskTick(8), false],
      ['late', duskTick(13), true],
    ]);
  });

  it('validates the act clocks: weeks, beats and night rules', () => {
    const bad = (clock: unknown) =>
      clockProblems({ id: 'actX', index: 1, title: 'x', clock } as ActDef, CONTENT);
    expect(clockProblems(ACT1 as ActDef, CONTENT)).toEqual([]);
    expect(bad({ weeks: 0 })).toEqual([expect.stringContaining('bad weeks 0')]);
    expect(bad({ beats: [{ id: 'b', from: 3 }] })).toEqual(
      expect.arrayContaining([expect.stringContaining('beat b: from and to must be whole weeks')]),
    );
    const night = { id: 'n', night: 'dark_moon', from: 3, to: 2, effects: [] };
    expect(bad({ nights: [night] })).toEqual(
      expect.arrayContaining([expect.stringContaining('from 3 after to 2')]),
    );
    expect(bad({ weeks: 4, nights: [{ ...night, to: 6 }] })).toEqual(
      expect.arrayContaining([expect.stringContaining("to 6 past the act's 4 weeks")]),
    );
    expect(bad({ nights: [{ ...night, to: 4, night: 'full_moon', when: 'a AND' }] })).toEqual(
      expect.arrayContaining([
        expect.stringContaining('bad night full_moon'),
        expect.stringContaining('night n when'),
      ]),
    );
    expect(windowProblems({ from: 0 }, 'w')).toEqual(['w: bad from 0']);
    expect(windowProblems({ from: 2, to: 1 }, 'w')).toEqual(['w: from 2 after to 1']);
  });

  it('writes act.<n>.entered for the act entered and every act before it (registry 8.5)', () => {
    const l = lean();
    const entered = () =>
      [1, 2, 3, 4, 5, 6].filter((n) => flags(l.g)[enteredFlag(n)] === true).map(String);
    expect(entered()).toEqual(['1']);
    expect(flags(l.g)['act.0.entered']).toBeUndefined();
    // a jump from act 1 to act 3 marks act 2 as well: the flag equals `act >= n`
    l.g.queue('flag.set', { key: 'act', value: 'act3' });
    l.g.step(1);
    expect(entered()).toEqual(['1', '2', '3']);
    l.g.queue('flag.set', { key: 'act', value: 'epilogue' });
    l.g.step(1);
    expect(entered()).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(flags(l.g)['act.7.entered']).toBeUndefined();
  });

  it('writes act.<n>.entered through the registry guard in the real game', () => {
    const g = createGame({ seed: 3, aiMode: 'off' });
    g.queue('flag.set', { key: 'act', value: 'act2' });
    g.step(2);
    expect([g.world.meta.flags['act.1.entered'], g.world.meta.flags['act.2.entered']]).toEqual([
      true,
      true,
    ]);
    expect(g.world.meta.flags['act.3.entered']).toBeUndefined();
  });

  it('resumes from a save mid-week with the same world as an uninterrupted run', () => {
    const a = lean();
    const b = lean();
    runTo(a, tickAtDay(20, 13));
    runTo(b, tickAtDay(20, 13));
    const saved = JSON.parse(JSON.stringify(b.g.world)) as World;
    const c = Engine.resume(saved, b.g.content, b.g.systems, { aiMode: 'off' });
    for (const g of [a.g, c]) while (g.tick < weekStart(5) + 3 * TICKS_PER_GAME_HOUR) g.step(1);
    expect(flags(c).act_week).toBe(5);
    expect(flags(c).seal_unrest).toBe(flags(a.g).seal_unrest);
    expect(worldHash(c.world)).toBe(worldHash(a.g.world));
  });

  /** The real game in town, put at tick `at` as if loaded there, entering act 1 at once. */
  function realAt(at: number): { g: Engine; evs: AnyWorldEvent[] } {
    const g = createGame({ seed: 5, aiMode: 'off' });
    g.world.meta.tick = at;
    const evs: AnyWorldEvent[] = [];
    g.onEvents((e) => evs.push(...e));
    g.queue('flag.set', { key: 'act', value: 'act1' });
    g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 50.5, y: 39.5 });
    g.step(2);
    return { g, evs };
  }

  /** act_week turned 2 as a flag at the first tick of the next calendar week. */
  function turnedAtWeekStart(evs: AnyWorldEvent[], at: number): boolean {
    return evs.some(
      (e) =>
        e.kind === 'flag.changed' &&
        e.data.key === 'act_week' &&
        e.data.value === 2 &&
        e.tick === at,
    );
  }

  it('advances the act_week flag in the real game across an hour-coarse time skip', () => {
    const { g, evs } = realAt(tickAtDay(6, 20));
    expect(g.world.meta.flags.act_week).toBe(1);
    g.queue('time.skip', { hours: 8, kind: 'travel', mode: 'long' }, scriptSrc);
    g.step(1);
    expect(skipState(g.world)?.mode).toBe('long');
    while (skipState(g.world)) g.step(1);
    expect(calendarAt(g.tick).dayIndex).toBe(7);
    expect(g.world.meta.flags.act_week).toBe(2);
    expect(g.world.meta.flags.seal_unrest).toBe(9);
    expect(turnedAtWeekStart(evs, tickAtDay(7, 0))).toBe(true);
  }, 60_000);

  it('advances the act_week flag in the real game tick by tick', () => {
    const { g, evs } = realAt(tickAtDay(6, 23, 30));
    expect(g.world.meta.flags.act_week).toBe(1);
    g.step(TICKS_PER_GAME_HOUR);
    expect(g.world.meta.flags.act_week).toBe(2);
    expect(g.world.meta.flags.seal_unrest).toBe(9);
    expect(turnedAtWeekStart(evs, tickAtDay(7, 0))).toBe(true);
  }, 60_000);
});

const scriptSrc = { type: 'script' as const, script: 'test' };

describe('week windows and calendar terms in quest conditions', () => {
  const quest = (id: string, extra: Partial<QuestDef>): QuestDef => ({
    id,
    act: 'act1',
    kind: 'side',
    title: id,
    desc: id,
    stages: [{ id: 's', desc: 's', objectives: [{ type: 'flag', when: 'never_set', label: 'x' }] }],
    ...extra,
  });
  const content: ContentMap = {
    ...CONTENT,
    quests: [
      ...CONTENT.quests,
      quest('zz_window', { weekWindow: { from: 3, to: 4 } }),
      quest('zz_late', { weekWindow: { from: 3, to: 4 }, trigger: 'never_set' }),
      quest('zz_dark', { trigger: 'dark_moon AND act_week >= 2' }),
      quest('zz_offer', { giver: 'oola', weekWindow: { to: 2 } }),
    ],
  };

  it('starts a quest only inside its week window, and in its own act', () => {
    const l = lean({ content });
    const started = () => Object.keys(l.g.world.slices.quests.quests);
    runTo(l, weekStart(3) - TICKS_PER_GAME_HOUR);
    expect(started()).not.toContain('zz_window');
    runTo(l, weekStart(3) + TICKS_PER_GAME_HOUR);
    expect(started()).toContain('zz_window');
    expect(started()).not.toContain('zz_late');
    expect(l.g.world.slices.quests.quests.zz_window?.startedTick).toBe(weekStart(3));
  });

  it('reads calendar terms: a trigger on the dark-moon night of week 2', () => {
    const l = lean({ content });
    runTo(l, weekStart(3));
    expect(l.g.world.slices.quests.quests.zz_dark?.startedTick).toBe(duskTick(12));
  });

  it('offers a giver quest while its window is open and no longer after it', () => {
    const l = lean({ content });
    const offered = () =>
      l.events.some(
        (e) =>
          e.kind === 'dialogue.options_offered' &&
          e.tick === l.g.tick &&
          e.data.options.some((o) => o.id === 'accept:zz_offer'),
      );
    l.stride.on = false;
    l.g.queue('stub.talk', { npc: 'oola' });
    l.g.step(1);
    expect(offered()).toBe(true);
    l.stride.on = true;
    runTo(l, weekStart(3) + TICKS_PER_GAME_HOUR);
    l.stride.on = false;
    l.g.queue('stub.talk', { npc: 'oola' });
    l.g.step(1);
    expect(offered()).toBe(false);
    l.g.queue('quests.accept', { questId: 'zz_offer' });
    l.g.step(1);
    expect(l.g.world.slices.quests.quests.zz_offer).toBeUndefined();
  });
});

describe('the autoplayer reads the same clock', () => {
  it('evaluates with the calendar terms and checks windows like the kernel', () => {
    const l = lean();
    runTo(l, tickAtDay(5, 21));
    expect(clockExtras(l.g.world)).toMatchObject({ dark_moon: true, ai_enabled: false });
    const def = { id: 'w', act: 'act1', weekWindow: { from: 2 } } as QuestDef;
    expect(windowOpenIn(l.g.world, l.g.content, def)).toBe(false);
    expect(waitsOnClock(l.g.world, l.g.content, def)).toBe(true);
    runTo(l, weekStart(2));
    expect(windowOpenIn(l.g.world, l.g.content, def)).toBe(true);
    expect(waitsOnClock(l.g.world, l.g.content, { ...def, act: 'act2' })).toBe(false);
  });

  it('waits to the clock next event, or the next hour for an hour-level term', () => {
    const l = lean();
    runTo(l, tickAtDay(2, 10));
    const weekly = { id: 'a', act: 'act1', trigger: 'act_week >= 3' } as QuestDef;
    expect(waitsOnClock(l.g.world, l.g.content, weekly)).toBe(true);
    expect(clockWait(l.g.world, [weekly])).toBe(weekStart(2) - l.g.tick);
    const nightly = { id: 'b', act: 'act1', trigger: 'night' } as QuestDef;
    expect(clockWait(l.g.world, [nightly])).toBe(TICKS_PER_GAME_HOUR);
    expect(waitsOnClock(l.g.world, l.g.content, { id: 'c', act: 'act1' } as QuestDef)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// acceptance: for 20 seeds the tide night lands on a dark-moon night in weeks 8 to 10

/** A seeded player: the act starts after a prologue of 0 to 13 days; the 7.3 sources. */
function seededRun(seed: number) {
  const rng = new Rng({ s: seed * 7919 + 13 });
  const startDay = rng.int(0, 13);
  const startTick = tickAtDay(startDay, rng.int(7, 18));
  const startWeek = weekIndexOf(startDay);
  const at = (week: number) => {
    const day = Math.max(startDay, (startWeek + week - 1) * 7 + rng.int(0, 6));
    return tickAtDay(day, rng.int(7, 18));
  };
  const bumps: Bump[] = [
    { tick: at(1), amount: 5 }, // A1-M01 the ash chamber
    { tick: at(1), amount: 10 }, // A1-M02 the raven leaves its post
  ];
  if (rng.chance(0.7)) bumps.push({ tick: at(rng.int(4, 6)), amount: 10 }); // A1-M06
  if (rng.chance(0.4)) bumps.push({ tick: at(rng.int(6, 9)), amount: 3 }); // A1-S22
  for (let i = rng.int(0, 6); i > 0; i--) bumps.push({ tick: at(rng.int(1, 9)), amount: 3 });
  if (rng.chance(0.4)) bumps.push({ tick: at(rng.int(3, 9)), amount: -5 }); // the culvert
  if (rng.chance(0.3)) bumps.push({ tick: at(rng.int(2, 9)), amount: -5 }); // the crystal
  if (rng.chance(0.2)) {
    for (let w = rng.int(4, 8); w <= 10; w++) bumps.push({ tick: at(w), amount: 2 }); // trade
  }
  return { startDay, startTick, bumps: bumps.filter((b) => b.tick > startTick) };
}

/** The tide of 7.3 computed independently: events in time order, the clamp at week 10. */
function expectedTide(run: ReturnType<typeof seededRun>): { tick: number; forced: boolean } {
  const week = (day: number) => Math.floor(day / 7) - Math.floor(run.startDay / 7) + 1;
  type Ev = { tick: number; kind: 'week' | 'bump' | 'dusk'; amount?: number; last?: boolean };
  const evs: Ev[] = run.bumps.map((b) => ({ tick: b.tick, kind: 'bump', amount: b.amount }));
  const firstWeekDay = Math.floor(run.startDay / 7) * 7;
  for (let w = 2; w <= 11; w++)
    evs.push({ tick: tickAtDay(firstWeekDay + (w - 1) * 7), kind: 'week' });
  const dusks: number[] = [];
  for (let d = run.startDay; d < firstWeekDay + 77; d++) {
    if (d % 7 === 5 && week(d) >= 8 && week(d) <= 10) dusks.push(d);
  }
  dusks.forEach((d, i) => {
    evs.push({ tick: tickAtDay(d, 20), kind: 'dusk', last: i === dusks.length - 1 });
  });
  evs.sort((a, b) => a.tick - b.tick);
  let unrest = 10;
  for (const e of evs) {
    if (e.kind === 'bump') unrest = Math.max(0, Math.min(100, unrest + (e.amount ?? 0)));
    else if (e.kind === 'week') unrest = Math.min(100, unrest + 9);
    else if (unrest >= 100 || e.last) return { tick: e.tick, forced: unrest < 100 };
  }
  throw new Error('no tide');
}

describe('acceptance: 20 seeds', () => {
  it('lands the tide night on a dark-moon night of weeks 8 to 10 for every seed', () => {
    const weeks: number[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const run = seededRun(seed);
      const l = lean({ seed, startTick: run.startTick, bumps: run.bumps });
      runTo(l, actWeekStartTick(run.startDay, 12, run.startTick));
      const n = nights(l);
      expect(n.length, `seed ${seed}`).toBe(1);
      const night = n[0] as (typeof n)[number];
      const cal = calendarAt(night.tick);
      expect(cal.hour, `seed ${seed}`).toBe(20);
      expect(isDarkMoonDay(cal.dayIndex), `seed ${seed}`).toBe(true);
      expect(calendarTerms(night.tick).dark_moon, `seed ${seed}`).toBe(true);
      const week = actWeekOf(run.startDay, cal.dayIndex);
      expect(week, `seed ${seed}`).toBeGreaterThanOrEqual(8);
      expect(week, `seed ${seed}`).toBeLessThanOrEqual(10);
      expect(night.data.week).toBe(week);
      expect([night.tick, night.data.forced], `seed ${seed}`).toEqual([
        expectedTide(run).tick,
        expectedTide(run).forced,
      ]);
      expect(flags(l.g).a1_tide_night).toBe(true);
      weeks.push(week);
    }
    // the seeds spread over the window: player actions move the tide
    expect(new Set(weeks).size).toBeGreaterThan(1);
  });
});
