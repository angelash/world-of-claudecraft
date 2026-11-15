// Warfare pack: regiment types, hero abilities and battle scenarios, with editor schemas
// and validation (references, grid shape, passable deployments, objective zones).

import abilities from '../../../data/warfare/abilities.json';
import scenarios from '../../../data/warfare/scenarios.json';
import units from '../../../data/warfare/units.json';
import { passableTile } from '../../systems/warfare/terrain';
import type {
  BattleScenarioDef,
  BattleTerrain,
  HeroAbilityDef,
  UnitTypeDef,
} from '../../systems/warfare/types';
import type { ContentPack } from '../pack';

const TERRAINS: BattleTerrain[] = [
  'plain',
  'road',
  'forest',
  'hill',
  'ford',
  'water',
  'wall',
  'swamp',
  'snow',
  'dian',
  'building',
];
const ABILITY_KINDS = ['charge', 'inspire', 'aoe', 'rally', 'strike'];

export const pack: ContentPack = {
  id: 'warfare',
  tables: {
    regiment_types: units as unknown as UnitTypeDef[],
    hero_abilities: abilities as unknown as HeroAbilityDef[],
    battle_scenarios: scenarios as unknown as BattleScenarioDef[],
  },
  schemas: [
    {
      table: 'regiment_types',
      label: '兵种',
      file: 'warfare/units.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'race', label: '种族', type: 'string' },
        {
          key: 'role',
          label: '职能',
          type: 'enum',
          options: [
            'militia',
            'shield',
            'spear',
            'shock',
            'archer',
            'light_cav',
            'heavy_cav',
            'mage',
            'healer',
            'scout',
            'monster',
            'flying',
            'siege',
          ],
        },
        { key: 'quality', label: '品质', type: 'enum', options: ['recruit', 'regular', 'elite'] },
        { key: 'level', label: '代表兵等级', type: 'number', min: 1, max: 60 },
        { key: 'hp', label: '生命', type: 'number', min: 1 },
        { key: 'armor', label: '护甲', type: 'number', min: 0 },
        {
          key: 'armorType',
          label: '护甲类型',
          type: 'enum',
          options: ['none', 'light', 'medium', 'heavy', 'monster', 'building', 'spirit'],
        },
        { key: 'dmgMin', label: '最小伤害', type: 'number', min: 0 },
        { key: 'dmgMax', label: '最大伤害', type: 'number', min: 0 },
        {
          key: 'dmgType',
          label: '伤害类型',
          type: 'enum',
          options: ['slash', 'pierce', 'blunt', 'missile', 'magic', 'holy', 'siege'],
        },
        { key: 'attackInterval', label: '攻击间隔（秒）', type: 'number', min: 0.5 },
        { key: 'range', label: '射程（格）', type: 'number', min: 1 },
        { key: 'hitBase', label: '命中', type: 'number', min: 0, max: 1 },
        { key: 'dodgeBase', label: '闪避', type: 'number', min: 0, max: 1 },
        { key: 'speed', label: '速度（格每秒）', type: 'number', min: 0.1 },
        { key: 'morale', label: '士气基线', type: 'number', min: 0, max: 100 },
        { key: 'formations', label: '可用阵型', type: 'list' },
        { key: 'cost', label: '招募费（铜每人）', type: 'number', min: 0 },
        { key: 'upkeep', label: '月维护（铜每人）', type: 'number', min: 0 },
        { key: 'tags', label: '特性', type: 'list' },
        { key: 'desc', label: '描述', type: 'text' },
      ],
    },
    {
      table: 'hero_abilities',
      label: '英雄战场技能',
      file: 'warfare/abilities.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'kind', label: '类别', type: 'enum', options: ABILITY_KINDS },
        { key: 'cooldown', label: '冷却（秒）', type: 'number', min: 0 },
        { key: 'range', label: '距离（格）', type: 'number', min: 0 },
        { key: 'radius', label: '半径（格）', type: 'number', min: 0 },
        { key: 'power', label: '威力', type: 'number', min: 0 },
        { key: 'desc', label: '描述', type: 'text' },
      ],
    },
    {
      table: 'battle_scenarios',
      label: '战役场景',
      file: 'warfare/scenarios.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        {
          key: 'scale',
          label: '规模',
          type: 'enum',
          options: ['squad', 'company', 'legion', 'coalition'],
        },
        { key: 'act', label: '幕次', type: 'string' },
        { key: 'desc', label: '简介', type: 'text' },
        { key: 'width', label: '宽', type: 'number', min: 8 },
        { key: 'height', label: '高', type: 'number', min: 8 },
        { key: 'rows', label: '地形行', type: 'json' },
        { key: 'legend', label: '图例', type: 'json' },
        { key: 'teams', label: '双方兵力', type: 'json' },
        { key: 'objectives', label: '目标', type: 'json' },
        { key: 'reinforcements', label: '援军', type: 'json' },
        { key: 'timeLimit', label: '时限（秒）', type: 'number', min: 30 },
        { key: 'zones', label: '战线区域', type: 'json' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const unitIds = new Set((content.regiment_types ?? []).map((u) => u.id));
    const abilityIds = new Set((content.hero_abilities ?? []).map((a) => a.id));
    for (const u of content.regiment_types ?? []) {
      if (u.hp <= 0) problems.push(`regiment_type ${u.id}: hp must be positive`);
      if (u.dmgMax < u.dmgMin) problems.push(`regiment_type ${u.id}: dmgMax < dmgMin`);
      if (u.formations.length === 0) problems.push(`regiment_type ${u.id}: no formations`);
    }
    for (const a of content.hero_abilities ?? []) {
      if (!ABILITY_KINDS.includes(a.kind))
        problems.push(`hero_ability ${a.id}: bad kind ${a.kind}`);
    }
    for (const s of content.battle_scenarios ?? []) {
      const p = `battle_scenario ${s.id}`;
      if (s.rows.length !== s.height)
        problems.push(`${p}: rows ${s.rows.length} != height ${s.height}`);
      s.rows.forEach((r, i) => {
        if (r.length !== s.width) problems.push(`${p}: row ${i} width ${r.length} != ${s.width}`);
        for (const ch of r)
          if (!(ch in s.legend)) problems.push(`${p}: row ${i} unknown tile '${ch}'`);
      });
      for (const [ch, t] of Object.entries(s.legend)) {
        if (!TERRAINS.includes(t)) problems.push(`${p}: legend '${ch}' -> unknown terrain ${t}`);
      }
      const ids = new Set<string>();
      const heroIds = new Set<string>();
      const place = (what: string, x: number, y: number) => {
        if (x < 0 || y < 0 || x >= s.width || y >= s.height)
          problems.push(`${p}: ${what} out of bounds`);
        else if (!passableTile(s, Math.floor(x), Math.floor(y)))
          problems.push(`${p}: ${what} on impassable tile (${x}, ${y})`);
      };
      const regs = [
        ...s.teams.player.regiments,
        ...s.teams.enemy.regiments,
        ...(s.reinforcements ?? []).flatMap((r) => r.regiments),
      ];
      for (const r of regs) {
        if (ids.has(r.id)) problems.push(`${p}: duplicate regiment id ${r.id}`);
        ids.add(r.id);
        if (!unitIds.has(r.typeId))
          problems.push(`${p}: regiment ${r.id} -> unknown type ${r.typeId}`);
        if (r.count <= 0) problems.push(`${p}: regiment ${r.id} has no soldiers`);
        place(`regiment ${r.id}`, r.x, r.y);
      }
      const heroes = [
        ...s.teams.player.heroes,
        ...s.teams.enemy.heroes,
        ...(s.reinforcements ?? []).flatMap((r) => r.heroes ?? []),
      ];
      for (const h of heroes) {
        heroIds.add(h.id);
        for (const a of h.abilities)
          if (!abilityIds.has(a)) problems.push(`${p}: hero ${h.id} -> unknown ability ${a}`);
        place(`hero ${h.id}`, h.x, h.y);
      }
      place('player retreat', s.teams.player.retreat.x, s.teams.player.retreat.y);
      place('enemy retreat', s.teams.enemy.retreat.x, s.teams.enemy.retreat.y);
      for (const o of s.objectives) {
        if (o.kind === 'hold' && (!o.zone || !o.seconds))
          problems.push(`${p}: hold objective ${o.id} needs zone and seconds`);
        if (
          o.zone &&
          (o.zone.x < 0 ||
            o.zone.y < 0 ||
            o.zone.x + o.zone.w > s.width ||
            o.zone.y + o.zone.h > s.height)
        )
          problems.push(`${p}: objective ${o.id} zone out of bounds`);
        if (o.kind === 'kill_hero' && (!o.heroId || !heroIds.has(o.heroId)))
          problems.push(`${p}: objective ${o.id} -> unknown hero ${o.heroId}`);
      }
      if (s.timeLimit <= 0) problems.push(`${p}: timeLimit must be positive`);
    }
    return problems;
  },
};
