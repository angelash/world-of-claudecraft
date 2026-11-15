// Economy pack: goods and materials (including Earth-knowledge products), markets,
// production recipes, caravan routes and the economy config, with editor schemas and
// cross-reference validation.

import config from '../../../data/economy/config.json';
import items from '../../../data/economy/items.json';
import markets from '../../../data/economy/markets.json';
import recipes from '../../../data/economy/recipes.json';
import routes from '../../../data/economy/routes.json';
import type { EconomyConfig, MarketDef, RecipeDef, RouteDef } from '../../systems/economy/types';
import type { ItemDef } from '../../systems/inventory';
import type { ContentPack } from '../pack';
import { ITEM_FIELDS } from './inventory';

export const pack: ContentPack = {
  id: 'economy',
  tables: {
    items: items as unknown as ItemDef[],
    markets: markets as unknown as MarketDef[],
    trade_recipes: recipes as unknown as RecipeDef[],
    trade_routes: routes as unknown as RouteDef[],
    economy_config: config as unknown as EconomyConfig,
  },
  schemas: [
    {
      table: 'items',
      label: '商品与材料',
      file: 'economy/items.json',
      idField: 'id',
      nameField: 'name',
      fields: [...ITEM_FIELDS, { key: 'tags', label: '标签', type: 'list' }],
    },
    {
      table: 'markets',
      label: '市场',
      file: 'economy/markets.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'region', label: '区域', type: 'string' },
        { key: 'mapIds', label: '所在地图', type: 'list', refTable: 'maps' },
        { key: 'taxRate', label: '交易税率', type: 'number', min: 0, max: 0.5 },
        { key: 'spread', label: '买卖差价', type: 'number', min: 0, max: 0.6 },
        { key: 'population', label: '人口', type: 'number', min: 0 },
        { key: 'buybackRate', label: '杂货收购比例', type: 'number', min: 0, max: 1 },
        { key: 'requiresFlags', label: '开张条件旗标', type: 'list' },
        { key: 'merchantRefs', label: '商人 NPC', type: 'list' },
        {
          key: 'goods',
          label: '货物（需求、供给、开局库存天数、价格系数）',
          type: 'json',
        },
        { key: 'desc', label: '说明', type: 'text' },
      ],
    },
    {
      table: 'trade_recipes',
      label: '商会配方',
      file: 'economy/recipes.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'product', label: '产品', type: 'ref', refTable: 'items', required: true },
        { key: 'output', label: '每批产量', type: 'number', min: 1 },
        { key: 'inputs', label: '原料', type: 'json' },
        { key: 'days', label: '每批天数', type: 'number', min: 0.1 },
        { key: 'tier', label: '前置', type: 'enum', options: ['oral', 'study'] },
        { key: 'requiresFlags', label: '需要旗标', type: 'list' },
        { key: 'imitationDays', label: '仿制期（天）', type: 'number', min: 0 },
        { key: 'desc', label: '说明', type: 'text' },
      ],
    },
    {
      table: 'trade_routes',
      label: '商路',
      file: 'economy/routes.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'a', label: '市场甲', type: 'ref', refTable: 'markets', required: true },
        { key: 'b', label: '市场乙', type: 'ref', refTable: 'markets', required: true },
        { key: 'days', label: '商队天数', type: 'number', min: 0.1 },
        { key: 'risk', label: '每日遇袭率', type: 'number', min: 0, max: 1 },
        { key: 'tollRate', label: '通行税率', type: 'number', min: 0, max: 0.5 },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const itemIds = new Set(content.items.map((i) => i.id));
    const marketIds = new Set(content.markets.map((m) => m.id));
    const cfg = content.economy_config;
    for (const m of content.markets) {
      if (m.taxRate < 0 || m.taxRate >= 1) problems.push(`market ${m.id}: tax out of range`);
      if (m.spread < 0 || m.spread >= 1) problems.push(`market ${m.id}: spread out of range`);
      const seen = new Set<string>();
      for (const g of m.goods) {
        if (!itemIds.has(g.itemId)) problems.push(`market ${m.id}: unknown item ${g.itemId}`);
        if (seen.has(g.itemId)) problems.push(`market ${m.id}: duplicate good ${g.itemId}`);
        seen.add(g.itemId);
        if (g.demand < 0 || g.supply < 0)
          problems.push(`market ${m.id}: negative flow ${g.itemId}`);
        if (cfg.illegalItems.includes(g.itemId))
          problems.push(`market ${m.id}: illegal good ${g.itemId} listed on a legal market`);
      }
    }
    for (const r of content.trade_recipes) {
      if (!itemIds.has(r.product)) problems.push(`recipe ${r.id}: unknown product ${r.product}`);
      for (const id of Object.keys(r.inputs))
        if (!itemIds.has(id)) problems.push(`recipe ${r.id}: unknown input ${id}`);
      if (r.output <= 0 || r.days <= 0) problems.push(`recipe ${r.id}: bad output or days`);
    }
    for (const r of content.trade_routes) {
      if (!marketIds.has(r.a) || !marketIds.has(r.b))
        problems.push(`route ${r.id}: unknown market ${r.a} or ${r.b}`);
      if (r.days <= 0) problems.push(`route ${r.id}: bad days`);
    }
    if (!itemIds.has('grey_crystal')) problems.push('economy: grey_crystal item missing');
    if (!marketIds.has(cfg.competitor.marketId))
      problems.push(`economy: competitor market ${cfg.competitor.marketId} unknown`);
    if (cfg.modifierBounds[0] > cfg.modifierBounds[1])
      problems.push('economy: bad modifier bounds');
    return problems;
  },
};
