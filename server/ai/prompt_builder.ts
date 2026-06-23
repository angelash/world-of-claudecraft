import type { AiJobContextV1, AiSpeechFingerprint } from './ai_types';
import { familyDirectorProjectionFor, mobFamilyFromValue } from './director_family_projection';
import { profileDirectorProjectionTags } from './profile_projection';
import { dynamicSpeechPromptRules } from './speech_style';

const COMPACT_TAG_LIMIT = 8;
const COMPACT_QUEST_LIMIT = 4;
const COMPACT_OBSERVATION_LIMIT = 8;
const COMPACT_MEMORY_LIMIT = 6;
const COMPACT_DIRECTOR_LIMIT = 3;
const COMPACT_OBJECT_LIMIT = 5;
const COMPACT_ITEM_LIMIT = 4;
const COMPACT_COMPANION_LIMIT = 3;
const COMPACT_EVENT_LIMIT = 5;

type AiPromptTrigger = AiJobContextV1['trigger'];
type SceneDetailLevel = 'none' | 'brief' | 'full';

interface PromptPolicy {
  focus: string;
  goal: string;
  guidance: readonly string[];
  includeProfile: boolean;
  includeQuestFacts: boolean;
  includeEntityQuestIds: boolean;
  includePlayerQuestIds: boolean;
  sceneDetail: SceneDetailLevel;
  includeNearbyObjects: boolean;
  includeDroppedItems: boolean;
  includeCompanions: boolean;
  includeRecentSceneEvents: boolean;
  includeFamilySemantics: boolean;
  includeRecentObservations: boolean;
  includeDirectorProposals: boolean;
  includeMemorySignals: boolean;
  compactTagLimit: number;
  questLimit: number;
  observationLimit: number;
  memoryLimit: number;
  directorLimit: number;
  objectLimit: number;
  itemLimit: number;
  companionLimit: number;
  eventLimit: number;
}

const DEFAULT_PROMPT_POLICY: PromptPolicy = {
  focus: 'NPC social scene',
  goal: 'answer as one living entity in the immediate scene, without changing game outcomes',
  guidance: [
    '- Keep the response short, local, and sensory.',
    '- Prefer one visible scene hook over broad explanation.',
  ],
  includeProfile: true,
  includeQuestFacts: true,
  includeEntityQuestIds: true,
  includePlayerQuestIds: true,
  sceneDetail: 'full',
  includeNearbyObjects: true,
  includeDroppedItems: true,
  includeCompanions: true,
  includeRecentSceneEvents: true,
  includeFamilySemantics: true,
  includeRecentObservations: true,
  includeDirectorProposals: true,
  includeMemorySignals: true,
  compactTagLimit: COMPACT_TAG_LIMIT,
  questLimit: COMPACT_QUEST_LIMIT,
  observationLimit: COMPACT_OBSERVATION_LIMIT,
  memoryLimit: COMPACT_MEMORY_LIMIT,
  directorLimit: COMPACT_DIRECTOR_LIMIT,
  objectLimit: COMPACT_OBJECT_LIMIT,
  itemLimit: COMPACT_ITEM_LIMIT,
  companionLimit: COMPACT_COMPANION_LIMIT,
  eventLimit: COMPACT_EVENT_LIMIT,
};

