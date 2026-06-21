import type { Entity } from '../../src/sim/types';
import type { AiDecisionV1, AiJobContextV1, AiSpeech } from './ai_types';

const QUEST_DYNAMIC_TEXT_BLOCKLIST = [
  'quest complete',
  'task complete',
  'you completed',
  'you have completed',
  'you failed',
  'reward you',
  'i reward',
  'you receive',
  'you gain',
  'xp',
  'experience points',
  'gold',
  'silver',
  'copper',
  'reputation',
  'system message',
  'quest log updated',
  'the real traitor is',
  'must kill',
] as const;

export type CanonGuardSubject =
  | 'criticalQuestNpc'
  | 'criticalQuestMob'
  | 'criticalQuestObject'
  | 'dungeonGate'
  | 'questRewardSource'
  | 'ordinary';

export interface CanonGuardResult {
  ok: boolean;
  reason?: string;
}

export function classifyCanonSubject(entity: Entity): CanonGuardSubject {
  if (entity.kind === 'npc' && entity.questIds.length > 0) return 'criticalQuestNpc';
  if (entity.kind === 'mob' && entity.questIds.length > 0) return 'criticalQuestMob';
  if (entity.kind === 'object') {
    if (entity.dungeonId || entity.templateId === 'dungeon_door' || entity.templateId === 'dungeon_exit') return 'dungeonGate';
    if (entity.questIds.length > 0 || entity.objectItemId !== null) return 'criticalQuestObject';
  }
  return 'ordinary';
}

export function dynamicTextViolatesQuestGuard(text: string): boolean {
  const normalized = text.toLowerCase();
  return QUEST_DYNAMIC_TEXT_BLOCKLIST.some((phrase) => normalized.includes(phrase));
}

export function validateCanonSpeech(speech: AiSpeech): CanonGuardResult {
  if (speech.mode !== 'dynamicText') return { ok: true };
  if (dynamicTextViolatesQuestGuard(speech.text)) {
    return { ok: false, reason: 'dynamic text uses task, reward, or spoiler language' };
  }
  return { ok: true };
}

export function validateCanonDecision(
  decision: AiDecisionV1,
  context: AiJobContextV1,
  subject: CanonGuardSubject,
): CanonGuardResult {
  if (context.questFacts.some((fact) => fact.visibility !== 'knownToPlayer' && fact.visibility !== 'currentObjective' && fact.visibility !== 'nearbyClue' && fact.visibility !== 'rumored')) {
    return { ok: false, reason: 'quest fact visibility is not allowed in AI context' };
  }
  for (const speech of decision.speech) {
    const speechResult = validateCanonSpeech(speech);
    if (!speechResult.ok) return speechResult;
  }
  if (subject === 'criticalQuestNpc') {
    const blockedIntent = decision.intents.find((intent) => intent.type !== 'lookAt'
      && intent.type !== 'faceEntity'
      && intent.type !== 'emote'
      && intent.type !== 'pause'
      && intent.type !== 'commentOnScene'
      && intent.type !== 'showGossipOptions'
      && intent.type !== 'questHint');
    if (blockedIntent) return { ok: false, reason: `intent ${blockedIntent.type} is blocked for critical quest NPCs` };
  }
  return { ok: true };
}
