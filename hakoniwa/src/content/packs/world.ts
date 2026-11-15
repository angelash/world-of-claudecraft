// World pack: the core test map, the fallback start position and the world atlas (the
// registry of built and planned maps, regions and routes, docs/40_design/world/world_map.md).
// Story packs declare their own maps and a higher-priority start (see systems/world WorldStart).

import atlasMaps from '../../../data/world/atlas_maps.json';
import atlasRegions from '../../../data/world/atlas_regions.json';
import atlasRoutes from '../../../data/world/atlas_routes.json';
import testMaps from '../../../data/world/maps_test.json';
import { lookProblems, STYLE_IDS, type WorldStart } from '../../systems/world';
import {
  ATLAS_EXEMPT_MAPS,
  ATLAS_REGION_TIERS,
  ATLAS_ROLES,
  ATLAS_STATUSES,
  ATLAS_TIERS,
  type AtlasMapDef,
  type AtlasRegionDef,
  type AtlasRouteDef,
  atlasProblems,
  ROUTE_KINDS,
  ROUTE_LAYERS,
} from '../../systems/world/atlas';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack } from '../pack';

const worldStarts: WorldStart[] = [{ mapId: 'testfield', x: 2.5, y: 1.5, priority: 0 }];
const STYLES = [...STYLE_IDS];

export const pack: ContentPack = {
  id: 'world',
  tables: {
    maps: testMaps as MapDef[],
    worldStarts,
    atlas_regions: atlasRegions as unknown as AtlasRegionDef[],
    atlas_maps: atlasMaps as unknown as AtlasMapDef[],
    atlas_routes: atlasRoutes as unknown as AtlasRouteDef[],
  },
  schemas: [
    {
      table: 'maps',
      label: '地图',
      file: 'world/maps_test.json',
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
        { key: 'locations', label: '地点', type: 'json' },
        { key: 'spawns', label: '出生点', type: 'json' },
        { key: 'exits', label: '出口', type: 'json' },
        { key: 'style', label: '风格包', type: 'string' },
        { key: 'looks', label: '建筑外观', type: 'json' },
        { key: 'decor', label: '装饰', type: 'json' },
      ],
    },
    {
      table: 'atlas_regions',
      label: '图集区域',
      file: 'world/atlas_regions.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        {
          key: 'tier',
          label: '层级',
          type: 'enum',
          options: [...ATLAS_REGION_TIERS],
          required: true,
        },
        { key: 'parent', label: '所属大陆', type: 'ref', refTable: 'atlas_regions' },
        { key: 'geo', label: '地理志区域', type: 'string' },
        { key: 'slgRegion', label: '大陆图区域', type: 'string' },
        { key: 'acts', label: '幕次', type: 'list', required: true },
        { key: 'style', label: '默认风格包', type: 'enum', options: STYLES },
        { key: 'stylePlan', label: '规划风格包（提案）', type: 'string' },
        { key: 'sediment', label: '澱度区间', type: 'json' },
        { key: 'note', label: '说明', type: 'text' },
      ],
    },
    {
      table: 'atlas_maps',
      label: '图集地图',
      file: 'world/atlas_maps.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'code', label: '编号', type: 'string', required: true },
        { key: 'covers', label: '覆盖的地理志编号', type: 'list' },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'tier', label: '层', type: 'enum', options: [...ATLAS_TIERS], required: true },
        { key: 'role', label: '角色', type: 'enum', options: [...ATLAS_ROLES], required: true },
        {
          key: 'status',
          label: '状态',
          type: 'enum',
          options: [...ATLAS_STATUSES],
          required: true,
        },
        { key: 'region', label: '区域', type: 'ref', refTable: 'atlas_regions', required: true },
        { key: 'province', label: '大陆省份', type: 'ref', refTable: 'slg_provinces' },
        { key: 'acts', label: '幕次', type: 'list', required: true },
        { key: 'hubOf', label: '作为枢纽的幕', type: 'list' },
        { key: 'style', label: '风格包', type: 'enum', options: STYLES },
        { key: 'stylePlan', label: '规划风格包（提案）', type: 'string' },
        { key: 'sediment', label: '澱度', type: 'number', min: 0, max: 5, required: true },
        { key: 'levels', label: '等级段', type: 'json' },
        { key: 'size', label: '尺寸（格）', type: 'json', required: true },
        { key: 'scenario', label: '战场', type: 'ref', refTable: 'battle_scenarios' },
        { key: 'optional', label: '可选内容', type: 'boolean' },
        { key: 'source', label: '正典出处', type: 'string' },
        { key: 'note', label: '说明', type: 'text' },
      ],
    },
    {
      table: 'atlas_routes',
      label: '图集路线',
      file: 'world/atlas_routes.json',
      idField: 'id',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'from', label: '起点', type: 'ref', refTable: 'atlas_maps', required: true },
        { key: 'to', label: '终点', type: 'ref', refTable: 'atlas_maps', required: true },
        { key: 'layer', label: '层', type: 'enum', options: [...ROUTE_LAYERS], required: true },
        { key: 'kind', label: '种类', type: 'enum', options: [...ROUTE_KINDS], required: true },
        { key: 'road', label: '路名', type: 'string' },
        { key: 'km', label: '距离（公里）', type: 'number', min: 0 },
        { key: 'hours', label: '行程（游戏小时）', type: 'json' },
        { key: 'acts', label: '开放的幕', type: 'list', required: true },
        { key: 'oneWay', label: '单向', type: 'boolean' },
        { key: 'fromExit', label: '起点出口', type: 'string' },
        { key: 'toExit', label: '回程出口', type: 'string' },
        {
          key: 'status',
          label: '状态',
          type: 'enum',
          options: ['built', 'planned'],
          required: true,
        },
        { key: 'opens', label: '开放条件', type: 'text' },
        { key: 'requiresFlags', label: '需要的旗标', type: 'list' },
        { key: 'events', label: '途中事件', type: 'list' },
        { key: 'note', label: '说明', type: 'text' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const ids = new Set(content.maps.map((m) => m.id));
    for (const m of content.maps) {
      if (m.rows.length !== m.height)
        problems.push(`map ${m.id}: rows ${m.rows.length} != height ${m.height}`);
      m.rows.forEach((r, i) => {
        if (r.length !== m.width)
          problems.push(`map ${m.id}: row ${i} width ${r.length} != ${m.width}`);
        for (const ch of r)
          if (!(ch in m.legend)) problems.push(`map ${m.id}: row ${i} unknown tile '${ch}'`);
      });
      for (const x of m.exits)
        if (!ids.has(x.toMap)) problems.push(`map ${m.id}: exit ${x.id} -> unknown map ${x.toMap}`);
      problems.push(...lookProblems(m));
    }
    for (const s of content.worldStarts)
      if (!ids.has(s.mapId)) problems.push(`worldStart -> unknown map ${s.mapId}`);
    // Partial content builds (tests that load a few packs) carry no story maps: the atlas
    // then only checks itself and whatever province and battle tables are present.
    const story = content.maps.some((m) => !ATLAS_EXEMPT_MAPS.has(m.id));
    problems.push(
      ...atlasProblems({
        regions: content.atlas_regions ?? [],
        maps: content.atlas_maps ?? [],
        routes: content.atlas_routes ?? [],
        contentMaps: story ? content.maps : undefined,
        provinces: content.slg_provinces,
        links: content.slg_links,
        scenarios: content.battle_scenarios,
      }),
    );
    return problems;
  },
};
