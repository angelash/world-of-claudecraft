import { ITEMS, MOBS, NPCS } from '../../src/sim/data';
import type { ItemDef, MobFamily } from '../../src/sim/types';
import { FAMILY_SEMANTICS, MOB_FAMILIES } from './family_semantics';
import { itemSemanticFor } from './item_interest';
import { objectInspectionLineIds } from './object_reactions';
import {
  AI_AGENT_PROFILES,
  GENERIC_NPC_AI_PROFILE,
  GENERIC_OBJECT_AI_PROFILE,
  profileFor,
} from './profiles';
import type { AiAgentProfile } from './profiles';
import { SCENE_ANCHORS } from './scene_semantics';
import { worldTraceLineId } from './world_traces';
import type { AiWorldTraceKind } from './world_traces';

export const REQUIRED_ITEM_SEMANTIC_IDS = [
  'roasted_boar',
  'baked_bread',
  'spring_water',
  'minor_healing_potion',
  'redbrook_blade',
  'gravecaller_sigil',
] as const;

const TRACE_KINDS: readonly AiWorldTraceKind[] = ['singularity', 'cursed', 'food', 'valuable', 'generic'];

export interface AiContentCoverageReport {
  families: {
    expected: MobFamily[];
    inContent: MobFamily[];
    missingSemantics: MobFamily[];
    semanticsWithoutContent: MobFamily[];
    familiesMissingDepth: MobFamily[];
    familiesWithInvalidMoodBias: MobFamily[];
    templateCountByFamily: Record<MobFamily, number>;
  };
  npcs: {
    interactiveTotal: number;
    authoredProfileTotal: number;
    missingInteractiveProfiles: string[];
    authoredNpcProfilesMissingSceneAffinities: string[];
    authoredNpcProfilesMissingItemInterest: string[];
    authoredNpcProfilesMissingTimeWeatherSensitivity: string[];
    authoredNpcProfilesWithThinMemory: string[];
  };
  scenes: {
    anchorTotal: number;
    semanticObjectTotal: number;
    anchorsMissingSemanticObjects: string[];
    anchorsMissingTags: string[];
    anchorsMissingTagDepth: string[];
    semanticObjectsMissingTags: string[];
    semanticObjectsMissingTagDepth: string[];
    semanticObjectsMissingAnchorOverlap: string[];
  };
  items: {
    requiredTotal: number;
    discardableTotal: number;
    missingRequiredItems: string[];
    requiredItemsMissingSignals: string[];
    discardableItemsMissingSignals: string[];
    importantItemsMissingSignals: string[];
  };
  lineIds: {
    referenced: string[];
  };
}

