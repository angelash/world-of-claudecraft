// Goddess pack: persona cards, the divine action menu, the Maker's scripted
// revelations, Merca's intel stock, and the director's coincidence and respite menu.

import actions from '../../../data/goddess/actions.json';
import directorMenu from '../../../data/goddess/director_menu.json';
import goddesses from '../../../data/goddess/goddesses.json';
import maker from '../../../data/goddess/maker.json';
import mercaIntel from '../../../data/goddess/merca_intel.json';
import revelations from '../../../data/goddess/revelations.json';
import type { DirectorItemDef } from '../../systems/director';
import type { MercaIntelDef } from '../../systems/goddess';
import type {
  DivineActionDef,
  GoddessDef,
  MakerDef,
  RevelationDef,
} from '../../systems/goddess/types';
import type { ContentPack } from '../pack';
import { conditionProblems } from './quests';

export const pack: ContentPack = {
  id: 'goddess',
  tables: {
    goddesses: goddesses as unknown as GoddessDef[],
    divineActions: actions as unknown as DivineActionDef[],
    revelations: revelations as unknown as RevelationDef[],
    mercaIntel: mercaIntel as MercaIntelDef[],
    directorMenu: directorMenu as unknown as DirectorItemDef[],
    maker: maker as unknown as MakerDef[],
  },
  schemas: [
    {
      table: 'goddesses',
      label: '女神人格卡',
      file: 'goddess/goddesses.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名', type: 'string', required: true },
        { key: 'fullName', label: '全名', type: 'string' },
        { key: 'title', label: '名号', type: 'string' },
        { key: 'honorific', label: '尊名', type: 'string' },
        { key: 'hiddenName', label: '未正名前的称呼', type: 'string' },
        { key: 'revealWhen', label: '正名条件', type: 'string' },
        { key: 'voice', label: '口吻规则', type: 'list' },
        { key: 'mustKeep', label: '必须保持', type: 'list' },
        { key: 'never', label: '绝不会做', type: 'list' },
        { key: 'publicGoal', label: '公开目标', type: 'text' },
        { key: 'privateGoals', label: '私密目标（带解锁条件）', type: 'json' },
        { key: 'knowledgeByAct', label: '各幕知识范围', type: 'json' },
        { key: 'anchors', label: '锚点台词', type: 'list' },
        { key: 'menu', label: '神权菜单', type: 'list' },
        { key: 'power', label: '神力（开局与日净收入）', type: 'json' },
        { key: 'weights', label: '规划权重', type: 'json' },
        { key: 'gazeCap', label: '各幕注视度上限', type: 'json' },
        { key: 'faithTags', label: '信徒标签', type: 'list' },
        { key: 'faith', label: '信仰份额（地图）', type: 'json' },
        { key: 'activeFromAct', label: '起始幕', type: 'number', min: 0, max: 7 },
        {
          key: 'breachTendency',
          label: '越约倾向',
          type: 'enum',
          options: ['none', 'low', 'mid', 'high'],
        },
        { key: 'replies', label: '写定回应', type: 'json' },
      ],
    },
    {
      table: 'divineActions',
      label: '神权动作',
      file: 'goddess/actions.json',
      idField: 'id',
      nameField: 'label',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'label', label: '名称', type: 'string' },
        { key: 'power', label: '神力', type: 'number', min: 0 },
        { key: 'cooldownHours', label: '冷却（游戏小时）', type: 'number', min: 0 },
        { key: 'sedimentRate', label: '澱率', type: 'number', min: 0, max: 1 },
        { key: 'minAct', label: '最早幕次', type: 'number', min: 0, max: 7 },
        { key: 'visibility', label: '可见性', type: 'enum', options: ['public', 'hidden'] },
        { key: 'breachable', label: '可越约', type: 'boolean' },
        { key: 'hostile', label: '计入敌对预算', type: 'boolean' },
        { key: 'modifiers', label: '修正项', type: 'json' },
        { key: 'weather', label: '天气', type: 'string' },
        { key: 'params', label: '参数说明（给模型）', type: 'text' },
        { key: 'lines', label: '写定文本（按女神）', type: 'json' },
      ],
    },
    {
      table: 'revelations',
      label: '天启',
      file: 'goddess/revelations.json',
      idField: 'id',
      nameField: 'text',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'text', label: '古庭语原文', type: 'string' },
        { key: 'literal', label: '学者直译', type: 'string' },
        { key: 'flags', label: '写入旗标', type: 'json' },
        { key: 'modifiers', label: '规则变更', type: 'json' },
        { key: 'responses', label: '女神的第一反应', type: 'json' },
      ],
    },
    {
      table: 'maker',
      label: '造主',
      file: 'goddess/maker.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名', type: 'string' },
        { key: 'aliases', label: '称呼', type: 'list' },
        { key: 'presence', label: '在场方式', type: 'text' },
        { key: 'charter', label: '原始规约', type: 'text' },
        { key: 'revelationRules', label: '天启规则', type: 'list' },
        { key: 'never', label: '绝不会', type: 'list' },
        { key: 'room', label: '房间', type: 'text' },
      ],
    },
    {
      table: 'mercaIntel',
      label: '梅尔卡的情报',
      file: 'goddess/merca_intel.json',
      idField: 'id',
      nameField: 'text',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'when', label: '条件', type: 'string' },
        { key: 'text', label: '内容', type: 'text' },
      ],
    },
    {
      table: 'directorMenu',
      label: '巧合与喘息菜单',
      file: 'goddess/director_menu.json',
      idField: 'id',
      nameField: 'label',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'kind', label: '类别', type: 'enum', options: ['coincidence', 'respite'] },
        { key: 'label', label: '名称', type: 'string' },
        { key: 'requires', label: '前置条件', type: 'string' },
        { key: 'maps', label: '地图', type: 'list' },
        { key: 'monsterFactor', label: '魔物压力系数', type: 'number', min: 0 },
        { key: 'hours', label: '持续（游戏小时）', type: 'number', min: 1 },
        { key: 'weather', label: '天气', type: 'string' },
        { key: 'narration', label: '旁白', type: 'text' },
        { key: 'flag', label: '旗标', type: 'json' },
        { key: 'cooldownHours', label: '冷却', type: 'number', min: 0 },
        { key: 'power', label: '神力', type: 'number', min: 1, max: 5 },
        { key: 'weight', label: '权重', type: 'number' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const actionIds = new Set(content.divineActions.map((a) => a.id));
    for (const g of content.goddesses) {
      for (const a of g.menu)
        if (!actionIds.has(a)) problems.push(`goddess ${g.id}: unknown action ${a}`);
      problems.push(...conditionProblems(g.revealWhen, `goddess ${g.id} revealWhen`));
      for (const p of g.privateGoals)
        problems.push(...conditionProblems(p.when, `goddess ${g.id} privateGoal`));
      if (!g.honorific.includes(g.fullName))
        problems.push(`goddess ${g.id}: honorific must contain the full name`);
    }
    for (const i of content.mercaIntel)
      problems.push(...conditionProblems(i.when, `mercaIntel ${i.id}`));
    for (const d of content.directorMenu) {
      problems.push(...conditionProblems(d.requires, `director ${d.id}`));
      if (d.power < 1 || d.power > 5)
        problems.push(`director ${d.id}: power must be 1 to 5 (D-035)`);
    }
    return problems;
  },
};
