// The instance layer's rules as pure functions of the definitions (D-072): which items keep
// a record per piece, durability caps and wear factors, the sediment grain bonus, refining
// and enchant slots, repair cost and who may repair, wear marks, the stack key, and the
// crafting skill cap of 150 in six layers (catalog_equipment.md 1.6, 2.3, 2.6 to 2.8, 6;
// catalog_gathering_crafting.md 1.2; combat_and_classes.md 13). No state, no randomness.

import type {
  EnchantSlot,
  EquipSlot,
  ItemDef,
  ItemInstance,
  Profession,
  RefineLevel,
  SedGrade,
  StackQualifiers,
} from './types';

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The item tags these rules read (catalog_equipment.md 1.2, 11.2; tags, not content ids:
 * a few of them are also the names of goods).
 */
export const ITEM_TAG_WORDS = [
  'tool',
  'tack',
  'deep',
  'two_hand',
  'bone',
  'mail',
  'plate',
  'metal',
  'cloth',
  'leather',
  'wood',
  'staff',
  'bow',
] as const;
export type ItemTagWord = (typeof ITEM_TAG_WORDS)[number];

const SOFT_TAGS: readonly ItemTagWord[] = ['cloth', 'leather', 'wood', 'staff', 'bow'];
const METAL_TAGS: readonly ItemTagWord[] = ['mail', 'plate', 'metal'];

export const hasTag = (def: ItemDef, tag: ItemTagWord): boolean => def.tags?.includes(tag) ?? false;
const has = hasTag;

/**
 * The regional style tags these rules read (catalog_equipment.md 2.5): gold-scale trinkets
 * carry one more enchant slot, deep-hammer pieces one more refining level.
 */
export const STYLE_TAGS = ['style:goldscale', 'style:deephammer'] as const;
export type StyleTag = (typeof STYLE_TAGS)[number];

export const hasStyle = (def: ItemDef, tag: StyleTag): boolean => def.tags?.includes(tag) ?? false;

// ---------------------------------------------------------------------------
// Which items are instances

/** Equipment, tools and tack keep a record per piece; everything else is counted. */
export function isInstanced(def: ItemDef): boolean {
  if (def.instanced !== undefined) return def.instanced;
  return wearsByKind(def) || (def.durability ?? 0) > 0;
}

function wearsByKind(def: ItemDef): boolean {
  return (
    def.kind === 'weapon' ||
    def.kind === 'armor' ||
    def.kind === 'trinket' ||
    has(def, 'tool') ||
    has(def, 'tack')
  );
}

// ---------------------------------------------------------------------------
// Durability (catalog_equipment.md 2.7)

/** Maximum durability by quality: poor 20, common 40, uncommon 60, fine 80, named 100. */
export const DURABILITY_BY_QUALITY: readonly number[] = [20, 40, 60, 80, 100];
/** Deep-phase pieces (`deep` tag) carry 20 more. */
export const DEEP_DURABILITY_BONUS = 20;
/** The low-durability warning line (catalog_equipment.md 1.7). */
export const LOW_DURABILITY = 0.2;
/** Death costs every worn piece 10% of its maximum (D-072, thousand_doors.md 6.3). */
export const DEATH_WEAR = 0.1;
/** A companion's retreat costs 10%; a lawful ironman revival 25% (companions 11.3, 11.4). */
export const RETREAT_WEAR = 0.1;
export const REVIVE_WEAR = 0.25;
/** Each fight costs every worn piece 1 point. */
export const FIGHT_WEAR = 1;

/** The maximum durability of a piece, or undefined when it never wears (legendary, keys). */
export function maxDurability(def: ItemDef): number | undefined {
  if (def.durability !== undefined) return def.durability > 0 ? def.durability : undefined;
  if (!wearsByKind(def) || !isInstanced(def)) return undefined;
  if (def.quality >= 5) return undefined;
  const q = clamp(Math.round(def.quality), 0, DURABILITY_BY_QUALITY.length - 1);
  return (DURABILITY_BY_QUALITY[q] as number) + (has(def, 'deep') ? DEEP_DURABILITY_BONUS : 0);
}

/** Whether a piece counts: an instance at 0 durability gives nothing (combat_and_classes 13.2). */
export function isWorking(inst: ItemInstance | undefined): boolean {
  return !inst?.durability || inst.durability.cur > 0;
}

