// NPC pack: the borderstone and wallenburg maps, persona cards, schedule templates,
// L4 resident templates and the speakable knowledge table, with editor schemas and
// the cross-reference validation of all of them.

import knowledge from '../../../data/npc/knowledge.json';
import maps from '../../../data/npc/maps.json';
import personas from '../../../data/npc/personas.json';
import residents from '../../../data/npc/residents.json';
import schedules from '../../../data/npc/schedules.json';
import type { ContentMap } from '../../core/contracts';
import { resolvePlace } from '../../systems/npc/places';
import {
  ACTIVITIES,
  type KnowledgeEntry,
  type PersonaCard,
  type ResidentTemplate,
  type ScheduleSegment,
  type ScheduleTemplate,
  type SocialClass,
} from '../../systems/npc/types';
import { isWalkableTile, mapById } from '../../systems/world';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack, FieldSchema } from '../pack';

/** Maps this pack owns (implementation_conventions.md 2). */
export const SOCIAL_MAP_IDS = ['borderstone', 'wallenburg'];

/** Arrival locations other maps' exits point to (gate_<source map id>). */
const REQUIRED_ARRIVALS: Record<string, string[]> = {
  borderstone: ['gate_seal_ruins', 'gate_forest_edge', 'gate_old_outpost', 'gate_wallenburg'],
  wallenburg: ['gate_borderstone', 'gate_wallenburg_sewers'],
};

const CLASSES: SocialClass[] = [
  'peasant',
  'artisan',
  'adventurer',
  'knight',
  'merchant',
  'clergy',
  'scholar',
  'noble',
  'royal',
  'remnant',
  'child',
  'beastkin',
];
const TIERS = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];
const COLOR = /^#[0-9a-f]{6}$/i;

function checkSegments(
  content: ContentMap,
  owner: string,
  card: { map: string; home: string; work: string },
  segs: ScheduleSegment[],
  problems: string[],
): void {
  for (const s of segs) {
    if (
      !Number.isInteger(s.from) ||
      !Number.isInteger(s.to) ||
      s.from < 0 ||
      s.from > 23 ||
      s.to < 1 ||
      s.to > 24
    )
      problems.push(`${owner}: bad hours ${s.from}-${s.to}`);
    if (!ACTIVITIES.includes(s.act)) problems.push(`${owner}: unknown activity ${s.act}`);
    if (!resolvePlace(content, card, s.at))
      problems.push(`${owner}: place ${s.at} not on ${card.map}`);
  }
}

