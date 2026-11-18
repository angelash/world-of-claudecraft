// The M1 modifier channels (catalog_goddess_interventions.md 1.4; economy_and_trade.md 7.2,
// 7.3; PK-M1-20): route_state, weather, health, hazard_rate, door_resonance, resource_tag and
// loan_terms are registered channels with their totals capped, a qualitative channel keeps
// its word in `tag`, and the operator's command refuses a channel that does not exist.

import { describe, expect, it } from 'vitest';
import type { ContentPack } from '../src/content/pack';
import { pack as invPack } from '../src/content/packs/inventory';
import { pack as worldPack } from '../src/content/packs/world';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import type { SystemContext } from '../src/core/system';
import { tr } from '../src/core/text';
import { system as inventory } from '../src/systems/inventory';
import {
  activeTags,
  applyModifiers,
  CHANNEL_BOUNDS,
  isModifierTarget,
  MODIFIER_TARGETS,
  type ModifierSpec,
  system as modifiers,
  registerModifier,
  TAGGED_TARGETS,
} from '../src/systems/modifiers';
import { system as world } from '../src/systems/world';

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs)
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  return out as unknown as ContentMap;
}

function withCtx(fn: (ctx: SystemContext) => void): Engine {
  const probe = {
    id: 'zz_probe',
    order: 999,
    tick: (ctx: SystemContext) => {
      if (ctx.tick === 1) fn(ctx);
    },
  };
  const g = Engine.create(7, merge([worldPack, invPack]), [modifiers, world, inventory, probe]);
  g.step(2);
  return g;
}

const spec = (s: Partial<ModifierSpec>): ModifierSpec => ({
  target: 'health',
  key: 'borderstone',
  untilTick: 10_000,
  source: 'sylvie',
  visibility: 'hidden',
  note: tr('sys.modifiers.reject.expired'),
  ...s,
});

describe('M1 modifier channels', () => {
  it('lists the seven new channels and their caps', () => {
    for (const c of [
      'route_state',
      'weather',
      'health',
      'hazard_rate',
      'door_resonance',
      'resource_tag',
      'loan_terms',
    ])
      expect(isModifierTarget(c), c).toBe(true);
    expect(isModifierTarget('casus_belli')).toBe(false);
    expect(MODIFIER_TARGETS).toHaveLength(17);
    expect(CHANNEL_BOUNDS.health).toEqual({ add: [-40, 40] });
    expect(CHANNEL_BOUNDS.route_state).toEqual({ factor: [0.2, 2] });
    expect(CHANNEL_BOUNDS.hazard_rate).toEqual({ factor: [0.5, 3] });
    expect(CHANNEL_BOUNDS.door_resonance).toEqual({ add: [0, 3] });
    expect(CHANNEL_BOUNDS.loan_terms).toEqual({ add: [-5, 5] });
    expect([...TAGGED_TARGETS].sort()).toEqual(
      ['loan_terms', 'resource_tag', 'route_state', 'weather'].sort(),
    );
  });

  it('combines and caps the numeric channels', () => {
    const g = withCtx((ctx) => {
      registerModifier(ctx, spec({ add: 30 }));
      registerModifier(ctx, spec({ add: 30, source: 'eluen' }));
      registerModifier(ctx, spec({ target: 'hazard_rate', factor: 2.5 }));
      registerModifier(ctx, spec({ target: 'hazard_rate', factor: 2, source: 'valda' }));
      registerModifier(ctx, spec({ target: 'door_resonance', add: -2 }));
      registerModifier(ctx, spec({ target: 'route_state', key: 'north_road', factor: 0.1 }));
      registerModifier(ctx, spec({ target: 'loan_terms', key: 'nera', add: -9, tag: 'goods' }));
    });
    expect(applyModifiers(g.world, 'health', 'borderstone', 50)).toBe(90);
    expect(applyModifiers(g.world, 'hazard_rate', 'borderstone', 1)).toBe(3);
    expect(applyModifiers(g.world, 'door_resonance', 'borderstone', 0)).toBe(0);
    expect(applyModifiers(g.world, 'route_state', 'north_road', 1)).toBeCloseTo(0.2);
    expect(applyModifiers(g.world, 'loan_terms', 'nera', 10)).toBe(5);
  });

  it('keeps the word of a qualitative channel, refreshed with its stacking group', () => {
    const g = withCtx((ctx) => {
      registerModifier(ctx, spec({ target: 'weather', add: 1, tag: 'fog', stackGroup: 'w' }));
      registerModifier(ctx, spec({ target: 'weather', add: 1, tag: 'rain', stackGroup: 'w' }));
      registerModifier(
        ctx,
        spec({ target: 'resource_tag', key: 'old_outpost', tag: 'honey', source: 'merca' }),
      );
    });
    expect(activeTags(g.world, 'weather', 'borderstone')).toEqual(['rain']);
    expect(activeTags(g.world, 'resource_tag', 'old_outpost')).toEqual(['honey']);
    expect(g.world.slices.modifiers.history?.at(-1)?.tag).toBe('honey');
    expect(g.world.slices.modifiers.history?.find((h) => h.kind === 'refreshed')?.tag).toBe('rain');
  });

  it('refuses an unknown channel from the operator command', () => {
    const g = Engine.create(7, merge([worldPack, invPack]), [modifiers, world, inventory]);
    g.queue('modifier.register', spec({ target: 'casus_belli' as never }));
    g.queue('modifier.register', spec({ target: 'route_state', factor: 0.9 }));
    g.step(1);
    const results = g.world.recent.filter(
      (e) => e.kind === 'command.result' && e.data.kind === 'modifier.register',
    );
    expect(results.map((e) => (e.kind === 'command.result' ? e.data.ok : null))).toEqual([
      false,
      true,
    ]);
    const bad = results[0];
    expect(bad?.kind === 'command.result' ? bad.data.code : '').toBe('bad_target');
  });
});
