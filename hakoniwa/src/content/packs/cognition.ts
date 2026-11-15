// Cognition pack: social-class parameters (ceilings, thresholds, explanation orders),
// the explanation library, and the rule lines for reactions, rumors and appraisal
// (rows of the shared dialogueTemplates table).

import classes from '../../../data/cognition/classes.json';
import explanations from '../../../data/cognition/explanations.json';
import lines from '../../../data/cognition/lines.json';
import type { ContentMap } from '../../core/contracts';
import {
  type ClassParams,
  EVIDENCE_KINDS,
  type ExplanationDef,
} from '../../systems/cognition/types';
import type { DialogueTemplate } from '../../systems/dialogue/types';
import type { ContentPack } from '../pack';

const CATEGORIES = ['luck', 'cheat', 'gadget', 'miracle', 'monster', 'conspiracy', 'real'];

export function validateCognitionContent(content: ContentMap): string[] {
  const problems: string[] = [];
  const expl = new Set((content.cognitionExplanations ?? []).map((e) => e.id));
  for (const e of content.cognitionExplanations ?? []) {
    if (!CATEGORIES.includes(e.category))
      problems.push(`explanation ${e.id}: unknown category ${e.category}`);
    if (e.discount < 0 || e.discount > 1)
      problems.push(`explanation ${e.id}: discount out of range`);
    for (const k of e.refutedBy)
      if (!EVIDENCE_KINDS.includes(k)) problems.push(`explanation ${e.id}: unknown evidence ${k}`);
  }
  for (const c of content.cognitionClasses ?? []) {
    for (const e of c.order)
      if (!expl.has(e)) problems.push(`class ${c.id}: unknown explanation ${e}`);
    if (c.ceiling <= 0 || c.base <= 0)
      problems.push(`class ${c.id}: ceiling and base must be positive`);
  }
  for (const p of content.npcs ?? []) {
    if (!(content.cognitionClasses ?? []).some((c) => c.id === p.class))
      problems.push(`npc ${p.id}: class ${p.class} has no cognition parameters`);
  }
  return problems;
}

export const pack: ContentPack = {
  id: 'cognition',
  tables: {
    cognitionClasses: classes as unknown as ClassParams[],
    cognitionExplanations: explanations as unknown as ExplanationDef[],
    dialogueTemplates: lines as unknown as DialogueTemplate[],
  },
  schemas: [
    {
      table: 'cognitionClasses',
      label: '阶层认知参数',
      file: 'cognition/classes.json',
      idField: 'id',
      fields: [
        { key: 'id', label: '阶层', type: 'string', required: true },
        { key: 'ceiling', label: '常识上限（表观位阶）', type: 'number', min: 1, max: 99 },
        { key: 'base', label: '怀疑阈值基准', type: 'number', min: 1 },
        { key: 'order', label: '解释顺序', type: 'list' },
        { key: 'direct', label: '亲眼即信', type: 'boolean' },
        { key: 'ignoreRumor', label: '不信传闻', type: 'boolean' },
        { key: 'instrumentTrust', label: '仪器信任', type: 'number', min: 0 },
      ],
    },
    {
      table: 'cognitionExplanations',
      label: '解释库',
      file: 'cognition/explanations.json',
      idField: 'id',
      nameField: 'label',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'label', label: '名称', type: 'string' },
        { key: 'identity', label: '身份猜测', type: 'string' },
        { key: 'refutedBy', label: '被什么证据推翻', type: 'list' },
        { key: 'discount', label: '估计强度折扣', type: 'number', min: 0, max: 1 },
        { key: 'category', label: '归类', type: 'enum', options: CATEGORIES },
      ],
    },
    {
      table: 'dialogueTemplates',
      label: '认知台词（反应、传闻、鉴定）',
      file: 'cognition/lines.json',
      idField: 'id',
      fields: [
        { key: 'id', label: '键', type: 'string', required: true },
        { key: 'lines', label: '台词', type: 'list' },
      ],
    },
  ],
  validate: validateCognitionContent,
};
