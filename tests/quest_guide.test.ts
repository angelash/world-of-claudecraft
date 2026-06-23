import { describe, expect, it } from 'vitest';
import type { QuestDef, QuestProgress } from '../src/sim/types';
import { questGuideMarkers, type QuestGuideEntity, type QuestGuideInput } from '../src/ui/quest_guide';

function quest(overrides: Partial<QuestDef>): QuestDef {
  return {
    id: 'q_test',
    name: 'Test Quest',
    giverNpcId: 'giver',
    turnInNpcId: 'turnin',
    text: '',
    completionText: '',
    objectives: [],
    xpReward: 0,
    copperReward: 0,
    itemRewards: {},
    ...overrides,
  };
}

function progress(overrides: Partial<QuestProgress>): QuestProgress {
  return { questId: 'q_test', counts: [0], state: 'active', ...overrides };
}

function entity(overrides: Partial<QuestGuideEntity>): QuestGuideEntity {
  return {
    id: 1,
    kind: 'mob',
    templateId: 'wolf',
    pos: { x: 0, z: 0 },
    dead: false,
    lootable: false,
    loot: null,
    objectItemId: null,
    ...overrides,
  };
}

function guideInput(overrides: Partial<QuestGuideInput>): QuestGuideInput {
  return {
    player: { x: 0, z: 0 },
    questLog: [],
    quests: {},
    entities: [],
    npcs: {},
    camps: [],
    groundObjects: [],
    mobs: {},
    ...overrides,
  };
}

describe('questGuideMarkers', () => {
  it('points ready quests at their turn-in NPC', () => {
    const markers = questGuideMarkers(guideInput({
      questLog: [progress({ state: 'ready' })],
      quests: { q_test: quest({ turnInNpcId: 'captain' }) },
      npcs: { captain: { id: 'captain', pos: { x: 12, z: -4 } } },
    }));

    expect(markers).toEqual([{
      kind: 'turnIn',
      questId: 'q_test',
      objectiveIndex: null,
      x: 12,
      z: -4,
      distanceSq: 160,
    }]);
  });

  it('uses the nearest live target for incomplete kill objectives', () => {
    const markers = questGuideMarkers(guideInput({
      questLog: [progress({ counts: [1] })],
      quests: { q_test: quest({ objectives: [{ type: 'kill', targetMobId: 'boar', count: 3, label: 'Boar slain' }] }) },
      entities: [
        entity({ id: 1, templateId: 'boar', pos: { x: 20, z: 0 } }),
        entity({ id: 2, templateId: 'boar', pos: { x: 4, z: 3 } }),
        entity({ id: 3, templateId: 'wolf', pos: { x: 1, z: 1 } }),
      ],
      camps: [{ mobId: 'boar', center: { x: 30, z: 0 } }],
    }));

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ kind: 'objective', questId: 'q_test', objectiveIndex: 0, x: 4, z: 3 });
  });

  it('points collect objectives at ground objects or mobs that can drop the item', () => {
    const markers = questGuideMarkers(guideInput({
      questLog: [progress({ questId: 'q_supplies' })],
      quests: { q_supplies: quest({ id: 'q_supplies', objectives: [{ type: 'collect', itemId: 'supply_crate', count: 1, label: 'Supply Crate' }] }) },
      groundObjects: [{ itemId: 'supply_crate', positions: [{ x: 6, z: 0 }] }],
      camps: [{ mobId: 'thief', center: { x: 3, z: 0 } }],
      mobs: { thief: { id: 'thief', loot: [{ itemId: 'supply_crate', chance: 1, questId: 'q_supplies' }] } },
    }));

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({ questId: 'q_supplies', x: 3, z: 0 });
  });

  it('skips completed objectives and unknown quests', () => {
    const markers = questGuideMarkers(guideInput({
      questLog: [
        progress({ questId: 'q_test', counts: [1] }),
        progress({ questId: 'missing', counts: [0] }),
      ],
      quests: { q_test: quest({ objectives: [{ type: 'kill', targetMobId: 'boar', count: 1, label: 'Boar slain' }] }) },
      entities: [entity({ templateId: 'boar', pos: { x: 1, z: 0 } })],
    }));

    expect(markers).toEqual([]);
  });
});
