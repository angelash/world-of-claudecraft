// Quests pack: quests, acts, the reveal-ledger lore and name table, and the story and
// evidence items. Also the shared effect and condition validators the narrative packs
// reuse (scenes, goddess, director).

import acts from '../../../data/quests/acts.json';
import items from '../../../data/quests/items.json';
import lore from '../../../data/quests/lore.json';
import quests from '../../../data/quests/quests.json';
import terms from '../../../data/quests/terms.json';
import type { ContentMap } from '../../core/contracts';
import type { LoreDef, TermDef } from '../../systems/goddess/types';
import type { ItemDef } from '../../systems/inventory';
import { checkCondition } from '../../systems/quests/conditions';
import { EFFECT_TYPES, type Effect, UI_EFFECT_IDS } from '../../systems/quests/effect_types';
import {
  type ActDef,
  QUEST_KINDS,
  type QuestDef,
  type WeekWindow,
} from '../../systems/quests/types';
import type { ContentPack } from '../pack';
import { ITEM_FIELDS } from './inventory';
import { keyEffectProblems, questModelProblems } from './quests_model';

const COMPUTE_FNS = new Set([
  'prologue_door_hints',
  'court_verdicts',
  'janu_release',
  'ending',
  'act5_outcome',
  'review_score',
  'tide_attribution',
]);

/** Problems in one condition expression (empty when fine). */
export function conditionProblems(expr: string | undefined, where: string): string[] {
  if (expr === undefined || expr === '') return [];
  const err = checkCondition(expr);
  return err ? [`${where}: ${err}`] : [];
}

/** Problems in an effect list: known types, parsable conditions, existing references. */
export function effectProblems(
  effects: Effect[] | undefined,
  where: string,
  content: ContentMap,
): string[] {
  const out: string[] = [];
  for (const [i, e] of (effects ?? []).entries()) {
    const at = `${where} effect ${i}`;
    if (!EFFECT_TYPES.includes(e.type)) {
      out.push(`${at}: unknown effect type ${String((e as { type?: unknown }).type)}`);
      continue;
    }
    out.push(...conditionProblems(e.when, at));
    switch (e.type) {
      case 'quest':
        if (!content.quests?.some((q) => q.id === e.quest))
          out.push(`${at}: unknown quest ${e.quest}`);
        break;
      case 'scene':
        if (!content.scenes?.some((s) => s.id === e.scene))
          out.push(`${at}: unknown scene ${e.scene}`);
        break;
      case 'item':
      case 'take':
        if (!content.items?.some((it) => it.id === e.item))
          out.push(`${at}: unknown item ${e.item}`);
        break;
      case 'act':
        if (!content.acts?.some((a) => a.id === e.act)) out.push(`${at}: unknown act ${e.act}`);
        break;
      case 'teleport':
        if (content.maps && !content.maps.some((m) => m.id === e.mapId))
          out.push(`${at}: unknown map ${e.mapId}`);
        break;
      case 'revelation':
        if (!content.revelations?.some((r) => r.id === e.id))
          out.push(`${at}: unknown revelation ${e.id}`);
        break;
      case 'compute':
        if (!COMPUTE_FNS.has(e.fn)) out.push(`${at}: unknown compute ${e.fn}`);
        break;
      case 'key':
        out.push(...keyEffectProblems(e, at, content));
        break;
      case 'ui':
        if (!(UI_EFFECT_IDS as readonly string[]).includes(e.ui))
          out.push(`${at}: unknown interface ${e.ui}`);
        break;
      default:
        break;
    }
  }
  return out;
}

/** Problems in a week window: whole weeks from 1, `from` not after `to`. */
export function windowProblems(w: WeekWindow | undefined, where: string): string[] {
  if (!w) return [];
  const out: string[] = [];
  for (const k of ['from', 'to'] as const) {
    const v = w[k];
    if (v !== undefined && !(Number.isInteger(v) && v >= 1)) out.push(`${where}: bad ${k} ${v}`);
  }
  if (w.from !== undefined && w.to !== undefined && w.from > w.to)
    out.push(`${where}: from ${w.from} after to ${w.to}`);
  return out;
}

