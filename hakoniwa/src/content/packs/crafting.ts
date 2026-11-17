// Crafting pack (PK-M1-49): the kernel's numbers (data/crafting/config.json), gathering nodes
// (`node_`, nodes.json), work stations (`stn_`, stations.json), recipes (`rcp_`,
// recipes.json) and the persons' livelihood skills (crafters.json, the inventory's
// `crafters` table that smiths read for repairs). The validator holds
// catalog_gathering_crafting.md 1 to 3 and 7.1: every place names a built map location,
// every yield and input names an item, station and recipe tiers fit, a masterwork is the
// next quality and never named, the economy invariant (a made item's merchant buyback
// never above its inputs' base value), and every condition parses.

import config from '../../../data/crafting/config.json';
import crafters from '../../../data/crafting/crafters.json';
import nodes from '../../../data/crafting/nodes.json';
import recipes from '../../../data/crafting/recipes.json';
import stations from '../../../data/crafting/stations.json';
import type { ContentMap } from '../../core/contracts';
import { recipeStationTier } from '../../systems/crafting/rules';
import {
  type CraftingConfig,
  type GatherNodeDef,
  NODE_KINDS,
  type Place,
  RECIPE_OPS,
  type RecipeDef,
  STATION_TYPES,
  type StationDef,
} from '../../systems/crafting/types';
import {
  CRAFT_SKILL_CAP,
  type CrafterDef,
  GATHER_PROFESSIONS,
  type ItemDef,
  PROFESSIONS,
} from '../../systems/inventory';
import type { ContentPack, FieldSchema } from '../pack';
import { conditionProblems } from './quests';

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isInt = (v: unknown, lo: number, hi: number): v is number =>
  Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const isChance = (v: unknown): v is number => isNum(v) && v >= 0 && v <= 1;

const PROFESSION_SET: ReadonlySet<string> = new Set(PROFESSIONS);
const EQUIPMENT_KINDS: ReadonlySet<string> = new Set(['weapon', 'armor', 'trinket']);

