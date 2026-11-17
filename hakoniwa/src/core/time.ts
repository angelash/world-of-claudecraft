// Fixed-step simulation clock and the in-world calendar (Sacred Era).
// One tick is 1/20 real second at 1x and advances 3 game seconds, so one game
// day is 28800 ticks (24 real minutes at 1x). See docs/50_tech/architecture.md 4.1.
// The calendar (D-083; progression_and_pacing.md 13.1): weeks of 7 days, seasons of
// 13 weeks (91 days), years of four seasons (364 days); the solstices fall on day 1 of
// week 7 of summer and of winter; the moon goes dark on the sixth night of every week.
// Every date is a pure function of the tick.

export const TICK_HZ = 20;
export const DT = 1 / TICK_HZ;
export const GAME_SECONDS_PER_TICK = 3;
export const TICKS_PER_GAME_MINUTE = 60 / GAME_SECONDS_PER_TICK;
export const TICKS_PER_GAME_HOUR = TICKS_PER_GAME_MINUTE * 60;
export const TICKS_PER_GAME_DAY = TICKS_PER_GAME_HOUR * 24;
export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_SEASON = 13;
export const DAYS_PER_SEASON = WEEKS_PER_SEASON * DAYS_PER_WEEK;
export const SEASONS_PER_YEAR = 4;
export const DAYS_PER_YEAR = DAYS_PER_SEASON * SEASONS_PER_YEAR;
export const WEEKS_PER_YEAR = WEEKS_PER_SEASON * SEASONS_PER_YEAR;

/** Seasons by index: 0 spring, 1 summer, 2 autumn, 3 winter. */
export const SPRING = 0;
export const SUMMER = 1;
export const AUTUMN = 2;
export const WINTER = 3;

/** The solstices: day 1 of this week (1-based) of summer and of winter. */
export const SOLSTICE_WEEK = 7;
export type Solstice = 'summer' | 'winter';
export const SOLSTICE_SEASON: Readonly<Record<Solstice, number>> = {
  summer: SUMMER,
  winter: WINTER,
};

/** The opening moment: Sacred Era 998, spring (season 0), day 1, 06:00. */
export const START_YEAR = 998;
export const START_HOUR = 6;

export interface Calendar {
  year: number;
  /** 0 spring, 1 summer, 2 autumn, 3 winter */
  season: number;
  /** 1-based day of season (1 to 91) */
  day: number;
  /** 1-based week of season (1 to 13) */
  week: number;
  /** 1-based day of the week (1 to 7) */
  weekday: number;
  /** 1-based week of the year (1 to 52), as the calendar of progression 13.6 counts */
  weekOfYear: number;
  hour: number;
  minute: number;
  /** whole game days elapsed since the opening moment */
  dayIndex: number;
  /** minutes since midnight */
  minuteOfDay: number;
}

/** The calendar date of a day (0-based from the opening). */
function dateOfDay(dayIndex: number): Omit<Calendar, 'hour' | 'minute' | 'minuteOfDay'> {
  const yearOffset = Math.floor(dayIndex / DAYS_PER_YEAR);
  const dayOfYear = dayIndex - yearOffset * DAYS_PER_YEAR;
  const season = Math.floor(dayOfYear / DAYS_PER_SEASON);
  const dayOfSeason = dayOfYear - season * DAYS_PER_SEASON;
  const week = Math.floor(dayOfSeason / DAYS_PER_WEEK);
  return {
    year: START_YEAR + yearOffset,
    season,
    day: dayOfSeason + 1,
    week: week + 1,
    weekday: dayOfSeason - week * DAYS_PER_WEEK + 1,
    weekOfYear: season * WEEKS_PER_SEASON + week + 1,
    dayIndex,
  };
}

export function calendarAt(tick: number): Calendar {
  const totalMinutes = Math.floor(tick / TICKS_PER_GAME_MINUTE) + START_HOUR * 60;
  const dayIndex = Math.floor(totalMinutes / (24 * 60));
  const minuteOfDay = totalMinutes - dayIndex * 24 * 60;
  return {
    ...dateOfDay(dayIndex),
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60,
    minuteOfDay,
  };
}

/** Tick at which the given game day (0-based from the opening) reaches hour:minute. */
export function tickAtDay(dayIndex: number, hour = 0, minute = 0): number {
  const minutes = dayIndex * 24 * 60 + hour * 60 + minute - START_HOUR * 60;
  return Math.max(0, minutes * TICKS_PER_GAME_MINUTE);
}

