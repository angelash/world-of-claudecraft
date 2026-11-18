// Goddess pack: persona cards, the divine action menu, the Maker's scripted
// revelations, Merca's intel stock, the director's coincidence and respite menu, its rule
// table and its deliveries, and the goddess brain's tables (personas, constants, schemes,
// reactions), the scripted divine acts and the offering rules (PK-M1-20).

import actions from '../../../data/goddess/actions.json';
import beats from '../../../data/goddess/beats.json';
import brainConfig from '../../../data/goddess/brain/config.json';
import personas from '../../../data/goddess/brain/personas.json';
import reactions from '../../../data/goddess/brain/reactions.json';
import schemes from '../../../data/goddess/brain/schemes.json';
import directorActs from '../../../data/goddess/director_acts.json';
import directorDeliveries from '../../../data/goddess/director_deliveries.json';
import directorMenu from '../../../data/goddess/director_menu.json';
import directorRules from '../../../data/goddess/director_rules.json';
import goddesses from '../../../data/goddess/goddesses.json';
import maker from '../../../data/goddess/maker.json';
import mercaIntel from '../../../data/goddess/merca_intel.json';
import offerings from '../../../data/goddess/offerings.json';
import revelations from '../../../data/goddess/revelations.json';
import {
  type DirectorActDef,
  type DirectorDeliveryDef,
  type DirectorItemDef,
  type DirectorRuleRow,
  directorProblems,
} from '../../systems/director';
import type { MercaIntelDef } from '../../systems/goddess';
import { beatProblems, type DivineBeatDef } from '../../systems/goddess/beats';
import {
  type GoddessBrainConfig,
  type GoddessPersona,
  personaProblems,
} from '../../systems/goddess/brain/persona';
import { type ReactRow, reactionProblems } from '../../systems/goddess/brain/reactions';
import { type SchemeDef, schemeProblems } from '../../systems/goddess/brain/schemes';
import type { OfferingRules } from '../../systems/goddess/offerings';
import { rosterProblems } from '../../systems/goddess/roster';
import {
  ACTION_EXECS,
  ACTION_NEEDS,
  ACTION_SEEN,
  ACTION_TAGS,
  type DivineActionDef,
  type GoddessDef,
  KPI_SCALES,
  type MakerDef,
  type RevelationDef,
} from '../../systems/goddess/types';
import { isModifierTarget } from '../../systems/modifiers';
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
    directorRules: (directorRules as unknown as { rows: DirectorRuleRow[] }).rows,
    directorDeliveries: directorDeliveries as unknown as DirectorDeliveryDef[],
    directorActs: directorActs as unknown as DirectorActDef[],
    maker: maker as unknown as MakerDef[],
    goddessPersonas: personas as unknown as GoddessPersona[],
    goddessBrain: [brainConfig as unknown as GoddessBrainConfig],
    goddessSchemes: schemes as unknown as SchemeDef[],
    goddessReactions: (reactions as unknown as { rows: ReactRow[] }).rows,
    divineBeats: beats as unknown as DivineBeatDef[],
    offeringRules: [offerings as unknown as OfferingRules],
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
        { key: 'courtSeat', label: '神庭席位与审庭行为（无则不列席）', type: 'json' },
        {
          key: 'reach',
          label: '触及方式',
          type: 'enum',
          options: ['faith', 'player'],
          help: 'faith：经信徒的信仰；player：跟着那个人（不看信仰份额）',
        },
        { key: 'actsWhen', label: '能出手的条件', type: 'string' },
        { key: 'appearsWhen', label: '现身于女神窗与规划的条件', type: 'string' },
        { key: 'token', label: '信物（加护与供奉）', type: 'ref', refTable: 'items' },
        {
          key: 'roles',
          label: '剧情职能',
          type: 'list',
          help: 'fate_director：导演的巧合与喘息；offering：经信物收供品；每种全作唯一',
        },
        { key: 'gazeFlag', label: '注视度别名旗标', type: 'string' },
        { key: 'record', label: '后日谈执笔（语气与结局）', type: 'json' },
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
        { key: 'tags', label: '亲和标签', type: 'list' },
        { key: 'kpi', label: '预期计分贡献（按计分项）', type: 'json' },
        { key: 'scale', label: '计分贡献的地图尺度', type: 'enum', options: [...KPI_SCALES] },
        { key: 'playerRel', label: '与玩家的相关度', type: 'number', min: 0, max: 1 },
        { key: 'needs', label: '门槛', type: 'list' },
        { key: 'exec', label: '执行方式（新动作）', type: 'enum', options: [...ACTION_EXECS] },
        { key: 'seen', label: '玩家能否察觉', type: 'enum', options: [...ACTION_SEEN] },
        { key: 'slot', label: '台词槽', type: 'string' },
        { key: 'tag', label: '定性通道的词', type: 'string' },
      ],
    },
    {
      table: 'goddessPersonas',
      label: '女神人格权重表',
      file: 'goddess/brain/personas.json',
      idField: 'id',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'kpi', label: '计分权重', type: 'json' },
        { key: 'traits', label: '人格维度', type: 'json' },
        { key: 'interest', label: '各幕对玩家的兴趣', type: 'json' },
        { key: 'weights', label: '动作权重 W', type: 'json' },
        { key: 'multipliers', label: '人格乘数（按标签）', type: 'json' },
        { key: 'dawn', label: '参加黎明规划', type: 'boolean' },
        { key: 'night', label: '入夜轮', type: 'json' },
        { key: 'acts', label: '各幕计划表', type: 'json' },
      ],
    },
    {
      table: 'goddessSchemes',
      label: '女神谋划',
      file: 'goddess/brain/schemes.json',
      idField: 'id',
      nameField: 'title',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'goddess', label: '女神', type: 'ref', refTable: 'goddesses' },
        { key: 'title', label: '名称', type: 'string' },
        { key: 'when', label: '前置', type: 'string' },
        { key: 'unless', label: '中止条件', type: 'string' },
        { key: 'replanDays', label: '重规划间隔（日）', type: 'number', min: 1 },
        { key: 'value', label: '根目标的计分估计', type: 'json' },
        { key: 'tags', label: '亲和标签', type: 'list' },
        { key: 'bind', label: '绑定', type: 'json' },
        { key: 'methods', label: '方法与步骤', type: 'json' },
      ],
    },
    {
      table: 'divineBeats',
      label: '写定神行节点',
      file: 'goddess/beats.json',
      idField: 'id',
      nameField: 'code',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'code', label: '编号', type: 'string' },
        { key: 'goddess', label: '女神', type: 'string' },
        { key: 'act', label: '幕', type: 'string' },
        { key: 'must', label: '必达', type: 'boolean' },
        { key: 'open', label: '触发与窗口', type: 'json' },
        { key: 'when', label: '附加条件', type: 'string' },
        { key: 'unless', label: '提前关闭', type: 'string' },
        {
          key: 'kind',
          label: '类别',
          type: 'enum',
          options: ['observe', 'archive', 'manifest', 'act', 'coincidence'],
        },
        { key: 'action', label: '动作', type: 'ref', refTable: 'divineActions' },
        { key: 'map', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'target', label: '对象（人物）', type: 'string' },
        { key: 'steps', label: '分次落地', type: 'json' },
        { key: 'lines', label: '写定文本', type: 'list' },
        { key: 'slot', label: '台词槽', type: 'string' },
        { key: 'narration', label: '旁白', type: 'text' },
        { key: 'item', label: '导演菜单项', type: 'string' },
        { key: 'times', label: '次数', type: 'number', min: 1 },
        { key: 'moreTimes', label: '条件加次', type: 'json' },
        { key: 'record', label: '神迹账记录', type: 'json' },
        { key: 'effects', label: '落地时的效果', type: 'json' },
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
    const problems: string[] = [...rosterProblems(content)];
    const actionIds = new Set(content.divineActions.map((a) => a.id));
    const goddessIds = new Set(content.goddesses.map((g) => g.id as string));
    for (const r of content.revelations)
      for (const k of Object.keys(r.responses))
        if (!goddessIds.has(k))
          problems.push(`revelation ${r.id}: response for unknown goddess ${k}`);
    for (const d of content.courtDefenses ?? [])
      if (!goddessIds.has(d.goddess)) problems.push(`courtDefense: unknown goddess ${d.goddess}`);
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
    problems.push(...directorProblems(content));
    for (const a of content.divineActions) {
      const at = `divine action ${a.id}`;
      for (const t of a.tags ?? [])
        if (!(ACTION_TAGS as readonly string[]).includes(t))
          problems.push(`${at}: unknown tag ${t}`);
      for (const n of a.needs ?? [])
        if (!(ACTION_NEEDS as readonly string[]).includes(n))
          problems.push(`${at}: unknown gate ${n}`);
      if (a.scale && !(KPI_SCALES as readonly string[]).includes(a.scale))
        problems.push(`${at}: unknown scale ${a.scale}`);
      if (a.exec && !(ACTION_EXECS as readonly string[]).includes(a.exec))
        problems.push(`${at}: unknown executor ${a.exec}`);
      if (a.seen && !(ACTION_SEEN as readonly string[]).includes(a.seen))
        problems.push(`${at}: unknown seen ${a.seen}`);
      if (a.playerRel !== undefined && !(a.playerRel >= 0 && a.playerRel <= 1))
        problems.push(`${at}: playerRel is 0 to 1`);
      for (const m of a.modifiers ?? [])
        if (!isModifierTarget(m.target)) problems.push(`${at}: unknown channel ${m.target}`);
    }
    problems.push(...personaProblems(content));
    problems.push(...schemeProblems(content));
    problems.push(...reactionProblems(content));
    problems.push(...beatProblems(content));
    for (const s of content.goddessSchemes ?? []) {
      problems.push(...conditionProblems(s.when, `scheme ${s.id}`));
      problems.push(...conditionProblems(s.unless, `scheme ${s.id}`));
    }
    for (const b of content.divineBeats ?? []) {
      problems.push(...conditionProblems(b.when, `beat ${b.id}`));
      problems.push(...conditionProblems(b.unless, `beat ${b.id}`));
      problems.push(...conditionProblems(b.moreTimes?.when, `beat ${b.id}`));
    }
    // references of the brain's tables into the rest of the content (catalog 17.1 rules 5, 10)
    const mapIds = new Set((content.maps ?? []).map((m) => m.id));
    for (const r of content.goddessReactions ?? []) {
      problems.push(...conditionProblems(r.when, `reaction ${r.id}`));
      for (const t of r.then)
        if (t.params?.map && !mapIds.has(t.params.map))
          problems.push(`reaction ${r.id}: unknown map ${t.params.map}`);
    }
    const people = new Set(
      ((content as unknown as { npcs?: { id: string }[] }).npcs ?? []).map((p) => p.id),
    );
    const menuIds = new Set((content.directorMenu ?? []).map((i) => i.id));
    const packSlots = (goddess: string) => {
      const pack = (content.linePacks ?? []).find((p) => p.id === `ln_${goddess}`);
      return new Set([
        ...Object.keys(pack?.slots ?? {}),
        ...Object.values(pack?.acts ?? {}).flatMap((a) => Object.keys(a)),
      ]);
    };
    for (const b of content.divineBeats ?? []) {
      for (const m of [b.map, ...(b.steps ?? []).map((x) => x.map)])
        if (m && !mapIds.has(m)) problems.push(`beat ${b.id}: unknown map ${m}`);
      if (b.target && people.size > 0 && !people.has(b.target))
        problems.push(`beat ${b.id}: unknown person ${b.target}`);
      if (b.item && !menuIds.has(b.item))
        problems.push(`beat ${b.id}: unknown menu item ${b.item}`);
      if (b.slot && !packSlots(b.goddess).has(b.slot))
        problems.push(`beat ${b.id}: no line for ${b.slot} in ln_${b.goddess}`);
    }
    for (const sc of content.goddessSchemes ?? [])
      for (const [name, bind] of Object.entries(sc.bind)) {
        if (typeof bind === 'string') continue;
        if ('map' in bind && !mapIds.has(bind.map))
          problems.push(`scheme ${sc.id}: binding ${name} names an unknown map ${bind.map}`);
        if ('person' in bind && people.size > 0 && !people.has(bind.person))
          problems.push(`scheme ${sc.id}: binding ${name} names an unknown person ${bind.person}`);
      }
    for (const rules of content.offeringRules ?? []) {
      const g = content.goddesses.find((x) => x.id === rules.goddess);
      if (!g) problems.push(`offering rules: unknown goddess ${rules.goddess}`);
      for (const gift of rules.gifts)
        if (gift.action && g && !g.menu.includes(gift.action))
          problems.push(`offering gift ${gift.want}: ${gift.action} is not on her menu`);
      for (const [item, o] of Object.entries(rules.items)) {
        if (!(content.items ?? []).some((i) => i.id === item))
          problems.push(`offering rules: unknown item ${item}`);
        if (!rules.tiers.some((t) => t.id === o.tier))
          problems.push(`offering rules: unknown tier ${o.tier}`);
      }
    }
    for (const a of content.directorActs ?? [])
      if (content.acts && !content.acts.some((x) => x.id === a.act))
        problems.push(`director acts: unknown act ${a.act}`);
    return problems;
  },
};
