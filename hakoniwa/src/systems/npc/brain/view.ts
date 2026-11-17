// What one brain evaluation sees of its actor (builtin_ai.md 1.2: the actor's own
// projection, never the world truth beyond it): the state, the card, the hour, today's
// template segment, spendable money and mood. Built once per evaluation.

import type { SystemContext } from '../../../core/system';
import { calendarAt } from '../../../core/time';
import type { Mood } from '../../dialogue/lines/types';
import type { CardView } from '../personas';
import { scheduleOf, segmentAt } from '../schedule';
import type { NpcBrainState, NpcState, PersonaCard, ScheduleSegment } from '../types';
import { spendable } from '../wallet';
import { moodOf } from './mood';
import { ensureBrain, newBrain } from './state';

export interface ActorView {
  ctx: SystemContext;
  st: NpcState;
  card: CardView;
  p: PersonaCard | undefined;
  brain: NpcBrainState;
  hour: number;
  day: number;
  weekday: number;
  /** the template segment of this hour (the person's own schedule, not today's plan) */
  template: ScheduleSegment;
  /** today's segment: the plan's when one is set for today, else the template's */
  segment: ScheduleSegment;
  money: number;
  mood: Mood;
  /**
   * Predicate values already read for this view (one decision reads the same predicate in
   * several role trees and again when the usel scores them; the world does not change
   * in between). Never saved.
   */
  memo: Map<string, boolean>;
}

export function actorView(ctx: SystemContext, st: NpcState, card: CardView): ActorView {
  const cal = calendarAt(ctx.tick);
  const template = segmentAt(scheduleOf(ctx.content, card), cal.hour);
  const segment =
    st.plan && st.plan.day === cal.dayIndex ? segmentAt(st.plan.slots, cal.hour) : template;
  return {
    ctx,
    st,
    card,
    p: card.persona,
    // residents have no saved brain: a throwaway one keeps the view uniform
    brain: st.resident ? (st.brain ?? newBrain()) : ensureBrain(st),
    hour: cal.hour,
    day: cal.dayIndex,
    weekday: cal.weekday,
    template,
    segment,
    money: spendable(ctx, st),
    mood: moodOf(st, ctx.tick),
    memo: new Map(),
  };
}
