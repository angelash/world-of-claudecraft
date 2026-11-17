// Consumable cooldown groups (catalog_consumables_magitools.md 2.1; combat_and_classes.md
// 14.1): the timers the inventory keeps when an item is used. Potions share 120 seconds,
// throwables 30, a bandaged person waits 60 seconds per target, sediment cures six game
// hours, charms run each kind on its own timer and the movement charms share 30 game
// minutes. The exclusive groups (elixirs, food and drink, coatings) are held at the aura
// layer by combat, and the in-combat limits are combat's check.

import { TICK_HZ, TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../../core/time';
import type { ConsumableGroup, InventorySlice, ItemDef } from './types';

export interface GroupRule {
  /** ticks the whole group waits after one use */
  shared?: number;
  /** ticks a target waits before the group may be used on it again */
  perTarget?: number;
  /** each item kind runs its own timer (`use.cooldown` seconds) */
  perItem?: boolean;
  /** ticks the movement items of the group share (`return` effects) */
  movement?: number;
  /** usable in combat (combat enforces; `item` means as the entry says) */
  inCombat: boolean | 'item';
  /** triggers the global cooldown (combat reads it) */
  gcd: boolean;
  /** a use before the timer ends goes through without effect (`item.used` `early`) */
  earlyUse?: boolean;
}

const sec = (s: number) => Math.round(s * TICK_HZ);

export const GROUP_RULES: Readonly<Record<ConsumableGroup, GroupRule>> = {
  cd_potion: { shared: sec(120), inCombat: true, gcd: false },
  cd_bandage: { perTarget: sec(60), inCombat: false, gcd: false },
  cd_elixir_battle: { inCombat: true, gcd: true },
  cd_elixir_guard: { inCombat: true, gcd: true },
  cd_special: { perItem: true, inCombat: 'item', gcd: true },
  cd_food: { inCombat: false, gcd: false },
  cd_drink: { inCombat: false, gcd: false },
  cd_sed: { shared: 6 * TICKS_PER_GAME_HOUR, inCombat: false, gcd: false, earlyUse: true },
  cd_charm: { perItem: true, movement: 30 * TICKS_PER_GAME_MINUTE, inCombat: 'item', gcd: true },
  cd_throw: { shared: sec(30), inCombat: true, gcd: true },
  cd_coat: { inCombat: false, gcd: false },
  cd_gate: { inCombat: false, gcd: false },
  cd_offering: { inCombat: false, gcd: false },
  cd_none: { inCombat: false, gcd: false },
};

/** Effects that move the user (the movement charms). */
const MOVEMENT_EFFECTS = ['return'] as const;

function isMovement(def: ItemDef): boolean {
  return (MOVEMENT_EFFECTS as readonly string[]).includes(def.use?.effect ?? '');
}

/** One timer a use waits on and starts: whose timer book it sits in, its key and length. */
export interface UseTimer {
  /** the user, or the person treated for the per-target timers (bandages) */
  holder: string;
  key: string;
  ticks: number;
}

/** The timers a use of `def` by `ownerId` on `targetId` waits on and starts. */
export function useTimers(def: ItemDef, ownerId: string, targetId?: string): UseTimer[] {
  const group = def.use?.group;
  const rule = group ? GROUP_RULES[group] : undefined;
  if (!group || !rule) return [];
  const out: UseTimer[] = [];
  if (rule.shared) out.push({ holder: ownerId, key: `use:${group}`, ticks: rule.shared });
  // the person treated waits, whoever treats them next (catalog_consumables_magitools 2.1)
  if (rule.perTarget) {
    out.push({ holder: targetId ?? ownerId, key: `use:${group}@treated`, ticks: rule.perTarget });
  }
  const own = def.use?.cooldown ?? 0;
  if (rule.perItem && own > 0) {
    out.push({ holder: ownerId, key: `use:${group}:${def.id}`, ticks: sec(own) });
  }
  if (rule.movement && isMovement(def)) {
    out.push({ holder: ownerId, key: `use:${group}:move`, ticks: rule.movement });
  }
  return out;
}

/** Ticks until the owner may use the item (0 when ready). */
export function useWait(
  slice: InventorySlice,
  ownerId: string,
  def: ItemDef,
  tick: number,
  targetId?: string,
): number {
  let wait = 0;
  for (const t of useTimers(def, ownerId, targetId)) {
    wait = Math.max(wait, (slice.timers?.[t.holder]?.[t.key] ?? 0) - tick);
  }
  return Math.max(0, wait);
}

/** Start the timers of one use (expired timers of the books touched are dropped). */
export function startUseTimers(
  slice: InventorySlice,
  ownerId: string,
  def: ItemDef,
  tick: number,
  targetId?: string,
): void {
  for (const u of useTimers(def, ownerId, targetId)) {
    slice.timers ??= {};
    const t = slice.timers[u.holder] ?? {};
    for (const [k, v] of Object.entries(t)) if (v <= tick) delete t[k];
    t[u.key] = Math.max(t[u.key] ?? 0, tick + u.ticks);
    slice.timers[u.holder] = t;
  }
}

/** The ready tick of a group's shared timer for the hotbar (`cooldownGroup`), 0 when ready. */
export function groupReadyAt(
  slice: InventorySlice,
  ownerId: string,
  group: ConsumableGroup,
): number {
  return slice.timers?.[ownerId]?.[`use:${group}`] ?? 0;
}
