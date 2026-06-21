import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import type { AiDecisionV1, AiJobContextV1 } from '../server/ai/ai_types';
import { validateAiDecision } from '../server/ai/intent_validator';

const entity = {
  id: 7,
  kind: 'npc',
  templateId: 'brother_aldric',
  name: 'Brother Aldric',
  questIds: ['q_bones'],
} as Entity;

const context: AiJobContextV1 = {
  schemaVersion: 1,
  jobId: 'job-7',
  trigger: 'npc_gossip_opened',
  entity: { kind: 'npc', entityId: 7, templateId: 'brother_aldric', name: 'Brother Aldric', level: 1, questIds: ['q_bones'], dead: false },
  player: { entityId: 1, name: 'Ari', level: 1, classId: 'warrior', activeQuestIds: ['q_bones'], completedQuestIds: [] },
  locale: 'en',
  questFacts: [{ questId: 'q_bones', visibility: 'knownToPlayer', summary: 'The dead are restless.', source: 'quest-log' }],
  recentObservations: [],
  allowedIntents: ['commentOnScene'],
  outputMode: 'line_id_only',
};

const decision: AiDecisionV1 = {
  schemaVersion: 1,
  jobId: 'job-7',
  entityRef: { kind: 'npc', entityId: 7, templateId: 'brother_aldric' },
  ttlMs: 5_000,
  confidence: 1,
  speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake', values: { playerName: 'Ari' } }],
  intents: [{ type: 'commentOnScene', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
  audit: { shortReason: 'test', usedPlayerInput: false, safetyNotes: [] },
};

describe('AI intent validator', () => {
  it('marks provider-selected lineId speech as codex sourced', () => {
    const result = validateAiDecision({ decision, context, entity, subject: 'criticalQuestNpc', source: 'codex' });
    expect(result.ok).toBe(true);
    expect(result.events).toEqual([{
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake', values: { playerName: 'Ari' } },
      source: 'codex',
      pid: 1,
    }]);
  });

  it('keeps local provider-error fallback lineId speech fallback sourced', () => {
    const result = validateAiDecision({ decision, context, entity, subject: 'criticalQuestNpc', source: 'fallback' });
    expect(result.ok).toBe(true);
    expect(result.events).toEqual([{
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake', values: { playerName: 'Ari' } },
      source: 'fallback',
      pid: 1,
    }]);
  });

  it('rejects decisions for another entity', () => {
    const result = validateAiDecision({
      decision: { ...decision, entityRef: { kind: 'npc', entityId: 8, templateId: 'brother_aldric' } },
      context,
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });
    expect(result).toMatchObject({ ok: false, reason: 'entity ref mismatch' });
  });

  it('rejects lineIds that are not allowed by the target profile', () => {
    const result = validateAiDecision({
      decision: { ...decision, speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.merchantMarketPulse' }] },
      context,
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects dynamicText when the context is line_id_only', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{ mode: 'dynamicText', language: 'en', text: 'The chapel air tastes of old rain.' }],
      },
      context,
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });
    expect(result).toMatchObject({ ok: false, reason: 'dynamic speech is blocked in line_id_only mode' });
  });

  it('allows safe dynamicText only in an explicit experiment output mode', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{ mode: 'dynamicText', language: 'en', text: 'The chapel air tastes of old rain.' }],
      },
      context: { ...context, outputMode: 'dynamic_text_experiment' },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });
    expect(result.ok).toBe(true);
    expect(result.events).toEqual([{
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'dynamicText', language: 'en', text: 'The chapel air tastes of old rain.' },
      source: 'codex',
      pid: 1,
    }]);
  });
});
