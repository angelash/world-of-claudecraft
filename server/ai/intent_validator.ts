import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiDecisionV1, AiJobContextV1, AiValidationResult } from './ai_types';
import { validateCanonDecision } from './canon_guard';
import type { CanonGuardSubject } from './canon_guard';
import { profileFor } from './profiles';

const MAX_TTL_MS = 60_000;
const MIN_CONFIDENCE = 0;
const MAX_CONFIDENCE = 1;
const MAX_DYNAMIC_TEXT_CHARS = 280;

export interface AiIntentValidationInput {
  decision: AiDecisionV1;
  context: AiJobContextV1;
  entity: Entity;
  subject: CanonGuardSubject;
}

export function validateAiDecision(input: AiIntentValidationInput): AiValidationResult {
  const { decision, context, entity, subject } = input;
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
    if (!profile.allowedIntentTypes.includes(intent.type)) return rejected(`intent ${intent.type} not allowed by profile`);
    if (intent.lineId && !profile.allowedLineIds.includes(intent.lineId)) return rejected(`line id ${intent.lineId} not allowed by profile`);
  }

  const canon = validateCanonDecision(decision, context, subject);
  if (!canon.ok) return rejected(canon.reason ?? 'canon guard rejected decision');

  const events: SimEvent[] = [];
  for (const speech of decision.speech) {
    if (speech.mode === 'lineId') {
      if (!profile.allowedLineIds.includes(speech.lineId)) return rejected(`line id ${speech.lineId} not allowed by profile`);
      if (context.allowedLineIds && !context.allowedLineIds.includes(speech.lineId)) return rejected(`line id ${speech.lineId} not allowed by context`);
      events.push({
        type: 'aiSpeech',
        speakerId: entity.id,
        speakerName: entity.name,
        speech,
        source: 'fallback',
        pid: context.player.entityId,
      });
      continue;
    }
    if (context.outputMode === 'line_id_only') return rejected('dynamic speech is blocked in line_id_only mode');
    if (speech.language !== context.locale) return rejected('dynamic speech language does not match player locale');
    if (speech.text.length === 0 || speech.text.length > MAX_DYNAMIC_TEXT_CHARS) return rejected('dynamic speech length out of range');
    events.push({
      type: 'aiSpeech',
      speakerId: entity.id,
      speakerName: entity.name,
      speech,
      source: 'codex',
      pid: context.player.entityId,
    });
  }
  return { ok: true, events };
}

function rejected(reason: string): AiValidationResult {
  return { ok: false, events: [], reason };
}
