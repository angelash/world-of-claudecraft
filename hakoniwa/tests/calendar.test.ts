// The calendar (D-083; progression_and_pacing.md 13.1, 13.6, 19): 20 Hz ticks of 3 game
// seconds, weeks of 7 days, seasons of 13 weeks (91 days), years of 364 days, the
// solstices on day 1 of week 7 of summer and winter, and the world system's hour and day
// events across a season boundary. Pure functions of the tick: no clock, no randomness.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { AnyWorldEvent } from '../src/core/contracts';
import {
  calendarAt,
  DAYS_PER_SEASON,
  DAYS_PER_WEEK,
  DAYS_PER_YEAR,
  dayIndexOf,
  GAME_SECONDS_PER_TICK,
  nextSolstice,
  SEASONS_PER_YEAR,
  START_HOUR,
  START_YEAR,
  seasonPart,
  solsticeDay,
  solsticeOf,
  TICK_HZ,
  TICKS_PER_GAME_DAY,
  TICKS_PER_GAME_HOUR,
  tickAtDay,
  WEEKS_PER_SEASON,
  WEEKS_PER_YEAR,
} from '../src/core/time';
import { system as world } from '../src/systems/world';

describe('calendar constants (progression 13.1)', () => {
  it('keeps the 20 Hz tick of 3 game seconds: one game day is 28,800 ticks', () => {
    expect(TICK_HZ).toBe(20);
    expect(GAME_SECONDS_PER_TICK).toBe(3);
    expect(TICKS_PER_GAME_HOUR).toBe(1200);
    expect(TICKS_PER_GAME_DAY).toBe(28800);
  });

  it('has weeks of 7 days, seasons of 13 weeks (91 days) and years of 364 days', () => {
    expect(DAYS_PER_WEEK).toBe(7);
    expect(WEEKS_PER_SEASON).toBe(13);
    expect(DAYS_PER_SEASON).toBe(91);
    expect(SEASONS_PER_YEAR).toBe(4);
    expect(DAYS_PER_YEAR).toBe(364);
    expect(WEEKS_PER_YEAR).toBe(52);
  });
});

describe('calendar dates', () => {
  it('opens at Sacred Era 998, spring, day 1 (week 1, weekday 1), 06:00', () => {
    expect(calendarAt(0)).toEqual({
      year: START_YEAR,
      season: 0,
      day: 1,
      week: 1,
      weekday: 1,
      weekOfYear: 1,
      hour: START_HOUR,
      minute: 0,
      dayIndex: 0,
      minuteOfDay: 360,
    });
  });

  it('rolls spring into summer after 91 days, not 28', () => {
    expect(calendarAt(tickAtDay(28, 12))).toMatchObject({ season: 0, day: 29, week: 5 });
    const lastSpring = calendarAt(tickAtDay(90, 23, 59));
    expect(lastSpring).toMatchObject({ season: 0, day: 91, week: 13, weekday: 7, hour: 23 });
    const firstSummer = calendarAt(tickAtDay(91, 0, 0));
    expect(firstSummer).toMatchObject({ season: 1, day: 1, week: 1, weekday: 1, weekOfYear: 14 });
    expect(calendarAt(tickAtDay(91 + 3, 21, 5))).toMatchObject({ season: 1, day: 4 });
  });

  it('rolls the year after 364 days and keeps week of year on the 52-week count', () => {
    expect(calendarAt(tickAtDay(363, 12))).toMatchObject({
      year: 998,
      season: 3,
      day: 91,
      weekOfYear: 52,
    });
    expect(calendarAt(tickAtDay(364, 12))).toMatchObject({
      year: 999,
      season: 0,
      day: 1,
      weekOfYear: 1,
    });
    // progression 13.6: act 4 opens in 999 week 9 (day 1 of spring week 9)
    expect(calendarAt(tickAtDay(364 + 8 * 7, 12))).toMatchObject({ year: 999, weekOfYear: 9 });
  });

  it('inverts the date part of calendarAt with dayIndexOf', () => {
    for (const d of [0, 1, 27, 28, 90, 91, 182, 273, 363, 364, 1049]) {
      const c = calendarAt(tickAtDay(d, 12));
      expect(dayIndexOf(c.year, c.season, c.day)).toBe(d);
    }
  });

  it('splits a season into early, mid and late (weeks 1 to 4, 5 to 9, 10 to 13)', () => {
    expect(seasonPart({ week: 1 })).toBe('early');
    expect(seasonPart({ week: 4 })).toBe('early');
    expect(seasonPart({ week: 5 })).toBe('mid');
    expect(seasonPart({ week: 9 })).toBe('mid');
    expect(seasonPart({ week: 10 })).toBe('late');
    expect(seasonPart({ week: 13 })).toBe('late');
  });
});

