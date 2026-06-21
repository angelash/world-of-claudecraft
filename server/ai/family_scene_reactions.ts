import type { Entity, MobFamily, SimEvent } from '../../src/sim/types';
import { familyDirectorProjectionFor } from './director_family_projection';
import type { SceneFrameV1, SceneObjectSemantic } from './scene_frame';
import { familySemanticsFor, mobFamilyForEntity } from './family_semantics';
import type { FamilySemantics } from './family_semantics';
import { individualProfileFor, individualSpeechValues } from './singularity';
import type { IndividualAiProfile } from './singularity';
import type { AiWorldDirectorProposal } from './world_director';

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
  focusedObject?: FamilySceneFocusedObject;
}

export interface FamilySceneReactionOptions {
  worldSeed?: number;
  singularityThreshold?: number;
  quirkThreshold?: number;
  directorProposals?: readonly AiWorldDirectorProposal[];
}

export interface FamilySceneFocusedObject {
  objectId: string;
  entityId: number | null;
  templateId: string;
  reaction: Exclude<FamilySceneReactionKind, 'ignore'>;
  reasonTags: string[];
  distance: number;
}

interface FamilyObjectCueRules {
  approachTags: readonly string[];
  avoidTags: readonly string[];
  inspectTags: readonly string[];
}

const REACTION_RADIUS = 28;
const GENERIC_OBJECT_INSPECT_TAGS = [
  'inspectObject',
  'readObject',
  'readNotice',
  'listenForEcho',
  'listenForDead',
  'watchCrowd',
  'watchSmoke',
  'watchReflection',
  'peerBelow',
  'readOldMarks',
  'feelWatched',
] as const;

