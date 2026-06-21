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
    semanticObjectsMissingFeatureTags: string[];
    semanticObjectsMissingAffordanceTags: string[];
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

export type AiContentReviewChecklistStatus = 'pass' | 'needs_attention';

export interface AiContentReviewChecklistItem {
  id: string;
  label: string;
  status: AiContentReviewChecklistStatus;
  issueCount: number;
  examples: string[];
  reviewPrompt: string;
  validationCommand: string;
}

export interface AiContentReviewChecklist {
  status: AiContentReviewChecklistStatus;
  generatedFrom: 'aiContentCoverageReport';
  items: AiContentReviewChecklistItem[];
  validationCommands: string[];
}

export interface AiProfilePreviewTarget {
  kind: 'npc' | 'mob' | 'object';
  templateId: string;
}

export interface AiProfilePreviewRow {
  id: string;
  appliesTo: AiProfilePreviewTarget[];
  personaExcerpt: string;
  canonSensitive: boolean;
  fallbackLineId: string;
  allowedIntentTypes: string[];
  allowedLineIdCount: number;
  knowledgeScopeCount: number;
  tabooTopicCount: number;
  socialMemoryLineIds: string[];
  sceneAffinities: {
    likes: number;
    avoids: number;
    comments: number;
  };
  itemInterest: {
    attracted: number;
    avoids: number;
  };
  hasTimeWeatherSensitivity: boolean;
  companionReactionCount: number;
  missingAuthoringFields: string[];
}

export type AiProfileAuthoringIssueSeverity = 'error' | 'warning';

export interface AiProfileAuthoringIssue {
  severity: AiProfileAuthoringIssueSeverity;
  code: string;
  profileId: string;
  detail: string;
  targetKind?: 'npc' | 'mob' | 'object';
  targetTemplateId?: string;
}

export interface AiProfileAuthoringValidationReport {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  limit: number;
  truncated: boolean;
  issues: AiProfileAuthoringIssue[];
}

export interface AiProfilePreviewReport {
  authoredTotal: number;
  genericTotal: number;
  limit: number;
  truncated: boolean;
  rows: AiProfilePreviewRow[];
  validation: AiProfileAuthoringValidationReport;
}

const PROFILE_PREVIEW_LIMIT = 64;
const PROFILE_VALIDATION_ISSUE_LIMIT = 48;
const PERSONA_EXCERPT_MAX = 110;

