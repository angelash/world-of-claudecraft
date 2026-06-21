import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { objectInspectionEvent } from '../server/ai/object_reactions';
import { lightSemanticFor, timeSemanticAt, timeWeatherMood, weatherSemanticAt } from '../server/ai/time_weather_model';
import type { Entity } from '../src/sim/types';

function object(itemId: string | null, templateId = itemId ? `ground_${itemId}` : 'dungeon_door'): Entity {
  return {
    id: 10,
    kind: 'object',
    templateId,
    name: itemId ?? 'Hollow Crypt',
    level: 1,
    questIds: [],
    dead: false,
    objectItemId: itemId,
    dungeonId: templateId === 'dungeon_door' ? 'hollow_crypt' : null,
    lootable: true,
  } as unknown as Entity;
}

function eventLineId(event: ReturnType<typeof objectInspectionEvent>): string | null {
  if (!event || event.type !== 'aiSpeech' || event.speech.mode !== 'lineId') return null;
  return event.speech.lineId;
}

function context(sceneTags: { location?: string[]; structure?: string[]; environmental?: string[] }): AiJobContextV1 {
  const time = timeSemanticAt(0);
  const weather = weatherSemanticAt('eastbrook_vale', 0);
  const light = lightSemanticFor(time, weather);
  return {
    schemaVersion: 1,
    jobId: 'test-object-inspect',
    trigger: 'object_inspected',
    entity: {
      kind: 'object',
      entityId: 10,
      templateId: 'ground_test',
      name: 'Test Object',
      level: 1,
      questIds: [],
      dead: false,
    },
    player: {
      entityId: 1,
      name: 'Ari',
      level: 1,
      classId: 'warrior',
      activeQuestIds: [],
      completedQuestIds: [],
    },
    locale: 'en',
    scene: {
      zoneId: 'eastbrook_vale',
      subsceneId: 'test_scene',
      biomeTags: ['vale'],
      locationTags: sceneTags.location ?? [],
      structureTags: sceneTags.structure ?? [],
      environmentalTags: sceneTags.environmental ?? [],
      nearbySemanticObjects: [],
      droppedItems: [],
      companions: [],
      time,
      weather,
      light,
      mood: timeWeatherMood(time, weather, light),
      recentSceneEvents: [],
      danger: {
        undeadPressure: 0,
        hostileDensity: 0,
        corpseDensity: 0,
        recentDeaths: 0,
        safeHavenScore: 0.5,
      },
    },
    familySemantics: null,
    questFacts: [],
    recentObservations: [],
    allowedIntents: ['inspectObject', 'commentOnScene'],
    allowedLineIds: [],
    outputMode: 'line_id_only',
  };
}

describe('objectInspectionEvent', () => {
  it('uses forge language for metal objects in forge scenes', () => {
    const event = objectInspectionEvent(context({ structure: ['forge'], environmental: ['hotIron'] }), object('redbrook_blade'));
    expect(event?.type).toBe('aiSpeech');
    expect(eventLineId(event)).toBe('hudChrome.aiSpeech.objectInspectForge');
  });

  it('uses lake language for shore objects', () => {
    const event = objectInspectionEvent(context({ location: ['shore', 'fishing'], environmental: ['openWater'] }), object('moongate_rubbing'));
    expect(event?.type).toBe('aiSpeech');
    expect(eventLineId(event)).toBe('hudChrome.aiSpeech.objectInspectLake');
  });

  it('lets alien debris feel singular instead of generic', () => {
    const event = objectInspectionEvent(context({}), object('unknown_alien_weaponry'));
    expect(event?.type).toBe('aiSpeech');
    expect(eventLineId(event)).toBe('hudChrome.aiSpeech.objectInspectSingularity');
  });
});
