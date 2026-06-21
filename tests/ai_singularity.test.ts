import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { droppedItemSemantic, type SceneFrameV1 } from '../server/ai/scene_frame';
import { sceneSemanticsAt } from '../server/ai/scene_semantics';
import { timeWeatherMood } from '../server/ai/time_weather_model';
import { applyIndividualBiasToItemReaction, individualProfileFor, isSingularityLineId } from '../server/ai/singularity';

function mob(id: number, templateId: string): Entity {
  return {
    id,
    templateId,
    kind: 'mob',
    name: templateId,
    pos: { x: 0, y: 0, z: 0 },
    dead: false,
  } as Entity;
}

function frame(): SceneFrameV1 {
  const scene = sceneSemanticsAt({ x: 0, y: 0, z: 0 }, 23 * 60);
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

describe('AI singularity profiles', () => {
  it('generates deterministic individual traits from world seed and entity identity', () => {
    const one = individualProfileFor(mob(77, 'forest_wolf'), 20061, { quirkThreshold: 0, singularityThreshold: 0.5 });
    const two = individualProfileFor(mob(77, 'forest_wolf'), 20061, { quirkThreshold: 0, singularityThreshold: 0.5 });
    expect(two).toEqual(one);
    expect(one.family).toBe('beast');
    expect(one.traits.length).toBeGreaterThan(0);
    expect(one.memorySeed).toContain('forest_wolf');
  });

  it('can promote an ordinary mob into a singularity tier for stronger reactions', () => {
    const profile = individualProfileFor(mob(12, 'wild_boar'), 1, { quirkThreshold: 0, singularityThreshold: 0 });
    expect(profile.tier).toBe('singularity');
    expect(profile.traits.length).toBeGreaterThan(0);
  });

  it('uses trait-specific singularity lineIds when a trait strongly changes item interest', () => {
    const profile = {
      ...individualProfileFor(mob(9, 'forest_wolf'), 1, { quirkThreshold: 0, singularityThreshold: 0 }),
      traits: ['foodFixated' as const],
      tier: 'singularity' as const,
    };
    const biased = applyIndividualBiasToItemReaction(
      { reaction: 'inspect', score: 0.35, fear: 0.1, curiosity: 0.35, lineId: 'hudChrome.aiSpeech.itemInterestInspect' },
      profile,
      droppedItemSemantic('roasted_boar', 0, 1)!,
      frame(),
    );
    expect(biased.reaction).toBe('approach');
    expect(biased.lineId).toBe('hudChrome.aiSpeech.singularityFoodFixated');
    expect(isSingularityLineId(biased.lineId)).toBe(true);
    expect(biased.score).toBeGreaterThan(0.35);
  });
});