export function aiContentCoverageReport(): AiContentCoverageReport {
  const expected = [...MOB_FAMILIES];
  const inContent = unique(Object.values(MOBS).map((mob) => mob.family)).sort();
  const missingSemantics = inContent.filter((family) => !FAMILY_SEMANTICS[family]);
  const semanticsWithoutContent = expected.filter((family) => !inContent.includes(family));
  const familiesMissingDepth = expected.filter((family) => !familyHasDepth(family));
  const familiesWithInvalidMoodBias = expected.filter((family) => !familyMoodBiasIsValid(family));
  const templateCountByFamily = Object.fromEntries(expected.map((family) => [family, 0])) as Record<MobFamily, number>;
  for (const mob of Object.values(MOBS)) templateCountByFamily[mob.family] += 1;

  const interactiveNpcIds = Object.values(NPCS)
    .filter((npc) => npc.questIds.length > 0 || (npc.vendorItems?.length ?? 0) > 0 || npc.market === true)
    .map((npc) => npc.id)
    .sort();
  const missingInteractiveProfiles = interactiveNpcIds
    .filter((npcId) => profileFor('npc', npcId).id === GENERIC_NPC_AI_PROFILE.id);
  const authoredNpcProfiles = AI_AGENT_PROFILES
    .filter((profile) => profile.appliesTo.some((target) => target.kind === 'npc'));
  const authoredNpcProfilesMissingSceneAffinities = authoredNpcProfiles
    .filter((profile) => !profile.sceneAffinities
      || profile.sceneAffinities.likesTags.length < 3
      || profile.sceneAffinities.avoidsTags.length < 2
      || profile.sceneAffinities.commentsOnTags.length < 3)
    .map((profile) => profile.id)
    .sort();
  const authoredNpcProfilesMissingItemInterest = authoredNpcProfiles
    .filter((profile) => !profile.itemInterest
      || profile.itemInterest.attractedToTags.length < 4
      || profile.itemInterest.avoidsTags.length < 2)
    .map((profile) => profile.id)
    .sort();
  const authoredNpcProfilesMissingTimeWeatherSensitivity = authoredNpcProfiles
    .filter((profile) => !profile.timeWeatherSensitivity || !profileTimeWeatherIsValid(profile))
    .map((profile) => profile.id)
    .sort();
  const authoredNpcProfilesWithThinMemory = authoredNpcProfiles
    .filter((profile) => profile.socialMemory.style.trim().length === 0
      || profile.socialMemory.recognitionLineId.trim().length === 0
      || profile.socialMemory.rumorLineId.trim().length === 0
      || (profile.socialMemory.questRumorLineId?.trim().length ?? 0) === 0)
    .map((profile) => profile.id)
    .sort();

  const anchorsMissingSemanticObjects = SCENE_ANCHORS
    .filter((anchor) => anchor.semanticObjects.length === 0)
    .map((anchor) => anchor.id);
  const anchorsMissingTags = SCENE_ANCHORS
    .filter((anchor) =>
      anchor.biomeTags.length === 0
      || anchor.locationTags.length === 0
      || anchor.structureTags.length === 0
      || anchor.environmentalTags.length === 0)
    .map((anchor) => anchor.id);
  const anchorsMissingTagDepth = SCENE_ANCHORS
    .filter((anchor) =>
      anchor.biomeTags.length < 2
      || anchor.locationTags.length < 2
      || anchor.structureTags.length < 2
      || anchor.environmentalTags.length < 3)
    .map((anchor) => anchor.id);
  const semanticObjectsMissingTags = SCENE_ANCHORS
    .flatMap((anchor) => anchor.semanticObjects.map((object) => ({ anchorId: anchor.id, objectId: object.id, tags: object.tags })))
    .filter((object) => object.tags.length === 0)
    .map((object) => `${object.anchorId}:${object.objectId}`);
  const semanticObjectsMissingTagDepth = SCENE_ANCHORS
    .flatMap((anchor) => anchor.semanticObjects.map((object) => ({ anchorId: anchor.id, objectId: object.id, tags: object.tags })))
    .filter((object) => object.tags.length < 3)
    .map((object) => `${object.anchorId}:${object.objectId}`);
  const semanticObjectsMissingAnchorOverlap = SCENE_ANCHORS
    .flatMap((anchor) => {
      const anchorTags = new Set([
        ...anchor.biomeTags,
        ...anchor.locationTags,
        ...anchor.structureTags,
        ...anchor.environmentalTags,
      ]);
      return anchor.semanticObjects.map((object) => ({ anchorId: anchor.id, objectId: object.id, tags: object.tags, anchorTags }));
    })
    .filter((object) => !object.tags.some((tag) => object.anchorTags.has(tag)))
    .map((object) => `${object.anchorId}:${object.objectId}`);

  const missingRequiredItems = REQUIRED_ITEM_SEMANTIC_IDS.filter((itemId) => !ITEMS[itemId]);
  const requiredItemsMissingSignals = REQUIRED_ITEM_SEMANTIC_IDS
    .filter((itemId) => ITEMS[itemId])
    .filter((itemId) => semanticSignalCount(itemId) < 2);
  const discardableItemIds = Object.values(ITEMS)
    .filter(isDiscardableForAi)
    .map((item) => item.id)
    .sort();
  const discardableItemsMissingSignals = discardableItemIds
    .filter((itemId) => semanticSignalCount(itemId) < 2);
  const importantItemsMissingSignals = Object.values(ITEMS)
    .filter((item) => isDiscardableForAi(item) && isImportantForAi(item))
    .map((item) => item.id)
    .sort()
    .filter((itemId) => semanticSignalCount(itemId) < 2);

  const authoredProfiles = [...AI_AGENT_PROFILES, GENERIC_NPC_AI_PROFILE, GENERIC_OBJECT_AI_PROFILE];
  const lineIds = unique([
    ...authoredProfiles.flatMap(profileLineIds),
    ...objectInspectionLineIds(),
    ...TRACE_KINDS.map(worldTraceLineId),
  ]).sort();

  return {
    families: {
      expected,
      inContent,
      missingSemantics,
      semanticsWithoutContent,
      familiesMissingDepth,
      familiesWithInvalidMoodBias,
      templateCountByFamily,
    },
    npcs: {
      interactiveTotal: interactiveNpcIds.length,
      authoredProfileTotal: AI_AGENT_PROFILES.length,
      missingInteractiveProfiles,
      authoredNpcProfilesMissingSceneAffinities,
      authoredNpcProfilesMissingItemInterest,
      authoredNpcProfilesMissingTimeWeatherSensitivity,
      authoredNpcProfilesWithThinMemory,
    },
    scenes: {
      anchorTotal: SCENE_ANCHORS.length,
      semanticObjectTotal: SCENE_ANCHORS.reduce((sum, anchor) => sum + anchor.semanticObjects.length, 0),
      anchorsMissingSemanticObjects,
      anchorsMissingTags,
      anchorsMissingTagDepth,
      semanticObjectsMissingTags,
      semanticObjectsMissingTagDepth,
      semanticObjectsMissingAnchorOverlap,
    },
    items: {
      requiredTotal: REQUIRED_ITEM_SEMANTIC_IDS.length,
      discardableTotal: discardableItemIds.length,
      missingRequiredItems,
      requiredItemsMissingSignals,
      discardableItemsMissingSignals,
      importantItemsMissingSignals,
    },
    lineIds: {
      referenced: lineIds,
    },
  };
}

