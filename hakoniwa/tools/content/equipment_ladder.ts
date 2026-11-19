// Generate data/items/equipment_t1.json, the T1 base ladder of common (凡品, quality 1)
// models of catalog_equipment.md 3.1 to 3.3, from the compact spec table below. Every
// number comes from the catalog's formulas; the table holds only names, levels, the main
// stat of each row and the wear material of each model. Good (良品) variants are generated
// only as the masterwork items of the T1 equipment recipes (the GOOD table); the others come
// from the quality-upgrade recipe (catalog 2.8 rcp_upgrade_quality).
//
//   node tools/content/equipment_ladder.ts           write the file
//   node tools/content/equipment_ladder.ts --check   fail when the file is stale
//
// Rules (catalog_equipment.md):
// - ids (3.1, 10): weapons, shields and foci `eq_t1_<class>_<n>` with n = 1, 2, 3 for the
//   row's low, mid and high model; armour `eq_t1_<cloth|leather|mail|plate>_<slot>`;
//   trinkets `eq_t1_trinket_<n>` in row order. Two-handed classes are `sword2h`,
//   `axe2h`, `mace2h`; the 录杖 row is `wand` (its class tag, weaponClass `rod`).
// - models that already exist keep their legacy ids and are not generated: the staff and
//   bow mid models are `oak_staff` and `hunters_bow` (so `eq_t1_staff_2` and
//   `eq_t1_bow_2` stay unused); the leather chest and feet are `worn_leather_vest` and
//   `wolfhide_boots`; the shield row has four models, the three generated ones take
//   n = 1, 2, 3 by level (木圆盾 3, 铁边圆盾 6, 木鸢盾 9) and `dented_round_shield` is the
//   second low model under its legacy id.
// - level: weapons, shields and foci at the levels 3.3 lists; armour and trinkets (one
//   model per class and slot, 3.1) at the T1 reference level of the 3.2 table, Lv 6.
// - value (1.3): T1 base 150 x quality 1 x class factor: one hand 1.0, two hand and bows
//   1.5, focus 0.6, wooden shield 0.48, round shield 0.6, trinket 1.2; armour chest and
//   legs 0.6 / 0.8 / 1.0 / 1.6 (cloth, leather, mail, plate), head, hands, feet x 0.6.
// - stats (1.4, 3.1): one main stat, the item's budget level x 0.5 (common) x slot factor
//   (chest, legs, two hand 1.0; one hand, head 0.8; hands, feet, off hand 0.6; trinket
//   0.7), rounded half up, at least 1. The main stat is the primary key of the row's first
//   common grain (2.4); the crossbow's grain 准 is hit plus agi, a common piece takes agi.
// - weapon damage (1.4): DPS from the single-hand common guide table, interpolated
//   linearly between its levels, times the class factor (two-hand melee 1.35, staff 0.8,
//   rod 0.7, bow 1.0, crossbow 1.05); min + max = round(2 x DPS x speed), min = a third
//   of that sum rounded, max the rest. Range 1.2 melee, 8 bow and crossbow. Speeds are
//   not in the catalog: dagger 1.7, sword 2.4, bow 2.6 and staff 2.8 follow the existing
//   weapons (data/combat/items.json; fist 1.6 follows red_fang_gauntlet, one-hand axe 2.8
//   ash_cleaver), mace 2.6, rod 2.2, crossbow 3.0 (slower than the bow, 1.4), two-hand
//   polearm 3.2, sword 3.4, axe and mace 3.6.
// - trinkets: the 信物 row's grain is "any"; each model takes the main stat of its
//   material (copper ring sta, quartz int, carved charm spi, bone agi).
// - armour (3.2): chest base 10 + Lv x k (cloth 2.5, leather 5, mail 8, plate 12) times
//   the slot multiplier (chest 1.0, legs 0.9, head 0.75, feet 0.65, hands 0.6); shields
//   10 + Lv x 13; rounded half up; written as stats.armor like the existing pieces.
// - tags (1.2): the class tag, `two_hand` for two-handed classes, then the wear material
//   src/systems/inventory/rules.ts reads (metal, wood, leather, cloth, bone, mail, plate).

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type DataPaths = typeof import('../data_paths');

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'data', 'items', 'equipment_t1.json');

