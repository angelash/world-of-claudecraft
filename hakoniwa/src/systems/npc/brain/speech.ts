// A named NPC speaks to the player outside a conversation (builtin_ai.md 3.4 openers, 4.3
// role lines, 5.6 reactions, 5.7 transition lines): the line comes from the person's
// fallback chain with the trust band, mood and line history applied, and is only said
// when the player is on the map within earshot; otherwise nothing is said (the caller may
// keep it as an opener for the next conversation, ./unbelief.ts).

import type { SystemContext } from '../../../core/system';
import type { TextParam } from '../../../core/text';
import { addressOf } from '../../dialogue/replies';
import { type Spoken, speak } from '../../dialogue/speak';
import { BARK_RANGE } from '../constants';
import { cardOf, npcEntityId } from '../personas';
import { locationById } from '../places';
import type { NpcState } from '../types';
import { moodOf } from './mood';
import { playerWithin } from './sense';
import { ensureBrain } from './state';

/** The usual fill values of a line to the player. */
export function lineVars(
  ctx: SystemContext,
  st: NpcState,
  extra: Record<string, TextParam | undefined> = {},
): Record<string, TextParam | undefined> {
  return {
    player: addressOf(ctx, st.id),
    place: locationById(ctx.content, st.mapId, st.locId)?.name,
    ...extra,
  };
}

/** Whether the player can hear the person now. */
export function inEarshot(ctx: SystemContext, st: NpcState, range = BARK_RANGE): boolean {
  if (st.gone || st.talking || st.activity === 'sleep') return false;
  return st.mapId === ctx.world.slices.npc.playerMap && !!playerWithin(ctx, st, range);
}

/**
 * Say a line of `slot` to the player when in earshot; the spoken line, or null when the
 * player cannot hear or the chain has nothing. Marks the person's brain as having spoken
 * this tick (a transition voiced now is not kept for later).
 */
export function sayToPlayer(
  ctx: SystemContext,
  st: NpcState,
  slot: string,
  extra: Record<string, TextParam | undefined> = {},
  range = BARK_RANGE,
): Spoken | null {
  if (!inEarshot(ctx, st, range)) return null;
  const card = cardOf(ctx.world.slices.npc, ctx.content, st.id);
  if (!card) return null;
  const line = speak(ctx, {
    speaker: st.id,
    slot,
    vars: lineVars(ctx, st, extra),
    mood: moodOf(st, ctx.tick),
  });
  if (!line) return null;
  ensureBrain(st).spokeTick = ctx.tick;
  ctx.emit('dialogue.line', {
    speakerId: npcEntityId(st.id),
    speakerName: card.name,
    text: line.text,
    listenerId: ctx.world.slices.world.playerId,
    kind: 'say',
  });
  return line;
}
