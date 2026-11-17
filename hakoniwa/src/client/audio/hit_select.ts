// Hit-sound selection fields (combat_and_classes.md 8.3; audio_direction.md 7.16): what a
// `combat.damage` event needs for the cue table to pick its sounds, the weapon class of the
// striking hand, the damage kind it implies, the target's material, a heavy blow and a ranged
// one, and how those become the cue table's trigger fields (weapon and weight of the swing,
// damage and material of the hit, the arrow's material, the ranged release). The kernel may
// carry the five fields on the event; each one it carries wins, the rest are derived here from
// the attacker and target as the client sees them (monster family and body, the borrowed
// class, the equipped weapon and chest armour). Monster voice families, boss voices and
// footstep surfaces come from the same data table, data/audio/selection.json. Pure.

import type { CueValue } from './cue_map';

/** Weapon classes of 8.3. */
export const WEAPON_CLASSES = [
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
  'none',
] as const;
export type WeaponClass = (typeof WEAPON_CLASSES)[number];

export const DAMAGE_KINDS = ['slash', 'pierce', 'blunt', 'arrow'] as const;
export type DamageKind = (typeof DAMAGE_KINDS)[number];

export const HIT_MATERIALS = [
  'flesh',
  'leather',
  'mail',
  'plate',
  'bone',
  'spirit',
  'ash',
  'crystal',
  'stone',
  'wood',
] as const;
export type HitMaterial = (typeof HIT_MATERIALS)[number];

export type ArmorClass = 'cloth' | 'leather' | 'mail' | 'plate';

/** The five fields of 8.3. */
export interface HitSelection {
  weaponClass: WeaponClass;
  /** null for spells */
  damageKind: DamageKind | null;
  material: HitMaterial;
  heavy: boolean;
  ranged: boolean;
}

/** The selection table, data/audio/selection.json. */
export interface SelectionTable {
  version: 1;
  /** Borrowed class to its weapon (humanoid monsters, people without a known weapon). */
  classWeapons: Record<string, WeaponClass>;
  /** Appearance body to voice family and material. */
  bodies: Record<string, { voice?: string; material?: HitMaterial }>;
  /** Kernel family to voice family and material when the body says nothing. */
  families: Record<string, { voice?: string; material?: HitMaterial }>;
  /** Appearance body to boss voice; `default` for the rest. */
  bossVoices: Record<string, string>;
  /** Boss music by kernel family; `default` for the rest. */
  bossMusic: Record<string, string>;
  /** Tile kind to footstep surface; `dungeonFloor` replaces wooden floor below ground. */
  surfaces: Record<string, string>;
  dungeonFloor: string;
}

/** One side of a blow as the client sees it. Every field is optional. */
export interface Combatant {
  isMonster?: boolean;
  /** MonsterDef.weaponClass, or the striking hand's item class */
  weaponClass?: string | null;
  /** The striking hand holds a two-handed weapon (greatsword, greataxe, maul). */
  twoHanded?: boolean;
  /** The striking hand holds a weapon whose class is not known (no class field yet). */
  armed?: boolean;
  /** Melee reach in tiles of the hand or the monster (beyond 3: a ranged attacker). */
  reach?: number;
  family?: string;
  body?: string;
  classId?: string | null;
  /** MonsterDef.material */
  material?: string | null;
  /** MonsterDef.voice */
  voice?: string | null;
  /** Armour class of the chest piece (people), or the borrowed class's (monsters). */
  armor?: ArmorClass | null;
  /** Off-hand shield material. */
  shield?: 'wood' | 'metal' | null;
  /** Visual size (Appearance.scale). */
  scale?: number;
}

/** What the event may carry (8.3) besides school and outcome. */
export interface HitEventLike {
  abilityId?: string;
  school?: string;
  outcome?: string;
  weaponClass?: string;
  damageKind?: string;
  material?: string;
  heavy?: boolean;
  ranged?: boolean;
}

/** The ability behind the blow, if any. */
export interface AbilityLike {
  /** A weapon strike (a damage effect that adds a weapon swing). */
  weaponStrike: boolean;
  heavy?: boolean;
}

const has = <T extends string>(list: readonly T[], v: unknown): v is T =>
  typeof v === 'string' && (list as readonly string[]).includes(v);

/** The damage kind a weapon class implies (8.3). */
export function damageKindOf(w: WeaponClass): DamageKind | null {
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
      return null;
    default:
      return 'blunt';
  }
}

