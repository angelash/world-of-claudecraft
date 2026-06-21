import { ITEMS, MOBS, NPCS } from '../../src/sim/data';
import type { MobFamily } from '../../src/sim/types';
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
    templateCountByFamily: Record<MobFamily, number>;
  };
  npcs: {
    interactiveTotal: number;
    authoredProfileTotal: number;
    missingInteractiveProfiles: string[];
  };
  scenes: {
    anchorTotal: number;
    semanticObjectTotal: number;
    anchorsMissingSemanticObjects: string[];
    anchorsMissingTags: string[];
    semanticObjectsMissingTags: string[];
  };
  items: {
    requiredTotal: number;
    missingRequiredItems: string[];
    requiredItemsMissingSignals: string[];
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
  const templateCountByFamily = Object.fromEntries(expected.map((family) => [family, 0])) as Record<MobFamily, number>;
  for (const mob of Object.values(MOBS)) templateCountByFamily[mob.family] += 1;

  const interactiveNpcIds = Object.values(NPCS)
    .filter((npc) => npc.questIds.length > 0 || (npc.vendorItems?.length ?? 0) > 0 || npc.market === true)
    .map((npc) => npc.id)
    .sort();
  const missingInteractiveProfiles = interactiveNpcIds
    .filter((npcId) => profileFor('npc', npcId).id === GENERIC_NPC_AI_PROFILE.id);

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
  const semanticObjectsMissingTags = SCENE_ANCHORS
    .flatMap((anchor) => anchor.semanticObjects.map((object) => ({ anchorId: anchor.id, objectId: object.id, tags: object.tags })))
    .filter((object) => object.tags.length === 0)
    .map((object) => `${object.anchorId}:${object.objectId}`);

  const missingRequiredItems = REQUIRED_ITEM_SEMANTIC_IDS.filter((itemId) => !ITEMS[itemId]);
  const requiredItemsMissingSignals = REQUIRED_ITEM_SEMANTIC_IDS
    .filter((itemId) => ITEMS[itemId])
    .filter((itemId) => semanticSignalCount(itemId) === 0);

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
      templateCountByFamily,
    },
    npcs: {
      interactiveTotal: interactiveNpcIds.length,
      authoredProfileTotal: AI_AGENT_PROFILES.length,
      missingInteractiveProfiles,
    },
    scenes: {
      anchorTotal: SCENE_ANCHORS.length,
      semanticObjectTotal: SCENE_ANCHORS.reduce((sum, anchor) => sum + anchor.semanticObjects.length, 0),
      anchorsMissingSemanticObjects,
      anchorsMissingTags,
      semanticObjectsMissingTags,
    },
    items: {
      requiredTotal: REQUIRED_ITEM_SEMANTIC_IDS.length,
      missingRequiredItems,
      requiredItemsMissingSignals,
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

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
