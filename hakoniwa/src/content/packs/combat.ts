// Combat pack: the nine vocations plus the outsider, abilities, auras, monsters, waves,
// combat items, the fixed presences (Ash), and the combat maps (the sealed ruins and
// their depths, the forest edge, the ash waste rim, the old sewers). Data lives in
// data/combat/; this module only types it, describes it for the editor, and checks it.

import abilities from '../../../data/combat/abilities.json';
import auras from '../../../data/combat/auras.json';
import classes from '../../../data/combat/classes.json';
import fixtures from '../../../data/combat/fixtures.json';
import items from '../../../data/combat/items.json';
import mapAshWaste from '../../../data/combat/maps/ash_waste.json';
import mapForestEdge from '../../../data/combat/maps/forest_edge.json';
import mapSealRuins from '../../../data/combat/maps/seal_ruins.json';
import mapSealRuinsDepths from '../../../data/combat/maps/seal_ruins_depths.json';
import mapSewers from '../../../data/combat/maps/wallenburg_sewers.json';
import monsters from '../../../data/combat/monsters.json';
import waves from '../../../data/combat/waves.json';
import type { ContentMap } from '../../core/contracts';
import { MOB_CC_CAP } from '../../systems/combat/formulas';
import type {
  AbilityDef,
  AuraDef,
  ClassDef,
  FixtureDef,
  MonsterDef,
  WaveDef,
} from '../../systems/combat/types';
import type { ItemDef } from '../../systems/inventory';
import type { WorldStart } from '../../systems/world';
import type { MapDef } from '../../systems/world/types';
import type { ContentPack, FieldSchema } from '../pack';
import { ITEM_FIELDS } from './inventory';

const maps = [
  mapSealRuins,
  mapSealRuinsDepths,
  mapForestEdge,
  mapAshWaste,
  mapSewers,
] as unknown as MapDef[];

/** The player wakes under the sixth sigil after the prologue (priority 1; the divine court start is 10). */
function wakeStart(): WorldStart[] {
  const ruins = maps.find((m) => m.id === 'seal_ruins');
  const wake = ruins?.locations.find((l) => l.id === 'wake_point');
  if (!ruins || !wake) return [];
  return [{ mapId: ruins.id, x: wake.x + wake.w / 2, y: wake.y + wake.h / 2, priority: 1 }];
}

const MAP_FILES: Record<string, string> = {
  seal_ruins: 'combat/maps/seal_ruins.json',
  seal_ruins_depths: 'combat/maps/seal_ruins_depths.json',
  forest_edge: 'combat/maps/forest_edge.json',
  ash_waste: 'combat/maps/ash_waste.json',
  wallenburg_sewers: 'combat/maps/wallenburg_sewers.json',
};

const json = (key: string, label: string, help?: string): FieldSchema => ({
  key,
  label,
  type: 'json',
  help,
});

