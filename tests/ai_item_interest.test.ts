import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { itemSemanticFor, rankItemReactions, scoreItemReaction } from '../server/ai/item_interest';
import { droppedItemSemantic, type SceneFrameV1 } from '../server/ai/scene_frame';
import { sceneSemanticsAt } from '../server/ai/scene_semantics';
import { timeWeatherMood } from '../server/ai/time_weather_model';

function entity(id: number, templateId: string, kind: 'mob' | 'npc' = 'mob'): Entity {
  return {
    id,
    templateId,
    kind,
    name: templateId,
    pos: { x: id, y: 0, z: 0 },
    dead: false,
    hostile: kind === 'mob',
  } as Entity;
}

function frame(): SceneFrameV1 {
  const scene = sceneSemanticsAt({ x: 0, y: 0, z: 0 }, 8 * 60);
  return {
    ...scene,
    nearbySemanticObjects: [],
    droppedItems: [],
    companions: [],
    mood: timeWeatherMood(scene.time, scene.weather, scene.light),
    recentSceneEvents: [],
    danger: { undeadPressure: 0, hostileDensity: 0, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.1 },
  };
}

describe('AI item interest', () => {
  it('classifies food, weapons, valuables, and cursed quest objects into semantic tags', () => {
    expect(itemSemanticFor('roasted_boar').smellTags).toContain('meat');
    expect(itemSemanticFor('worn_sword').itemTags).toEqual(expect.arrayContaining(['weapon', 'metal']));
    expect(itemSemanticFor('moggers_copper_cudgel').valueSignals).toContain('valuable');
    expect(itemSemanticFor('gravecaller_sigil').dangerTags).toContain('undead');
  });

  it('makes food pull beasts closer while a cursed object pushes living beasts away', () => {
    const beast = entity(1, 'forest_wolf');
    const food = droppedItemSemantic('roasted_boar', 0, 99)!;
    const cursed = droppedItemSemantic('gravecaller_sigil', 0, 99)!;

    expect(scoreItemReaction(frame(), food, beast).reaction).toBe('approach');
    expect(scoreItemReaction(frame(), cursed, beast).reaction).toBe('avoid');
  });

  it('lets undead approach grave or cursed traces that frighten ordinary NPCs', () => {
    const cursed = droppedItemSemantic('gravecaller_sigil', 0, 99)!;
    const undead = entity(2, 'restless_bones');
    const villager = entity(3, 'trader_wilkes', 'npc');

    expect(scoreItemReaction(frame(), cursed, undead).reaction).toBe('approach');
    expect(scoreItemReaction(frame(), cursed, villager).reaction).toBe('avoid');
  });

  it('uses authored NPC profile item interests for local reactions', () => {
    const potion = droppedItemSemantic('minor_healing_potion', 0, 99)!;
    const sword = droppedItemSemantic('worn_sword', 0, 99)!;

    expect(scoreItemReaction(frame(), potion, entity(4, 'apothecary_lin', 'npc'))).toMatchObject({
      reaction: 'approach',
      lineId: 'hudChrome.aiSpeech.itemInterestApproach',
    });
    expect(scoreItemReaction(frame(), sword, entity(5, 'marshal_redbrook', 'npc'))).toMatchObject({
      reaction: 'approach',
      lineId: 'hudChrome.aiSpeech.itemInterestApproach',
    });
  });

  it('ranks the strongest local reaction first for the same discarded item', () => {
    const reactions = rankItemReactions(frame(), droppedItemSemantic('roasted_boar', 0, 99)!, [
      entity(1, 'forest_wolf'),
      entity(2, 'stormcrag_elemental'),
    ]);
    expect(reactions[0].entity.templateId).toBe('forest_wolf');
    expect(reactions[0].reaction).toBe('approach');
  });

  it('can surface a singularity line for an otherwise ordinary nearby mob', () => {
    const reaction = scoreItemReaction(
      frame(),
      droppedItemSemantic('roasted_boar', 0, 99)!,
      entity(4, 'forest_wolf'),
      { worldSeed: 1, quirkThreshold: 0, singularityThreshold: 0 },
    );
    expect(reaction.individual?.tier).toBe('singularity');
    expect(reaction.lineId.startsWith('hudChrome.aiSpeech.singularity')).toBe(true);
  });
});
