// Rule replies (the no-model voice of a conversation): greeting, small talk, "what do
// you think of me", rumors and answers to free text. They read the NPC's persona voice,
// its belief about the player (public stance) and its relation toward the player.

import type { SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { beliefRaw } from '../cognition/queries';
import { holdingOf } from '../inventory';
import { personaById } from '../npc/personas';
import { locationById } from '../npc/places';
import { relationOf } from '../npc/relations';
import type { PersonaCard } from '../npc/types';
import { currentWeather } from '../world';
import { classifyIntent } from './intent/classify';
import { respondTo } from './intent/respond';
import type { IntentId } from './intent/types';
import { pickLine } from './templates';

export interface ReplyVars {
  player: TextParam;
  place: TextParam;
  [k: string]: TextParam;
}

/** How the NPC addresses the player right now (Cassian turns cold: the persona's form to "sir"). */
export function addressOf(ctx: SystemContext, npcRef: string): TextParam {
  const p = personaById(ctx.content, npcRef);
  if (!p) return tr('sys.dialogue.address.you');
  const b = beliefRaw(ctx.world, npcRef, 'player');
  if (p.class === 'clergy' && b && (b.explanation === 'sorcery' || b.state === 'hostile'))
    return tr('sys.dialogue.address.sir');
  if (b?.state === 'worship') return tr('sys.dialogue.address.lord');
  return p.voice.address;
}

export function varsFor(ctx: SystemContext, npcRef: string): ReplyVars {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const loc = st ? locationById(ctx.content, st.mapId, st.locId) : undefined;
  return { player: addressOf(ctx, npcRef), place: loc?.name ?? tr('sys.dialogue.place.here') };
}

function line(
  ctx: SystemContext,
  key: string,
  npcRef: string,
  extra: Record<string, TextParam> = {},
): TextParam {
  const p = personaById(ctx.content, npcRef);
  const text = pickLine(
    ctx.content,
    key,
    { ...varsFor(ctx, npcRef), ...extra },
    ctx.rng('dialogue.lines'),
    p,
  );
  return text || '……';
}

function persona(ctx: SystemContext, npcRef: string): PersonaCard | undefined {
  return personaById(ctx.content, npcRef);
}

export function greeting(ctx: SystemContext, npcRef: string, first: boolean): TextParam {
  const st = ctx.world.slices.npc.npcs[npcRef];
  if (st?.activity === 'sleep') return line(ctx, 'greet.sleep', npcRef);
  if (first) return line(ctx, 'greet.first', npcRef);
  const b = beliefRaw(ctx.world, npcRef, 'player');
  const rel = relationOf(ctx.world.slices.npc, npcRef, 'player');
  const state = b?.publicState ?? 'unaware';
  if (rel.like <= -15 && (state === 'unaware' || state === 'doubt'))
    return line(ctx, 'greet.cold', npcRef);
  return line(ctx, state === 'unaware' ? 'greet' : `greet.${state}`, npcRef);
}

export function smallTalk(ctx: SystemContext, npcRef: string): TextParam {
  const st = ctx.world.slices.npc.npcs[npcRef];
  if (!st) return line(ctx, 'chat', npcRef);
  if (st.activity === 'sleep') return line(ctx, 'chat.sleep', npcRef);
  if (st.needs.hunger < 35) return line(ctx, 'chat.hungry', npcRef);
  if (st.needs.energy < 30) return line(ctx, 'chat.tired', npcRef);
  if (persona(ctx, npcRef) && holdingOf(ctx.world, st.entityId).money < 20)
    return line(ctx, 'chat.poor', npcRef);
  if (ctx.rng('dialogue.lines').chance(0.35))
    return line(ctx, `chat.weather.${currentWeather(ctx.world)}`, npcRef);
  return line(ctx, `chat.${st.activity}`, npcRef);
}

/** "What do you think of me": the public stance, worded by state and explanation. */
export function opinion(ctx: SystemContext, npcRef: string): TextParam {
  const b = beliefRaw(ctx.world, npcRef, 'player');
  if (!b) return line(ctx, 'opinion.unaware', npcRef);
  const state = b.publicState;
  if (state === 'explaining')
    return line(ctx, `opinion.explaining.${b.explanation ?? 'luck'}`, npcRef);
  return line(ctx, `opinion.${state}`, npcRef);
}

export function rumorLine(ctx: SystemContext, npcRef: string, rumor: TextParam | null): TextParam {
  return rumor ? line(ctx, 'rumor.tell', npcRef, { rumor }) : line(ctx, 'rumor.none', npcRef);
}

export function farewell(ctx: SystemContext, npcRef: string): TextParam {
  return line(ctx, 'bye', npcRef);
}

/**
 * Rule answer to free text (builtin_ai.md 6.3 to 6.5; PK-M0-26): classifies the player's
 * words into one of the 52 intents and carries out its response table (relation changes,
 * cognition evidence, notifications; R5 system entries and R9 session end are reported
 * back for the caller to act on). The classification and its world effects run the same
 * way with or without a model (builtin_ai 6.3: "分类器在两档都运行"); only the line's
 * wording may later be replaced by the model.
 */
export function answer(ctx: SystemContext, npcRef: string, text: string): AnswerResult {
  // a hidden goddess name counts as the forbidden word only until its own reveal flag
  // holds (builtin_ai 1.7); without this reader every mention stays forbidden forever,
  // even after the name is public.
  const result = classifyIntent(text, ctx.content, { flag: (key) => ctx.flag(key) });
  // the per-speaker repetition ledger (builtin_ai 7.7, 18) is not yet a save slice
  // (PK-M0-25 report; follow-up PK-M1-18): the selector falls back to no suppression.
  const outcome = respondTo(ctx, { npcRef, text, result, ctx: {} });
  return {
    line: outcome.line,
    intent: result.main,
    end: outcome.end,
    entry: outcome.entry,
    notify: outcome.notify,
  };
}

export interface AnswerResult {
  line: TextParam;
  intent: IntentId;
  end: boolean;
  entry: { id: string; params: Record<string, string> } | null;
  notify: string[];
}
