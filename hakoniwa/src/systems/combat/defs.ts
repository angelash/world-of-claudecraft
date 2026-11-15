// Content lookups and timing constants. Content is immutable at runtime, so the id
// indexes are cached per content table object (the same trick as world/grid.ts).

import type { ContentMap } from '../../core/contracts';
import { TICK_HZ } from '../../core/time';
import type { AbilityDef, AuraDef, ClassDef, FixtureDef, MonsterDef, WaveDef } from './types';

/** Seconds of combat time to ticks (combat runs on real seconds at 20 Hz, not game minutes). */
export function secs(s: number): number {
  return Math.max(0, Math.round(s * TICK_HZ));
}

export const GCD_TICKS = secs(1.5);
/** Classic energy classes have a 1-second global cooldown. */
export const ENERGY_GCD_TICKS = secs(1);
export const REGEN_EVERY = secs(2);
export const COMBAT_LINGER = secs(5);
/** Classic five-second rule after spending mana. */
export const FIVE_SECOND_RULE = secs(5);
export const CORPSE_TICKS = secs(8);
/** Melee reach in tiles between bodies (added to both radii). */
export const MELEE_RANGE = 1.0;
export const DEFAULT_SPEED = 3.4;

const indexes = new WeakMap<object, Map<string, unknown>>();

function index<T extends { id: string }>(rows: readonly T[] | undefined): Map<string, T> {
  if (!rows) return new Map();
  let m = indexes.get(rows) as Map<string, T> | undefined;
  if (!m) {
    m = new Map(rows.map((r) => [r.id, r]));
    indexes.set(rows, m as Map<string, unknown>);
  }
  return m;
}

export function abilityDef(content: ContentMap, id: string): AbilityDef | undefined {
  return index(content.abilities).get(id);
}

export function auraDef(content: ContentMap, id: string): AuraDef | undefined {
  return index(content.auras).get(id);
}

export function classDef(content: ContentMap, id: string | null): ClassDef | undefined {
  return id ? index(content.classes).get(id) : undefined;
}

export function monsterDef(content: ContentMap, id: string | null): MonsterDef | undefined {
  return id ? index(content.monsters).get(id) : undefined;
}

export function waveDef(content: ContentMap, id: string): WaveDef | undefined {
  return index(content.waves).get(id);
}

export function fixtures(content: ContentMap): FixtureDef[] {
  return content.combatFixtures ?? [];
}

/** Scale a value by level and power: base + perLevel x (level - 1) + coef x power. */
export function scaled(
  s: { base: number; perLevel?: number; coef?: number } | undefined,
  level: number,
  power = 0,
): number {
  if (!s) return 0;
  return s.base + (s.perLevel ?? 0) * Math.max(0, level - 1) + (s.coef ?? 0) * power;
}
