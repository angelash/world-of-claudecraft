// Cognition pack: social-class parameters (ceilings, thresholds, explanation orders) and
// the explanation library. Its rule lines (reactions, rumors, appraisal) live in the line
// packs now (ln_common, data/dialogue/lines/; PK-M0-25).

import classes from '../../../data/cognition/classes.json';
import explanations from '../../../data/cognition/explanations.json';
import sources from '../../../data/cognition/sources.json';
import type { ContentMap } from '../../core/contracts';
import { defaultRegistry } from '../../core/registry';
import type { CognitionSources } from '../../systems/cognition/sources';
import {
  type ClassParams,
  EVIDENCE_KINDS,
  type ExplanationDef,
} from '../../systems/cognition/types';
import { IDENTITY_KINDS } from '../../systems/npc/brain/reactions';
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
  // evidence and exposure sources (PK-M1-19)
  const src = content.cognitionSources;
  if (!src) problems.push('cognitionSources table missing');
  else {
    for (const r of src.authority.ranks)
      if (!(r.weight >= 2 && r.weight <= src.authority.max))
        problems.push(`authority rank weight ${r.weight} is outside 2 to ${src.authority.max}`);
    for (const f of src.exposure.flags) {
      if (!defaultRegistry().resolve(f.flag))
        problems.push(`exposure flag ${f.flag} is not a registered variable`);
      if (!(IDENTITY_KINDS as readonly string[]).includes(f.kind))
        problems.push(`exposure flag ${f.flag}: unknown kind ${f.kind}`);
    }
  }
  return problems;
}

export const pack: ContentPack = {
  id: 'cognition',
  tables: {
    cognitionClasses: classes as unknown as ClassParams[],
    cognitionExplanations: explanations as unknown as ExplanationDef[],
    cognitionSources: sources as unknown as CognitionSources,
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
  ],
  validate: validateCognitionContent,
};
