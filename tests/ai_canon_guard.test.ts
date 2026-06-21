import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { classifyCanonSubject, dynamicTextViolatesQuestGuard, validateCanonDecision } from '../server/ai/canon_guard';
import type { AiDecisionV1, AiJobContextV1 } from '../server/ai/ai_types';

const baseContext: AiJobContextV1 = {
  schemaVersion: 1,
  jobId: 'job-1',
  trigger: 'npc_gossip_opened',
  entity: { kind: 'npc', entityId: 10, templateId: 'brother_aldric', name: 'Brother Aldric', level: 1, questIds: ['q_bones'], dead: false },
  player: { entityId: 1, name: 'Ari', level: 1, classId: 'warrior', activeQuestIds: ['q_bones'], completedQuestIds: [] },
  locale: 'en',
  questFacts: [{ questId: 'q_bones', visibility: 'currentObjective', summary: 'Gather bones.', source: 'quest-log' }],
  recentObservations: [],
  allowedIntents: ['commentOnScene'],
  outputMode: 'line_id_only',
};

const baseDecision: AiDecisionV1 = {
  schemaVersion: 1,
  jobId: 'job-1',
  entityRef: { kind: 'npc', entityId: 10, templateId: 'brother_aldric' },
  ttlMs: 5_000,
  confidence: 1,
  speech: [{ mode: 'lineId', lineId: 'hudChrome.aiSpeech.brotherAldricAwake', values: { playerName: 'Ari' } }],
  intents: [{ type: 'commentOnScene', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
  audit: { shortReason: 'test', usedPlayerInput: false, safetyNotes: [] },
};

describe('AI Canon Guard', () => {
  it('classifies quest NPCs and quest objects as protected subjects', () => {
    expect(classifyCanonSubject({ kind: 'npc', questIds: ['q_bones'] } as Entity)).toBe('criticalQuestNpc');
    expect(classifyCanonSubject({ kind: 'object', templateId: 'relic', questIds: ['q_bones'], objectItemId: null, dungeonId: null } as Entity)).toBe('criticalQuestObject');
    expect(classifyCanonSubject({ kind: 'object', templateId: 'dungeon_door', questIds: [], objectItemId: null, dungeonId: 'hollow_crypt' } as unknown as Entity)).toBe('dungeonGate');
  });

  it('blocks dynamic text that looks like a task result or reward promise', () => {
    expect(dynamicTextViolatesQuestGuard('Quest complete. You gain 50 XP.')).toBe(true);
    expect(dynamicTextViolatesQuestGuard('The mud near the bridge remembers many boots.')).toBe(false);
  });

  it('accepts visible quest facts and lineId speech for critical quest NPCs', () => {
    expect(validateCanonDecision(baseDecision, baseContext, 'criticalQuestNpc')).toEqual({ ok: true });
  });

  it('rejects task-sensitive dynamic text even when the decision schema is otherwise valid', () => {
    const decision: AiDecisionV1 = {
      ...baseDecision,
      speech: [{ mode: 'dynamicText', language: 'en', text: 'You completed the task, and I reward you with gold.' }],
    };
    expect(validateCanonDecision(decision, baseContext, 'criticalQuestNpc').ok).toBe(false);
  });
});