function configProblems(c: CraftingConfig | undefined, auras: Set<string>): string[] {
  if (!c) return ['craftingConfig: missing'];
  const at = 'craftingConfig';
  const out: string[] = [];
  if (!isInt(c.baseLayer, 0, 6)) out.push(`${at}: baseLayer must be a layer 0..6`);
  for (const [i, r] of (c.layers ?? []).entries()) {
    if (!isInt(r.layer, 0, 6)) out.push(`${at} layers[${i}]: layer must be 0..6`);
    if (!r.when) out.push(`${at} layers[${i}]: needs a when`);
    out.push(...conditionProblems(r.when, `${at} layers[${i}]`));
    for (const p of r.professions ?? [])
      if (!PROFESSION_SET.has(p)) out.push(`${at} layers[${i}]: ${p} is no livelihood`);
  }
  if (!isNum(c.gain) || c.gain <= 0) out.push(`${at}: gain must be above 0`);
  if (
    !Array.isArray(c.gainCurve) ||
    c.gainCurve.length < 2 ||
    !c.gainCurve.every(isChance) ||
    c.gainCurve.some((v, i) => i > 0 && v > (c.gainCurve[i - 1] as number))
  )
    out.push(`${at}: gainCurve must be falling factors 0..1`);
  const w = c.masterwork;
  if (!w) out.push(`${at}: masterwork missing`);
  else {
    for (const k of ['base', 'perTierAbove', 'signed', 'specialization', 'cap'] as const)
      if (!isChance(w[k])) out.push(`${at}: masterwork.${k} must be a chance`);
    for (const [t, v] of Object.entries(w.stationTier ?? {}))
      if (!isInt(Number(t), 1, 4) || !isChance(v))
        out.push(`${at}: masterwork.stationTier ${t} must be a station tier and a chance`);
  }
  if (!isInt(c.maxCraftQuality, 1, 3)) out.push(`${at}: maxCraftQuality must be 1..3`);
  if (
    !Array.isArray(c.stationTiers) ||
    c.stationTiers.length !== 6 ||
    !c.stationTiers.every((t) => isInt(t, 1, 4))
  )
    out.push(`${at}: stationTiers needs a station tier 1..4 for each of T1 to T6`);
  const g = c.gather;
  if (!g) out.push(`${at}: gather missing`);
  else {
    if (!isInt(g.rareOneIn, 0, 100000)) out.push(`${at}: gather.rareOneIn must be a count`);
    if (!isNum(g.rareMultiplier) || g.rareMultiplier < 1)
      out.push(`${at}: gather.rareMultiplier must be 1 or more`);
    if (
      !Array.isArray(g.refreshDays) ||
      g.refreshDays.length !== 6 ||
      !g.refreshDays.every((d) => isNum(d) && d >= 0)
    )
      out.push(`${at}: gather.refreshDays needs days for each of T1 to T6`);
    if (!isNum(g.reach) || g.reach < 0) out.push(`${at}: gather.reach must be tiles 0 or more`);
  }
  if (!isInt(c.throttle?.count, 1, 1000) || !isNum(c.throttle?.minutes) || c.throttle.minutes <= 0)
    out.push(`${at}: throttle needs a count and minutes above 0`);
  if (!isInt(c.maxRuns, 1, 1000)) out.push(`${at}: maxRuns must be 1 or more`);
  const tags = new Set<string>();
  for (const [i, t] of (c.tools ?? []).entries()) {
    if (!/^[a-z][a-z0-9_]*$/.test(t.tag ?? '')) out.push(`${at} tools[${i}]: bad tag`);
    if (tags.has(t.tag)) out.push(`${at} tools[${i}]: duplicate tag ${t.tag}`);
    tags.add(t.tag);
    if (!Array.isArray(t.professions) || t.professions.length === 0)
      out.push(`${at} tools[${i}]: needs livelihoods`);
    for (const p of t.professions ?? [])
      if (!PROFESSION_SET.has(p)) out.push(`${at} tools[${i}]: ${p} is no livelihood`);
  }
  if (!isNum(c.toolWear) || c.toolWear < 0) out.push(`${at}: toolWear must be 0 or more`);
  const d = c.drunk;
  if (!d || !isInt(d.max, 1, 100) || !isInt(d.decayPerHour, 1, 100) || !isNum(d.soberMinutes))
    out.push(`${at}: drunk needs max, decayPerHour and soberMinutes`);
  if (d?.aura !== undefined && auras.size > 0 && !auras.has(d.aura))
    out.push(`${at}: drunk.aura ${d.aura} is no aura`);
  return out;
}

function placeProblems(content: ContentMap, at: string, places: unknown): string[] {
  if (!Array.isArray(places)) return [`${at}: places is not a list`];
  const out: string[] = [];
  for (const [i, p] of (places as Place[]).entries()) {
    const map = (content.maps ?? []).find((m) => m.id === p?.mapId);
    if (!map) out.push(`${at} places[${i}]: unknown map ${String(p?.mapId)}`);
    else if (!map.locations.some((l) => l.id === p.location))
      out.push(`${at} places[${i}]: map ${p.mapId} has no location ${String(p.location)}`);
  }
  return out;
}

