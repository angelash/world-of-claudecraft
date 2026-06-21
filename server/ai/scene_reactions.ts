import type { Entity, SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import { profileFor } from './profiles';

export function sceneAwarenessEvent(context: AiJobContextV1, speaker: Entity): SimEvent | null {
  const scene = context.scene;
  if (!scene) return null;
  const profile = profileFor(context.entity.kind, context.entity.templateId);
  const sensitivity = profile.timeWeatherSensitivity ?? {
    dayEnergy: 0.5,
    nightFatigue: 0.5,
    clearNightAwe: 0.35,
    rainIrritation: 0.4,
    fogFear: 0.35,
  };
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
  const profileFearsUndeadPressure = profileAvoidsAny(profile, ['deathPressure', 'undeadMemory', 'graveSoil', 'cursed']);
  if (scene.danger.undeadPressure >= (profileFearsUndeadPressure ? 0.28 : 0.45) || scene.environmentalTags.includes('deathPressure')) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneUndeadPressure', commonValues, 'avoid');
  }
  if (scene.weather.kind === 'rain' && (sensitivity.rainIrritation >= 0.15 || profileCommentsOn(profile, 'rain'))) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneRainWeariness', commonValues, 'seekShelter');
  }
  if (scene.weather.kind === 'fog' && (sensitivity.fogFear >= 0.25 || profileCommentsOn(profile, 'fog'))) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneFogUnease', commonValues, 'inspect');
  }
  if (scene.light.tags.includes('starrySky')
    && (scene.subsceneId === 'mirror_lake_dock' || sensitivity.clearNightAwe >= 0.45 || profileCommentsOn(profile, 'starrySky'))) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneClearNightAwe', commonValues, 'inspect');
  }
  if (scene.time.phase === 'day' && scene.danger.safeHavenScore >= 0.6 && sensitivity.dayEnergy >= 0.35) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneDayEnergy', commonValues, 'inspect');
  }
  if (scene.time.phase === 'night'
    && scene.danger.safeHavenScore < 0.6
    && (scene.danger.hostileDensity >= 0.3 || sensitivity.nightFatigue >= 0.45)) {
    return line(context, speaker, 'hudChrome.aiSpeech.sceneNightFatigue', commonValues, 'avoid');
  }
  return null;
}

function profileAvoidsAny(profile: ReturnType<typeof profileFor>, tags: readonly string[]): boolean {
  return tags.some((tag) => profile.sceneAffinities?.avoidsTags.includes(tag) || profile.itemInterest?.avoidsTags.includes(tag));
}

function profileCommentsOn(profile: ReturnType<typeof profileFor>, tag: string): boolean {
  return Boolean(profile.sceneAffinities?.commentsOnTags.includes(tag) || profile.sceneAffinities?.likesTags.includes(tag));
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
