// Registered modifiers (decision D-013): every divine or scripted effect on prices,
// harvests, monster pressure, faith, morale, weather or sediment is a registered,
// time-limited, attributable modifier. Consuming systems query the combined value
// instead of having their numbers edited behind their back. Phase 5 (before all).
// The channels are the closed set of economy_and_trade.md 7.2 as far as the kernel has
// them (catalog_goddess_interventions.md 1.4): the M1 channels route_state, weather,
// health, hazard_rate, door_resonance, resource_tag and loan_terms joined the first nine;
// a qualitative channel (the weather kind, a route's state, a new production tag, a loan's
// collateral) carries its word in `tag` next to the numbers.

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { type TextRef, tr } from '../../core/text';
import { registerSkipHandler } from '../travel/skip_registry';

export type ModifierTarget =
  | 'price'
  | 'harvest'
  | 'production'
  | 'monster'
  | 'faith'
  | 'morale'
  | 'sediment'
  | 'xp'
  | 'travel'
  /** combat items: the difficulty's modifiers and the like (combat/difficulty.ts) */
  | 'combat'
  /** a trade route's risk (factor) and passage (tag open or closed); key: route or map id */
  | 'route_state'
  /** a forced weather's record (tag: the weather kind, add: its strength 1 to 3); key: map id */
  | 'weather'
  /** a settlement's health (add, points); key: map or settlement id */
  | 'health'
  /** the disaster rate of a district (factor); key: map id */
  | 'hazard_rate'
  /** door-mark resonance of the remnants (add: cohesion and awakening steps); key: map id */
  | 'door_resonance'
  /** a new production tag of a district (tag: the resource tag); key: map id */
  | 'resource_tag'
  /** loan terms (add: interest points, tag: the collateral); key: the borrower */
  | 'loan_terms';

/** Every channel, in the order of the union (validators, the Maker, the operator's tools). */
export const MODIFIER_TARGETS: readonly ModifierTarget[] = [
  'price',
  'harvest',
  'production',
  'monster',
  'faith',
  'morale',
  'sediment',
  'xp',
  'travel',
  'combat',
  'route_state',
  'weather',
  'health',
  'hazard_rate',
  'door_resonance',
  'resource_tag',
  'loan_terms',
];

/** Channels whose value is a word (`tag`) as well as, or instead of, a number. */
export const TAGGED_TARGETS: readonly ModifierTarget[] = [
  'route_state',
  'weather',
  'resource_tag',
  'loan_terms',
];

export function isModifierTarget(v: unknown): v is ModifierTarget {
  return typeof v === 'string' && (MODIFIER_TARGETS as readonly string[]).includes(v);
}

export interface ModifierSpec {
  target: ModifierTarget;
  /** what it applies to: goods id, region id, map id, nation id, or '*' for everything */
  key: string;
  /** multiplicative factor (1 = no change) */
  factor?: number;
  /** additive offset applied after factors */
  add?: number;
  /** the word of a qualitative channel (TAGGED_TARGETS): weather kind, route state, resource tag */
  tag?: string;
  /** absolute expiry tick */
  untilTick: number;
  /** who caused it: goddess id, 'maker', 'director', a quest id, ... */
  source: string;
  /** public modifiers are visible to the player (market notices, omens) */
  visibility: 'public' | 'hidden';
  /** short explanation shown in UI and the miracle ledger (text key or content text) */
  note: TextRef | string;
  /**
   * stacking group (economy_and_trade 7.3 "同源"): a new modifier with the same source,
   * target, key and group refreshes the existing one instead of stacking
   */
  stackGroup?: string;
}

export interface Modifier extends ModifierSpec {
  id: string;
  createdTick: number;
}

/** One append-only history row (economy_and_trade 7.4): what was registered or refreshed, when. */
export interface ModifierHistoryEntry {
  id: string;
  tick: number;
  kind: 'registered' | 'refreshed';
  target: ModifierTarget;
  key: string;
  source: string;
  factor?: number;
  add?: number;
  tag?: string;
  untilTick: number;
}

export interface ModifiersSlice {
  active: Modifier[];
  /** append-only, newest last; trimmed to MODIFIER_HISTORY_KEEP rows */
  history?: ModifierHistoryEntry[];
}

/** History rows kept in the save (the event stream carries the full record). */
export const MODIFIER_HISTORY_KEEP = 500;

/**
 * Channel totals are clamped after combining (economy_and_trade 7.3 "通道总上限"): prices
 * 0.5 to 2.0, production and harvest 0.3 to 1.5, morale plus or minus 30. The M1 channels
 * (catalog_goddess_interventions.md 1.4 and 2): a route's risk 0.2 to 2, health plus or
 * minus 40 (a great miracle gives 30, a plague takes 20), the disaster rate 0.5 to 3, door
 * resonance 0 to 3 steps, loan interest plus or minus 5 points.
 */
export const CHANNEL_BOUNDS: Partial<
  Record<ModifierTarget, { factor?: [number, number]; add?: [number, number] }>
> = {
  price: { factor: [0.5, 2] },
  harvest: { factor: [0.3, 1.5] },
  production: { factor: [0.3, 1.5] },
  morale: { add: [-30, 30] },
  route_state: { factor: [0.2, 2] },
  health: { add: [-40, 40] },
  hazard_rate: { factor: [0.5, 3] },
  door_resonance: { add: [0, 3] },
  loan_terms: { add: [-5, 5] },
};

declare module '../../core/contracts' {
  interface WorldSlices {
    modifiers: ModifiersSlice;
  }
  interface EventMap {
    'modifier.registered': Modifier;
    'modifier.expired': { id: string; target: ModifierTarget; key: string; source: string };
    'modifier.refreshed': Modifier;
  }
  interface CommandMap {
    /** for scripts, the editor workbench and the Maker's revelations */
    'modifier.register': ModifierSpec;
  }
}

