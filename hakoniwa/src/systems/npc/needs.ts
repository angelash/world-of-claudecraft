// Needs (npc_society_ai.md 7.2): hourly decay, gains from activities, and the
// need-driven override that bends the schedule when a need falls below its line.

import { type KeyText, tr } from '../../core/text';
import { MEAL_TAVERN, NEED_CRITICAL, NEED_DECAY, NEED_GAIN, NEED_RECONSIDER } from './constants';
import type { Activity, Needs, NeedWeights, ScheduleSegment } from './types';

export function initialNeeds(): Needs {
  return { hunger: 80, energy: 85, social: 70, faith: 70 };
}

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** One game hour of need change for the activity performed during it. */
export function stepNeeds(needs: Needs, w: NeedWeights, act: Activity): void {
  const wh = w.hunger ?? 1;
  const we = w.energy ?? 1;
  const ws = w.social ?? 1;
  const wf = w.faith ?? 0.5;
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
}

/** Money need 0..100 from savings against a week of ordinary spending. */
export function moneyNeed(money: number): number {
  return clamp((money / (7 * 20)) * 100);
}

/** Activity buckets that a pressing need may interrupt. */
const FREE: ReadonlySet<Activity> = new Set<Activity>(['wander', 'chat', 'shop']);

/**
 * The override a pressing need forces on the scheduled segment, or null. Work and sleep
 * are only interrupted by critical needs (design 3.2: below the reconsider line).
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
