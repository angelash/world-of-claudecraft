import type { SimEvent } from '../sim/types';
import type { TranslationKey } from './i18n';

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;
export type AiReactionKind = NonNullable<AiSpeechEvent['reaction']>['kind'];
export type VisibleAiReactionKind = Exclude<AiReactionKind, 'ignore'>;

export interface AiReactionBadgeView {
  kind: VisibleAiReactionKind;
  labelKey: TranslationKey;
  targetEntityId?: number;
  planned?: true;
  planKind?: string;
  durationMs?: number;
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
  const planIntensity = typeof reaction.planIntensity === 'number'
    ? Math.max(0, Math.min(1, reaction.planIntensity))
    : 0;
  const planKind = typeof reaction.planKind === 'string' && reaction.planKind.length > 0 ? reaction.planKind : undefined;
  const planned = planKind !== undefined || planIntensity > 0;
  const base: AiReactionBadgeView = {
    kind: reaction.kind,
    labelKey: BADGE_KEYS[reaction.kind],
    ...(targetEntityId === undefined ? {} : { targetEntityId }),
  };
  return planned
    ? {
        ...base,
        planned: true,
        ...(planKind ? { planKind } : {}),
        durationMs: Math.round(2_100 + planIntensity * 1_100),
      }
    : base;
}
