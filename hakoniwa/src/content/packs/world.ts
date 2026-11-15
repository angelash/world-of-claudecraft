// World pack: the core test map and the fallback start position. Story packs declare
// their own maps and a higher-priority start (see systems/world WorldStart).

import testMaps from '../../../data/world/maps_test.json';
import { lookProblems, type WorldStart } from '../../systems/world';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack } from '../pack';

const worldStarts: WorldStart[] = [{ mapId: 'testfield', x: 2.5, y: 1.5, priority: 0 }];

export const pack: ContentPack = {
  id: 'world',
  tables: { maps: testMaps as MapDef[], worldStarts },
  schemas: [
    {
      table: 'maps',
      label: '地图',
      file: 'world/maps_test.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'region', label: '区域', type: 'string' },
        { key: 'width', label: '宽', type: 'number', min: 1 },
        { key: 'height', label: '高', type: 'number', min: 1 },
        { key: 'rows', label: '地块行', type: 'json' },
        { key: 'legend', label: '图例', type: 'json' },
        { key: 'locations', label: '地点', type: 'json' },
        { key: 'spawns', label: '出生点', type: 'json' },
        { key: 'exits', label: '出口', type: 'json' },
        { key: 'style', label: '风格包', type: 'string' },
        { key: 'looks', label: '建筑外观', type: 'json' },
        { key: 'decor', label: '装饰', type: 'json' },
      ],
    },
  ],
  validate(content) {
    const problems: string[] = [];
    const ids = new Set(content.maps.map((m) => m.id));
    for (const m of content.maps) {
      if (m.rows.length !== m.height)
        problems.push(`map ${m.id}: rows ${m.rows.length} != height ${m.height}`);
      m.rows.forEach((r, i) => {
        if (r.length !== m.width)
          problems.push(`map ${m.id}: row ${i} width ${r.length} != ${m.width}`);
        for (const ch of r)
          if (!(ch in m.legend)) problems.push(`map ${m.id}: row ${i} unknown tile '${ch}'`);
      });
      for (const x of m.exits)
        if (!ids.has(x.toMap)) problems.push(`map ${m.id}: exit ${x.id} -> unknown map ${x.toMap}`);
      problems.push(...lookProblems(m));
    }
    for (const s of content.worldStarts)
      if (!ids.has(s.mapId)) problems.push(`worldStart -> unknown map ${s.mapId}`);
    return problems;
  },
};