export function validateNpcContent(content: ContentMap): string[] {
  const problems: string[] = [];
  const templates = new Map((content.npcSchedules ?? []).map((t) => [t.id, t]));
  for (const t of content.npcSchedules ?? []) {
    for (const s of t.segments) {
      if (!ACTIVITIES.includes(s.act)) problems.push(`schedule ${t.id}: unknown activity ${s.act}`);
      if (typeof s.at !== 'string') problems.push(`schedule ${t.id}: bad place`);
    }
  }
  const ids = new Set((content.npcs ?? []).map((p) => p.id));
  const trustKeys = new Set<string>();
  for (const p of content.npcs ?? []) {
    const who = `npc ${p.id}`;
    const map = mapById(content, p.map);
    if (!map) {
      problems.push(`${who}: unknown map ${p.map}`);
      continue;
    }
    for (const loc of [p.home, p.work])
      if (!map.locations.some((l) => l.id === loc))
        problems.push(`${who}: unknown location ${loc}`);
    if (!CLASSES.includes(p.class)) problems.push(`${who}: unknown class ${p.class}`);
    if (!TIERS.includes(p.knowledge))
      problems.push(`${who}: unknown knowledge tier ${p.knowledge}`);
    if (p.attitude < 0 || p.attitude > 100) problems.push(`${who}: attitude out of range`);
    if (p.level < 1 || p.level > 70) problems.push(`${who}: level out of range`);
    if ((p.devotion ?? 0) < 0 || (p.devotion ?? 0) > 1)
      problems.push(`${who}: devotion out of range`);
    if (!p.voice?.catchphrases?.length || !p.voice.address)
      problems.push(`${who}: voice incomplete`);
    if (p.appearance.colors.length !== 4 || p.appearance.colors.some((c) => !COLOR.test(c)))
      problems.push(`${who}: appearance needs four #rrggbb colors`);
    const segs = Array.isArray(p.schedule) ? p.schedule : templates.get(p.schedule)?.segments;
    if (!segs) problems.push(`${who}: unknown schedule ${String(p.schedule)}`);
    else checkSegments(content, who, p, segs, problems);
    for (const other of Object.keys(p.relations ?? {}))
      if (!ids.has(other)) problems.push(`${who}: relation to unknown npc ${other}`);
    const key = p.trustKey ?? `trust.${p.id}`;
    if (trustKeys.has(key)) problems.push(`${who}: duplicate trust flag ${key}`);
    trustKeys.add(key);
  }
  for (const r of content.npcResidents ?? []) {
    const who = `resident ${r.id}`;
    const map = mapById(content, r.map);
    if (!map) {
      problems.push(`${who}: unknown map ${r.map}`);
      continue;
    }
    for (const loc of [...r.homes, ...r.works])
      if (!map.locations.some((l) => l.id === loc))
        problems.push(`${who}: unknown location ${loc}`);
    const t = templates.get(r.schedule);
    if (!t) problems.push(`${who}: unknown schedule ${r.schedule}`);
    else
      for (const h of r.homes)
        checkSegments(
          content,
          who,
          { map: r.map, home: h, work: r.works[0] ?? h },
          t.segments,
          problems,
        );
    if (r.level[0] > r.level[1]) problems.push(`${who}: bad level range`);
  }
  for (const k of content.npcKnowledge ?? []) {
    if (!TIERS.includes(k.tier)) problems.push(`knowledge ${k.id}: unknown tier ${k.tier}`);
  }
  for (const id of SOCIAL_MAP_IDS) {
    const map = mapById(content, id);
    if (!map) {
      problems.push(`map ${id} missing`);
      continue;
    }
    for (const need of REQUIRED_ARRIVALS[id] ?? [])
      if (!map.locations.some((l) => l.id === need))
        problems.push(`map ${id}: missing arrival ${need}`);
    if (!map.locations.some((l) => l.kind === 'safe')) problems.push(`map ${id}: no safe location`);
    const seen = new Set<string>();
    for (const l of map.locations) {
      if (seen.has(l.id)) problems.push(`map ${id}: duplicate location ${l.id}`);
      seen.add(l.id);
      if (l.x < 0 || l.y < 0 || l.x + l.w > map.width || l.y + l.h > map.height)
        problems.push(`map ${id}: location ${l.id} out of bounds`);
    }
    for (const x of map.exits)
      if (!isWalkableTile(map, x.x, x.y))
        problems.push(`map ${id}: exit ${x.id} on a blocked tile`);
  }
  return problems;
}