/** What the piece is made of, for sediment wear: metal, bone and horn, or soft. */
export type WearMaterial = 'metal' | 'bone' | 'soft';

export function wearMaterial(def: ItemDef): WearMaterial {
  if (has(def, 'bone')) return 'bone';
  if (METAL_TAGS.some((t) => has(def, t))) return 'metal';
  if (SOFT_TAGS.some((t) => has(def, t))) return 'soft';
  return def.kind === 'weapon' ? 'metal' : 'soft';
}

/** Metal wear in sediment 3, 4 and 5 (catalog_equipment.md 2.7, power_system 7.2). */
export const SEDIMENT_WEAR: Readonly<Record<number, number>> = { 3: 1.5, 4: 2, 5: 3 };

/**
 * The wear factor of one fight at a sediment level: metal takes the full surcharge, bone
 * and horn half of it, cloth, leather and wood none.
 */
export function sedimentWearFactor(def: ItemDef, sediment: number): number {
  const m = SEDIMENT_WEAR[clamp(Math.floor(sediment), 0, 5)] ?? 1;
  switch (wearMaterial(def)) {
    case 'metal':
      return m;
    case 'bone':
      return 1 + (m - 1) / 2;
    default:
      return 1;
  }
}

/** Durability is kept to two decimals (fractional wear in sediment); shown rounded up. */
export function roundDurability(v: number): number {
  return Math.round(v * 100) / 100;
}

// ---------------------------------------------------------------------------
// Sediment grain (catalog_equipment.md 2.6)

/** Stat bonus of a grained piece by tier (light, mid, heavy); doubled where sediment >= 4. */
export const SED_BONUS: readonly number[] = [0, 0.03, 0.06, 0.1];
export const SED_AWAKEN_LEVEL = 4;

export function gradeTier(grade: SedGrade | undefined): 0 | 1 | 2 | 3 {
  return grade === 'light' ? 1 : grade === 'mid' ? 2 : grade === 'heavy' ? 3 : 0;
}

/** The piece's grain tier and whether it was purified (the instance wins over the definition). */
export function grainOf(
  def: ItemDef,
  inst?: ItemInstance,
): { tier: 0 | 1 | 2 | 3; purified: boolean } {
  const tier = inst?.sedTier ?? gradeTier(def.sed?.grade);
  const purified = inst?.purified ?? def.sed?.purified === true;
  return { tier, purified };
}

/** The stat factor the grain adds (0 once purified: the bonus turns into resistance). */
export function sedBonus(def: ItemDef, inst: ItemInstance | undefined, sediment: number): number {
  const g = grainOf(def, inst);
  if (g.purified || g.tier === 0) return 0;
  const b = SED_BONUS[g.tier] ?? 0;
  return sediment >= SED_AWAKEN_LEVEL ? b * 2 : b;
}

/** The sediment resistance of a purified grained piece: -10%, -20%, -30% (not stacking). */
export function sedResist(def: ItemDef, inst?: ItemInstance): number {
  const g = grainOf(def, inst);
  return g.purified ? g.tier * 0.1 : 0;
}

// ---------------------------------------------------------------------------
// Refining and enchants (catalog_equipment.md 2.8, 6)

export const MAX_REFINE = 3;
/** Deep-hammer work refines one level further (catalog_equipment.md 2.5, 2.8). */
export const DEEP_REFINE_BONUS = 1;
/** Each refine adds 5% to base armor or weapon damage and 5% to the stat budget. */
export const REFINE_STEP = 0.05;
/**
 * The crafting skill each refine level needs: +1 layer two, +2 layer three, +3 layer four,
 * and the deep-hammer +4 one layer further, layer five.
 */
export const REFINE_SKILL: readonly number[] = [0, 50, 75, 100, 125];

/** The highest refining level of a piece: three, four on deep-hammer work. */
export function maxRefine(def: ItemDef): RefineLevel {
  return (MAX_REFINE + (hasStyle(def, 'style:deephammer') ? DEEP_REFINE_BONUS : 0)) as RefineLevel;
}

/**
 * Enchant slots: poor none, common to fine one, named and legendary two; a gold-scale
 * trinket one more (catalog_equipment.md 2.3, 2.5).
 */
