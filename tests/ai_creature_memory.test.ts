import { describe, expect, it } from 'vitest';
import { AiCreatureMemoryStore, singularityCreatureMemoryEvent } from '../server/ai/creature_memory';
import { droppedItemSemantic } from '../server/ai/scene_frame';
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
        values: expect.objectContaining({ itemId: 'roasted_boar', playerName: 'Ari', interactionCount: 2 }),
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
});