describe('solstices (progression 13.1, 13.6)', () => {
  it('falls on day 1 of week 7 of summer and of winter', () => {
    // summer: 91 + 6 weeks; winter: 3 x 91 + 6 weeks
    expect(solsticeDay(998, 'summer')).toBe(91 + 42);
    expect(solsticeDay(998, 'winter')).toBe(273 + 42);
    expect(solsticeDay(1000, 'winter')).toBe(2 * 364 + 273 + 42);
    const summer = calendarAt(tickAtDay(solsticeDay(998, 'summer'), 12));
    expect(summer).toMatchObject({ season: 1, day: 43, week: 7, weekday: 1, weekOfYear: 20 });
    expect(solsticeOf(summer)).toBe('summer');
    const winter = calendarAt(tickAtDay(solsticeDay(998, 'winter'), 12));
    expect(winter).toMatchObject({ season: 3, week: 7, weekday: 1, weekOfYear: 46 });
    expect(solsticeOf(winter)).toBe('winter');
  });

  it('names only those two days', () => {
    let count = 0;
    for (let d = 0; d < DAYS_PER_YEAR; d++) if (solsticeOf(calendarAt(tickAtDay(d, 12)))) count++;
    expect(count).toBe(2);
    // week 7 day 1 of spring and autumn is no solstice
    expect(solsticeOf({ season: 0, day: 43 })).toBeNull();
    expect(solsticeOf({ season: 2, day: 43 })).toBeNull();
    expect(solsticeOf({ season: 1, day: 44 })).toBeNull();
  });

  it('finds the next solstice on or after a day', () => {
    expect(nextSolstice(0)).toEqual({ which: 'summer', dayIndex: 133 });
    expect(nextSolstice(133)).toEqual({ which: 'summer', dayIndex: 133 });
    expect(nextSolstice(134)).toEqual({ which: 'winter', dayIndex: 315 });
    expect(nextSolstice(316)).toEqual({ which: 'summer', dayIndex: 364 + 133 });
  });

  it('places the end of act 5 at the summer solstice of 1000, week 20 (progression 13.6)', () => {
    const d = solsticeDay(1000, 'summer');
    expect(calendarAt(tickAtDay(d, 12))).toMatchObject({ year: 1000, weekOfYear: 20 });
    // the act 6 review ends at the winter solstice of 1000, week 46
    expect(calendarAt(tickAtDay(solsticeDay(1000, 'winter'), 12)).weekOfYear).toBe(46);
  });
});

describe('calendar events of the world system', () => {
  /** The world system alone, resumed from a world saved at the given tick. */
  function worldAt(tick: number): { engine: Engine; seen: AnyWorldEvent[] } {
    const content = buildContent();
    const fresh = Engine.create(1, content, [world]);
    const w = fresh.world;
    const cal = calendarAt(tick);
    w.meta.tick = tick;
    w.slices.world.lastHour = cal.hour;
    w.slices.world.lastDay = cal.dayIndex;
    const engine = Engine.resume(w, content, [world]);
    const seen: AnyWorldEvent[] = [];
    engine.onEvents((evs) => seen.push(...evs));
    return { engine, seen };
  }

  it('emits world.hour on the hour and world.day with the new season at the boundary', () => {
    const { engine, seen } = worldAt(tickAtDay(90, 23, 59));
    engine.step(TICKS_PER_GAME_HOUR / 60 + 1);
    const hour = seen.find((e) => e.kind === 'world.hour');
    expect(hour?.data).toEqual({ hour: 0, dayIndex: 91 });
    expect(hour?.tick).toBe(tickAtDay(91, 0, 0));
    const day = seen.find((e) => e.kind === 'world.day');
    expect(day?.data).toEqual({ dayIndex: 91, season: 1, year: 998 });
    expect(day?.tick).toBe(tickAtDay(91, 0, 0));
    expect(seen.some((e) => e.kind === 'world.weather')).toBe(true);
  });

  it('emits the same events at the same ticks on a replay of the same span', () => {
    const run = () => {
      const { engine, seen } = worldAt(tickAtDay(363, 22));
      engine.step(3 * TICKS_PER_GAME_HOUR);
      return seen
        .filter(
          (e) => e.kind === 'world.hour' || e.kind === 'world.day' || e.kind === 'world.weather',
        )
        .map((e) => [e.tick, e.kind, e.data]);
    };
    const a = run();
    expect(a).toEqual(run());
    // the year turns at day 364: 999, spring
    expect(a.find((e) => e[1] === 'world.day')?.[2]).toEqual({
      dayIndex: 364,
      season: 0,
      year: 999,
    });
  });
});

describe('places the season length reaches', () => {
  it('keeps the strategy truce at one season (D-049, grand_strategy_slg.md SLG-4)', () => {
    expect(buildContent().slg_config?.truceDays).toBe(DAYS_PER_SEASON);
  });
});
