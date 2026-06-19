import { describe, expect, it } from 'vitest';
import { castBarState } from '../src/render/cast_bar';
import { Entity } from '../src/sim/types';

// castBarState reads only a handful of cast fields, so a minimal partial entity
// cast to Entity is enough to exercise every branch without a WebGL context.
function caster(over: Partial<Entity>): Entity {
  return {
    kind: 'mob', dead: false,
    castingAbility: 'fireball', castRemaining: 2.5, castTotal: 2.5, channeling: false,
    ...over,
  } as Entity;
}

describe('overhead cast bar', () => {
  it('is hidden when nothing is being cast', () => {
    expect(castBarState(caster({ castingAbility: null })).visible).toBe(false);
  });

  it('hides for corpses, objects, and a zero-length cast (no divide-by-zero)', () => {
    expect(castBarState(caster({ dead: true })).visible).toBe(false);
    expect(castBarState(caster({ kind: 'object' })).visible).toBe(false);
    expect(castBarState(caster({ castTotal: 0 })).visible).toBe(false);
  });

  it('fills a hardcast upward toward completion', () => {
    // 2.5s left of a 2.5s cast → just started → ~empty
    expect(castBarState(caster({ castRemaining: 2.5, castTotal: 2.5 })).fill).toBeCloseTo(0);
    // 0.5s left → 80% done
    const mid = castBarState(caster({ castRemaining: 0.5, castTotal: 2.5 }));
    expect(mid.fill).toBeCloseTo(0.8);
    expect(mid.channel).toBe(false);
    expect(mid.label).toBe('Fireball');
  });

  it('drains a channel downward as it ticks', () => {
    const ch = castBarState(caster({
      castingAbility: 'arcane_missiles', channeling: true, castRemaining: 1.5, castTotal: 3,
    }));
    expect(ch.channel).toBe(true);
    expect(ch.fill).toBeCloseTo(0.5); // half the channel left → half-full, draining
    expect(ch.label).toBe('Arcane Missiles');
  });

  it('labels fishing and falls back to the raw id for unknown abilities', () => {
    expect(castBarState(caster({ castingAbility: 'fishing' })).label).toBe('Fishing');
    expect(castBarState(caster({ castingAbility: 'made_up_spell' })).label).toBe('made_up_spell');
  });

  it('shows custom raid mechanic casts with readable labels', () => {
    const rage = castBarState(caster({
      castingAbility: 'nythraxis_deathless_rage',
      castRemaining: 5,
      castTotal: 10,
    }));
    expect(rage.visible).toBe(true);
    expect(rage.channel).toBe(false);
    expect(rage.fill).toBeCloseTo(0.5);
    expect(rage.label).toBe('Deathless Rage');

    const ward = castBarState(caster({
      castingAbility: 'nythraxis_ward_channel',
      channeling: true,
      castRemaining: 3,
      castTotal: 5,
    }));
    expect(ward.channel).toBe(true);
    expect(ward.fill).toBeCloseTo(0.6);
    expect(ward.label).toBe('Wardstone Channel');
  });

  it('clamps the fill fraction to 0..1 against transient overshoot', () => {
    expect(castBarState(caster({ castRemaining: 9, castTotal: 2.5 })).fill).toBe(0);
    expect(castBarState(caster({ castRemaining: -1, castTotal: 2.5 })).fill).toBe(1);
  });
});