const FAMILY_OBJECT_CUES: Record<MobFamily, FamilyObjectCueRules> = {
  beast: {
    approachTags: ['sniffObject', 'sniffFish', 'drinkWater', 'strongScent', 'fishScales', 'softRipples', 'muddyBank'],
    avoidTags: ['avoidHeat', 'avoidObject', 'fleeFromDark', 'avoidDesecration', 'uneasyAura', 'hotIron', 'sparks', 'boneDust'],
    inspectTags: ['trackRipples', 'listenForSteps', 'paceCarefully'],
  },
  humanoid: {
    approachTags: ['seekShelter', 'askForHelp', 'standGuard', 'signalTown', 'readNotice', 'haggle', 'repairGear', 'watchSoldiers'],
    avoidTags: ['fleeFromDark', 'avoidObject', 'avoidDesecration', 'feelWatched', 'avoidAmbush', 'boneDust', 'uneasyAura'],
    inspectTags: ['inspectOfferings', 'listenForEcho', 'readOldMarks', 'watchCrowd', 'watchSmoke'],
  },
  murloc: {
    approachTags: ['sniffFish', 'drinkWater', 'peerBelow', 'borrowBait', 'watchReflection', 'wetWood', 'fishScales', 'softRipples'],
    avoidTags: ['avoidHeat', 'avoidDeepWater', 'hotIron', 'sparks', 'dryHighland'],
    inspectTags: ['paceCarefully', 'trackRipples', 'listenAtDoor'],
  },
  spider: {
    approachTags: ['hideInReeds', 'avoidAmbush', 'listenForSteps', 'trackMovement', 'tallReeds', 'hiddenTracks', 'lowVisibility'],
    avoidTags: ['avoidHeat', 'strongWind', 'warmHands', 'signalDanger', 'sparks'],
    inspectTags: ['feelWatched', 'trackRipples', 'listenForDead'],
  },
  kobold: {
    approachTags: ['collectObject', 'glintingSurface', 'readNotice', 'hideBehindStone', 'takeCover', 'repairGear', 'workedMetal'],
    avoidTags: ['avoidDeepWater', 'avoidAmbush', 'fleeFromDark', 'avoidObject', 'uneasyAura', 'coldDraft'],
    inspectTags: ['listenForEcho', 'listenForSteps', 'readOldMarks'],
  },
  undead: {
    approachTags: ['guardEntrance', 'listenForDead', 'feelWatched', 'readOldMarks', 'hesitateAtThreshold', 'graveSoil', 'boneDust'],
    avoidTags: ['warmHands', 'signalDanger', 'askForHelp', 'safeTown', 'sunBlessed'],
    inspectTags: ['inspectOfferings', 'prayUneasily', 'readOldMarks'],
  },
  troll: {
    approachTags: ['sniffObject', 'warmHands', 'blockPath', 'collectObject', 'strongScent', 'workedMetal', 'repairGear'],
    avoidTags: ['avoidDesecration', 'avoidObject', 'poisonedMeat', 'uneasyAura'],
    inspectTags: ['watchCrowd', 'watchSoldiers', 'listenForSteps'],
  },
  ogre: {
    approachTags: ['blockPath', 'collectObject', 'warmHands', 'workedMetal', 'repairGear', 'standGuard', 'strongScent'],
    avoidTags: ['narrowPath', 'avoidObject', 'fleeFromDark', 'uneasyAura', 'binding'],
    inspectTags: ['watchSoldiers', 'watchSmoke', 'listenForSteps'],
  },
  elemental: {
    approachTags: ['warmHands', 'drinkWater', 'watchReflection', 'leanIntoWind', 'signalDanger', 'watchSmoke', 'moonlitWater'],
    avoidTags: ['avoidObject', 'bindingRune', 'drainingRelic', 'uneasyAura'],
    inspectTags: ['readOldMarks', 'feelWatched', 'peerBelow', 'listenForDead'],
  },
  dragonkin: {
    approachTags: ['scanRoad', 'watchReflection', 'readOldMarks', 'guardEntrance', 'standGuard', 'takeCover', 'highView'],
    avoidTags: ['avoidDesecration', 'defiledRuin', 'bindingCircle', 'falseOffering', 'uneasyAura'],
    inspectTags: ['inspectOfferings', 'readNotice', 'watchSmoke', 'listenForDead'],
  },
  demon: {
    approachTags: ['avoidDesecration', 'fleeFromDark', 'feelWatched', 'guardEntrance', 'hotIron', 'sparks', 'uneasyAura'],
    avoidTags: ['prayUneasily', 'askForHelp', 'signalTown', 'safeTown', 'holy', 'ward'],
    inspectTags: ['inspectOfferings', 'listenForDead', 'watchCrowd'],
  },
};

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
  const moodBias = timeWeatherReactionBias(scene, family, rules.moodBias.fatigue);
  curiosity += moodBias.curiosity;
  fear += moodBias.fear;
  const objectCue = sceneObjectReactionCue(scene, family, rules, individual);
  curiosity += objectCue.curiosity;
  fear += objectCue.fear;
  if (objectCue.focus?.reaction === 'avoid') fear += 0.08;
  else if (objectCue.focus?.reaction === 'approach') curiosity += 0.05;
  const directorCue = directorProposalReactionCue(options.directorProposals ?? [], family, individual);
  curiosity += directorCue.curiosity;
  fear += directorCue.fear;

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
  const reaction: FamilySceneReactionKind = fear > curiosity + 0.08 ? 'avoid' : curiosity > 0.55 ? 'approach' : 'inspect';
  const focusedObject = objectCue.focus ?? directorCue.focus;
  return {
    entity,
    family,
    reaction,
    score,
    fear,
    curiosity,
    reasonTags: explainSceneTags(scene, rules.sceneAmplifiers, rules.sceneSuppressors, reaction, [
      ...moodBias.reasonTags,
      ...objectCue.reasonTags,
      ...directorCue.reasonTags,
    ]),
    lineId: lineIdForFamilyScene(family, reaction),
    individual,
    ...(focusedObject ? { focusedObject } : {}),
  };
}