export function aiContentCoverageReport(): AiContentCoverageReport {
  const expected = [...MOB_FAMILIES];
  const inContent = unique(Object.values(MOBS).map((mob) => mob.family)).sort();
  const missingSemantics = inContent.filter((family) => !FAMILY_SEMANTICS[family]);
  const semanticsWithoutContent = expected.filter((family) => !inContent.includes(family));
  const familiesMissingDepth = expected.filter((family) => !familyHasDepth(family));
  const familiesWithInvalidMoodBias = expected.filter((family) => !familyMoodBiasIsValid(family));
  const templateCountByFamily = Object.fromEntries(expected.map((family) => [family, 0])) as Record<MobFamily, number>;
  for (const mob of Object.values(MOBS)) templateCountByFamily[mob.family] += 1;

  const interactiveNpcIds = interactiveAiNpcIds();
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
  const semanticObjectsMissingFeatureTags = SCENE_ANCHORS
    .flatMap((anchor) => anchor.semanticObjects.map((object) => ({ anchorId: anchor.id, objectId: object.id, featureTags: object.featureTags })))
    .filter((object) => object.featureTags.length < 2)
    .map((object) => `${object.anchorId}:${object.objectId}`);
  const semanticObjectsMissingAffordanceTags = SCENE_ANCHORS
    .flatMap((anchor) => anchor.semanticObjects.map((object) => ({ anchorId: anchor.id, objectId: object.id, affordanceTags: object.affordanceTags })))
    .filter((object) => object.affordanceTags.length < 2)
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
      semanticObjectsMissingFeatureTags,
      semanticObjectsMissingAffordanceTags,
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

export function aiContentReviewChecklist(
  report: AiContentCoverageReport = aiContentCoverageReport(),
): AiContentReviewChecklist {
  const validation = aiProfileAuthoringValidationReport();
  const items: AiContentReviewChecklistItem[] = [
    reviewItem({
      id: 'mob-family-semantics',
      label: 'Mob family semantics',
      issues: [
        ...report.families.missingSemantics.map((family) => `missingSemantics:${family}`),
        ...report.families.semanticsWithoutContent.map((family) => `semanticsWithoutContent:${family}`),
        ...report.families.familiesMissingDepth.map((family) => `missingDepth:${family}`),
        ...report.families.familiesWithInvalidMoodBias.map((family) => `invalidMoodBias:${family}`),
        ...report.families.expected
          .filter((family) => report.families.templateCountByFamily[family] <= 0)
          .map((family) => `noTemplate:${family}`),
      ],
      reviewPrompt: 'When adding a mob family or template, verify family instincts, scene amplifiers, suppressors, item tags, visible behaviors, mood bias, and at least one content template.',
    }),
    reviewItem({
      id: 'interactive-npc-profiles',
      label: 'Interactive NPC profiles',
      issues: [
        ...report.npcs.missingInteractiveProfiles.map((id) => `missingProfile:${id}`),
        ...report.npcs.authoredNpcProfilesMissingSceneAffinities.map((id) => `thinSceneAffinities:${id}`),
        ...report.npcs.authoredNpcProfilesMissingItemInterest.map((id) => `thinItemInterest:${id}`),
        ...report.npcs.authoredNpcProfilesMissingTimeWeatherSensitivity.map((id) => `missingTimeWeather:${id}`),
        ...report.npcs.authoredNpcProfilesWithThinMemory.map((id) => `thinMemory:${id}`),
        ...validation.issues.map((issue) => `${issue.code}:${issue.profileId}${issue.targetTemplateId ? `:${issue.targetTemplateId}` : ''}`),
      ],
      reviewPrompt: 'When adding a quest, vendor, market, or named NPC, verify a non-generic living-world profile, scene and item interests, time and weather sensitivity, memory lineIds, and canon taboos.',
    }),
    reviewItem({
      id: 'scene-semantic-anchors',
      label: 'Scene semantic anchors',
      issues: [
        ...report.scenes.anchorsMissingSemanticObjects.map((id) => `missingObjects:${id}`),
        ...report.scenes.anchorsMissingTags.map((id) => `missingTags:${id}`),
        ...report.scenes.anchorsMissingTagDepth.map((id) => `thinAnchorTags:${id}`),
        ...report.scenes.semanticObjectsMissingTags.map((id) => `missingObjectTags:${id}`),
        ...report.scenes.semanticObjectsMissingTagDepth.map((id) => `thinObjectTags:${id}`),
        ...report.scenes.semanticObjectsMissingFeatureTags.map((id) => `thinFeatureTags:${id}`),
        ...report.scenes.semanticObjectsMissingAffordanceTags.map((id) => `thinAffordanceTags:${id}`),
        ...report.scenes.semanticObjectsMissingAnchorOverlap.map((id) => `missingAnchorOverlap:${id}`),
      ],
      reviewPrompt: 'When adding a zone, subscene, house, camp, gate, dungeon door, or semantic object, verify tags, featureTags, affordanceTags, anchor overlap, danger cues, and time or weather readability.',
    }),
    reviewItem({
      id: 'discardable-item-semantics',
      label: 'Discardable item semantics',
      issues: [
        ...report.items.missingRequiredItems.map((id) => `missingRequired:${id}`),
        ...report.items.requiredItemsMissingSignals.map((id) => `thinRequiredSignals:${id}`),
        ...report.items.discardableItemsMissingSignals.map((id) => `thinDiscardSignals:${id}`),
        ...report.items.importantItemsMissingSignals.map((id) => `thinImportantSignals:${id}`),
      ],
      reviewPrompt: 'When adding a discardable, quest, rare, tool, valuable, food, weapon, relic, or odd object, verify item tags, smell tags, danger tags, and value signals.',
    }),
    reviewItem({
      id: 'ai-lineid-registration',
      label: 'AI lineId registration',
      issues: report.lineIds.referenced.length === 0 ? ['noReferencedAiLineIds'] : [],
      reviewPrompt: 'When adding AI speech or fallback lines, verify every hudChrome.aiSpeech.* id is registered and covered by localization drift tests.',
    }),
  ];
  return {
    status: items.some((item) => item.status === 'needs_attention') ? 'needs_attention' : 'pass',
    generatedFrom: 'aiContentCoverageReport',
    items,
    validationCommands: unique(items.map((item) => item.validationCommand)),
  };
}

export function aiProfilePreviewReport(limit = PROFILE_PREVIEW_LIMIT): AiProfilePreviewReport {
  const boundedLimit = Math.max(0, Math.floor(limit));
  const authoredRows = [...AI_AGENT_PROFILES]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(profilePreviewRow);
  return {
    authoredTotal: AI_AGENT_PROFILES.length,
    genericTotal: 2,
    limit: boundedLimit,
    truncated: authoredRows.length > boundedLimit,
    rows: authoredRows.slice(0, boundedLimit),
    validation: aiProfileAuthoringValidationReport(),
  };
}

export function aiProfileAuthoringValidationReport(
  issueLimit = PROFILE_VALIDATION_ISSUE_LIMIT,
): AiProfileAuthoringValidationReport {
  const boundedLimit = Math.max(0, Math.floor(issueLimit));
  const issues = profileAuthoringIssues().sort(compareProfileAuthoringIssues);
  return {
    totalIssues: issues.length,
    errorCount: issues.filter((issue) => issue.severity === 'error').length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    limit: boundedLimit,
    truncated: issues.length > boundedLimit,
    issues: issues.slice(0, boundedLimit),
  };
}

function reviewItem(input: {
  id: string;
  label: string;
  issues: string[];
  reviewPrompt: string;
}): AiContentReviewChecklistItem {
  return {
    id: input.id,
    label: input.label,
    status: input.issues.length > 0 ? 'needs_attention' : 'pass',
    issueCount: input.issues.length,
    examples: input.issues.slice(0, 8),
    reviewPrompt: input.reviewPrompt,
    validationCommand: 'npx vitest run tests/ai_content_coverage.test.ts',
  };
}

function profilePreviewRow(profile: AiAgentProfile): AiProfilePreviewRow {
  const socialMemoryLineIds = unique([
    profile.socialMemory.recognitionLineId,
    profile.socialMemory.rumorLineId,
    ...(profile.socialMemory.questRumorLineId ? [profile.socialMemory.questRumorLineId] : []),
  ]);
  return {
    id: profile.id,
    appliesTo: profile.appliesTo.map((target) => ({ kind: target.kind, templateId: target.templateId })),
    personaExcerpt: excerpt(profile.persona, PERSONA_EXCERPT_MAX),
    canonSensitive: profile.canonSensitive,
    fallbackLineId: profile.fallbackLineId,
    allowedIntentTypes: [...profile.allowedIntentTypes],
    allowedLineIdCount: profile.allowedLineIds.length,
    knowledgeScopeCount: profile.knowledgeScope.length,
    tabooTopicCount: profile.tabooTopics.length,
    socialMemoryLineIds,
    sceneAffinities: {
      likes: profile.sceneAffinities?.likesTags.length ?? 0,
      avoids: profile.sceneAffinities?.avoidsTags.length ?? 0,
      comments: profile.sceneAffinities?.commentsOnTags.length ?? 0,
    },
    itemInterest: {
      attracted: profile.itemInterest?.attractedToTags.length ?? 0,
      avoids: profile.itemInterest?.avoidsTags.length ?? 0,
    },
    hasTimeWeatherSensitivity: profile.timeWeatherSensitivity !== undefined,
    companionReactionCount: profile.companionReactions?.length ?? 0,
    missingAuthoringFields: profileMissingAuthoringFields(profile),
  };
}

function profileMissingAuthoringFields(profile: AiAgentProfile): string[] {
  const missing: string[] = [];
  if (profile.appliesTo.length === 0) missing.push('appliesTo');
  if (profile.persona.trim().length < 24) missing.push('persona');
  if (profile.allowedIntentTypes.length === 0) missing.push('allowedIntentTypes');
  if (profile.allowedLineIds.length === 0) missing.push('allowedLineIds');
  if (profile.fallbackLineId.trim().length === 0) missing.push('fallbackLineId');
  if (profile.knowledgeScope.length < 4) missing.push('knowledgeScope');
  if (profile.tabooTopics.length < 2) missing.push('tabooTopics');
  if (profile.socialMemory.style.trim().length === 0) missing.push('socialMemory.style');
  if (profile.socialMemory.recognitionLineId.trim().length === 0) missing.push('socialMemory.recognitionLineId');
  if (profile.socialMemory.rumorLineId.trim().length === 0) missing.push('socialMemory.rumorLineId');
  if ((profile.socialMemory.questRumorLineId?.trim().length ?? 0) === 0) missing.push('socialMemory.questRumorLineId');
  if (!profile.sceneAffinities) missing.push('sceneAffinities');
  if (!profile.itemInterest) missing.push('itemInterest');
  if (!profile.timeWeatherSensitivity) missing.push('timeWeatherSensitivity');
  if (profile.timeWeatherSensitivity && !profileTimeWeatherIsValid(profile)) missing.push('timeWeatherSensitivity.range');
  return missing;
}

function profileAuthoringIssues(): AiProfileAuthoringIssue[] {
  const issues: AiProfileAuthoringIssue[] = [];
  const profileIds = new Set<string>();
  const targetOwners = new Map<string, string>();

  for (const profile of AI_AGENT_PROFILES) {
    if (profileIds.has(profile.id)) {
      issues.push(issue('error', 'duplicateProfileId', profile.id, 'Profile id is duplicated.'));
    }
    profileIds.add(profile.id);

    for (const field of profileMissingAuthoringFields(profile)) {
      issues.push(issue('error', 'missingAuthoringField', profile.id, `Missing or thin authoring field: ${field}.`));
    }

    if (!profile.allowedLineIds.includes(profile.fallbackLineId)) {
      issues.push(issue('error', 'fallbackNotAllowed', profile.id, 'Fallback lineId is not present in allowedLineIds.'));
    }

    for (const lineId of profileLineIds(profile)) {
      if (!lineId.startsWith('hudChrome.aiSpeech.')) {
        issues.push(issue('error', 'invalidLineIdShape', profile.id, `LineId must use hudChrome.aiSpeech.*: ${lineId}.`));
      }
    }

    for (const target of profile.appliesTo) {
      const targetKey = `${target.kind}:${target.templateId}`;
      const previousOwner = targetOwners.get(targetKey);
      if (previousOwner && previousOwner !== profile.id) {
        issues.push(issue(
          'error',
          'duplicateProfileTarget',
          profile.id,
          `Target is already owned by profile ${previousOwner}.`,
          target,
        ));
      }
      targetOwners.set(targetKey, profile.id);

      if (target.kind === 'npc' && !NPCS[target.templateId]) {
        issues.push(issue('error', 'unknownNpcTarget', profile.id, 'NPC target does not exist in content data.', target));
      }
      if (target.kind === 'mob' && !MOBS[target.templateId]) {
        issues.push(issue('error', 'unknownMobTarget', profile.id, 'Mob target does not exist in content data.', target));
      }
    }
  }

  for (const npcId of interactiveAiNpcIds()) {
    if (profileFor('npc', npcId).id === GENERIC_NPC_AI_PROFILE.id) {
      issues.push(issue('error', 'missingInteractiveProfile', GENERIC_NPC_AI_PROFILE.id, 'Interactive NPC resolves to the generic profile.', {
        kind: 'npc',
        templateId: npcId,
      }));
    }
  }

  return issues;
}

function issue(
  severity: AiProfileAuthoringIssueSeverity,
  code: string,
  profileId: string,
  detail: string,
  target?: AiProfilePreviewTarget,
): AiProfileAuthoringIssue {
  return {
    severity,
    code,
    profileId,
    detail,
    ...(target ? { targetKind: target.kind, targetTemplateId: target.templateId } : {}),
  };
}

function compareProfileAuthoringIssues(a: AiProfileAuthoringIssue, b: AiProfileAuthoringIssue): number {
  const severityOrder = severityRank(a.severity) - severityRank(b.severity);
  if (severityOrder !== 0) return severityOrder;
  return `${a.code}:${a.profileId}:${a.targetTemplateId ?? ''}`
    .localeCompare(`${b.code}:${b.profileId}:${b.targetTemplateId ?? ''}`);
}

function severityRank(severity: AiProfileAuthoringIssueSeverity): number {
  return severity === 'error' ? 0 : 1;
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

function interactiveAiNpcIds(): string[] {
  return Object.values(NPCS)
    .filter((npc) => npc.questIds.length > 0 || (npc.vendorItems?.length ?? 0) > 0 || npc.market === true)
    .map((npc) => npc.id)
    .sort();
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

function excerpt(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
