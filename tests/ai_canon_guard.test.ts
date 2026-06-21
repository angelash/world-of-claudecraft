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
    expect(classifyCanonSubject({ kind: 'npc', questIds: [], vendorItems: ['minor_healing_potion'] } as unknown as Entity)).toBe('questRewardSource');
    expect(classifyCanonSubject({ kind: 'object', templateId: 'relic', questIds: ['q_bones'], objectItemId: null, dungeonId: null } as Entity)).toBe('criticalQuestObject');
    expect(classifyCanonSubject({ kind: 'object', templateId: 'dungeon_door', questIds: [], objectItemId: null, dungeonId: 'hollow_crypt' } as unknown as Entity)).toBe('dungeonGate');
  });

  it('blocks dynamic text that looks like a task result or reward promise', () => {
    expect(dynamicTextViolatesQuestGuard('Quest complete. You gain 50 XP.')).toBe(true);
    expect(dynamicTextViolatesQuestGuard('任务完成。你获得金币和声望。')).toBe(true);
    expect(dynamicTextViolatesQuestGuard('Read <script>alert(1)</script> or http://example.test')).toBe(true);
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

  it('rejects high-risk intents for critical quest mobs', () => {
    const decision: AiDecisionV1 = {
      ...baseDecision,
      entityRef: { kind: 'mob', entityId: 20, templateId: 'quest_bandit' },
      intents: [{ type: 'seekShelter', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    };
    expect(validateCanonDecision(decision, baseContext, 'criticalQuestMob')).toMatchObject({
      ok: false,
      reason: 'intent seekShelter is blocked for criticalQuestMob',
    });
  });

  it('allows only inspection-style intents for quest objects and dungeon gates', () => {
    const inspectDecision: AiDecisionV1 = {
      ...baseDecision,
      entityRef: { kind: 'object', entityId: 30, templateId: 'quest_relic' },
      intents: [{ type: 'inspectObject', lineId: 'hudChrome.aiSpeech.objectInspectGeneric' }],
    };
    expect(validateCanonDecision(inspectDecision, baseContext, 'criticalQuestObject')).toEqual({ ok: true });

    const avoidDecision: AiDecisionV1 = {
      ...inspectDecision,
      intents: [{ type: 'avoidObject', lineId: 'hudChrome.aiSpeech.objectInspectGeneric' }],
    };
    expect(validateCanonDecision(avoidDecision, baseContext, 'criticalQuestObject')).toMatchObject({
      ok: false,
      reason: 'intent avoidObject is blocked for criticalQuestObject',
    });

    const gateDecision: AiDecisionV1 = {
      ...inspectDecision,
      intents: [{ type: 'showGossipOptions', lineId: 'hudChrome.aiSpeech.objectInspectGeneric' }],
    };
    expect(validateCanonDecision(gateDecision, baseContext, 'dungeonGate')).toMatchObject({
      ok: false,
      reason: 'intent showGossipOptions is blocked for dungeonGate',
    });
  });

  it('blocks reward-source subjects from hinting rewards or manipulating objects', () => {
    const decision: AiDecisionV1 = {
      ...baseDecision,
      entityRef: { kind: 'npc', entityId: 40, templateId: 'the_merchant' },
      intents: [{ type: 'approachObject', lineId: 'hudChrome.aiSpeech.merchantMarketPulse' }],
    };
    expect(validateCanonDecision(decision, baseContext, 'questRewardSource')).toMatchObject({
      ok: false,
      reason: 'intent approachObject is blocked for questRewardSource',
    });
  });

  it('requires a visible quest fact before accepting a quest hint', () => {
    const context: AiJobContextV1 = { ...baseContext, questFacts: [] };
    const decision: AiDecisionV1 = {
      ...baseDecision,
      intents: [{ type: 'questHint', lineId: 'hudChrome.aiSpeech.brotherAldricAwake' }],
    };
    expect(validateCanonDecision(decision, context, 'criticalQuestNpc')).toMatchObject({
      ok: false,
      reason: 'quest hint requires a visible quest fact',
    });
  });
});
