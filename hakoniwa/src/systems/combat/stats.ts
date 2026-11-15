// Derived combat stats of a unit: class base and growth (or the monster curve), plus
// equipment (inventory `equippedDefs`), door bonuses and auras. Computed on demand;
// units are few and the inputs are small, so nothing is cached between ticks.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { equippedDefs } from '../inventory';
import { auraDef, classDef, monsterDef } from './defs';
import {
  attackPower,
  ELITE_DMG,
  ELITE_HP,
  hpFromStamina,
  manaFromIntellect,
  monsterArmor,
  monsterBaseDamage,
  monsterBaseHp,
  spellPowerFromInt,
} from './formulas';
import type { AuraMods, CcKind, ResourceKind, StatBlock, StatKey, Unit } from './types';

export interface Weapon {
  min: number;
  max: number;
  speed: number;
  range: number;
  /** monster swings are flat; class swings add attack power */
  flat: boolean;
}

export interface Derived {
  stats: Required<StatBlock>;
  maxHp: number;
  maxRes: Partial<Record<ResourceKind, number>>;
  weapon: Weapon;
  mods: Required<AuraMods>;
  cc: Record<CcKind, boolean>;
  /** movement speed multiplier (0 when rooted or stunned) */
  speedMult: number;
  canParry: boolean;
  hasShield: boolean;
}

const STAT_KEYS: StatKey[] = [
  'str',
  'agi',
  'sta',
  'int',
  'spi',
  'armor',
  'ap',
  'sp',
  'crit',
  'hit',
  'haste',
  'dodge',
];

function emptyStats(): Required<StatBlock> {
  return {
    str: 0,
    agi: 0,
    sta: 0,
    int: 0,
    spi: 0,
    armor: 0,
    ap: 0,
    sp: 0,
    crit: 0,
    hit: 0,
    haste: 0,
    dodge: 0,
  };
}

function addStats(into: Required<StatBlock>, s: StatBlock | Record<string, number>, k = 1): void {
  for (const key of STAT_KEYS) {
    const v = (s as Record<string, number | undefined>)[key];
    if (typeof v === 'number') into[key] += v * k;
  }
}

export function deriveStats(world: World, content: ContentMap, u: Unit): Derived {
  const stats = emptyStats();
  const mods: Required<AuraMods> = {
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    healingTaken: 0,
    haste: 0,
    speed: 0,
    armorPct: 0,
  };
  const cc: Record<CcKind, boolean> = {
    stun: false,
    root: false,
    silence: false,
    slow: false,
    fear: false,
    incapacitate: false,
  };
  const cls = classDef(content, u.classId);
  const mon = monsterDef(content, u.monsterId);
  const L = u.level;
  if (cls) {
    for (const key of ['str', 'agi', 'sta', 'int', 'spi'] as const) {
      stats[key] += cls.base[key] + cls.growth[key] * (L - 1);
    }
  }
  for (const b of Object.values(u.bonuses)) addStats(stats, b);

  let weapon: Weapon = cls
    ? { ...cls.unarmed, range: cls.attackRange ?? 0, flat: false }
    : { min: 1, max: 2, speed: 2, range: 0, flat: false };
  let hasShield = false;
  if (u.classId) {
    for (const item of equippedDefs(world, content, u.id)) {
      if (item.stats) addStats(stats, item.stats);
      if (item.slot === 'main_hand' && item.weapon) {
        weapon = {
          min: item.weapon.min,
          max: item.weapon.max,
          speed: item.weapon.speed,
          range: item.weapon.range > 2 ? item.weapon.range : (cls?.attackRange ?? 0),
          flat: false,
        };
      }
      if (item.slot === 'off_hand' && (item.tags?.includes('shield') ?? false)) hasShield = true;
    }
  }

  let slow = 0;
  for (const a of u.auras) {
    const def = auraDef(content, a.id);
    if (!def) continue;
    if (def.stats) addStats(stats, def.stats, a.stacks);
    if (def.statsPerLevel) addStats(stats, def.statsPerLevel, a.stacks * a.lvl);
    if (def.mods) {
      for (const key of Object.keys(def.mods) as (keyof AuraMods)[]) {
        mods[key] += (def.mods[key] ?? 0) * a.stacks;
      }
    }
    if (def.cc) cc[def.cc] = true;
    if (def.slow) slow = Math.max(slow, def.slow);
  }
  if (slow > 0) cc.slow = true;

  let maxHp: number;
  const maxRes: Partial<Record<ResourceKind, number>> = {};
  if (mon) {
    const elite = mon.rank === 'elite' || mon.rank === 'rare' || mon.rank === 'boss';
    const dmg =
      monsterBaseDamage(L) *
      (mon.dmgMult ?? 1) *
      (elite ? ELITE_DMG : 1) *
      u.power *
      ((mon.attackSpeed ?? 2) / 2);
    weapon = {
      min: dmg * 0.85,
      max: dmg * 1.15,
      speed: mon.attackSpeed ?? 2,
      range: mon.range ?? 0,
      flat: true,
    };
    maxHp = monsterBaseHp(L) * (mon.hpMult ?? 1) * (elite ? ELITE_HP : 1) * u.power;
    stats.armor += monsterArmor(L) * (mon.armorMult ?? 1);
    if (!cls) {
      stats.ap += L * 3;
      stats.sp += L * 3;
    }
  } else {
    maxHp =
      (cls ? cls.hp + cls.hpPerLevel * (L - 1) : 40 + 15 * (L - 1)) + hpFromStamina(stats.sta);
  }
  maxHp = Math.max(1, Math.round(maxHp));

  stats.armor += stats.agi * 2;
  stats.armor *= Math.max(0, 1 + mods.armorPct);
  stats.ap += attackPower(cls?.apFrom ?? 'str_agi', stats.str, stats.agi);
  stats.sp += spellPowerFromInt(stats.int);
  stats.haste += mods.haste * 100;

  if (cls?.resource === 'mana') {
    maxRes.mana = Math.round(
      (cls.mana ?? 0) + (cls.manaPerLevel ?? 0) * (L - 1) + manaFromIntellect(stats.int),
    );
  } else if (cls?.resource) {
    maxRes[cls.resource] = 100;
  }
  for (const kind of Object.keys(u.pools) as ResourceKind[]) {
    const sources = u.pools[kind];
    if (!sources) continue;
    const grant = Math.max(0, ...Object.values(sources));
    if (grant <= 0) continue;
    const max =
      kind === 'mana' ? Math.round(grant + 18 * (L - 1) + manaFromIntellect(stats.int)) : 100;
    maxRes[kind] = Math.max(maxRes[kind] ?? 0, max);
  }

  let speedMult = (1 - slow) * Math.max(0.1, 1 + mods.speed);
  if (cc.root || cc.stun || cc.incapacitate) speedMult = 0;

  return {
    stats,
    maxHp,
    maxRes,
    weapon,
    mods,
    cc,
    speedMult,
    canParry: (cls?.canParry ?? false) || mon?.family === 'humanoid',
    hasShield,
  };
}

/** True while the unit cannot act at all (stun, fear, incapacitate). */
export function isDisabled(d: Derived): boolean {
  return d.cc.stun || d.cc.fear || d.cc.incapacitate;
}
