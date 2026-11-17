// Inventory pack: the same-forge sets (`set_`) and enchants (`ench_`) of the instance
// layer (D-072; catalog_equipment.md 1.5, 5, 6), the editor schema every item table
// reuses, and the cross-pack item validation: triggers in the one `procs` shape, cooldown
// groups, sediment grain, set and enchant references, makers and repair materials.

import enchants from '../../../data/inventory/enchants.json';
import itemSets from '../../../data/inventory/item_sets.json';
import type { ContentMap } from '../../core/contracts';
import { parseProcDo, procProblems } from '../../systems/inventory/procs';
import {
  CONSUMABLE_GROUPS,
  type EnchantDef,
  type ItemSetDef,
  type ProcDef,
} from '../../systems/inventory/types';
import { UNRECORDED } from '../../systems/inventory/workshop';
import type { ContentPack, FieldSchema } from '../pack';

/** Field list for item tables; every pack that contributes items reuses it in its own schema. */
export const ITEM_FIELDS: FieldSchema[] = [
  { key: 'id', label: 'ID', type: 'string', required: true },
  { key: 'name', label: '名称', type: 'string', required: true },
  {
    key: 'kind',
    label: '类别',
    type: 'enum',
    options: [
      'weapon',
      'armor',
      'trinket',
      'consumable',
      'material',
      'goods',
      'key',
      'lore',
      'evidence',
    ],
  },
  { key: 'quality', label: '品质', type: 'number', min: 0, max: 5 },
  { key: 'value', label: '价值（铜）', type: 'number', min: 0 },
  { key: 'desc', label: '描述', type: 'text' },
  { key: 'slot', label: '装备位', type: 'string' },
  { key: 'stats', label: '属性', type: 'json' },
  { key: 'weapon', label: '武器参数', type: 'json' },
  {
    key: 'use',
    label: '使用效果',
    type: 'json',
    help: 'effect、amount、ability、group（冷却组 cd_*）、cooldown（秒）',
  },
  { key: 'level', label: '需求等级', type: 'number', min: 1, max: 60 },
  {
    key: 'procs',
    label: '触发',
    type: 'json',
    help: '[{ on, chance, icd?, when?, do }]，见装备目录 1.5',
  },
  { key: 'set', label: '同炉套组', type: 'ref', refTable: 'itemSets' },
  { key: 'sed', label: '澱纹档', type: 'json', help: '{ grade: light|mid|heavy, purified? }' },
  { key: 'instanced', label: '带实例', type: 'boolean', help: '缺省按类别：装备、工具、鞍具' },
  { key: 'durability', label: '耐久上限', type: 'number', min: 0, help: '缺省按品质；0 为不磨损' },
  { key: 'maker', label: '署名匠人', type: 'string', help: '人物 ID；每件实例都带这个署名' },
  { key: 'recognizes', label: '器意认可的人', type: 'string', help: '人物 ID；在其手中不磨损' },
  { key: 'salvage', label: '碎成', type: 'json', help: '劣品耐久归零时碎成 { itemId, count }' },
  { key: 'repairMaterial', label: '修理主料', type: 'ref', refTable: 'items' },
];

const PROC_FIELDS: FieldSchema[] = [
  { key: 'procs', label: '触发', type: 'json', help: '[{ on, chance, icd?, when?, do }]' },
];

const SED_GRADES = ['light', 'mid', 'heavy'];
const ENCHANT_SLOTS = ['wpn', 'off', 'head', 'chest', 'legs', 'hands', 'feet', 'trk'];

function procsOf(at: string, procs: unknown, auras: Set<string>, out: string[]): void {
  if (procs === undefined) return;
  if (!Array.isArray(procs)) {
    out.push(`${at}: procs is not a list`);
    return;
  }
  procs.forEach((p: ProcDef, i) => {
    for (const m of procProblems(p)) out.push(`${at} procs[${i}]: ${m}`);
    const fx = typeof p?.do === 'string' ? parseProcDo(p.do) : null;
    if (fx?.kind === 'aura' && auras.size > 0 && !auras.has(fx.aura)) {
      out.push(`${at} procs[${i}]: unknown aura ${fx.aura}`);
    }
  });
}

function ids(content: ContentMap, ...tables: string[]): Set<string> {
  const out = new Set<string>();
  const c = content as unknown as Record<string, { id?: string }[] | undefined>;
  for (const t of tables) for (const r of c[t] ?? []) if (r?.id) out.add(r.id);
  return out;
}

