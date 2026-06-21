import type { SimEvent } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import { familyDirectorProjectionFor, mobFamilyFromValue } from './director_family_projection';
import type { SceneFrameV1 } from './scene_frame';
import type { AiWorldDirectorProposal } from './world_director';

interface CompanionReactionSpec {
  lineId: string;
  kind: 'avoid' | 'inspect';
  reasonTags?: string[];
}

interface CompanionReactionOptions {
  directorProposals?: readonly AiWorldDirectorProposal[];
}

export function companionReactionEvents(context: AiJobContextV1): SimEvent[] {
  if (!context.scene) return [];
  return companionReactionEventsForScene(context.scene, context.player.entityId, {
    directorProposals: context.directorProposals,
  });
}

export function companionReactionEventsForScene(scene: SceneFrameV1, playerEntityId: number, options: CompanionReactionOptions = {}): SimEvent[] {
  if (scene.companions.length === 0) return [];
  const sceneTags = [...new Set([
    ...scene.locationTags,
    ...scene.structureTags,
    ...scene.environmentalTags,
    ...directorSceneTags(options.directorProposals ?? []),
  ])].slice(0, 8);
  const out: SimEvent[] = [];
  for (const companion of scene.companions.slice(0, 2)) {
    const spec = reactionForCompanion(scene, companion.family, options.directorProposals ?? []);
    if (!spec) continue;
    const companionSceneTags = [...new Set([
      ...sceneTags,
      ...(spec.reasonTags ?? []),
    ])].slice(0, 8);
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
        sceneTags: companionSceneTags,
      },
      pid: playerEntityId,
    });
  }
  return out;
}

function reactionForCompanion(scene: SceneFrameV1, family: string | null, directorProposals: readonly AiWorldDirectorProposal[]): CompanionReactionSpec | null {
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
  const directorSpec = reactionForDirectorProposal(family, directorProposals);
  if (directorSpec) return directorSpec;
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

function reactionForDirectorProposal(family: string | null, proposals: readonly AiWorldDirectorProposal[]): CompanionReactionSpec | null {
  const mobFamily = mobFamilyFromValue(family);
  if (mobFamily) {
    for (const proposal of proposals.slice(0, 3)) {
      const projection = familyDirectorProjectionFor(proposal, { family: mobFamily });
      if (!projection) continue;
      return {
        lineId: companionLineIdForProjection(mobFamily, projection.reaction),
        kind: projection.reaction === 'avoid' ? 'avoid' : 'inspect',
        reasonTags: projection.reasonTags,
      };
    }
  }

  for (const proposal of proposals.slice(0, 3)) {
    const tags = new Set(proposal.reasonTags);
    if (proposal.intent === 'raiseCampCaution' || tags.has('mood:haunted') || tags.has('mood:dread')) {
      if (family === 'undead') return { lineId: 'hudChrome.aiSpeech.companionSelfUndeadDayHollow', kind: 'inspect' };
      if (family === 'demon') return { lineId: 'hudChrome.aiSpeech.companionSelfDemonDefiance', kind: 'inspect' };
      if (family === 'elemental') return { lineId: 'hudChrome.aiSpeech.companionSelfElementalResonance', kind: 'inspect' };
      return { lineId: 'hudChrome.aiSpeech.companionSelfUndeadFear', kind: 'avoid' };
    }
    if (proposal.intent === 'echoTrace' && (tags.has('mood:hungry') || tags.has('trace:food'))) {
      if (family === 'beast') return { lineId: 'hudChrome.aiSpeech.companionSelfBeastScentUneasy', kind: 'inspect' };
      if (family === 'murloc') return { lineId: 'hudChrome.aiSpeech.companionSelfMurlocWaterCall', kind: 'inspect' };
      if (family === 'elemental') return { lineId: 'hudChrome.aiSpeech.companionSelfElementalResonance', kind: 'inspect' };
    }
    if ((proposal.intent === 'nudgeNpcRumor' || proposal.intent === 'echoQuestRelief')
      && (family === 'humanoid' || family === 'kobold' || family === 'troll' || family === 'ogre')) {
      return { lineId: 'hudChrome.aiSpeech.companionSelfMortalSafeHaven', kind: 'inspect' };
    }
  }
  return null;
}

function companionLineIdForProjection(family: NonNullable<ReturnType<typeof mobFamilyFromValue>>, reaction: 'approach' | 'avoid' | 'inspect'): string {
  if (reaction === 'avoid' && family !== 'undead' && family !== 'demon') return 'hudChrome.aiSpeech.companionSelfUndeadFear';
  switch (family) {
    case 'beast': return 'hudChrome.aiSpeech.companionSelfBeastScentUneasy';
    case 'murloc': return 'hudChrome.aiSpeech.companionSelfMurlocWaterCall';
    case 'spider': return 'hudChrome.aiSpeech.companionSelfSpiderStillness';
    case 'undead': return 'hudChrome.aiSpeech.companionSelfUndeadDayHollow';
    case 'elemental': return 'hudChrome.aiSpeech.companionSelfElementalResonance';
    case 'dragonkin': return 'hudChrome.aiSpeech.companionSelfDragonkinWatch';
    case 'demon': return 'hudChrome.aiSpeech.companionSelfDemonDefiance';
    case 'humanoid':
    case 'kobold':
    case 'troll':
    case 'ogre':
      return 'hudChrome.aiSpeech.companionSelfMortalSafeHaven';
  }
}

function directorSceneTags(proposals: readonly AiWorldDirectorProposal[]): string[] {
  const tags: string[] = [];
  for (const proposal of proposals.slice(0, 3)) {
    tags.push(`director:${proposal.intent}`, ...proposal.reasonTags.slice(0, 3));
  }
  return tags;
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
