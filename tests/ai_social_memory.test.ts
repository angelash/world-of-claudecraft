import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { memoryReactionEvent } from '../server/ai/memory_reactions';
import { compactProfileSnapshot, profileFor } from '../server/ai/profiles';
import { profileDirectorProjectionTags } from '../server/ai/profile_projection';
import { topicReactionEvent } from '../server/ai/question_reactions';
import { AiSocialMemoryStore } from '../server/ai/social_memory';
import { NPCS } from '../src/sim/data';
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

  it('keeps long-running NPC interaction memory bounded by recency', () => {
    const store = new AiSocialMemoryStore({ maxNpcMemories: 3 });
    for (let i = 1; i <= 6; i++) {
      store.noteNpcInteraction({
        ...context,
        player: { ...context.player, entityId: i, name: `Player ${i}` },
      }, i);
    }

    const memories = store.snapshot().npcMemories;
    expect(memories).toHaveLength(3);
    expect(memories.map((memory) => memory.playerEntityId).sort((a, b) => a - b)).toEqual([4, 5, 6]);
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

  it('keeps every important quest hub NPC on an authored living-world profile', () => {
    const expected = [
      ['marshal_redbrook', 'npc.marshal_redbrook.living_world', 'hudChrome.aiSpeech.marshalRedbrookAwake', 'hudChrome.aiSpeech.memoryCommanderRumorEcho'],
      ['trader_wilkes', 'npc.trader_wilkes.living_world', 'hudChrome.aiSpeech.traderWilkesAwake', 'hudChrome.aiSpeech.memoryMerchantRumorEcho'],
      ['apothecary_lin', 'npc.apothecary_lin.living_world', 'hudChrome.aiSpeech.apothecaryLinAwake', 'hudChrome.aiSpeech.memoryHerbalistRumorEcho'],
      ['fisherman_brandt', 'npc.fisherman_brandt.living_world', 'hudChrome.aiSpeech.fishermanBrandtAwake', 'hudChrome.aiSpeech.memoryTidewatcherRumorEcho'],
      ['foreman_odell', 'npc.foreman_odell.living_world', 'hudChrome.aiSpeech.foremanOdellAwake', 'hudChrome.aiSpeech.memorySmithRumorEcho'],
      ['warden_fenwick', 'npc.warden_fenwick.living_world', 'hudChrome.aiSpeech.wardenFenwickAwake', 'hudChrome.aiSpeech.memoryCommanderRumorEcho'],
      ['provisioner_hale', 'npc.provisioner_hale.living_world', 'hudChrome.aiSpeech.provisionerHaleAwake', 'hudChrome.aiSpeech.memoryMerchantRumorEcho'],
      ['herbalist_yara', 'npc.herbalist_yara.living_world', 'hudChrome.aiSpeech.herbalistYaraAwake', 'hudChrome.aiSpeech.memoryHerbalistRumorEcho'],
      ['captain_thessaly', 'npc.captain_thessaly.living_world', 'hudChrome.aiSpeech.captainThessalyAwake', 'hudChrome.aiSpeech.memoryCommanderRumorEcho'],
      ['quartermaster_bree', 'npc.quartermaster_bree.living_world', 'hudChrome.aiSpeech.quartermasterBreeAwake', 'hudChrome.aiSpeech.memoryMerchantRumorEcho'],
      ['armorer_hode', 'npc.armorer_hode.living_world', 'hudChrome.aiSpeech.armorerHodeAwake', 'hudChrome.aiSpeech.memorySmithRumorEcho'],
    ] as const;

    for (const [templateId, profileId, fallbackLineId, rumorLineId] of expected) {
      const profile = profileFor('npc', templateId);
      expect(profile.id).toBe(profileId);
      expect(profile.id).not.toBe('npc.generic.living_world');
      expect(profile.fallbackLineId).toBe(fallbackLineId);
      expect(profile.fallbackLineId).not.toBe('hudChrome.aiSpeech.genericNpcAwake');
      expect(profile.allowedLineIds).toContain(fallbackLineId);
      expect(profile.knowledgeScope.length).toBeGreaterThanOrEqual(5);
      expect(profile.tabooTopics.length).toBeGreaterThanOrEqual(3);
      expect(profile.socialMemory.rumorLineId).toBe(rumorLineId);
      expect(profile.socialMemory.questRumorLineId).toMatch(/^hudChrome\.aiSpeech\.memory[A-Z].*QuestRumorEcho$/);
      expect(profile.sceneAffinities?.commentsOnTags.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(profile.itemInterest?.attractedToTags.length ?? 0).toBeGreaterThanOrEqual(5);
      expect(profile.timeWeatherSensitivity?.nightFatigue ?? 0).toBeGreaterThan(0);
    }
  });

  it('keeps all interactive content NPCs covered by living-world profiles', () => {
    const interactiveNpcIds = Object.values(NPCS)
      .filter((npc) => npc.questIds.length > 0 || (npc.vendorItems?.length ?? 0) > 0 || npc.market === true)
      .map((npc) => npc.id)
      .sort();
    expect(interactiveNpcIds.length).toBeGreaterThan(0);

    const missing = interactiveNpcIds.filter((npcId) => profileFor('npc', npcId).id === 'npc.generic.living_world');
    expect(missing).toEqual([]);
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

    expect(topicReactionEvent({
      ...context,
      topic: 'place',
      profile: compactProfileSnapshot(profileFor('npc', 'brother_aldric')),
      directorProposals: [{
        proposalId: 'director-question:proposal',
        intent: 'nudgeNpcRumor',
        status: 'preview',
        risk: 'low',
        intensity: 0.72,
        targetRef: 'gravecaller_sigil',
        sceneId: 'fallen_chapel',
        zoneId: 'eastbrook_vale',
        suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
        expiresAt: 180,
        reasonTags: ['mood:haunted', 'subject:item', 'proposal:npcTopicShift', 'trace:cursed'],
        safetyNotes: ['presentationOnly', 'noQuestMutation', 'noCombatMutation', 'noLootOrEconomyMutation'],
      }],
    }, speaker, memory, null)).toMatchObject({
      speech: { lineId: 'hudChrome.aiSpeech.topicPlace' },
      reaction: expect.objectContaining({
        kind: 'avoid',
        targetItemId: 'gravecaller_sigil',
        sceneTags: expect.arrayContaining(['profileProjection:riteOmen', 'directorProjection:mortalFear', 'family:humanoid']),
      }),
    });
  });

  it('derives named NPC projection tags from their profile voice', () => {
    expect(profileDirectorProjectionTags(compactProfileSnapshot(profileFor('npc', 'brother_aldric')))).toContain('profileProjection:riteOmen');
    expect(profileDirectorProjectionTags(compactProfileSnapshot(profileFor('npc', 'marshal_redbrook')))).toContain('profileProjection:patrolRisk');
    expect(profileDirectorProjectionTags(compactProfileSnapshot(profileFor('npc', 'the_merchant')))).toContain('profileProjection:tradeWeather');
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

  it('keeps long-running rumor streams bounded by the configured budget', () => {
    const store = new AiSocialMemoryStore({ maxRumors: 4, rumorTtlSeconds: 300 });
    for (let i = 1; i <= 9; i++) {
      store.noteItemRumor({
        sceneId: `scene_${i}`,
        zoneId: 'eastbrook_vale',
        itemId: `item_${i}`,
        sourcePlayerEntityId: 1,
        lineIds: ['hudChrome.aiSpeech.itemInterestInspect'],
        nowSeconds: i,
      });
    }

    const rumors = store.snapshot().rumors;
    expect(rumors).toHaveLength(4);
    expect(rumors.map((rumor) => rumor.itemId)).toEqual(['item_9', 'item_8', 'item_7', 'item_6']);
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
