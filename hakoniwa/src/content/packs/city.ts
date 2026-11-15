// City pack: the old outpost and inner court maps, building definitions, sites, official
// candidates and policy cards, with editor schemas and cross-reference validation.

import buildings from '../../../data/city/buildings.json';
import maps from '../../../data/city/maps.json';
import officials from '../../../data/city/officials.json';
import policies from '../../../data/city/policies.json';
import sites from '../../../data/city/sites.json';
import type { BuildingDef, OfficialDef, PolicyDef, SiteDef } from '../../systems/city/types';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack } from '../pack';

const DOMAINS = [
  'food',
  'works',
  'security',
  'civil',
  'commerce',
  'military',
  'culture',
  'research',
];
const CATEGORIES = [
  'residential',
  'production',
  'storage',
  'commerce',
  'culture',
  'defense',
  'admin',
  'research',
  'special',
];

export const pack: ContentPack = {
  id: 'city',
  tables: {
    maps: maps as unknown as MapDef[],
    city_buildings: buildings as unknown as BuildingDef[],
    city_sites: sites as unknown as SiteDef[],
    city_officials: officials as unknown as OfficialDef[],
    city_policies: policies as unknown as PolicyDef[],
  },
  schemas: [
    {
      table: 'city_buildings',
      label: '建筑',
      file: 'city/buildings.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'category', label: '类别', type: 'enum', options: CATEGORIES },
        { key: 'desc', label: '描述', type: 'text' },
        { key: 'footprint', label: '占地（格）', type: 'json' },
        { key: 'cost', label: '费用', type: 'json', help: '{ items: {物品: 数量}, money: 铜 }' },
        { key: 'days', label: '工期（天）', type: 'number', min: 0 },
        { key: 'produces', label: '每日产出', type: 'json' },
        { key: 'consumes', label: '每日消耗', type: 'json' },
        { key: 'channel', label: '修正项通道', type: 'enum', options: ['harvest', 'production'] },
        { key: 'jobs', label: '岗位', type: 'number', min: 0 },
        { key: 'housing', label: '住房', type: 'number', min: 0 },
        { key: 'storage', label: '库容', type: 'number', min: 0 },
        { key: 'effects', label: '效果', type: 'json' },
        { key: 'upkeepPerMonth', label: '月维护费（铜）', type: 'number', min: 0 },
        { key: 'unlock', label: '解锁条件', type: 'json' },
        {
          key: 'terrain',
          label: '地形要求',
          type: 'enum',
          options: ['any', 'near_water', 'near_tree', 'near_rock'],
        },
        { key: 'sites', label: '可建场所', type: 'list' },
        { key: 'max', label: '上限', type: 'number', min: 1 },
        { key: 'tags', label: '标签', type: 'list' },
      ],
    },
    {
      table: 'city_sites',
      label: '聚落与庭院',
      file: 'city/sites.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'kind', label: '类型', type: 'enum', options: ['settlement', 'court'] },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'stockOwner', label: '库存所有者', type: 'string' },
        { key: 'centerLocation', label: '中心地点', type: 'string' },
        { key: 'tradeMarket', label: '交易市场', type: 'string' },
        { key: 'initialStock', label: '初始库存', type: 'json' },
        { key: 'initialMoney', label: '初始金库（铜）', type: 'number', min: 0 },
        { key: 'requiresFlags', label: '需要旗标', type: 'list' },
        { key: 'outsideDivineSight', label: '神之视线之外', type: 'boolean' },
        { key: 'immuneToModifiers', label: '不受修正项影响', type: 'boolean' },
        { key: 'caps', label: '各阶段上限', type: 'json' },
      ],
    },
    {
      table: 'city_officials',
      label: '官员人选',
      file: 'city/officials.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'NPC ID', type: 'string', required: true },
        { key: 'name', label: '名字', type: 'string', required: true },
        { key: 'desc', label: '人设摘要', type: 'text' },
        { key: 'competence', label: '各领域能力', type: 'json' },
        { key: 'loyalty', label: '忠诚', type: 'number', min: 0, max: 100 },
        { key: 'ambition', label: '野心', type: 'number', min: 0, max: 100 },
        { key: 'integrity', label: '廉洁', type: 'number', min: 0, max: 100 },
        { key: 'initiative', label: '主动性', type: 'number', min: 0, max: 100 },
        { key: 'creed', label: '信条', type: 'string' },
        { key: 'requiresFlags', label: '需要旗标', type: 'list' },
      ],
    },
    {
      table: 'city_policies',
      label: '政策卡',
      file: 'city/policies.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'domain', label: '领域', type: 'enum', options: DOMAINS },
        { key: 'desc', label: '描述', type: 'text' },
        {
          key: 'minStage',
          label: '最低规模',
          type: 'enum',
          options: ['outpost', 'village', 'territory'],
        },
        { key: 'effects', label: '效果', type: 'json' },
        { key: 'exclusive', label: '互斥', type: 'list' },
      ],
    },
    {
      table: 'maps',
      label: '地图（城建）',
      file: 'city/maps.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'region', label: '区域', type: 'string' },
        { key: 'width', label: '宽', type: 'number', min: 1 },
        { key: 'height', label: '高', type: 'number', min: 1 },
        { key: 'rows', label: '地块行', type: 'json' },
        { key: 'legend', label: '图例', type: 'json' },
        {
          key: 'locations',
          label: '地点',
          type: 'json',
          help: 'kind 为 build_zone 的地点是建设用地，标签 stage:<规模>',
        },
        { key: 'spawns', label: '出生点', type: 'json' },
        { key: 'exits', label: '出口', type: 'json' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const items = new Set((content.items ?? []).map((i) => i.id));
    const bIds = new Set((content.city_buildings ?? []).map((b) => b.id));
    for (const b of content.city_buildings ?? []) {
      if (b.footprint.w < 1 || b.footprint.h < 1) problems.push(`building ${b.id}: bad footprint`);
      if (b.days < 0) problems.push(`building ${b.id}: negative days`);
      if (b.sites.length === 0) problems.push(`building ${b.id}: no sites`);
      if (!CATEGORIES.includes(b.category)) problems.push(`building ${b.id}: bad category`);
      for (const need of b.unlock.buildings ?? [])
        if (!bIds.has(need)) problems.push(`building ${b.id}: unlock needs unknown ${need}`);
      const refs = new Set([
        ...Object.keys(b.cost.items),
        ...Object.keys(b.produces ?? {}),
        ...Object.keys(b.consumes ?? {}),
      ]);
      for (const id of refs)
        if (!items.has(id)) problems.push(`building ${b.id}: unknown item ${id}`);
    }
    for (const s of content.city_sites ?? []) {
      const map = content.maps.find((m) => m.id === s.mapId);
      if (!map) {
        problems.push(`site ${s.id}: unknown map ${s.mapId}`);
        continue;
      }
      if (!map.locations.some((l) => l.id === s.centerLocation))
        problems.push(`site ${s.id}: map has no location ${s.centerLocation}`);
      if (!map.locations.some((l) => l.kind === 'build_zone'))
        problems.push(`site ${s.id}: map has no build_zone`);
      if (s.kind === 'court' && !map.locations.some((l) => l.kind === 'safe'))
        problems.push(`site ${s.id}: court map needs a safe location`);
      for (const id of Object.keys(s.initialStock))
        if (!items.has(id)) problems.push(`site ${s.id}: unknown item ${id}`);
    }
    const pIds = new Set((content.city_policies ?? []).map((p) => p.id));
    for (const p of content.city_policies ?? []) {
      if (!DOMAINS.includes(p.domain)) problems.push(`policy ${p.id}: bad domain`);
      for (const x of p.exclusive ?? [])
        if (!pIds.has(x)) problems.push(`policy ${p.id}: exclusive unknown ${x}`);
    }
    for (const o of content.city_officials ?? []) {
      for (const [d, v] of Object.entries(o.competence)) {
        if (!DOMAINS.includes(d)) problems.push(`official ${o.id}: bad domain ${d}`);
        if (typeof v !== 'number' || v < 0 || v > 100)
          problems.push(`official ${o.id}: competence out of range`);
      }
    }
    return problems;
  },
};
