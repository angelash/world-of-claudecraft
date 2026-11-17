// Inventory data shapes (D-072): item definitions with the instance-layer extensions
// (catalog_equipment.md 1.5, 1.6; catalog_consumables_magitools.md 2.1; combat_and_classes.md
// 13 and 19.3), the instance record, qualified stack parts, and the holding every owner has.

export type ItemKind =
  | 'weapon'
  | 'armor'
  | 'trinket'
  | 'consumable'
  | 'material'
  | 'goods'
  | 'key'
  | 'lore'
  | 'evidence';

export type EquipSlot =
  | 'main_hand'
  | 'off_hand'
  | 'head'
  | 'chest'
  | 'legs'
  | 'hands'
  | 'feet'
  | 'trinket';

/** The slot order every per-piece rule runs in (procs, wear, marks; combat_and_classes.md 13.3). */
export const SLOT_ORDER: readonly EquipSlot[] = [
  'main_hand',
  'off_hand',
  'head',
  'chest',
  'legs',
  'hands',
  'feet',
  'trinket',
];

/** When a trigger is checked (combat_and_classes.md 13.3). */
export type ProcOn =
  | 'hit'
  | 'crit'
  | 'spell'
  | 'heal'
  | 'struck'
  | 'block'
  | 'kill'
  | 'combat_start'
  | 'low_hp';

export const PROC_ONS: readonly ProcOn[] = [
  'hit',
  'crit',
  'spell',
  'heal',
  'struck',
  'block',
  'kill',
  'combat_start',
  'low_hp',
];

/** The one trigger shape of items, set bonuses and enchants (catalog_equipment.md 1.5). */
export interface ProcDef {
  on: ProcOn;
  /** 0 to 1 */
  chance: number;
  /** internal cooldown in seconds, per piece and per trigger (default 0) */
  icd?: number;
  /** a condition atom, or several joined by commas (all must hold) */
  when?: string;
  /** the effect: `aura:<id>[@self|@target]`, `dmg:<school>:<amount>`, ... (procs.ts) */
  do: string;
  /** charges left (weapon coatings) */
  charges?: number;
}

/** Consumable cooldown groups (catalog_consumables_magitools.md 2.1). */
export type ConsumableGroup =
  | 'cd_potion'
  | 'cd_bandage'
  | 'cd_elixir_battle'
  | 'cd_elixir_guard'
  | 'cd_special'
  | 'cd_food'
  | 'cd_drink'
  | 'cd_sed'
  | 'cd_charm'
  | 'cd_throw'
  | 'cd_coat'
  | 'cd_gate'
  | 'cd_offering'
  | 'cd_none';

export const CONSUMABLE_GROUPS: readonly ConsumableGroup[] = [
  'cd_potion',
  'cd_bandage',
  'cd_elixir_battle',
  'cd_elixir_guard',
  'cd_special',
  'cd_food',
  'cd_drink',
  'cd_sed',
  'cd_charm',
  'cd_throw',
  'cd_coat',
  'cd_gate',
  'cd_offering',
  'cd_none',
];

/** Sediment grain grades of an item definition (catalog_equipment.md 2.6). */
export type SedGrade = 'light' | 'mid' | 'heavy';

export interface ItemUse {
  /** effect id interpreted by the owning system (combat, quests; `repair` is the inventory's) */
  effect: string;
  amount?: number;
  ability?: string;
  /** the cooldown group (catalog_consumables_magitools.md 2.1) */
  group?: ConsumableGroup;
  /** the item's own cooldown in seconds (charms, specials: each kind on its own timer) */
  cooldown?: number;
}

