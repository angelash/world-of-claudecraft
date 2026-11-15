// Doors pack: the Thousand Doors of the first playable round (power_system.md 9.9 canon
// doors plus the prologue's past-life doors). Data lives in data/doors/doors.json.

import doors from '../../../data/doors/doors.json';
import type { ContentMap } from '../../core/contracts';
import type { DoorDef, KeyCond } from '../../systems/doors/types';
import type { ContentPack } from '../pack';

const CATEGORIES = [
  'origin',
  'insight',
  'vocation',
  'school',
  'craft',
  'bond',
  'passage',
  'domain',
  'truth',
  'forbidden',
  'last',
];

export const pack: ContentPack = {
  id: 'doors',
  tables: { doors: doors as unknown as DoorDef[] },
  schemas: [
    {
      table: 'doors',
      label: '千门',
      file: 'doors/doors.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true, help: '旗标 door.<ID> 记录已开' },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'code', label: '正典代号', type: 'string' },
        { key: 'category', label: '类别', type: 'enum', options: CATEGORIES },
        { key: 'act', label: '幕次', type: 'number', min: 0, max: 7 },
        { key: 'hint', label: '模糊提示', type: 'text' },
        { key: 'desc', label: '门后', type: 'text' },
        {
          key: 'keys',
          label: '钥',
          type: 'json',
          help: 'flag、count、item、level、visit、door、any（三取二用 need）',
        },
        { key: 'reveal', label: '显影条件', type: 'json' },
        {
          key: 'effects',
          label: '效果',
          type: 'json',
          help: 'abilities、stats、pool、passive、feature、flag、item',
        },
        { key: 'exclusive', label: '互斥组', type: 'json' },
        { key: 'danger', label: '危险之门', type: 'boolean' },
        { key: 'closable', label: '可关闭', type: 'boolean' },
        { key: 'auto', label: '钥齐即开', type: 'boolean' },
        { key: 'autoAfter', label: '可开后自行打开（秒）', type: 'number', min: 0 },
        { key: 'sealLooseness', label: '封印松动增量', type: 'number', min: 0, max: 100 },
        { key: 'sealUnrest', label: '遗迹躁动增量', type: 'number', min: 0, max: 100 },
      ],
    },
  ],
  validate: validateDoors,
};

export function validateDoors(content: ContentMap): string[] {
  const problems: string[] = [];
  const doorIds = new Set((content.doors ?? []).map((d) => d.id));
  const abilityIds = new Set((content.abilities ?? []).map((a) => a.id));
  const auraIds = new Set((content.auras ?? []).map((a) => a.id));
  const itemIds = new Set((content.items ?? []).map((i) => i.id));
  const maps = new Map((content.maps ?? []).map((m) => [m.id, m]));
  const checkKeys = (door: DoorDef, keys: KeyCond[]) => {
    for (const k of keys) {
      if (!k.label) problems.push(`door ${door.id}: key without label`);
      if (k.type === 'item' && !itemIds.has(k.itemId))
        problems.push(`door ${door.id}: unknown item ${k.itemId}`);
      if (k.type === 'door' && !doorIds.has(k.doorId))
        problems.push(`door ${door.id}: unknown door ${k.doorId}`);
      if (k.type === 'count' && k.count < 1) problems.push(`door ${door.id}: count below 1`);
      if (k.type === 'visit' && k.location) {
        const map = maps.get(k.mapId);
        if (map && !map.locations.some((l) => l.id === k.location)) {
          problems.push(`door ${door.id}: map ${k.mapId} has no location ${k.location}`);
        }
      }
      if (k.type === 'any') {
        if ((k.need ?? 1) > k.of.length)
          problems.push(`door ${door.id}: any needs more than it lists`);
        checkKeys(door, k.of);
      }
    }
  };
  for (const door of content.doors ?? []) {
    if (!CATEGORIES.includes(door.category)) problems.push(`door ${door.id}: bad category`);
    if (door.act < 0 || door.act > 7) problems.push(`door ${door.id}: act out of range`);
    if (door.keys.length === 0) problems.push(`door ${door.id}: no keys`);
    if (door.sealLooseness < 0 || door.sealUnrest < 0)
      problems.push(`door ${door.id}: negative seal delta`);
    checkKeys(door, door.keys);
    if (door.reveal) checkKeys(door, door.reveal);
    for (const f of door.effects) {
      if (f.type === 'abilities') {
        for (const a of f.abilities)
          if (!abilityIds.has(a)) problems.push(`door ${door.id}: unknown ability ${a}`);
      }
      if (f.type === 'passive' && !auraIds.has(f.aura))
        problems.push(`door ${door.id}: unknown aura ${f.aura}`);
      if (f.type === 'item' && !itemIds.has(f.itemId))
        problems.push(`door ${door.id}: unknown item ${f.itemId}`);
    }
  }
  return problems;
}
