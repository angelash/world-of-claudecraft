// Schedules (npc_society_ai.md 7.1): templates, the segment for an hour, plan
// validation for model proposals, and the rule-based daily plan used as fallback.

import type { ContentMap } from '../../core/contracts';
import { isTextRef, joinText, type KeyText, tr } from '../../core/text';
import type { CardView } from './personas';
import { resolvePlaceOn } from './places';
import {
  ACTIVITIES,
  type Activity,
  type Needs,
  type PlanSlotData,
  type ScheduleSegment,
  type ScheduleTemplate,
} from './types';

const templateCache = new WeakMap<object, Map<string, ScheduleTemplate>>();

export function scheduleTemplate(
  content: Pick<ContentMap, 'npcSchedules'>,
  id: string,
): ScheduleTemplate | undefined {
  let idx = templateCache.get(content);
  if (!idx) {
    idx = new Map((content.npcSchedules ?? []).map((t) => [t.id, t]));
    templateCache.set(content, idx);
  }
  return idx.get(id);
}

export function scheduleOf(
  content: Pick<ContentMap, 'npcSchedules'>,
  card: Pick<CardView, 'schedule'>,
): ScheduleSegment[] {
  if (Array.isArray(card.schedule)) return card.schedule;
  return scheduleTemplate(content, card.schedule)?.segments ?? [];
}

export function coversHour(seg: Pick<ScheduleSegment, 'from' | 'to'>, hour: number): boolean {
  if (seg.from === seg.to) return true;
  if (seg.from < seg.to) return hour >= seg.from && hour < seg.to;
  return hour >= seg.from || hour < seg.to;
}

const NIGHT_DEFAULT: ScheduleSegment = { from: 22, to: 6, at: '@home', act: 'sleep' };
const DAY_DEFAULT: ScheduleSegment = { from: 6, to: 22, at: '@home', act: 'wander' };

/** The segment covering an hour; later segments win so a plan can patch a template. */
export function segmentAt(segments: readonly ScheduleSegment[], hour: number): ScheduleSegment {
  for (let i = segments.length - 1; i >= 0; i--) {
    const s = segments[i] as ScheduleSegment;
    if (coversHour(s, hour)) return s;
  }
  return coversHour(NIGHT_DEFAULT, hour) ? NIGHT_DEFAULT : DAY_DEFAULT;
}

/** Kinds of places anyone may go to; private kinds need to be one's own home or work. */
const PRIVATE_KINDS = new Set([
  'home',
  'den',
  'castle',
  'barracks',
  'orphanage',
  'clinic',
  'camp',
  'mill',
  'office',
]);

export const ACT_NAMES: Record<Activity, KeyText> = {
  work: tr('sys.npc.act.work'),
  eat: tr('sys.npc.act.eat'),
  sleep: tr('sys.npc.act.sleep'),
  pray: tr('sys.npc.act.pray'),
  chat: tr('sys.npc.act.chat'),
  shop: tr('sys.npc.act.shop'),
  wander: tr('sys.npc.act.wander'),
};

