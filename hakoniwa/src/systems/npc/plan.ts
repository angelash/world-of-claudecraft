// Daily plan round (npc_society_ai.md 3.1, L1 and L2 at dawn): file the npc.daily AI
// request with the rule plan as fallback, and validate and apply npc.plan commands.

import { systemSource } from '../../core';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { mapById } from '../world';
import { applyDecision, decideHour, devotionOf, spendable } from './actions';
import { baseContext, needsText } from './ai_context';
import { DAILY_DEADLINE } from './constants';
import { timeLabel } from './memory';
import { moneyNeed } from './needs';
import { type CardView, cardOf, personaById } from './personas';
import { locationById } from './places';
import { ACT_NAMES, ruleDayPlan, validatePlan } from './schedule';
import type { NpcState, PlanSlotData, PlanState } from './types';

/** Places a plan may use: the persona's own home and work plus every public place. */
function placeList(ctx: SystemContext, card: CardView) {
  const map = mapById(ctx.content, card.map);
  if (!map) return [];
  return map.locations
    .filter((l) => !l.id.startsWith('gate_'))
    .map((l) => ({ id: l.id, name: l.name, kind: l.kind }));
}

/** File the dawn plan requests for every named L1 and L2 resident. */
export function requestDailyPlans(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const day = calendarAt(ctx.tick).dayIndex;
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    if (st.resident || st.gone || st.tier > 2) continue;
    const p = personaById(ctx.content, id);
    const card = cardOf(slice, ctx.content, id);
    if (!p || !card) continue;
    st.planRev += 1;
    const mNeed = moneyNeed(spendable(ctx, st));
    const rule = ruleDayPlan(ctx.content, card, st.needs, mNeed, devotionOf(card));
    const fallback: AnyCommand[] = [
      {
        kind: 'npc.plan',
        data: { npcId: id, revision: st.planRev, day, slots: rule.slots, note: rule.note },
        source: systemSource('npc'),
      },
    ];
    const here = locationById(ctx.content, st.mapId, st.locId)?.name ?? '家里';
    ctx.ai.request({
      agentId: id,
      role: 'npc.daily',
      purpose: 'morning_plan',
      revision: st.planRev,
      context: baseContext(
        ctx.content,
        p,
        slice.minds[id],
        (k) => ctx.flag(k),
        `${timeLabel(ctx.tick)}，天快亮了，你在${here}。安排今天的日程。你现在：${needsText(st.needs, mNeed)}。`,
        {
          'npc.plan': `安排今天的日程。数据：{ npcId: "${id}", revision: ${st.planRev}, day: ${day}, slots: [{ from, to, at, act, note? }], goal?, note? }。from、to 为整点（0 到 24，to 小于 from 表示跨过午夜）；at 只能取 extra.places 中的地点 ID，或 @home、@work；act 只能取 extra.acts 的键；只能在自己家或干活的地方睡觉。默认日程见 extra.defaultPlan，不想改就原样提交。`,
        },
        {
          defaultPlan: rule.slots,
          places: placeList(ctx, card),
          acts: ACT_NAMES,
        },
      ),
      allowed: ['npc.plan'],
      fallback,
      deadlineTicks: DAILY_DEADLINE,
      priority: st.tier === 1 ? 3 : 2,
    });
  }
}

/** Validate and apply a plan for today; returns a Chinese reason on rejection. */
export function applyPlan(
  ctx: SystemContext,
  d: {
    npcId: string;
    revision: number;
    day: number;
    slots: PlanSlotData[];
    goal?: string;
    note?: string;
  },
  source: PlanState['source'],
): string | null {
  const slice = ctx.world.slices.npc;
  const st = slice.npcs[d.npcId];
  const card = cardOf(slice, ctx.content, d.npcId);
  if (!st || !card) return '没有这个人';
  if (st.gone) return '这个人现在不在';
  if (d.revision !== st.planRev) return '计划已经过时，外部安排已改变';
  const cal = calendarAt(ctx.tick);
  if (d.day !== cal.dayIndex) return '这不是今天的计划';
  const why = validatePlan(ctx.content, card, d.slots);
  if (why) return why;
  st.plan = {
    day: d.day,
    slots: d.slots.map((s) => ({ from: s.from, to: s.to, at: s.at, act: s.act, note: s.note })),
    source,
    goal: typeof d.goal === 'string' ? d.goal.slice(0, 60) : undefined,
    note: typeof d.note === 'string' ? d.note.slice(0, 60) : undefined,
  };
  ctx.emit('npc.plan_set', { npcId: d.npcId, day: d.day, source });
  if (!st.talking && ctx.tick >= st.freezeUntil) {
    applyDecision(ctx, st, card, decideHour(ctx, st, card, cal.hour), cal.hour);
  }
  return null;
}
