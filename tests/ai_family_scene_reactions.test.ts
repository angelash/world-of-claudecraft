import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import { familySceneReactionEvent, rankFamilySceneReactions, scoreFamilySceneReaction } from '../server/ai/family_scene_reactions';
import type { SceneFrameV1, SceneObjectSemantic } from '../server/ai/scene_frame';
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

function sceneObject(overrides: Partial<SceneObjectSemantic> & Pick<SceneObjectSemantic, 'objectId'>): SceneObjectSemantic {
  return {
    source: 'sceneAnchor',
    entityId: null,
    templateId: `scene_anchor:${overrides.objectId}`,
    displayName: overrides.objectId,
    tags: [],
    featureTags: [],
    affordanceTags: [],
    distance: 6,
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
    expect(reaction?.reasonTags).toContain('nightFatigue');
  });

  it('threads time and weather mood into ordinary creature scene evidence', () => {
    const rainyForge = frame(8, 17, 12 * 60, {
      weather: { kind: 'rain', intensity: 0.7, tags: ['rain', 'shelterWanted'] },
      light: { level: 'dim', tags: ['softLight'] },
      mood: { dayEnergy: 0.3, nightFatigue: 0.1, clearNightAwe: 0, rainIrritation: 0.7, fogFear: 0 },
      environmentalTags: ['hotIron', 'sparks', 'workNoise', 'rain', 'shelterWanted'],
    });
    const beast = scoreFamilySceneReaction(rainyForge, mob(14, 'forest_wolf'));
    expect(beast).toMatchObject({
      family: 'beast',
      reaction: 'avoid',
      reasonTags: expect.arrayContaining(['forge', 'rainIrritation']),
    });

    const rainyLake = frame(-64, 60, 12 * 60, {
      weather: { kind: 'rain', intensity: 0.7, tags: ['rain', 'shelterWanted'] },
      light: { level: 'dim', tags: ['softLight'] },
      mood: { dayEnergy: 0.3, nightFatigue: 0.1, clearNightAwe: 0, rainIrritation: 0.7, fogFear: 0 },
    });
    const murloc = scoreFamilySceneReaction(rainyLake, mob(15, 'mudfin_murloc'));
    expect(murloc).toMatchObject({
      family: 'murloc',
      reaction: 'approach',
      reasonTags: expect.arrayContaining(['rain', 'waterComfort']),
    });
  });

  it('lets object affordances wake local creature body language', () => {
    const scene = frame(-10, 120, 10 * 60, {
      biomeTags: ['vale'],
      locationTags: ['forest'],
      structureTags: [],
      environmentalTags: [],
      nearbySemanticObjects: [
        sceneObject({
          source: 'entity',
          objectId: 'roasted_boar',
          entityId: 99,
          templateId: 'ground_roasted_boar',
          tags: ['food', 'meat'],
          featureTags: ['strongScent'],
          affordanceTags: ['inspectObject', 'sniffObject'],
          distance: 4,
        }),
      ],
    });
    const reaction = scoreFamilySceneReaction(scene, mob(16, 'forest_wolf'));
    expect(reaction).toMatchObject({
      family: 'beast',
      reaction: 'approach',
      focusedObject: expect.objectContaining({
        objectId: 'roasted_boar',
        entityId: 99,
        reaction: 'approach',
        reasonTags: expect.arrayContaining(['food', 'sniffObject']),
      }),
    });
    expect(familySceneReactionEvent(reaction!, scene, 1)).toMatchObject({
      reaction: expect.objectContaining({
        kind: 'approach',
        targetObjectId: 99,
        targetItemId: 'roasted_boar',
        sceneTags: expect.arrayContaining(['sniffObject']),
      }),
    });
  });

  it('uses scene anchor affordances when there is no targetable object entity', () => {
    const scene = frame(-10, 120, 10 * 60, {
      biomeTags: ['vale'],
      locationTags: ['forest'],
      structureTags: [],
      environmentalTags: [],
      nearbySemanticObjects: [
        sceneObject({
          objectId: 'threshold_with_cold_draft',
          tags: ['cryptGate'],
          featureTags: ['coldDraft', 'boneDust'],
          affordanceTags: ['fleeFromDark', 'hesitateAtThreshold'],
          distance: 5,
        }),
      ],
    });
    const reaction = scoreFamilySceneReaction(scene, mob(17, 'forest_wolf'));
    expect(reaction).toMatchObject({
      family: 'beast',
      reaction: 'avoid',
      focusedObject: expect.objectContaining({
        objectId: 'threshold_with_cold_draft',
        entityId: null,
        reaction: 'avoid',
        reasonTags: expect.arrayContaining(['fleeFromDark', 'boneDust']),
      }),
    });
    const event = familySceneReactionEvent(reaction!, scene, 1);
    expect(event).toMatchObject({
      reaction: expect.objectContaining({
        kind: 'avoid',
        targetItemId: 'threshold_with_cold_draft',
        sceneTags: expect.arrayContaining(['fleeFromDark']),
      }),
    });
    expect(event.type === 'aiSpeech' ? event.reaction : null).not.toHaveProperty('targetObjectId');
  });

  it('ranks star-aware singularity creatures above ordinary scene readers', () => {
    const scene = frame(0, 660, 23 * 60, {
      light: { level: 'dark', tags: ['starrySky'] },
      mood: { dayEnergy: 0.2, nightFatigue: 0.65, clearNightAwe: 0.8, rainIrritation: 0, fogFear: 0 },
      environmentalTags: ['coldWind', 'highView', 'militaryOrder', 'thinAir', 'starrySky'],
    });
    const reactions = rankFamilySceneReactions(scene, [
      mob(12, 'stormcrag_elemental'),
      mob(13, 'forest_wolf'),
    ], { worldSeed: 1, quirkThreshold: 0, singularityThreshold: 0 });

    expect(reactions[0]).toMatchObject({
      family: 'elemental',
      lineId: 'hudChrome.aiSpeech.familySceneElementalResonance',
      reasonTags: expect.arrayContaining(['clearNightAwe']),
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
