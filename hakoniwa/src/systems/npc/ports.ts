// Ports other systems of the social trio call (dialogue, cognition): conversation
// freeze, relevance heat, and resuming the schedule after a freeze or an errand.

import { systemSource } from '../../core';
import type { SystemContext } from '../../core/system';
import { calendarAt } from '../../core/time';
import { applyDecision, decideHour } from './actions';
import { FREEZE_TICKS } from './constants';
import { cardOf } from './personas';
import type { NpcState } from './types';

/** The player starts or stops talking to an NPC (design 3.6: player talk freezes the NPC). */
export function setConversing(ctx: SystemContext, npcId: string, on: boolean): void {
  const st = ctx.world.slices.npc.npcs[npcId];
  if (!st) return;
  st.talking = on;
  st.freezeUntil = ctx.tick + FREEZE_TICKS;
  if (on) {
    ctx.dispatch('world.stop', { entityId: st.entityId }, systemSource('npc'));
    if (st.tier !== 1 && !st.resident) {
      const from = st.tier;
      st.tier = 1;
      ctx.emit('npc.tier_changed', { npcId, from, to: 1 });
    }
  }
}

/** Keep a conversation partner frozen while lines keep coming. */
export function touchConversation(ctx: SystemContext, npcId: string): void {
  const st = ctx.world.slices.npc.npcs[npcId];
  if (st) st.freezeUntil = ctx.tick + FREEZE_TICKS;
}

/** Event heat for the tier score (witnessing deeds, hearing hot rumors about the player). */
export function bumpHeat(ctx: SystemContext, npcId: string, amount: number): void {
  const st = ctx.world.slices.npc.npcs[npcId];
  if (st) st.heat = Math.min(1, st.heat + amount);
}

/** Resume schedules whose conversation freeze or scripted errand has run out. */
export function resumeFrozen(ctx: SystemContext): void {
  const slice = ctx.world.slices.npc;
  const hour = calendarAt(ctx.tick).hour;
  for (const id of Object.keys(slice.npcs).sort()) {
    const st = slice.npcs[id] as NpcState;
    if (st.talking || st.gone) continue;
    const errandOver = !!st.override && ctx.tick >= st.override.until;
    const thawed = st.freezeUntil !== 0 && ctx.tick >= st.freezeUntil;
    if (!errandOver && !thawed) continue;
    if (errandOver) st.override = null;
    if (thawed) st.freezeUntil = 0;
    if (st.freezeUntil !== 0) continue;
    const card = cardOf(slice, ctx.content, id);
    if (!card) continue;
    applyDecision(ctx, st, card, decideHour(ctx, st, card, hour), hour);
  }
}
