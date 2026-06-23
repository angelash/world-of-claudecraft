import { describe, expect, it } from 'vitest';
import { aiReactionBadgeView } from '../src/ui/ai_reaction';
import type { SimEvent } from '../src/sim/types';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;

function reaction(
  kind: NonNullable<AiSpeechEvent['reaction']>['kind'],
  rest: Omit<NonNullable<AiSpeechEvent['reaction']>, 'kind'> = {},
): AiSpeechEvent['reaction'] {
  return { kind, ...rest };
}

describe('AI reaction badge view', () => {
  it('maps visible reaction kinds to HUD chrome labels', () => {
    expect(aiReactionBadgeView(reaction('approach'))).toEqual({
      kind: 'approach',
      labelKey: 'hudChrome.aiReaction.approach',
    });
    expect(aiReactionBadgeView(reaction('avoid'))).toEqual({
      kind: 'avoid',
      labelKey: 'hudChrome.aiReaction.avoid',
    });
    expect(aiReactionBadgeView(reaction('inspect'))).toEqual({
      kind: 'inspect',
      labelKey: 'hudChrome.aiReaction.inspect',
    });
  });

  it('does not show a badge for ignored or missing reactions', () => {
    expect(aiReactionBadgeView(reaction('ignore'))).toBeNull();
    expect(aiReactionBadgeView(undefined)).toBeNull();
  });

  it('exposes the target entity for attention links', () => {
    expect(aiReactionBadgeView(reaction('inspect', { targetObjectId: 42 }))).toMatchObject({
      kind: 'inspect',
      targetEntityId: 42,
    });
    expect(aiReactionBadgeView(reaction('avoid', { targetEntityId: 13, targetObjectId: 42 }))).toMatchObject({
      kind: 'avoid',
      targetEntityId: 13,
    });
  });

  it('exposes finite world targets and clamps presentation action timing', () => {
    expect(aiReactionBadgeView(reaction('approach', {
      targetPos: { x: 12.5, z: -3 },
      actionDurationMs: 120,
      actionOffset: 2,
    }))).toMatchObject({
      kind: 'approach',
      targetPos: { x: 12.5, z: -3 },
      durationMs: 700,
      actionOffset: 1.2,
    });

    expect(aiReactionBadgeView(reaction('inspect', {
      targetPos: { x: Number.NaN, z: 4 },
      actionDurationMs: 8_000,
      actionOffset: 0,
    }))).toMatchObject({
      kind: 'inspect',
      durationMs: 6000,
      actionOffset: 0.04,
    });
    expect(aiReactionBadgeView(reaction('inspect', {
      targetPos: { x: Number.NaN, z: 4 },
    }))).not.toHaveProperty('targetPos');
  });

  it('marks planned reactions so the HUD can hold their badge longer', () => {
    expect(aiReactionBadgeView(reaction('inspect', {
      planKind: 'followScent',
      planIntensity: 0.8,
    }))).toMatchObject({
      kind: 'inspect',
      planned: true,
      planKind: 'followScent',
      durationMs: 2980,
    });
  });
});
