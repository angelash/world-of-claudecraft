import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { worldTraceReactionEvent } from '../server/ai/world_trace_reactions';
import type { AiWorldTrace } from '../server/ai/world_traces';
import type { Entity } from '../src/sim/types';

const context: AiJobContextV1 = {
  schemaVersion: 1,
  jobId: 'trace-reaction',
  trigger: 'npc_gossip_opened',
  entity: { kind: 'npc', entityId: 7, templateId: 'smith_haldren', name: 'Smith Haldren', level: 1, questIds: [], dead: false },
  player: { entityId: 1, name: 'Ari', level: 3, classId: 'warrior', activeQuestIds: [], completedQuestIds: [] },
  locale: 'en',
  scene: {
    zoneId: 'eastbrook_vale',
    subsceneId: 'eastbrook_forge',
    biomeTags: ['vale'],
    locationTags: ['town', 'safeTown'],
    structureTags: ['forge'],
    environmentalTags: ['warmLight'],
    nearbySemanticObjects: [],
    droppedItems: [],
    companions: [],
    time: { hour: 10, phase: 'day', isNight: false, tags: ['day'] },
    weather: { kind: 'clear', intensity: 0.1, tags: ['clearSky'] },
    light: { level: 'bright', tags: ['sunlit'] },
    mood: { dayEnergy: 0.7, nightFatigue: 0, clearNightAwe: 0, rainIrritation: 0, fogFear: 0 },
    recentSceneEvents: [],
    danger: { undeadPressure: 0, hostileDensity: 0, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.8 },
  },
  questFacts: [],
  recentObservations: [],
  allowedIntents: ['commentOnScene'],
  outputMode: 'line_id_only',
};

const speaker = { id: 7, name: 'Smith Haldren', kind: 'npc', templateId: 'smith_haldren' } as Entity;

function trace(kind: AiWorldTrace['kind'], lineId = 'hudChrome.aiSpeech.sceneTraceGeneric'): AiWorldTrace {
  return {
    traceId: `trace-${kind}`,
    sceneId: 'eastbrook_forge',
    kind,
    itemId: 'redbrook_blade',
    itemDisplayName: 'Redbrook Militia Blade',
    sourcePlayerEntityId: 1,
    lineId: lineId as AiWorldTrace['lineId'],
    reasonLineIds: [],
    strength: 0.75,
    createdAt: 1,
    expiresAt: 91,
  };
}

describe('AI world trace reactions', () => {
  it('turns active traces into NPC lineId reactions', () => {
    expect(worldTraceReactionEvent(context, speaker, trace('valuable'))).toMatchObject({
      speech: {
        lineId: 'hudChrome.aiSpeech.worldTraceNpcValuable',
        values: expect.objectContaining({ itemId: 'redbrook_blade', traceKind: 'valuable', traceStrength: 75 }),
      },
      reaction: { kind: 'inspect', targetItemId: 'redbrook_blade', score: 0.75 },
      pid: 1,
    });
    expect(worldTraceReactionEvent(context, speaker, trace('cursed'))).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.worldTraceNpcCursed' },
      reaction: { kind: 'avoid' },
    });
    expect(worldTraceReactionEvent(context, speaker, null)).toBeNull();
  });
});