type StatKey = 'str' | 'agi' | 'sta' | 'int' | 'spi';
type Wear = 'metal' | 'wood' | 'leather' | 'cloth' | 'bone';

/** One model: name, level and what it is made of; null where a legacy id holds it. */
interface Model {
  name: string;
  level: number;
  wear: Wear;
  desc: string;
}

interface WeaponRow {
  /** id class segment */
  cls: string;
  weaponClass: string;
  /** class tags of catalog 1.2 */
  tags: string[];
  hand: 1 | 2;
  /** DPS class factor of catalog 1.4 */
  dpsFactor: number;
  speed: number;
  range: number;
  main: StatKey;
  models: (Model | null)[];
}

interface OffHandRow {
  cls: 'shield' | 'focus';
  main: StatKey;
  models: (Model & { value: number })[];
}

type Slot = 'head' | 'chest' | 'legs' | 'hands' | 'feet';

interface ArmorRow {
  armorClass: 'cloth' | 'leather' | 'mail' | 'plate';
  /** chest base armour per level (catalog 3.2) */
  k: number;
  /** chest and legs price factor (catalog 1.3); head, hands and feet take 0.6 of it */
  priceFactor: number;
  main: StatKey;
  models: Record<Slot, { name: string; desc: string } | null>;
}

interface TrinketRow {
  name: string;
  main: StatKey;
  wear?: Wear;
  desc: string;
}

// ---------------------------------------------------------------------------
// Catalog constants

const TIER = 1;
const TIER_BASE = 150;
const QUALITY = 1;
/** common pieces (quality factor 0.5 of catalog 1.4) */
const BUDGET_QUALITY = 0.5;
/** armour and trinkets: the T1 reference level of the 3.2 table */
const ARMOR_LEVEL = 6;
/** single-hand common DPS guide table of catalog 1.4 (the T1 part and its next point) */
const DPS_GUIDE: readonly [number, number][] = [
  [1, 2],
  [5, 3.2],
  [9, 4.5],
  [12, 5.5],
];
/** Slot factors of the stat budget (catalog 1.4). */
const BUDGET_FACTOR: Record<Slot | 'one' | 'two' | 'off' | 'trinket', number> = {
  one: 0.8,
  two: 1,
  head: 0.8,
  chest: 1,
  legs: 1,
  hands: 0.6,
  feet: 0.6,
  off: 0.6,
  trinket: 0.7,
};
const ARMOR_SLOT_MULT: Record<Slot, number> = {
  chest: 1,
  legs: 0.9,
  head: 0.75,
  feet: 0.65,
  hands: 0.6,
};
const SLOTS: readonly Slot[] = ['head', 'chest', 'legs', 'hands', 'feet'];
const SHIELD_K = 13;
const MELEE_RANGE = 1.2;
const SHOT_RANGE = 8;

// ---------------------------------------------------------------------------
// The spec table (catalog_equipment.md 3.3)

const m = (name: string, level: number, wear: Wear, desc: string): Model => ({
  name,
  level,
  wear,
  desc,
});