const PROMPT_POLICIES: Record<AiPromptTrigger, PromptPolicy> = {
  npc_gossip_opened: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'NPC gossip opener',
    goal: 'open gossip as a present, grounded social beat that can mention visible quest context only when safe',
    guidance: [
      '- Start from the NPC persona, then anchor the line in one visible scene, memory, weather, object, or rumor cue.',
      '- If outputMode is line_id_only, choose one allowed lineId that best fits the immediate moment.',
      '- If the player is unfamiliar, show caution through tone instead of explaining missing relationship data.',
    ],
  },
  npc_question: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'NPC question answer',
    goal: 'answer the player topic directly, briefly, and in character using only visible facts',
    guidance: [
      '- Treat job.topic as the player-facing subject; answer it first, then add at most one local detail.',
      '- If the requested answer needs hidden lore, future quest outcomes, or unseen facts, deflect naturally in character.',
      '- Do not turn the answer into a system summary, advice essay, or relationship report.',
    ],
    observationLimit: 5,
    memoryLimit: 4,
    directorLimit: 2,
    objectLimit: 3,
    itemLimit: 3,
    companionLimit: 2,
    eventLimit: 4,
  },
  object_inspected: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'Object inspection',
    goal: 'describe or react to the visible object and its local scene affordances without implying rule changes',
    guidance: [
      '- Center the object: material, marks, smell, light, danger, and nearby affordances.',
      '- Keep NPC-like social memory in the background unless it is directly attached to the inspected object.',
      '- Never imply the object can be looted, opened, moved, or used unless job.json shows that affordance.',
    ],
    includeProfile: true,
    includePlayerQuestIds: false,
    sceneDetail: 'full',
    includeCompanions: false,
    includeDirectorProposals: false,
    memoryLimit: 3,
    observationLimit: 4,
    objectLimit: 4,
    itemLimit: 4,
    eventLimit: 4,
  },
  singularity_candidate: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'Singularity creature reaction',
    goal: 'make an ordinary creature briefly feel individual, driven by family instincts and the exact nearby stimulus',
    guidance: [
      '- Prioritize family instinct, dropped item tags, scene danger, time/weather, and memory signals over NPC-style exposition.',
      '- Let one unusual personal quirk show when supported by memory or director signals.',
      '- Choose approach, avoid, inspect, pause, or comment intents only from allowedIntents.',
    ],
    includeProfile: true,
    includeQuestFacts: false,
    includeEntityQuestIds: false,
    includePlayerQuestIds: false,
    sceneDetail: 'full',
    includeCompanions: true,
    includeDirectorProposals: true,
    includeMemorySignals: true,
    observationLimit: 6,
    memoryLimit: 5,
    directorLimit: 3,
    objectLimit: 4,
    itemLimit: 4,
    companionLimit: 3,
    eventLimit: 5,
  },
  pet_command: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'Pet command',
    goal: 'interpret the player command into a bounded pet stance or action, with minimal flavor',
    guidance: [
      '- Treat job.topic as the command text or command category.',
      '- Prefer one commandPet* intent and no speech unless dynamicText is explicitly allowed.',
      '- Mention scene danger only if it changes passive, defensive, aggressive, attack, taunt, or ignore behavior.',
    ],
    includeProfile: false,
    includeQuestFacts: false,
    includeEntityQuestIds: false,
    includePlayerQuestIds: false,
    sceneDetail: 'brief',
    includeNearbyObjects: false,
    includeDroppedItems: false,
    includeCompanions: true,
    includeRecentSceneEvents: false,
    includeFamilySemantics: true,
    includeRecentObservations: false,
    includeDirectorProposals: false,
    includeMemorySignals: false,
    compactTagLimit: 5,
    questLimit: 0,
    observationLimit: 0,
    memoryLimit: 0,
    directorLimit: 0,
    objectLimit: 0,
    itemLimit: 0,
    companionLimit: 2,
    eventLimit: 0,
  },
  active_poll: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'Autonomous nearby life beat',
    goal: 'let one nearby entity show awareness of the immediate scene while preserving all gameplay outcomes',
    guidance: [
      '- The player did not ask a question. Do not sound like an answer or tutorial.',
      '- React as if the entity noticed one nearby thing: weather, light, object, dropped item, companion, danger, or routine pressure.',
      '- Keep the beat short enough to feel overheard in the world, not performed for the player.',
    ],
    includeQuestFacts: false,
    includeEntityQuestIds: false,
    includePlayerQuestIds: false,
    sceneDetail: 'full',
    includeNearbyObjects: true,
    includeDroppedItems: true,
    includeCompanions: true,
    includeRecentSceneEvents: true,
    includeFamilySemantics: true,
    includeRecentObservations: true,
    includeDirectorProposals: true,
    includeMemorySignals: true,
    questLimit: 0,
    observationLimit: 6,
    memoryLimit: 4,
    directorLimit: 2,
    objectLimit: 4,
    itemLimit: 3,
    companionLimit: 3,
    eventLimit: 4,
  },
  active_event: {
    ...DEFAULT_PROMPT_POLICY,
    focus: 'Autonomous event reaction',
    goal: 'react to a concrete world event as a living entity, without deciding combat, quests, loot, or movement authority',
    guidance: [
      '- Treat recent scene events and recentObservations as the reason this entity noticed something.',
      '- Prefer one emotional or sensory reaction over explaining the event mechanically.',
      '- If an intent is allowed, choose only a visible, reversible expression such as inspect, avoid, pause, lookAt, or faceEntity.',
    ],
    includeQuestFacts: false,
    includeEntityQuestIds: false,
    includePlayerQuestIds: false,
    sceneDetail: 'full',
    includeNearbyObjects: true,
    includeDroppedItems: true,
    includeCompanions: true,
    includeRecentSceneEvents: true,
    includeFamilySemantics: true,
    includeRecentObservations: true,
    includeDirectorProposals: true,
    includeMemorySignals: true,
    questLimit: 0,
    observationLimit: 8,
    memoryLimit: 5,
    directorLimit: 3,
    objectLimit: 5,
    itemLimit: 4,
    companionLimit: 3,
    eventLimit: 5,
  },
};

