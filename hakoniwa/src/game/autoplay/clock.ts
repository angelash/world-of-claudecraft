// The autoplayer's view of the act clock (PK-M1-45): it reads the clock the quests system
// runs (src/systems/quests/act_clock.ts) instead of keeping time of its own. Conditions are
// evaluated with the same calendar terms the kernel's narrative resolver adds, a quest's
// week window is checked the way the kernel checks it, and when a main quest waits on
// nothing but the clock, the autoplayer lets time pass until the clock next moves (the next
// act-week start or night dusk, or the next hour mark for an hour-level calendar term).

import type { ContentMap, FlagValue } from '../../core/contracts';
import { TICKS_PER_GAME_HOUR } from '../../core/time';
import type { World } from '../../core/world';
import { NEVER, ticksToClockEvent } from '../../systems/quests/act_clock';
import { openingActId } from '../../systems/quests/act_order';
import { CALENDAR_TERMS, calendarTerms } from '../../systems/quests/calendar_terms';
import { referencedVars } from '../../systems/quests/conditions';
import type { QuestDef } from '../../systems/quests/types';

/** The resolver extras the autoplayer evaluates with: the calendar terms, no model. */
export function clockExtras(world: World): Record<string, FlagValue> {
  return { ...calendarTerms(world.meta.tick), ai_enabled: false };
}

/** The act the world is in (the opening act before the flag is written). */
function actOf(world: World, content: ContentMap): string {
  return String(world.meta.flags.act ?? openingActId(content));
}

/** The kernel's window rule (progress.ts windowOpen) read from the world. */
export function windowOpenIn(world: World, content: ContentMap, def: QuestDef): boolean {
  const w = def.weekWindow;
  if (!w) return true;
  if (actOf(world, content) !== def.act) return false;
  const week = Number(world.meta.flags.act_week ?? 0);
  return week >= (w.from ?? 1) && (w.to === undefined || week <= w.to);
}

const HOURLY = new Set<string>(CALENDAR_TERMS);

/** Clock names a trigger reads: act_week and the calendar terms. */
function clockVars(def: QuestDef): string[] {
  if (!def.trigger) return [];
  return referencedVars(def.trigger).filter((v) => v === 'act_week' || HOURLY.has(v));
}

/**
 * Whether a quest of the current act can only open when the clock moves: its week window
 * has not opened yet, or its trigger reads act_week or a calendar term.
 */
export function waitsOnClock(world: World, content: ContentMap, def: QuestDef): boolean {
  if (def.act !== actOf(world, content)) return false;
  const week = Number(world.meta.flags.act_week ?? 0);
  const w = def.weekWindow;
  // a window already shut never opens again: nothing to wait for
  if (w?.to !== undefined && week > w.to) return false;
  if (w?.from !== undefined && week < w.from) return true;
  return clockVars(def).length > 0;
}

/**
 * Ticks worth waiting for the clock to move for these quests: to the clock's next event,
 * or to the next hour mark when a trigger reads an hour-level calendar term.
 */
export function clockWait(world: World, defs: readonly QuestDef[]): number {
  let wait = ticksToClockEvent(world);
  const tick = world.meta.tick;
  const hourMark = TICKS_PER_GAME_HOUR - (tick % TICKS_PER_GAME_HOUR);
  if (defs.some((d) => clockVars(d).some((v) => HOURLY.has(v)))) wait = Math.min(wait, hourMark);
  return wait >= NEVER ? hourMark : Math.max(1, wait);
}
