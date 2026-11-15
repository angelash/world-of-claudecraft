// Party pack: companions who can join the player (the servant Yeyu, Shiya, Ron, Nera,
// and granny Oola as a healer). Data lives in data/party/companions.json.

import companions from '../../../data/party/companions.json';
import type { ContentMap } from '../../core/contracts';
import type { CompanionDef } from '../../systems/party/types';
import type { ContentPack } from '../pack';

export const pack: ContentPack = {
  id: 'party',
  tables: { companions: companions as unknown as CompanionDef[] },
  schemas: [
    {
      table: 'companions',
      label: '同伴',
      file: 'party/companions.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        {
          key: 'id',
          label: 'ID',
          type: 'string',
          required: true,
          help: '旗标 companion.<ID>.recruited 为真时加入',
        },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'title', label: '一句话', type: 'string' },
        { key: 'classId', label: '职能', type: 'ref', refTable: 'classes' },
        {
          key: 'role',
          label: '定位',
          type: 'enum',
          options: ['tank', 'healer', 'melee', 'ranged', 'caster'],
        },
        { key: 'level', label: '初始等级', type: 'number', min: 1, max: 60 },
        { key: 'levelOffset', label: '相对玩家的等级差', type: 'number', min: -10, max: 10 },
        { key: 'personality', label: '性格标签', type: 'json' },
        { key: 'appearance', label: '外观', type: 'json' },
        { key: 'likes', label: '喜好（送礼）', type: 'json' },
        { key: 'bondFlags', label: '加深羁绊的剧情旗标', type: 'json' },
      ],
    },
  ],
  validate(content: ContentMap) {
    const problems: string[] = [];
    const classes = new Set((content.classes ?? []).map((c) => c.id));
    const abilities = new Set((content.abilities ?? []).map((a) => a.id));
    for (const c of content.companions ?? []) {
      if (!classes.has(c.classId)) problems.push(`companion ${c.id}: unknown class ${c.classId}`);
      if (c.level < 1 || c.level > 60) problems.push(`companion ${c.id}: level out of range`);
      for (const a of c.avoid ?? [])
        if (!abilities.has(a)) problems.push(`companion ${c.id}: unknown ability ${a}`);
    }
    return problems;
  },
};
