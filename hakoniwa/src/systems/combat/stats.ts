// Derived combat stats of a unit: class base and growth (or the monster curve), plus
// equipment (inventory `equippedDefs`), door bonuses and auras. Computed on demand;
// units are few and the inputs are small, so nothing is cached between ticks. Auras of one
// group count only their strongest member (8.2); an aura with `byStacks` takes the entry of
// its stack count. Enemy-side health carries the difficulty's factor (16). A maimed arm
// cannot wield a two-handed weapon (9.4: it strikes bare-handed, weapon skills refused); a
// frenzied monster swings faster the less health it has left (11 `frenzyOnHit`).

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { equippedDefs, type ItemDef } from '../inventory';
import { auraDef, classDef, monsterDef } from './defs';
import { combatMod } from './difficulty';
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
import type {
  Aura,
  AuraDef,
  AuraMods,
  CcKind,
  ResourceKind,
  StatBlock,
  StatKey,
  Unit,
} from './types';

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
  /** the main-hand weapon item in use (none while disarmed or empty-handed) */
  mainHand: ItemDef | undefined;
  /** a two-handed weapon is worn but the arm cannot hold it (a maimed arm, 9.4) */
  twoHandLocked: boolean;
  /** the chest piece worn */
  chest: ItemDef | undefined;
  mods: Required<AuraMods>;
  cc: Record<CcKind, boolean>;
  /** movement speed multiplier (0 when rooted or stunned) */
  speedMult: number;
  /** cast and swing interval multiplier (1.1 is 10% slower; presence 3.5) */
  intervalMult: number;
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

function emptyMods(): Required<AuraMods> {
  return {
    damageDealt: 0,
    damageTaken: 0,
    healingDone: 0,
    healingTaken: 0,
    haste: 0,
    speed: 0,
    armorPct: 0,
    maxHpPct: 0,
    interval: 0,
    doorSkillCost: 0,
    ccDurationDone: 0,
    ccDurationTaken: 0,
    hpRegen: 0,
    manaRegen: 0,
    doorSkillCooldown: 0,
  };
}

function addStats(into: Required<StatBlock>, s: StatBlock | Record<string, number>, k = 1): void {
  for (const key of STAT_KEYS) {
    const v = (s as Record<string, number | undefined>)[key];
    if (typeof v === 'number') into[key] += v * k;
  }
}

/**
 * The slow and modifiers an aura instance contributes: its stack entry, or its per-stack
 * effect times the stacks (`k`), times the instance's strength (`scale`, 3.5).
 */
export function auraEffect(
  def: AuraDef,
  stacks: number,
  scale = 1,
): { slow: number; mods: AuraMods; k: number } {
  if (def.byStacks && def.byStacks.length > 0) {
    const i = Math.max(0, Math.min(def.byStacks.length - 1, stacks - 1));
    const e = def.byStacks[i] ?? {};
    return { slow: (e.slow ?? 0) * scale, mods: e.mods ?? {}, k: scale };
  }
  return { slow: (def.slow ?? 0) * scale, mods: def.mods ?? {}, k: stacks * scale };
}

/** How strong a grouped aura is (8.2 "数值最强"): its slow, else its summed magnitudes. */
function strength(def: AuraDef, stacks: number): number {
  const e = auraEffect(def, stacks);
  if (e.slow > 0) return e.slow;
  let s = 0;
  for (const v of Object.values(e.mods)) s += Math.abs(v ?? 0) * e.k;
  for (const v of Object.values(def.stats ?? {})) s += Math.abs(v ?? 0) * stacks;
  return s;
}

/** The auras that count: every ungrouped one, and the strongest of each group (8.2). */
export function countedAuras(content: ContentMap, auras: readonly Aura[]): Aura[] {
  const best = new Map<string, { a: Aura; s: number }>();
  const out: Aura[] = [];
  for (const a of auras) {
    const def = auraDef(content, a.id);
    if (!def?.group) {
      out.push(a);
      continue;
    }
    const s = strength(def, a.stacks);
    const cur = best.get(def.group);
    if (!cur || s > cur.s) best.set(def.group, { a, s });
  }
  for (const a of auras) {
    const def = auraDef(content, a.id);
    if (def?.group && best.get(def.group)?.a === a) out.push(a);
  }
  return out;
}

