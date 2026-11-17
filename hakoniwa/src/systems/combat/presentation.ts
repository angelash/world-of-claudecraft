// Hit-sound selection fields of every combat.damage event (combat_and_classes.md 8.3,
// audio_direction.md 7.16): the weapon class of the striking hand, the damage kind it
// implies, the material of the target, a heavy blow and a ranged one. The kernel never
// reads the cue table; it only carries what the cue table selects on. Every outcome
// (miss, dodge, parry, block, resist, absorb, immune) carries the same fields.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import type { ItemDef } from '../inventory';
import { abilityDef, classDef, monsterDef } from './defs';
import type { Derived } from './stats';
import type { ArmorClass, DamageKind, HitMaterial, MobFamily, Unit, WeaponClass } from './types';

export interface HitPresentation {
  weaponClass: WeaponClass;
  damageKind?: DamageKind;
  material: HitMaterial;
  heavy: boolean;
  ranged: boolean;
}

const WEAPON_CLASSES: readonly WeaponClass[] = [
  'sword',
  'axe',
  'mace',
  'dagger',
  'polearm',
  'staff',
  'rod',
  'fist',
  'unarmed',
  'bow',
  'crossbow',
  'thrown',
];
const ARMOR_CLASSES: readonly ArmorClass[] = ['cloth', 'leather', 'mail', 'plate'];

/** The damage kind of a weapon class (8.3): swords and axes slash, maces and fists bludgeon. */
export function damageKindOf(w: WeaponClass): DamageKind | undefined {
  switch (w) {
    case 'sword':
    case 'axe':
      return 'slash';
    case 'dagger':
    case 'polearm':
    case 'thrown':
      return 'pierce';
    case 'bow':
    case 'crossbow':
      return 'arrow';
    case 'none':
      return undefined;
    default:
      return 'blunt';
  }
}

/** Material of a monster family when the bestiary row names none (audio 7.16). */
const FAMILY_MATERIAL: Readonly<Record<MobFamily, HitMaterial>> = {
  beast: 'flesh',
  humanoid: 'flesh',
  spider: 'flesh',
  burrower: 'flesh',
  dragonkin: 'flesh',
  demon: 'flesh',
  undead: 'bone',
  elemental: 'ash',
  construct: 'stone',
};

/** An armour class as the material a blow lands on (cloth and bare skin are flesh). */
export function armorMaterial(a: ArmorClass | undefined): HitMaterial {
  return a && a !== 'cloth' ? a : 'flesh';
}

/** The weapon class of an item: its own field, else a class word among its tags. */
export function itemWeaponClass(item: ItemDef): WeaponClass | undefined {
  const own = (item as { weaponClass?: WeaponClass }).weaponClass;
  if (own) return own;
  return WEAPON_CLASSES.find((w) => item.tags?.includes(w));
}

/** The armour class of an item: its own field, else a class word among its tags. */
export function itemArmorClass(item: ItemDef): ArmorClass | undefined {
  const own = (item as { armorClass?: ArmorClass }).armorClass;
  if (own) return own;
  return ARMOR_CLASSES.find((a) => item.tags?.includes(a));
}

/**
 * The weapon class of a unit's blow (8.3): spells and periodic effects are `none`; a
 * disarmed hand is `unarmed`; a monster strikes with its bestiary class, a humanoid with
 * its borrowed vocation's; a class unit with its main-hand weapon, bare hands when it has
 * none. A weapon item with no class of its own falls back on a ranged profile (a bow) or
 * the vocation's weapon.
 */
export function weaponClassOf(content: ContentMap, u: Unit, d: Derived): WeaponClass {
  if (d.cc.disarm) return 'unarmed';
  const mon = monsterDef(content, u.monsterId);
  const cls = classDef(content, u.classId);
  if (mon) return mon.weaponClass ?? cls?.weaponClass ?? 'unarmed';
  const hand = d.mainHand;
  if (!hand) return 'unarmed';
  return (
    itemWeaponClass(hand) ?? ((hand.weapon?.range ?? 0) > 2 ? 'bow' : (cls?.weaponClass ?? 'sword'))
  );
}

/**
 * What a blow on a unit lands on (8.3): the bestiary material; a person's chest armour
 * (bare or cloth is flesh); a humanoid without gear wears its vocation's armour; else the
 * family's material.
 */
export function materialOf(world: World, content: ContentMap, u: Unit, d: Derived): HitMaterial {
  void world;
  const mon = monsterDef(content, u.monsterId);
  if (mon?.material) return mon.material;
  const cls = classDef(content, u.classId);
  if (!mon) return d.chest ? armorMaterial(itemArmorClass(d.chest) ?? cls?.armorType) : 'flesh';
  if (cls) return armorMaterial(cls.armorType);
  return FAMILY_MATERIAL[mon.family] ?? 'flesh';
}

/** The five fields of a blow from `source` on `target` (8.3). */
export function hitPresentation(
  world: World,
  content: ContentMap,
  source: Unit,
  sd: Derived,
  target: Unit,
  td: Derived,
  kind: 'melee' | 'ranged' | 'spell' | 'periodic' | 'reflect',
  abilityId: string | undefined,
): HitPresentation {
  const weapon = kind === 'melee' || kind === 'ranged';
  const weaponClass: WeaponClass = weapon ? weaponClassOf(content, source, sd) : 'none';
  const ranged =
    weapon &&
    (kind === 'ranged' ||
      weaponClass === 'bow' ||
      weaponClass === 'crossbow' ||
      weaponClass === 'thrown');
  const out: HitPresentation = {
    weaponClass,
    material: materialOf(world, content, target, td),
    heavy: weapon && !!(abilityId && abilityDef(content, abilityId)?.heavy),
    ranged,
  };
  const dk = damageKindOf(weaponClass);
  if (dk) out.damageKind = dk;
  return out;
}