const WEAPONS: readonly WeaponRow[] = [
  {
    cls: 'dagger',
    weaponClass: 'dagger',
    tags: ['dagger'],
    hand: 1,
    dpsFactor: 1,
    speed: 1.7,
    range: MELEE_RANGE,
    main: 'agi',
    models: [
      m('铁匕首', 3, 'metal', '一档铁砧上就能打的短匕，刃短，好藏。'),
      m('猎户短刀', 6, 'metal', '猎户剥皮、割绳用的短刀，刀背厚，不容易崩口。'),
      m('双刃匕', 9, 'metal', '两面开刃的匕首，适合贴身快刺。'),
    ],
  },
  {
    cls: 'sword',
    weaponClass: 'sword',
    tags: ['sword'],
    hand: 1,
    dpsFactor: 1,
    speed: 2.4,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('铁短剑', 3, 'metal', '量产的铁短剑，民兵与新手冒险者的第一把剑。'),
      m('卫兵铁剑', 6, 'metal', '卫队配发样式的铁剑，剑格朴素，结实耐用。'),
      m('量产长剑', 9, 'metal', '铁匠铺按同一副模子打的长剑，一把和另一把几乎分不出来。'),
    ],
  },
  {
    cls: 'sword2h',
    weaponClass: 'sword',
    tags: ['sword', 'two_hand'],
    hand: 2,
    dpsFactor: 1.35,
    speed: 3.4,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('铁阔剑', 4, 'metal', '刃身宽厚的铁剑，要用两只手才挥得稳。'),
      m('双手铁剑', 7, 'metal', '剑柄加长到能握住两只手的铁剑，砍下去分量很足。'),
      m('北境大剑', 9, 'metal', '照北境样式打的大剑，柄上缠着防滑的皮绳。'),
    ],
  },
  {
    cls: 'axe',
    weaponClass: 'axe',
    tags: ['axe'],
    hand: 1,
    dpsFactor: 1,
    speed: 2.8,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('手斧', 3, 'metal', '劈柴用的小斧，磨利了也能上阵。'),
      m('伐木斧', 6, 'metal', '伐木场常见的单手斧，斧刃厚实。'),
      m('战斧', 9, 'metal', '斧刃更窄更长，是为砍人而不是砍树打的。'),
    ],
  },
  {
    cls: 'axe2h',
    weaponClass: 'axe',
    tags: ['axe', 'two_hand'],
    hand: 2,
    dpsFactor: 1.35,
    speed: 3.6,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('劈柴大斧', 4, 'metal', '柴房里那把大斧，抡起来要两只手。'),
      m('长柄斧', 7, 'metal', '斧柄加长的重斧，挥得远，收得慢。'),
      m('双刃战斧', 9, 'metal', '两面开刃的大斧，正手反手都能劈。'),
    ],
  },
  {
    cls: 'mace',
    weaponClass: 'mace',
    tags: ['mace'],
    hand: 1,
    dpsFactor: 1,
    speed: 2.6,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('铁头棒', 3, 'metal', '木棒头上箍一圈铁，便宜，也打得疼。'),
      m('铁锤', 6, 'metal', '铁匠铺里拿来就能用的单手锤。'),
      m('钉头锤', 9, 'metal', '锤头铆着一圈铁钉，专敲甲胄。'),
    ],
  },
  {
    cls: 'mace2h',
    weaponClass: 'mace',
    tags: ['mace', 'two_hand'],
    hand: 2,
    dpsFactor: 1.35,
    speed: 3.6,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('木槌', 3, 'wood', '打桩用的大木槌，抡起来要两只手。'),
      m('碎骨锤', 6, 'metal', '锤头粗重的双手锤，名字说明了它的用处。'),
      m('大铁锤', 9, 'metal', '整块铁打的大锤头，力气不够的人举不起来。'),
    ],
  },
  {
    cls: 'polearm',
    weaponClass: 'polearm',
    tags: ['polearm', 'two_hand'],
    hand: 2,
    dpsFactor: 1.35,
    speed: 3.2,
    range: MELEE_RANGE,
    main: 'str',
    models: [
      m('木枪', 3, 'wood', '削尖再烤硬的木杆长枪，民兵操练用。'),
      m('铁头长枪', 6, 'metal', '木杆装上铁枪头，能在野兽够到你之前先够到它。'),
      m('钩镰枪', 9, 'metal', '枪头侧边带钩，能刺能拉，专把骑手与野兽拽下来。'),
    ],
  },
  {
    cls: 'fist',
    weaponClass: 'fist',
    tags: ['fist'],
    hand: 1,
    dpsFactor: 1,
    speed: 1.6,
    range: MELEE_RANGE,
    main: 'agi',
    models: [
      m('皮指套', 3, 'leather', '缝了厚皮垫的指套，护着指节打人。'),
      m('铁指虎', 6, 'metal', '套在指节上的铁环，一拳下去分量加倍。'),
      m('钉拳套', 9, 'metal', '拳面铆着短钉的拳套。'),
    ],
  },
  {
    cls: 'staff',
    weaponClass: 'staff',
    tags: ['staff', 'two_hand'],
    hand: 2,
    dpsFactor: 0.8,
    speed: 2.8,
    range: MELEE_RANGE,
    main: 'int',
    models: [
      m('木法杖', 3, 'wood', '一根顺手的长木杖，学法的人拿来稳住灵海。'),
      null, // 橡木法杖 (5): oak_staff
      m('学徒杖', 9, 'wood', '杖头嵌着一小块石英的学徒杖。'),
    ],
  },
  {
    cls: 'wand',
    weaponClass: 'rod',
    tags: ['wand'],
    hand: 1,
    dpsFactor: 0.7,
    speed: 2.2,
    range: MELEE_RANGE,
    main: 'int',
    models: [
      m('铜头录杖', 4, 'wood', '木杆包着铜头的短杖，施法时握着顺手。'),
      m('石英录杖', 7, 'wood', '杖头嵌着石英的短杖，石英里看得见细细的纹。'),
      m('见习录杖', 9, 'wood', '见习术者常用的短杖，杖身刻着练习用的纹路。'),
    ],
  },
  {
    cls: 'bow',
    weaponClass: 'bow',
    tags: ['bow', 'two_hand'],
    hand: 2,
    dpsFactor: 1,
    speed: 2.6,
    range: SHOT_RANGE,
    main: 'agi',
    models: [
      m('短弓', 3, 'wood', '一根木头弯成的短弓，射程不远，胜在好拉。'),
      null, // 猎弓 (5): hunters_bow
      m('乡勇长弓', 9, 'wood', '乡勇守村用的长弓，弓身比人还高。'),
    ],
  },
  {
    cls: 'crossbow',
    weaponClass: 'crossbow',
    tags: ['crossbow', 'two_hand'],
    hand: 2,
    dpsFactor: 1.05,
    speed: 3,
    range: SHOT_RANGE,
    main: 'agi',
    models: [
      m('木弩', 3, 'wood', '木身木臂的简易弩，上弦慢，准头不差。'),
      m('轻弩', 6, 'wood', '弩臂包了铁片的轻弩，一个人就能上弦。'),
      m('民兵弩', 9, 'wood', '民兵守墙用的弩，力道足，装填要花点时间。'),
    ],
  },
];

