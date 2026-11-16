// Text formatting for the HUD: the Sacred Era calendar, time of day, weather, acts,
// features, entity kinds and tag-derived level and tier. Pure; Node-tested.

import type { Calendar } from '../../core/time';
import { t, tOr } from '../../shared_ui/i18n';
import type { Entity, Weather } from '../../systems/world/types';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function seasonLabel(season: number): string {
  return t(`ui.common.calendar.season.${((season % 4) + 4) % 4}`);
}

/** "圣历 998 年 春 第 1 日" */
export function formatDate(cal: Calendar): string {
  return t('ui.common.calendar.format', {
    year: cal.year,
    season: seasonLabel(cal.season),
    day: cal.day,
  });
}

/** "06:00" */
export function formatTime(cal: Calendar): string {
  return t('ui.common.calendar.time', { hh: pad2(cal.hour), mm: pad2(cal.minute) });
}

export function timeOfDayLabel(cal: Calendar): string {
  const h = cal.hour;

  if (h < 4) return t('ui.common.calendar.time_of_day.late_night');
  if (h < 7) return t('ui.common.calendar.time_of_day.dawn');
  if (h < 11) return t('ui.common.calendar.time_of_day.morning');
  if (h < 13) return t('ui.common.calendar.time_of_day.noon');
  if (h < 17) return t('ui.common.calendar.time_of_day.afternoon');
  if (h < 20) return t('ui.common.calendar.time_of_day.dusk');
  if (h < 23) return t('ui.common.calendar.time_of_day.night');
  return t('ui.common.calendar.time_of_day.late_night');
}

export function weatherLabel(w: Weather | string): string {
  return tOr(`ui.common.weather.${w}`, t('ui.common.weather.unknown'));
}

export function actLabel(act: string): string {
  return tOr(`ui.common.act.${act}`, act);
}

/** "feature.company" or "company" to its display name. */
export function featureLabel(feature: string): string {
  const key = feature.startsWith('feature.') ? feature.slice('feature.'.length) : feature;
  return tOr(`ui.common.feature.${key}`, key);
}

export function kindLabel(kind: Entity['kind']): string {
  return tOr(`ui.common.unit.kind.${kind}`, kind);
}

function tagNumber(tags: readonly string[], prefix: string): number | null {
  for (const t of tags) {
    if (!t.startsWith(prefix)) continue;
    const n = Number(t.slice(prefix.length));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Level from the `lvl:<n>` tag (implementation_conventions.md 5). */
export function levelFromTags(tags: readonly string[]): number | null {
  return tagNumber(tags, 'lvl:');
}

/** Tier 0..7 from the `tier:<n>` tag. */
export function tierFromTags(tags: readonly string[]): number | null {
  return tagNumber(tags, 'tier:');
}
