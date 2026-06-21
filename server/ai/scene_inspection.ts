import type { Entity, SimEvent } from '../../src/sim/types';
import type { SceneFrameV1 } from './scene_frame';

export const SCENE_INSPECTION_LINE_IDS = [
  'hudChrome.aiSpeech.sceneInspectForge',
  'hudChrome.aiSpeech.sceneInspectChapel',
  'hudChrome.aiSpeech.sceneInspectLake',
  'hudChrome.aiSpeech.sceneInspectWatchpost',
  'hudChrome.aiSpeech.sceneInspectCrypt',
  'hudChrome.aiSpeech.sceneInspectGeneric',
] as const;

export function sceneInspectionEvent(scene: SceneFrameV1, player: Entity): SimEvent {
  const lineId = sceneInspectionLineId(scene);
  return {
    type: 'aiSpeech',
    speakerId: player.id,
    speakerName: player.name,
    speech: {
      mode: 'lineId',
      lineId,
      values: {
        playerName: player.name,
        sceneId: scene.subsceneId ?? scene.zoneId,
      },
    },
    source: 'fallback',
    reaction: {
      kind: 'inspect',
      sceneTags: [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags])].slice(0, 8),
    },
    pid: player.id,
  };
}

export function sceneInspectionLineId(scene: SceneFrameV1): typeof SCENE_INSPECTION_LINE_IDS[number] {
  if (scene.subsceneId === 'abandoned_crypt_entrance' || scene.environmentalTags.includes('sealedAir')) return 'hudChrome.aiSpeech.sceneInspectCrypt';
  if (scene.locationTags.includes('watchPost') || scene.environmentalTags.includes('militaryOrder')) return 'hudChrome.aiSpeech.sceneInspectWatchpost';
  if (scene.structureTags.includes('forge') || scene.environmentalTags.includes('hotIron')) return 'hudChrome.aiSpeech.sceneInspectForge';
  if (scene.structureTags.includes('ruinedChapel') || scene.environmentalTags.includes('graveSoil')) return 'hudChrome.aiSpeech.sceneInspectChapel';
  if (scene.locationTags.includes('dock') || scene.environmentalTags.includes('openWater')) return 'hudChrome.aiSpeech.sceneInspectLake';
  return 'hudChrome.aiSpeech.sceneInspectGeneric';
}