const RANGED_CLASSES: ReadonlySet<WeaponClass> = new Set(['bow', 'crossbow', 'thrown']);

/** The weapon class of the striking hand (8.3). */
export function weaponClassOf(
  source: Combatant | null,
  ability: AbilityLike | null,
  table: SelectionTable,
): WeaponClass {
  if (ability && !ability.weaponStrike) return 'none';
  const s = source ?? {};
  if (has(WEAPON_CLASSES, s.weaponClass)) return s.weaponClass;
  if (s.isMonster) {
    if (s.family === 'humanoid' && s.classId) return table.classWeapons[s.classId] ?? 'unarmed';
    return (s.reach ?? 0) > 3 ? 'thrown' : 'unarmed';
  }
  if (s.armed) return (s.reach ?? 0) > 3 ? 'bow' : 'sword';
  return 'unarmed';
}

const ARMOR_MATERIAL: Record<ArmorClass, HitMaterial> = {
  cloth: 'flesh',
  leather: 'leather',
  mail: 'mail',
  plate: 'plate',
};

/** The target's material (8.3; 7.16 material table). */
export function materialOf(target: Combatant | null, table: SelectionTable): HitMaterial {
  const t = target ?? {};
  if (has(HIT_MATERIALS, t.material)) return t.material;
  if (t.isMonster && t.family !== 'humanoid' && t.family !== 'beast') {
    const byBody = t.body ? table.bodies[t.body]?.material : undefined;
    if (byBody) return byBody;
    const byFamily = t.family ? table.families[t.family]?.material : undefined;
    if (byFamily) return byFamily;
  }
  if (t.isMonster && t.family === 'beast') {
    const byBody = t.body ? table.bodies[t.body]?.material : undefined;
    if (byBody) return byBody;
  }
  return t.armor ? ARMOR_MATERIAL[t.armor] : 'flesh';
}

/** The five selection fields of one blow; fields the event carries win. */
export function selectHit(
  ev: HitEventLike,
  source: Combatant | null,
  target: Combatant | null,
  ability: AbilityLike | null,
  table: SelectionTable,
): HitSelection {
  const weaponClass = has(WEAPON_CLASSES, ev.weaponClass)
    ? ev.weaponClass
    : weaponClassOf(source, ability, table);
  const damageKind = has(DAMAGE_KINDS, ev.damageKind) ? ev.damageKind : damageKindOf(weaponClass);
  const material = has(HIT_MATERIALS, ev.material) ? ev.material : materialOf(target, table);
  const heavy = typeof ev.heavy === 'boolean' ? ev.heavy : !!ability?.heavy;
  const ranged = typeof ev.ranged === 'boolean' ? ev.ranged : RANGED_CLASSES.has(weaponClass);
  return { weaponClass, damageKind, material, heavy, ranged };
}

/** The swing family of sfx_wpn_ for a weapon class, or null for ranged and spells. */
export function swingWeaponOf(w: WeaponClass, twoHanded: boolean): string | null {
  switch (w) {
    case 'sword':
      return twoHanded ? 'greatsword' : 'sword';
    case 'axe':
      return twoHanded ? 'greataxe' : 'axe';
    case 'mace':
      return twoHanded ? 'maul' : 'mace';
    case 'dagger':
      return 'dagger';
    case 'polearm':
      return 'spear';
    case 'staff':
    case 'rod':
      return 'staff';
    case 'fist':
    case 'unarmed':
      return 'unarmed';
    default:
      return null;
  }
}

/** The arrow material of 7.16 (flesh, metal armour, wood, stone; the ground on a miss). */
export function arrowMaterialOf(m: HitMaterial): 'flesh' | 'metal' | 'wood' | 'stone' {
  if (m === 'mail' || m === 'plate') return 'metal';
  if (m === 'wood') return 'wood';
  if (m === 'stone' || m === 'crystal' || m === 'bone') return 'stone';
  return 'flesh';
}

/**
 * The cue table's trigger fields for a blow: `attack`, `weapon` and `weight` (the swing),
 * `damage` and `material` (the hit), `arrowMaterial`, `rangedWeapon`, `parry` and `shield`.
 */
