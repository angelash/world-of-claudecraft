import { describe, expect, it } from 'vitest';
import { cloneMemoryAudit, rumorMemoryAudit, worldTraceMemoryAudit } from '../server/ai/memory_audit';
import type { AiRumorMemory } from '../server/ai/social_memory';
import type { AiWorldTrace } from '../server/ai/world_traces';

describe('AI memory audit records', () => {
  it('normalizes rumors and traces into bounded audit records', () => {
    const rumor: AiRumorMemory = {
      rumorId: 'rumor-1',
      sceneId: 'eastbrook_forge',
      originSceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      itemId: 'redbrook_blade',
      subjectKind: 'item',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.itemInterestInspect'],
      strength: 0.75,
      scope: 'region',
      createdAt: 10,
      expiresAt: 100,
    };
    const trace: AiWorldTrace = {
      traceId: 'trace-1',
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      kind: 'valuable',
      itemId: 'redbrook_blade',
      itemDisplayName: 'Redbrook Blade',
      sourcePlayerEntityId: 1,
      lineId: 'hudChrome.aiSpeech.sceneTraceValuable',
      reasonLineIds: ['hudChrome.aiSpeech.itemInterestInspect'],
      strength: 1,
      createdAt: 10,
      expiresAt: 100,
    };

    expect(rumorMemoryAudit(rumor, 'discarded:redbrook_blade')).toMatchObject({
      kind: 'rumor',
      refId: 'rumor-1',
      scope: 'region',
      zoneId: 'eastbrook_vale',
      itemId: 'redbrook_blade',
      salience: 0.75,
    });
    expect(worldTraceMemoryAudit(trace, 'discarded:redbrook_blade')).toMatchObject({
      kind: 'worldTrace',
      refId: 'trace-1',
      scope: 'scene',
      lineIds: ['hudChrome.aiSpeech.sceneTraceValuable', 'hudChrome.aiSpeech.itemInterestInspect'],
      salience: 1,
    });
  });

  it('clones line id arrays for journal snapshots', () => {
    const record = rumorMemoryAudit({
      rumorId: 'rumor-2',
      sceneId: 'fallen_chapel',
      originSceneId: 'fallen_chapel',
      zoneId: 'eastbrook_vale',
      itemId: 'q_wolves',
      subjectKind: 'quest',
      questId: 'q_wolves',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.memoryQuestRumorEcho'],
      strength: 0.5,
      scope: 'scene',
      createdAt: 2,
      expiresAt: 60,
    }, 'questDone:q_wolves');

    const cloned = cloneMemoryAudit(record);
    cloned.lineIds.push('hudChrome.aiSpeech.topicQuestNoHint');

    expect(record.lineIds).toEqual(['hudChrome.aiSpeech.memoryQuestRumorEcho']);
    expect(cloned).toMatchObject({ kind: 'rumor', questId: 'q_wolves', subjectKind: 'quest' });
  });
});
