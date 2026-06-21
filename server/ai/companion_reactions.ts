import type { SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';

export function companionReactionEvents(context: AiJobContextV1): SimEvent[] {
  const scene = context.scene;
  if (!scene || scene.companions.length === 0) return [];
  const sceneTags = [...new Set([
    ...scene.locationTags,
    ...scene.structureTags,
    ...scene.environmentalTags,
  ])].slice(0, 8);
  const out: SimEvent[] = [];
  for (const companion of scene.companions.slice(0, 2)) {
    const lineId = lineIdForCompanion(context, companion.family);
    if (!lineId) continue;
    out.push({
      type: 'aiSpeech',
      speakerId: companion.entityId,
      speakerName: companion.displayName,
      speech: {
        mode: 'lineId',
        lineId,
        values: {
          companionName: companion.displayName,
          companionTemplateId: companion.templateId,
          sceneId: scene.subsceneId ?? scene.zoneId,
        },
      },
      source: 'fallback',
      reaction: {
        kind: lineId === 'hudChrome.aiSpeech.companionSelfStarrySky' ? 'inspect' : 'avoid',
        sceneTags,
      },
      pid: context.player.entityId,
    });
  }
  return out;
}

function lineIdForCompanion(context: AiJobContextV1, family: string | null): string | null {
  const scene = context.scene;
  if (!scene) return null;
  const livingOrUnsure = family !== 'undead' && family !== 'demon';
  if (livingOrUnsure && (scene.danger.undeadPressure >= 0.3 || scene.environmentalTags.includes('deathPressure') || scene.environmentalTags.includes('undeadMemory'))) {
    return 'hudChrome.aiSpeech.companionSelfUndeadFear';
  }
  if (scene.weather.kind === 'rain') return 'hudChrome.aiSpeech.companionSelfRainTired';
  if (scene.light.tags.includes('starrySky')) return 'hudChrome.aiSpeech.companionSelfStarrySky';
  if (scene.time.phase === 'night' && scene.danger.hostileDensity >= 0.25) return 'hudChrome.aiSpeech.companionSelfNightNervous';
  return null;
}