/** Problems in an act's clock (act_clock.ts): weekly effects, beats and night rules. */
export function clockProblems(act: ActDef, content: ContentMap): string[] {
  const c = act.clock;
  if (!c) return [];
  const at = `act ${act.id} clock`;
  const out: string[] = [];
  if (c.weeks !== undefined && !(Number.isInteger(c.weeks) && c.weeks >= 1))
    out.push(`${at}: bad weeks ${c.weeks}`);
  out.push(...effectProblems(c.weekly, `${at} weekly`, content));
  for (const b of c.beats ?? []) {
    if (!Number.isInteger(b.from) || !Number.isInteger(b.to))
      out.push(`${at} beat ${b.id}: from and to must be whole weeks`);
    out.push(...windowProblems(b, `${at} beat ${b.id}`));
  }
  const ids = new Set<string>();
  for (const r of c.nights ?? []) {
    const rat = `${at} night ${r.id}`;
    if (ids.has(r.id)) out.push(`${rat}: duplicate id`);
    ids.add(r.id);
    if (r.night !== 'dark_moon' && r.night !== 'any') out.push(`${rat}: bad night ${r.night}`);
    if (!Number.isInteger(r.from) || !Number.isInteger(r.to))
      out.push(`${rat}: from and to must be whole weeks`);
    out.push(...windowProblems(r, rat));
    if (c.weeks !== undefined && r.to > c.weeks)
      out.push(`${rat}: to ${r.to} past the act's ${c.weeks} weeks`);
    out.push(...conditionProblems(r.when, `${rat} when`));
    out.push(...conditionProblems(r.unless, `${rat} unless`));
    out.push(...effectProblems(r.effects, rat, content));
  }
  return out;
}

