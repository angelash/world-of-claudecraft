// Daily plan round (npc_society_ai.md 3.1, L1 and L2 at dawn): file the npc.daily AI
// request with the rule plan as fallback, and validate and apply npc.plan commands.

import { systemSource } from '../../core';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { commandText, type KeyText, type TextParam, tr } from '../../core/text';
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
    const here = locationById(ctx.content, st.mapId, st.locId)?.name ?? tr('sys.npc.place.home');
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
        tr('sys.npc.prompt.plan_situation', {
          time: timeLabel(ctx.tick),
          here,
          needs: needsText(st.needs, mNeed),
        }),
        {
          'npc.plan': tr('sys.npc.prompt.plan_command', { npcId: id, rev: st.planRev, day }),
        },
        {
          defaultPlan: rule.slots,
          places: placeList(ctx, card),
          // fresh copies: the context is world state, the table is module data
          acts: JSON.parse(JSON.stringify(ACT_NAMES)),
        },
      ),
      allowed: ['npc.plan'],
      fallback,
      deadlineTicks: DAILY_DEADLINE,
      priority: st.tier === 1 ? 3 : 2,
    });
  }
}

/** A proposed goal or note: model strings are capped; rule notes are text keys (short). */
function planText(v: TextParam | undefined, fromModel: boolean): TextParam | undefined {
  if (v === undefined) return undefined;
  // rule goals and notes are short keys; only strings need the cap
  const text = commandText(v, fromModel, (s) => s.slice(0, 60));
  // the old reading kept an empty string and dropped anything that was not text
  return text === '' && typeof v !== 'string' ? undefined : text;
}

/** Validate and apply a plan for today; returns a readable reason on rejection. */
export function applyPlan(
  ctx: SystemContext,
  d: {
    npcId: string;
    revision: number;
    day: number;
    slots: PlanSlotData[];
    goal?: TextParam;
    note?: TextParam;
  },
  source: PlanState['source'],
): KeyText | null {
  const slice = ctx.world.slices.npc;
  const st = slice.npcs[d.npcId];
  const card = cardOf(slice, ctx.content, d.npcId);
  if (!st || !card) return tr('sys.npc.plan.reject.unknown_npc');
  if (st.gone) return tr('sys.npc.reject.no_npc');
  if (d.revision !== st.planRev) return tr('sys.npc.plan.reject.stale');
  const cal = calendarAt(ctx.tick);
  if (d.day !== cal.dayIndex) return tr('sys.npc.plan.reject.not_today');
  const fromModel = source === 'ai';
  const why = validatePlan(ctx.content, card, d.slots, fromModel);
  if (why) return why;
  st.plan = {
    day: d.day,
    slots: d.slots.map((s) => ({
      from: s.from,
      to: s.to,
      at: s.at,
      act: s.act,
      note: s.note === undefined ? undefined : commandText(s.note, fromModel, (x) => x),
    })),
    source,
    goal: planText(d.goal, fromModel),
    note: planText(d.note, fromModel),
  };
  ctx.emit('npc.plan_set', { npcId: d.npcId, day: d.day, source });
  if (!st.talking && ctx.tick >= st.freezeUntil) {
    applyDecision(ctx, st, card, decideHour(ctx, st, card, cal.hour), cal.hour);
  }
  return null;
}
