import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { memoryReactionEvent } from '../server/ai/memory_reactions';
import { AiSocialMemoryStore } from '../server/ai/social_memory';
import type { Entity } from '../src/sim/types';

const context: AiJobContextV1 = {
  schemaVersion: 1,
  jobId: 'memory-job',
  trigger: 'npc_gossip_opened',
  entity: { kind: 'npc', entityId: 7, templateId: 'brother_aldric', name: 'Brother Aldric', level: 1, questIds: [], dead: false },
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

const speaker = { id: 7, name: 'Brother Aldric', kind: 'npc', templateId: 'brother_aldric' } as Entity;

describe('AI social memory', () => {
  it('tracks repeated player interactions per NPC template', () => {
    const store = new AiSocialMemoryStore();
    expect(store.noteNpcInteraction(context, 3).interactionCount).toBe(1);
    const second = store.noteNpcInteraction(context, 9);
    expect(second.interactionCount).toBe(2);
    expect(second.lastInteractionAt).toBe(9);
    expect(second.sceneIds).toContain('eastbrook_forge');
  });

  it('turns repeated interaction and same-scene rumors into lineId events', () => {
    const store = new AiSocialMemoryStore();
    const first = store.noteNpcInteraction(context, 0);
    expect(memoryReactionEvent(context, speaker, first, null)).toBeNull();
    const second = store.noteNpcInteraction(context, 1);
    expect(memoryReactionEvent(context, speaker, second, null)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.memoryRecognizesPlayer' },
    });

    const rumor = store.noteItemRumor({
      sceneId: 'eastbrook_forge',
      itemId: 'roasted_boar',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
      nowSeconds: 2,
    });
    expect(memoryReactionEvent(context, speaker, second, rumor)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.memoryRumorEcho' },
    });
  });

  it('keeps item rumors short-lived, scene-scoped, and source-player scoped', () => {
    const store = new AiSocialMemoryStore({ rumorTtlSeconds: 5 });
    store.noteItemRumor({
      sceneId: 'eastbrook_forge',
      itemId: 'roasted_boar',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
      nowSeconds: 10,
    });

    const active = store.rumorForScene('eastbrook_forge', 1, 13);
    expect(active?.itemId).toBe('roasted_boar');
    expect(active?.strength).toBeCloseTo(0.4, 5);
    expect(store.rumorForScene('mirror_lake_dock', 1, 13)).toBeNull();
    expect(store.rumorForScene('eastbrook_forge', 2, 13)).toBeNull();
    expect(store.rumorForScene('eastbrook_forge', 1, 15)).toBeNull();
  });
});