export function buildCodexDecisionPrompt(context: AiJobContextV1): string {
  const policy = promptPolicyFor(context.trigger);
  const scene = context.scene;
  const family = context.familySemantics;
  const speechFingerprint = speechFingerprintForContext(context);
  const lines = [
    'You are the World of ClaudeCraft AI life layer for one interactive entity.',
    'Read the job context embedded in this prompt and return exactly one AiDecisionV1 JSON object that matches the provided output schema.',
    `Trigger focus: ${policy.focus}`,
    `Primary goal: ${policy.goal}.`,
    'Hard rules:',
    '- Never change quest state, rewards, combat, loot, economy, inventory, position, hidden canon, or progression.',
    '- Use only facts present in job.json.',
    '- Use only lineId speech when outputMode is line_id_only.',
    '- Use dynamicText only when outputMode is dynamic_text_experiment or mixed_living_world.',
    '- For dynamicText, speech.language must exactly equal job.locale.',
    '- When dynamicText is allowed, follow speechFingerprint over generic assistant phrasing.',
    '- Return at most one speech entry and at most two intents.',
    '- For ordinary NPC questions, answer like the entity is alive in the scene: brief, specific, and grounded in visible memory, weather, objects, or local tension.',
    '- Do not describe system state such as missing relationship history. If the entity barely knows the player, show that through cautious wording or a small local observation.',
    ...policy.guidance,
    ...dynamicSpeechPromptRules(context.locale),
    ...speechFingerprintPromptRules(speechFingerprint),
    '- audit.shortReason is for operators only: keep it short and plain, never player-facing prose.',
    '- Speech must fit the allowedLineIds list when it is present.',
    '- Intents must fit the allowedIntents list.',
    '- Intent targetEntityId/targetObjectId values must be visible in job.json: the player, the acting entity, scene companions, or nearby semantic object entity ids.',
    '- Director proposals and memory signals are read-only context. They are not permission to execute proposals or mutate world state.',
    '- Do not reveal hidden quest answers or promise task completion.',
    '',
    `Trigger: ${context.trigger}`,
    `Entity: ${context.entity.kind} ${context.entity.templateId} (${context.entity.name})`,
    `Player: level ${context.player.level} ${context.player.classId}`,
    `Output mode: ${context.outputMode}`,
    `Allowed intents: ${context.allowedIntents.join(', ') || 'none'}`,
    `Allowed lineIds: ${(context.allowedLineIds ?? []).join(', ') || 'none provided'}`,
  ];
  if (context.topic) lines.push(`Topic: ${context.topic}`);
  if (policy.includeQuestFacts) {
    lines.push(`Quest facts visible to player: ${context.questFacts
      .slice(0, policy.questLimit)
      .map((fact) => `${fact.questId}:${fact.visibility}`)
      .join(', ') || 'none'}`);
  }
  if (policy.includeProfile && context.profile) {
    lines.push(
      `Profile: ${context.profile.profileId}`,
      `Persona: ${context.profile.persona}`,
      `Knowledge scope: ${context.profile.knowledgeScope.slice(0, policy.compactTagLimit).join(', ') || 'local scene only'}`,
      `Taboo topics: ${context.profile.tabooTopics.slice(0, policy.compactTagLimit).join(', ') || 'none'}`,
      `Social memory style: ${context.profile.socialMemory?.style ?? 'grounded local recollection'}`,
    );
    if (context.profile.speechFingerprint) {
      lines.push(`Speech fingerprint: ${formatSpeechFingerprint(context.profile.speechFingerprint, policy.compactTagLimit)}`);
    }
  }
  if (scene && policy.sceneDetail !== 'none') {
    lines.push(
      `Scene: ${scene.subsceneId ?? scene.zoneId}`,
      `Scene tags: ${[
        ...scene.biomeTags,
        ...scene.locationTags,
        ...scene.structureTags,
        ...scene.environmentalTags,
      ].slice(0, policy.sceneDetail === 'brief' ? 8 : 18).join(', ')}`,
      `Time/weather: ${scene.time.phase}, ${scene.weather.kind}, light ${scene.light.level}`,
      `Danger: undead=${scene.danger.undeadPressure.toFixed(2)}, hostile=${scene.danger.hostileDensity.toFixed(2)}, safe=${scene.danger.safeHavenScore.toFixed(2)}`,
    );
    if (policy.sceneDetail === 'full') {
      lines.splice(lines.length - 1, 0, `Time/weather mood: dayEnergy=${scene.mood.dayEnergy.toFixed(2)}, nightFatigue=${scene.mood.nightFatigue.toFixed(2)}, clearNightAwe=${scene.mood.clearNightAwe.toFixed(2)}, rainIrritation=${scene.mood.rainIrritation.toFixed(2)}, fogFear=${scene.mood.fogFear.toFixed(2)}`);
    }
    if (policy.includeNearbyObjects && scene.nearbySemanticObjects.length > 0) {
      lines.push(`Nearby semantic objects: ${scene.nearbySemanticObjects
        .slice(0, policy.objectLimit)
        .map((object) => `${object.objectId}:${object.displayName}[${object.source}](tags=${object.tags.slice(0, 4).join('/')}; features=${object.featureTags.slice(0, 4).join('/')}; affordances=${object.affordanceTags.slice(0, 4).join('/')}; ${object.distance}yd)`)
        .join(', ')}`);
    }
    if (policy.includeDroppedItems && scene.droppedItems.length > 0) {
      lines.push(`Dropped items: ${scene.droppedItems
        .slice(0, policy.itemLimit)
        .map((item) => `${item.itemId}:${item.displayName}(${[...item.itemTags, ...item.dangerTags, ...item.valueSignals].slice(0, 6).join('/')}, fresh=${item.freshnessSeconds}s)`)
        .join(', ')}`);
    }
    if (policy.includeCompanions && scene.companions.length > 0) {
      lines.push(`Companions: ${scene.companions
        .slice(0, policy.companionLimit)
        .map((companion) => `${companion.displayName}:${companion.templateId}:${companion.family ?? 'unknown'}(${companion.tags.slice(0, 4).join('/')})`)
        .join(', ')}`);
    }
    if (policy.includeRecentSceneEvents && scene.recentSceneEvents.length > 0) {
      lines.push(`Recent scene events: ${scene.recentSceneEvents.slice(0, policy.eventLimit).join(', ')}`);
    }
  }
  if (policy.includeFamilySemantics && family) {
    lines.push(
      `Family: ${family.familyName}`,
      `Instincts: ${family.baseInstincts.slice(0, policy.compactTagLimit).join(', ')}`,
      `Attracted item tags: ${family.attractedItemTags.slice(0, policy.compactTagLimit).join(', ')}`,
      `Avoided item tags: ${family.avoidedItemTags.slice(0, policy.compactTagLimit).join(', ')}`,
      `Speech style: ${family.speechStyle}`,
    );
    if (family.speechFingerprint) {
      lines.push(`Family speech fingerprint: ${formatSpeechFingerprint(family.speechFingerprint, policy.compactTagLimit)}`);
    }
  }
  if (policy.includeRecentObservations && context.recentObservations.length > 0) {
    lines.push(`Recent observations: ${context.recentObservations.slice(0, policy.observationLimit).join(', ')}`);
  }
  if (policy.includeDirectorProposals && context.directorProposals && context.directorProposals.length > 0) {
    lines.push(`Director proposals: ${context.directorProposals
      .slice(0, policy.directorLimit)
      .map((proposal) => [
        `${proposal.intent}:${proposal.status}:${proposal.risk}`,
        `intensity=${proposal.intensity.toFixed(2)}`,
        `target=${proposal.targetRef}`,
        `scene=${proposal.sceneId}`,
        `zone=${proposal.zoneId}`,
        `line=${proposal.suggestedLineId}`,
        `expires=${Math.round(proposal.expiresAt)}`,
        `reasons=${proposal.reasonTags.slice(0, 6).join('/') || 'none'}`,
        `safety=${proposal.safetyNotes.join('/') || 'none'}`,
      ].join(':'))
      .join(', ')}`);
    const familyProjectionSummary = directorFamilyProjectionSummary(context, policy);
    if (familyProjectionSummary) lines.push(familyProjectionSummary);
  }
  if (policy.includeMemorySignals && context.memorySignals && context.memorySignals.length > 0) {
    lines.push(`Memory signals: ${context.memorySignals
      .slice(0, policy.memoryLimit)
      .map((signal) => `${signal.kind}:${signal.refId}:${signal.scope}:salience=${signal.salience.toFixed(2)}:${signal.reason}`)
      .join(', ')}`);
  }
  lines.push(
    '',
    'Compact job JSON (source of truth):',
    JSON.stringify(compactPromptContext(context, policy)),
    '',
    'Return only JSON. No Markdown. No commentary.',
  );
  return lines.join('\n');
}

