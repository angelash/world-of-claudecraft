// Registered modifiers (economy_and_trade.md 7.3, 7.4): channel caps, same-source refresh by
// stacking group, a stable combine order, per-modifier accounting and the append-only history.

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
  applyModifiers,
  CHANNEL_BOUNDS,
  MODIFIER_HISTORY_KEEP,
  type ModifierSpec,
  modifierBreakdown,
  system as modifiers,
  registerModifier,
} from '../src/systems/modifiers';
import { system as world } from '../src/systems/world';

function merge(packs: ContentPack[]): ContentMap {
  const out: Record<string, unknown> = {};
  for (const p of packs) {
    for (const [k, v] of Object.entries(p.tables)) {
      const prev = out[k];
      out[k] = Array.isArray(prev) && Array.isArray(v) ? [...prev, ...v] : v;
    }
  }
  return out as unknown as ContentMap;
}

function makeGame(): Engine {
  return Engine.create(7, merge([worldPack, invPack]), [modifiers, world, inventory]);
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

const spec = (over: Partial<ModifierSpec>): ModifierSpec => ({
  target: 'harvest',
  key: 'site',
  factor: 1,
  untilTick: 100000,
  source: 'test',
  visibility: 'public',
  note: '测试',
  ...over,
});

describe('channel caps', () => {
  it('clamps combined factors and adds to the design bounds', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      registerModifier(ctx, spec({ factor: 2, source: 'a' }));
      registerModifier(ctx, spec({ factor: 2, source: 'b' }));
      registerModifier(ctx, spec({ target: 'morale', key: 'player', add: 25, source: 'a' }));
      registerModifier(ctx, spec({ target: 'morale', key: 'player', add: 25, source: 'b' }));
      registerModifier(ctx, spec({ target: 'price', key: 'salt', factor: 0.2, source: 'a' }));
    });
    expect(CHANNEL_BOUNDS.harvest?.factor).toEqual([0.3, 1.5]);
    expect(applyModifiers(g.world, 'harvest', 'site', 10)).toBeCloseTo(15);
    expect(applyModifiers(g.world, 'morale', 'player', 0)).toBe(30);
    expect(applyModifiers(g.world, 'price', 'salt', 10)).toBeCloseTo(5);
    // channels without a design cap are left alone
    withCtx(g, (ctx) => registerModifier(ctx, spec({ target: 'monster', key: 'm', factor: 4 })));
    expect(applyModifiers(g.world, 'monster', 'm', 1)).toBe(4);
  });

  it('reports what the cap took off in the breakdown', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      registerModifier(ctx, spec({ factor: 1.4, source: 'a', note: '甲' }));
      registerModifier(ctx, spec({ factor: 1.25, source: 'b', note: '乙' }));
    });
    const b = modifierBreakdown(g.world, 'harvest', 'site', 100);
    expect(b.lines.map((l) => l.note)).toEqual(['甲', '乙']);
    expect(b.lines[0]?.delta).toBeCloseTo(40);
    expect(b.lines[1]?.delta).toBeCloseTo(35);
    expect(b.total).toBeCloseTo(150);
    expect(b.capDelta).toBeCloseTo(-25);
  });
});

describe('modifier.register', () => {
  it('rejects a modifier whose term has passed with a text key', () => {
    const g = makeGame();
    g.step(2);
    g.queue('modifier.register', spec({ untilTick: 1 }), { type: 'script', script: 'test' });
    g.step(1);
    const r = [...g.world.recent]
      .reverse()
      .find((e) => e.kind === 'command.result' && e.data.kind === 'modifier.register');
    expect(r?.kind === 'command.result' && r.data).toMatchObject({
      ok: false,
      code: 'expired',
      reason: tr('sys.modifiers.reject.expired'),
    });
  });
});

describe('stacking groups', () => {
  it('refreshes a same-source modifier of the same group instead of stacking', () => {
    const g = makeGame();
    let first = '';
    let second = '';
    withCtx(g, (ctx) => {
      first = registerModifier(
        ctx,
        spec({ factor: 1.2, stackGroup: 'blessing', untilTick: 500 }),
      ).id;
      second = registerModifier(
        ctx,
        spec({ factor: 1.1, stackGroup: 'blessing', untilTick: 900 }),
      ).id;
    });
    expect(second).toBe(first);
    const active = g.world.slices.modifiers.active;
    expect(active).toHaveLength(1);
    expect(active[0]?.factor).toBe(1.1);
    expect(active[0]?.untilTick).toBe(900);
    expect(g.world.slices.modifiers.history?.map((h) => h.kind)).toEqual([
      'registered',
      'refreshed',
    ]);
  });

  it('still stacks across sources, groups, or when no group is given', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      registerModifier(ctx, spec({ factor: 1.1, stackGroup: 'g', source: 'a' }));
      registerModifier(ctx, spec({ factor: 1.1, stackGroup: 'g', source: 'b' }));
      registerModifier(ctx, spec({ factor: 1.1, stackGroup: 'h', source: 'a' }));
      registerModifier(ctx, spec({ factor: 1.1 }));
      registerModifier(ctx, spec({ factor: 1.1 }));
    });
    expect(g.world.slices.modifiers.active).toHaveLength(5);
  });
});

describe('order and history', () => {
  it('combines in a stable order whatever the registration order', () => {
    const lines = (order: string[]) => {
      const g = makeGame();
      withCtx(g, (ctx) => {
        for (const s of order) registerModifier(ctx, spec({ factor: 1.1, source: s, note: s }));
      });
      return modifierBreakdown(g.world, 'harvest', 'site', 1).lines.map((l) => l.source);
    };
    expect(lines(['c', 'a', 'b'])).toEqual(['a', 'b', 'c']);
    expect(lines(['b', 'c', 'a'])).toEqual(['a', 'b', 'c']);
  });

  it('keeps an append-only history trimmed to the newest rows', () => {
    const g = makeGame();
    withCtx(g, (ctx) => {
      for (let i = 0; i < MODIFIER_HISTORY_KEEP + 5; i++) {
        registerModifier(ctx, spec({ target: 'xp', key: `k${i}`, factor: 1.01 }));
      }
    });
    const h = g.world.slices.modifiers.history ?? [];
    expect(h).toHaveLength(MODIFIER_HISTORY_KEEP);
    expect(h.at(-1)?.key).toBe(`k${MODIFIER_HISTORY_KEEP + 4}`);
    expect(h[0]?.key).toBe('k5');
  });
});
