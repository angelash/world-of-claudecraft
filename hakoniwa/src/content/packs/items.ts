// Items pack: the catalogue item rows imported by act (data/items/; PK-M1-31 the act 1 part,
// the act 2 and 3 parts follow with PK-M2-23). One file per catalogue: the generated T1 base
// ladder of catalog_equipment.md 3.3 (equipment_t1.json, written by
// tools/content/equipment_ladder.ts), the single-listed act 1 equipment, set pieces and nest
// drops (4.1, 4.13, 5.1, 5.3), the consumables and magitools (catalog_consumables_magitools.md
// 3 and 4, the T1 rows), the materials and parts (catalog_gathering_crafting.md 3 and 4, tiers
// 0 and 1), the goods, relics and books of act 1, and the auras those items apply.
// Every item table reuses the inventory pack's ITEM_FIELDS plus the hit-sound classes of
// combat_and_classes.md 19.3 (`weaponClass`, `armorClass`). The validator holds the act 1
// import rules of the instance layer (PK-M1-13) and the crafting kernel (PK-M1-49) on these
// rows: every weapon names its weapon class and every body armour its armour class, every
// piece of equipment carries a wear material, fine and better pieces name their repair
// material, and every tool is an instance with its tool kind and 200 durability.

import auras from '../../../data/items/auras.json';
import consumables from '../../../data/items/consumables_act1.json';
import equipmentAct1 from '../../../data/items/equipment_act1.json';
import equipmentT1 from '../../../data/items/equipment_t1.json';
import goods from '../../../data/items/goods_act1.json';
import materials from '../../../data/items/materials_act1.json';
import type { ContentMap } from '../../core/contracts';
import type { AuraDef } from '../../systems/combat/types';
import type { ItemDef } from '../../systems/inventory';
import type { ContentPack, FieldSchema, TableSchema } from '../pack';
import { ITEM_FIELDS } from './inventory';

/** The weapon classes of combat_and_classes.md 19.3 an item may name (`none` is for spells). */
export const ITEM_WEAPON_CLASSES = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'polearm',
  'staff',
  'rod',
  'fist',
  'bow',
  'crossbow',
  'thrown',
] as const;
export const ITEM_ARMOR_CLASSES = ['cloth', 'leather', 'mail', 'plate'] as const;
/** The wear materials of the instance layer (src/systems/inventory/rules.ts wearMaterial). */
const WEAR_TAGS = ['metal', 'mail', 'plate', 'bone', 'cloth', 'leather', 'wood', 'staff', 'bow'];
/** Body slots whose armour has a class (shields and foci in the off hand have none). */
const BODY_SLOTS = ['head', 'chest', 'legs', 'hands', 'feet'];
/** Durability of every gathering and crafting tool (catalog_consumables_magitools.md 3.15). */
export const TOOL_DURABILITY = 200;

const FIELDS: FieldSchema[] = [
  ...ITEM_FIELDS,
  {
    key: 'weaponClass',
    label: '武器类',
    type: 'enum',
    options: [...ITEM_WEAPON_CLASSES],
    help: '挥动与命中音效、伤害种类（战斗与职能 19.3）',
  },
  {
    key: 'armorClass',
    label: '护甲类',
    type: 'enum',
    options: [...ITEM_ARMOR_CLASSES],
    help: '命中材质（战斗与职能 19.3）',
  },
  { key: 'stack', label: '堆叠上限', type: 'number', min: 1 },
];

const itemSchema = (file: string, label: string): TableSchema => ({
  table: 'items',
  label,
  file: `items/${file}`,
  idField: 'id',
  nameField: 'name',
  fields: FIELDS,
});

const json = (key: string, label: string): FieldSchema => ({ key, label, type: 'json' });

type Row = ItemDef & { weaponClass?: string; armorClass?: string };

const FILES: readonly { file: string; rows: Row[] }[] = [
  { file: 'equipment_t1.json', rows: equipmentT1 as unknown as Row[] },
  { file: 'equipment_act1.json', rows: equipmentAct1 as unknown as Row[] },
  { file: 'consumables_act1.json', rows: consumables as unknown as Row[] },
  { file: 'materials_act1.json', rows: materials as unknown as Row[] },
  { file: 'goods_act1.json', rows: goods as unknown as Row[] },
];

