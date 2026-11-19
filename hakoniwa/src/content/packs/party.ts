// Party pack: companions who can join the player (the servant Yeyu, Shiya, Ron, Nera, and
// granny Oola as a healer), the party's numbers, the beasts the hunting door can tame, the
// mounts (each also an item the player buys and holds), the companions' signature
// skills and the party chatter's exchanges (their lines are ln_party, PK-M1-29). Data lives
// in data/party/.

import abilities from '../../../data/party/abilities.json';
import banter from '../../../data/party/banter.json';
import companions from '../../../data/party/companions.json';
import config from '../../../data/party/config.json';
import mounts from '../../../data/party/mounts.json';
import pets from '../../../data/party/pets.json';
import type { ContentMap } from '../../core/contracts';
import type { AbilityDef } from '../../systems/combat/types';
import type { ItemDef } from '../../systems/inventory';
import type {
  BanterDef,
  CompanionDef,
  MountDef,
  PartyConfig,
  PetDef,
} from '../../systems/party/types';
import { BANTER_KINDS, STANCES } from '../../systems/party/types';
import { checkCondition } from '../../systems/quests/conditions';
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

const RULE_KINDS = new Set(['guard', 'shield', 'retreat', 'spare']);
const ID = /^[a-z0-9_]+$/;
/** Event keys an event exchange may wait for (builtin_ai.md 11.3): a feat of the player. */
const BANTER_ON = /^feat\.[a-z0-9_]+$/;

/**
 * Problems in the party chatter (builtin_ai.md 11.3): ids, kinds, a cast of one to three
 * persons (companions or carded people), speakers from the cast, two to six lines, a place
 * for an enter exchange, conditions that parse, replies of two or three options whose bond
 * names the cast. When ln_party is loaded, each exchange's slot holds at least its lines
 * and reply labels (the pack itself is PK-M1-29's).
 */
export function validateBanter(content: ContentMap): string[] {
  const out: string[] = [];
  const persons = new Set([
    ...(content.companions ?? []).map((c) => c.id),
    ...((content as { npcs?: { id: string }[] }).npcs ?? []).map((n) => n.id),
  ]);
  const places = new Set<string>();
  for (const m of content.maps ?? []) {
    places.add(m.id);
    for (const l of m.locations ?? []) places.add(l.id);
  }
  const pack = (content.linePacks ?? []).find((p) => p.id === 'ln_party');
  const seen = new Set<string>();
  for (const b of content.partyBanter ?? []) {
    const at = `banter ${b.id}`;
    if (!ID.test(b.id)) out.push(`${at}: id must be lowercase`);
    if (seen.has(b.id)) out.push(`${at}: duplicate id`);
    seen.add(b.id);
    if (!BANTER_KINDS.includes(b.kind)) out.push(`${at}: unknown kind ${b.kind}`);
    if (!(b.cast.length >= 1 && b.cast.length <= 3)) out.push(`${at}: cast of 1 to 3`);
    for (const c of b.cast) if (!persons.has(c)) out.push(`${at}: unknown person ${c}`);
    if (!(b.speakers.length >= 2 && b.speakers.length <= 6)) out.push(`${at}: 2 to 6 lines`);
    for (const sp of b.speakers)
      if (!b.cast.includes(sp)) out.push(`${at}: speaker ${sp} is not in the cast`);
    if (b.at !== undefined && b.kind !== 'enter') out.push(`${at}: only enter takes at`);
    if (b.at === undefined && b.kind === 'enter')
      out.push(`${at}: an enter exchange names its place`);
    // a relation exchange answers a change between two of its own cast
    if (b.kind === 'relation' && b.cast.length < 2)
      out.push(`${at}: relation needs two in the cast`);
    if (b.at !== undefined && !places.has(b.at)) out.push(`${at}: unknown place ${b.at}`);
    if (b.on !== undefined && (b.kind !== 'event' || !BANTER_ON.test(b.on)))
      out.push(`${at}: on must be feat.<kind> on an event exchange`);
    if (b.when) {
      const bad = checkCondition(b.when);
      if (bad) out.push(`${at}: condition does not parse: ${bad}`);
    }
    if (!(b.priority > 0)) out.push(`${at}: priority must be positive`);
    if (b.replies && !(b.replies.length >= 2 && b.replies.length <= 3))
      out.push(`${at}: a reply point has two or three options`);
    for (const r of b.replies ?? [])
      for (const who of Object.keys(r.bond ?? {}))
        if (!b.cast.includes(who)) out.push(`${at}: reply bond names ${who} outside the cast`);
    if (pack) {
      const lines = pack.slots[`party.${b.id}`];
      const need = b.speakers.length + (b.replies?.length ?? 0);
      if (!Array.isArray(lines)) out.push(`${at}: ln_party has no slot party.${b.id}`);
      else if (lines.length < need)
        out.push(`${at}: ln_party slot party.${b.id} holds ${lines.length} of ${need} lines`);
    }
  }
  return out;
}

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
    if (p.food) {
      for (const list of [p.food.liked, p.food.accepted]) {
        if (
          !Array.isArray(list) ||
          list.some((id) => typeof id !== 'string' || !content.items.some((item) => item.id === id))
        ) {
          problems.push(`pet ${p.id}: food must name existing item ids`);
        }
      }
    }
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
  for (const c of content.companions ?? [])
    for (const r of c.ai?.rules ?? [])
      if (r.kind === 'spare' && !(r.families?.length > 0))
        problems.push(`companion ${c.id}: a spare rule names its families`);
  problems.push(...validateBanter(content));
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
    partyBanter: banter as unknown as BanterDef[],
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
        { key: 'food', label: '食物偏好', type: 'json' },
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
    {
      table: 'partyBanter',
      label: '队内闲聊',
      file: 'party/banter.json',
      idField: 'id',
      fields: [
        {
          key: 'id',
          label: 'ID',
          type: 'string',
          required: true,
          help: '台词在 ln_party 的槽位 party.<ID>：先说话句，再回应选项',
        },
        { key: 'cast', label: '出场', type: 'json', required: true },
        {
          key: 'kind',
          label: '触发',
          type: 'enum',
          options: ['enter', 'event', 'travel', 'campfire', 'relation', 'act'],
        },
        { key: 'at', label: '地点（进入地点）', type: 'string' },
        { key: 'on', label: '事件键（feat.<种类>）', type: 'string' },
        { key: 'when', label: '条件', type: 'string' },
        { key: 'once', label: '一局一次', type: 'boolean' },
        { key: 'priority', label: '优先级', type: 'number', min: 1 },
        { key: 'speakers', label: '逐句说话者', type: 'json', required: true },
        { key: 'replies', label: '回应点（各选项的羁绊）', type: 'json' },
      ],
    },
  ],
  validate: validateParty,
};
