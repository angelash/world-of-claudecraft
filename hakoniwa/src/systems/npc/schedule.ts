// Schedules (npc_society_ai.md 7.1): templates, the segment for an hour, plan
// validation for model proposals, and the rule-based daily plan used as fallback.

import type { ContentMap } from '../../core/contracts';
import type { CardView } from './personas';
import { resolvePlace } from './places';
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

export const ACT_NAMES: Record<Activity, string> = {
  work: '劳作',
  eat: '吃饭',
  sleep: '睡觉',
  pray: '祈祷',
  chat: '闲聊',
  shop: '买东西',
  wander: '闲逛',
};

/** Validate a proposed plan; returns a readable Chinese reason or null when valid. */
export function validatePlan(
  content: Pick<ContentMap, 'maps' | 'npcSchedules'>,
  card: CardView,
  slots: readonly PlanSlotData[],
): string | null {
  if (!Array.isArray(slots) || slots.length === 0) return '计划是空的';
  // places of the person's own schedule template are pre-approved (the replacement table)
  const usual = new Set<string>();
  for (const seg of scheduleOf(content, card)) {
    const loc = resolvePlace(content, card, seg.at);
    if (loc) usual.add(loc.id);
  }
  if (slots.length > 12) return '计划的时段太多（至多 12 段）';
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
      return `第 ${n} 段的时刻不对`;
    if (!ACTIVITIES.includes(s.act)) return `第 ${n} 段的活动"${String(s.act)}"不在可选范围内`;
    const loc = resolvePlace(content, card, s.at);
    if (!loc) return `第 ${n} 段的地点"${s.at}"在这张地图上不存在`;
    const own = loc.id === card.home || loc.id === card.work;
    if (!own && !usual.has(loc.id) && PRIVATE_KINDS.has(loc.kind))
      return `第 ${n} 段：${loc.name}不是可以随便进的地方`;
    if (s.act === 'sleep' && !own) return `第 ${n} 段：只能在自己家或干活的地方睡觉`;
    if (s.note !== undefined && (typeof s.note !== 'string' || s.note.length > 16))
      return `第 ${n} 段的备注太长`;
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
): { slots: PlanSlotData[]; note: string } {
  const slots: PlanSlotData[] = scheduleOf(content, card).map((s) => ({ ...s }));
  const notes: string[] = [];
  const swap = (pred: (s: PlanSlotData) => boolean, patch: Partial<PlanSlotData>, why: string) => {
    const s = slots.find(pred);
    if (!s) return;
    Object.assign(s, patch);
    notes.push(why);
  };
  const free = (s: PlanSlotData) => s.act === 'wander' || s.act === 'chat' || s.act === 'shop';
  if (moneyNeed < 35)
    swap(
      (s) => free(s) && s.from >= 8 && s.from < 18,
      { act: 'work', at: '@work', note: '多干点活' },
      '手头紧，多干点活',
    );
  if (devotion >= 0.5 && needs.faith < 45)
    swap(
      (s) => free(s) && s.act !== 'work',
      { act: 'pray', at: '@church', note: '去祷告' },
      '心里不安，去祷告',
    );
  if (needs.social < 40)
    swap(
      (s) => s.act === 'wander' && s.from >= 16,
      { act: 'chat', at: '@tavern', note: '找人说说话' },
      '想找人说说话',
    );
  return { slots, note: notes.join('；') || '照常过日子' };
}
