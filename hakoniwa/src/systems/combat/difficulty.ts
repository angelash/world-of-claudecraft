// The four difficulty levels (combat_and_classes.md 16; progression_and_pacing.md 15). The
// registry built-in `difficulty` holds the run's level (the new game page writes it before
// the first tick). Difficulty only changes stated modifiers: each item is a registered
// modifier (D-013, target `combat`, source `difficulty`), so the combat log and the
// settings page can name it, and every reader takes the combined value from the modifiers
// system (`combatMod`), never the table directly. Standard registers nothing: every item is
// its design value. Story, standard and hard switch out of combat; legend is chosen on a
// new run only and cannot be left.

import type { FlagValue } from '../../core/contracts';
import type { SystemContext } from '../../core/system';
import { tr } from '../../core/text';
import type { World } from '../../core/world';
import { applyModifiers, registerModifier } from '../modifiers';
import type { Difficulty } from './types';

export const DIFFICULTIES: readonly Difficulty[] = ['story', 'standard', 'hard', 'legend'];

/** The modifier items of one difficulty (19.4 `DifficultyMods`). */
export interface DifficultyMods {
  /** damage of every enemy-side unit */
  enemyDamage: number;
  /** health of every enemy-side unit */
  enemyHp: number;
  /** healing the player receives */
  playerHealingTaken: number;
  /** ground-warning lead (the warned casts lengthen with it; PK-M1-12 reads it) */
  telegraphLead: number;
  /** soft-enrage threshold factor: 0.7 fires a 30% enrage at 21% (later), 1.15 at 34.5% */
  softEnrageShift: number;
  /** companion reaction delay to a danger zone, seconds (PK-M1-15 reads it) */
  companionReactSec: number;
  /** companions dodge a boss's big move only on an order (PK-M1-15 reads it) */
  companionAvoidNeedsOrder: boolean;
  /** a second down in one fight sends a companion off injured (PK-M1-15 reads it) */
  secondDownIsInjury: boolean;
  /** factor on the death fatigue floor (60) and the revival-fatigue duration */
  deathFatigue: number;
  /** share of carried money left in the drop bag */
  deathMoneyLoss: number;
}

/** The table of 16, in the order of the columns. */
export const DIFFICULTY_MODS: Readonly<Record<Difficulty, DifficultyMods>> = {
  story: {
    enemyDamage: 0.7,
    enemyHp: 1,
    playerHealingTaken: 1.2,
    telegraphLead: 1.5,
    softEnrageShift: 0.7,
    companionReactSec: 0.3,
    companionAvoidNeedsOrder: false,
    secondDownIsInjury: false,
    deathFatigue: 0.5,
    deathMoneyLoss: 0,
  },
  standard: {
    enemyDamage: 1,
    enemyHp: 1,
    playerHealingTaken: 1,
    telegraphLead: 1,
    softEnrageShift: 1,
    companionReactSec: 0.6,
    companionAvoidNeedsOrder: false,
    secondDownIsInjury: true,
    deathFatigue: 1,
    deathMoneyLoss: 0.1,
  },
  hard: {
    enemyDamage: 1.2,
    enemyHp: 1,
    playerHealingTaken: 1,
    telegraphLead: 1,
    softEnrageShift: 1.15,
    companionReactSec: 1,
    companionAvoidNeedsOrder: true,
    secondDownIsInjury: true,
    deathFatigue: 1,
    deathMoneyLoss: 0.15,
  },
  legend: {
    enemyDamage: 1.35,
    enemyHp: 1.15,
    playerHealingTaken: 1,
    telegraphLead: 1,
    softEnrageShift: 1.3,
    companionReactSec: 1,
    companionAvoidNeedsOrder: true,
    secondDownIsInjury: true,
    deathFatigue: 1.5,
    deathMoneyLoss: 0.2,
  },
};

/** The combat modifier keys (target `combat`) and their design values at standard. */
export const COMBAT_MOD_BASE = {
  enemy_damage: 1,
  enemy_hp: 1,
  player_healing_taken: 1,
  telegraph_lead: 1,
  soft_enrage: 1,
  companion_react: 0.6,
  companion_avoid_order: 0,
  second_down_injury: 1,
  death_fatigue: 1,
  death_money: 0.1,
} as const;

export type CombatModKey = keyof typeof COMBAT_MOD_BASE;

/** Modifier source of the difficulty items. */
export const DIFFICULTY_SOURCE = 'difficulty';
/** The difficulty modifiers never run out on their own (they are refreshed on a change). */
const FOREVER = Number.MAX_SAFE_INTEGER;
/** A run may pick legend (or leave it) only before this many ticks have passed. */
export const NEW_RUN_TICKS = 20;

/** A flag value read as a difficulty; anything else (a save from before the page) is standard. */
export function difficultyOf(value: FlagValue | undefined): Difficulty {
  return typeof value === 'string' && (DIFFICULTIES as readonly string[]).includes(value)
    ? (value as Difficulty)
    : 'standard';
}

/** The difficulty in effect for a world. */
export function worldDifficulty(world: World): Difficulty {
  return difficultyOf(world.meta.flags.difficulty);
}

