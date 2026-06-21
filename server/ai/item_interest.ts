import { ITEMS, MOBS } from '../../src/sim/data';
import type { Entity, MobFamily } from '../../src/sim/types';
import type { DroppedItemSemantic, SceneFrameV1 } from './scene_frame';
import { familySemanticsFor, mobFamilyForEntity } from './family_semantics';
import { individualProfileFor, applyIndividualBiasToItemReaction } from './singularity';
import type { IndividualAiProfile } from './singularity';

export type ItemReactionKind = 'approach' | 'avoid' | 'inspect' | 'ignore';

export interface ItemSemantic {
  itemId: string;
  itemTags: string[];
  smellTags: string[];
  dangerTags: string[];
  valueSignals: string[];
}

export interface ItemInterestReaction {
  entity: Entity;
  family: MobFamily | null;
  reaction: ItemReactionKind;
  score: number;
  fear: number;
  curiosity: number;
  reasonTags: string[];
  lineId: string;
  individual?: IndividualAiProfile;
}

export function itemSemanticFor(itemId: string): ItemSemantic {
  const item = ITEMS[itemId];
  if (!item) return { itemId, itemTags: ['unknown'], smellTags: [], dangerTags: [], valueSignals: [] };
  const lower = `${item.id} ${item.name}`.toLowerCase();
  const itemTags = new Set<string>([item.kind]);
  const smellTags = new Set<string>();
  const dangerTags = new Set<string>();
  const valueSignals = new Set<string>();

  if (item.kind === 'food') {
    itemTags.add('food');
    smellTags.add(lower.includes('fish') || lower.includes('eel') || lower.includes('cod') ? 'fish' : lower.includes('boar') || lower.includes('meat') || lower.includes('jerky') ? 'meat' : 'freshBread');
  }
  if (item.kind === 'drink') {
    itemTags.add('drink');
    smellTags.add('water');
  }
  if (item.kind === 'weapon') {
    itemTags.add('weapon');
    itemTags.add('metal');
    valueSignals.add('gear');
    valueSignals.add('threat');
  }
  if (item.kind === 'armor') {
    itemTags.add('armor');
    valueSignals.add('gear');
  }
  if (item.kind === 'potion' || item.kind === 'elixir') {
    itemTags.add('alchemy');
    smellTags.add('herb');
    valueSignals.add('useful');
  }
  if (item.kind === 'quest') {
    itemTags.add('quest');
    valueSignals.add('story');
  }
  if ((item.quality ?? 'common') === 'uncommon' || item.quality === 'rare' || item.quality === 'epic') valueSignals.add('valuable');
  if ((item.sellValue ?? 0) >= 500) valueSignals.add('coin');
  if (/grave|crypt|bone|sigil|censer|relic|ritual|undead|dead|morthen|gravecaller|keystone|wyrm/.test(lower)) {
    itemTags.add('grave');
    dangerTags.add('undead');
    dangerTags.add('cursed');
  }
  if (/meteor|alien|star|void/.test(lower)) {
    itemTags.add('singularity');
    dangerTags.add('unknownPower');
    valueSignals.add('rareCuriosity');
  }
  if (/holy|chapel|light/.test(lower)) dangerTags.add('holy');

  return {
    itemId,
    itemTags: [...itemTags],
    smellTags: [...smellTags],
    dangerTags: [...dangerTags],
    valueSignals: [...valueSignals],
  };
}

export interface ItemReactionOptions {
  worldSeed?: number;
  singularityThreshold?: number;
  quirkThreshold?: number;
}

export function rankItemReactions(
  scene: SceneFrameV1,
  item: DroppedItemSemantic,
  candidates: Entity[],
  options: ItemReactionOptions = {},
): ItemInterestReaction[] {
  return candidates
    .map((entity) => scoreItemReaction(scene, item, entity, options))
    .filter((reaction) => reaction.reaction !== 'ignore')
    .sort((a, b) => b.score - a.score || a.entity.id - b.entity.id);
}