function compactPromptContext(context: AiJobContextV1, policy: PromptPolicy): Record<string, unknown> {
  return omitUndefined({
    schemaVersion: context.schemaVersion,
    jobId: context.jobId,
    trigger: context.trigger,
    locale: context.locale,
    topic: context.topic,
    outputMode: context.outputMode,
    entity: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
      name: context.entity.name,
      level: context.entity.level,
      questIds: policy.includeEntityQuestIds ? context.entity.questIds.slice(0, policy.questLimit) : undefined,
      dead: context.entity.dead,
    },
    player: {
      entityId: context.player.entityId,
      name: context.player.name,
      level: context.player.level,
      classId: context.player.classId,
      activeQuestIds: policy.includePlayerQuestIds ? context.player.activeQuestIds.slice(0, policy.questLimit) : undefined,
      completedQuestIds: policy.includePlayerQuestIds ? context.player.completedQuestIds.slice(0, policy.questLimit) : undefined,
    },
    profile: policy.includeProfile && context.profile ? {
      profileId: context.profile.profileId,
      persona: context.profile.persona,
      knowledgeScope: context.profile.knowledgeScope.slice(0, policy.compactTagLimit),
      tabooTopics: context.profile.tabooTopics.slice(0, policy.compactTagLimit),
      socialMemoryStyle: context.profile.socialMemory?.style,
      speechFingerprint: context.profile.speechFingerprint
        ? compactSpeechFingerprint(context.profile.speechFingerprint, policy.compactTagLimit)
        : undefined,
    } : undefined,
    scene: context.scene && policy.sceneDetail !== 'none' ? compactScene(context.scene, policy) : undefined,
    familySemantics: policy.includeFamilySemantics && context.familySemantics ? {
      family: context.familySemantics.family,
      familyName: context.familySemantics.familyName,
      instincts: context.familySemantics.baseInstincts.slice(0, policy.compactTagLimit),
      attractedItemTags: context.familySemantics.attractedItemTags.slice(0, policy.compactTagLimit),
      avoidedItemTags: context.familySemantics.avoidedItemTags.slice(0, policy.compactTagLimit),
      speechStyle: context.familySemantics.speechStyle,
      speechFingerprint: compactSpeechFingerprint(context.familySemantics.speechFingerprint, policy.compactTagLimit),
    } : undefined,
    questFacts: policy.includeQuestFacts ? context.questFacts.slice(0, policy.questLimit).map((fact) => ({
      questId: fact.questId,
      visibility: fact.visibility,
      summary: fact.summary,
      stageId: fact.stageId,
      source: fact.source,
    })) : undefined,
    recentObservations: policy.includeRecentObservations
      ? context.recentObservations.slice(0, policy.observationLimit)
      : undefined,
    memorySignals: policy.includeMemorySignals ? context.memorySignals?.slice(0, policy.memoryLimit).map((signal) => ({
      kind: signal.kind,
      refId: signal.refId,
      scope: signal.scope,
      sceneId: signal.sceneId,
      zoneId: signal.zoneId,
      templateId: signal.templateId,
      itemId: signal.itemId,
      questId: signal.questId,
      subjectKind: signal.subjectKind,
      lineIds: signal.lineIds.slice(0, 3),
      salience: round2(signal.salience),
      reason: signal.reason,
    })) : undefined,
    directorProposals: policy.includeDirectorProposals ? context.directorProposals?.slice(0, policy.directorLimit).map((proposal) => ({
      intent: proposal.intent,
      status: proposal.status,
      risk: proposal.risk,
      intensity: round2(proposal.intensity),
      targetRef: proposal.targetRef,
      sceneId: proposal.sceneId,
      zoneId: proposal.zoneId,
      suggestedLineId: proposal.suggestedLineId,
      reasonTags: proposal.reasonTags.slice(0, policy.compactTagLimit),
      safetyNotes: proposal.safetyNotes.slice(0, 3),
    })) : undefined,
    allowedIntents: context.allowedIntents,
    allowedLineIds: context.allowedLineIds,
  });
}

