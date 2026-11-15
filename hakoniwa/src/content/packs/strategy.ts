// Strategy pack: provinces and links of the continent, the seven opening powers and the
// SLG configuration (player nation template, truce, conclave stages), with validation.

import config from '../../../data/strategy/config.json';
import map from '../../../data/strategy/map.json';
import nations from '../../../data/strategy/nations.json';
import type {
  NationDef,
  ProvinceDef,
  ProvinceLink,
  StrategyConfig,
} from '../../systems/strategy/types';
import type { ContentPack } from '../pack';

const TERRAINS = ['plain', 'forest', 'hills', 'mountain', 'swamp', 'steppe', 'waste', 'coast'];

export const pack: ContentPack = {
  id: 'strategy',
  tables: {
    slg_provinces: map.provinces as unknown as ProvinceDef[],
    slg_links: map.links as unknown as ProvinceLink[],
    slg_nations: nations as unknown as NationDef[],
    slg_config: config as unknown as StrategyConfig,
  },
  schemas: [
    {
      table: 'slg_provinces',
      label: '大陆省份',
      file: 'strategy/map.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'region', label: '区域', type: 'string' },
        { key: 'owner', label: '开局归属', type: 'ref', refTable: 'slg_nations' },
        { key: 'terrain', label: '地形', type: 'enum', options: TERRAINS },
        { key: 'population', label: '人口', type: 'number', min: 0 },
        { key: 'tax', label: '年税（金）', type: 'number', min: 0 },
        { key: 'garrison', label: '守军', type: 'number', min: 0 },
        { key: 'fort', label: '城防', type: 'number', min: 0, max: 3 },
        { key: 'dian', label: '澱度', type: 'number', min: 0, max: 5 },
        { key: 'x', label: '地图 X', type: 'number', min: 0, max: 100 },
        { key: 'y', label: '地图 Y', type: 'number', min: 0, max: 100 },
        { key: 'capitalOf', label: '首都', type: 'string' },
        { key: 'impassable', label: '不可通行', type: 'boolean' },
        { key: 'desc', label: '说明', type: 'text' },
      ],
    },
    {
      table: 'slg_nations',
      label: '国家',
      file: 'strategy/nations.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'short', label: '简称', type: 'string' },
        { key: 'capital', label: '首都', type: 'ref', refTable: 'slg_provinces' },
        { key: 'color', label: '颜色', type: 'string' },
        { key: 'ruler', label: '统治者人格', type: 'json' },
        { key: 'treasury', label: '国库（金）', type: 'number' },
        { key: 'stability', label: '稳定', type: 'number', min: 0, max: 100 },
        { key: 'legitimacy', label: '正统', type: 'number', min: 0, max: 100 },
        { key: 'autonomy', label: '国家自治度', type: 'number', min: 0, max: 100 },
        { key: 'divineReliance', label: '神依赖度', type: 'number', min: 0, max: 100 },
        { key: 'goddess', label: '主要女神', type: 'string' },
        { key: 'relations', label: '开局关系（-3 到 3）', type: 'json' },
        { key: 'armies', label: '开局军队', type: 'json' },
        { key: 'recruits', label: '可征兵种', type: 'list' },
        { key: 'adminBase', label: '行政容量基数', type: 'number', min: 1 },
        {
          key: 'roles',
          label: '会盟职能',
          type: 'list',
          help: 'church：证据越多越敌视、发动圣战；summit_key：会盟结盟必须有它支持；每种全作唯一',
        },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const provinces = content.slg_provinces ?? [];
    const pids = new Set(provinces.map((p) => p.id));
    const nids = new Set((content.slg_nations ?? []).map((n) => n.id));
    const units = new Set((content.regiment_types ?? []).map((u) => u.id));
    const nations = content.slg_nations ?? [];
    if (nations.length > 0) {
      for (const role of ['church', 'summit_key'] as const) {
        const n = nations.filter((x) => x.roles?.includes(role)).length;
        if (n !== 1)
          problems.push(`slg_nations: role ${role} held by ${n} nations (want exactly 1)`);
      }
      for (const x of nations)
        for (const r of x.roles ?? [])
          if (r !== 'church' && r !== 'summit_key')
            problems.push(`slg_nation ${x.id}: unknown role ${r}`);
    }
    for (const p of provinces) {
      if (!TERRAINS.includes(p.terrain))
        problems.push(`slg_province ${p.id}: unknown terrain ${p.terrain}`);
      if (p.owner && !nids.has(p.owner))
        problems.push(`slg_province ${p.id}: unknown owner ${p.owner}`);
    }
    const linked = new Set<string>();
    for (const l of content.slg_links ?? []) {
      if (!pids.has(l.a) || !pids.has(l.b))
        problems.push(`slg_link ${l.a}-${l.b}: unknown province`);
      if (l.days <= 0) problems.push(`slg_link ${l.a}-${l.b}: days must be positive`);
      linked.add(l.a);
      linked.add(l.b);
    }
    for (const p of provinces)
      if (!linked.has(p.id)) problems.push(`slg_province ${p.id}: not linked`);
    const checkArmy = (
      who: string,
      a: { id: string; province: string; regiments: { typeId: string }[] },
    ) => {
      if (!pids.has(a.province))
        problems.push(`${who} army ${a.id}: unknown province ${a.province}`);
      for (const r of a.regiments)
        if (units.size > 0 && !units.has(r.typeId))
          problems.push(`${who} army ${a.id}: unknown unit ${r.typeId}`);
    };
    for (const n of content.slg_nations ?? []) {
      if (!pids.has(n.capital)) problems.push(`slg_nation ${n.id}: unknown capital ${n.capital}`);
      for (const k of Object.keys(n.relations))
        if (!nids.has(k)) problems.push(`slg_nation ${n.id}: relation to unknown ${k}`);
      for (const a of n.armies) checkArmy(`slg_nation ${n.id}`, a);
      for (const r of n.recruits)
        if (units.size > 0 && !units.has(r))
          problems.push(`slg_nation ${n.id}: unknown recruit ${r}`);
    }
    const cfg = content.slg_config;
    if (cfg) {
      for (const p of cfg.playerProvinces)
        if (!pids.has(p)) problems.push(`slg_config: unknown player province ${p}`);
      for (const a of cfg.playerNation.armies) checkArmy('slg_config player', a);
    }
    return problems;
  },
};
