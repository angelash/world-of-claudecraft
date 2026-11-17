// Mappings of catalog_abilities_talents.md (the own ability and aura numbering, D-071 and
// RE-27) for the content_act1_abilities_01 batch: the act 1 equipment aura (section 3.3),
// the contract fiend of the act 1 abyss pact door with its skills (section 4.5) and the
// state auras of death and revival (section 7.3). Mapped: the id, the display name, the AI
// use of a skill, and the data fields a row spells out as `path: value` code spans (the
// 数据字段 column of 3.3). Effects, targets, numbers and descriptions are mechanical
// fields the author fills from the effect columns; the renumbering of the existing rows is
// not an import (it renames ids in place and registers them in data/registry/renames.json).

import type { CatalogMapping, ColumnRule, Row } from '../catalog/mapping';

const CATALOG = 'docs/40_design/content/catalog_abilities_talents.md';
const AURAS = { file: 'combat/auras.json', table: 'auras' };
const ABILITIES = { file: 'combat/abilities.json', table: 'abilities' };
const MONSTERS = { file: 'combat/monsters.json', table: 'monsters' };

/** Key order of the data files (the kernel types' field order). */
const AURA_ORDER = ['id', 'name', 'desc', 'kind', 'duration', 'maxStacks', 'mods', 'dispellable'];
const ABILITY_ORDER = ['id', 'name', 'desc', 'target', 'range', 'radius', 'school'];
const MONSTER_ORDER = ['id', 'name', 'desc', 'family', 'faction', 'minLevel', 'maxLevel'];

const AUTHOR = (column: string, note: string): ColumnRule => ({ column, note });

function setPath(target: Row, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = target;
  for (const p of parts.slice(0, -1)) {
    const next = cur[p];
    if (!next || typeof next !== 'object' || Array.isArray(next)) cur[p] = {};
    cur = cur[p] as Row;
  }
  cur[parts[parts.length - 1] as string] = value;
}

/**
 * The `path: value` code spans of a cell: "`kind: buff`、`mods.damageTaken: -0.5`" gives
 * { kind: 'buff', mods: { damageTaken: -0.5 } }. Numbers and booleans are typed, the rest
 * stays text; a span that is not `path: value` is skipped (the author reads the cell).
 */
export function dataFields(cell: string): Row {
  const out: Row = {};
  for (const m of cell.matchAll(/`([A-Za-z][A-Za-z0-9.]*):\s*([^`]+)`/g)) {
    const raw = (m[2] as string).trim();
    let value: unknown = raw;
    if (raw === 'true' || raw === 'false') value = raw === 'true';
    else if (/^-?[0-9]+(\.[0-9]+)?$/.test(raw)) value = Number(raw);
    setPath(out, m[1] as string, value);
  }
  return out;
}

/** Section 3.3: the equipment aura keys of act 1, registered as aur_<key>. */
export const equipmentAuras: CatalogMapping = {
  id: 'abilities.equipment_auras',
  title: 'act 1 equipment auras (aur_<key>) to auras',
  catalog: CATALOG,
  section: '3.3',
  headers: ['新 ID', '新名', '光环键', '施加来源', '效果', '数据字段'],
  target: AURAS,
  columns: [
    { column: '新 ID', field: 'id', parse: 'code' },
    { column: '新名', field: 'name', parse: 'name' },
    { column: '数据字段', derived: true },
    AUTHOR('光环键', 'the key is the id without aur_ (catalog_equipment.md 11.2 item 4)'),
    AUTHOR('施加来源', 'the set proc lives on the set items (procs), not on the aura'),
    AUTHOR('效果', 'prose of the data fields; the description is the author'),
  ],
  derive: (record, cells) => {
    Object.assign(record, dataFields(cells.数据字段 ?? ''));
  },
  required: ['id', 'name', 'desc', 'kind', 'duration'],
  fieldOrder: AURA_ORDER,
};

/** Section 4.5: the contract fiend's combat template (a monster template plus `pet`). */
export const fiendTemplates: CatalogMapping = {
  id: 'abilities.fiend_templates',
  title: 'act 1 contract fiend templates (fiend_) to monsters',
  catalog: CATALOG,
  section: '4.5',
  headers: ['ID', '名', '模板来源', '族群与势力', '等级', '倍率', '移动与警戒', '技能'],
  target: MONSTERS,
  columns: [
    { column: 'ID', field: 'id', parse: 'code' },
    { column: '名', field: 'name', parse: 'name' },
    AUTHOR('模板来源', 'design lineage, no field'),
    AUTHOR('族群与势力', 'family and faction'),
    AUTHOR('等级', 'minLevel and maxLevel (the fiend follows its caster)'),
    AUTHOR('倍率', 'hpMult, dmgMult, armorMult'),
    AUTHOR('移动与警戒', 'speed, aggroRadius, leash'),
    AUTHOR('技能', 'the abilities list'),
  ],
  required: [
    'id',
    'name',
    'desc',
    'family',
    'faction',
    'minLevel',
    'maxLevel',
    'aggroRadius',
    'leash',
    'appearance',
  ],
  fieldOrder: MONSTER_ORDER,
};

/** Section 4.5: the summon skill and the fiend's own skills. */
export const fiendSkills: CatalogMapping = {
  id: 'abilities.fiend_skills',
  title: 'act 1 contract fiend skills (sk_) to abilities',
  catalog: CATALOG,
  section: '4.5',
  headers: ['新 ID', '新名', '使用者', '效果摘要', 'AI 用法'],
  target: ABILITIES,
  columns: [
    { column: '新 ID', field: 'id', parse: 'code' },
    { column: '新名', field: 'name', parse: 'name' },
    { column: 'AI 用法', field: 'ai', parse: 'code' },
    AUTHOR('使用者', 'who holds it: the door grant or the fiend template'),
    AUTHOR('效果摘要', 'target, range, cost, cooldown and effects'),
  ],
  required: ['id', 'name', 'desc', 'target', 'effects'],
  fieldOrder: ABILITY_ORDER,
};

/** Section 7.3: the state auras of death and revival that are new (no current data id). */
export const deathStateAuras: CatalogMapping = {
  id: 'abilities.state_auras_death',
  title: 'state auras of death and revival (aur_st_) to auras',
  catalog: CATALOG,
  section: '7.3',
  headers: ['新 ID', '新名', '现行数据 ID', '去向', '效果（数值来源）'],
  target: AURAS,
  columns: [
    { column: '新 ID', field: 'id', parse: 'code' },
    { column: '新名', field: 'name', parse: 'name' },
    AUTHOR('现行数据 ID', 'renamed rows are in data already; only new rows are imported'),
    AUTHOR('去向', 'renamed or new'),
    AUTHOR('效果（数值来源）', 'kind, duration and mods from the combat document section'),
  ],
  required: ['id', 'name', 'desc', 'kind', 'duration'],
  fieldOrder: AURA_ORDER,
};

export const MAPPINGS: readonly CatalogMapping[] = [
  equipmentAuras,
  fiendTemplates,
  fiendSkills,
  deathStateAuras,
];