export function enchantSlots(def: ItemDef): number {
  if (def.quality <= 0) return 0;
  const base = def.quality >= 4 ? 2 : 1;
  return base + (def.slot === 'trinket' && hasStyle(def, 'style:goldscale') ? 1 : 0);
}

// ---------------------------------------------------------------------------
// The maker's bond (catalog_gathering_crafting.md 1.5; catalog_equipment.md 1.6)

/**
 * The share of a bound piece's stats anyone but the bound person gets: only the one it is
 * bound to wears it at full strength (the catalogs name no number; one half until a balance
 * pass sets it).
 */
export const BOUND_STAT_SHARE = 0.5;

/** Whether a piece is bound to someone other than `person` (its stats are cut). */
export function boundElsewhere(inst: ItemInstance | undefined, person: string): boolean {
  return !!inst?.boundTo && inst.boundTo !== person;
}

export const ENCHANT_SLOT_OF: Readonly<Record<EquipSlot, EnchantSlot>> = {
  main_hand: 'wpn',
  off_hand: 'off',
  head: 'head',
  chest: 'chest',
  legs: 'legs',
  hands: 'hands',
  feet: 'feet',
  trinket: 'trk',
};

// ---------------------------------------------------------------------------
// Repair (catalog_equipment.md 2.7)

/** Repair cost = item value x 0.2 x the share lost (calibrated by the autoplayer later). */
export const REPAIR_RATE = 0.2;
/** Fine pieces need a smith of layer three (skill 75) in the matching trade. */
export const REPAIR_FINE_SKILL = 75;
/** A field kit mends this share of the maximum, on fine and lesser pieces of its tier. */
export const FIELD_REPAIR_SHARE = 0.3;

/**
 * Who repairs: a smith's crafting skill (any trade), their skill per trade when known (the
 * `crafters` data; a trade the smith has wins over `skill`), whether a master, their person
 * id (the maker), and whether they work at a T6 repair site (the gate-bronze workshop).
 */
export interface Smith {
  skill: number;
  skills?: Partial<Record<Profession, number>>;
  master?: boolean;
  id?: string;
  t6?: boolean;
}

/**
 * The trade a piece is repaired and refined in (catalog_equipment.md 2.7 "对口生业"):
 * cloth tailoring, leather and tack leatherworking, trinkets jewelcrafting, tools
 * engineering, other armor armorcrafting, weapons weaponcrafting.
 */
export function repairTrade(def: ItemDef): Profession {
  if (has(def, 'tool')) return 'engineering';
  if (def.kind === 'trinket' || def.slot === 'trinket') return 'jewelcrafting';
  if (has(def, 'cloth')) return 'tailoring';
  if (has(def, 'leather') || has(def, 'tack')) return 'leatherworking';
  if (def.kind === 'weapon') return 'weaponcrafting';
  return 'armorcrafting';
}

/** A smith's skill in the trade of a piece (the trade's own skill, else their general one). */
export function smithSkill(smith: Smith, def: ItemDef): number {
  return smith.skills?.[repairTrade(def)] ?? smith.skill;
}

export interface RepairQuote {
  /** the share of the maximum to restore (0 to 1) */
  lost: number;
  copper: number;
  material?: { itemId: string; count: number };
}

export function repairQuote(def: ItemDef, inst: ItemInstance): RepairQuote | null {
  const d = inst.durability;
  if (!d || d.max <= 0 || d.cur >= d.max) return null;
  const lost = (d.max - d.cur) / d.max;
  const copper = Math.round(def.value * REPAIR_RATE * lost);
  const quote: RepairQuote = { lost, copper };
  if (def.quality >= 3 && def.repairMaterial) {
    quote.material = { itemId: def.repairMaterial, count: Math.ceil(lost / 0.25 - 1e-9) };
  }
  return quote;
}

/**
 * Common and uncommon: any smith; fine: skill 75 in the piece's trade (or a master); named: a
 * master; any piece its own maker signed: that maker. Legendary pieces never need it. A T6
 * piece (gate-bronze work) is mended only at a T6 repair site (catalog_equipment.md 2.7).
 */
