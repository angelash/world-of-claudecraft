// Persuasion in a conversation (builtin_ai.md 6.4 row 37; quests_and_events.md 5 `persuade`;
// PK-M1-19): when the player has a persuade objective on this person, the talk offers
// "persuade"; choosing it, or saying something the classifier reads as persuading, is the
// attempt. The kernel judges it by the objective's threshold (evidence and relation, written
// in the quest data), never by the words: met, the person gives in and the quests system
// marks the objective (dialogue.persuaded); not met, they hold their ground.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { moodOf } from '../npc/brain/mood';
import { conditionHolds } from '../quests/effects';
import { openPersuasions } from '../quests/objective_events';
import { varsFor } from './replies';
import { speak } from './speak';
import type { DialogueSession, SessionOption } from './types';

export const PERSUADE_OPTION = 'persuade';

/** Whether the player has someone to persuade in this person (an open objective). */
export function persuasionOpen(ctx: SystemContext, npcRef: string): boolean {
  // a world without the quests system has no objectives to persuade for
  if (!ctx.world.slices.quests) return false;
  return openPersuasions(ctx, npcRef).length > 0;
}

export function persuadeOption(): SessionOption {
  return { id: PERSUADE_OPTION, label: tr('sys.dialogue.option.persuade'), system: 'dialogue' };
}

/** Put the persuade option on a new talk when there is someone to persuade. */
export function offerPersuasion(ctx: SystemContext, s: DialogueSession): void {
  if (!persuasionOpen(ctx, s.npcRef) || s.options.some((o) => o.id === PERSUADE_OPTION)) return;
  s.options.splice(Math.max(0, s.options.length - 1), 0, persuadeOption());
}

/**
 * The attempt: met when any open persuade objective's threshold holds now. Emits
 * dialogue.persuaded either way and returns the person's line.
 */
export function attemptPersuasion(
  ctx: SystemContext,
  s: DialogueSession,
): { ok: boolean; line: TextParam } {
  const ok = openPersuasions(ctx, s.npcRef).some((x) => conditionHolds(ctx, x.when));
  ctx.emit('dialogue.persuaded', { npcId: s.npcId, npcRef: s.npcRef, ok });
  const st = ctx.world.slices.npc.npcs[s.npcRef];
  const said = speak(ctx, {
    speaker: s.npcRef,
    slot: ok ? 'react.persuaded' : 'react.unpersuaded',
    vars: varsFor(ctx, s.npcRef),
    mood: st ? moodOf(st, ctx.tick) : undefined,
  });
  if (ok) s.options = s.options.filter((o) => o.id !== PERSUADE_OPTION);
  return { ok, line: said?.text ?? tr('sys.dialogue.intent.fallback') };
}
