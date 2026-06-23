import { describe, expect, it } from 'vitest';
import { aiAttentionBodyOffset, aiAttentionFacing, type AiAttentionFacingEntity } from '../src/render/ai_attention';

function entity(overrides: Partial<AiAttentionFacingEntity> = {}): AiAttentionFacingEntity {
  return {
    kind: 'npc',
    dead: false,
    inCombat: false,
    castingAbility: null,
    pos: { x: 0, z: 0 },
    prevPos: { x: 0, z: 0 },
    ...overrides,
  };
}

function expectOffsetClose(actual: { x: number; z: number } | null, expected: { x: number; z: number }): void {
  expect(actual).not.toBeNull();
  expect(actual!.x).toBeCloseTo(expected.x);
  expect(actual!.z).toBeCloseTo(expected.z);
}

describe('AI attention facing', () => {
  it('turns idle NPCs and mobs toward nearby attention targets', () => {
    expect(aiAttentionFacing(entity(), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeCloseTo(Math.PI / 2);
    expect(aiAttentionFacing(entity({ kind: 'mob' }), { x: 0, z: -1 }, { x: 0, z: 0 })).toBeCloseTo(Math.PI);
  });

  it('leaves gameplay-sensitive or unsuitable entities alone', () => {
    expect(aiAttentionFacing(entity({ kind: 'player' }), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(aiAttentionFacing(entity({ kind: 'object' }), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(aiAttentionFacing(entity({ dead: true }), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(aiAttentionFacing(entity({ inCombat: true }), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(aiAttentionFacing(entity({ castingAbility: 'fireball' }), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeNull();
  });

  it('ignores moving, too-close, and too-distant targets', () => {
    expect(aiAttentionFacing(entity({ pos: { x: 0.1, z: 0 } }), { x: 1, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(aiAttentionFacing(entity(), { x: 0.01, z: 0 }, { x: 0, z: 0 })).toBeNull();
    expect(aiAttentionFacing(entity(), { x: 41, z: 0 }, { x: 0, z: 0 })).toBeNull();
  });
});

describe('AI attention body offset', () => {
  it('nudges idle NPCs toward, away from, or subtly into an attention target', () => {
    expectOffsetClose(aiAttentionBodyOffset(
      entity(),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'approach',
      { elapsedMs: 700, durationMs: 1400 },
    ), { x: 0.48, z: 0 });

    expectOffsetClose(aiAttentionBodyOffset(
      entity(),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'avoid',
      { elapsedMs: 700, durationMs: 1400 },
    ), { x: -0.48, z: 0 });

    expectOffsetClose(aiAttentionBodyOffset(
      entity(),
      { x: 0, z: 10 },
      { x: 0, z: 0 },
      'inspect',
      { elapsedMs: 700, durationMs: 1400 },
    ), { x: 0, z: 0.14 });
  });

  it('eases body language in and out instead of applying a permanent offset', () => {
    expect(aiAttentionBodyOffset(
      entity(),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'approach',
      { elapsedMs: 0, durationMs: 1400 },
    )).toBeNull();
    expect(aiAttentionBodyOffset(
      entity(),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'approach',
      { elapsedMs: 1400, durationMs: 1400 },
    )).toBeNull();
    expect(aiAttentionBodyOffset(
      entity(),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'approach',
      { elapsedMs: 1500, durationMs: 1400 },
    )).toBeNull();
  });

  it('uses supplied action offsets for stronger or subtler presentation motion', () => {
    expectOffsetClose(aiAttentionBodyOffset(
      entity(),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'approach',
      { elapsedMs: 700, durationMs: 1400 },
      { stepOffset: 0.9 },
    ), { x: 0.9, z: 0 });

    expectOffsetClose(aiAttentionBodyOffset(
      entity(),
      { x: 0, z: 10 },
      { x: 0, z: 0 },
      'inspect',
      { elapsedMs: 700, durationMs: 1400 },
      { inspectOffset: 0.24 },
    ), { x: 0, z: 0.24 });
  });

  it('does not visually displace moving or gameplay-sensitive entities', () => {
    expect(aiAttentionBodyOffset(
      entity({ pos: { x: 0.1, z: 0 } }),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'approach',
      { elapsedMs: 700, durationMs: 1400 },
    )).toBeNull();
    expect(aiAttentionBodyOffset(
      entity({ inCombat: true }),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'avoid',
      { elapsedMs: 700, durationMs: 1400 },
    )).toBeNull();
    expect(aiAttentionBodyOffset(
      entity({ castingAbility: 'fireball' }),
      { x: 10, z: 0 },
      { x: 0, z: 0 },
      'inspect',
      { elapsedMs: 700, durationMs: 1400 },
    )).toBeNull();
  });
});
