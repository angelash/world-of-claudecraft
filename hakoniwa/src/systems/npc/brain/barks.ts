// Barks (builtin_ai.md 7.6 and 5.3 "心声气泡"): what a named NPC says to nobody in
// particular. The context goes situation first, then a mood that colours speech (fear,
// anger, worry, weariness), the outdoor weather, the activity, the time of day; one bark
// per speaker and context per two game hours, the same line not again within three game
// days nor at the same place within two game hours (the dialogue slice keeps both). Only
// heard on the player's map within earshot.

import type { SystemContext } from '../../../core/system';
import { calendarAt } from '../../../core/time';
import { speak } from '../../dialogue/speak';
import { currentWeather } from '../../world';
import { BARK_RANGE, BARK_WINDOW, HOLY_WEEKDAY, MARKET_WEEKDAY } from '../constants';
import { cardOf, npcEntityId } from '../personas';
import { locationById } from '../places';
import type { NpcState } from '../types';
import { MOOD_BARK, moodOf } from './mood';
import { playerWithin } from './sense';
import { ensureBrain } from './state';

const OUTDOOR_KINDS = new Set([
  'plaza',
  'safe',
  'market',
  'well',
  'creek',
  'field',
  'gate',
  'camp',
]);

/** The bark context of a person now (builtin_ai.md 7.6 order), `situation` first when given. */
export function barkContext(ctx: SystemContext, st: NpcState, situation?: string): string {
  if (situation) return situation;
  const loc = locationById(ctx.content, st.mapId, st.locId);
  // the day's kind is a situation at its own places (the service, the market)
  const weekday = calendarAt(ctx.tick).weekday;
  if (weekday === MARKET_WEEKDAY && loc?.kind === 'market') return 'market_day';
  if (weekday === HOLY_WEEKDAY && loc?.kind === 'church') return 'holy_day';
  const mood = moodOf(st, ctx.tick);
  const coloured = MOOD_BARK[mood];
  if (coloured) return coloured;
  const weather = currentWeather(ctx.world);
  if (loc && OUTDOOR_KINDS.has(loc.kind) && weather !== 'clear' && weather !== 'cloudy')
    return weather;
  return st.activity;
}

/**
 * Say a bark if the player can hear it; returns true when a line was said. The windows
 * apply even when nobody hears (the speaker still "said" nothing then: no window is used).
 */
export function bark(ctx: SystemContext, st: NpcState, situation?: string): boolean {
  // nameless residents bark from the crowd pools (bark_ packs), not from a brain
  if (st.resident || st.gone || st.talking || st.activity === 'sleep') return false;
  const slice = ctx.world.slices.npc;
  if (st.mapId !== slice.playerMap || !playerWithin(ctx, st, BARK_RANGE)) return false;
  const brain = ensureBrain(st);
  const context = barkContext(ctx, st, situation);
  const last = brain.barked[context];
  if (last !== undefined && ctx.tick - last < BARK_WINDOW) return false;
  const card = cardOf(slice, ctx.content, st.id);
  if (!card) return false;
  const line = speak(ctx, {
    speaker: st.id,
    slot: `bark.${context}`,
    ledger: 'bark',
    mood: moodOf(st, ctx.tick),
    vars: { place: locationById(ctx.content, st.mapId, st.locId)?.name },
  });
  if (!line) return false;
  brain.barked[context] = ctx.tick;
  for (const [k, t] of Object.entries(brain.barked))
    if (ctx.tick - t >= BARK_WINDOW) delete brain.barked[k];
  ctx.emit('dialogue.line', {
    speakerId: npcEntityId(st.id),
    speakerName: card.name,
    text: line.text,
    kind: 'say',
  });
  ctx.emit('npc.barked', { npcId: st.id, context, mapId: st.mapId });
  return true;
}