export function canRepair(def: ItemDef, inst: ItemInstance, smith: Smith): boolean {
  if (def.quality >= 5) return false;
  if (tierOfLevel(def.level) >= 6 && !smith.t6) return false;
  if (smith.id && inst.signature === smith.id) return true;
  if (def.quality <= 2) return true;
  if (def.quality === 3)
    return smithSkill(smith, def) >= REPAIR_FINE_SKILL || smith.master === true;
  return smith.master === true;
}

/** Item tier T1 to T6 by item level (catalog_gathering_crafting.md 1.2). */
export function tierOfLevel(level: number | undefined): number {
  const l = level ?? 1;
  if (l >= 60) return 6;
  if (l >= 50) return 5;
  if (l >= 35) return 4;
  if (l >= 20) return 3;
  if (l >= 10) return 2;
  return 1;
}

/** A field kit mends fine and lesser pieces of its own tier or below, never T6 work. */
export function fieldKitMends(kit: ItemDef, def: ItemDef): boolean {
  const tier = tierOfLevel(def.level);
  return def.quality <= 3 && tier < 6 && tier <= tierOfLevel(kit.level);
}

// ---------------------------------------------------------------------------
// Wear marks (catalog_equipment.md 2.8)

export const MAX_MARKS = 100;
/** Pieces from fine up keep marks. */
export const MARKS_MIN_QUALITY = 3;
/** Points by the rank of the kill: a named one 5, a dungeon lord 10. */
export const MARKS_BY_RANK: Readonly<Record<string, number>> = { rare: 5, boss: 10 };

// ---------------------------------------------------------------------------
// Stack key (catalog_equipment.md 1.6)

/** The item id plus the qualifiers that keep a stack apart, in a fixed order. */
export function stackKey(itemId: string, q: QualifierFields = {}): string {
  let k = itemId;
  if (q.purified) k += '|purified';
  if (q.sedTier) k += `|sed${q.sedTier}`;
  if (q.signature) k += `|by:${q.signature}`;
  if (q.provenance && q.provenance.length > 0) k += `|from:${q.provenance.join('+')}`;
  if (q.spoilDay !== undefined) k += `|day${q.spoilDay}`;
  return k;
}

/** Anything carrying qualifier fields (a grant, an instance init, a stack part). */
export interface QualifierFields {
  purified?: boolean;
  sedTier?: number;
  signature?: string;
  provenance?: string[];
  spoilDay?: number;
}

/** The qualifiers of a value, dropping empty ones (none means a plain stack). */
export function qualifiersOf(q: QualifierFields | undefined): StackQualifiers {
  const out: StackQualifiers = {};
  if (!q) return out;
  if (q.purified) out.purified = true;
  if (q.sedTier === 1 || q.sedTier === 2 || q.sedTier === 3) out.sedTier = q.sedTier;
  if (q.signature) out.signature = q.signature;
  if (q.provenance && q.provenance.length > 0) out.provenance = [...q.provenance];
  if (q.spoilDay !== undefined) out.spoilDay = q.spoilDay;
  return out;
}

export function isPlain(q: StackQualifiers): boolean {
  return stackKey('', q) === '';
}

// ---------------------------------------------------------------------------
// Crafting skill (D-072; catalog_gathering_crafting.md 1.2)

/** Crafting and gathering skills run to 150 in six layers of 25 (layer n caps at 25n). */
export const CRAFT_SKILL_CAP = 150;
export const CRAFT_LAYER_SIZE = 25;
export const CRAFT_LAYERS = 6;

/** The skill cap of a layer (0 to 6). */
export function layerCap(layer: number): number {
  return clamp(Math.floor(layer), 0, CRAFT_LAYERS) * CRAFT_LAYER_SIZE;
}

/** The tier a skill value works at: 0 to 24 is T1, 25 to 49 T2, ..., 125 to 150 T6. */
export function craftTierOf(skill: number): number {
  return clamp(Math.floor(Math.max(0, skill) / CRAFT_LAYER_SIZE) + 1, 1, CRAFT_LAYERS);
}

/** A skill value held to its layer's cap and the overall cap. */
export function clampCraftSkill(skill: number, layer: number = CRAFT_LAYERS): number {
  return clamp(Math.floor(skill), 0, Math.min(CRAFT_SKILL_CAP, layerCap(layer)));
}
