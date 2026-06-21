import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';

export function sceneAwarenessEvent(context: AiJobContextV1, speaker: Entity): SimEvent | null {
  const scene = context.scene;
  if (!scene) return null;
  const companion = scene.companions.find((c) => c.family !== 'undead' && c.family !== 'demon');
  const demonCompanion = scene.companions.find((c) => c.family === 'demon');
  const undeadCompanion = scene.companions.find((c) => c.family === 'undead');
  const commonValues = {
    speakerName: speaker.name,
    subsceneId: scene.subsceneId ?? scene.zoneId,
  };

  if (demonCompanion && isOrderedOrSacredScene(scene)) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneDemonCompanionUnease', {
      ...commonValues,
      companionName: demonCompanion.displayName,
      companionTemplateId: demonCompanion.templateId,
    }, 'avoid');
  }
  if (undeadCompanion && isLivingTownScene(scene)) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneUndeadCompanionUnease', {
      ...commonValues,
      companionName: undeadCompanion.displayName,
      companionTemplateId: undeadCompanion.templateId,
    }, 'avoid');
  }
  if (companion && scene.danger.undeadPressure >= 0.3) {
    return line(context, speaker, 'hudChrome.aiSpeech.companionUndeadFear', {
      ...commonValues,
      companionName: companion.displayName,
      companionTemplateId: companion.templateId,
    }, 'avoid');
  }
  if (scene.danger.undeadPressure >= 0.45 || scene.environmentalTags.includes('deathPressure')) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneUndeadPressure', commonValues, 'avoid');
  }
  if (scene.weather.kind === 'rain') {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneRainWeariness', commonValues, 'seekShelter');
  }
  if (scene.weather.kind === 'fog') {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneFogUnease', commonValues, 'inspect');
  }
  if (scene.subsceneId === 'mirror_lake_dock' && scene.light.tags.includes('starrySky')) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneClearNightAwe', commonValues, 'inspect');
  }
  if (scene.time.phase === 'day' && scene.danger.safeHavenScore >= 0.6) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneDayEnergy', commonValues, 'inspect');
  }
  if (scene.time.phase === 'night' && scene.danger.safeHavenScore < 0.6 && scene.danger.hostileDensity >= 0.3) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneNightFatigue', commonValues, 'avoid');
  }
  return null;
}

function isOrderedOrSacredScene(scene: NonNullable<AiJobContextV1['scene']>): boolean {
  return scene.locationTags.includes('safeTown')
    || scene.locationTags.includes('watchPost')
    || scene.structureTags.includes('ruinedChapel')
    || scene.structureTags.includes('brokenBell')
    || scene.environmentalTags.includes('militaryOrder');
}

function isLivingTownScene(scene: NonNullable<AiJobContextV1['scene']>): boolean {
  return scene.locationTags.includes('safeTown')
    || scene.locationTags.includes('town')
    || scene.light.level === 'bright'
    || scene.environmentalTags.includes('sunlit');
}

function line(
  context: AiJobContextV1,
  speaker: Entity,
  lineId: string,
  values: Record<string, string | number>,
  kind: 'avoid' | 'inspect' | 'seekShelter',
): SimEvent {
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: { mode: 'lineId', lineId, values },
    source: 'fallback',
    reaction: {
      kind: kind === 'seekShelter' ? 'inspect' : kind,
      sceneTags: context.scene ? [...new Set([...context.scene.locationTags, ...context.scene.structureTags, ...context.scene.environmentalTags])].slice(0, 8) : [],
    },
    pid: context.player.entityId,
  };
}
