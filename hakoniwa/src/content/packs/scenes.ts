// Scenes pack: the divine court map (prologue and act 6), every written scene (the
// prologue, act transitions, the court, the endings), speakers, act 6 evidence and
// defenses, and the epilogue templates. Validates scene graphs and references.

import act1 from '../../../data/scenes/act1.json';
import act2to5 from '../../../data/scenes/acts2_5.json';
import court from '../../../data/scenes/court.json';
import defenses from '../../../data/scenes/defenses.json';
import endings from '../../../data/scenes/endings.json';
import epilogue from '../../../data/scenes/epilogue.json';
import evidence from '../../../data/scenes/evidence.json';
import maps from '../../../data/scenes/maps.json';
import prologue from '../../../data/scenes/prologue.json';
import speakers from '../../../data/scenes/speakers.json';
import type { ContentMap } from '../../core/contracts';
import type {
  CourtDefenseDef,
  EpilogueEntry,
  EvidenceDef,
  SceneDef,
  SpeakerDef,
} from '../../systems/scenes/types';
import type { WorldStart } from '../../systems/world';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack } from '../pack';
import { conditionProblems, effectProblems } from './quests';

/** The new game starts in the antechamber of the divine court (conventions 2). */
const worldStarts: WorldStart[] = [{ mapId: 'divine_court', x: 6.5, y: 9.5, priority: 10 }];

export function sceneProblems(scene: SceneDef, content: ContentMap): string[] {
  const out: string[] = [];
  const ids = new Set<string>();
  for (const n of scene.nodes) {
    if (ids.has(n.id)) out.push(`scene ${scene.id}: duplicate node ${n.id}`);
    ids.add(n.id);
  }
  const has = (id: string | undefined) => id === undefined || id === '' || ids.has(id);
  if (!ids.has(scene.start)) out.push(`scene ${scene.id}: unknown start ${scene.start}`);
  if (scene.then && !content.scenes.some((s) => s.id === scene.then))
    out.push(`scene ${scene.id}: unknown then ${scene.then}`);
  out.push(...effectProblems(scene.onEnd, `scene ${scene.id} onEnd`, content));
  for (const n of scene.nodes) {
    const at = `scene ${scene.id} node ${n.id}`;
    if (!has(n.next)) out.push(`${at}: unknown next ${n.next}`);
    out.push(...effectProblems(n.effects, at, content));
    for (const l of n.lines ?? []) out.push(...conditionProblems(l.when, `${at} line`));
    for (const b of n.branch ?? []) {
      out.push(...conditionProblems(b.when, `${at} branch`));
      if (!ids.has(b.to)) out.push(`${at}: unknown branch target ${b.to}`);
    }
    for (const c of n.choices ?? []) {
      out.push(...conditionProblems(c.when, `${at} choice ${c.id}`));
      out.push(...effectProblems(c.effects, `${at} choice ${c.id}`, content));
      if (!has(c.to)) out.push(`${at}: choice ${c.id} -> unknown ${c.to}`);
    }
    if (n.input) {
      if (!ids.has(n.input.to)) out.push(`${at}: input -> unknown ${n.input.to}`);
      const cl = n.input.classify;
      if (cl) {
        const target = scene.nodes.find((x) => x.id === cl.node);
        if (!target) out.push(`${at}: classify -> unknown node ${cl.node}`);
        for (const c of [...cl.choices, cl.fallback]) {
          if (target && !(target.choices ?? []).some((x) => x.id === c))
            out.push(`${at}: classify choice ${c} missing`);
        }
      }
    }
    if (n.court) {
      if (!ids.has(n.court.to)) out.push(`${at}: court -> unknown ${n.court.to}`);
      if (!content.courtDefenses.some((d) => d.goddess === n.court?.goddess)) {
        out.push(`${at}: no defenses for ${n.court.goddess}`);
      }
    }
  }
  return out;
}

export const pack: ContentPack = {
  id: 'scenes',
  tables: {
    maps: maps as unknown as MapDef[],
    worldStarts,
    scenes: [...prologue, ...act1, ...act2to5, ...court, ...endings] as unknown as SceneDef[],
    sceneSpeakers: speakers as unknown as SpeakerDef[],
    evidence: evidence as unknown as EvidenceDef[],
    courtDefenses: defenses as unknown as CourtDefenseDef[],
    epilogue: epilogue as unknown as EpilogueEntry[],
  },
  schemas: [
    {
      table: 'scenes',
      label: '场景',
      file: 'scenes/act1.json',
      idField: 'id',
      nameField: 'title',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'title', label: '标题', type: 'string' },
        { key: 'act', label: '幕', type: 'string' },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'location', label: '地点', type: 'string' },
        { key: 'start', label: '起始节点', type: 'string' },
        { key: 'nodes', label: '节点', type: 'json' },
        { key: 'onEnd', label: '结束时效果', type: 'json' },
        { key: 'then', label: '接着播放', type: 'ref', refTable: 'scenes' },
      ],
    },
    {
      table: 'sceneSpeakers',
      label: '说话者',
      file: 'scenes/speakers.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '显示名', type: 'string' },
        {
          key: 'kind',
          label: '默认类型',
          type: 'enum',
          options: ['say', 'think', 'narrate', 'divine'],
        },
        { key: 'revealedName', label: '正名后', type: 'string' },
        { key: 'revealWhen', label: '正名条件', type: 'string' },
      ],
    },
    {
      table: 'evidence',
      label: '第六幕证据',
      file: 'scenes/evidence.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: '编号', type: 'string', required: true },
        { key: 'item', label: '物品', type: 'ref', refTable: 'items' },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'targets', label: '对象、防线与强度', type: 'json' },
        { key: 'presentText', label: '出示时的说明', type: 'text' },
      ],
    },
    {
      table: 'courtDefenses',
      label: '女神的防线',
      file: 'scenes/defenses.json',
      idField: 'goddess',
      fields: [
        { key: 'goddess', label: '女神', type: 'ref', refTable: 'goddesses' },
        { key: 'thickness', label: '厚度', type: 'json' },
        { key: 'broken', label: '击破时的台词', type: 'json' },
        { key: 'deflect', label: '未命中时', type: 'text' },
        { key: 'verdictLines', label: '终审台词', type: 'json' },
        { key: 'askBack', label: '回问', type: 'json' },
      ],
    },
    {
      table: 'epilogue',
      label: '后日谈模板',
      file: 'scenes/epilogue.json',
      idField: 'id',
      nameField: 'subject',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        {
          key: 'layer',
          label: '层',
          type: 'enum',
          options: ['gods', 'races', 'nations', 'kingdom', 'city', 'town', 'companions', 'player'],
        },
        { key: 'subject', label: '题', type: 'string' },
        { key: 'endings', label: '结局', type: 'list' },
        { key: 'when', label: '条件', type: 'string' },
        { key: 'year', label: '时（年）', type: 'number', min: 0, max: 100 },
        { key: 'text', label: '录', type: 'text' },
        { key: 'required', label: '必写', type: 'boolean' },
        { key: 'weight', label: '显著度', type: 'number' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    for (const s of content.scenes) problems.push(...sceneProblems(s, content));
    for (const e of content.evidence) {
      if (!content.items.some((i) => i.id === e.item))
        problems.push(`evidence ${e.id}: unknown item ${e.item}`);
    }
    for (const e of content.epilogue)
      problems.push(...conditionProblems(e.when, `epilogue ${e.id}`));
    for (const s of content.sceneSpeakers)
      problems.push(...conditionProblems(s.revealWhen, `speaker ${s.id}`));
    return problems;
  },
};
