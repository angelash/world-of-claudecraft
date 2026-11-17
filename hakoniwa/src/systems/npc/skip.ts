// NPCs during a time skip (travel_and_exploration.md 7.5, "NPC 社会"): on an hour-coarse
// step the world puts every walker at its goal and sends the hour, so schedules land in
// place and needs decay through the usual hourly handler; here the residents' own clocks
// catch up: the chat rounds the hour held (closed-vocabulary lines, any model request held
// by the skip falls back to the rule line) and frozen residents resume.

import type { SkipStep, SystemContext } from '../../core/system';
import { registerSkipHandler } from '../travel/skip_registry';
import { runChats } from './chat';
import { CHAT_TICKS } from './constants';
import { resumeFrozen } from './ports';

/** Chat rounds of the live clock that fell inside the step. */
export function chatRoundsIn(step: SkipStep): number {
  return Math.floor(step.to / CHAT_TICKS) - Math.floor(step.from / CHAT_TICKS);
}

export function npcSkip(ctx: SystemContext, step: SkipStep): void {
  resumeFrozen(ctx);
  for (let i = chatRoundsIn(step); i > 0; i--) runChats(ctx);
}

registerSkipHandler('npc', npcSkip);
