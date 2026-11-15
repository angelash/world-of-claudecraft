// Text formatting for the HUD: the Sacred Era calendar, time of day, weather, acts,
// features, entity kinds and tag-derived level and tier. Pure; Node-tested.

import type { Calendar } from '../../core/time';
import { fmt, T } from '../../shared_ui/text';
import type { Entity, Weather } from '../../systems/world/types';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function seasonLabel(season: number): string {
  return T.calendar.seasons[((season % 4) + 4) % 4] as string;
}

/** "圣历 998 年 春 第 1 日" */
export function formatDate(cal: Calendar): string {
  return fmt(T.calendar.format, { year: cal.year, season: seasonLabel(cal.season), day: cal.day });
}

/** "06:00" */
export function formatTime(cal: Calendar): string {
  return fmt(T.calendar.time, { hh: pad2(cal.hour), mm: pad2(cal.minute) });
}

export function timeOfDayLabel(cal: Calendar): string {
  const h = cal.hour;
  const t = T.calendar.timeOfDay;
  if (h < 4) return t.lateNight;
  if (h < 7) return t.dawn;
  if (h < 11) return t.morning;
  if (h < 13) return t.noon;
  if (h < 17) return t.afternoon;
  if (h < 20) return t.dusk;
  if (h < 23) return t.night;
  return t.lateNight;
}

export function weatherLabel(w: Weather | string): string {
  return (T.weather as Record<string, string>)[w] ?? T.weather.unknown;
}

export function actLabel(act: string): string {
  return T.acts[act] ?? act;
}

/** "feature.company" or "company" to its display name. */
export function featureLabel(feature: string): string {
  const key = feature.startsWith('feature.') ? feature.slice('feature.'.length) : feature;
  return T.features[key] ?? key;
}

export function kindLabel(kind: Entity['kind']): string {
  return (T.frames.kinds as Record<string, string>)[kind] ?? kind;
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