/** Wooden shields 0.6 x 0.8 (72 copper), round shields 0.6 x 1.0 (90), foci 0.6 (90). */
const OFF_HANDS: readonly OffHandRow[] = [
  {
    cls: 'shield',
    main: 'sta',
    models: [
      { ...m('木圆盾', 3, 'wood', '木板拼成的圆盾，挡得住一两下刀砍。'), value: 72 },
      // 坑洼圆盾 (3): dented_round_shield
      { ...m('铁边圆盾', 6, 'metal', '盾沿包了一圈铁的圆盾，比木盾经砍。'), value: 90 },
      { ...m('木鸢盾', 9, 'wood', '上宽下尖的木盾，能护住半个身子。'), value: 72 },
    ],
  },
  {
    cls: 'focus',
    main: 'int',
    models: [
      { ...m('铜灯', 4, 'metal', '握在副手的小铜灯，灯火能让人静下心来。'), value: 90 },
      { ...m('祷文册', 6, 'cloth', '抄满祷文的小册子，施法时拿在副手翻着。'), value: 90 },
      { ...m('铜铃', 9, 'metal', '摇起来声音很清的小铜铃，用来稳住呼吸与节拍。'), value: 90 },
    ],
  },
];

const ARMOR: readonly ArmorRow[] = [
  {
    armorClass: 'cloth',
    k: 2.5,
    priceFactor: 0.6,
    main: 'int',
    models: {
      head: { name: '粗布兜帽', desc: '粗布缝的兜帽，挡风挡灰。' },
      chest: { name: '粗布袍', desc: '粗布长袍，施法者与学徒常穿。' },
      legs: { name: '粗布裤', desc: '粗布缝的长裤，耐磨。' },
      hands: { name: '布手套', desc: '薄布手套，不妨碍手指掐诀。' },
      feet: { name: '布鞋', desc: '布面布底的便鞋，走路轻。' },
    },
  },
  {
    armorClass: 'leather',
    k: 5,
    priceFactor: 0.8,
    main: 'agi',
    models: {
      head: { name: '皮帽', desc: '硝过的皮子缝的软帽。' },
      chest: null, // 皮甲: worn_leather_vest
      legs: { name: '皮裤', desc: '皮子缝的长裤，在灌木里也不容易刮破。' },
      hands: { name: '皮手套', desc: '皮手套，握弓握刀都不打滑。' },
      feet: null, // 狼皮靴: wolfhide_boots
    },
  },
  {
    armorClass: 'mail',
    k: 8,
    priceFactor: 1,
    main: 'str',
    models: {
      head: { name: '铁环头巾', desc: '铁环串成的头巾，护住头与脖颈。' },
      chest: { name: '铁环衫', desc: '铁环一个扣一个串成的短衫，穿着沉，挡得住刀刃。' },
      legs: { name: '铁环裙', desc: '垂到膝盖的铁环裙，护住腿。' },
      hands: { name: '铁环手套', desc: '手背缀着铁环的手套。' },
      feet: { name: '铁环靴', desc: '靴面缀着铁环的皮靴。' },
    },
  },
  {
    armorClass: 'plate',
    k: 12,
    priceFactor: 1.6,
    main: 'str',
    models: {
      head: { name: '铁片盔', desc: '铁片缝在皮衬上的头盔，不是整块打的。' },
      chest: { name: '铁片胸甲', desc: '一片片铁片缝在皮衬上的胸甲，不是整板，但够用。' },
      legs: { name: '铁片腿甲', desc: '铁片缝在皮衬上的腿甲。' },
      hands: { name: '铁片手甲', desc: '手背缝着铁片的护手。' },
      feet: { name: '铁片靴', desc: '靴面缝着铁片的重靴。' },
    },
  },
];

