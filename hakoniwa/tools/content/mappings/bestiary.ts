// Mappings of catalog_bestiary.md section 4 (the regional bestiary tables, all with the
// header of section 1.2) to monster records in data/combat/monsters.json, for the
// content_act1_bestiary_01 batch and its successors. Mapped: id, name (the formal name;
// the mortal name in parentheses stays with the authors and the D-030 name switch), the
// kernel family and layer (N plain, E elite, R rare, B boss), the level range, the act of
// first appearance, and the drops with their chances (晶1 to 晶5 are the crystal ids of
// section 1.2). Mechanics, values, mortal misreadings and truths stay with the authors:
// the mechanics column mixes kernel fields with new ones (section 9) and the rest is prose.
// Movement and aggro numbers are mechanical fields the author fills (no column).

import type { CatalogMapping, ColumnRule, Row } from '../catalog/mapping';
import { plain } from '../catalog/parsers';

const CATALOG = 'docs/40_design/content/catalog_bestiary.md';

const LAYER: Readonly<Record<string, string | undefined>> = {
  N: undefined,
  E: 'elite',
  R: 'rare',
  B: 'boss',
};

/** Crystal shorthand of section 1.2. */
const CRYSTAL: Readonly<Record<string, string>> = {
  晶1: 'dian_shard',
  晶2: 'crystal_small_raw',
  晶3: 'crystal_medium_raw',
  晶4: 'crystal_large_raw',
  晶5: 'crystal_king_raw',
};

const NUMERALS: Readonly<Record<string, number>> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

/** "1到3" is [1, 3], "21" is [21, 21]. */
export function levels(cell: string): [number, number] | undefined {
  const m = /^([0-9]+)(?:\s*到\s*([0-9]+))?$/.exec(plain(cell));
  if (!m) return undefined;
  return [Number(m[1]), Number(m[2] ?? m[1])];
}

/** "beast N" is { family: beast }, "beast E" adds rank elite; "humanoid N（混族）" too. */
export function familyLayer(cell: string): { family: string; rank?: string } | undefined {
  const m = /^([a-z]+)\s+([NERB])\b/.exec(plain(cell));
  if (!m) return undefined;
  const rank = LAYER[m[2] as string];
  return rank ? { family: m[1] as string, rank } : { family: m[1] as string };
}

/** First act of the place column: "（一）", "（一到二）", "（二，支线 ...）" give act1, act1, act2. */
export function firstAct(cell: string): string | undefined {
  const m = /（([一二三四五六])/.exec(cell);
  const n = m ? NUMERALS[m[1] as string] : undefined;
  return n ? `act${n}` : undefined;
}

/**
 * Drops: "`hide` 70%、晶1 40%" to loot entries. Only a cell whose every entry is an id (or
 * 晶N) with one plain percentage is mapped; a cell with counts, upgrades or notes
 * ("两份", "10% 升晶3", "随身：") goes to the author whole.
 */
export function loot(cell: string): { itemId: string; chance: number }[] | undefined {
  const out: { itemId: string; chance: number }[] = [];
  for (const raw of cell.split(/[、，]/)) {
    const part = raw.trim();
    if (part === '') continue;
    const m = /^(?:`([a-z][a-z0-9_]*)`|(晶[1-5]))\s*([0-9]+)\s*%$/.exec(part);
    if (!m) return undefined;
    const id = m[1] ?? CRYSTAL[m[2] as string];
    if (!id) return undefined;
    out.push({ itemId: id, chance: Number(m[3]) / 100 });
  }
  return out.length ? out : undefined;
}

const AUTHOR = (column: string, note: string): ColumnRule => ({ column, note });

const HEADERS = [
  'ID',
  '名（俗称）',
  '三元组',
  '族·层',
  'Lv',
  '地点（幕）',
  '机制',
  '掉落',
  '价值',
  '凡人误读',
  '真相线索',
];

function regionMapping(section: string, region: string): CatalogMapping {
  return {
    id: `bestiary.${region}`,
    title: `bestiary of section ${section} (${region}) to monsters`,
    catalog: CATALOG,
    section,
    headers: HEADERS,
    target: { file: 'combat/monsters.json', table: 'monsters' },
    // every bestiary row is a hostile of the monster faction (catalog 1.1)
    defaults: { faction: 'monster' },
    columns: [
      { column: 'ID', field: 'id', parse: 'code' },
      { column: '名（俗称）', field: 'name', parse: 'name' },
      { column: '地点（幕）', field: 'act', parse: firstAct },
      { column: '掉落', field: 'loot', parse: loot },
      { column: '族·层', derived: true },
      { column: 'Lv', derived: true },
      AUTHOR('三元组', 'triad drives art and drops; no monster field yet'),
      AUTHOR('机制', 'kernel fields mixed with new mechanics (catalog 9)'),
      AUTHOR('价值', 'value channels have no monster field'),
      AUTHOR('凡人误读', 'mortal misreading: NPC knowledge, not the description'),
      AUTHOR('真相线索', 'designer truth notes'),
    ],
    derive: (record: Row, cells) => {
      const fl = familyLayer(cells['族·层'] ?? '');
      if (fl) Object.assign(record, fl);
      const lv = levels(cells.Lv ?? '');
      if (lv) [record.minLevel, record.maxLevel] = lv;
    },
    required: ['id', 'name', 'desc', 'family', 'minLevel', 'maxLevel', 'aggroRadius', 'leash'],
  };
}

export const MAPPINGS: readonly CatalogMapping[] = [
  regionMapping('4.1', 'lotha'),
  regionMapping('4.2', 'waste'),
  regionMapping('4.3', 'holysee'),
  regionMapping('4.4', 'grantia'),
  regionMapping('4.5', 'mercato'),
  regionMapping('4.6', 'silva'),
  regionMapping('4.7', 'windfang'),
  regionMapping('4.8', 'night'),
  regionMapping('4.9', 'sleepscale'),
];