function nodeProblems(content: ContentMap, items: Set<string>): string[] {
  const out: string[] = [];
  for (const n of content.gatherNodes ?? []) {
    const at = `gatherNodes ${n.id}`;
    if (!n.name) out.push(`${at}: needs a name`);
    if (!NODE_KINDS.includes(n.kind)) out.push(`${at}: bad kind ${String(n.kind)}`);
    if (n.kind === 'special' && !GATHER_PROFESSIONS.includes(n.profession as never))
      out.push(`${at}: a special node names its gathering livelihood`);
    if (n.kind !== 'special' && n.profession !== undefined)
      out.push(`${at}: only a special node names a livelihood`);
    if (!isInt(n.tier, 1, 6)) out.push(`${at}: tier must be 1..6`);
    if (!Array.isArray(n.yields) || n.yields.length === 0) out.push(`${at}: needs yields`);
    for (const [i, y] of (n.yields ?? []).entries()) {
      if (!items.has(y.itemId)) out.push(`${at} yields[${i}]: unknown item ${y.itemId}`);
      const c = y.count;
      const okCount = Array.isArray(c)
        ? c.length === 2 && isInt(c[0], 1, 999) && isInt(c[1], c[0] as number, 999)
        : isInt(c, 1, 999);
      if (!okCount) out.push(`${at} yields[${i}]: count must be 1 or more, or a [min, max] range`);
      if (y.chance !== undefined && !isChance(y.chance))
        out.push(`${at} yields[${i}]: chance must be 0..1`);
    }
    out.push(...placeProblems(content, at, n.places));
    if (n.refreshDays !== undefined && !(isNum(n.refreshDays) && n.refreshDays >= 0))
      out.push(`${at}: refreshDays must be 0 or more`);
    if (n.uses !== undefined && !isInt(n.uses, 1, 1000)) out.push(`${at}: uses must be 1 or more`);
    if (n.taint !== undefined && !isInt(n.taint, 0, 3)) out.push(`${at}: taint must be 0..3`);
    // T6 places give once (1.3, 6.12)
    if (n.tier === 6 && n.uses === undefined) out.push(`${at}: a T6 node names its uses`);
    out.push(...conditionProblems(n.when, at));
  }
  return out;
}

function stationProblems(content: ContentMap): string[] {
  const out: string[] = [];
  for (const s of content.craftStations ?? []) {
    const at = `craftStations ${s.id}`;
    if (!s.name) out.push(`${at}: needs a name`);
    if (!STATION_TYPES.includes(s.type)) out.push(`${at}: bad type ${String(s.type)}`);
    if (!isInt(s.tier, 1, 4)) out.push(`${at}: tier must be 1..4`);
    // grain binding needs a steady supply of spirit: no tier-one grain table (2.4)
    if (s.type === 'grain_table' && s.tier < 2) out.push(`${at}: a grain table starts at tier 2`);
    out.push(...placeProblems(content, at, s.places));
    out.push(...conditionProblems(s.when, at));
    if (s.repair !== undefined && !isInt(s.repair?.skill, 0, CRAFT_SKILL_CAP))
      out.push(`${at}: repair.skill must be 0..${CRAFT_SKILL_CAP}`);
  }
  return out;
}

