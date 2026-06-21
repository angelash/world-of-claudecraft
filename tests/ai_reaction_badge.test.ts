import { describe, expect, it } from 'vitest';
import { aiReactionBadgeView } from '../src/ui/ai_reaction';
import type { SimEvent } from '../src/sim/types';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;

function reaction(kind: NonNullable<AiSpeechEvent['reaction']>['kind']): AiSpeechEvent['reaction'] {
  return { kind };
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
});
