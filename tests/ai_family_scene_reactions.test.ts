import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { familySceneReactionEvent, rankFamilySceneReactions, scoreFamilySceneReaction } from '../server/ai/family_scene_reactions';
import type { SceneFrameV1 } from '../server/ai/scene_frame';
import { sceneSemanticsAt } from '../server/ai/scene_semantics';
import { timeWeatherMood } from '../server/ai/time_weather_model';

function mob(id: number, templateId: string, x = 0, z = 0): Entity {
  return {
    id,
    templateId,
    kind: 'mob',
    name: templateId,
    pos: { x, y: 0, z },
    dead: false,
    hostile: true,
    ownerId: null,
  } as Entity;
}

function frame(x: number, z: number, timeSeconds = 8 * 60, overrides: Partial<SceneFrameV1> = {}): SceneFrameV1 {
  const scene = sceneSemanticsAt({ x, y: 0, z }, timeSeconds);
  return {
    ...scene,
    nearbySemanticObjects: [],
    droppedItems: [],
    companions: [],
    mood: timeWeatherMood(scene.time, scene.weather, scene.light),
    recentSceneEvents: [],
    danger: { undeadPressure: 0, hostileDensity: 0, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.1 },
    ...overrides,
  };
}

describe('AI family scene reactions', () => {
  it('lets beasts treat forge scenes as something to avoid by scent and sound', () => {
    const reaction = scoreFamilySceneReaction(frame(8, 17), mob(10, 'forest_wolf'));
    expect(reaction).toMatchObject({
      family: 'beast',
      reaction: 'avoid',
      lineId: 'hudChrome.aiSpeech.familySceneBeastUneasy',
    });
    expect(reaction?.reasonTags).toEqual(expect.arrayContaining(['forge', 'workNoise']));
  });

  it('draws undead into death-pressure scenes without turning it into combat logic', () => {
    const reaction = scoreFamilySceneReaction(frame(80, 86, 23 * 60), mob(11, 'restless_bones'), {
      worldSeed: 1,
      quirkThreshold: 1,
      singularityThreshold: 1,
    });
    expect(reaction).toMatchObject({
      family: 'undead',
      reaction: 'approach',
      lineId: 'hudChrome.aiSpeech.familySceneUndeadDrawn',
    });
    expect(reaction?.score).toBeGreaterThan(0.5);
    expect(reaction?.individual.tier).toBe('none');
  });

  it('ranks star-aware singularity creatures above ordinary scene readers', () => {
    const scene = frame(0, 660, 23 * 60, {
      light: { level: 'dark', tags: ['starrySky'] },
      environmentalTags: ['coldWind', 'highView', 'militaryOrder', 'thinAir', 'starrySky'],
    });
    const reactions = rankFamilySceneReactions(scene, [
      mob(12, 'stormcrag_elemental'),
      mob(13, 'forest_wolf'),
    ], { worldSeed: 1, quirkThreshold: 0, singularityThreshold: 0 });

    expect(reactions[0]).toMatchObject({
      family: 'elemental',
      lineId: 'hudChrome.aiSpeech.familySceneElementalResonance',
      individual: expect.objectContaining({ tier: 'singularity' }),
    });
    expect(familySceneReactionEvent(reactions[0], scene, 1)).toMatchObject({
      speech: {
        values: expect.objectContaining({
          speakerTemplateId: 'stormcrag_elemental',
          individualAlias: expect.any(String),
        }),
      },
    });
  });
});
