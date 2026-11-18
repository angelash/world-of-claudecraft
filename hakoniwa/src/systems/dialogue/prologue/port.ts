// Registers the dialogue system's rule classifier with the scene runner (../../scenes/
// answer_port.ts): an interview answer goes through the round's rules, a free question in
// the call scene through the prologue topics' words. Imported by the dialogue system, so
// the classifier is in place wherever dialogue runs; a scene without rules keeps its own
// fallback.

import type { SystemContext } from '../../../core/system';
import { type AnswerQuery, registerAnswerClassifier } from '../../scenes/answer_port';
import { classifyIntent } from '../intent/classify';
import { normalizeInput } from '../intent/normalize';
import { topicsAsked } from '../topics/graph';
import { classifyAnswer, roundOf } from './answers';

/** The rule pick for a free answer or question of a prologue scene (null: no rule decides). */
export function prologueAnswer(ctx: SystemContext, q: AnswerQuery): string | null {
  const data = ctx.content.prologueAnswers;
  const lex = ctx.content.intentLexicon;
  if (!data || !lex) return null;
  const normalized = normalizeInput(q.text, lex);
  const texts = [q.text, normalized];
  const round = roundOf(data, q.sceneId, q.nodeId);
  if (round) {
    const intent = ctx.content.intentRules
      ? classifyIntent(q.text, ctx.content, { flag: (k) => ctx.flag(k) }).main
      : null;
    return classifyAnswer(data, round, texts, intent, q.choices);
  }
  if (data.questions.some((x) => x.scene === q.sceneId && x.node === q.nodeId)) {
    const hit = topicsAsked(
      ctx.content,
      normalized,
      (t) => t.scene?.id === q.sceneId && q.choices.includes(t.scene.choice),
    )[0];
    return hit?.scene?.choice ?? null;
  }
  return null;
}

registerAnswerClassifier(prologueAnswer);
