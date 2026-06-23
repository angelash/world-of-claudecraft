import type { Entity, SimEvent } from '../../src/sim/types';
import type {
  AiDecisionV1,
  AiIntent,
  AiJobContextV1,
  AiSpeechFingerprintSource,
  AiSpeechPolishSnapshot,
  AiValidationResult,
} from './ai_types';
import { validateCanonDecision } from './canon_guard';
import type { CanonGuardSubject } from './canon_guard';
import { profileFor } from './profiles';
import { polishDynamicSpeech } from './speech_style';

const MAX_TTL_MS = 60_000;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const MAX_DYNAMIC_TEXT_CHARS = 180;
type AiSpeechSource = Extract<SimEvent, { type: 'aiSpeech' }>['source'];
type AiSpeechReaction = NonNullable<Extract<SimEvent, { type: 'aiSpeech' }>['reaction']>;

export interface AiIntentValidationInput {
  decision: AiDecisionV1;
  context: AiJobContextV1;
  entity: Entity;
  subject: CanonGuardSubject;
  source: AiSpeechSource;
}

export function validateAiDecision(input: AiIntentValidationInput): AiValidationResult {
  const { decision, context, entity, subject, source } = input;
  if (decision.schemaVersion !== 1) return rejected('schema version mismatch');
  if (decision.jobId !== context.jobId) return rejected('job id mismatch');
  if (decision.ttlMs <= 0 || decision.ttlMs > MAX_TTL_MS) return rejected('ttl out of range');
  if (decision.confidence < MIN_CONFIDENCE || decision.confidence > MAX_CONFIDENCE) return rejected('confidence out of range');
  if (decision.entityRef.entityId !== context.entity.entityId
    || decision.entityRef.templateId !== context.entity.templateId
    || decision.entityRef.kind !== context.entity.kind) {
    return rejected('entity ref mismatch');
  }

  const profile = profileFor(context.entity.kind, context.entity.templateId);
  for (const intent of decision.intents) {
    if (!context.allowedIntents.includes(intent.type)) return rejected(`intent ${intent.type} not allowed by context`);
    if (!profile.allowedIntentTypes.includes(intent.type)) return rejected(`intent ${intent.type} not allowed by profile`);
    if (intent.lineId && !profile.allowedLineIds.includes(intent.lineId)) return rejected(`line id ${intent.lineId} not allowed by profile`);
  }

  const canon = validateCanonDecision(decision, context, subject);
  if (!canon.ok) return rejected(canon.reason ?? 'canon guard rejected decision');
  const intentReaction = reactionFromProviderIntents(decision.intents, context);
  if (!intentReaction.ok) return rejected(intentReaction.reason);

  const events: SimEvent[] = [];
  const speechFingerprintSource = speechFingerprintSourceForContext(context);
  const speechFingerprint = context.entity.kind === 'mob'
    ? context.familySemantics?.speechFingerprint ?? context.profile?.speechFingerprint
    : context.profile?.speechFingerprint ?? context.familySemantics?.speechFingerprint;
  const speechPolish = emptySpeechPolishSnapshot(speechFingerprintSource);
  for (const speech of decision.speech) {
    if (speech.mode === 'lineId') {
      if (!profile.allowedLineIds.includes(speech.lineId)) return rejected(`line id ${speech.lineId} not allowed by profile`);
      if (context.allowedLineIds && !context.allowedLineIds.includes(speech.lineId)) return rejected(`line id ${speech.lineId} not allowed by context`);
      events.push({
        type: 'aiSpeech',
        speakerId: entity.id,
        speakerName: entity.name,
        speech,
        source,
        ...(intentReaction.reaction ? { reaction: intentReaction.reaction } : {}),
        pid: context.player.entityId,
      });
      continue;
    }
    if (context.outputMode === 'line_id_only') return rejected('dynamic speech is blocked in line_id_only mode');
    if (speech.language !== context.locale) return rejected('dynamic speech language does not match player locale');
    const polish = polishDynamicSpeech(speech.text, context.locale, speechFingerprint);
    speechPolish.processed++;
    speechPolish.lastChanged = polish.changed;
    speechPolish.lastLocale = context.locale;
    speechPolish.lastBefore = polish.before;
    speechPolish.lastAfter = polish.text;
    speechPolish.lastBeforeChars = polish.beforeChars;
    speechPolish.lastAfterChars = polish.afterChars;
    speechPolish.charsTrimmed += polish.charsTrimmed;
    if (polish.changed) speechPolish.changed++;
    const polishedText = polish.text;
    if (polishedText.length === 0 || polishedText.length > MAX_DYNAMIC_TEXT_CHARS) {
      return rejected('dynamic speech length out of range', speechPolish);
    }
    if (isLowInformationDynamicSpeech(polishedText, context.locale)) {
      return rejected('dynamic speech too thin', speechPolish);
    }
    events.push({
      type: 'aiSpeech',
      speakerId: entity.id,
      speakerName: entity.name,
      speech: { ...speech, text: polishedText },
      source,
      ...(intentReaction.reaction ? { reaction: intentReaction.reaction } : {}),
      pid: context.player.entityId,
    });
  }
  return {
    ok: true,
    events,
    ...(speechPolish.processed > 0 ? { speechPolish } : {}),
  };
}