/** The 信物 row: grain "any", so each model takes the main stat of its material. */
const TRINKETS: readonly TrinketRow[] = [
  { name: '铜环', main: 'sta', wear: 'metal', desc: '一枚普通的铜环，戴久了会磨出光。' },
  { name: '石英坠', main: 'int', desc: '打磨过的石英坠子，透光时能看见细纹。' },
  {
    name: '木雕护符',
    main: 'spi',
    wear: 'wood',
    desc: '洛萨人的习俗：出远门前带一枚木雕护符保平安。',
  },
  { name: '骨坠', main: 'agi', wear: 'bone', desc: '兽骨磨成的坠子，东坡的猎户常戴。' },
];

/**
 * Good (良品, quality 2) variants generated beside the common models: the masterwork items of
 * the T1 equipment recipes (catalog_gathering_crafting.md 2.6: a masterwork comes out one
 * quality up), one per class recipe that passes the economy invariant (7.1). The id adds the
 * grain's pinyin (3.1, `eq_t2_sword_2_feng`), the name puts the grain name before the common
 * name (3.1), and the grain is the row's first common grain of the 3.3 table; its first two
 * stat keys (2.4) share the budget.
 */
interface GoodRow {
  cls: string;
  /** model number n of the common model */
  n: number;
  /** grain pinyin, grain name and its two keys */
  code: string;
  grain: string;
  keys: readonly [string, string];
}

const GOOD: readonly GoodRow[] = [
  { cls: 'sword', n: 1, code: 'gang', grain: '刚纹', keys: ['str', 'sta'] },
  { cls: 'sword2h', n: 1, code: 'feng', grain: '锋纹', keys: ['str', 'crit'] },
  { cls: 'axe2h', n: 1, code: 'feng', grain: '锋纹', keys: ['str', 'crit'] },
  { cls: 'mace', n: 1, code: 'gang', grain: '刚纹', keys: ['str', 'sta'] },
  { cls: 'mace2h', n: 1, code: 'gang', grain: '刚纹', keys: ['str', 'sta'] },
  { cls: 'shield', n: 1, code: 'pan', grain: '磐纹', keys: ['sta', 'armor'] },
];

/** Quality 2 constants (catalog 1.3 price x2, 1.4 budget 0.8 and DPS x1.1, 3.2 armour +5%). */
const GOOD_QUALITY = 2;
const GOOD_PRICE = 2;
const GOOD_BUDGET = 0.8;
const GOOD_DPS = 1.1;
const GOOD_ARMOR = 1.05;
/** Points per stat key of catalog 1.4: percent keys 6 per 1%, armour 10, attack power 2. */
const PERCENT_KEYS = ['crit', 'hit', 'haste', 'dodge'];

// ---------------------------------------------------------------------------
// Formulas

/** Round half up after cutting float noise (0.5 x 7 is 3.5, not 3.4999...). */
export function roundHalfUp(x: number): number {
  return Math.floor(Math.round(x * 1e6) / 1e6 + 0.5);
}

