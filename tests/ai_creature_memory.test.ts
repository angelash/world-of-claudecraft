import { describe, expect, it } from 'vitest';
import { AiCreatureMemoryStore, creaturePlanKey, singularityCreatureMemoryEvent, singularityCreatureSceneMemoryEvent } from '../server/ai/creature_memory';
import { droppedItemSemantic } from '../server/ai/scene_frame';
import type { SceneFrameV1 } from '../server/ai/scene_frame';
import type { IndividualAiProfile } from '../server/ai/singularity';
import type { Entity } from '../src/sim/types';

const creature = { id: 10, templateId: 'forest_wolf', name: 'Forest Wolf', kind: 'mob' } as Entity;
const player = { id: 1, templateId: 'warrior', name: 'Ari', kind: 'player' } as Entity;
const individual: IndividualAiProfile = {
  entityId: creature.id,
  templateId: creature.templateId,
  family: 'beast',
  tier: 'singularity',
  score: 0.99,
  traits: ['foodFixated', 'stargazer'],
  memorySeed: 'forest_wolf:10:9900',
  intensity: 1,
};
const scene: SceneFrameV1 = {
  zoneId: 'eastbrook_vale',
  subsceneId: 'eastbrook_forge',
  biomeTags: ['vale'],
  locationTags: ['town', 'safeTown'],
  structureTags: ['forge', 'workshop'],
  environmentalTags: ['workNoise', 'coalSmoke', 'warmStone'],
  nearbySemanticObjects: [],
  droppedItems: [],
  companions: [],
  time: { hour: 8, phase: 'day', isNight: false, tags: ['day', 'highVisibility'] },
  weather: { kind: 'clear', intensity: 0.2, tags: ['clearSky'] },
  light: { level: 'bright', tags: ['sunlit'] },
  mood: { dayEnergy: 0.7, nightFatigue: 0.1, clearNightAwe: 0, rainIrritation: 0, fogFear: 0 },
  recentSceneEvents: [],
  danger: { undeadPressure: 0, hostileDensity: 0, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.8 },
};

