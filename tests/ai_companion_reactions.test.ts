import { describe, expect, it } from 'vitest';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import { companionReactionEvents } from '../server/ai/companion_reactions';
import { lightSemanticFor, timeSemanticAt, timeWeatherMood, weatherSemanticAt } from '../server/ai/time_weather_model';

function context(overrides: {
  family?: string | null;
  environmental?: string[];
  undeadPressure?: number;
  weatherKind?: 'clear' | 'rain' | 'fog';
  starry?: boolean;
} = {}): AiJobContextV1 {
  const time = overrides.starry ? timeSemanticAt(22 * 60) : timeSemanticAt(10 * 60);
  const baseWeather = weatherSemanticAt('eastbrook_vale', 0);
  const weather = overrides.weatherKind
    ? { ...baseWeather, kind: overrides.weatherKind, tags: overrides.weatherKind === 'rain' ? ['rain'] : overrides.weatherKind === 'fog' ? ['fog'] : ['clearSky'] }
    : baseWeather;
  const light = overrides.starry ? { ...lightSemanticFor(time, weather), tags: ['moonlight', 'starrySky'] } : lightSemanticFor(time, weather);
  return {
    schemaVersion: 1,
    jobId: 'companion-job',
    trigger: 'object_inspected',
    entity: { kind: 'object', entityId: 10, templateId: 'ground_test', name: 'Test Object', level: 1, questIds: [], dead: false },
    player: { entityId: 1, name: 'Ari', level: 1, classId: 'hunter', activeQuestIds: [], completedQuestIds: [] },
    locale: 'en',
    scene: {
      zoneId: 'eastbrook_vale',
      subsceneId: 'fallen_chapel',
      biomeTags: ['vale'],
      locationTags: ['questSite'],
      structureTags: ['ruinedChapel'],
      environmentalTags: overrides.environmental ?? [],
      nearbySemanticObjects: [],
      droppedItems: [],
      companions: [{ entityId: 22, templateId: 'forest_wolf', displayName: 'Forest Wolf', family: overrides.family ?? 'beast', tags: ['pet', 'beast'] }],
      time,
      weather,
      light,
      mood: timeWeatherMood(time, weather, light),
      recentSceneEvents: [],
      danger: {
        undeadPressure: overrides.undeadPressure ?? 0,
        hostileDensity: 0,
        corpseDensity: 0,
        recentDeaths: 0,
        safeHavenScore: 0.2,
      },
    },
    familySemantics: null,
    questFacts: [],
    recentObservations: [],
    allowedIntents: ['commentOnScene'],
    outputMode: 'line_id_only',
  };
}

function lineId(ctx: AiJobContextV1): string | null {
  const event = companionReactionEvents(ctx)[0];
  if (!event || event.type !== 'aiSpeech' || event.speech.mode !== 'lineId') return null;
  return event.speech.lineId;
}

describe('companionReactionEvents', () => {
  it('makes living companions fearful in undead pressure scenes', () => {
    expect(lineId(context({ environmental: ['deathPressure'], undeadPressure: 0.5 }))).toBe('hudChrome.aiSpeech.companionSelfUndeadFear');
  });

  it('does not make undead companions fear undead pressure', () => {
    expect(lineId(context({ family: 'undead', environmental: ['deathPressure'], undeadPressure: 0.5 }))).toBe(null);
  });

  it('uses weather and starry-sky moods when the scene is otherwise safe', () => {
    expect(lineId(context({ weatherKind: 'rain' }))).toBe('hudChrome.aiSpeech.companionSelfRainTired');
    expect(lineId(context({ starry: true }))).toBe('hudChrome.aiSpeech.companionSelfStarrySky');
  });
});
