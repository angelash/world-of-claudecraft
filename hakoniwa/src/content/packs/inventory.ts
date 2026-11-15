// Inventory pack: no items of its own (other packs contribute to `items`), but it owns
// the editor schema and the cross-pack item validation.

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
  { key: 'use', label: '使用效果', type: 'json' },
  { key: 'level', label: '需求等级', type: 'number', min: 1, max: 60 },
];

export const pack: ContentPack = {
  id: 'inventory',
  tables: { items: [] },
  validate(content) {
    const problems: string[] = [];
    for (const it of content.items) {
      if (it.quality < 0 || it.quality > 5) problems.push(`item ${it.id}: quality out of range`);
      if (it.value < 0) problems.push(`item ${it.id}: negative value`);
      if ((it.kind === 'weapon' || it.kind === 'armor') && !it.slot)
        problems.push(`item ${it.id}: equipment without slot`);
    }
    return problems;
  },
};
