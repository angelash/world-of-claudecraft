// Calendar terms of the condition language (quests_and_events.md 4.1; world_state_registry.md
// 8.1): the built-ins `day`, `hour`, `weekday`, `season`, `year`, `night` and `dark_moon`
// are pure functions of the tick, read by the narrative resolver (quests, scenes, the
// director) and by the autoplayer, never stored as flags. `act_week` is different: the act
// clock writes it as a flag (act_clock.ts), so every resolver sees it. A leaf module (core
// imports only), so the effect interpreter can use it without an import cycle.

import type { FlagValue } from '../../core/contracts';
import { calendarAt, isDarkMoonDay, nightDayOf } from '../../core/time';

/** Season names by calendar index, as the registry's `season` enum spells them. */
export const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'] as const;

/** The names calendarTerms answers (the condition built-ins that are not flags). */
export const CALENDAR_TERMS = [
  'day',
  'hour',
  'weekday',
  'season',
  'year',
  'night',
  'dark_moon',
] as const;

/** The calendar terms at a tick. */
export function calendarTerms(tick: number): Record<string, FlagValue> {
  const cal = calendarAt(tick);
  const nightOf = nightDayOf(cal);
  return {
    day: cal.dayIndex,
    hour: cal.hour,
    weekday: cal.weekday,
    season: SEASON_NAMES[cal.season] ?? SEASON_NAMES[0],
    year: cal.year,
    night: nightOf !== null,
    dark_moon: nightOf !== null && isDarkMoonDay(nightOf),
  };
}
