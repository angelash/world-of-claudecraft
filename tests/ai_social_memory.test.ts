import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { memoryReactionEvent } from '../server/ai/memory_reactions';
import { compactProfileSnapshot, profileFor } from '../server/ai/profiles';
import { topicReactionEvent } from '../server/ai/question_reactions';
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

  it('uses profile-specific recognition and rumor lines when available', () => {
    const profiledContext: AiJobContextV1 = {
      ...context,
      profile: {
        profileId: 'npc.brother_aldric.living_world',
        persona: 'A worried priest who reads weather, graves, and player choices as omens.',
        knowledgeScope: ['chapel rites'],
        tabooTopics: ['hidden quest conclusions'],
        socialMemory: {
          style: 'chapel road memory',
          recognitionLineId: 'hudChrome.aiSpeech.memoryPriestRecognizesPlayer',
          rumorLineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho',
          questRumorLineId: 'hudChrome.aiSpeech.memoryPriestQuestRumorEcho',
        },
      },
    };
    const store = new AiSocialMemoryStore();
    store.noteNpcInteraction(profiledContext, 0);
    const second = store.noteNpcInteraction(profiledContext, 1);

    expect(memoryReactionEvent(profiledContext, speaker, second, null)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.memoryPriestRecognizesPlayer' },
    });
    const rumor = store.noteItemRumor({
      sceneId: 'eastbrook_forge',
      itemId: 'roasted_boar',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
      nowSeconds: 2,
    });
    expect(memoryReactionEvent(profiledContext, speaker, second, rumor)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.memoryPriestRumorEcho' },
    });

    const questRumor = store.noteQuestRumor({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      questId: 'q_wolves',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.memoryQuestRumorEcho'],
      nowSeconds: 3,
    });
    expect(memoryReactionEvent(profiledContext, speaker, second, questRumor)).toMatchObject({
      speech: {
        lineId: 'hudChrome.aiSpeech.memoryPriestQuestRumorEcho',
        values: expect.objectContaining({ questId: 'q_wolves' }),
      },
    });
  });

  it('turns singularity item reactions into a special rumor echo', () => {
    const store = new AiSocialMemoryStore();
    const memory = store.noteNpcInteraction(context, 0);
    const rumor = store.noteItemRumor({
      sceneId: 'eastbrook_forge',
      itemId: 'roasted_boar',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.singularityFoodFixated'],
      nowSeconds: 1,
    });

    expect(memoryReactionEvent(context, speaker, memory, rumor)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.memorySingularityRumorEcho' },
    });
  });

  it('keeps named NPC social profile snapshots distinct', () => {
    const expected = [
      ['brother_aldric', 'hudChrome.aiSpeech.memoryPriestRumorEcho'],
      ['the_merchant', 'hudChrome.aiSpeech.memoryMerchantRumorEcho'],
      ['smith_haldren', 'hudChrome.aiSpeech.memorySmithRumorEcho'],
      ['scout_maren', 'hudChrome.aiSpeech.memoryScoutRumorEcho'],
      ['loremaster_caddis', 'hudChrome.aiSpeech.memoryLoremasterRumorEcho'],
      ['tidewatcher_ondrel', 'hudChrome.aiSpeech.memoryTidewatcherRumorEcho'],
    ] as const;

    for (const [templateId, rumorLineId] of expected) {
      const snapshot = compactProfileSnapshot(profileFor('npc', templateId));
      expect(snapshot.profileId).not.toBe('npc.generic.living_world');
      expect(snapshot.knowledgeScope.length).toBeGreaterThan(0);
      expect(snapshot.tabooTopics.length).toBeGreaterThan(0);
      expect(snapshot.socialMemory?.rumorLineId).toBe(rumorLineId);
      expect(snapshot.socialMemory?.questRumorLineId).toMatch(/^hudChrome\.aiSpeech\.memory[A-Z].*QuestRumorEcho$/);
    }
  });

  it('turns explicit NPC question topics into local lineId answers', () => {
    const store = new AiSocialMemoryStore();
    const memory = store.noteNpcInteraction({ ...context, topic: 'place' }, 0);

    expect(topicReactionEvent({ ...context, topic: 'place' }, speaker, memory, null)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.topicPlace' },
    });
    expect(topicReactionEvent({ ...context, topic: 'rumor' }, speaker, memory, null)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.topicRumorQuiet' },
    });
    expect(topicReactionEvent({ ...context, topic: 'quest_hint' }, speaker, memory, null)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.topicQuestNoHint' },
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

  it('lets item rumors propagate inside the same region without becoming global', () => {
    const store = new AiSocialMemoryStore({ rumorTtlSeconds: 5 });
    store.noteItemRumor({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      itemId: 'roasted_boar',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.itemInterestApproach'],
      nowSeconds: 10,
    });

    const regionRumor = store.rumorForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'mirror_lake_dock',
      playerEntityId: 1,
      nowSeconds: 13,
    });
    expect(regionRumor).toMatchObject({
      itemId: 'roasted_boar',
      originSceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      scope: 'region',
    });
    expect(regionRumor?.strength).toBeCloseTo(0.26, 5);
    expect(store.rumorForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'eastbrook_forge',
      playerEntityId: 1,
      nowSeconds: 13,
    })).toBeNull();
    expect(store.rumorForRegion({
      zoneId: 'mirefen_marsh',
      sceneId: 'fenbridge_bridge',
      playerEntityId: 1,
      nowSeconds: 13,
    })).toBeNull();
    expect(store.rumorForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'mirror_lake_dock',
      playerEntityId: 2,
      nowSeconds: 13,
    })).toBeNull();
    expect(store.rumorForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'mirror_lake_dock',
      playerEntityId: 1,
      nowSeconds: 15,
    })).toBeNull();
  });

  it('keeps completed quest rumors scoped and identifiable as quest facts', () => {
    const store = new AiSocialMemoryStore({ rumorTtlSeconds: 8 });
    store.noteQuestRumor({
      sceneId: 'eastbrook_forge',
      zoneId: 'eastbrook_vale',
      questId: 'q_wolves',
      sourcePlayerEntityId: 1,
      lineIds: ['hudChrome.aiSpeech.memoryQuestRumorEcho'],
      nowSeconds: 20,
    });

    const rumor = store.rumorForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'fallen_chapel',
      playerEntityId: 1,
      nowSeconds: 22,
    });
    expect(rumor).toMatchObject({
      subjectKind: 'quest',
      questId: 'q_wolves',
      itemId: 'q_wolves',
      scope: 'region',
    });
    expect(memoryReactionEvent(context, speaker, store.noteNpcInteraction(context, 22), rumor)).toMatchObject({
      speech: {
        lineId: 'hudChrome.aiSpeech.memoryQuestRumorEcho',
        values: expect.objectContaining({ questId: 'q_wolves' }),
      },
    });
    expect(store.rumorForRegion({
      zoneId: 'mirefen_marsh',
      sceneId: 'fenbridge_bridge',
      playerEntityId: 1,
      nowSeconds: 22,
    })).toBeNull();
    expect(store.rumorForRegion({
      zoneId: 'eastbrook_vale',
      sceneId: 'fallen_chapel',
      playerEntityId: 1,
      nowSeconds: 28,
    })).toBeNull();
  });
});