export const pack: ContentPack = {
  id: 'combat',
  tables: {
    classes: classes as unknown as ClassDef[],
    abilities: abilities as unknown as AbilityDef[],
    auras: auras as unknown as AuraDef[],
    monsters: monsters as unknown as MonsterDef[],
    waves: waves as unknown as WaveDef[],
    combatFixtures: fixtures as unknown as FixtureDef[],
    items: items as unknown as ItemDef[],
    maps,
    worldStarts: wakeStart(),
  },
  schemas: [
    {
      table: 'classes',
      label: '职能',
      file: 'combat/classes.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '说明', type: 'text' },
        {
          key: 'resource',
          label: '资源',
          type: 'enum',
          options: ['mana', 'rage', 'energy'],
          help: '编外者留空（资源池由门授予）',
        },
        {
          key: 'role',
          label: '定位',
          type: 'enum',
          options: ['tank', 'healer', 'melee', 'ranged', 'caster'],
        },
        { key: 'armorType', label: '护甲', type: 'enum', options: ['cloth', 'leather', 'mail'] },
        json('base', '1 级基础属性'),
        json('growth', '每级成长'),
        { key: 'hp', label: '基础生命', type: 'number', min: 1 },
        { key: 'hpPerLevel', label: '每级生命', type: 'number', min: 0 },
        { key: 'mana', label: '基础灵力', type: 'number', min: 0 },
        { key: 'manaPerLevel', label: '每级灵力', type: 'number', min: 0 },
        { key: 'apFrom', label: '攻强规则', type: 'enum', options: ['str2', 'str_agi', 'str'] },
        { key: 'attackRange', label: '自动攻击射程', type: 'number', min: 0 },
        json('unarmed', '徒手伤害'),
        json('abilities', '技能（id 与习得等级）'),
      ],
    },
    {
      table: 'abilities',
      label: '技能',
      file: 'combat/abilities.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '说明', type: 'text' },
        {
          key: 'target',
          label: '目标',
          type: 'enum',
          options: ['enemy', 'ally', 'self', 'area', 'enemy_area', 'party', 'ally_area'],
        },
        {
          key: 'school',
          label: '系别',
          type: 'enum',
          options: ['physical', 'holy', 'fire', 'frost', 'nature', 'shadow', 'arcane'],
        },
        { key: 'range', label: '射程（格）', type: 'number', min: 0 },
        { key: 'radius', label: '半径（格）', type: 'number', min: 0 },
        { key: 'resource', label: '资源', type: 'enum', options: ['mana', 'rage', 'energy'] },
        { key: 'cost', label: '消耗', type: 'number', min: 0 },
        { key: 'costPct', label: '灵力消耗比例', type: 'number', min: 0, max: 1 },
        { key: 'castTime', label: '读条（秒）', type: 'number', min: 0 },
        { key: 'cooldown', label: '冷却（秒）', type: 'number', min: 0 },
        json('effects', '效果', 'damage、heal、aura、taunt、interrupt、summon 等'),
        {
          key: 'ai',
          label: 'AI 用法',
          type: 'enum',
          options: [
            'filler',
            'opener',
            'dot',
            'debuff',
            'aoe',
            'execute',
            'finisher',
            'heal',
            'hot',
            'shield',
            'emergency',
            'buff',
            'defensive',
            'taunt',
            'interrupt',
            'cc',
            'summon',
            'mana',
            'never',
          ],
        },
        { key: 'priority', label: 'AI 优先级', type: 'number' },
      ],
    },
    {
      table: 'auras',
      label: '光环与增减益',
      file: 'combat/auras.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'kind', label: '类别', type: 'enum', options: ['buff', 'debuff'] },
        { key: 'duration', label: '持续（秒，0 为常驻）', type: 'number', min: 0 },
        { key: 'maxStacks', label: '最大层数', type: 'number', min: 1 },
        json('periodic', '周期伤害或治疗'),
        json('stats', '属性'),
        json('mods', '修正（伤害、承伤、急速、移速）'),
        {
          key: 'cc',
          label: '控制',
          type: 'enum',
          options: ['stun', 'root', 'silence', 'slow', 'fear', 'incapacitate'],
        },
        { key: 'slow', label: '减速比例', type: 'number', min: 0, max: 1 },
        json('absorb', '吸收盾'),
        json('thorns', '反伤'),
        json('pulse', '周身脉冲'),
      ],
    },
    {
      table: 'monsters',
      label: '魔物与敌人',
      file: 'combat/monsters.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string', required: true },
        { key: 'desc', label: '说明', type: 'text' },
        {
          key: 'family',
          label: '族群',
          type: 'enum',
          options: [
            'beast',
            'humanoid',
            'spider',
            'burrower',
            'undead',
            'elemental',
            'construct',
            'dragonkin',
            'demon',
          ],
        },
        { key: 'faction', label: '势力', type: 'string' },
        {
          key: 'act',
          label: '首见幕',
          type: 'enum',
          options: ['act1', 'act2', 'act3', 'act4', 'act5', 'act6'],
          help: '图鉴的首见幕；数值带校验（V6）按此幕的等级带判定',
        },
        { key: 'minLevel', label: '最低等级', type: 'number', min: 1, max: 60 },
        { key: 'maxLevel', label: '最高等级', type: 'number', min: 1, max: 60 },
        { key: 'rank', label: '级别', type: 'enum', options: ['normal', 'elite', 'rare', 'boss'] },
        { key: 'hpMult', label: '生命倍率', type: 'number', min: 0 },
        { key: 'dmgMult', label: '伤害倍率', type: 'number', min: 0 },
        { key: 'aggroRadius', label: '警戒半径（格）', type: 'number', min: 0 },
        { key: 'leash', label: '拴绳距离（格）', type: 'number', min: 1 },
        { key: 'classId', label: '借用职能', type: 'ref', refTable: 'classes' },
        json('abilities', '技能'),
        json('mechanics', '机制', 'enrage、summon、phases、yieldAtPct、ramp、presence 等'),
        json('loot', '掉落表'),
        json('money', '金钱范围（铜）'),
        json('appearance', '外观'),
      ],
    },
    {
      table: 'waves',
      label: '脚本波次',
      file: 'combat/waves.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        {
          key: 'id',
          label: 'ID',
          type: 'string',
          required: true,
          help: '旗标 combat.wave.<ID> 设为 go 时生成',
        },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'at', label: '出现地点', type: 'string' },
        { key: 'target', label: '目标地点', type: 'string' },
        { key: 'radius', label: '散布半径', type: 'number', min: 0 },
        json('groups', '魔物组合'),
      ],
    },
    {
      table: 'combatFixtures',
      label: '固定存在',
      file: 'combat/fixtures.json',
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string', required: true },
        { key: 'name', label: '名称', type: 'string' },
        { key: 'mapId', label: '地图', type: 'ref', refTable: 'maps' },
        { key: 'location', label: '地点', type: 'string' },
        { key: 'ref', label: '引用 ID', type: 'string' },
        { key: 'level', label: '等级', type: 'number', min: 1 },
        { key: 'tier', label: '位阶', type: 'number', min: 0, max: 7 },
        { key: 'presence', label: '威压半径', type: 'number', min: 0 },
      ],
    },
    {
      table: 'items',
      label: '战斗物品',
      file: 'combat/items.json',
      idField: 'id',
      nameField: 'name',
      fields: ITEM_FIELDS,
    },
    ...Object.entries(MAP_FILES).map(([id, file]) => ({
      table: 'maps',
      label: `地图：${maps.find((m) => m.id === id)?.name ?? id}`,
      file,
      idField: 'id',
      nameField: 'name',
      fields: [
        { key: 'id', label: 'ID', type: 'string' as const, required: true },
        { key: 'name', label: '名称', type: 'string' as const, required: true },
        { key: 'region', label: '区域', type: 'string' as const },
        json('rows', '地块行'),
        json('legend', '图例'),
        json('locations', '地点'),
        json('spawns', '出生点'),
        json('exits', '出口'),
      ],
    })),
  ],
  validate: validateCombat,
};

