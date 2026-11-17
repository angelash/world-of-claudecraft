// Mappings of catalog_gathering_crafting.md section 3 (the shared material registry of
// content_bible.md 7, detailed): material rows to item records in data/combat/items.json,
// where the first-round monster materials live. Every material is an ordinary item:
// kind `material`, quality 1 (凡品, content_bible.md 6.3: ordinary materials, no rune).
// The base price column (基准价, Lotha in spring 998) is the item's `value` in copper.
// A taint grade other than 无 (light, medium, heavy) gives the tag `tainted`
// (content_bible.md 7.10). Source zones, uses (recipes), value channels and designer notes
// have no item field yet and stay with the authors; the recipe batches pick up the uses.

import type { CatalogMapping, ColumnRule, Row } from '../catalog/mapping';
import { copper } from '../catalog/parsers';

const CATALOG = 'docs/40_design/content/catalog_gathering_crafting.md';
const TARGET = { file: 'combat/items.json', table: 'items' };
const DEFAULTS = { kind: 'material', quality: 1 };
/** Key order of data/combat/items.json rows (ITEM_FIELDS, then tags). */
const ITEM_ORDER = ['id', 'name', 'kind', 'quality', 'value', 'desc', 'tags'];

const AUTHOR = (column: string, note: string): ColumnRule => ({ column, note });

function taintTags(record: Row, grade: string | undefined): void {
  const g = (grade ?? '').trim();
  if (g === '' || g.startsWith('无')) return;
  record.tags = ['tainted'];
}

/** Section 3.8: the sediment source materials src_<source>_<grade>, all tainted. */
export const dianSources: CatalogMapping = {
  id: 'gathering.dian_sources',
  title: 'sediment source materials (src_) to items',
  catalog: CATALOG,
  section: '3.8',
  headers: ['ID', '名', '档', '典型来源地带', '外观', '去处', '价值', '基准价', '备注'],
  target: TARGET,
  // every source material carries light to heavy taint (catalog 3.8, content_bible 7.10)
  defaults: { ...DEFAULTS, tags: ['tainted'] },
  columns: [
    { column: 'ID', field: 'id', parse: 'code' },
    { column: '名', field: 'name', parse: 'name' },
    { column: '外观', field: 'desc', parse: 'text' },
    { column: '基准价', field: 'value', parse: 'copper' },
    AUTHOR('档', 'the grade is part of the id (src_<source>_<grade>)'),
    AUTHOR('典型来源地带', 'drop sources belong to the bestiary and dungeon batches'),
    AUTHOR('去处', 'uses belong to the recipe batches'),
    AUTHOR('价值', 'value channels have no item field'),
    AUTHOR('备注', 'designer notes; truths stay out of player text'),
  ],
  required: ['id', 'name', 'value', 'desc'],
  fieldOrder: ITEM_ORDER,
};

/**
 * A crystal's base price: an amount, or "收购 <amount>" for the unrefined grey crystals,
 * which no lawful market sells (D-040): their item value is the licensed workshop's
 * purchase price (content_review.md C45: the unrefined shard is worth its 10 copper
 * purchase price). "有价无市", "无价" and the like stay with the author.
 */
export function crystalPrice(cell: string): number | undefined {
  return copper(cell.trim().replace(/^收购\s*/, ''));
}

/**
 * Section 3.7: the sediment crystals by grade, unrefined (`crystal_<grade>_raw`, grey,
 * illegal outside licensed workshops) and refined. The name keeps its parenthesis: the
 * grey grades are named "小晶（灰）" and so on, apart from the refined crystal of the same
 * grade. Legality lives in data/economy/config.json (`illegalItems`), not on the item.
 */
export const crystals: CatalogMapping = {
  id: 'gathering.crystals',
  title: 'sediment crystals by grade (raw and refined) to items',
  catalog: CATALOG,
  section: '3.7',
  headers: ['ID', '名', '阶', '来源', '合法性', '去处', '价值', '基准价', '澱染', '备注'],
  target: TARGET,
  defaults: DEFAULTS,
  columns: [
    { column: 'ID', field: 'id', parse: 'code' },
    { column: '名', field: 'name', parse: 'text' },
    { column: '基准价', field: 'value', parse: crystalPrice },
    AUTHOR('阶', 'tier has no item field; the price band follows it'),
    AUTHOR('来源', 'drops belong to the bestiary and dungeon batches'),
    AUTHOR('合法性', 'unrefined crystals go into data/economy/config.json illegalItems'),
    AUTHOR('去处', 'uses belong to the recipe batches'),
    AUTHOR('价值', 'value channels have no item field'),
    { column: '澱染', derived: true },
    AUTHOR('备注', 'designer notes; the player description is written by the author'),
  ],
  derive: (record, cells) => taintTags(record, cells['澱染']),
  // the table has no description column: the author writes `desc`
  required: ['id', 'name', 'value', 'desc'],
  fieldOrder: ITEM_ORDER,
};

function materialSection(
  section: string,
  nameHeader: string,
  originHeader: string,
): CatalogMapping {
  return {
    id: `gathering.materials_${section.replace('.', '_')}`,
    title: `materials of section ${section} to items`,
    catalog: CATALOG,
    section,
    headers: [
      'ID',
      nameHeader,
      '阶',
      originHeader,
      '采集或加工',
      '去处',
      '价值',
      '基准价',
      '澱染',
      '备注',
    ],
    target: TARGET,
    defaults: DEFAULTS,
    columns: [
      { column: 'ID', field: 'id', parse: 'code' },
      { column: nameHeader, field: 'name', parse: 'name' },
      { column: '基准价', field: 'value', parse: 'copper' },
      AUTHOR('阶', 'tier has no item field; the price band follows it'),
      AUTHOR(originHeader, 'gathering nodes and drops belong to their batches'),
      AUTHOR('采集或加工', 'gathering and processing belong to the profession data'),
      AUTHOR('去处', 'uses belong to the recipe batches'),
      AUTHOR('价值', 'value channels have no item field'),
      { column: '澱染', derived: true },
      AUTHOR('备注', 'designer notes; the player description is written by the author'),
    ],
    derive: (record, cells) => taintTags(record, cells['澱染']),
    // these tables have no description column: the author writes `desc`
    required: ['id', 'name', 'value', 'desc'],
    fieldOrder: ITEM_ORDER,
  };
}

export const MAPPINGS: readonly CatalogMapping[] = [
  materialSection('3.1', '名（凡人称／正式名）', '产地或掉落'),
  materialSection('3.2', '名', '产地'),
  materialSection('3.3', '名', '产地'),
  materialSection('3.4', '名', '产地或掉落'),
  crystals,
  dianSources,
];
