// Dialogue pack: rule line templates for player conversations and NPC banter. Keys are
// dotted and fall back to shorter keys (greet.worship -> greet); persona cards may
// override any key with their own lines.

import templates from '../../../data/dialogue/templates.json';
import type { ContentMap } from '../../core/contracts';
import type { DialogueTemplate } from '../../systems/dialogue/types';
import type { ContentPack } from '../pack';

/** Keys the dialogue and NPC systems rely on. */
export const REQUIRED_KEYS = [
  'greet',
  'chat',
  'banter',
  'opinion.unaware',
  'rumor.tell',
  'rumor.none',
  'bye',
  'say',
];

export function validateDialogueContent(content: ContentMap): string[] {
  const problems: string[] = [];
  const ids = new Set((content.dialogueTemplates ?? []).map((t) => t.id));
  for (const k of REQUIRED_KEYS) if (!ids.has(k)) problems.push(`dialogue template ${k} missing`);
  for (const t of content.dialogueTemplates ?? []) {
    if (!Array.isArray(t.lines) || t.lines.length === 0)
      problems.push(`dialogue template ${t.id}: no lines`);
    for (const line of t.lines ?? [])
      if (typeof line !== 'string' || line.length > 120)
        problems.push(`dialogue template ${t.id}: bad line`);
  }
  return problems;
}

export const pack: ContentPack = {
  id: 'dialogue',
  tables: { dialogueTemplates: templates as unknown as DialogueTemplate[] },
  schemas: [
    {
      table: 'dialogueTemplates',
      label: '对话台词模板',
      file: 'dialogue/templates.json',
      idField: 'id',
      fields: [
        { key: 'id', label: '键', type: 'string', required: true },
        { key: 'lines', label: '台词', type: 'list' },
      ],
    },
  ],
  validate: validateDialogueContent,
};
