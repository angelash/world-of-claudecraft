// AiContextV1 projections for the NPC roles (implementation_conventions.md 7): persona
// digest with the three isolation sentences, knowledge filtered by tier and flags,
// memory lines and the voice. Systems never write prompt text beyond these fields.

import type { AiContextV1 } from '../../core/ai_port';
import type { ContentMap, FlagValue } from '../../core/contracts';
import { memoryLines } from './memory';
import type { KnowledgeTier, Mind, Needs, PersonaCard } from './types';

const TIER_ORDER: KnowledgeTier[] = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];

/** Three sentences every persona prompt carries (npc_society_ai.md 2.2). */
export const ISOLATION_NOTE =
  '背景是来到此地之前的自述，不是此地发生过的事；开局处境是本人此刻真实的处境，已经发生；职业只是背景，不自动拥有资源、职位、收入或专属权限。';

export function personaDigest(p: PersonaCard): string {
  const secrets =
    p.secrets.length > 0
      ? `你的秘密（只属于你，绝不对任何人说出，只影响你的言行）：${p.secrets.join('；')}。`
      : '';
  return [
    `你是${p.name}，${p.age} 岁，${p.race}，${p.job}。${p.intro}`,
    `性格：${p.traits.join('、')}。`,
    `目标：${p.goals.join('；')}。`,
    secrets,
    ISOLATION_NOTE,
    '凡人把那种灰色的东西叫"灰气"，病叫"灰病"，结晶叫"灰晶"；你也这么叫。',
  ]
    .filter((s) => s)
    .join('\n');
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

export function needBand(v: number): string {
  if (v >= 70) return '充足';
  if (v >= 45) return '还行';
  if (v >= 25) return '有点缺';
  return '很缺';
}

export function needsText(needs: Needs, moneyNeed: number): string {
  return `饱腹${needBand(needs.hunger)}，精力${needBand(needs.energy)}，想找人说话的程度${needBand(
    needs.social,
  )}（越缺越想），信仰上的安心${needBand(needs.faith)}，手头${needBand(moneyNeed)}`;
}

export function voiceOf(p: PersonaCard): string[] {
  const v = [...p.voice.rules, `口头禅：${p.voice.catchphrases.join('、')}`];
  if (p.voice.never?.length) v.push(`绝不会：${p.voice.never.join('；')}`);
  return v;
}

export function baseContext(
  content: Pick<ContentMap, 'npcKnowledge'>,
  p: PersonaCard,
  mind: Mind | undefined,
  flag: (k: string) => FlagValue | undefined,
  situation: string,
  commands: Record<string, string>,
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
