// Fixed-step simulation clock and the in-world calendar (Sacred Era).
// One tick is 1/20 real second at 1x and advances 3 game seconds, so one game
// day is 28800 ticks (24 real minutes at 1x). See docs/50_tech/architecture.md 4.1.

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;
export const GAME_SECONDS_PER_TICK = 3;
export const TICKS_PER_GAME_MINUTE = 60 / GAME_SECONDS_PER_TICK;
export const TICKS_PER_GAME_HOUR = TICKS_PER_GAME_MINUTE * 60;
export const TICKS_PER_GAME_DAY = TICKS_PER_GAME_HOUR * 24;
export const DAYS_PER_SEASON = 28;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;

/** The opening moment: Sacred Era 998, spring (season 0), day 1, 06:00. */
export const START_YEAR = 998;
export const START_HOUR = 6;

export interface Calendar {
  year: number;
  /** 0 spring, 1 summer, 2 autumn, 3 winter */
  season: number;
  /** 1-based day of season */
  day: number;
  hour: number;
  minute: number;
  /** whole game days elapsed since the opening moment */
  dayIndex: number;
  /** minutes since midnight */
  minuteOfDay: number;
}

export function calendarAt(tick: number): Calendar {
  const totalMinutes = Math.floor(tick / TICKS_PER_GAME_MINUTE) + START_HOUR * 60;
  const dayIndex = Math.floor(totalMinutes / (24 * 60));
  const minuteOfDay = totalMinutes - dayIndex * 24 * 60;
  const yearOffset = Math.floor(dayIndex / DAYS_PER_YEAR);
  const dayOfYear = dayIndex - yearOffset * DAYS_PER_YEAR;
  const season = Math.floor(dayOfYear / DAYS_PER_SEASON);
  return {
    year: START_YEAR + yearOffset,
    season,
    day: dayOfYear - season * DAYS_PER_SEASON + 1,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    dayIndex,
    minuteOfDay,
  };
}

/** Tick at which the given game day (0-based from the opening) reaches hour:minute. */
export function tickAtDay(dayIndex: number, hour = 0, minute = 0): number {
  const minutes = dayIndex * 24 * 60 + hour * 60 + minute - START_HOUR * 60;
  return Math.max(0, minutes * TICKS_PER_GAME_MINUTE);
}

export function isNight(cal: Calendar): boolean {
  return cal.hour < 6 || cal.hour >= 20;
}

/** Daylight factor 0..1 for rendering and NPC schedules. */
export function daylight(cal: Calendar): number {
  const h = cal.minuteOfDay / 60;
  if (h < 5 || h >= 21) return 0;
  if (h < 7) return (h - 5) / 2;
  if (h >= 19) return (21 - h) / 2;
  return 1;
}
