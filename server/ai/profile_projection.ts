import type { AiProfileSnapshot } from './ai_types';

export function profileDirectorProjectionTags(profile: AiProfileSnapshot | undefined): string[] {
  if (!profile) return [];
  const text = [
    profile.profileId,
    profile.persona,
    ...profile.knowledgeScope,
    ...profile.tabooTopics,
    profile.socialMemory?.style ?? '',
  ].join(' ').toLowerCase();
  const tags: string[] = [];
  if (/(priest|chapel|grave|dead|omen|rite|undead|absolution)/.test(text)) tags.push('profileProjection:riteOmen');
  if (/(merchant|market|coin|price|trade|supply|provisioner|inventory)/.test(text)) tags.push('profileProjection:tradeWeather');
  if (/(marshal|captain|warden|patrol|watch|military|guard|defense)/.test(text)) tags.push('profileProjection:patrolRisk');
  if (/(herb|apothecary|venom|poultice|sickness|plant|remedy)/.test(text)) tags.push('profileProjection:symptomReading');
  if (/(fisher|lake|water|murloc|tide|dock|shore|ripples)/.test(text)) tags.push('profileProjection:waterOmen');
  if (/(forge|armorer|smith|blade|armor|steel|anvil)/.test(text)) tags.push('profileProjection:forgeJudgment');
  if (/(ranger|scout|forest|trail|tracks|warden)/.test(text)) tags.push('profileProjection:trailSign');
  if (/(loremaster|scholar|ancient|artifact|records|theories)/.test(text)) tags.push('profileProjection:archiveTheory');
  return tags.length > 0 ? unique(tags).slice(0, 3) : ['profileProjection:localWitness'];
}

function unique<T>(values: Iterable<T>): T[] {
  return [...new Set(values)];
}
