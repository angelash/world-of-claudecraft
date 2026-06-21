import { describe, expect, it } from 'vitest';
import { aiAttentionFacing, type AiAttentionFacingEntity } from '../src/render/ai_attention';

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