const PERSONA_FIELDS: FieldSchema[] = [
  { key: 'id', label: 'ID', type: 'string', required: true },
  { key: 'name', label: '姓名', type: 'string', required: true },
  { key: 'race', label: '种族', type: 'string' },
  { key: 'age', label: '年龄', type: 'number', min: 0 },
  { key: 'job', label: '职业', type: 'string' },
  { key: 'level', label: '等级', type: 'number', min: 1, max: 70 },
  { key: 'faction', label: '势力', type: 'string' },
  { key: 'class', label: '阶层', type: 'enum', options: CLASSES },
  { key: 'traits', label: '性格关键词', type: 'list' },
  { key: 'intro', label: '一句话介绍', type: 'text' },
  { key: 'goals', label: '目标', type: 'list' },
  { key: 'secrets', label: '秘密（私密）', type: 'list', help: '不进玩家可见文本' },
  { key: 'knowledge', label: '知识层级', type: 'enum', options: TIERS },
  { key: 'attitude', label: '对玩家的初始信任', type: 'number', min: 0, max: 100 },
  { key: 'map', label: '地图', type: 'ref', refTable: 'maps' },
  { key: 'home', label: '家（地点 ID）', type: 'string' },
  { key: 'work', label: '工作地点（地点 ID）', type: 'string' },
  { key: 'schedule', label: '日程模板或日程段', type: 'json' },
  { key: 'needs', label: '需求权重', type: 'json' },
  { key: 'voice', label: '说话指纹', type: 'json' },
  { key: 'appearance', label: '外观', type: 'json' },
  { key: 'tags', label: '标签', type: 'list' },
  { key: 'core', label: '写定 L1', type: 'boolean' },
  { key: 'plot', label: '剧情相关度', type: 'number', min: 0, max: 1 },
  { key: 'acts', label: '剧情相关的幕', type: 'list' },
  { key: 'potential', label: '隐藏潜质', type: 'string', help: '只有识才之门读得到' },
  { key: 'goddess', label: '信奉', type: 'string' },
  { key: 'devotion', label: '虔诚度', type: 'number', min: 0, max: 1 },
  { key: 'spin', label: '传闻加工方式', type: 'string' },
  { key: 'relations', label: '关系种子', type: 'json' },
  { key: 'requiresFlags', label: '出现所需旗标', type: 'list' },
  { key: 'hideWhen', label: '隐藏条件', type: 'list' },
  { key: 'trustKey', label: '信任旗标名', type: 'string' },
];

export const pack: ContentPack = {
  id: 'npc',
  tables: {
    maps: maps as unknown as MapDef[],
    npcs: personas as unknown as PersonaCard[],
    npcSchedules: schedules as unknown as ScheduleTemplate[],
    npcResidents: residents as unknown as ResidentTemplate[],
    npcKnowledge: knowledge as unknown as KnowledgeEntry[],
  },
  schemas: [
    {
      table: 'maps',
      label: '地图（边石镇、瓦伦堡）',
      file: 'npc/maps.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'rows', label: '地块行', type: 'json' },
        { key: 'legend', label: '图例', type: 'json' },
        { key: 'locations', label: '地点', type: 'json' },
        { key: 'exits', label: '出口', type: 'json' },
        { key: 'style', label: '风格包', type: 'string' },
        { key: 'looks', label: '建筑外观', type: 'json' },
        { key: 'decor', label: '装饰', type: 'json' },
      ],
    },
    {
      table: 'npcs',
      label: 'NPC 人设卡',
      file: 'npc/personas.json',
      idField: 'id',
      nameField: 'name',
      fields: PERSONA_FIELDS,
    },
    {
      table: 'npcSchedules',
      label: '日程模板',
      file: 'npc/schedules.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'segments', label: '时段', type: 'json' },
      ],
    },
    {
      table: 'npcResidents',
      label: '无名居民模板',
      file: 'npc/residents.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'map', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'name', label: '称呼', type: 'string' },
        { key: 'count', label: '人数', type: 'number', min: 0 },
        { key: 'homes', label: '住处', type: 'list' },
        { key: 'works', label: '干活处', type: 'list' },
        { key: 'schedule', label: '日程模板', type: 'ref', refTable: 'npcSchedules' },
        { key: 'palette', label: '配色', type: 'json' },
      ],
    },
    {
      table: 'npcKnowledge',
      label: 'NPC 可说的知识',
      file: 'npc/knowledge.json',
      idField: 'id',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'tier', label: '知识层级', type: 'enum', options: TIERS },
        { key: 'text', label: '内容', type: 'text' },
        { key: 'maps', label: '限定地图', type: 'list' },
        { key: 'factions', label: '限定势力', type: 'list' },
        { key: 'requiresFlags', label: '解锁旗标', type: 'list' },
      ],
    },
  ],
  validate: validateNpcContent,
};