/** Single-hand common DPS at a level: the 1.4 guide table, linear between its points. */
export function guideDps(level: number): number {
  const pts = DPS_GUIDE;
  for (let i = 1; i < pts.length; i++) {
    const [l0, d0] = pts[i - 1] as [number, number];
    const [l1, d1] = pts[i] as [number, number];
    if (level <= l1) return d0 + ((d1 - d0) * (Math.max(level, l0) - l0)) / (l1 - l0);
  }
  return (pts[pts.length - 1] as [number, number])[1];
}

/** Weapon damage from a DPS and a speed: min + max keep the DPS, min a third of the sum. */
export function weaponDamage(
  dps: number,
  speed: number,
  range: number,
): { min: number; max: number; speed: number; range: number } {
  const sum = roundHalfUp(2 * dps * speed);
  const min = Math.max(1, roundHalfUp(sum / 3));
  return { min, max: sum - min, speed, range };
}

/** The one main stat of a common piece (budget level x 0.5 x slot factor, at least 1). */
export function commonStat(level: number, slotFactor: number): number {
  return Math.max(1, roundHalfUp(level * BUDGET_QUALITY * slotFactor));
}

export function bodyArmor(level: number, k: number, slot: Slot): number {
  return roundHalfUp((10 + level * k) * ARMOR_SLOT_MULT[slot]);
}

export function shieldArmor(level: number): number {
  return 10 + level * SHIELD_K;
}

/**
 * A good piece's two keys from its budget (level x 0.8 x slot factor, rounded half up): the
 * second key takes half the points (rounded down), a percent key only in whole steps of
 * half a percent (3 points); the main key takes the rest. Points convert per catalog 1.4.
 */
export function goodStats(
  level: number,
  slotFactor: number,
  keys: readonly [string, string],
): Record<string, number> {
  const budget = roundHalfUp(level * GOOD_BUDGET * slotFactor);
  const [main, second] = keys;
  let points = Math.floor(budget / 2);
  if (PERCENT_KEYS.includes(second)) points = Math.floor(points / 3) * 3;
  const out: Record<string, number> = { [main]: budget - points };
  if (points > 0) {
    out[second] = PERCENT_KEYS.includes(second)
      ? points / 6
      : second === 'armor'
        ? points * 10
        : points;
  }
  return out;
}

type Row = Record<string, unknown>;

function item(fields: Row): Row {
  // key order of the item tables (the inventory pack's ITEM_FIELDS plus the classes)
  const ORDER = [
    'id',
    'name',
    'kind',
    'quality',
    'value',
    'desc',
    'slot',
    'level',
    'weaponClass',
    'armorClass',
    'weapon',
    'stats',
    'procs',
    'set',
    'sed',
    'maker',
    'salvage',
    'repairMaterial',
    'durability',
    'tags',
  ];
  const out: Row = {};
  for (const k of ORDER) if (fields[k] !== undefined) out[k] = fields[k];
  return out;
}