const BOSS_TIERS: readonly string[] = ['lair', 'dungeon', 'raid', 'surge', 'story', 'tutorial'];
const DR_CATEGORIES: readonly string[] = [
  'stun_ctrl',
  'stun_open',
  'stun_proc',
  'root',
  'incap',
  'sleep',
  'poly',
  'fear',
  'silence',
  'disarm',
];
const DISPEL_TYPES: readonly string[] = ['magic', 'curse', 'poison', 'disease'];
/** Longest school lockout of a monster's interrupt against the player's side (9.1). */
const LOCKOUT_CAP = 4;

export function validateCombat(content: ContentMap): string[] {
  const problems: string[] = [];
  const has = <T extends { id: string }>(rows: T[] | undefined) =>
    new Set((rows ?? []).map((r) => r.id));
  const abilityIds = has(content.abilities);
  const auraIds = has(content.auras);
  const monsterIds = has(content.monsters);
  const classIds = has(content.classes);
  const itemIds = has(content.items);
  const mapById = new Map((content.maps ?? []).map((m) => [m.id, m]));

  for (const c of content.classes ?? []) {
    for (const a of c.abilities) {
      if (!abilityIds.has(a.id)) problems.push(`class ${c.id}: unknown ability ${a.id}`);
      if (a.level < 1 || a.level > 60)
        problems.push(`class ${c.id}: ability ${a.id} level out of range`);
    }
  }
  for (const a of content.abilities ?? []) {
    if (!a.effects?.length) problems.push(`ability ${a.id}: no effects`);
    for (const f of a.effects ?? []) {
      if (f.type === 'aura' && !auraIds.has(f.aura))
        problems.push(`ability ${a.id}: unknown aura ${f.aura}`);
      if (f.type === 'summon' && !monsterIds.has(f.monster)) {
        problems.push(`ability ${a.id}: unknown monster ${f.monster}`);
      }
    }
    if (a.requires?.targetLacksAura && !auraIds.has(a.requires.targetLacksAura)) {
      problems.push(`ability ${a.id}: unknown aura ${a.requires.targetLacksAura}`);
    }
    if (a.costPct !== undefined && a.resource !== 'mana')
      problems.push(`ability ${a.id}: costPct needs mana`);
  }
  for (const a of content.auras ?? []) {
    if (a.duration < 0) problems.push(`aura ${a.id}: negative duration`);
    if (a.kind !== 'buff' && a.kind !== 'debuff') problems.push(`aura ${a.id}: bad kind`);
    if (a.drCategory && !DR_CATEGORIES.includes(a.drCategory))
      problems.push(`aura ${a.id}: bad drCategory ${a.drCategory}`);
    if (a.dispelType && !DISPEL_TYPES.includes(a.dispelType))
      problems.push(`aura ${a.id}: bad dispelType ${a.dispelType}`);
    if (a.byStacks && a.byStacks.length > (a.maxStacks ?? 1))
      problems.push(`aura ${a.id}: byStacks longer than maxStacks`);
  }
  for (const m of content.monsters ?? []) {
    if (m.minLevel < 1 || m.maxLevel > 60 || m.minLevel > m.maxLevel) {
      problems.push(`monster ${m.id}: bad level range`);
    }
    if (m.classId && !classIds.has(m.classId))
      problems.push(`monster ${m.id}: unknown class ${m.classId}`);
    for (const id of m.abilities ?? []) {
      if (!abilityIds.has(id)) problems.push(`monster ${m.id}: unknown ability ${id}`);
    }
    for (const l of m.loot ?? []) {
      if (!itemIds.has(l.itemId)) problems.push(`monster ${m.id}: unknown loot item ${l.itemId}`);
      if (l.chance < 0 || l.chance > 1) problems.push(`monster ${m.id}: loot chance out of range`);
    }
    const mech = m.mechanics;
    const auraRefs = [
      ...(mech?.passives ?? []),
      ...(mech?.onHit ?? []).map((h) => h.aura),
      ...(mech?.phases ?? []).flatMap((p) => (p.aura ? [p.aura] : [])),
      ...(mech?.enrage ? [mech.enrage.aura] : []),
      ...(mech?.ramp ? [mech.ramp.aura] : []),
      ...(mech?.ownerAura ? [mech.ownerAura] : []),
    ];
    for (const w of mech?.duelWatch?.watchers ?? [])
      if (!monsterIds.has(w)) problems.push(`monster ${m.id}: unknown duel watcher ${w}`);
    for (const [mapId, loc] of Object.entries(mech?.petQuirk?.walkTo ?? {})) {
      const map = mapById.get(mapId);
      if (map && !map.locations.some((l) => l.id === loc))
        problems.push(`monster ${m.id}: pet quirk map ${mapId} has no location ${loc}`);
    }
    if (m.tier && !BOSS_TIERS.includes(m.tier))
      problems.push(`monster ${m.id}: bad tier ${m.tier}`);
    if (m.tier && m.rank !== 'boss') problems.push(`monster ${m.id}: a tier needs rank boss`);
    if (m.storyAs && m.tier !== 'story') problems.push(`monster ${m.id}: storyAs needs tier story`);
    for (const id of auraRefs)
      if (!auraIds.has(id)) problems.push(`monster ${m.id}: unknown aura ${id}`);
    for (const s of mech?.summon ?? []) {
      if (!monsterIds.has(s.monster)) problems.push(`monster ${m.id}: unknown summon ${s.monster}`);
    }
    if (mech?.partySync && typeof mech.partySync.offset !== 'number') {
      problems.push(`monster ${m.id}: partySync.offset must be a number`);
    }
    for (const p of mech?.phases ?? []) {
      for (const id of p.abilities ?? []) {
        if (!abilityIds.has(id))
          problems.push(`monster ${m.id}: phase ${p.name} unknown ability ${id}`);
      }
    }
  }
  problems.push(...monsterControlCaps(content));
  for (const map of content.maps ?? []) {
    for (const s of map.spawns) {
      if (s.kind === 'monster' && !monsterIds.has(s.ref)) {
        problems.push(`map ${map.id}: spawn ${s.id} unknown monster ${s.ref}`);
      }
      // a story boss syncs to the party on its first pull and would undo a map level
      const mon = s.level !== undefined ? content.monsters?.find((m) => m.id === s.ref) : undefined;
      if (mon?.mechanics?.partySync)
        problems.push(`map ${map.id}: spawn ${s.id} sets a level on party-synced ${s.ref}`);
    }
  }
  for (const w of content.waves ?? []) {
    for (const g of w.groups) {
      if (!monsterIds.has(g.monster)) problems.push(`wave ${w.id}: unknown monster ${g.monster}`);
    }
    const map = mapById.get(w.mapId);
    if (!map) continue; // maps owned by other packs may arrive later
    for (const loc of [w.at, w.target]) {
      if (loc && !map.locations.some((l) => l.id === loc)) {
        problems.push(`wave ${w.id}: map ${w.mapId} has no location ${loc}`);
      }
    }
  }
  for (const f of content.combatFixtures ?? []) {
    const map = mapById.get(f.mapId);
    if (!map) problems.push(`fixture ${f.id}: unknown map ${f.mapId}`);
    else if (!map.locations.some((l) => l.id === f.location)) {
      problems.push(`fixture ${f.id}: no location ${f.location}`);
    }
  }
  for (const it of content.items ?? []) {
    if (it.kind === 'weapon' && !it.weapon)
      problems.push(`item ${it.id}: weapon without weapon stats`);
    if (it.use?.effect === 'aura' && it.use.ability && !auraIds.has(it.use.ability)) {
      problems.push(`item ${it.id}: unknown aura ${it.use.ability}`);
    }
  }
  return problems;
}

