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

  it('keeps local lineId speech locally sourced', () => {
    const result = validateAiDecision({ decision, context, entity, subject: 'criticalQuestNpc', source: 'local' });
    expect(result.ok).toBe(true);
    expect(result.events).toEqual([{
      type: 'aiSpeech',
      speakerId: 7,
      speakerName: 'Brother Aldric',
      speech: { mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake', values: { playerName: 'Ari' } },
      source: 'local',
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

  it('rejects intents that are not allowed by the current job context', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        intents: [{ type: 'inspectObject', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
      },
      context,
      entity,
      subject: 'ordinary',
      source: 'codex',
    });
    expect(result).toMatchObject({ ok: false, reason: 'intent inspectObject not allowed by context' });
  });

  it('turns visible provider intent targets into presentation reaction metadata', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        intents: [{ type: 'faceEntity', targetEntityId: context.player.entityId, lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
      },
      context: { ...context, allowedIntents: ['faceEntity'] },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({
      type: 'aiSpeech',
      reaction: { kind: 'inspect', targetEntityId: context.player.entityId },
    }));
  });

  it('rejects provider intent targets outside the visible context', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        intents: [{ type: 'lookAt', targetEntityId: 999, lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
      },
      context: { ...context, allowedIntents: ['lookAt'] },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result).toMatchObject({ ok: false, reason: 'intent targetEntityId is not visible in context' });
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

  it('rejects low-information dynamicText that only echoes the topic', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{ mode: 'dynamicText', language: 'en', text: 'Recent?' }],
      },
      context: { ...context, outputMode: 'dynamic_text_experiment' },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'dynamic speech too thin',
      speechPolish: expect.objectContaining({
        processed: 1,
        lastAfter: 'Recent?',
      }),
    });
  });

  it('rejects short dynamicText questions that only gesture at a sensation', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{ mode: 'dynamicText', language: 'en', text: 'Smell that, traveler?' }],
      },
      context: { ...context, outputMode: 'dynamic_text_experiment' },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result).toMatchObject({
      ok: false,
      reason: 'dynamic speech too thin',
      speechPolish: expect.objectContaining({
        processed: 1,
        lastAfter: 'Smell that, traveler?',
      }),
    });
  });

  it('allows short dynamicText questions when they carry concrete scene information', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{ mode: 'dynamicText', language: 'en', text: 'Smoke under the blue door?' }],
      },
      context: { ...context, outputMode: 'dynamic_text_experiment' },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({
      speech: { mode: 'dynamicText', language: 'en', text: 'Smoke under the blue door?' },
    }));
  });

  it('polishes English dynamicText before creating player speech events', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{
          mode: 'dynamicText',
          language: 'en',
          text: 'However, I would suggest you keep your voice low. Overall, this means the graves are dangerous.',
        }],
      },
      context: { ...context, outputMode: 'dynamic_text_experiment' },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({
      speech: { mode: 'dynamicText', language: 'en', text: 'Keep your voice low.' },
    }));
  });

  it('uses the profile speech fingerprint to strip avoided phrasing from dynamicText', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{
          mode: 'dynamicText',
          language: 'en',
          text: 'This means the chapel air is wrong tonight.',
        }],
      },
      context: {
        ...context,
        outputMode: 'dynamic_text_experiment',
        profile: {
          profileId: 'npc.test.priest',
          persona: 'Test priest',
          knowledgeScope: [],
          tabooTopics: [],
          speechFingerprint: {
            sentenceRhythm: 'soft',
            addressStyle: 'sparing',
            favoriteStarts: ['Keep your voice low'],
            sensoryBias: ['cold air'],
            avoidedPhrases: ['this means'],
          },
        },
      },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({
      speech: { mode: 'dynamicText', language: 'en', text: 'The chapel air is wrong tonight.' },
    }));
  });

  it('polishes Chinese dynamicText before creating player speech events', () => {
    const result = validateAiDecision({
      decision: {
        ...decision,
        speech: [{
          mode: 'dynamicText',
          language: 'zh_CN',
          text: '不过，从墓地的雾来看，这说明附近不太干净。总的来说，你应该小心。',
        }],
      },
      context: { ...context, locale: 'zh_CN', outputMode: 'dynamic_text_experiment' },
      entity,
      subject: 'criticalQuestNpc',
      source: 'codex',
    });

    expect(result.ok).toBe(true);
    expect(result.events).toContainEqual(expect.objectContaining({
      speech: { mode: 'dynamicText', language: 'zh_CN', text: '附近不太干净。' },
    }));
  });
});