function profileLineIds(profile: AiAgentProfile): string[] {
  return unique([
    ...profile.allowedLineIds,
    profile.fallbackLineId,
    profile.socialMemory.recognitionLineId,
    profile.socialMemory.rumorLineId,
    ...(profile.socialMemory.questRumorLineId ? [profile.socialMemory.questRumorLineId] : []),
  ]);
}

function semanticSignalCount(itemId: string): number {
  const semantic = itemSemanticFor(itemId);
  return semantic.itemTags.length + semantic.smellTags.length + semantic.dangerTags.length + semantic.valueSignals.length;
}

function familyHasDepth(family: MobFamily): boolean {
  const semantics = FAMILY_SEMANTICS[family];
  return semantics.baseInstincts.length >= 4
    && semantics.sceneAmplifiers.length >= 4
    && semantics.sceneSuppressors.length >= 3
    && semantics.attractedItemTags.length >= 4
    && semantics.avoidedItemTags.length >= 3
    && semantics.likelyIntents.length >= 4
    && semantics.visibleBehaviors.length >= 4
    && semantics.speechStyle.trim().length > 0;
}

function familyMoodBiasIsValid(family: MobFamily): boolean {
  const values = Object.values(FAMILY_SEMANTICS[family].moodBias);
  return values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

function profileTimeWeatherIsValid(profile: AiAgentProfile): boolean {
  const values = profile.timeWeatherSensitivity ? Object.values(profile.timeWeatherSensitivity) : [];
  return values.length > 0 && values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
}

function isDiscardableForAi(item: ItemDef): boolean {
  return item.noDiscard !== true;
}

function isImportantForAi(item: ItemDef): boolean {
  return item.kind === 'quest'
    || item.kind === 'tool'
    || item.quality === 'uncommon'
    || item.quality === 'rare'
    || item.quality === 'epic'
    || item.sellValue >= 500;
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
