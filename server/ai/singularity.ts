import { MOBS } from '../../src/sim/data';
import type { Entity, MobFamily } from '../../src/sim/types';
import type { ItemReactionKind } from './item_interest';
import type { DroppedItemSemantic, SceneFrameV1 } from './scene_frame';

export type IndividualTier = 'none' | 'quirk' | 'singularity';
export type IndividualTrait =
  | 'foodFixated'
  | 'collector'
  | 'omenSensitive'
  | 'cowardly'
  | 'territorial'
  | 'vengeful'
  | 'stargazer';

export interface IndividualAiProfile {
  entityId: number;
  templateId: string;
  family: MobFamily | null;
  tier: IndividualTier;
  score: number;
  traits: IndividualTrait[];
  memorySeed: string;
  intensity: number;
}

export interface IndividualThresholds {
  quirkThreshold?: number;
  singularityThreshold?: number;
}

export interface BiasedItemReaction {
  reaction: ItemReactionKind;
  score: number;
  fear: number;
  curiosity: number;
  lineId: string;
}

const DEFAULT_QUIRK_THRESHOLD = 0.72;
const DEFAULT_SINGULARITY_THRESHOLD = 0.93;

const FAMILY_TRAITS: Record<MobFamily, IndividualTrait[]> = {
  beast: ['foodFixated', 'territorial', 'cowardly', 'stargazer'],
  humanoid: ['collector', 'cowardly', 'vengeful', 'omenSensitive'],
  murloc: ['collector', 'foodFixated', 'cowardly', 'stargazer'],
  spider: ['territorial', 'cowardly', 'omenSensitive'],
  kobold: ['collector', 'cowardly', 'territorial'],
  undead: ['omenSensitive', 'territorial', 'vengeful', 'stargazer'],
  troll: ['foodFixated', 'vengeful', 'collector'],
  ogre: ['foodFixated', 'territorial', 'vengeful'],
  elemental: ['omenSensitive', 'stargazer', 'territorial'],
  dragonkin: ['collector', 'territorial', 'omenSensitive', 'stargazer'],
  demon: ['omenSensitive', 'vengeful', 'collector'],
};

export function individualProfileFor(entity: Entity, worldSeed: number, thresholds: IndividualThresholds = {}): IndividualAiProfile {
  const family = entity.kind === 'mob' ? MOBS[entity.templateId]?.family ?? null : null;
  const score = hashUnit(`${worldSeed}:${entity.templateId}:${entity.id}:individuality`);
  const singularityThreshold = thresholds.singularityThreshold ?? DEFAULT_SINGULARITY_THRESHOLD;
  const quirkThreshold = thresholds.quirkThreshold ?? DEFAULT_QUIRK_THRESHOLD;
  const tier: IndividualTier = score >= singularityThreshold
    ? 'singularity'
    : score >= quirkThreshold
      ? 'quirk'
      : 'none';
  const traits = tier === 'none' ? [] : traitsFor(entity, family, worldSeed, tier);
  return {
    entityId: entity.id,
    templateId: entity.templateId,
    family,
    tier,
    score: Math.round(score * 1000) / 1000,
    traits,
    memorySeed: `${entity.templateId}:${entity.id}:${Math.floor(score * 10000)}`,
    intensity: tier === 'singularity' ? 1 : tier === 'quirk' ? 0.55 + score * 0.25 : 0,
  };
}