export const pack: ContentPack = {
  id: 'inventory',
  tables: {
    items: [],
    itemSets: itemSets as unknown as ItemSetDef[],
    enchants: enchants as unknown as EnchantDef[],
  },
  schemas: [
    {
      table: 'itemSets',
      label: '同炉套组',
      file: 'inventory/item_sets.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID（set_）', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        {
          key: 'bonuses',
          label: '件数效果',
          type: 'json',
          help: '[{ pieces, stats?, procs?, aura? }]',
        },
      ],
    },
    {
      table: 'enchants',
      label: '附纹',
      file: 'inventory/enchants.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID（ench_）', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '描述', type: 'text' },
        {
          key: 'slot',
          label: '槽',
          type: 'enum',
          options: ENCHANT_SLOTS,
        },
        { key: 'tier', label: '档', type: 'number', min: 1, max: 4 },
        { key: 'stats', label: '属性', type: 'json' },
        ...PROC_FIELDS,
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const auras = ids(content, 'auras');
    const items = ids(content, 'items');
    const sets = ids(content, 'itemSets');
    const persons = ids(content, 'npcs', 'companions', 'sceneSpeakers');
    persons.add(UNRECORDED);
    for (const it of content.items) {
      const at = `item ${it.id}`;
      if (it.quality < 0 || it.quality > 5) problems.push(`${at}: quality out of range`);
      if (it.value < 0) problems.push(`${at}: negative value`);
      if ((it.kind === 'weapon' || it.kind === 'armor') && !it.slot)
        problems.push(`${at}: equipment without slot`);
      if (it.use?.group !== undefined && !CONSUMABLE_GROUPS.includes(it.use.group)) {
        problems.push(`${at}: unknown cooldown group ${it.use.group}`);
      }
      // every consumable names its cooldown group (catalog_consumables_magitools.md 2.1)
      if (it.kind === 'consumable' && it.use && it.use.group === undefined) {
        problems.push(`${at}: consumable without a cooldown group`);
      }
      // `Lv×n` reads the item level
      if (it.level === undefined && (it.procs ?? []).some((p) => /Lv[×x*]/.test(p?.do ?? ''))) {
        problems.push(`${at}: Lv amounts on an item without a level`);
      }
      if (it.use?.cooldown !== undefined && !(it.use.cooldown >= 0)) {
        problems.push(`${at}: bad use cooldown`);
      }
      procsOf(at, it.procs, auras, problems);
      if (it.set !== undefined && !sets.has(it.set)) problems.push(`${at}: unknown set ${it.set}`);
      if (it.sed !== undefined && !SED_GRADES.includes(it.sed?.grade)) {
        problems.push(`${at}: bad sed grade`);
      }
      if (it.durability !== undefined && !(Number.isFinite(it.durability) && it.durability >= 0)) {
        problems.push(`${at}: bad durability`);
      }
      for (const k of ['maker', 'recognizes'] as const) {
        const v = it[k];
        if (v !== undefined && persons.size > 1 && !persons.has(v)) {
          problems.push(`${at}: ${k} ${v} is no person`);
        }
      }
      if (it.salvage && !items.has(it.salvage.itemId)) {
        problems.push(`${at}: unknown salvage ${it.salvage.itemId}`);
      }
      if (it.repairMaterial && !items.has(it.repairMaterial)) {
        problems.push(`${at}: unknown repair material ${it.repairMaterial}`);
      }
    }
    for (const s of content.itemSets ?? []) {
      const at = `set ${s.id}`;
      if (!Array.isArray(s.bonuses) || s.bonuses.length === 0) problems.push(`${at}: no bonuses`);
      for (const [i, b] of (s.bonuses ?? []).entries()) {
        if (!(Number.isInteger(b.pieces) && b.pieces >= 1))
          problems.push(`${at} bonus ${i}: bad pieces`);
        procsOf(`${at} bonus ${i}`, b.procs, auras, problems);
        if (b.aura && auras.size > 0 && !auras.has(b.aura)) {
          problems.push(`${at} bonus ${i}: unknown aura ${b.aura}`);
        }
      }
    }
    for (const e of content.enchants ?? []) {
      const at = `enchant ${e.id}`;
      if (!(Number.isInteger(e.tier) && e.tier >= 1 && e.tier <= 4))
        problems.push(`${at}: bad tier`);
      if (!ENCHANT_SLOTS.includes(e.slot)) problems.push(`${at}: bad slot ${String(e.slot)}`);
      procsOf(at, e.procs, auras, problems);
    }
    return problems;
  },
};