export function hitCueFields(
  sel: HitSelection,
  opts: { twoHanded?: boolean; targetShield?: 'wood' | 'metal' | null } = {},
): Record<string, CueValue> {
  const out: Record<string, CueValue> = {
    attack: sel.weaponClass === 'none' ? 'spell' : sel.ranged ? 'ranged' : 'melee',
    weight: sel.heavy ? 'heavy' : 'light',
    material: sel.material,
    arrowMaterial: arrowMaterialOf(sel.material),
    shield: opts.targetShield ?? 'wood',
    parry:
      sel.heavy || opts.twoHanded || sel.weaponClass === 'mace' || sel.weaponClass === 'axe'
        ? 'heavy'
        : 'blade',
  };
  const swing = swingWeaponOf(sel.weaponClass, !!opts.twoHanded);
  if (swing) out.weapon = swing;
  if (sel.damageKind && sel.damageKind !== 'arrow') out.damage = sel.damageKind;
  if (sel.weaponClass === 'bow' || sel.weaponClass === 'crossbow' || sel.weaponClass === 'thrown')
    out.rangedWeapon = sel.weaponClass;
  return out;
}

/** A monster's voice family (7.16): MonsterDef.voice, then its body, then its family. */
export function voiceOf(c: Combatant | null, table: SelectionTable): string | null {
  if (!c) return null;
  if (c.voice) return c.voice;
  const byBody = c.body ? table.bodies[c.body]?.voice : undefined;
  if (byBody) return byBody;
  return (c.family ? table.families[c.family]?.voice : undefined) ?? null;
}

/** A boss's roar voice by body, or the table's default. */
export function bossVoiceOf(c: Combatant | null, table: SelectionTable): string {
  return (c?.body ? table.bossVoices[c.body] : undefined) ?? table.bossVoices.default ?? 'champion';
}

/** The boss track by kernel family, or the table's default. */
export function bossMusicOf(family: string | undefined, table: SelectionTable): string {
  return (
    (family ? table.bossMusic[family] : undefined) ?? table.bossMusic.default ?? 'mus_boss_standard'
  );
}

/** The footstep surface of a tile kind (below ground a wooden floor is stone). */
export function surfaceOf(tile: string, dungeon: boolean, table: SelectionTable): string | null {
  const s = table.surfaces[tile];
  if (!s) return null;
  return dungeon && tile === 'floor' ? table.dungeonFloor : s;
}

/** Structural problems of the selection table against the cue table's field domains. */
export function validateSelectionTable(
  raw: unknown,
  domains: Record<string, readonly CueValue[]>,
  known?: ReadonlySet<string>,
): string[] {
  const out: string[] = [];
  const t = raw as Partial<SelectionTable>;
  if (!t || typeof t !== 'object') return ['selection table must be an object'];
  if (t.version !== 1) out.push('version must be 1');
  const inDomain = (where: string, field: string, v: unknown): void => {
    const d = domains[field];
    if (!d) out.push(`${where}: the cue table has no field ${field}`);
    else if (!d.includes(v as CueValue)) out.push(`${where}: ${String(v)} is not a ${field} value`);
  };
  for (const [k, w] of Object.entries(t.classWeapons ?? {}))
    if (!has(WEAPON_CLASSES, w)) out.push(`classWeapons.${k}: ${String(w)} is not a weapon class`);
  for (const [name, rows] of [
    ['bodies', t.bodies],
    ['families', t.families],
  ] as const) {
    for (const [k, r] of Object.entries(rows ?? {})) {
      if (r?.voice !== undefined) inDomain(`${name}.${k}`, 'voice', r.voice);
      if (r?.material !== undefined && !has(HIT_MATERIALS, r.material))
        out.push(`${name}.${k}: ${String(r.material)} is not a material`);
    }
  }
  if (!t.bossVoices?.default) out.push('bossVoices needs a default');
  for (const [k, v] of Object.entries(t.bossVoices ?? {}))
    inDomain(`bossVoices.${k}`, 'bossVoice', v);
  if (!t.bossMusic?.default) out.push('bossMusic needs a default');
  for (const [k, v] of Object.entries(t.bossMusic ?? {})) {
    if (!/^mus_[a-z0-9_]+$/.test(v)) out.push(`bossMusic.${k}: ${v} is not a mus_ id`);
    else if (known && !known.has(v)) out.push(`bossMusic.${k}: ${v} is not in the prompt library`);
  }
  for (const [k, v] of Object.entries(t.surfaces ?? {})) inDomain(`surfaces.${k}`, 'surface', v);
  inDomain('dungeonFloor', 'surface', t.dungeonFloor);
  return out;
}