function recipeProblems(content: ContentMap, items: Map<string, ItemDef>): string[] {
  const out: string[] = [];
  const cfg = content.craftingConfig;
  const enchants = new Set((content.enchants ?? []).map((e) => e.id));
  const buyback = Math.max(0, ...(content.markets ?? []).map((m) => m.buybackRate ?? 0));
  for (const r of content.recipes ?? []) {
    const at = `recipes ${r.id}`;
    if (!r.name) out.push(`${at}: needs a name`);
    if (!PROFESSION_SET.has(r.profession)) out.push(`${at}: ${r.profession} is no livelihood`);
    if (!isInt(r.tier, 1, 6)) out.push(`${at}: tier must be 1..6`);
    if (r.skill !== undefined && !isInt(r.skill, 0, CRAFT_SKILL_CAP))
      out.push(`${at}: skill must be 0..${CRAFT_SKILL_CAP}`);
    if (!STATION_TYPES.includes(r.station)) out.push(`${at}: bad station ${String(r.station)}`);
    if (r.stationTier !== undefined && !isInt(r.stationTier, 1, 4))
      out.push(`${at}: stationTier must be 1..4`);
    if (!Array.isArray(r.inputs) || r.inputs.length === 0) out.push(`${at}: needs inputs`);
    let inputValue = 0;
    for (const [i, inp] of (r.inputs ?? []).entries()) {
      const ids = [inp.itemId, ...(inp.alt ?? [])];
      for (const id of ids) if (!items.has(id)) out.push(`${at} inputs[${i}]: unknown item ${id}`);
      if (!isInt(inp.count, 1, 999)) out.push(`${at} inputs[${i}]: count must be 1 or more`);
      const cheapest = Math.min(...ids.map((id) => items.get(id)?.value ?? 0));
      inputValue += cheapest * (inp.count ?? 0);
    }
    const op = r.op ?? 'make';
    if (!RECIPE_OPS.includes(op)) out.push(`${at}: bad op ${String(op)}`);
    if (op === 'make') {
      const outDef = r.output ? items.get(r.output.itemId) : undefined;
      if (!outDef) out.push(`${at}: make needs a known output item`);
      if (r.output?.count !== undefined && !isInt(r.output.count, 1, 999))
        out.push(`${at}: output count must be 1 or more`);
      const mw = r.masterwork ? items.get(r.masterwork.itemId) : undefined;
      if (r.masterwork && !mw) out.push(`${at}: unknown masterwork item ${r.masterwork.itemId}`);
      if (mw && outDef && mw.quality !== outDef.quality + 1)
        out.push(`${at}: the masterwork item must be one quality above the output`);
      if (cfg && mw && mw.quality > cfg.maxCraftQuality)
        out.push(`${at}: the masterwork item is above the quality crafting makes`);
      if (cfg && outDef && outDef.quality > cfg.maxCraftQuality)
        out.push(`${at}: the output is above the quality crafting makes`);
      // equipment needs the station of its quality (catalog_equipment 2.3: good two, fine three)
      // and a masterwork one quality up (2.6) while crafting can still make it
      if (cfg && outDef && EQUIPMENT_KINDS.has(outDef.kind)) {
        const need = Math.max(1, outDef.quality);
        if (recipeStationTier(r, cfg) < need)
          out.push(
            `${at}: ${outDef.id} of quality ${outDef.quality} needs a station of tier ${need}`,
          );
        if (outDef.quality >= 1 && outDef.quality < cfg.maxCraftQuality && !r.masterwork)
          out.push(`${at}: equipment below the top crafted quality names its masterwork item`);
      }
      let byValue = 0;
      for (const [i, b] of (r.byproducts ?? []).entries()) {
        const bd = items.get(b.itemId);
        if (!bd) out.push(`${at} byproducts[${i}]: unknown item ${b.itemId}`);
        if (b.count !== undefined && !isInt(b.count, 1, 999))
          out.push(`${at} byproducts[${i}]: count must be 1 or more`);
        byValue += (bd?.value ?? 0) * (b.count ?? 1);
      }
      // the economy invariant (3 intro, 7.1): the buyback of what comes out never above the inputs
      for (const made of [r.output, r.masterwork]) {
        const def = made ? items.get(made.itemId) : undefined;
        const n = made?.count ?? r.output?.count ?? 1;
        if (def && buyback > 0 && (def.value * n + byValue) * buyback > inputValue + 1e-9)
          out.push(`${at}: ${def.id} buys back above its inputs' value`);
      }
    } else {
      if (r.output || r.masterwork || r.byproducts) out.push(`${at}: ${op} makes no item`);
      if (op === 'refine' && !isInt(r.level, 1, 4)) out.push(`${at}: refine needs a level 1..4`);
      if (op === 'enchant' && !enchants.has(r.enchant ?? ''))
        out.push(`${at}: unknown enchant ${String(r.enchant)}`);
    }
    if (r.fee !== undefined && !(isNum(r.fee) && r.fee >= 0))
      out.push(`${at}: fee must be 0 or more`);
    out.push(...conditionProblems(r.requires, at));
  }
  return out;
}

function crafterProblems(content: ContentMap): string[] {
  const out: string[] = [];
  const persons = new Set(
    [...(content.npcs ?? []), ...(content.companions ?? [])].map((p) => (p as { id: string }).id),
  );
  for (const c of content.crafters ?? []) {
    const at = `crafters ${c.id}`;
    if (persons.size > 0 && !persons.has(c.id)) out.push(`${at}: no such person`);
    for (const [p, v] of Object.entries(c.skills ?? {})) {
      if (!PROFESSION_SET.has(p)) out.push(`${at}: ${p} is no livelihood`);
      else if (!isInt(v, 0, CRAFT_SKILL_CAP)) out.push(`${at}: ${p} must be 0..${CRAFT_SKILL_CAP}`);
    }
  }
  return out;
}

export function validateCrafting(content: ContentMap): string[] {
  const items = new Map((content.items ?? []).map((i) => [i.id, i]));
  return [
    ...configProblems(content.craftingConfig, new Set((content.auras ?? []).map((a) => a.id))),
    ...nodeProblems(content, new Set(items.keys())),
    ...stationProblems(content),
    ...recipeProblems(content, items),
    ...crafterProblems(content),
  ];
}

