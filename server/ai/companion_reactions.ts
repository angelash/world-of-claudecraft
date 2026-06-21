import type { SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import type { SceneFrameV1 } from './scene_frame';

interface CompanionReactionSpec {
  lineId: string;
  kind: 'avoid' | 'inspect';
}

export function companionReactionEvents(context: AiJobContextV1): SimEvent[] {
  if (!context.scene) return [];
  return companionReactionEventsForScene(context.scene, context.player.entityId);
}

export function companionReactionEventsForScene(scene: SceneFrameV1, playerEntityId: number): SimEvent[] {
  if (scene.companions.length === 0) return [];
  const sceneTags = [...new Set([
    ...scene.locationTags,
    ...scene.structureTags,
    ...scene.environmentalTags,
  ])].slice(0, 8);
  const out: SimEvent[] = [];
  for (const companion of scene.companions.slice(0, 2)) {
    const spec = reactionForCompanion(scene, companion.family);
    if (!spec) continue;
    out.push({
      type: 'aiSpeech',
      speakerId: companion.entityId,
      speakerName: companion.displayName,
      speech: {
        mode: 'lineId',
        lineId: spec.lineId,
        values: {
          companionName: companion.displayName,
          companionTemplateId: companion.templateId,
          sceneId: scene.subsceneId ?? scene.zoneId,
        },
      },
      source: 'fallback',
      reaction: {
        kind: spec.kind,
        sceneTags,
      },
      pid: playerEntityId,
    });
  }
  return out;
}

function reactionForCompanion(scene: SceneFrameV1, family: string | null): CompanionReactionSpec | null {
  if (family === 'demon' && (scene.locationTags.includes('safeTown') || scene.structureTags.includes('ruinedChapel') || scene.environmentalTags.includes('militaryOrder'))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfDemonDefiance', kind: 'avoid' };
  }
  if (family === 'undead' && (scene.light.level === 'bright' || scene.environmentalTags.includes('sunlit') || scene.locationTags.includes('safeTown'))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfUndeadDayHollow', kind: 'avoid' };
  }
  if (family === 'beast' && sceneHasAny(scene, ['deathPressure', 'undeadMemory', 'graveSoil', 'oldBlood', 'hotIron', 'sparks'])) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfBeastScentUneasy', kind: 'avoid' };
  }
  if (family === 'murloc' && (scene.weather.kind === 'rain' || sceneHasAny(scene, ['shore', 'dock', 'openWater', 'fishSmell', 'wetWood', 'moonlitWater']))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfMurlocWaterCall', kind: 'inspect' };
  }
  if (family === 'spider' && (scene.weather.kind === 'fog' || sceneHasAny(scene, ['lowVisibility', 'marshFog', 'insectNoise', 'graveSoil']))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfSpiderStillness', kind: 'inspect' };
  }
  if (family === 'elemental' && (scene.weather.kind !== 'clear' || scene.light.tags.includes('starrySky') || sceneHasAny(scene, ['hotIron', 'sparks', 'coldWind', 'thinAir']))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfElementalResonance', kind: 'inspect' };
  }
  if (family === 'dragonkin' && (scene.light.tags.includes('starrySky') || sceneHasAny(scene, ['highView', 'oldStone', 'cryptGate', 'moonlitWater']))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfDragonkinWatch', kind: 'inspect' };
  }
  if ((family === 'humanoid' || family === 'kobold' || family === 'troll' || family === 'ogre') && scene.locationTags.includes('safeTown') && scene.time.phase === 'day') {
    return { lineId: 'hudChrome.aiSpeech.companionSelfMortalSafeHaven', kind: 'inspect' };
  }
  const livingOrUnsure = family !== 'undead' && family !== 'demon';
  if (livingOrUnsure && (scene.danger.undeadPressure >= 0.3 || scene.environmentalTags.includes('deathPressure') || scene.environmentalTags.includes('undeadMemory'))) {
    return { lineId: 'hudChrome.aiSpeech.companionSelfUndeadFear', kind: 'avoid' };
  }
  if (scene.weather.kind === 'rain') return { lineId: 'hudChrome.aiSpeech.companionSelfRainTired', kind: 'avoid' };
  if (scene.light.tags.includes('starrySky')) return { lineId: 'hudChrome.aiSpeech.companionSelfStarrySky', kind: 'inspect' };
  if (scene.time.phase === 'night' && scene.danger.hostileDensity >= 0.25) return { lineId: 'hudChrome.aiSpeech.companionSelfNightNervous', kind: 'avoid' };
  return null;
}

function sceneHasAny(scene: NonNullable<AiJobContextV1['scene']>, tags: readonly string[]): boolean {
  const sceneTags = new Set([
    ...scene.biomeTags,
    ...scene.locationTags,
    ...scene.structureTags,
    ...scene.environmentalTags,
    ...scene.time.tags,
    ...scene.weather.tags,
    ...scene.light.tags,
  ]);
  return tags.some((tag) => sceneTags.has(tag));
}
