import type { Entity } from '../../src/sim/types';
import type { AiDecisionV1, AiJobContextV1, AiSpeech } from './ai_types';

const QUEST_DYNAMIC_TEXT_BLOCKLIST = [
  'quest complete',
  'task complete',
  'you completed',
  'you have completed',
  'you failed',
  'quest failed',
  'mission complete',
  'objective complete',
  'go kill ',
  'must collect',
  'reward you',
  'i reward',
  'i will reward',
  'free reward',
  'you receive',
  'you gain',
  'you earned',
  'xp',
  'experience points',
  'gold',
  'silver',
  'copper',
  'reputation',
  'system message',
  'system notice',
  'quest log updated',
  'the real traitor is',
  'must kill',
  '任务完成',
  '任务失败',
  '你完成了',
  '你已经完成',
  '你失败了',
  '奖励你',
  '我奖励',
  '你获得',
  '你得到了',
  '经验',
  '金币',
  '银币',
  '铜币',
  '声望',
  '系统提示',
  '任务日志更新',
  '真正的叛徒',
  '必须杀',
] as const;

export type CanonGuardSubject =
  | 'criticalQuestNpc'
  | 'criticalQuestMob'
  | 'criticalQuestObject'
  | 'dungeonGate'
  | 'questRewardSource'
  | 'ordinary';

type GuardedIntentSet = ReadonlySet<AiDecisionV1['intents'][number]['type']>;

const CRITICAL_QUEST_NPC_INTENTS: GuardedIntentSet = new Set([
  'lookAt',
  'faceEntity',
  'emote',
  'pause',
  'commentOnScene',
  'showGossipOptions',
  'questHint',
]);

const CRITICAL_QUEST_MOB_INTENTS: GuardedIntentSet = new Set([
  'lookAt',
  'faceEntity',
  'emote',
  'pause',
  'commentOnScene',
]);

const CRITICAL_QUEST_OBJECT_INTENTS: GuardedIntentSet = new Set([
  'lookAt',
  'pause',
  'commentOnScene',
  'inspectObject',
]);

const DUNGEON_GATE_INTENTS: GuardedIntentSet = new Set([
  'lookAt',
  'pause',
  'commentOnScene',
  'inspectObject',
]);

const QUEST_REWARD_SOURCE_INTENTS: GuardedIntentSet = new Set([
  'lookAt',
  'faceEntity',
  'emote',
  'pause',
  'commentOnScene',
  'showGossipOptions',
]);

export interface CanonGuardResult {
  ok: boolean;
  reason?: string;
}

export function classifyCanonSubject(entity: Entity): CanonGuardSubject {
  if (entity.kind === 'npc' && entity.questIds.length > 0) return 'criticalQuestNpc';
  if (entity.kind === 'npc' && entity.vendorItems.length > 0) return 'questRewardSource';
  if (entity.kind === 'mob' && entity.questIds.length > 0) return 'criticalQuestMob';
  if (entity.kind === 'object') {
    if (entity.dungeonId || entity.templateId === 'dungeon_door' || entity.templateId === 'dungeon_exit') return 'dungeonGate';
    if (entity.questIds.length > 0 || entity.objectItemId !== null) return 'criticalQuestObject';
  }
  return 'ordinary';
}

export function dynamicTextViolatesQuestGuard(text: string): boolean {
  const normalized = text.toLowerCase();
  return QUEST_DYNAMIC_TEXT_BLOCKLIST.some((phrase) => normalized.includes(phrase))
    || /https?:\/\//i.test(text)
    || /<[^>]+>/.test(text)
    || /\[[^\]]+\]\([^)]+\)/.test(text);
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
  const blockedIntent = blockedIntentForSubject(decision, subject);
  if (blockedIntent) {
    return { ok: false, reason: `intent ${blockedIntent.type} is blocked for ${subject}` };
  }
  const questHint = decision.intents.find((intent) => intent.type === 'questHint');
  if (questHint && context.questFacts.length === 0) return { ok: false, reason: 'quest hint requires a visible quest fact' };
  return { ok: true };
}

function blockedIntentForSubject(
  decision: AiDecisionV1,
  subject: CanonGuardSubject,
): AiDecisionV1['intents'][number] | null {
  const allowed = allowedIntentsForSubject(subject);
  if (!allowed) return null;
  return decision.intents.find((intent) => !allowed.has(intent.type)) ?? null;
}

function allowedIntentsForSubject(subject: CanonGuardSubject): GuardedIntentSet | null {
  switch (subject) {
    case 'criticalQuestNpc': return CRITICAL_QUEST_NPC_INTENTS;
    case 'criticalQuestMob': return CRITICAL_QUEST_MOB_INTENTS;
    case 'criticalQuestObject': return CRITICAL_QUEST_OBJECT_INTENTS;
    case 'dungeonGate': return DUNGEON_GATE_INTENTS;
    case 'questRewardSource': return QUEST_REWARD_SOURCE_INTENTS;
    case 'ordinary': return null;
  }
}
