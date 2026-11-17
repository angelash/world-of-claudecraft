// Render a structured rumor version as a sentence townsfolk would say. The kernel only
// stores structured fields; this is the rule voice (no model needed).

import type { ContentMap } from '../../core/contracts';
import { joinText, type TextParam, tr } from '../../core/text';
import { firstLine } from '../dialogue/templates';
import { subjectName } from './params';
import type { RumorVersion } from './types';

function first(content: ContentMap, key: string): TextParam {
  return firstLine(content, key);
}

const COUNTED = new Set(['kill', 'elite_kill', 'boss_kill', 'rescue', 'heal']);

export function featPhrase(content: ContentMap, topic: string): TextParam {
  return (
    first(content, `feat.${topic}`) ||
    first(content, 'feat') ||
    tr('sys.cognition.rumor.feat_default')
  );
}

/** The topic of a door hint told as a rumor. */
export const HINT_TOPIC = 'door_hint';

export function rumorText(content: ContentMap, v: RumorVersion, topic: string): TextParam {
  // a door hint told as a rumor (thousand_doors.md 18.3): its own text, where it was heard
  if (topic === HINT_TOPIC)
    return tr('sys.cognition.rumor.hint', { text: v.details[0] ?? '', place: v.place });
  const parts: TextParam[] = [];
  if (v.story) parts.push(first(content, 'rumor.story'));
  const when = first(content, `rumor.when.${Math.min(3, v.when)}`);
  parts.push(
    tr('sys.cognition.rumor.core', {
      when: when ? tr('sys.cognition.rumor.when', { when }) : '',
      who: subjectName(content, v.subject),
      place: v.place,
      feat: featPhrase(content, topic),
    }),
  );
  if (COUNTED.has(topic) && v.count >= 2)
    parts.push(tr('sys.cognition.rumor.count', { n: Math.round(v.count) }));
  if (v.details.length > 0)
    parts.push(tr('sys.cognition.rumor.details', { details: joinText('comma', v.details) }));
  if (v.explanation) parts.push(first(content, `rumor.expl.${v.explanation}`));
  if (v.template) parts.push(first(content, `rumor.tpl.${v.template}`));
  return tr('sys.cognition.rumor.sentence', { text: joinText('none', parts) });
}