/** The modifier items of the difficulty in effect. */
export function difficultyMods(world: World): DifficultyMods {
  return DIFFICULTY_MODS[worldDifficulty(world)];
}

/**
 * The combined value of a combat modifier item: the design value through every registered
 * `combat` modifier for that key (the difficulty's own, and any other source's). Cheap when
 * no combat modifier is registered (the standard difficulty's common case).
 */
export function combatMod(world: World, key: CombatModKey): number {
  const base = COMBAT_MOD_BASE[key];
  const active = world.slices.modifiers?.active;
  if (!active?.some((m) => m.target === 'combat')) return base;
  return applyModifiers(world, 'combat', key, base);
}

/** The factor and offset that turn the standard value of an item into this difficulty's. */
function itemsOf(d: Difficulty): { key: CombatModKey; factor?: number; add?: number }[] {
  const m = DIFFICULTY_MODS[d];
  const s = DIFFICULTY_MODS.standard;
  return [
    { key: 'enemy_damage', factor: m.enemyDamage },
    { key: 'enemy_hp', factor: m.enemyHp },
    { key: 'player_healing_taken', factor: m.playerHealingTaken },
    { key: 'telegraph_lead', factor: m.telegraphLead },
    { key: 'soft_enrage', factor: m.softEnrageShift },
    { key: 'companion_react', add: m.companionReactSec - s.companionReactSec },
    { key: 'companion_avoid_order', add: m.companionAvoidNeedsOrder ? 1 : 0 },
    { key: 'second_down_injury', factor: m.secondDownIsInjury ? 1 : 0 },
    { key: 'death_fatigue', factor: m.deathFatigue },
    { key: 'death_money', factor: m.deathMoneyLoss / s.deathMoneyLoss },
  ];
}

/**
 * Register (or refresh) the difficulty's modifier items. Standard on a world that never
 * had another level registers nothing; after a switch every item is refreshed, the ones
 * back at their design value with a neutral factor, so the record stays complete.
 */
function registerItems(ctx: SystemContext, d: Difficulty, refreshAll: boolean): void {
  for (const it of itemsOf(d)) {
    const neutral = (it.factor ?? 1) === 1 && (it.add ?? 0) === 0;
    if (neutral && !refreshAll) continue;
    registerModifier(ctx, {
      target: 'combat',
      key: it.key,
      ...(it.factor !== undefined ? { factor: it.factor } : {}),
      ...(it.add !== undefined ? { add: it.add } : {}),
      untilTick: FOREVER,
      source: DIFFICULTY_SOURCE,
      visibility: 'public',
      note: tr(`sys.combat.difficulty.item.${it.key}`),
      stackGroup: DIFFICULTY_SOURCE,
    });
  }
}

/** Bring the registered items in line with the difficulty in effect (init, loads). */
export function syncDifficulty(ctx: SystemContext): void {
  const slice = ctx.world.slices.combat;
  const d = worldDifficulty(ctx.world);
  if (slice.difficulty === d || (slice.difficulty === undefined && d === 'standard')) return;
  registerItems(ctx, d, slice.difficulty !== undefined);
  slice.difficulty = d;
}

/**
 * The `difficulty` flag was written: take it, or write the level in effect back with a
 * refusal (combat.difficulty). Legend is only picked or left at the start of a run; the
 * other levels switch whenever the player is out of combat.
 */
export function difficultyWritten(
  ctx: SystemContext,
  value: FlagValue | undefined,
  inCombat: boolean,
): void {
  const slice = ctx.world.slices.combat;
  const was = slice.difficulty ?? 'standard';
  const next = difficultyOf(value);
  if (next === was && value === next) return;
  const fresh = ctx.tick < NEW_RUN_TICKS;
  let refused: 'locked' | 'in_combat' | undefined;
  if ((next === 'legend' || was === 'legend') && !fresh) refused = 'locked';
  else if (inCombat && next !== was) refused = 'in_combat';
  if (refused) {
    ctx.setFlag('difficulty', was);
    ctx.emit('combat.difficulty', { difficulty: was, op: 'refused', reason: refused });
    return;
  }
  if (value !== next) ctx.setFlag('difficulty', next);
  if (next === was && slice.difficulty !== undefined) return;
  const hpBefore = combatMod(ctx.world, 'enemy_hp');
  registerItems(ctx, next, slice.difficulty !== undefined);
  slice.difficulty = next;
  if (combatMod(ctx.world, 'enemy_hp') !== hpBefore) topUpEnemies(ctx, hpBefore);
  ctx.emit('combat.difficulty', { difficulty: next, op: 'set' });
}

/**
 * The enemy health factor changed (legend picked at the start of a run): enemies already in
 * the world out of combat keep their share of health under the new maximum.
 */
function topUpEnemies(ctx: SystemContext, before: number): void {
  const after = combatMod(ctx.world, 'enemy_hp');
  for (const id of Object.keys(ctx.world.slices.combat.units).sort()) {
    const u = ctx.world.slices.combat.units[id];
    if (u?.side !== 'enemy' || u.combatUntil > ctx.tick || before <= 0) continue;
    u.hp = Math.max(1, Math.round((u.hp * after) / before));
  }
}
