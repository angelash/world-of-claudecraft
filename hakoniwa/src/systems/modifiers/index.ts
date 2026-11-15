// Registered modifiers (decision D-013): every divine or scripted effect on prices,
// harvests, monster pressure, faith, morale, weather or sediment is a registered,
// time-limited, attributable modifier. Consuming systems query the combined value
// instead of having their numbers edited behind their back. Phase 5 (before all).

import { ok, reject } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';

export type ModifierTarget =
  | 'price'
  | 'harvest'
  | 'production'
  | 'monster'
  | 'faith'
  | 'morale'
  | 'sediment'
  | 'xp'
  | 'travel';

export interface ModifierSpec {
  target: ModifierTarget;
  /** what it applies to: goods id, region id, map id, nation id, or '*' for everything */
  key: string;
  /** multiplicative factor (1 = no change) */
  factor?: number;
  /** additive offset applied after factors */
  add?: number;
  /** absolute expiry tick */
  untilTick: number;
  /** who caused it: goddess id, 'maker', 'director', a quest id, ... */
  source: string;
  /** public modifiers are visible to the player (market notices, omens) */
  visibility: 'public' | 'hidden';
  /** short Chinese explanation shown in UI and the miracle ledger */
  note: string;
}

export interface Modifier extends ModifierSpec {
  id: string;
  createdTick: number;
}

export interface ModifiersSlice {
  active: Modifier[];
}

declare module '../../core/contracts' {
  interface WorldSlices {
    modifiers: ModifiersSlice;
  }
  interface EventMap {
    'modifier.registered': Modifier;
    'modifier.expired': { id: string; target: ModifierTarget; key: string; source: string };
  }
  interface CommandMap {
    /** for scripts, the editor workbench and the Maker's revelations */
    'modifier.register': ModifierSpec;
  }
}

export function registerModifier(ctx: SystemContext, spec: ModifierSpec): Modifier {
  const mod: Modifier = { ...spec, id: ctx.newId('mod'), createdTick: ctx.tick };
  ctx.world.slices.modifiers.active.push(mod);
  ctx.emit('modifier.registered', mod);
  return mod;
}

/** Active modifiers for a target and key (key '*' modifiers always apply). */
export function activeModifiers(
  world: { slices: { modifiers: ModifiersSlice } },
  target: ModifierTarget,
  key: string,
): Modifier[] {
  return world.slices.modifiers.active.filter(
    (m) => m.target === target && (m.key === key || m.key === '*'),
  );
}

/** Apply all active modifiers for (target, key) to a base value. */
export function applyModifiers(
  world: { slices: { modifiers: ModifiersSlice } },
  target: ModifierTarget,
  key: string,
  base: number,
): number {
  let factor = 1;
  let add = 0;
  for (const m of activeModifiers(world, target, key)) {
    factor *= m.factor ?? 1;
    add += m.add ?? 0;
  }
  return base * factor + add;
}

export const system: GameSystem = {
  id: 'modifiers',
  order: 5,
  init(ctx) {
    ctx.world.slices.modifiers = { active: [] };
  },
  tick(ctx) {
    const slice = ctx.world.slices.modifiers;
    if (slice.active.length === 0) return;
    const keep: Modifier[] = [];
    for (const m of slice.active) {
      if (m.untilTick > ctx.tick) keep.push(m);
      else
        ctx.emit('modifier.expired', { id: m.id, target: m.target, key: m.key, source: m.source });
    }
    slice.active = keep;
  },
  commands: {
    'modifier.register'(ctx, d) {
      if (d.untilTick <= ctx.tick) return reject('expired', '修正项的期限已过');
      registerModifier(ctx, d);
      return ok();
    },
  },
};