/**
 * Monster controls against the player's side keep their base duration under the caps of
 * combat_and_classes.md 9.1 (stun 3, root 6, silence 4, fear 6, incapacitate 6, disarm 6
 * seconds): every control aura an enemy monster lays on a foe, through its abilities, its
 * phase abilities or its on-hit list. Rank scaling may lengthen it in play; this caps data.
 */
export function monsterControlCaps(content: ContentMap): string[] {
  const out: string[] = [];
  const auras = new Map((content.auras ?? []).map((a) => [a.id, a]));
  const abilities = new Map((content.abilities ?? []).map((a) => [a.id, a]));
  const check = (monster: string, auraId: string, via: string) => {
    const a = auras.get(auraId);
    const cap = a?.cc ? MOB_CC_CAP[a.cc] : undefined;
    if (a && cap !== undefined && a.duration > cap)
      out.push(
        `monster ${monster}: ${via} lays ${a.cc} ${a.id} for ${a.duration} s, over the ${cap} s cap`,
      );
  };
  for (const m of content.monsters ?? []) {
    const mech = m.mechanics;
    // pets fight for their summoner: their controls land on enemies, not on the player's side
    if (mech?.petGroup) continue;
    const ids = [...(m.abilities ?? []), ...(mech?.phases ?? []).flatMap((p) => p.abilities ?? [])];
    for (const id of [...new Set(ids)]) {
      const def = abilities.get(id);
      if (!def || def.target === 'self' || def.target === 'ally' || def.target === 'party')
        continue;
      for (const f of def.effects) {
        if (f.type === 'aura' && f.to !== 'self') check(m.id, f.aura, `ability ${id}`);
        // the school lockout of an interrupt (9.1: 4 seconds)
        if (f.type === 'interrupt' && f.lockout > LOCKOUT_CAP)
          out.push(
            `monster ${m.id}: ability ${id} locks a school for ${f.lockout} s, over the ${LOCKOUT_CAP} s cap`,
          );
      }
    }
    for (const h of mech?.onHit ?? []) check(m.id, h.aura, 'on-hit');
  }
  return out;
}