export const pack: ContentPack = {
  id: 'quests',
  tables: {
    quests: quests as unknown as QuestDef[],
    acts: acts as unknown as ActDef[],
    lore: lore as unknown as LoreDef[],
    terms: terms as TermDef[],
    items: items as unknown as ItemDef[],
  },
  schemas: [
    {
      table: 'quests',
      label: '任务',
      file: 'quests/quests.json',
      idField: 'id',
      nameField: 'title',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'act', label: '幕', type: 'ref', refTable: 'acts', required: true },
        { key: 'kind', label: '种类', type: 'enum', options: [...QUEST_KINDS] },
        { key: 'title', label: '标题', type: 'string', required: true },
        {
          key: 'giver',
          label: '发布者（NPC ID）',
          type: 'string',
          help: '留空表示条件满足时自动开始',
        },
        { key: 'turnIn', label: '交付者（NPC ID）', type: 'string' },
        { key: 'desc', label: '描述', type: 'text' },
        {
          key: 'trigger',
          label: '触发条件',
          type: 'string',
          help: '揭示台账语法：AND、OR、NOT、比较',
        },
        { key: 'stages', label: '阶段与目标', type: 'json' },
        { key: 'onStart', label: '开始时效果', type: 'json' },
        { key: 'rewards', label: '完成效果与奖励', type: 'json' },
        { key: 'order', label: '排序', type: 'number' },
        {
          key: 'weekWindow',
          label: '周窗',
          type: 'json',
          help: '{ from, to }：本幕第几周起、到第几周可接',
        },
      ],
    },
    {
      table: 'acts',
      label: '幕次',
      file: 'quests/acts.json',
      idField: 'id',
      nameField: 'title',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'index', label: '序号', type: 'number', min: 0, max: 7 },
        { key: 'title', label: '标题', type: 'string' },
        { key: 'entry', label: '入口', type: 'json' },
        { key: 'introScene', label: '开场场景', type: 'ref', refTable: 'scenes' },
        { key: 'onEnter', label: '进入时效果', type: 'json' },
        {
          key: 'clock',
          label: '幕时钟',
          type: 'json',
          help: 'weeks 周数；weekly 每周效果；beats 节拍；nights 夜规则（暗月夜、周窗、钳制）',
        },
      ],
    },
    {
      table: 'lore',
      label: '揭示台账条目',
      file: 'quests/lore.json',
      idField: 'id',
      nameField: 'text',
      fields: [
        { key: 'id', label: '编号', type: 'string', required: true },
        { key: 'mystery', label: '谜团', type: 'string' },
        { key: 'text', label: '内容', type: 'text' },
        {
          key: 'tier',
          label: '知识层级',
          type: 'enum',
          options: ['K0', 'K1', 'K2', 'K3', 'K4', 'K5', 'P'],
        },
        { key: 'knowers', label: '知情者', type: 'list' },
        { key: 'unlock', label: '解锁条件', type: 'string' },
        { key: 'keywords', label: '泄露关键词', type: 'list' },
      ],
    },
    {
      table: 'terms',
      label: '称谓开放表',
      file: 'quests/terms.json',
      idField: 'term',
      fields: [
        { key: 'term', label: '称谓', type: 'string', required: true },
        { key: 'unlock', label: '解锁条件', type: 'string' },
        { key: 'replacement', label: '解锁前替换为', type: 'string' },
      ],
    },
    {
      table: 'items',
      label: '剧情物品与证据',
      file: 'quests/items.json',
      idField: 'id',
      nameField: 'name',
      fields: ITEM_FIELDS,
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const actIds = new Set(content.acts.map((a) => a.id));
    for (const a of content.acts) {
      problems.push(...effectProblems(a.onEnter, `act ${a.id}`, content));
      if (a.introScene && content.scenes && !content.scenes.some((s) => s.id === a.introScene)) {
        problems.push(`act ${a.id}: unknown intro scene ${a.introScene}`);
      }
      problems.push(...clockProblems(a, content));
    }
    for (const q of content.quests) {
      const at = `quest ${q.id}`;
      if (!actIds.has(q.act)) problems.push(`${at}: unknown act ${q.act}`);
      if (q.stages.length === 0) problems.push(`${at}: no stages`);
      problems.push(...windowProblems(q.weekWindow, `${at} weekWindow`));
      problems.push(
        ...questModelProblems(q, content, (list, where) => effectProblems(list, where, content)),
      );
      problems.push(...conditionProblems(q.trigger, `${at} trigger`));
      problems.push(...effectProblems(q.onStart, `${at} onStart`, content));
      problems.push(...effectProblems(q.rewards, `${at} rewards`, content));
      for (const st of q.stages) {
        problems.push(...effectProblems(st.onEnter, `${at} stage ${st.id} onEnter`, content));
        problems.push(...effectProblems(st.onComplete, `${at} stage ${st.id} onComplete`, content));
        for (const o of st.objectives) {
          problems.push(...conditionProblems(o.orWhen, `${at} stage ${st.id} orWhen`));
          if (o.type === 'flag')
            problems.push(...conditionProblems(o.when, `${at} stage ${st.id} flag`));
          if (
            o.type === 'scene' &&
            content.scenes &&
            !content.scenes.some((s) => s.id === o.scene)
          ) {
            problems.push(`${at}: unknown scene objective ${o.scene}`);
          }
          if (o.type === 'collect' && !content.items.some((it) => it.id === o.item)) {
            problems.push(`${at}: unknown item ${o.item}`);
          }
          if (o.type === 'reach' && content.maps && !content.maps.some((m) => m.id === o.mapId)) {
            problems.push(`${at}: unknown map ${o.mapId}`);
          }
          if (o.type === 'choice') {
            for (const opt of o.options)
              problems.push(...effectProblems(opt.effects, `${at} choice ${opt.id}`, content));
          }
          if (o.type === 'battle')
            problems.push(...effectProblems(o.onLose, `${at} battle onLose`, content));
        }
      }
    }
    for (const l of content.lore) problems.push(...conditionProblems(l.unlock, `lore ${l.id}`));
    for (const t of content.terms) problems.push(...conditionProblems(t.unlock, `term ${t.term}`));
    return problems;
  },
};
