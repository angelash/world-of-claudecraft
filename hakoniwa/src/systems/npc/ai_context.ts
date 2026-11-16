// AiContextV1 projections for the NPC roles (implementation_conventions.md 7): persona
// digest with the three isolation sentences, knowledge filtered by tier and flags,
// memory lines and the voice. Systems never write prompt text beyond these fields.

import type { AiContextV1 } from '../../core/ai_port';
import type { ContentMap, FlagValue } from '../../core/contracts';
import { joinText, type KeyText, type TextParam, tr } from '../../core/text';
import { memoryLines } from './memory';
import type { KnowledgeTier, Mind, Needs, PersonaCard } from './types';

const TIER_ORDER: KnowledgeTier[] = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];

/** Three sentences every persona prompt carries (npc_society_ai.md 2.2). */
export const ISOLATION_NOTE: KeyText = tr('sys.npc.prompt.isolation');

/** The persona card as prompt lines: text keys around the card's own (content) values. */
export function personaDigest(p: PersonaCard): KeyText {
  const lines: TextParam[] = [
    tr('sys.npc.prompt.persona_intro', {
      name: p.name,
      age: p.age,
      race: p.race,
      job: p.job,
      intro: p.intro,
    }),
    tr('sys.npc.prompt.persona_traits', { traits: joinText('list', p.traits) }),
    tr('sys.npc.prompt.persona_goals', { goals: joinText('semicolon', p.goals) }),
  ];
  if (p.secrets.length > 0)
    lines.push(tr('sys.npc.prompt.persona_secrets', { secrets: joinText('semicolon', p.secrets) }));
  lines.push(tr('sys.npc.prompt.isolation'), tr('sys.npc.prompt.ash_terms'));
  return joinText('newline', lines);
}

/** Knowledge entries the persona may speak about. */
export function knowledgeFor(
  content: Pick<ContentMap, 'npcKnowledge'>,
  p: PersonaCard,
  flag: (k: string) => FlagValue | undefined,
): string[] {
  const max = TIER_ORDER.indexOf(p.knowledge);
  const out: string[] = [];
  for (const k of content.npcKnowledge ?? []) {
    if (TIER_ORDER.indexOf(k.tier) > max) continue;
    if (k.maps && !k.maps.includes(p.map)) continue;
    if (k.factions && !k.factions.includes(p.faction)) continue;
    if (k.requiresFlags?.some((f) => !flag(f))) continue;
    out.push(k.text);
  }
  out.push(...(p.knowledgeNotes ?? []));
  return out;
}

export function needBand(v: number): KeyText {
  if (v >= 70) return tr('sys.npc.need.full');
  if (v >= 45) return tr('sys.npc.need.fine');
  if (v >= 25) return tr('sys.npc.need.low');
  return tr('sys.npc.need.dire');
}

export function needsText(needs: Needs, moneyNeed: number): KeyText {
  return tr('sys.npc.prompt.needs', {
    hunger: needBand(needs.hunger),
    energy: needBand(needs.energy),
    social: needBand(needs.social),
    faith: needBand(needs.faith),
    money: needBand(moneyNeed),
  });
}

export function voiceOf(p: PersonaCard): TextParam[] {
  const v: TextParam[] = [
    ...p.voice.rules,
    tr('sys.npc.prompt.voice_catchphrases', { list: joinText('list', p.voice.catchphrases) }),
  ];
  if (p.voice.never?.length)
    v.push(tr('sys.npc.prompt.voice_never', { list: joinText('semicolon', p.voice.never) }));
  return v;
}

export function baseContext(
  content: Pick<ContentMap, 'npcKnowledge'>,
  p: PersonaCard,
  mind: Mind | undefined,
  flag: (k: string) => FlagValue | undefined,
  situation: TextParam,
  commands: Record<string, TextParam>,
  extra?: unknown,
): AiContextV1 {
  return {
    v: 1,
    persona: personaDigest(p),
    situation,
    knowledge: knowledgeFor(content, p, flag),
    memory: memoryLines(mind, 6),
    goals: p.goals,
    commands,
    speakAs: p.name,
    voice: voiceOf(p),
    extra,
  };
}