/**
 * The game day (0-based from the opening) of a calendar date: `season` 0 to 3, `day` the
 * 1-based day of that season. The inverse of the date part of calendarAt.
 */
export function dayIndexOf(year: number, season: number, day: number): number {
  return (year - START_YEAR) * DAYS_PER_YEAR + season * DAYS_PER_SEASON + (day - 1);
}

/** The game day of a solstice in the given year (day 1 of week 7 of summer or winter). */
export function solsticeDay(year: number, which: Solstice): number {
  return dayIndexOf(year, SOLSTICE_SEASON[which], (SOLSTICE_WEEK - 1) * DAYS_PER_WEEK + 1);
}

/** The solstice falling on this calendar day, or null. */
export function solsticeOf(cal: Pick<Calendar, 'season' | 'day'>): Solstice | null {
  if (cal.day !== (SOLSTICE_WEEK - 1) * DAYS_PER_WEEK + 1) return null;
  if (cal.season === SUMMER) return 'summer';
  if (cal.season === WINTER) return 'winter';
  return null;
}

/** The first solstice on or after the given game day. */
export function nextSolstice(dayIndex: number): { which: Solstice; dayIndex: number } {
  const year = dateOfDay(Math.max(0, dayIndex)).year;
  for (let y = year; ; y++) {
    for (const which of ['summer', 'winter'] as const) {
      const d = solsticeDay(y, which);
      if (d >= dayIndex) return { which, dayIndex: d };
    }
  }
}

/**
 * The third of the season a day falls in (progression 13.1): early (weeks 1 to 4), mid
 * (weeks 5 to 9) and late (weeks 10 to 13); the acts' "midsummer" and "late autumn".
 */
export function seasonPart(cal: Pick<Calendar, 'week'>): 'early' | 'mid' | 'late' {
  if (cal.week <= 4) return 'early';
  if (cal.week <= 9) return 'mid';
  return 'late';
}

/** Night runs from dusk (20:00) to dawn (06:00); a night belongs to the day of its dusk. */
export const DUSK_HOUR = 20;
export const DAWN_HOUR = 6;

export function isNight(cal: Calendar): boolean {
  return cal.hour < DAWN_HOUR || cal.hour >= DUSK_HOUR;
}

/**
 * The moon (act1_borderstone.md 1.2 and 7.3): it runs on a fixed track of one week, so
 * every week has exactly one dark-moon night, the night of its sixth day (weekday 6). The
 * whole night, dusk to dawn, lies inside that week (the week turns at midnight after the
 * seventh day). The act 1 tide falls on "the dark-moon night of the week seal_unrest
 * reaches 100".
 */
export const MOON_CYCLE_DAYS = DAYS_PER_WEEK;
export const DARK_MOON_WEEKDAY = 6;

/** Whole calendar weeks since the opening (0-based); a week starts on weekday 1 at 00:00. */
export function weekIndexOf(dayIndex: number): number {
  return Math.floor(dayIndex / DAYS_PER_WEEK);
}

/** The first tick of a calendar week (weekday 1, 00:00; the opening week starts at tick 0). */
export function weekStartTick(weekIndex: number): number {
  return tickAtDay(weekIndex * DAYS_PER_WEEK, 0);
}

/** Days since the last dark-moon day (0 on the dark-moon day itself). */
export function moonAge(dayIndex: number): number {
  const offset = DARK_MOON_WEEKDAY - 1;
  return (((dayIndex - offset) % MOON_CYCLE_DAYS) + MOON_CYCLE_DAYS) % MOON_CYCLE_DAYS;
}

/** Whether the night of this day (its dusk to the next dawn) is a dark-moon night. */
export function isDarkMoonDay(dayIndex: number): boolean {
  return moonAge(dayIndex) === 0;
}

/** The tick of dusk on a day: the start of that day's night. */
export function duskTick(dayIndex: number): number {
  return tickAtDay(dayIndex, DUSK_HOUR);
}

/** The day whose night it is at this moment (the previous day before dawn), or null by day. */
export function nightDayOf(cal: Calendar): number | null {
  if (cal.hour >= DUSK_HOUR) return cal.dayIndex;
  if (cal.hour < DAWN_HOUR) return cal.dayIndex - 1;
  return null;
}

/** Daylight factor 0..1 for rendering and NPC schedules. */
export function daylight(cal: Calendar): number {
  const h = cal.minuteOfDay / 60;
  if (h < 5 || h >= 21) return 0;
  if (h < 7) return (h - 5) / 2;
  if (h >= 19) return (21 - h) / 2;
  return 1;
}