export interface ItemDef {
  id: string;
  name: string;
  kind: ItemKind;
  /** 0 poor, 1 common, 2 uncommon, 3 rare, 4 epic, 5 legendary (main project quality scale) */
  quality: number;
  /** base value in copper */
  value: number;
  desc: string;
  slot?: EquipSlot;
  /** flat stat bonuses while equipped (combat reads these) */
  stats?: Record<string, number>;
  /** weapon damage range and speed (combat reads these) */
  weapon?: { min: number; max: number; speed: number; range: number };
  /** consumable effect interpreted by the owning system */
  use?: ItemUse;
  /** max stack size (default 1 for equipment, 99 otherwise) */
  stack?: number;
  /** required player level to equip; also the item level of `Lv×n` amounts */
  level?: number;
  tags?: string[];
  /** triggers while worn and working (combat_and_classes.md 13.3) */
  procs?: ProcDef[];
  /** the `set_` entry this piece belongs to */
  set?: string;
  /** the sediment grain of the definition (crafted from tainted main materials) */
  sed?: { grade: SedGrade; purified?: true };
  /** true: one record per piece; false: counted stacks; absent: by kind and tags (rules.ts) */
  instanced?: boolean;
  /** maximum durability; 0 never wears; absent: by quality (catalog_equipment.md 2.7) */
  durability?: number;
  /** the maker every instance is signed with (a person id; unique crafted pieces) */
  maker?: string;
  /** the person the piece's will recognizes: it does not wear in their hands */
  recognizes?: string;
  /** what a poor piece breaks into when its durability runs out */
  salvage?: { itemId: string; count?: number };
  /** the tier material each started 25% of a repair also takes (fine and better pieces) */
  repairMaterial?: string;
}

/** One item with its own record (catalog_equipment.md 1.6; combat_and_classes.md 19.3). */
export interface ItemInstance {
  instanceId: string;
  defId: string;
  durability?: { cur: number; max: number };
  /** `ench_` enchant ids, oldest first */
  affixes?: string[];
  /** wear marks 0 to 100 (fine and better pieces) */
  marks?: number;
  /** the marks by origin key (`family:<family>`, ...) */
  markFrom?: Record<string, number>;
  /** the maker's person id; `unrecorded` for the player's own work */
  signature?: string;
  /** sediment grain 0 none, 1 light, 2 mid, 3 heavy */
  sedTier?: 0 | 1 | 2 | 3;
  purified?: boolean;
  /** refining 0 to 3 */
  refine?: 0 | 1 | 2 | 3;
  boundTo?: string;
  /** the current holder (named and legendary pieces) */
  holder?: string;
  appraisalLevel?: string;
  provenance?: string[];
  restriction?: string;
}

/** The qualifiers that keep a stack apart (the stack key, catalog_equipment.md 1.6). */
export interface StackQualifiers {
  purified?: true;
  sedTier?: 1 | 2 | 3;
  signature?: string;
  provenance?: string[];
  spoilDay?: number;
}

/** A qualified part of a stack; it is also counted in `Holding.items`. */
export interface StackPart extends StackQualifiers {
  itemId: string;
  count: number;
}

/** What a new instance starts with besides its definition's defaults. */
export type InstanceInit = Partial<Omit<ItemInstance, 'instanceId' | 'defId'>>;

export interface Holding {
  money: number;
  /**
   * The count ledger: how many of each item the owner holds, stacks and instances alike.
   * Every count reader (city stock, the economy, the codex, quests) reads it.
   */
  items: Record<string, number>;
  /** the item worn in each slot */
  equipped: Partial<Record<EquipSlot, string>>;
  /** item instances by instance id (absent on saves written before the instance layer) */
  instances?: Record<string, ItemInstance>;
  /** the instance worn in each slot, beside `equipped` */
  worn?: Partial<Record<EquipSlot, string>>;
  /** qualified stack parts, sorted by stack key */
  stacks?: StackPart[];
}

export interface InventorySlice {
  owners: Record<string, Holding>;
  /** the instance layer revision the holdings are at (absent: a save from before it) */
  rev?: number;
  /** the fingerprint of the item rules the holdings settled under (slice.ts) */
  content?: string;
  /** ready ticks per owner: consumable cooldowns (`use:`) and trigger cooldowns (`proc:`) */
  timers?: Record<string, Record<string, number>>;
}

/** A same-forge set (`set_`): the bonuses at piece thresholds (catalog_equipment.md 5). */
export interface ItemSetDef {
  id: string;
  name: string;
  desc?: string;
  bonuses: {
    pieces: number;
    stats?: Record<string, number>;
    procs?: ProcDef[];
    /** an aura key worn while the threshold holds (combat applies it) */
    aura?: string;
  }[];
}

/** Enchant slot codes of `ench_` ids (catalog_equipment.md 6). */
export type EnchantSlot = 'wpn' | 'off' | 'head' | 'chest' | 'legs' | 'hands' | 'feet' | 'trk';

/** An enchant (`ench_`): stats and triggers folded into the piece that carries it. */
export interface EnchantDef {
  id: string;
  name: string;
  desc?: string;
  slot: EnchantSlot;
  /** 1 shallow to 4 extreme */
  tier: number;
  stats?: Record<string, number>;
  procs?: ProcDef[];
}
