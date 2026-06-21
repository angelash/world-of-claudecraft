import type { Entity, MobFamily, SimEvent } from '../../src/sim/types';
import type { SceneFrameV1 } from './scene_frame';
import { familySemanticsFor, mobFamilyForEntity } from './family_semantics';
import { individualProfileFor } from './singularity';
import type { IndividualAiProfile } from './singularity';

export type FamilySceneReactionKind = 'approach' | 'avoid' | 'inspect' | 'ignore';

export interface FamilySceneReaction {
  entity: Entity;
  family: MobFamily;
  reaction: FamilySceneReactionKind;
  score: number;
  fear: number;
  curiosity: number;
  reasonTags: string[];
  lineId: string;
  individual: IndividualAiProfile;
}

export interface FamilySceneReactionOptions {
  worldSeed?: number;
  singularityThreshold?: number;
  quirkThreshold?: number;
}

const REACTION_RADIUS = 28;

export function nearbyFamilySceneCandidates(scene: SceneFrameV1, entities: Iterable<Entity>, origin: Entity): Entity[] {
  const radius = scene.locationTags.includes('safeTown') ? 18 : REACTION_RADIUS;
  const out: Entity[] = [];
  for (const entity of entities) {
    if (entity.id === origin.id || entity.kind !== 'mob' || entity.dead || entity.ownerId !== null) continue;
    const dx = entity.pos.x - origin.pos.x;
    const dz = entity.pos.z - origin.pos.z;
    if (dx * dx + dz * dz <= radius * radius) out.push(entity);
  }
  return out;
}

export function rankFamilySceneReactions(
  scene: SceneFrameV1,
  candidates: Entity[],
  options: FamilySceneReactionOptions = {},
): FamilySceneReaction[] {
  return candidates
    .map((entity) => scoreFamilySceneReaction(scene, entity, options))
    .filter((reaction): reaction is FamilySceneReaction => reaction !== null && reaction.reaction !== 'ignore')
    .sort((a, b) => b.score - a.score || a.entity.id - b.entity.id);
}

export function scoreFamilySceneReaction(
  scene: SceneFrameV1,
  entity: Entity,
  options: FamilySceneReactionOptions = {},
): FamilySceneReaction | null {
  const family = mobFamilyForEntity(entity);
  if (!family || entity.dead || entity.ownerId !== null) return null;
  const rules = familySemanticsFor(family);
  const sceneTags = sceneTagSet(scene);
  const amplifierCount = overlapCount(sceneTags, rules.sceneAmplifiers);
  const suppressorCount = overlapCount(sceneTags, rules.sceneSuppressors);
  const individual = individualProfileFor(entity, options.worldSeed ?? 0, {
    singularityThreshold: options.singularityThreshold,
    quirkThreshold: options.quirkThreshold,
  });

  let curiosity = rules.moodBias.curiosity * 0.22 + amplifierCount * 0.17;
  let fear = rules.moodBias.fear * 0.18 + suppressorCount * 0.2;

  const deathScene = sceneTags.has('deathPressure') || sceneTags.has('undeadMemory') || sceneTags.has('graveSoil') || sceneTags.has('oldBlood');
  if (scene.danger.undeadPressure >= 0.25 || deathScene) {
    if (family === 'undead' || family === 'demon') curiosity += 0.28 + scene.danger.undeadPressure * 0.2;
    else fear += 0.22 + scene.danger.undeadPressure * 0.35;
  }
  if (scene.danger.hostileDensity >= 0.35 && family !== 'undead' && family !== 'demon') fear += 0.18;
  if (scene.light.tags.includes('starrySky') && (family === 'elemental' || family === 'dragonkin' || individual.traits.includes('stargazer'))) {
    curiosity += family === 'elemental' || family === 'dragonkin' ? 0.7 : individual.traits.includes('stargazer') ? 0.36 : 0.22;
  }
  if (scene.weather.kind === 'fog') fear += rules.moodBias.fear * 0.12 + (family === 'spider' || family === 'undead' ? -0.08 : 0.1);
  if (scene.weather.kind === 'rain' && (family === 'murloc' || family === 'elemental')) curiosity += 0.18;
  if (scene.locationTags.includes('safeTown') && entity.hostile) fear += 0.12;
  if (scene.locationTags.includes('camp') || scene.structureTags.includes('camp')) curiosity += rules.moodBias.territory * 0.18;

  if (individual.tier !== 'none') {
    const boost = individual.tier === 'singularity' ? 0.2 : 0.1;
    curiosity += individual.traits.includes('collector') || individual.traits.includes('territorial') ? boost : 0;
    fear += individual.traits.includes('cowardly') ? boost : 0;
    if (individual.traits.includes('omenSensitive') && (sceneTags.has('deathPressure') || sceneTags.has('undeadMemory') || sceneTags.has('oldBlood'))) {
      curiosity += boost * 0.8;
      fear += family === 'undead' || family === 'demon' ? 0 : boost * 0.65;
    }
  }

  curiosity = clamp01(curiosity);
  fear = clamp01(fear);
  const score = clamp01(Math.max(curiosity, fear));
  if (score < 0.3) return null;
  const reaction: FamilySceneReactionKind = fear > curiosity + 0.12 ? 'avoid' : curiosity > 0.55 ? 'approach' : 'inspect';
  return {
    entity,
    family,
    reaction,
    score,
    fear,
    curiosity,
    reasonTags: explainSceneTags(scene, rules.sceneAmplifiers, rules.sceneSuppressors, reaction),
    lineId: lineIdForFamilyScene(family, reaction),
    individual,
  };
}

