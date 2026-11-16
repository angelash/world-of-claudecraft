// The open conversation: opening and closing, lines, options, and the NPC's answer
// round trip through the npc.dialogue AI role (rule answer as the fallback; the
// player's free text enters the context as data, never as an instruction).

import { systemSource } from '../../core';
import type { AiContextV1 } from '../../core/ai_port';
import type { AnyCommand } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { joinText, type TextParam, tr } from '../../core/text';
import { beliefView } from '../cognition/queries';
import { holdingsOf } from '../cognition/rumor';
import { rumorText } from '../cognition/rumor_text';
import { knowledgeFor, personaDigest, voiceOf } from '../npc/ai_context';
import { memoryLines } from '../npc/memory';
import { personaById } from '../npc/personas';
import { setConversing, touchConversation } from '../npc/ports';
import { relationBand, relationOf } from '../npc/relations';
import { addressOf, varsFor } from './replies';
import type { DialogueSession, SessionLine, SessionOption } from './types';

export const TALK_RANGE = 2.5;
export const KEEP_RANGE = 4;
export const REPLY_DEADLINE = 60;
const LINE_CAP = 40;

const BUILTIN_IDS = ['chat', 'rumors', 'opinion', 'bye'] as const;

/** The built-in options, as fresh objects for a new session. */
export function builtinOptions(): SessionOption[] {
  return BUILTIN_IDS.map((id) => ({
    id,
    label: tr(`sys.dialogue.option.${id}`),
    system: 'dialogue',
  }));
}

export const BUILTIN_OPTIONS: readonly SessionOption[] = builtinOptions();

export function pushLine(
  ctx: SystemContext,
  s: DialogueSession,
  line: Omit<SessionLine, 'tick'>,
  listenerId?: string,
): void {
  s.lines.push({ ...line, tick: ctx.tick });
  if (s.lines.length > LINE_CAP) s.lines.splice(0, s.lines.length - LINE_CAP);
  s.lastTick = ctx.tick;
  ctx.emit('dialogue.line', { ...line, listenerId });
}

export function npcSays(ctx: SystemContext, s: DialogueSession, text: TextParam): void {
  pushLine(
    ctx,
    s,
    { speakerId: s.npcId, speakerName: s.name, text, kind: 'say' },
    ctx.world.slices.world.playerId,
  );
  touchConversation(ctx, s.npcRef);
}

export function closeSession(ctx: SystemContext, reason: string): void {
  const slice = ctx.world.slices.dialogue;
  const s = slice.session;
  if (!s) return;
  slice.session = null;
  setConversing(ctx, s.npcRef, false);
  ctx.emit('dialogue.closed', { sessionId: s.id, npcId: s.npcId, reason });
}

/** Add options another system offered for this NPC (ids namespaced by system). */
export function addOffered(
  s: DialogueSession,
  system: string,
  options: { id: string; label: TextParam; hint?: TextParam }[],
): void {
  for (const o of options) {
    const id = `${system}:${o.id}`;
    if (s.options.some((x) => x.id === id)) continue;
    s.options.splice(Math.max(0, s.options.length - 1), 0, {
      id,
      label: o.label,
      hint: o.hint,
      system,
    });
  }
}

function beliefSummary(ctx: SystemContext, npcRef: string): TextParam {
  const v = beliefView(ctx.world, ctx.content, npcRef, 'player');
  if (!v) return tr('sys.dialogue.prompt.belief_none');
  const parts: TextParam[] = [tr('sys.dialogue.prompt.belief_identity', { identity: v.identity })];
  if (v.explanation)
    parts.push(tr('sys.dialogue.prompt.belief_explanation', { explanation: v.explanation }));
  parts.push(tr('sys.dialogue.prompt.belief_stance', { stance: v.publicStateName }));
  return tr('sys.dialogue.prompt.belief_summary', { parts: joinText('semicolon', parts) });
}

/**
 * Ask for the NPC's answer: persona NPCs go through the npc.dialogue role with the rule
 * answer as fallback; nameless residents answer by rule directly.
 */
export function requestReply(
  ctx: SystemContext,
  s: DialogueSession,
  purpose: string,
  fallbackText: TextParam,
  situation: TextParam,
  playerText?: string,
): void {
  s.pending = true;
  const data = { sessionId: s.id, npcId: s.npcId, text: fallbackText, revision: s.rev };
  const p = personaById(ctx.content, s.npcRef);
  if (!p) {
    ctx.dispatch('dialogue.reply', data, systemSource('dialogue'));
    return;
  }
  const mind = ctx.world.slices.npc.minds[s.npcRef];
  const vars = varsFor(ctx, s.npcRef);
  const rumors = holdingsOf(ctx.world.slices.cognition, s.npcRef)
    .slice(-3)
    .map((h) =>
      rumorText(ctx.content, h.v, ctx.world.slices.cognition.rumors[h.rumor]?.topic ?? ''),
    );
  const said = playerText ? tr('sys.dialogue.prompt.player_said', { text: playerText }) : '';
  const context: AiContextV1 = {
    v: 1,
    persona: personaDigest(p),
    situation: tr('sys.dialogue.prompt.situation', {
      place: vars.place,
      address: addressOf(ctx, s.npcRef),
      situation,
      said,
    }),
    knowledge: knowledgeFor(ctx.content, p, (k) => ctx.flag(k)),
    memory: [...memoryLines(mind, 3, 'player'), ...memoryLines(mind, 3)],
    goals: p.goals,
    commands: {
      'dialogue.reply': tr('sys.dialogue.prompt.reply_command', {
        session: s.id,
        npc: s.npcId,
        rev: s.rev,
      }),
    },
    speakAs: p.name,
    voice: voiceOf(p),
    extra: {
      belief: beliefSummary(ctx, s.npcRef),
      relation: relationBand(relationOf(ctx.world.slices.npc, s.npcRef, 'player')),
      rumorsKnown: rumors,
      recentLines: s.lines
        .slice(-6)
        .map((l) => tr('sys.dialogue.prompt.recent_line', { who: l.speakerName, text: l.text })),
      suggested: fallbackText,
    },
  };
  const fallback: AnyCommand[] = [
    { kind: 'dialogue.reply', data, source: systemSource('dialogue') },
  ];
  ctx.ai.request({
    agentId: s.npcRef,
    role: 'npc.dialogue',
    purpose,
    revision: s.rev,
    context,
    allowed: ['dialogue.reply'],
    fallback,
    deadlineTicks: REPLY_DEADLINE,
    priority: 5,
  });
}
