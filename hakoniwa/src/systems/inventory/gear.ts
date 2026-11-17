// What the worn gear gives (combat_and_classes.md 13.1 to 13.3): every working worn piece
// as an effective definition (refining, sediment grain and enchant stats folded in), the
// same-forge sets by distinct working pieces, and the set bonuses. A piece at 0 durability
// counts for nothing: no stats, no weapon, no enchant, no set piece. Read-only queries; a
// holding from before the instance layer reads as pristine pieces.

import { getEntity, mapById, sedimentAt } from '../world';
import type { MapDef } from '../world/types';
import { grainOf, isWorking, REFINE_STEP, sedBonus } from './rules';
import {
  type EnchantDef,
  type EquipSlot,
  type InventorySlice,
  type ItemDef,
  type ItemInstance,
  type ItemSetDef,
  SLOT_ORDER,
} from './types';

type WorldLike = { slices: { inventory: InventorySlice } };
type ContentLike = { items: ItemDef[]; itemSets?: ItemSetDef[]; enchants?: EnchantDef[] };

export interface WornPiece {
  slot: EquipSlot;
  def: ItemDef;
  /** the instance record (absent on a save from before the instance layer) */
  inst?: ItemInstance;
  /** false at 0 durability: the piece gives nothing */
  working: boolean;
}

export function itemDef(content: { items: ItemDef[] }, id: string): ItemDef | undefined {
  return content.items.find((i) => i.id === id);
}

/** The worn pieces of an owner in slot order. */
export function wornPieces(world: WorldLike, content: ContentLike, ownerId: string): WornPiece[] {
  const h = world.slices.inventory.owners[ownerId];
  if (!h) return [];
  const out: WornPiece[] = [];
  for (const slot of SLOT_ORDER) {
    const id = h.equipped[slot];
    if (!id) continue;
    const def = itemDef(content, id);
    if (!def) continue;
    const iid = h.worn?.[slot];
    const inst = iid ? h.instances?.[iid] : undefined;
    out.push({ slot, def, inst, working: isWorking(inst) });
  }
  return out;
}

/** The sediment level where an owner stands (0 off the map or for owners without a body). */
export function ownerSediment(
  world: unknown,
  content: { maps?: MapDef[] },
  ownerId: string,
): number {
  const w = world as { slices: { world?: { entities: Record<string, unknown> } } };
  if (!w.slices.world || !content.maps) return 0;
  const e = getEntity(w as never, ownerId);
  const map = e ? mapById(content as { maps: MapDef[] }, e.mapId) : undefined;
  return map && e ? sedimentAt(map, e.x, e.y) : 0;
}

function enchantDef(content: ContentLike, id: string): EnchantDef | undefined {
  return content.enchants?.find((e) => e.id === id);
}

/**
 * The piece as it counts in combat: stats scaled by refining (5% a level) and an
 * unpurified grain (3%, 6%, 10%, doubled where sediment >= 4), weapon damage scaled by
 * refining, plus the stats of its enchants. The definition itself when nothing applies.
 */
export function effectiveDef(
  def: ItemDef,
  inst: ItemInstance | undefined,
  content: ContentLike,
  sediment = 0,
): ItemDef {
  const refine = inst?.refine ?? 0;
  const grain = sedBonus(def, inst, sediment);
  const enchants = (inst?.affixes ?? [])
    .map((a) => enchantDef(content, a))
    .filter((e): e is EnchantDef => !!e?.stats);
  // the grain as the instance has it (purified or tiered after making, catalog_equipment 1.5)
  const g = grainOf(def, inst);
  const sed =
    g.tier > 0 ? { grade: GRADES[g.tier], ...(g.purified ? { purified: true } : {}) } : undefined;
  const sameSed =
    (sed === undefined && def.sed === undefined) ||
    (sed !== undefined &&
      def.sed !== undefined &&
      sed.grade === def.sed.grade &&
      (sed.purified ?? false) === (def.sed.purified ?? false));
  if (refine === 0 && grain === 0 && enchants.length === 0 && sameSed) return def;
  const k = 1 + refine * REFINE_STEP + grain;
  const out: ItemDef = { ...def };
  if (refine !== 0 || grain !== 0 || enchants.length > 0) {
    const stats: Record<string, number> = {};
    for (const [s, v] of Object.entries(def.stats ?? {})) stats[s] = v * k;
    for (const e of enchants) {
      for (const [s, v] of Object.entries(e.stats ?? {})) stats[s] = (stats[s] ?? 0) + v;
    }
    out.stats = stats;
  }
  if (def.weapon && refine > 0) {
    const w = 1 + refine * REFINE_STEP;
    out.weapon = { ...def.weapon, min: def.weapon.min * w, max: def.weapon.max * w };
  }
  if (sed) out.sed = sed as ItemDef['sed'];
  else delete out.sed;
  return out;
}