export function familySceneReactionEvent(reaction: FamilySceneReaction, scene: SceneFrameV1, pid: number): SimEvent {
  const focusedObject = reaction.focusedObject;
  return {
    type: 'aiSpeech',
    speakerId: reaction.entity.id,
    speakerName: reaction.entity.name,
    speech: {
      mode: 'lineId',
      lineId: reaction.lineId,
      values: {
        speakerName: reaction.entity.name,
        speakerTemplateId: reaction.entity.templateId,
        family: reaction.family,
        reaction: reaction.reaction,
        score: Math.round(reaction.score * 100),
        ...(focusedObject ? {
          sceneObjectId: focusedObject.objectId,
          sceneObjectTemplateId: focusedObject.templateId,
        } : {}),
        ...individualSpeechValues(reaction.individual),
      },
    },
    source: 'fallback',
    reaction: {
      kind: reaction.reaction,
      score: Math.round(reaction.score * 100) / 100,
      ...(focusedObject && focusedObject.entityId !== null ? { targetObjectId: focusedObject.entityId } : {}),
      ...(focusedObject ? { targetItemId: focusedObject.objectId } : {}),
      sceneTags: [...new Set([
        ...reaction.reasonTags,
        ...(focusedObject?.reasonTags ?? []),
        ...scene.locationTags,
        ...scene.structureTags,
        ...scene.environmentalTags,
      ])].slice(0, 8),
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

function sceneObjectReactionCue(
  scene: SceneFrameV1,
  family: MobFamily,
  rules: FamilySemantics,
  individual: IndividualAiProfile,
): { curiosity: number; fear: number; reasonTags: string[]; focus?: FamilySceneFocusedObject } {
  const objectRules = FAMILY_OBJECT_CUES[family];
  let best: {
    curiosity: number;
    fear: number;
    score: number;
    focus: FamilySceneFocusedObject;
  } | null = null;
  for (const object of scene.nearbySemanticObjects) {
    const tags = objectTagSet(object);
    const approachMatches = matchingTags(tags, [
      ...rules.attractedItemTags,
      ...rules.sceneAmplifiers,
      ...objectRules.approachTags,
    ]);
    const avoidMatches = matchingTags(tags, [
      ...rules.avoidedItemTags,
      ...rules.sceneSuppressors,
      ...objectRules.avoidTags,
    ]);
    const inspectMatches = matchingTags(tags, [
      ...GENERIC_OBJECT_INSPECT_TAGS,
      ...objectRules.inspectTags,
    ]);
    const proximity = object.distance <= 8 ? 0.08 : object.distance <= 16 ? 0.04 : 0;
    let curiosity = approachMatches.length * 0.13 + inspectMatches.length * 0.06 + proximity;
    let fear = avoidMatches.length * 0.14 + (object.distance <= 10 && avoidMatches.length > 0 ? 0.06 : 0);
    if (individual.tier !== 'none') {
      const boost = individual.tier === 'singularity' ? 0.08 : 0.04;
      if (individual.traits.includes('collector') || individual.traits.includes('territorial')) curiosity += boost;
      if (individual.traits.includes('cowardly') || individual.traits.includes('omenSensitive')) fear += boost * (avoidMatches.length > 0 ? 1 : 0.45);
    }
    const score = Math.max(curiosity, fear);
    if (score < 0.14) continue;
    const objectReaction: Exclude<FamilySceneReactionKind, 'ignore'> = fear > curiosity + 0.06
      ? 'avoid'
      : curiosity > 0.22
        ? 'approach'
        : 'inspect';
    const focus: FamilySceneFocusedObject = {
      objectId: object.objectId,
      entityId: object.entityId,
      templateId: object.templateId,
      reaction: objectReaction,
      reasonTags: objectReasonTags(object, objectReaction, approachMatches, avoidMatches, inspectMatches),
      distance: object.distance,
    };
    if (!best || score > best.score || (score === best.score && object.distance < best.focus.distance)) {
      best = { curiosity, fear, score, focus };
    }
  }
  if (!best) return { curiosity: 0, fear: 0, reasonTags: [] };
  return {
    curiosity: best.curiosity,
    fear: best.fear,
    reasonTags: best.focus.reasonTags,
    focus: best.focus,
  };
}

function objectTagSet(object: SceneObjectSemantic): Set<string> {
  return new Set([
    ...object.tags,
    ...object.featureTags,
    ...object.affordanceTags,
  ]);
}

function directorProposalReactionCue(
  proposals: readonly AiWorldDirectorProposal[],
  family: MobFamily,
  individual: IndividualAiProfile,
): { curiosity: number; fear: number; reasonTags: string[]; focus?: FamilySceneFocusedObject } {
  let best: {
    curiosity: number;
    fear: number;
    score: number;
    focus: FamilySceneFocusedObject;
    reasonTags: string[];
  } | null = null;
  for (const proposal of proposals.slice(0, 3)) {
    const projection = familyDirectorProjectionFor(proposal, {
      family,
      individualTier: individual.tier,
      individualTraits: individual.traits,
    });
    if (!projection) continue;
    const score = Math.max(projection.curiosity, projection.fear);
    if (score < 0.12) continue;
    const focus: FamilySceneFocusedObject = {
      objectId: proposal.targetRef,
      entityId: null,
      templateId: `world_director:${proposal.intent}`,
      reaction: projection.reaction,
      reasonTags: projection.reasonTags,
      distance: 0,
    };
    if (!best || score > best.score) best = {
      curiosity: projection.curiosity,
      fear: projection.fear,
      score,
      focus,
      reasonTags: focus.reasonTags,
    };
  }
  if (!best) return { curiosity: 0, fear: 0, reasonTags: [] };
  return {
    curiosity: best.curiosity,
    fear: best.fear,
    reasonTags: best.reasonTags,
    focus: best.focus,
  };
}

function matchingTags(tags: ReadonlySet<string>, needles: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of needles) {
    if (tags.has(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
}

function objectReasonTags(
  object: SceneObjectSemantic,
  reaction: Exclude<FamilySceneReactionKind, 'ignore'>,
  approachMatches: readonly string[],
  avoidMatches: readonly string[],
  inspectMatches: readonly string[],
): string[] {
  const primary = reaction === 'avoid'
    ? avoidMatches
    : reaction === 'approach'
      ? approachMatches
      : inspectMatches;
  return [...new Set([
    ...primary,
    ...inspectMatches,
    ...object.affordanceTags,
    ...object.featureTags,
    ...object.tags,
  ])].slice(0, 5);
}

function explainSceneTags(
  scene: SceneFrameV1,
  amplifiers: readonly string[],
  suppressors: readonly string[],
  reaction: FamilySceneReactionKind,
  moodReasonTags: readonly string[] = [],
): string[] {
  const tags = sceneTagSet(scene);
  const preferred = reaction === 'avoid' ? suppressors : amplifiers;
  const matches = preferred.filter((tag) => tags.has(tag));
  return [...new Set([...matches, ...moodReasonTags, ...scene.environmentalTags, ...scene.locationTags])].slice(0, 5);
}

function timeWeatherReactionBias(
  scene: SceneFrameV1,
  family: MobFamily,
  familyFatigue: number,
): { curiosity: number; fear: number; reasonTags: string[] } {
  let curiosity = 0;
  let fear = 0;
  const reasonTags: string[] = [];
  if (scene.mood.dayEnergy >= 0.6 && family !== 'undead' && family !== 'demon' && family !== 'spider') {
    curiosity += 0.04;
    reasonTags.push('dayEnergy');
  }
  if (scene.mood.nightFatigue >= 0.5) {
    reasonTags.push('nightFatigue');
    if (family === 'undead' || family === 'demon') curiosity += 0.05;
    else fear += 0.04 + familyFatigue * 0.08;
  }
  if (scene.mood.clearNightAwe >= 0.5) {
    curiosity += family === 'elemental' || family === 'dragonkin' ? 0.08 : 0.04;
    reasonTags.push('clearNightAwe');
  }
  if (scene.mood.rainIrritation >= 0.5) {
    if (family === 'murloc' || family === 'elemental') {
      curiosity += 0.08;
      reasonTags.push('waterComfort');
    } else {
      fear += 0.03 + familyFatigue * 0.08;
      reasonTags.push('rainIrritation');
    }
  }
  if (scene.mood.fogFear >= 0.5) {
    fear += family === 'spider' || family === 'undead' ? 0 : 0.05;
    reasonTags.push('fogFear');
  }
  return { curiosity, fear, reasonTags };
}

function overlapCount(tags: Set<string>, needles: readonly string[]): number {
  let count = 0;
  for (const tag of needles) if (tags.has(tag)) count++;
  return count;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