export function registerModifier(ctx: SystemContext, spec: ModifierSpec): Modifier {
  const slice = ctx.world.slices.modifiers;
  const same = spec.stackGroup
    ? slice.active.find(
        (m) =>
          m.stackGroup === spec.stackGroup &&
          m.source === spec.source &&
          m.target === spec.target &&
          m.key === spec.key,
      )
    : undefined;
  if (same) {
    // Same source, same group: refresh the duration and take the new magnitude.
    same.factor = spec.factor;
    same.add = spec.add;
    same.tag = spec.tag;
    same.note = spec.note;
    same.visibility = spec.visibility;
    same.untilTick = Math.max(same.untilTick, spec.untilTick);
    pushHistory(slice, same, ctx.tick, 'refreshed');
    ctx.emit('modifier.refreshed', same);
    return same;
  }
  const mod: Modifier = { ...spec, id: ctx.newId('mod'), createdTick: ctx.tick };
  slice.active.push(mod);
  pushHistory(slice, mod, ctx.tick, 'registered');
  ctx.emit('modifier.registered', mod);
  return mod;
}

function pushHistory(
  slice: ModifiersSlice,
  m: Modifier,
  tick: number,
  kind: ModifierHistoryEntry['kind'],
): void {
  const history = slice.history ?? [];
  history.push({
    id: m.id,
    tick,
    kind,
    target: m.target,
    key: m.key,
    source: m.source,
    factor: m.factor,
    add: m.add,
    ...(m.tag !== undefined ? { tag: m.tag } : {}),
    untilTick: m.untilTick,
  });
  if (history.length > MODIFIER_HISTORY_KEEP)
    history.splice(0, history.length - MODIFIER_HISTORY_KEEP);
  slice.history = history;
}

/**
 * Active modifiers for a target and key (key '*' modifiers always apply), in a stable order:
 * by source, then instance id (economy_and_trade 7.3 "顺序").
 */
export function activeModifiers(
  world: { slices: { modifiers: ModifiersSlice } },
  target: ModifierTarget,
  key: string,
): Modifier[] {
  return world.slices.modifiers.active
    .filter((m) => m.target === target && (m.key === key || m.key === '*'))
    .sort((a, b) =>
      a.source < b.source ? -1 : a.source > b.source ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
}

function clampTo(v: number, range: [number, number] | undefined): number {
  return range ? Math.min(range[1], Math.max(range[0], v)) : v;
}

export interface ModifierLine {
  id: string;
  source: string;
  note: TextRef | string;
  visibility: ModifierSpec['visibility'];
  /** change to the running value this modifier made, before the channel cap */
  delta: number;
}

/**
 * Per-modifier accounting for (target, key) on a base value: every line's delta in the
 * stable order, and how much the channel cap took off (economy_and_trade 7.4 "追溯").
 */
export function modifierBreakdown(
  world: { slices: { modifiers: ModifiersSlice } },
  target: ModifierTarget,
  key: string,
  base: number,
): { total: number; lines: ModifierLine[]; capDelta: number } {
  const mods = activeModifiers(world, target, key);
  const bounds = CHANNEL_BOUNDS[target];
  let factor = 1;
  let add = 0;
  const lines: ModifierLine[] = [];
  for (const m of mods) {
    const before = base * factor + add;
    factor *= m.factor ?? 1;
    add += m.add ?? 0;
    lines.push({
      id: m.id,
      source: m.source,
      note: m.note,
      visibility: m.visibility,
      delta: base * factor + add - before,
    });
  }
  const raw = base * factor + add;
  const total = base * clampTo(factor, bounds?.factor) + clampTo(add, bounds?.add);
  return { total, lines, capDelta: total - raw };
}

/** Apply all active modifiers for (target, key) to a base value. */
export function applyModifiers(
  world: { slices: { modifiers: ModifiersSlice } },
  target: ModifierTarget,
  key: string,
  base: number,
): number {
  return modifierBreakdown(world, target, key, base).total;
}

/**
 * The words a qualitative channel holds for a key now (route state, weather kind, resource
 * tags), in the stable order of activeModifiers; where one word counts, the last one wins.
 */
export function activeTags(
  world: { slices: { modifiers: ModifiersSlice } },
  target: ModifierTarget,
  key: string,
): string[] {
  return activeModifiers(world, target, key).flatMap((m) => (m.tag === undefined ? [] : [m.tag]));
}

/** Drop the modifiers whose time ran out (every tick, and every hour-coarse skip step). */
function expireModifiers(ctx: SystemContext): void {
  const slice = ctx.world.slices.modifiers;
  if (slice.active.length === 0) return;
  const keep: Modifier[] = [];
  for (const m of slice.active) {
    if (m.untilTick > ctx.tick) keep.push(m);
    else ctx.emit('modifier.expired', { id: m.id, target: m.target, key: m.key, source: m.source });
  }
  slice.active = keep;
}

registerSkipHandler('modifiers', expireModifiers);

export const system: GameSystem = {
  id: 'modifiers',
  order: 5,
  init(ctx) {
    ctx.world.slices.modifiers = { active: [], history: [] };
  },
  tick: expireModifiers,
  commands: {
    'modifier.register'(ctx, d) {
      if (!isModifierTarget(d.target))
        return reject('bad_target', tr('sys.modifiers.reject.bad_target'));
      if (d.untilTick <= ctx.tick) return reject('expired', tr('sys.modifiers.reject.expired'));
      registerModifier(ctx, d);
      return ok();
    },
  },
};
