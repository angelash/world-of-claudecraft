// Party pack: companions who can join the player (the servant Yeyu, Shiya, Ron, Nera, and
// granny Oola as a healer), the party's numbers, the beasts the hunting door can tame, the
// mounts (each also an item the player buys and holds) and the companions' signature
// skills. Data lives in data/party/.

import abilities from '../../../data/party/abilities.json';
import companions from '../../../data/party/companions.json';
import config from '../../../data/party/config.json';
import mounts from '../../../data/party/mounts.json';
import pets from '../../../data/party/pets.json';
import type { ContentMap } from '../../core/contracts';
import type { AbilityDef } from '../../systems/combat/types';
import type { ItemDef } from '../../systems/inventory';
import type { CompanionDef, MountDef, PartyConfig, PetDef } from '../../systems/party/types';
import { STANCES } from '../../systems/party/types';
import type { ContentPack } from '../pack';

const MOUNTS = mounts as unknown as MountDef[];

/** A mount is also an item: bought, sold and held like any other (stack of one). */
export function mountItems(list: readonly MountDef[]): ItemDef[] {
  return list.map((m) => ({
    id: m.id,
    name: m.name,
    kind: 'goods',
    quality: 1,
    value: m.price,
    desc: m.desc,
    stack: 1,
    tags: ['mount'],
  }));
}

const RULE_KINDS = new Set(['guard', 'shield', 'retreat']);

/** Problems in the party's own tables (the content validation and the tests run it). */
export function validateParty(content: ContentMap): string[] {
  const problems: string[] = [];
  const classes = new Set((content.classes ?? []).map((c) => c.id));
  const abilityIds = new Set((content.abilities ?? []).map((a) => a.id));
  const monsters = new Set((content.monsters ?? []).map((m) => m.id));
  for (const c of content.companions ?? []) {
    const at = `companion ${c.id}`;
    if (!classes.has(c.classId)) problems.push(`${at}: unknown class ${c.classId}`);
    if (c.level < 1 || c.level > 60) problems.push(`${at}: level out of range`);
    for (const a of c.avoid ?? [])
      if (!abilityIds.has(a)) problems.push(`${at}: unknown ability ${a}`);
    if (c.signature && !abilityIds.has(c.signature))
      problems.push(`${at}: unknown signature ${c.signature}`);
    if (c.recruit && !['story', 'invite', 'hire'].includes(c.recruit.mode))
      problems.push(`${at}: bad recruit mode ${c.recruit.mode}`);
    if (c.recruit && c.recruit.mode !== 'story' && !c.recruit.when)
      problems.push(`${at}: an ${c.recruit.mode} recruit needs its condition`);
    const ai = c.ai;
    if (ai) {
      for (const k of ['aggression', 'caution', 'protect', 'obedience'] as const)
        if (!(ai[k] >= 0 && ai[k] <= 100)) problems.push(`${at}: ai.${k} out of 0 to 100`);
      for (const r of ai.rules ?? []) {
        if (!RULE_KINDS.has(r.kind)) problems.push(`${at}: unknown rule ${r.kind}`);
        if (r.kind === 'guard' && !abilityIds.has(r.ability))
          problems.push(`${at}: rule ability ${r.ability} unknown`);
        if ((r.kind === 'guard' || r.kind === 'retreat') && !(r.below > 0 && r.below < 1))
          problems.push(`${at}: rule ${r.kind} below out of 0 to 1`);
      }
    }
    for (const r of c.redLines ?? [])
      if (!/^RL-[a-z0-9_]+$/.test(r.hook)) problems.push(`${at}: red line hook ${r.hook}`);
    for (const p of c.presence ?? [])
      if (!p.when || !p.storeAs || !(p.range > 0))
        problems.push(`${at}: presence needs when, storeAs, range`);
    for (const l of c.leaves ?? [])
      if (!l.when || (l.back && !l.back.when))
        problems.push(`${at}: a departure needs when (and back.when)`);
  }
  for (const p of content.pets ?? []) {
    if (!monsters.has(p.monsterId)) problems.push(`pet ${p.id}: unknown monster ${p.monsterId}`);
    if (!(p.cap >= 1 && p.cap <= 60)) problems.push(`pet ${p.id}: cap out of range`);
  }
  for (const m of content.mounts ?? []) {
    if (!(m.dayKm > 0)) problems.push(`mount ${m.id}: day's travel must be positive`);
    if (!m.id.startsWith('mnt_')) problems.push(`mount ${m.id}: ids start with mnt_`);
  }
  const cfg = content.partyConfig;
  if (cfg) {
    let last = 0;
    for (const g of cfg.bondGates) {
      if (g.max < last) problems.push(`partyConfig: bond gates must not fall (${g.max})`);
      last = g.max;
    }
    if (cfg.rest.minDays > cfg.rest.maxDays) problems.push('partyConfig: rest min above max');
    if (!STANCES.length) problems.push('partyConfig: no stances');
  }
  return problems;
}

export const pack: ContentPack = {
  id: 'party',
  tables: {
    companions: companions as unknown as CompanionDef[],
    partyConfig: config as unknown as PartyConfig,
    pets: pets as unknown as PetDef[],
    mounts: MOUNTS,
    abilities: abilities as unknown as AbilityDef[],
    items: mountItems(MOUNTS),
  },
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
        { key: 'tier', label: '分类', type: 'enum', options: ['main', 'escort'] },
        { key: 'classId', label: '职能', type: 'ref', refTable: 'classes' },
        {
          key: 'role',
          label: '定位',
          type: 'enum',
          options: ['tank', 'healer', 'melee', 'ranged', 'caster'],
        },
        { key: 'level', label: '加入时的等级', type: 'number', min: 1, max: 60 },
        { key: 'personality', label: '性格标签', type: 'json' },
        { key: 'appearance', label: '外观', type: 'json' },
        { key: 'recruit', label: '招募方式与条件', type: 'json' },
        { key: 'ai', label: '人格权重与个人规则', type: 'json' },
        { key: 'signature', label: '标志技能', type: 'ref', refTable: 'abilities' },
        { key: 'likes', label: '喜好（送礼）', type: 'json' },
        { key: 'bondFlags', label: '加深羁绊的剧情旗标', type: 'json' },
        { key: 'redLines', label: '红线', type: 'json' },
        { key: 'leaves', label: '离队与归队', type: 'json' },
        { key: 'presence', label: '在场记录', type: 'json' },
        { key: 'armor', label: '铁人护命期', type: 'json' },
        { key: 'servant', label: '从者', type: 'boolean' },
      ],
    },
    {
      table: 'pets',
      label: '兽伴',
      file: 'party/pets.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'monsterId', label: '野外来源', type: 'ref', refTable: 'monsters' },
        { key: 'cap', label: '种限', type: 'number', min: 1, max: 60 },
        { key: 'guardsBag', label: '守遗落包', type: 'boolean' },
      ],
    },
    {
      table: 'mounts',
      label: '坐骑',
      file: 'party/mounts.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '说明', type: 'string' },
        { key: 'price', label: '价格（铜）', type: 'number', min: 0 },
        { key: 'dayKm', label: '日行程（公里）', type: 'number', min: 1 },
        { key: 'load', label: '驮载', type: 'number', min: 0 },
        { key: 'stopsAtSediment', label: '止步澱度', type: 'json' },
        { key: 'fearless', label: '不怕灵压', type: 'boolean' },
      ],
    },
  ],
  validate: validateParty,
};
