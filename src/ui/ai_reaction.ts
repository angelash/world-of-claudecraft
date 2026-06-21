import type { SimEvent } from '../sim/types';
import type { TranslationKey } from './i18n';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;
export type AiReactionKind = NonNullable<AiSpeechEvent['reaction']>['kind'];
export type VisibleAiReactionKind = Exclude<AiReactionKind, 'ignore'>;

export interface AiReactionBadgeView {
  kind: VisibleAiReactionKind;
  labelKey: TranslationKey;
  targetEntityId?: number;
}

const BADGE_KEYS: Record<VisibleAiReactionKind, TranslationKey> = {
  approach: 'hudChrome.aiReaction.approach',
  avoid: 'hudChrome.aiReaction.avoid',
  inspect: 'hudChrome.aiReaction.inspect',
};

export function aiReactionBadgeView(reaction: AiSpeechEvent['reaction']): AiReactionBadgeView | null {
  if (!reaction || reaction.kind === 'ignore') return null;
  const targetEntityId = typeof reaction.targetEntityId === 'number'
    ? reaction.targetEntityId
    : typeof reaction.targetObjectId === 'number'
      ? reaction.targetObjectId
      : undefined;
  return targetEntityId === undefined
    ? { kind: reaction.kind, labelKey: BADGE_KEYS[reaction.kind] }
    : { kind: reaction.kind, labelKey: BADGE_KEYS[reaction.kind], targetEntityId };
}