/** Validate a proposed plan; returns a readable reason or null when valid. */
export function validatePlan(
  content: Pick<ContentMap, 'maps' | 'npcSchedules'>,
  card: CardView,
  slots: readonly PlanSlotData[],
  fromModel = false,
): KeyText | null {
  if (!Array.isArray(slots) || slots.length === 0) return tr('sys.npc.plan.reject.empty');
  // places of the person's own schedule template are pre-approved (the replacement table)
  const usual = new Set<string>();
  const keyOf = (p: { mapId: string; loc: { id: string } }) => `${p.mapId}/${p.loc.id}`;
  for (const seg of scheduleOf(content, card)) {
    const place = resolvePlaceOn(content, card, seg.at);
    if (place) usual.add(keyOf(place));
  }
  if (slots.length > 12) return tr('sys.npc.plan.reject.too_many');
  for (let i = 0; i < slots.length; i++) {
    const s = slots[i] as PlanSlotData;
    const n = i + 1;
    if (
      !Number.isInteger(s.from) ||
      !Number.isInteger(s.to) ||
      s.from < 0 ||
      s.from > 23 ||
      s.to < 1 ||
      s.to > 24
    )
      return tr('sys.npc.plan.reject.bad_time', { n });
    if (!ACTIVITIES.includes(s.act))
      return tr('sys.npc.plan.reject.bad_act', { n, act: String(s.act) });
    const place = resolvePlaceOn(content, card, s.at);
    if (!place) return tr('sys.npc.plan.reject.bad_place', { n, at: String(s.at) });
    const { loc } = place;
    const away = place.mapId !== card.map;
    // another map only where the person's own schedule already goes
    if (away && !usual.has(keyOf(place)))
      return tr('sys.npc.plan.reject.bad_place', { n, at: String(s.at) });
    const own = !away && (loc.id === card.home || loc.id === card.work);
    if (!own && !usual.has(keyOf(place)) && PRIVATE_KINDS.has(loc.kind))
      return tr('sys.npc.plan.reject.private', { n, place: loc.name });
    if (s.act === 'sleep' && !own) return tr('sys.npc.plan.reject.sleep_away', { n });
    // a rule plan's own note is a text key; a proposed (model) note is a short string
    if (
      s.note !== undefined &&
      (fromModel || !isTextRef(s.note)) &&
      (typeof s.note !== 'string' || s.note.length > 16)
    )
      return tr('sys.npc.plan.reject.note_long', { n });
  }
  return null;
}

/**
 * The rule plan for a day: the schedule template, with one adjustment per pressing need
 * (the deterministic fallback of the npc.daily role, npc_society_ai.md 7.1 and 14).
 */
export function ruleDayPlan(
  content: Pick<ContentMap, 'npcSchedules'>,
  card: CardView,
  needs: Needs,
  moneyNeed: number,
  devotion: number,
  day: { holy?: boolean; market?: boolean } = {},
): { slots: PlanSlotData[]; note: KeyText } {
  const slots: PlanSlotData[] = scheduleOf(content, card).map((s) => ({ ...s }));
  const notes: KeyText[] = [];
  const swap = (pred: (s: PlanSlotData) => boolean, patch: Partial<PlanSlotData>, why: KeyText) => {
    const s = slots.find(pred);
    if (!s) return;
    Object.assign(s, patch);
    notes.push(why);
  };
  const free = (s: PlanSlotData) => s.act === 'wander' || s.act === 'chat' || s.act === 'shop';
  if (moneyNeed < 35)
    swap(
      (s) => free(s) && s.from >= 8 && s.from < 18,
      { act: 'work', at: '@work', note: tr('sys.npc.plan.note.work_more') },
      tr('sys.npc.plan.why.work_more'),
    );
  if (devotion >= 0.5 && needs.faith < 45)
    swap(
      (s) => free(s) && s.act !== 'work',
      { act: 'pray', at: '@church', note: tr('sys.npc.plan.note.pray') },
      tr('sys.npc.plan.why.pray'),
    );
  if (needs.social < 40)
    swap(
      (s) => s.act === 'wander' && s.from >= 16,
      { act: 'chat', at: '@tavern', note: tr('sys.npc.plan.note.chat') },
      tr('sys.npc.plan.why.chat'),
    );
  // the day's kind (builtin_ai.md 3.2 step 2): the week's service, the market day
  if (day.holy && devotion >= 0.3 && notes.length < 3)
    swap(
      (s) => free(s) && s.act !== 'pray' && s.from >= 7 && s.from < 12,
      { act: 'pray', at: '@church', note: tr('sys.npc.plan.note.service') },
      tr('sys.npc.plan.why.service'),
    );
  if (day.market && notes.length < 3)
    swap(
      (s) => free(s) && s.act !== 'shop' && s.from >= 9 && s.from < 17,
      { act: 'shop', at: '@market', note: tr('sys.npc.plan.note.market') },
      tr('sys.npc.plan.why.market'),
    );
  return {
    slots,
    note: notes.length > 0 ? joinText('semicolon', notes) : tr('sys.npc.plan.why.usual'),
  };
}