function compactScene(scene: NonNullable<AiJobContextV1['scene']>, policy: PromptPolicy): Record<string, unknown> {
  return omitUndefined({
    zoneId: scene.zoneId,
    subsceneId: scene.subsceneId,
    tags: [
      ...scene.biomeTags,
      ...scene.locationTags,
      ...scene.structureTags,
      ...scene.environmentalTags,
    ].slice(0, policy.sceneDetail === 'brief' ? 8 : 18),
    time: {
      phase: scene.time.phase,
      weather: scene.weather.kind,
      lightLevel: scene.light.level,
      lightTags: scene.light.tags.slice(0, COMPACT_TAG_LIMIT),
    },
    mood: {
      dayEnergy: round2(scene.mood.dayEnergy),
      nightFatigue: round2(scene.mood.nightFatigue),
      clearNightAwe: round2(scene.mood.clearNightAwe),
      rainIrritation: round2(scene.mood.rainIrritation),
      fogFear: round2(scene.mood.fogFear),
    },
    danger: {
      undead: round2(scene.danger.undeadPressure),
      hostile: round2(scene.danger.hostileDensity),
      safe: round2(scene.danger.safeHavenScore),
    },
    nearbySemanticObjects: policy.includeNearbyObjects ? scene.nearbySemanticObjects.slice(0, policy.objectLimit).map((object) => ({
      objectId: object.objectId,
      entityId: object.entityId,
      templateId: object.templateId,
      displayName: object.displayName,
      source: object.source,
      distance: object.distance,
      tags: object.tags.slice(0, 4),
      features: object.featureTags.slice(0, 4),
      affordances: object.affordanceTags.slice(0, 4),
    })) : undefined,
    droppedItems: policy.includeDroppedItems ? scene.droppedItems.slice(0, policy.itemLimit).map((item) => ({
      itemId: item.itemId,
      displayName: item.displayName,
      rarity: item.rarity,
      freshnessSeconds: item.freshnessSeconds,
      tags: [...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals].slice(0, policy.compactTagLimit),
    })) : undefined,
    companions: policy.includeCompanions ? scene.companions.slice(0, policy.companionLimit).map((companion) => ({
      entityId: companion.entityId,
      templateId: companion.templateId,
      displayName: companion.displayName,
      family: companion.family,
      tags: companion.tags.slice(0, 4),
    })) : undefined,
    recentSceneEvents: policy.includeRecentSceneEvents
      ? scene.recentSceneEvents.slice(0, policy.eventLimit)
      : undefined,
  });
}

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function formatSpeechFingerprint(fingerprint: AiSpeechFingerprint, limit: number): string {
  return [
    `rhythm=${fingerprint.sentenceRhythm}`,
    `address=${fingerprint.addressStyle}`,
    `starts=${fingerprint.favoriteStarts.slice(0, limit).join('/') || 'none'}`,
    `sensory=${fingerprint.sensoryBias.slice(0, limit).join('/') || 'none'}`,
    `avoid=${fingerprint.avoidedPhrases.slice(0, limit).join('/') || 'none'}`,
  ].join('; ');
}

