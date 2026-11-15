// Render a structured rumor version as a sentence townsfolk would say. The kernel only
// stores structured fields; this is the rule voice (no model needed).

import type { ContentMap } from '../../core/contracts';
import { linesFor } from '../dialogue/templates';
import { subjectName } from './params';
import type { RumorVersion } from './types';

function first(content: ContentMap, key: string): string {
  return linesFor(content, key)[0] ?? '';
}

const COUNTED = new Set(['kill', 'elite_kill', 'boss_kill', 'rescue', 'heal']);

export function featPhrase(content: ContentMap, topic: string): string {
  return first(content, `feat.${topic}`) || first(content, 'feat') || '做了件了不得的事';
}

export function rumorText(content: ContentMap, v: RumorVersion, topic: string): string {
  const parts: string[] = [];
  if (v.story) parts.push(first(content, 'rumor.story'));
  const when = first(content, `rumor.when.${Math.min(3, v.when)}`);
  parts.push(
    `${when ? `${when}，` : ''}${subjectName(content, v.subject)}在${v.place}${featPhrase(content, topic)}`,
  );
  if (COUNTED.has(topic) && v.count >= 2) parts.push(`，足有 ${Math.round(v.count)} 只`);
  if (v.details.length > 0) parts.push(`（${v.details.join('，')}）`);
  if (v.explanation) parts.push(first(content, `rumor.expl.${v.explanation}`));
  if (v.template) parts.push(first(content, `rumor.tpl.${v.template}`));
  return `${parts.join('')}。`;
}