const GRADES = ['light', 'light', 'mid', 'heavy'] as const;

function needsSediment(pieces: WornPiece[]): boolean {
  return pieces.some((p) => {
    const g = grainOf(p.def, p.inst);
    return g.tier > 0 && !g.purified;
  });
}

/** Distinct working pieces of each set (the same item counts once), by set id. */
export function setCounts(pieces: WornPiece[]): Map<string, number> {
  const seen = new Map<string, Set<string>>();
  for (const p of pieces) {
    if (!p.working || !p.def.set) continue;
    const s = seen.get(p.def.set) ?? new Set<string>();
    s.add(p.def.id);
    seen.set(p.def.set, s);
  }
  const out = new Map<string, number>();
  for (const id of [...seen.keys()].sort()) out.set(id, seen.get(id)?.size ?? 0);
  return out;
}

export interface ActiveSet {
  set: ItemSetDef;
  pieces: number;
  bonuses: ItemSetDef['bonuses'];
}

/** The sets whose thresholds the working pieces reach, by set id. */
export function activeSets(pieces: WornPiece[], content: ContentLike): ActiveSet[] {
  const out: ActiveSet[] = [];
  for (const [id, n] of setCounts(pieces)) {
    const set = content.itemSets?.find((s) => s.id === id);
    if (!set) continue;
    const bonuses = set.bonuses.filter((b) => n >= b.pieces);
    if (bonuses.length > 0) out.push({ set, pieces: n, bonuses });
  }
  return out;
}

/**
 * The gear an owner's combat stats read: each working worn piece as its effective
 * definition, in slot order, then one stats-only entry (no slot) per set with active
 * bonuses. Broken pieces are left out, so a broken weapon swings as bare hands.
 */
export function equippedDefs(world: WorldLike, content: ContentLike, ownerId: string): ItemDef[] {
  const pieces = wornPieces(world, content, ownerId);
  if (pieces.length === 0) return [];
  const sediment = needsSediment(pieces)
    ? ownerSediment(world, content as { maps?: MapDef[] }, ownerId)
    : 0;
  const out: ItemDef[] = [];
  for (const p of pieces) {
    if (p.working) out.push(effectiveDef(p.def, p.inst, content, sediment));
  }
  for (const a of activeSets(pieces, content)) {
    const stats: Record<string, number> = {};
    for (const b of a.bonuses) {
      for (const [s, v] of Object.entries(b.stats ?? {})) stats[s] = (stats[s] ?? 0) + v;
    }
    if (Object.keys(stats).length === 0) continue;
    out.push({
      id: a.set.id,
      name: a.set.name,
      kind: 'trinket',
      quality: 0,
      value: 0,
      desc: '',
      stats,
    });
  }
  return out;
}

/** The aura keys active set bonuses grant while worn (combat applies them as passives). */
export function gearAuras(world: WorldLike, content: ContentLike, ownerId: string): string[] {
  const out: string[] = [];
  for (const a of activeSets(wornPieces(world, content, ownerId), content)) {
    for (const b of a.bonuses) if (b.aura) out.push(b.aura);
  }
  return out;
}