const PLACES_FIELD: FieldSchema = {
  key: 'places',
  label: '位置',
  type: 'json',
  help: '[{ mapId, location }]：地图与地点（地图文件属地图包）',
};

export const pack: ContentPack = {
  id: 'crafting',
  tables: {
    craftingConfig: config as unknown as CraftingConfig,
    gatherNodes: nodes as unknown as GatherNodeDef[],
    craftStations: stations as unknown as StationDef[],
    recipes: recipes as unknown as RecipeDef[],
    crafters: crafters as unknown as CrafterDef[],
  },
  schemas: [
    {
      table: 'gatherNodes',
      label: '采集点',
      file: 'crafting/nodes.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID（node_）', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        { key: 'kind', label: '类', type: 'enum', options: [...NODE_KINDS] },
        {
          key: 'profession',
          label: '生业',
          type: 'enum',
          options: [...GATHER_PROFESSIONS],
          help: '只有特殊点写',
        },
        { key: 'tier', label: '阶', type: 'number', min: 1, max: 6 },
        {
          key: 'yields',
          label: '产出',
          type: 'json',
          help: '[{ itemId, count | [min, max], chance? }]',
        },
        PLACES_FIELD,
        {
          key: 'refreshDays',
          label: '刷新（日）',
          type: 'number',
          min: 0,
          help: '缺省按阶；0 为只随事件',
        },
        { key: 'uses', label: '可采次数', type: 'number', min: 1, help: '缺省不限' },
        { key: 'when', label: '可采条件', type: 'string' },
        { key: 'taint', label: '澱染档', type: 'number', min: 0, max: 3, help: '缺省按地点澱度' },
      ],
    },
    {
      table: 'craftStations',
      label: '工站',
      file: 'crafting/stations.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID（stn_）', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        { key: 'type', label: '类', type: 'enum', options: [...STATION_TYPES] },
        { key: 'tier', label: '档', type: 'number', min: 1, max: 4 },
        PLACES_FIELD,
        { key: 'when', label: '可用条件', type: 'string' },
        { key: 'repair', label: '修理', type: 'json', help: '{ skill, master?, t6? }' },
      ],
    },
    {
      table: 'recipes',
      label: '配方',
      file: 'crafting/recipes.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID（rcp_）', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        { key: 'family', label: '配方族', type: 'string' },
        { key: 'profession', label: '生业', type: 'enum', options: [...PROFESSIONS] },
        { key: 'tier', label: '阶', type: 'number', min: 1, max: 6 },
        { key: 'skill', label: '需求技能', type: 'number', min: 0, max: CRAFT_SKILL_CAP },
        { key: 'station', label: '工站', type: 'enum', options: [...STATION_TYPES] },
        { key: 'stationTier', label: '工站档', type: 'number', min: 1, max: 4 },
        { key: 'inputs', label: '投入', type: 'json', help: '[{ itemId, count, alt?, main? }]' },
        { key: 'op', label: '做法', type: 'enum', options: [...RECIPE_OPS] },
        { key: 'output', label: '产出', type: 'json', help: '{ itemId, count? }' },
        {
          key: 'masterwork',
          label: '杰作产出',
          type: 'json',
          help: '{ itemId, count? }：高一档品质',
        },
        { key: 'level', label: '精炼级', type: 'number', min: 1, max: 4 },
        { key: 'enchant', label: '附纹', type: 'ref', refTable: 'enchants' },
        { key: 'fee', label: '工站费（铜）', type: 'number', min: 0 },
        { key: 'requires', label: '学会条件', type: 'string' },
      ],
    },
    {
      table: 'crafters',
      label: '匠人技能',
      file: 'crafting/crafters.json',
      idField: 'id',
      fields: [
        { key: 'id', label: '人物 ID', type: 'string', required: true },
        { key: 'skills', label: '生业技能', type: 'json', help: '{ 生业: 0 到 150 }' },
        { key: 'master', label: '名匠', type: 'boolean' },
      ],
    },
  ],
  validate: validateCrafting,
};