export function deriveStats(world: World, content: ContentMap, u: Unit): Derived {
  const stats = emptyStats();
  const mods = emptyMods();
  const cc: Record<CcKind, boolean> = {
    stun: false,
    root: false,
    silence: false,
    slow: false,
    fear: false,
    incapacitate: false,
    disarm: false,
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

  let slow = 0;
  let noTwoHand = false;
  const auras = u.auras.length > 0 ? countedAuras(content, u.auras) : u.auras;
  for (const a of auras) {
    const def = auraDef(content, a.id);
    if (!def) continue;
    if (def.noTwoHand) noTwoHand = true;
    if (def.stats) addStats(stats, def.stats, a.stacks);
    if (def.statsPerLevel) addStats(stats, def.statsPerLevel, a.stacks * a.lvl);
    const e = auraEffect(def, a.stacks, a.scale ?? 1);
    for (const key of Object.keys(e.mods) as (keyof AuraMods)[]) {
      mods[key] += (e.mods[key] ?? 0) * e.k;
    }
    if (a.ccOff) continue;
    if (def.cc) cc[def.cc] = true;
    if (e.slow) slow = Math.max(slow, e.slow);
  }
  if (slow > 0) cc.slow = true;

  let weapon: Weapon = cls
    ? { ...cls.unarmed, range: cls.attackRange ?? 0, flat: false }
    : { min: 1, max: 2, speed: 2, range: 0, flat: false };
  let hasShield = false;
  let mainHand: ItemDef | undefined;
  let chest: ItemDef | undefined;
  let twoHandLocked = false;
  if (u.classId) {
    for (const item of equippedDefs(world, content, u.id)) {
      if (item.stats) addStats(stats, item.stats);
      const twoHand = item.tags?.includes('two_hand') ?? false;
      if (item.slot === 'main_hand' && item.weapon && noTwoHand && twoHand) twoHandLocked = true;
      if (item.slot === 'main_hand' && item.weapon && !cc.disarm && !(noTwoHand && twoHand)) {
        mainHand = item;
        weapon = {
          min: item.weapon.min,
          max: item.weapon.max,
          speed: item.weapon.speed,
          range: item.weapon.range > 2 ? item.weapon.range : (cls?.attackRange ?? 0),
          flat: false,
        };
      }
      if (item.slot === 'chest') chest = item;
      if (item.slot === 'off_hand' && (item.tags?.includes('shield') ?? false)) hasShield = true;
    }
    // disarmed: the main hand does not count, the swing is the vocation's bare hands (9.1)
    if (cc.disarm && cls) weapon = { ...cls.unarmed, range: 0, flat: false };
  }

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
  if (u.side === 'enemy') maxHp *= combatMod(world, 'enemy_hp');
  if (u.hpScale !== undefined) maxHp *= u.hpScale;
  maxHp *= Math.max(0.1, 1 + mods.maxHpPct);
  maxHp = Math.max(1, Math.round(maxHp));

  stats.armor += stats.agi * 2;
  stats.armor *= Math.max(0, 1 + mods.armorPct);
  stats.ap += attackPower(cls?.apFrom ?? 'str_agi', stats.str, stats.agi);
  stats.sp += spellPowerFromInt(stats.int);
  stats.haste += mods.haste * 100;
  const frenzy = mon?.mechanics?.frenzyOnHit;
  if (frenzy && maxHp > 0) {
    // the less health left, the faster it swings: amount per missing tenth, up to max
    const missing = Math.max(0, Math.min(1, 1 - u.hp / maxHp));
    stats.haste += Math.min(frenzy.max, frenzy.amount * missing * 10) * 100;
  }

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
    mainHand,
    twoHandLocked,
    chest,
    mods,
    cc,
    speedMult,
    intervalMult: Math.max(0.1, 1 + mods.interval),
    canParry: (cls?.canParry ?? false) || mon?.family === 'humanoid',
    hasShield,
  };
}

/** True while the unit cannot act at all (stun, fear, incapacitate). */
export function isDisabled(d: Derived): boolean {
  return d.cc.stun || d.cc.fear || d.cc.incapacitate;
}