export function applyIndividualBiasToItemReaction(
  base: BiasedItemReaction,
  individual: IndividualAiProfile,
  item: DroppedItemSemantic,
  scene: SceneFrameV1,
): BiasedItemReaction {
  if (individual.tier === 'none') return base;
  const tags = new Set([...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals, ...scene.environmentalTags]);
  let { reaction, score, fear, curiosity } = base;
  const boost = individual.tier === 'singularity' ? 0.28 : 0.14;

  if (individual.traits.includes('foodFixated') && (tags.has('food') || tags.has('meat') || tags.has('fish'))) {
    curiosity += boost + 0.1;
    reaction = 'approach';
  }
  if (individual.traits.includes('collector') && (tags.has('valuable') || tags.has('coin') || tags.has('gear') || tags.has('shiny'))) {
    curiosity += boost;
    reaction = 'approach';
  }
  if (individual.traits.includes('omenSensitive') && (tags.has('cursed') || tags.has('undead') || tags.has('unknownPower'))) {
    curiosity += boost;
    fear += individual.family === 'undead' || individual.family === 'demon' ? -0.12 : boost * 0.75;
    reaction = individual.family === 'undead' || individual.family === 'demon' ? 'approach' : 'inspect';
  }
  if (individual.traits.includes('cowardly') && (tags.has('cursed') || tags.has('fire') || tags.has('undead') || scene.danger.hostileDensity > 0.4)) {
    fear += boost + 0.1;
    reaction = 'avoid';
  }
  if (individual.traits.includes('territorial') && (tags.has('weapon') || tags.has('food') || scene.locationTags.includes('camp'))) {
    curiosity += boost * 0.7;
    reaction = reaction === 'avoid' ? 'inspect' : 'approach';
  }
  if (individual.traits.includes('vengeful') && (tags.has('weapon') || tags.has('oldBlood') || tags.has('trophy'))) {
    curiosity += boost;
    reaction = 'approach';
  }
  if (individual.traits.includes('stargazer') && scene.light.tags.includes('starrySky')) {
    curiosity += boost * 0.5;
    reaction = reaction === 'avoid' ? 'inspect' : reaction;
  }

  curiosity = clamp01(curiosity);
  fear = clamp01(fear);
  score = clamp01(Math.max(score, curiosity, fear));
  return {
    reaction,
    score,
    fear,
    curiosity,
    lineId: lineIdForIndividual(individual, reaction, base.lineId),
  };
}

export function isSingularityLineId(lineId: string): boolean {
  return lineId.startsWith('hudChrome.aiSpeech.singularity');
}

function traitsFor(entity: Entity, family: MobFamily | null, worldSeed: number, tier: IndividualTier): IndividualTrait[] {
  const pool: readonly IndividualTrait[] = family ? FAMILY_TRAITS[family] : ['collector', 'cowardly', 'omenSensitive'];
  const count = tier === 'singularity' ? 2 : 1;
  const traits: IndividualTrait[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(hashUnit(`${worldSeed}:${entity.templateId}:${entity.id}:trait:${i}`) * pool.length) % pool.length;
    const trait = pool[idx];
    if (!traits.includes(trait)) traits.push(trait);
  }
  return traits;
}

function lineIdForIndividual(individual: IndividualAiProfile, reaction: ItemReactionKind, fallback: string): string {
  if (individual.tier !== 'singularity') return fallback;
  const trait = individual.traits[0];
  if (trait) {
    switch (trait) {
      case 'foodFixated': return 'hudChrome.aiSpeech.singularityFoodFixated';
      case 'collector': return 'hudChrome.aiSpeech.singularityCollector';
      case 'omenSensitive': return 'hudChrome.aiSpeech.singularityOmenSensitive';
      case 'cowardly': return 'hudChrome.aiSpeech.singularityCowardly';
      case 'territorial': return 'hudChrome.aiSpeech.singularityTerritorial';
      case 'vengeful': return 'hudChrome.aiSpeech.singularityVengeful';
      case 'stargazer': return 'hudChrome.aiSpeech.singularityStargazer';
    }
  }
  switch (reaction) {
    case 'approach': return 'hudChrome.aiSpeech.singularityApproach';
    case 'avoid': return 'hudChrome.aiSpeech.singularityAvoid';
    case 'inspect': return 'hudChrome.aiSpeech.singularityInspect';
    case 'ignore': return fallback;
  }
}

function hashUnit(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 0xffffffff;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