export function familySceneReactionEvent(reaction: FamilySceneReaction, scene: SceneFrameV1, pid: number): SimEvent {
  return {
    type: 'aiSpeech',
    speakerId: reaction.entity.id,
    speakerName: reaction.entity.name,
    speech: {
      mode: 'lineId',
      lineId: reaction.lineId,
      values: {
        speakerName: reaction.entity.name,
        family: reaction.family,
        reaction: reaction.reaction,
        score: Math.round(reaction.score * 100),
      },
    },
    source: 'fallback',
    reaction: {
      kind: reaction.reaction,
      score: Math.round(reaction.score * 100) / 100,
      sceneTags: [...new Set([...reaction.reasonTags, ...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags])].slice(0, 8),
      individualTier: reaction.individual.tier,
      individualTraits: reaction.individual.traits,
    },
    pid,
  };
}

function lineIdForFamilyScene(family: MobFamily, reaction: FamilySceneReactionKind): string {
  switch (family) {
    case 'beast':
    case 'murloc':
    case 'spider':
      return 'hudChrome.aiSpeech.familySceneBeastUneasy';
    case 'undead':
      return 'hudChrome.aiSpeech.familySceneUndeadDrawn';
    case 'elemental':
    case 'dragonkin':
      return 'hudChrome.aiSpeech.familySceneElementalResonance';
    case 'demon':
      return 'hudChrome.aiSpeech.familySceneDemonAmused';
    default:
      return reaction === 'avoid'
        ? 'hudChrome.aiSpeech.familySceneAvoid'
        : reaction === 'approach'
          ? 'hudChrome.aiSpeech.familySceneApproach'
          : 'hudChrome.aiSpeech.familySceneInspect';
  }
}

function sceneTagSet(scene: SceneFrameV1): Set<string> {
  return new Set([
    ...scene.biomeTags,
    ...scene.locationTags,
    ...scene.structureTags,
    ...scene.environmentalTags,
    ...scene.time.tags,
    ...scene.weather.tags,
    ...scene.light.tags,
  ]);
}

function explainSceneTags(
  scene: SceneFrameV1,
  amplifiers: readonly string[],
  suppressors: readonly string[],
  reaction: FamilySceneReactionKind,
): string[] {
  const tags = sceneTagSet(scene);
  const preferred = reaction === 'avoid' ? suppressors : amplifiers;
  const matches = preferred.filter((tag) => tags.has(tag));
  return [...new Set([...matches, ...scene.environmentalTags, ...scene.locationTags])].slice(0, 5);
}

function overlapCount(tags: Set<string>, needles: readonly string[]): number {
  let count = 0;
  for (const tag of needles) if (tags.has(tag)) count++;
  return count;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