describe('AI creature memory', () => {
  it('emits a singularity memory line after repeated player patterns', () => {
    const store = new AiCreatureMemoryStore({ memoryTtlSeconds: 5 });
    const item = droppedItemSemantic('roasted_boar', 0, player.id)!;
    const first = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 10 });
    expect(first.interactionCount).toBe(1);
    expect(singularityCreatureMemoryEvent(player, creature, item, first)).toBeNull();

    const second = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 12 });
    expect(second.interactionCount).toBe(2);
    expect(singularityCreatureMemoryEvent(player, creature, item, second)).toMatchObject({
      speech: {
        lineId: 'hudChrome.aiSpeech.singularityRemembersPlayer',
        values: expect.objectContaining({
          speakerTemplateId: 'forest_wolf',
          individualAlias: 'foodFixated',
          itemId: 'roasted_boar',
          playerName: 'Ari',
          interactionCount: 2,
        }),
      },
      reaction: {
        kind: 'inspect',
        targetItemId: 'roasted_boar',
        individualTier: 'singularity',
        individualTraits: ['foodFixated', 'stargazer'],
      },
      pid: player.id,
    });

    const afterExpiry = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 17 });
    expect(afterExpiry.interactionCount).toBe(1);
  });

  it('keeps long-running singularity creature memories bounded by recency', () => {
    const store = new AiCreatureMemoryStore({ memoryTtlSeconds: 1_000, maxMemories: 2 });
    for (let i = 0; i < 5; i++) {
      const entity = { ...creature, id: 20 + i, templateId: `forest_wolf_${i}` } as Entity;
      store.noteSingularityReaction({
        entity,
        player,
        individual: { ...individual, entityId: entity.id, templateId: entity.templateId },
        nowSeconds: 10 + i,
      });
    }

    const memories = store.snapshot();
    expect(memories).toHaveLength(2);
    expect(memories.map((memory) => memory.entityId).sort((a, b) => a - b)).toEqual([23, 24]);
  });

  it('forms bounded short-term creature plans after repeated singularity patterns', () => {
    const store = new AiCreatureMemoryStore({ memoryTtlSeconds: 30, planTtlSeconds: 8, maxPlans: 2 });
    const item = droppedItemSemantic('roasted_boar', 0, player.id)!;
    const first = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 10 });
    expect(store.notePlan({
      memory: first,
      entity: creature,
      player,
      individual,
      scene,
      item,
      trigger: 'item_discarded',
      nowSeconds: 10,
    })).toBeNull();

    const second = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 12 });
    const plan = store.notePlan({
      memory: second,
      entity: creature,
      player,
      individual,
      scene,
      item,
      trigger: 'item_discarded',
      nowSeconds: 12,
    });
    expect(plan).toMatchObject({
      planId: creaturePlanKey('10:1', 'eastbrook_forge', 'roasted_boar'),
      kind: 'followScent',
      itemId: 'roasted_boar',
      traits: expect.arrayContaining(['foodFixated', 'stargazer']),
      evidence: expect.arrayContaining(['trigger:item_discarded', 'trait:foodFixated', 'item:roasted_boar']),
    });
    expect(plan?.intensity).toBeGreaterThan(0.7);
    expect(singularityCreatureMemoryEvent(player, creature, item, second, plan)).toMatchObject({
      reaction: expect.objectContaining({
        planId: creaturePlanKey('10:1', 'eastbrook_forge', 'roasted_boar'),
        planKind: 'followScent',
        planIntensity: expect.any(Number),
        planExpiresAt: 20,
        targetEntityId: player.id,
      }),
    });

    for (let i = 0; i < 4; i++) {
      const memory = store.noteSingularityReaction({
        entity: { ...creature, id: 30 + i, templateId: `forest_wolf_${i}` } as Entity,
        player,
        individual: { ...individual, entityId: 30 + i, templateId: `forest_wolf_${i}` },
        nowSeconds: 13 + i,
      });
      store.notePlan({
        memory: { ...memory, interactionCount: 2 },
        entity: { ...creature, id: 30 + i, templateId: `forest_wolf_${i}` } as Entity,
        player,
        individual: { ...individual, entityId: 30 + i, templateId: `forest_wolf_${i}` },
        scene,
        trigger: 'scene_inspected',
        nowSeconds: 13 + i,
      });
    }
    expect(store.planSnapshot()).toHaveLength(2);
  });

  it('emits a singularity scene memory line after repeated scene sightings', () => {
    const store = new AiCreatureMemoryStore({ memoryTtlSeconds: 30 });
    const first = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 10 });
    expect(singularityCreatureSceneMemoryEvent(player, creature, scene, first)).toBeNull();

    const second = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 12 });
    expect(singularityCreatureSceneMemoryEvent(player, creature, scene, second)).toMatchObject({
      speech: {
        lineId: 'hudChrome.aiSpeech.singularityRemembersScene',
        values: expect.objectContaining({
          speakerTemplateId: 'forest_wolf',
          individualAlias: 'foodFixated',
          sceneId: 'eastbrook_forge',
          playerName: 'Ari',
          interactionCount: 2,
        }),
      },
      reaction: {
        kind: 'inspect',
        sceneTags: expect.arrayContaining(['town', 'forge', 'workNoise']),
        individualTier: 'singularity',
        individualTraits: ['foodFixated', 'stargazer'],
      },
      pid: player.id,
    });
  });

  it('leaves sky-watching creature plans without a false entity attention target', () => {
    const store = new AiCreatureMemoryStore({ memoryTtlSeconds: 30, planTtlSeconds: 8 });
    const skyScene: SceneFrameV1 = {
      ...scene,
      time: { hour: 23, phase: 'night', isNight: true, tags: ['night', 'quiet'] },
      weather: { kind: 'clear', intensity: 0.1, tags: ['clearSky'] },
      light: { level: 'dim', tags: ['moonlit', 'starrySky'] },
    };
    const first = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 10 });
    const second = store.noteSingularityReaction({ entity: creature, player, individual, nowSeconds: 12 });
    expect(store.notePlan({
      memory: first,
      entity: creature,
      player,
      individual,
      scene: skyScene,
      trigger: 'scene_inspected',
      nowSeconds: 10,
    })).toBeNull();
    const plan = store.notePlan({
      memory: second,
      entity: creature,
      player,
      individual,
      scene: skyScene,
      trigger: 'scene_inspected',
      nowSeconds: 12,
    });

    expect(plan).toMatchObject({ kind: 'watchSky' });
    const event = singularityCreatureSceneMemoryEvent(player, creature, skyScene, second, plan);
    expect(event?.type).toBe('aiSpeech');
    if (event?.type !== 'aiSpeech') throw new Error('expected aiSpeech event');
    expect(event.reaction).toMatchObject({
      planKind: 'watchSky',
      planIntensity: expect.any(Number),
    });
    expect(event.reaction).not.toHaveProperty('targetEntityId');
  });
});