function reactionFromProviderIntents(
  intents: readonly AiIntent[],
  context: AiJobContextV1,
): { ok: true; reaction?: AiSpeechReaction } | { ok: false; reason: string } {
  for (const intent of intents) {
    const kind = reactionKindForIntent(intent.type);
    if (!kind) continue;
    const target = validateIntentTargets(intent, context);
    if (!target.ok) return target;
    if (!target.hasTarget) continue;
    return {
      ok: true,
      reaction: {
        kind,
        ...(target.targetEntityId === undefined ? {} : { targetEntityId: target.targetEntityId }),
        ...(target.targetObjectId === undefined ? {} : { targetObjectId: target.targetObjectId }),
        ...(target.targetItemId === undefined ? {} : { targetItemId: target.targetItemId }),
      },
    };
  }
  return { ok: true };
}

function reactionKindForIntent(intent: AiIntent['type']): AiSpeechReaction['kind'] | null {
  switch (intent) {
    case 'approachObject': return 'approach';
    case 'avoidObject':
    case 'seekShelter':
      return 'avoid';
    case 'lookAt':
    case 'faceEntity':
    case 'inspectObject':
    case 'commentOnScene':
    case 'pause':
      return 'inspect';
    default:
      return null;
  }
}

function validateIntentTargets(
  intent: AiIntent,
  context: AiJobContextV1,
): { ok: true; hasTarget: boolean; targetEntityId?: number; targetObjectId?: number; targetItemId?: string } | { ok: false; reason: string } {
  const visibleEntityIds = visibleIntentEntityIds(context);
  const visibleObjectEntityIds = visibleIntentObjectEntityIds(context);
  const visibleItemIds = visibleIntentItemIds(context);
  const targetEntityId = intent.targetEntityId;
  const targetObjectId = intent.targetObjectId;
  const targetItemId = intent.targetItemId;
  if (targetEntityId !== undefined && (!Number.isInteger(targetEntityId) || !visibleEntityIds.has(targetEntityId))) {
    return { ok: false, reason: 'intent targetEntityId is not visible in context' };
  }
  if (targetObjectId !== undefined && (!Number.isInteger(targetObjectId) || !visibleObjectEntityIds.has(targetObjectId))) {
    return { ok: false, reason: 'intent targetObjectId is not visible in context' };
  }
  if (targetItemId !== undefined && !visibleItemIds.has(targetItemId)) {
    return { ok: false, reason: 'intent targetItemId is not visible in context' };
  }
  return {
    ok: true,
    hasTarget: targetEntityId !== undefined || targetObjectId !== undefined || targetItemId !== undefined,
    ...(targetEntityId === undefined ? {} : { targetEntityId }),
    ...(targetObjectId === undefined ? {} : { targetObjectId }),
    ...(targetItemId === undefined ? {} : { targetItemId }),
  };
}

function visibleIntentEntityIds(context: AiJobContextV1): Set<number> {
  return new Set([
    context.player.entityId,
    context.entity.entityId,
    ...(context.scene?.companions.map((companion) => companion.entityId) ?? []),
    ...(context.scene?.nearbySemanticObjects.flatMap((object) => object.entityId === null ? [] : [object.entityId]) ?? []),
  ]);
}

function visibleIntentObjectEntityIds(context: AiJobContextV1): Set<number> {
  return new Set(context.scene?.nearbySemanticObjects.flatMap((object) => object.entityId === null ? [] : [object.entityId]) ?? []);
}

function visibleIntentItemIds(context: AiJobContextV1): Set<string> {
  return new Set([
    ...(context.scene?.droppedItems.map((item) => item.itemId) ?? []),
    ...(context.scene?.nearbySemanticObjects.map((object) => object.objectId) ?? []),
  ]);
}

function rejected(reason: string, speechPolish?: AiSpeechPolishSnapshot): AiValidationResult {
  return {
    ok: false,
    events: [],
    reason,
    ...(speechPolish && speechPolish.processed > 0 ? { speechPolish } : {}),
  };
}

function speechFingerprintSourceForContext(context: AiJobContextV1): AiSpeechFingerprintSource {
  if (context.entity.kind === 'mob') {
    if (context.familySemantics?.speechFingerprint) return 'family';
    if (context.profile?.speechFingerprint) return 'profile';
    return 'none';
  }
  if (context.profile?.speechFingerprint) return 'profile';
  if (context.familySemantics?.speechFingerprint) return 'family';
  return 'none';
}

function emptySpeechPolishSnapshot(source: AiSpeechFingerprintSource): AiSpeechPolishSnapshot {
  return {
    processed: 0,
    changed: 0,
    charsTrimmed: 0,
    lastChanged: false,
    lastFingerprintSource: source,
    lastBeforeChars: 0,
    lastAfterChars: 0,
  };
}

function isLowInformationDynamicSpeech(text: string, locale: string): boolean {
  const normalized = text.trim().replace(/\s+/g, ' ');
  if (!normalized) return true;
  if (locale === 'zh_CN' || locale === 'zh_TW' || locale.toLowerCase().startsWith('zh')) {
    const compact = normalized.replace(/[，,。.!！?？、\s]/g, '');
    return compact.length <= 4 && /[?？]$/.test(normalized);
  }
  if (locale === 'en' || locale === 'en_CA' || locale.toLowerCase().startsWith('en')) {
    const lower = normalized.toLowerCase();
    const words = lower.replace(/[^a-z0-9'?\s]/g, '').split(/\s+/).filter(Boolean);
    return words.length <= 2 && /[?]$/.test(lower);
  }
  return false;
}
