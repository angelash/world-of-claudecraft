// The rule classification of a scene's free-text input (builtin_ai.md 1.4 "序章分支对话树",
// 6.7; PK-M1-19): without a model, a free answer is sorted into one of the input's classify
// choices by the rule classifier the dialogue system registers here, instead of always
// taking the input's fixed fallback; with a model, the same pick is the request's fallback.
// One classifier; the last registered wins. Null means no rule decides.

import type { SystemContext } from '../../core/system';

export interface AnswerQuery {
  sceneId: string;
  /** the input node */
  nodeId: string;
  /** the player's trimmed text */
  text: string;
  /** the classify choices still open (visible) */
  choices: readonly string[];
}

export type AnswerClassifier = (ctx: SystemContext, q: AnswerQuery) => string | null;

let classifier: AnswerClassifier | null = null;

/** Register (or clear, with null) the rule classifier of free scene input. */
export function registerAnswerClassifier(fn: AnswerClassifier | null): void {
  classifier = fn;
}

/** The rule pick for a free answer, or null (no classifier, or no rule decides). */
export function ruleAnswer(ctx: SystemContext, q: AnswerQuery): string | null {
  if (!classifier || !q.text) return null;
  const pick = classifier(ctx, q);
  return pick !== null && q.choices.includes(pick) ? pick : null;
}
