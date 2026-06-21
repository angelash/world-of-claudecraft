import type { AiJobContextV1 } from './ai_types';

export function buildCodexDecisionPrompt(context: AiJobContextV1): string {
  const scene = context.scene;
  const family = context.familySemantics;
  const lines = [
    'You are the World of ClaudeCraft AI life layer for one interactive entity.',
    'Read job.json and return exactly one AiDecisionV1 JSON object that matches decision.schema.json.',
    'Hard rules:',
    '- Never change quest state, rewards, combat, loot, economy, inventory, position, hidden canon, or progression.',
    '- Use only facts present in job.json.',
    '- Use only lineId speech when outputMode is line_id_only.',
    '- Use dynamicText only when outputMode is dynamic_text_experiment or mixed_living_world.',
    '- Speech must fit the allowedLineIds list when it is present.',
    '- Intents must fit the allowedIntents list.',
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
      `Danger: undead=${scene.danger.undeadPressure.toFixed(2)}, hostile=${scene.danger.hostileDensity.toFixed(2)}, safe=${scene.danger.safeHavenScore.toFixed(2)}`,
    );
    if (scene.nearbySemanticObjects.length > 0) {
      lines.push(`Nearby semantic objects: ${scene.nearbySemanticObjects
        .slice(0, 6)
        .map((object) => `${object.objectId}(${object.tags.slice(0, 4).join('/')}, ${object.distance}yd)`)
        .join(', ')}`);
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
  lines.push('', 'Return only JSON. No Markdown. No commentary.');
  return lines.join('\n');
}
