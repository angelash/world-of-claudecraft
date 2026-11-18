// The prologue's branch dialogue tree without a model (builtin_ai.md 1.4 "序章分支对话树",
// 6.7; prologue_antechamber.md 4.8 and 7): a free answer in an interview round is sorted
// into the round's categories by rule, and a free question in the call scene is matched to
// one of the prologue topics, whose scene choice answers it. The tree's nodes are the
// prologue scenes (data/scenes/prologue.json); the rules are data
// (data/dialogue/prologue_answers.json); the topics are data/dialogue/topics/prologue.json.
//
//   score of a category = group weight x keyword groups hit + intent weight x the
//                         classifier's main intent listed - exclude weight x exclude words
//   the best score at or over the threshold wins (ties to the longer matched word, then the
//   earlier category: "你输过" over "输过"); an answer
//   with no word at all goes to the round's silent category; otherwise no rule decides.
//
// Pure: the caller passes the normalized text and the classified intent.

import type { IntentId } from '../intent/types';

export interface AnswerRule {
  /** keyword groups (a hit per group with any of its words) and words that speak against it */
  keywords?: { any?: string[][]; exclude?: string[] };
  /** the free-text classifier's main intents that support this category */
  intents?: IntentId[];
  /** taken for an answer without words (silence, an ellipsis) */
  silent?: boolean;
}

export interface AnswerRound {
  scene: string;
  /** the input node of the round */
  node: string;
  /** choice id of the round's classify node -> its rule */
  choices: Record<string, AnswerRule>;
}

export interface PrologueAnswers {
  threshold: number;
  weights: { group: number; intent: number; exclude: number };
  rounds: AnswerRound[];
  /** free questions answered by the topics whose scene is this one */
  questions: { scene: string; node: string }[];
}

declare module '../../../core/contracts' {
  interface ContentMap {
    prologueAnswers: PrologueAnswers;
  }
}

/** Whether the text has a word at all (letters, digits or ideographs). */
export function hasWords(text: string): boolean {
  return /[\p{L}\p{N}]/u.test(text);
}

export function roundOf(
  data: PrologueAnswers | undefined,
  sceneId: string,
  nodeId: string,
): AnswerRound | undefined {
  return data?.rounds.find((r) => r.scene === sceneId && r.node === nodeId);
}

/**
 * The category of a free answer (prologue 4.8), among the choices still open; null when no
 * rule decides (the scene keeps its own fallback).
 */
export function classifyAnswer(
  data: PrologueAnswers,
  round: AnswerRound,
  texts: readonly string[],
  intent: IntentId | null,
  open: readonly string[],
): string | null {
  const ids = Object.keys(round.choices).filter((id) => open.includes(id));
  if (!texts.some(hasWords)) return ids.find((id) => round.choices[id]?.silent) ?? null;
  const w = data.weights;
  const has = (word: string) => texts.some((t) => t.includes(word));
  let best: string | null = null;
  let bestScore = -Infinity;
  let bestLen = 0;
  for (const id of ids) {
    const rule = round.choices[id] as AnswerRule;
    let score = 0;
    let len = 0;
    for (const group of rule.keywords?.any ?? []) {
      const hits = group.filter(has);
      if (hits.length === 0) continue;
      score += w.group;
      for (const h of hits) len = Math.max(len, Array.from(h).length);
    }
    if (intent && (rule.intents ?? []).includes(intent)) score += w.intent;
    for (const x of rule.keywords?.exclude ?? []) if (has(x)) score -= w.exclude;
    if (score < data.threshold) continue;
    if (score > bestScore || (score === bestScore && len > bestLen)) {
      best = id;
      bestScore = score;
      bestLen = len;
    }
  }
  return best;
}

type SceneLike = {
  id: string;
  nodes: { id: string; input?: { classify?: { node: string; choices: string[] } } }[];
};

/** Content checks: every round names an input with a classify node and its choices only. */
export function prologueAnswerProblems(
  data: PrologueAnswers | undefined,
  scenes: readonly SceneLike[] | undefined,
): string[] {
  if (!data) return ['prologueAnswers table missing'];
  const out: string[] = [];
  // the rounds name scene nodes: checked when the scenes are merged in
  if (!scenes) return out;
  if (!(data.threshold > 0)) out.push('prologueAnswers.threshold must be positive');
  for (const k of ['group', 'intent', 'exclude'] as const)
    if (typeof data.weights?.[k] !== 'number') out.push(`prologueAnswers.weights.${k} missing`);
  const seen = new Set<string>();
  for (const r of data.rounds) {
    const at = `prologue answers ${r.scene}/${r.node}`;
    if (seen.has(`${r.scene}/${r.node}`)) out.push(`${at}: listed twice`);
    seen.add(`${r.scene}/${r.node}`);
    const node = scenes?.find((s) => s.id === r.scene)?.nodes.find((n) => n.id === r.node);
    const cl = node?.input?.classify;
    if (!cl) {
      out.push(`${at}: no input with a classify node`);
      continue;
    }
    for (const [id, rule] of Object.entries(r.choices)) {
      if (!cl.choices.includes(id)) out.push(`${at}: ${id} is not one of its classify choices`);
      for (const g of rule.keywords?.any ?? [])
        if (!Array.isArray(g) || g.length === 0 || g.some((w) => typeof w !== 'string' || !w))
          out.push(`${at}: ${id} has an empty keyword group`);
    }
  }
  for (const q of data.questions) {
    const node = scenes?.find((s) => s.id === q.scene)?.nodes.find((n) => n.id === q.node);
    if (!node) out.push(`prologue questions ${q.scene}/${q.node}: no such node`);
  }
  return out;
}