export function scoreItemReaction(
  scene: SceneFrameV1,
  item: DroppedItemSemantic,
  entity: Entity,
  options: ItemReactionOptions = {},
): ItemInterestReaction {
  const family = mobFamilyForEntity(entity);
  if (entity.kind !== 'mob' && entity.kind !== 'npc') return ignored(entity, family);
  if (entity.dead) return ignored(entity, family);
  const familyRules = family ? familySemanticsFor(family) : null;
  const tags = new Set([...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals]);
  const attracted = familyRules ? overlapCount(tags, familyRules.attractedItemTags) : npcAttraction(entity, tags);
  const avoided = familyRules ? overlapCount(tags, familyRules.avoidedItemTags) : npcAvoidance(entity, tags);
  const cursed = tags.has('cursed') || tags.has('undead') || tags.has('unknownPower');
  const valuable = tags.has('valuable') || tags.has('coin') || tags.has('gear');
  const food = tags.has('food') || tags.has('meat') || tags.has('fish');
  const safeTownCaution = scene.danger.safeHavenScore > 0.6 && entity.kind === 'npc' ? 0.25 : 0;
  let curiosity = 0.15 + attracted * 0.22 + (valuable ? 0.2 : 0) + (food ? 0.15 : 0);
  let fear = avoided * 0.24 + (cursed ? 0.25 : 0) + scene.danger.undeadPressure * 0.25;

  if (family === 'undead' || family === 'demon') {
    if (cursed) {
      curiosity += 0.45;
      fear = Math.max(0, fear - 0.35);
    }
  }
  if (family === 'beast' && food) curiosity += 0.35;
  if (family === 'murloc' && tags.has('fish')) curiosity += 0.4;
  if (family === 'kobold' && (tags.has('metal') || tags.has('coin'))) curiosity += 0.35;
  if (entity.kind === 'npc' && cursed) fear += 0.25;

  curiosity = clamp01(curiosity);
  fear = clamp01(fear);
  let score = clamp01(Math.max(curiosity, fear) - safeTownCaution);
  if (score < 0.28) return ignored(entity, family);
  let reaction: ItemReactionKind = fear > curiosity + 0.12 ? 'avoid' : curiosity > 0.62 ? 'approach' : 'inspect';
  let lineId = lineIdForReaction(reaction);
  const individual = individualProfileFor(entity, options.worldSeed ?? 0, {
    singularityThreshold: options.singularityThreshold,
    quirkThreshold: options.quirkThreshold,
  });
  const biased = applyIndividualBiasToItemReaction({ reaction, score, fear, curiosity, lineId }, individual, item, scene);
  reaction = biased.reaction;
  score = biased.score;
  fear = biased.fear;
  curiosity = biased.curiosity;
  lineId = biased.lineId;
  return {
    entity,
    family,
    reaction,
    score,
    fear,
    curiosity,
    reasonTags: explainTags(item, reaction, scene),
    lineId,
    individual,
  };
}

export function nearbyReactionCandidates(scene: SceneFrameV1, entities: Iterable<Entity>, origin: Entity): Entity[] {
  const radius = scene.locationTags.includes('safeTown') ? 18 : 26;
  const out: Entity[] = [];
  for (const entity of entities) {
    if (entity.id === origin.id || entity.kind === 'player' || entity.kind === 'object') continue;
    const dx = entity.pos.x - origin.pos.x;
    const dz = entity.pos.z - origin.pos.z;
    if (dx * dx + dz * dz <= radius * radius) out.push(entity);
  }
  return out;
}

function ignored(entity: Entity, family: MobFamily | null): ItemInterestReaction {
  return { entity, family, reaction: 'ignore', score: 0, fear: 0, curiosity: 0, reasonTags: [], lineId: 'hudChrome.aiSpeech.itemInterestInspect', individual: individualProfileFor(entity, 0) };
}

function lineIdForReaction(reaction: ItemReactionKind): string {
  switch (reaction) {
    case 'approach': return 'hudChrome.aiSpeech.itemInterestApproach';
    case 'avoid': return 'hudChrome.aiSpeech.itemInterestAvoid';
    case 'inspect': return 'hudChrome.aiSpeech.itemInterestInspect';
    case 'ignore': return 'hudChrome.aiSpeech.itemInterestInspect';
  }
}

function npcAttraction(entity: Entity, tags: Set<string>): number {
  let score = 0;
  if (entity.templateId.includes('merchant') && (tags.has('valuable') || tags.has('coin') || tags.has('gear'))) score += 2;
  if ((entity.templateId.includes('smith') || entity.templateId.includes('armorer')) && (tags.has('weapon') || tags.has('armor') || tags.has('metal'))) score += 2;
  if ((entity.templateId.includes('provisioner') || entity.templateId.includes('trader')) && tags.has('food')) score += 1;
  if ((entity.templateId.includes('aldric') || entity.templateId.includes('priest')) && (tags.has('grave') || tags.has('undead'))) score += 2;
  return score;
}

function npcAvoidance(entity: Entity, tags: Set<string>): number {
  let score = 0;
  if (tags.has('cursed') || tags.has('undead') || tags.has('unknownPower')) score += 1;
  if (entity.templateId.includes('aldric') || entity.templateId.includes('priest')) score = Math.max(0, score - 1);
  return score;
}

function overlapCount(tags: Set<string>, needles: readonly string[]): number {
  let count = 0;
  for (const tag of needles) if (tags.has(tag)) count++;
  return count;
}

function explainTags(item: DroppedItemSemantic, reaction: ItemReactionKind, scene: SceneFrameV1): string[] {
  const tags = [...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals];
  if (reaction === 'avoid') return [...new Set([...item.dangerTags, ...scene.environmentalTags.filter((tag) => tag === 'deathPressure' || tag === 'oldBlood')])].slice(0, 4);
  return [...new Set(tags)].slice(0, 4);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
