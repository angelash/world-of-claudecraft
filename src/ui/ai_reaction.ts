import type { SimEvent } from '../sim/types';
import type { TranslationKey } from './i18n';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;
export type AiReactionKind = NonNullable<AiSpeechEvent['reaction']>['kind'];
export type VisibleAiReactionKind = Exclude<AiReactionKind, 'ignore'>;

export interface AiReactionBadgeView {
  kind: VisibleAiReactionKind;
  labelKey: TranslationKey;
}

const BADGE_KEYS: Record<VisibleAiReactionKind, TranslationKey> = {
  approach: 'hudChrome.aiReaction.approach',
  avoid: 'hudChrome.aiReaction.avoid',
  inspect: 'hudChrome.aiReaction.inspect',
};

export function aiReactionBadgeView(reaction: AiSpeechEvent['reaction']): AiReactionBadgeView | null {
  if (!reaction || reaction.kind === 'ignore') return null;
  return { kind: reaction.kind, labelKey: BADGE_KEYS[reaction.kind] };
}
