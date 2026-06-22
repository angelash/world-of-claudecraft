import type { AiJobContextV1 } from './ai_types';
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

export function buildCodexDecisionPrompt(context: AiJobContextV1): string {
  const scene = context.scene;
  const family = context.familySemantics;
  const lines = [
    'You are the World of ClaudeCraft AI life layer for one interactive entity.',
    'Read the job context embedded in this prompt and return exactly one AiDecisionV1 JSON object that matches the provided output schema.',
    'Hard rules:',
    '- Never change quest state, rewards, combat, loot, economy, inventory, position, hidden canon, or progression.',
    '- Use only facts present in job.json.',
    '- Use only lineId speech when outputMode is line_id_only.',
    '- Use dynamicText only when outputMode is dynamic_text_experiment or mixed_living_world.',
    '- For dynamicText, speech.language must exactly equal job.locale.',
    '- Return at most one speech entry and at most two intents.',
    '- For ordinary NPC questions, answer like the entity is alive in the scene: brief, specific, and grounded in visible memory, weather, objects, or local tension.',
    '- Do not describe system state such as missing relationship history. If the entity barely knows the player, show that through cautious wording or a small local observation.',
    ...dynamicSpeechPromptRules(context.locale),
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
    `Quest facts visible to player: ${context.questFacts.map((fact) => `${fact.questId}:${fact.visibility}`).join(', ') || 'none'}`,
  ];
  if (context.topic) lines.push(`Topic: ${context.topic}`);
  if (context.profile) {
    lines.push(
      `Profile: ${context.profile.profileId}`,
      `Persona: ${context.profile.persona}`,
      `Knowledge scope: ${context.profile.knowledgeScope.join(', ') || 'local scene only'}`,
      `Taboo topics: ${context.profile.tabooTopics.join(', ') || 'none'}`,
      `Social memory style: ${context.profile.socialMemory?.style ?? 'grounded local recollection'}`,
    );
  }
  if (scene) {
    lines.push(
      `Scene: ${scene.subsceneId ?? scene.zoneId}`,
      `Scene tags: ${[
        ...scene.biomeTags,
        ...scene.locationTags,
        ...scene.structureTags,
        ...scene.environmentalTags,
      ].slice(0, 18).join(', ')}`,
      `Time/weather: ${scene.time.phase}, ${scene.weather.kind}, light ${scene.light.level}`,
      `Time/weather mood: dayEnergy=${scene.mood.dayEnergy.toFixed(2)}, nightFatigue=${scene.mood.nightFatigue.toFixed(2)}, clearNightAwe=${scene.mood.clearNightAwe.toFixed(2)}, rainIrritation=${scene.mood.rainIrritation.toFixed(2)}, fogFear=${scene.mood.fogFear.toFixed(2)}`,
      `Danger: undead=${scene.danger.undeadPressure.toFixed(2)}, hostile=${scene.danger.hostileDensity.toFixed(2)}, safe=${scene.danger.safeHavenScore.toFixed(2)}`,
    );
    if (scene.nearbySemanticObjects.length > 0) {
      lines.push(`Nearby semantic objects: ${scene.nearbySemanticObjects
        .slice(0, 6)
        .map((object) => `${object.objectId}:${object.displayName}[${object.source}](tags=${object.tags.slice(0, 4).join('/')}; features=${object.featureTags.slice(0, 4).join('/')}; affordances=${object.affordanceTags.slice(0, 4).join('/')}; ${object.distance}yd)`)
        .join(', ')}`);
    }
    if (scene.droppedItems.length > 0) {
      lines.push(`Dropped items: ${scene.droppedItems
        .slice(0, 6)
        .map((item) => `${item.itemId}:${item.displayName}(${[...item.itemTags, ...item.dangerTags, ...item.valueSignals].slice(0, 6).join('/')}, fresh=${item.freshnessSeconds}s)`)
        .join(', ')}`);
    }
    if (scene.companions.length > 0) {
      lines.push(`Companions: ${scene.companions
        .slice(0, 4)
        .map((companion) => `${companion.displayName}:${companion.templateId}:${companion.family ?? 'unknown'}(${companion.tags.slice(0, 4).join('/')})`)
        .join(', ')}`);
    }
    if (scene.recentSceneEvents.length > 0) {
      lines.push(`Recent scene events: ${scene.recentSceneEvents.slice(0, 8).join(', ')}`);
    }
  }
  if (family) {
    lines.push(
      `Family: ${family.familyName}`,
      `Instincts: ${family.baseInstincts.join(', ')}`,
      `Attracted item tags: ${family.attractedItemTags.join(', ')}`,
      `Avoided item tags: ${family.avoidedItemTags.join(', ')}`,
      `Speech style: ${family.speechStyle}`,
    );
  }
  if (context.recentObservations.length > 0) {
    lines.push(`Recent observations: ${context.recentObservations.join(', ')}`);
  }
  if (context.directorProposals && context.directorProposals.length > 0) {
    lines.push(`Director proposals: ${context.directorProposals
      .slice(0, 4)
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
    const familyProjectionSummary = directorFamilyProjectionSummary(context);
    if (familyProjectionSummary) lines.push(familyProjectionSummary);
  }
  if (context.memorySignals && context.memorySignals.length > 0) {
    lines.push(`Memory signals: ${context.memorySignals
      .slice(0, 8)
      .map((signal) => `${signal.kind}:${signal.refId}:${signal.scope}:salience=${signal.salience.toFixed(2)}:${signal.reason}`)
      .join(', ')}`);
  }
  lines.push(
    '',
    'Compact job JSON (source of truth):',
    JSON.stringify(compactPromptContext(context)),
    '',
    'Return only JSON. No Markdown. No commentary.',
  );
  return lines.join('\n');
}

function compactPromptContext(context: AiJobContextV1): Record<string, unknown> {
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
      questIds: context.entity.questIds.slice(0, COMPACT_QUEST_LIMIT),
      dead: context.entity.dead,
    },
    player: {
      entityId: context.player.entityId,
      name: context.player.name,
      level: context.player.level,
      classId: context.player.classId,
      activeQuestIds: context.player.activeQuestIds.slice(0, COMPACT_QUEST_LIMIT),
      completedQuestIds: context.player.completedQuestIds.slice(0, COMPACT_QUEST_LIMIT),
    },
    profile: context.profile ? {
      profileId: context.profile.profileId,
      persona: context.profile.persona,
      knowledgeScope: context.profile.knowledgeScope.slice(0, COMPACT_TAG_LIMIT),
      tabooTopics: context.profile.tabooTopics.slice(0, COMPACT_TAG_LIMIT),
      socialMemoryStyle: context.profile.socialMemory?.style,
    } : undefined,
    scene: context.scene ? compactScene(context.scene) : undefined,
    familySemantics: context.familySemantics ? {
      family: context.familySemantics.family,
      familyName: context.familySemantics.familyName,
      instincts: context.familySemantics.baseInstincts.slice(0, COMPACT_TAG_LIMIT),
      attractedItemTags: context.familySemantics.attractedItemTags.slice(0, COMPACT_TAG_LIMIT),
      avoidedItemTags: context.familySemantics.avoidedItemTags.slice(0, COMPACT_TAG_LIMIT),
      speechStyle: context.familySemantics.speechStyle,
    } : undefined,
    questFacts: context.questFacts.slice(0, COMPACT_QUEST_LIMIT).map((fact) => ({
      questId: fact.questId,
      visibility: fact.visibility,
      summary: fact.summary,
      stageId: fact.stageId,
      source: fact.source,
    })),
    recentObservations: context.recentObservations.slice(0, COMPACT_OBSERVATION_LIMIT),
    memorySignals: context.memorySignals?.slice(0, COMPACT_MEMORY_LIMIT).map((signal) => ({
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
    })),
    directorProposals: context.directorProposals?.slice(0, COMPACT_DIRECTOR_LIMIT).map((proposal) => ({
      intent: proposal.intent,
      status: proposal.status,
      risk: proposal.risk,
      intensity: round2(proposal.intensity),
      targetRef: proposal.targetRef,
      sceneId: proposal.sceneId,
      zoneId: proposal.zoneId,
      suggestedLineId: proposal.suggestedLineId,
      reasonTags: proposal.reasonTags.slice(0, COMPACT_TAG_LIMIT),
      safetyNotes: proposal.safetyNotes.slice(0, 3),
    })),
    allowedIntents: context.allowedIntents,
    allowedLineIds: context.allowedLineIds,
  });
}

function compactScene(scene: NonNullable<AiJobContextV1['scene']>): Record<string, unknown> {
  return {
    zoneId: scene.zoneId,
    subsceneId: scene.subsceneId,
    tags: [
      ...scene.biomeTags,
      ...scene.locationTags,
      ...scene.structureTags,
      ...scene.environmentalTags,
    ].slice(0, 18),
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
    nearbySemanticObjects: scene.nearbySemanticObjects.slice(0, COMPACT_OBJECT_LIMIT).map((object) => ({
      objectId: object.objectId,
      entityId: object.entityId,
      templateId: object.templateId,
      displayName: object.displayName,
      source: object.source,
      distance: object.distance,
      tags: object.tags.slice(0, 4),
      features: object.featureTags.slice(0, 4),
      affordances: object.affordanceTags.slice(0, 4),
    })),
    droppedItems: scene.droppedItems.slice(0, COMPACT_ITEM_LIMIT).map((item) => ({
      itemId: item.itemId,
      displayName: item.displayName,
      rarity: item.rarity,
      freshnessSeconds: item.freshnessSeconds,
      tags: [...item.itemTags, ...item.smellTags, ...item.dangerTags, ...item.valueSignals].slice(0, COMPACT_TAG_LIMIT),
    })),
    companions: scene.companions.slice(0, COMPACT_COMPANION_LIMIT).map((companion) => ({
      entityId: companion.entityId,
      templateId: companion.templateId,
      displayName: companion.displayName,
      family: companion.family,
      tags: companion.tags.slice(0, 4),
    })),
    recentSceneEvents: scene.recentSceneEvents.slice(0, COMPACT_EVENT_LIMIT),
  };
}

function omitUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function directorFamilyProjectionSummary(context: AiJobContextV1): string | null {
  const family = promptProjectionFamily(context);
  if (!family || !context.directorProposals || context.directorProposals.length === 0) return null;
  const summaries = context.directorProposals
    .slice(0, 4)
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