function compactSpeechFingerprint(fingerprint: AiSpeechFingerprint, limit: number): Record<string, unknown> {
  return {
    rhythm: fingerprint.sentenceRhythm,
    address: fingerprint.addressStyle,
    starts: fingerprint.favoriteStarts.slice(0, limit),
    sensory: fingerprint.sensoryBias.slice(0, limit),
    avoid: fingerprint.avoidedPhrases.slice(0, limit),
  };
}

function promptPolicyFor(trigger: AiPromptTrigger): PromptPolicy {
  return PROMPT_POLICIES[trigger];
}

function directorFamilyProjectionSummary(context: AiJobContextV1, policy: PromptPolicy): string | null {
  const family = promptProjectionFamily(context);
  if (!family || !context.directorProposals || context.directorProposals.length === 0) return null;
  const summaries = context.directorProposals
    .slice(0, policy.directorLimit)
    .map((proposal) => {
      const projection = familyDirectorProjectionFor(proposal, { family });
      if (!projection) return null;
      const profileTags = profileDirectorProjectionTags(context.profile);
      return [
        `${proposal.intent}:${projection.reaction}`,
        `curiosity=${projection.curiosity.toFixed(2)}`,
        `fear=${projection.fear.toFixed(2)}`,
        `reasons=${projection.reasonTags.slice(0, 6).join('/') || 'none'}`,
        ...(profileTags.length > 0 ? [`profile=${profileTags.join('/')}`] : []),
      ].join(':');
    })
    .filter((summary): summary is string => summary !== null);
  if (summaries.length === 0) return null;
  return `Director family projection (${family}): ${summaries.join(', ')}`;
}