/** Problems of the act 1 import rules on this pack's own rows. */
export function itemRowProblems(content: ContentMap, rows: readonly Row[]): string[] {
  const out: string[] = [];
  const toolKinds = new Set((content.craftingConfig?.tools ?? []).map((t) => t.tag));
  for (const it of rows) {
    const at = `items ${it.id}`;
    if (!it.desc) out.push(`${at}: needs a description`);
    const tags = it.tags ?? [];
    const equipment = it.kind === 'weapon' || it.kind === 'armor' || it.kind === 'trinket';
    if (it.kind === 'weapon') {
      if (!it.weaponClass) out.push(`${at}: a weapon names its weaponClass`);
      if (!it.weapon) out.push(`${at}: a weapon needs its weapon damage`);
    }
    if (it.weaponClass && !(ITEM_WEAPON_CLASSES as readonly string[]).includes(it.weaponClass))
      out.push(`${at}: unknown weaponClass ${it.weaponClass}`);
    if (it.kind === 'armor' && BODY_SLOTS.includes(it.slot ?? '') && !it.armorClass)
      out.push(`${at}: body armour names its armorClass`);
    if (it.armorClass && !(ITEM_ARMOR_CLASSES as readonly string[]).includes(it.armorClass))
      out.push(`${at}: unknown armorClass ${it.armorClass}`);
    if (it.armorClass && !tags.includes(it.armorClass))
      out.push(`${at}: the armour class is also its wear tag ${it.armorClass}`);
    if (equipment && it.kind !== 'trinket' && !tags.some((t) => WEAR_TAGS.includes(t)))
      out.push(`${at}: equipment carries a wear material tag (${WEAR_TAGS.join(', ')})`);
    if (equipment && it.quality >= 3 && it.quality < 5 && !it.repairMaterial)
      out.push(`${at}: fine and better equipment names its repairMaterial`);
    if (equipment && it.level === undefined) out.push(`${at}: equipment needs a level`);
    if (tags.includes('tool')) {
      const kinds = tags.filter((t) => t.startsWith('tool:')).map((t) => t.slice(5));
      if (kinds.length !== 1) out.push(`${at}: a tool names one tool:<kind>`);
      for (const k of kinds)
        if (toolKinds.size > 0 && !toolKinds.has(k)) out.push(`${at}: unknown tool kind ${k}`);
      if (it.durability !== TOOL_DURABILITY)
        out.push(`${at}: a tool has durability ${TOOL_DURABILITY}`);
      if (it.level === undefined) out.push(`${at}: a tool's tier is its level`);
    }
  }
  return out;
}

export function validateItems(content: ContentMap): string[] {
  return itemRowProblems(
    content,
    FILES.flatMap((f) => f.rows),
  );
}

export const pack: ContentPack = {
  id: 'items',
  tables: {
    items: FILES.flatMap((f) => f.rows) as ItemDef[],
    auras: auras as unknown as AuraDef[],
  },
  schemas: [
    itemSchema('equipment_t1.json', '一档基础阶梯（生成）'),
    itemSchema('equipment_act1.json', '第一幕单列装备与套组件'),
    itemSchema('consumables_act1.json', '第一幕消耗品与魔道具'),
    itemSchema('materials_act1.json', '第一幕材料与部件'),
    itemSchema('goods_act1.json', '第一幕商品、遗物与书籍'),
    {
      table: 'auras',
      label: '物品光环',
      file: 'items/auras.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID（aur_）', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        { key: 'kind', label: '类别', type: 'enum', options: ['buff', 'debuff'] },
        { key: 'duration', label: '持续（秒，0 为常驻）', type: 'number', min: 0 },
        { key: 'maxStacks', label: '最大层数', type: 'number', min: 1 },
        json('periodic', '周期伤害或治疗'),
        json('stats', '属性'),
        json('statsPerLevel', '每级属性'),
        json('mods', '修正'),
        json('prevention', '环境累积与灰斑风险预防'),
        { key: 'slow', label: '减速比例', type: 'number', min: 0, max: 1 },
        json('absorb', '吸收盾'),
      ],
    },
  ],
  validate: validateItems,
};
