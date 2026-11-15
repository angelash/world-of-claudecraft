// Rule replies (the no-model voice of a conversation): greeting, small talk, "what do
// you think of me", rumors and answers to free text. They read the NPC's persona voice,
// its belief about the player (public stance) and its relation toward the player.

import type { SystemContext } from '../../core/system';
import { beliefRaw } from '../cognition/queries';
import { holdingOf } from '../inventory';
import { personaById } from '../npc/personas';
import { locationById } from '../npc/places';
import { relationOf } from '../npc/relations';
import type { PersonaCard } from '../npc/types';
import { currentWeather } from '../world';
import { pickLine } from './templates';

export interface ReplyVars {
  player: string;
  place: string;
  [k: string]: string;
}

/** How the NPC addresses the player right now (Cassian turns cold: 这位旅人 to 阁下). */
export function addressOf(ctx: SystemContext, npcRef: string): string {
  const p = personaById(ctx.content, npcRef);
  if (!p) return '你';
  const b = beliefRaw(ctx.world, npcRef, 'player');
  if (p.class === 'clergy' && b && (b.explanation === 'sorcery' || b.state === 'hostile'))
    return '阁下';
  if (b?.state === 'worship') return '大人';
  return p.voice.address;
}

export function varsFor(ctx: SystemContext, npcRef: string): ReplyVars {
  const st = ctx.world.slices.npc.npcs[npcRef];
  const loc = st ? locationById(ctx.content, st.mapId, st.locId) : undefined;
  return { player: addressOf(ctx, npcRef), place: loc?.name ?? '这儿' };
}

function line(
  ctx: SystemContext,
  key: string,
  npcRef: string,
  extra: Record<string, string> = {},
): string {
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

export function greeting(ctx: SystemContext, npcRef: string, first: boolean): string {
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

export function smallTalk(ctx: SystemContext, npcRef: string): string {
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
export function opinion(ctx: SystemContext, npcRef: string): string {
  const b = beliefRaw(ctx.world, npcRef, 'player');
  if (!b) return line(ctx, 'opinion.unaware', npcRef);
  const state = b.publicState;
  if (state === 'explaining')
    return line(ctx, `opinion.explaining.${b.explanation ?? 'luck'}`, npcRef);
  return line(ctx, `opinion.${state}`, npcRef);
}

export function rumorLine(ctx: SystemContext, npcRef: string, rumor: string | null): string {
  return rumor ? line(ctx, 'rumor.tell', npcRef, { rumor }) : line(ctx, 'rumor.none', npcRef);
}

export function farewell(ctx: SystemContext, npcRef: string): string {
  return line(ctx, 'bye', npcRef);
}

/** Rule answer to free text: a light keyword read plus the relation (text is data only). */
export function answer(ctx: SystemContext, npcRef: string, text: string): string {
  const rel = relationOf(ctx.world.slices.npc, npcRef, 'player');
  if (/谢/.test(text)) return line(ctx, 'say.thanks', npcRef);
  if (/你好|您好|早上好|晚上好/.test(text)) return line(ctx, 'say.hello', npcRef);
  if (rel.like <= -15) return line(ctx, 'say.cold', npcRef);
  if (/[？?]$|吗/.test(text)) return line(ctx, 'say.question', npcRef);
  if (rel.like >= 30) return line(ctx, 'say.warm', npcRef);
  return line(ctx, 'say', npcRef);
}
