// Needs (npc_society_ai.md 7.2, builtin_ai.md 3.3): the nine needs, their hourly change
// with the activity performed, the event-driven needs drifting back to their baselines,
// and the need-driven override that bends the schedule of nameless residents (named NPCs
// choose their answer to a pressing need through the brain's utility library instead).

import { type KeyText, tr } from '../../core/text';
import {
  MEAL_TAVERN,
  NEED_BASE,
  NEED_CRITICAL,
  NEED_DECAY,
  NEED_DRIFT,
  NEED_GAIN,
  NEED_RECONSIDER,
} from './constants';
import type { Activity, Needs, NeedWeights, ScheduleSegment } from './types';

export function initialNeeds(): Needs {
  return {
    hunger: 80,
    energy: 85,
    social: 70,
    faith: 70,
    money: 70,
    safety: NEED_BASE.safety,
    face: NEED_BASE.face,
    duty: NEED_BASE.duty,
    peace: NEED_BASE.peace,
  };
}

/** Fill the needs a world saved before the nine lacks (in place); returns the needs. */
export function ensureNeeds(needs: Needs): Needs {
  const fresh = initialNeeds();
  for (const k of Object.keys(fresh) as (keyof Needs)[]) {
    if (typeof needs[k] !== 'number' || Number.isNaN(needs[k])) needs[k] = fresh[k];
  }
  return needs;
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const round = (v: number) => Math.round(v * 100) / 100;

/** Move `v` toward `target` by at most `step`. */
function drift(v: number, target: number, step: number): number {
  if (v < target) return Math.min(target, v + step);
  if (v > target) return Math.max(target, v - step);
  return v;
}

export interface HourContext {
  /** the person's template says work at this hour (duty falls while it is left undone) */
  scheduledWork?: boolean;
  /** devotion 0..1 (faith decays with it) */
  devotion?: number;
}

/**
 * One game hour of need change for the activity performed during it (builtin_ai.md 3.3):
 * hunger, energy, social and faith as before; safety, face and peace drift back to their
 * baselines; duty falls while scheduled work is left undone and recovers while working.
 */
export function stepNeeds(
  needs: Needs,
  w: NeedWeights,
  act: Activity,
  hour: HourContext = {},
): void {
  ensureNeeds(needs);
  const wh = w.hunger ?? 1;
  const we = w.energy ?? 1;
  const ws = w.social ?? 1;
  const wf = w.faith ?? hour.devotion ?? 0.5;
  needs.hunger = clamp(needs.hunger - NEED_DECAY.hunger * wh * (act === 'sleep' ? 0.4 : 1));
  if (act === 'eat') needs.hunger = clamp(needs.hunger + NEED_GAIN.eat);
  if (act === 'sleep') needs.energy = clamp(needs.energy + NEED_GAIN.sleep);
  else needs.energy = clamp(needs.energy - NEED_DECAY.energy * we * (act === 'work' ? 1.4 : 1));
  if (act === 'chat') needs.social = clamp(needs.social + NEED_GAIN.chat);
  else if (act === 'shop' || act === 'wander' || act === 'eat')
    needs.social = clamp(needs.social + NEED_GAIN.shop - NEED_DECAY.social * ws * 0.5);
  else if (act !== 'sleep') needs.social = clamp(needs.social - NEED_DECAY.social * ws);
  if (act === 'pray') needs.faith = clamp(needs.faith + NEED_GAIN.pray);
  else if (wf > 0) needs.faith = clamp(needs.faith - NEED_DECAY.faith * wf);
  // the event-driven needs drift back to their baselines
  needs.safety = round(clamp(drift(needs.safety, NEED_BASE.safety, NEED_DRIFT.safety)));
  needs.face = round(clamp(drift(needs.face, NEED_BASE.face, NEED_DRIFT.face)));
  needs.peace = round(
    clamp(drift(needs.peace, NEED_BASE.peace, NEED_DRIFT.peace) + (act === 'pray' ? 10 : 0)),
  );
  const wd = w.duty ?? 1;
  if (act === 'work') needs.duty = clamp(needs.duty + NEED_GAIN.duty);
  else if (hour.scheduledWork) needs.duty = clamp(needs.duty - NEED_DECAY.duty * wd);
  else needs.duty = round(clamp(drift(needs.duty, NEED_BASE.duty, NEED_DRIFT.duty)));
}

/** Money need 0..100 from savings against a week of ordinary spending. */
export function moneyNeed(money: number): number {
  return clamp((money / (7 * 20)) * 100);
}

/** Change one event-driven need (safety, face, peace) by `delta`, weighted by the persona. */
export function bumpNeed(
  needs: Needs,
  key: 'safety' | 'face' | 'peace' | 'duty' | 'social',
  delta: number,
  weight = 1,
): void {
  ensureNeeds(needs);
  needs[key] = round(clamp(needs[key] + delta * weight));
}

/** Activity buckets that a pressing need may interrupt. */
const FREE: ReadonlySet<Activity> = new Set<Activity>(['wander', 'chat', 'shop']);

/**
 * The override a pressing need forces on the scheduled segment, or null. Work and sleep
 * are only interrupted by critical needs (design 3.2: below the reconsider line). Used for
 * nameless residents and as the brain's last resort.
 */
export function needOverride(
  needs: Needs,
  seg: ScheduleSegment,
  devotion: number,
  money: number,
): { act: Activity; at: string; note: KeyText } | null {
  if (seg.act === 'sleep') return null;
  if (needs.energy < NEED_CRITICAL)
    return { act: 'sleep', at: '@home', note: tr('sys.npc.note.exhausted') };
  const hungry = seg.act === 'work' ? needs.hunger < NEED_CRITICAL : needs.hunger < NEED_RECONSIDER;
  if (hungry && seg.act !== 'eat') {
    return money >= MEAL_TAVERN
      ? { act: 'eat', at: '@tavern', note: tr('sys.npc.note.hungry') }
      : { act: 'eat', at: '@home', note: tr('sys.npc.note.black_bread') };
  }
  if (!FREE.has(seg.act)) return null;
  if (devotion >= 0.5 && needs.faith < 25)
    return { act: 'pray', at: '@church', note: tr('sys.npc.note.anxious') };
  if (needs.social < 25) return { act: 'chat', at: '@tavern', note: tr('sys.npc.note.lonely') };
  return null;
}
