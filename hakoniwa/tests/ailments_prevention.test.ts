// Preventive item auras affect exposure while worn, and spot risk at the dawn check.
import { describe, expect, it } from 'vitest';
import { validateCombat } from '../src/content/packs/combat';
import type { ContentMap } from '../src/core/contracts';
import { Rng } from '../src/core/rng';
import { bodyOf, dawnCheck, freshBody, sampleHour, stepBody } from '../src/systems/ailments';
import { unitOf } from '../src/systems/combat';
import { addItem } from '../src/systems/inventory';
import { setTag } from '../src/systems/world';
import { content, game, lastResult, SPRING, withCtx, withHotSpot } from './ailments_harness';

function sample(itemId: string | null, grade: number): number {
  const c = withHotSpot(SPRING.map, 'north_spring', grade);
  const g = game(SPRING, { content: c });
  if (itemId) {
    withCtx(g, (ctx) => addItem(ctx, 'player', itemId, 1));
    g.queue('inventory.use', { ownerId: 'player', itemId });
    g.step(1);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(true);
  }
  let hours = 0;
  withCtx(g, (ctx) => {
    const b = bodyOf(ctx.world, 'player');
    b.hours.fill(0);
    sampleHour(ctx);
    hours = b.hours[grade] ?? 0;
  });
  return hours;
}

describe('the three act 1 prevention auras', () => {
  it('tea reduces environmental gains by 30 percent while its aura is active', () => {
    expect(sample(null, 2)).toBe(1);
    expect(sample('cs_greybane_tea', 2)).toBeCloseTo(0.7, 8);
    expect(sample('cs_greybane_tea', 4)).toBeCloseTo(0.7, 8);
  });

  it('the veil halves gains below dense, and never weakens clean-place recovery', () => {
    expect(sample('cs_ash_veil', 2)).toBeCloseTo(0.5, 8);
    expect(sample('cs_ash_veil', 3)).toBe(1);
    expect(sample('cs_ash_veil', 0)).toBe(1);
    expect(sample('cs_greybane_tea', 1)).toBe(1);
  });

  it('spot prevention applies after rank and frailty, and not to fever', () => {
    const cfg = content().ailmentsConfig;
    const day = { day: 1, worn: [], tier: 0, frail: false, spotRisk: 0.8 };
    const b = { ...freshBody(), taint: 20 };
    expect(stepBody(cfg, b, day, () => 0.0045).onset).toBe(false);
    expect(
      stepBody(cfg, { ...freshBody(), taint: 20 }, { ...day, spotRisk: 1 }, () => 0.0045).onset,
    ).toBe(true);
    const fever = { ...freshBody(), taint: 45, stage: 'spot' as const };
    expect(stepBody(cfg, fever, { ...day, spotRisk: 0 }, () => 0).stage).toBe('fever');
  });

  it('the real dawn check reads adult and child multipliers from the used sachet', () => {
    const stages = [false, true].map((child) => {
      const g = game(SPRING);
      withCtx(g, (ctx) => {
        addItem(ctx, 'player', 'cs_ash_sachet', 1);
        setTag(ctx, 'player', 'child', child);
      });
      g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_ash_sachet' });
      g.step(1);
      expect(lastResult(g, 'inventory.use')?.ok).toBe(true);
      let stage = '';
      withCtx(g, (ctx) => {
        const b = bodyOf(ctx.world, 'player');
        Object.assign(b, freshBody(), { taint: 20 });
        ctx.world.slices.ailments.checked = -1;
        const fixed = new Rng({ s: 0 });
        fixed.next = () => 0.0038;
        dawnCheck({ ...ctx, rng: () => fixed });
        stage = b.stage;
      });
      return stage;
    });
    expect(stages).toEqual(['spot', 'none']);
  });

  it('expired protection does not reduce another hour of exposure', () => {
    const c = withHotSpot(SPRING.map, 'north_spring', 2);
    const g = game(SPRING, { content: c });
    withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_greybane_tea', 1));
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_greybane_tea' });
    g.step(1);
    const u = unitOf(g.world, 'player');
    const a = u?.auras.find((aura) => aura.id === 'aur_item_greybanetea');
    if (!a) throw new Error('tea aura missing');
    a.expires = g.tick;
    withCtx(g, (ctx) => {
      const b = bodyOf(ctx.world, 'player');
      b.hours.fill(0);
      sampleHour(ctx);
      expect(b.hours[2]).toBe(1);
    });
  });

  it('the shipped auras have explicit prevention data, not magic item ids in the system', () => {
    const rows = new Map(content().auras.map((a) => [a.id, a]));
    expect(rows.get('aur_item_greybanetea')?.prevention).toEqual({
      exposure: { multiplier: 0.7 },
    });
    expect(rows.get('aur_item_ashveil')?.prevention).toEqual({
      exposure: { multiplier: 0.5, belowGrade: 3 },
    });
    expect(rows.get('aur_item_ashsachet')?.prevention).toEqual({
      spot: { adult: 0.8, child: 0.5 },
    });
  });

  it.each([
    null,
    [],
    {},
    { exposure: { multiplier: -0.1 } },
    { exposure: { multiplier: 1.1 } },
    { exposure: { multiplier: 0.5, belowGrade: 2.5 } },
    { exposure: { multiplier: 0.5, unknown: true } },
    { spot: { adult: 0.8 } },
    { spot: { adult: 0.8, child: Number.NaN } },
    { extra: true },
  ])('rejects malformed prevention data %j', (prevention) => {
    const c = {
      ...content(),
      auras: [
        ...content().auras,
        { id: 'zz_bad_prevention', name: 'fixture', kind: 'buff', duration: 1, prevention },
      ],
    } as unknown as ContentMap;
    expect(
      validateCombat(c).some((s) => s.includes('zz_bad_prevention') && s.includes('prevention')),
    ).toBe(true);
  });
});