function promptProjectionFamily(context: AiJobContextV1) {
  const semanticFamily = mobFamilyFromValue(context.familySemantics?.family);
  if (semanticFamily) return semanticFamily;
  return context.entity.kind === 'npc' ? 'humanoid' : null;
}

function speechFingerprintForContext(context: AiJobContextV1): AiSpeechFingerprint | null {
  if (context.entity.kind === 'mob') return context.familySemantics?.speechFingerprint ?? context.profile?.speechFingerprint ?? null;
  return context.profile?.speechFingerprint ?? context.familySemantics?.speechFingerprint ?? null;
}

function speechFingerprintPromptRules(fingerprint: AiSpeechFingerprint | null): string[] {
  if (!fingerprint) return [];
  const openings = fingerprint.favoriteStarts.slice(0, 3).join(' / ');
  const sensory = fingerprint.sensoryBias.slice(0, 4).join(', ');
  const avoided = fingerprint.avoidedPhrases.slice(0, 4).join(', ');
  return [
    `- Speech rhythm target: ${fingerprint.sentenceRhythm}.`,
    `- Address style target: ${fingerprint.addressStyle}.`,
    ...(openings ? [`- If you need an opening, lean toward this voice: ${openings}. Do not stack multiple openings.`] : []),
    ...(sensory ? [`- Favor concrete sensory anchors such as ${sensory}.`] : []),
    ...(avoided ? [`- Never use or echo these phrases unless the scene literally demands them: ${avoided}.`] : []),
  ];
}