export function buildLadder(): Row[] {
  const rows: Row[] = [];
  for (const w of WEAPONS) {
    const slotFactor = w.hand === 2 ? BUDGET_FACTOR.two : BUDGET_FACTOR.one;
    const value = TIER_BASE * QUALITY * (w.hand === 2 ? 1.5 : 1);
    w.models.forEach((md, i) => {
      if (!md) return;
      rows.push(
        item({
          id: `eq_t${TIER}_${w.cls}_${i + 1}`,
          name: md.name,
          kind: 'weapon',
          quality: QUALITY,
          value,
          desc: md.desc,
          slot: 'main_hand',
          level: md.level,
          weaponClass: w.weaponClass,
          weapon: weaponDamage(guideDps(md.level) * w.dpsFactor, w.speed, w.range),
          stats: { [w.main]: commonStat(md.level, slotFactor) },
          tags: [...w.tags, md.wear],
        }),
      );
    });
  }
  for (const o of OFF_HANDS) {
    o.models.forEach((md, i) => {
      const stats: Record<string, number> = {};
      if (o.cls === 'shield') stats.armor = shieldArmor(md.level);
      stats[o.main] = commonStat(md.level, BUDGET_FACTOR.off);
      rows.push(
        item({
          id: `eq_t${TIER}_${o.cls}_${i + 1}`,
          name: md.name,
          kind: 'armor',
          quality: QUALITY,
          value: md.value,
          desc: md.desc,
          slot: 'off_hand',
          level: md.level,
          stats,
          tags: [o.cls, md.wear],
        }),
      );
    });
  }
  for (const a of ARMOR) {
    for (const slot of SLOTS) {
      const md = a.models[slot];
      if (!md) continue;
      const big = slot === 'chest' || slot === 'legs';
      rows.push(
        item({
          id: `eq_t${TIER}_${a.armorClass}_${slot}`,
          name: md.name,
          kind: 'armor',
          quality: QUALITY,
          value: roundHalfUp(TIER_BASE * QUALITY * a.priceFactor * (big ? 1 : 0.6)),
          desc: md.desc,
          slot,
          level: ARMOR_LEVEL,
          armorClass: a.armorClass,
          stats: {
            armor: bodyArmor(ARMOR_LEVEL, a.k, slot),
            [a.main]: commonStat(ARMOR_LEVEL, BUDGET_FACTOR[slot]),
          },
          tags: [a.armorClass],
        }),
      );
    }
  }
  for (const g of GOOD) {
    const base = rows.find((r) => r.id === `eq_t${TIER}_${g.cls}_${g.n}`);
    const w = WEAPONS.find((x) => x.cls === g.cls);
    if (!base) throw new Error(`good variant ${g.cls}_${g.n}: no common model`);
    const level = base.level as number;
    const stats: Record<string, number> = {};
    let weapon: Row['weapon'];
    if (w) {
      const slotFactor = w.hand === 2 ? BUDGET_FACTOR.two : BUDGET_FACTOR.one;
      weapon = weaponDamage(guideDps(level) * w.dpsFactor * GOOD_DPS, w.speed, w.range);
      Object.assign(stats, goodStats(level, slotFactor, g.keys));
    } else {
      // the off hand: a shield keeps its base armour (+5%) under the grain's points
      stats.armor = roundHalfUp(shieldArmor(level) * GOOD_ARMOR);
      const grain = goodStats(level, BUDGET_FACTOR.off, g.keys);
      for (const [k, v] of Object.entries(grain)) stats[k] = (stats[k] ?? 0) + v;
    }
    rows.push(
      item({
        ...base,
        id: `${base.id as string}_${g.code}`,
        name: `${g.grain}${base.name as string}`,
        quality: GOOD_QUALITY,
        value: (base.value as number) * GOOD_PRICE,
        weapon,
        stats,
      }),
    );
  }
  TRINKETS.forEach((t, i) => {
    rows.push(
      item({
        id: `eq_t${TIER}_trinket_${i + 1}`,
        name: t.name,
        kind: 'trinket',
        quality: QUALITY,
        value: roundHalfUp(TIER_BASE * QUALITY * 1.2),
        desc: t.desc,
        slot: 'trinket',
        level: ARMOR_LEVEL,
        stats: { [t.main]: commonStat(ARMOR_LEVEL, BUDGET_FACTOR.trinket) },
        tags: t.wear ? [t.wear] : undefined,
      }),
    );
  });
  return rows;
}

async function main(): Promise<number> {
  // Node strips the types of this file; sibling modules load by file URL (explicit .ts).
  const { formatJsonFile } = (await import(
    new URL('../data_paths.ts', import.meta.url).href
  )) as DataPaths;
  const rows = buildLadder();
  if (process.argv.includes('--check')) {
    // compare the rows, not the layout (the file may be reformatted by biome)
    let cur: unknown = null;
    try {
      cur = JSON.parse(readFileSync(OUT, 'utf8'));
    } catch {
      cur = null;
    }
    if (JSON.stringify(cur) !== JSON.stringify(rows)) {
      console.error(
        'data/items/equipment_t1.json is stale: run node tools/content/equipment_ladder.ts',
      );
      return 1;
    }
    console.log(`data/items/equipment_t1.json is current (${rows.length} models)`);
    return 0;
  }
  writeFileSync(OUT, formatJsonFile(rows));
  console.log(`wrote data/items/equipment_t1.json (${rows.length} models)`);
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then((code) => {
    process.exitCode = code;
  });
}
