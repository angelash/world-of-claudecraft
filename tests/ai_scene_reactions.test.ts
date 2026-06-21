import { describe, expect, it } from 'vitest';
import type { Entity } from '../src/sim/types';
import type { AiJobContextV1 } from '../server/ai/ai_types';
import type { SceneFrameV1 } from '../server/ai/scene_frame';
import { sceneAwarenessEvent } from '../server/ai/scene_reactions';
import { sceneSemanticsAt } from '../server/ai/scene_semantics';
import { timeWeatherMood } from '../server/ai/time_weather_model';

const speaker = { id: 7, name: 'Brother Aldric', kind: 'npc', templateId: 'brother_aldric' } as Entity;

function frame(overrides: Partial<SceneFrameV1>): SceneFrameV1 {
  const scene = sceneSemanticsAt({ x: 80, y: 0, z: 86 }, 8 * 60);
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

function context(scene: SceneFrameV1): AiJobContextV1 {
  return {
    schemaVersion: 1,
    jobId: 'scene-reaction',
    trigger: 'npc_gossip_opened',
    entity: { kind: 'npc', entityId: 7, templateId: 'brother_aldric', name: 'Brother Aldric', level: 1, questIds: [], dead: false },
    player: { entityId: 1, name: 'Ari', level: 1, classId: 'hunter', activeQuestIds: [], completedQuestIds: [] },
    locale: 'en',
    scene,
    familySemantics: null,
    questFacts: [],
    recentObservations: [],
    allowedIntents: ['commentOnScene'],
    outputMode: 'line_id_only',
  };
}

describe('AI scene reactions', () => {
  it('prioritizes companion fear in undead pressure scenes', () => {
    const event = sceneAwarenessEvent(context(frame({
      companions: [{ entityId: 2, templateId: 'forest_wolf', displayName: 'Fang', family: 'beast', tags: ['pet', 'beast'] }],
      danger: { undeadPressure: 0.6, hostileDensity: 0, corpseDensity: 0, recentDeaths: 0, safeHavenScore: 0.1 },
    })), speaker);
    expect(event?.type).toBe('aiSpeech');
    expect(event && event.type === 'aiSpeech' ? event.speech : null).toMatchObject({
      mode: 'lineId',
      lineId: 'hudChrome.aiSpeech.companionUndeadFear',
    });
  });

  it('reacts to rain, fog, and starry lake scenes with distinct lines', () => {
    expect(sceneAwarenessEvent(context(frame({
      environmentalTags: [],
      weather: { kind: 'rain', intensity: 0.8, tags: ['rain'] },
    })), speaker)).toMatchObject({ speech: { lineId: 'hudChrome.aiSpeech.sceneRainWeariness' } });

    expect(sceneAwarenessEvent(context(frame({
      environmentalTags: [],
      weather: { kind: 'fog', intensity: 0.8, tags: ['fog'] },
    })), speaker)).toMatchObject({ speech: { lineId: 'hudChrome.aiSpeech.sceneFogUnease' } });

    expect(sceneAwarenessEvent(context(frame({
      environmentalTags: [],
      subsceneId: 'mirror_lake_dock',
      light: { level: 'dark', tags: ['starrySky'] },
    })), speaker)).toMatchObject({ speech: { lineId: 'hudChrome.aiSpeech.sceneClearNightAwe' } });
  });
});
