// The intent classifier (builtin_ai.md 6.3 steps 5, 7 and 8): sentence features, rule
// scoring, the per-clause winner and the merge of up to three clauses into a main and a
// secondary intent.
//
//   score = base + 3 x keyword groups hit + 4 x template hit + 3 x needed entity kinds present
//         + 1 x matching features - 5 x exclude terms present + context bonus
//
// (the weights come from data/dialogue/intents.json). A rule scores only with some evidence
// (a keyword group, a template or a needed entity); the clause takes the best rule at or
// over the threshold, ties to the higher priority, then the earlier rule; nothing over the
// threshold is `unknown`. The main intent is the clause whose intent's merge group comes
// first, the secondary the next one. Pure and deterministic: no draw, no clock.

import type { ContentMap } from '../../../core/contracts';
import { entityTable, extractEntities, maskEntities, pronounEntity } from './entities';
import { compact, normalizeInput, splitClauses, stripParticles } from './normalize';
import { compilePattern, matchPattern, termWords } from './pattern';
import type {
  ClassifyContext,
  ClassifyResult,
  Clause,
  ClauseFeatures,
  ClauseResult,
  EntityHit,
  FeatureName,
  IntentId,
  IntentLexicon,
  IntentRule,
  IntentRuleSet,
  IntentScore,
  MergeGroup,
  ScoreTerm,
} from './types';

export type IntentContent = Partial<
  Pick<ContentMap, 'npcs' | 'goddesses' | 'maps' | 'items' | 'monsters' | 'companions'>
> &
  Pick<ContentMap, 'intentLexicon' | 'intentRules'>;

function hasAny(text: string, words: readonly string[]): boolean {
  for (const w of words) if (w && text.includes(w)) return true;
  return false;
}

/** Sentence features of a clause (6.3 step 5). */
export function clauseFeatures(
  clause: string,
  masked: string,
  core: string,
  lex: IntentLexicon,
): ClauseFeatures {
  const f = lex.features;
  const has = (name: FeatureName) => hasAny(masked, f[name] ?? []);
  const endsAsking = (f.question_end ?? []).some((p) => masked.endsWith(p));
  return {
    question: clause.includes('?') || endsAsking || has('question'),
    imperative: has('imperative'),
    negation: has('negation'),
    first: has('first'),
    second: has('second'),
    polite: has('polite'),
    positive: has('positive'),
    negative: has('negative'),
    length: Array.from(core).length,
  };
}

/** Analyse one normalized clause: entities, masked forms, features. */
export function analyzeClause(text: string, content: IntentContent, ctx: ClassifyContext): Clause {
  const lex = content.intentLexicon;
  const flat = compact(text);
  const entities = extractEntities(flat, entityTable(content, lex), lex, ctx.flag);
  const masked = maskEntities(flat, entities);
  const core = stripParticles(masked, lex);
  return {
    text,
    masked,
    core,
    entities,
    features: clauseFeatures(text, masked, core, lex),
  };
}

function termHit(term: string, text: string, lex: IntentLexicon): boolean {
  return hasAny(text, termWords(term, lex));
}

/**
 * Score one rule on a clause; null when the rule has no evidence (no keyword group, no
 * template, no needed entity) or its entity gate is closed.
 */
export function scoreRule(
  rule: IntentRule,
  order: number,
  clause: Clause,
  set: IntentRuleSet,
  lex: IntentLexicon,
  ctx: ClassifyContext,
  extra: readonly EntityHit[] = [],
): IntentScore | null {
  const w = set.weights;
  const kinds = new Set([...clause.entities, ...extra].map((e) => e.kind));
  const needs = rule.needs ?? [];
  const entityHits = needs.filter((k) => kinds.has(k)).length;
  if (rule.needsOnly && needs.length > 0 && entityHits === 0) return null;
  // `all` is a hard co-occurrence gate (every listed term must be present), not a bonus:
  // without it a rule like "here words AND a place question" would fire on either alone.
  if (rule.all && rule.all.length > 0 && !rule.all.every((t) => termHit(t, clause.masked, lex)))
    return null;
  let groups = 0;
  for (const g of rule.any ?? []) if (g.some((t) => termHit(t, clause.masked, lex))) groups++;
  if (rule.all && rule.all.length > 0) groups++;
  const pattern = (rule.patterns ?? []).some((src) =>
    matchPattern(compilePattern(src, lex), clause.core, clause.entities),
  )
    ? 1
    : 0;
  if (groups === 0 && pattern === 0 && entityHits === 0) return null;
  if (rule.needsKeyword && groups === 0 && pattern === 0) return null;
  let features = 0;
  for (const [k, v] of Object.entries(rule.features ?? {})) {
    if (k === 'maxLen') {
      if (clause.features.length <= (v as number)) features++;
    } else if (clause.features[k as FeatureName] === v) features++;
  }
  const excluded = (rule.exclude ?? []).filter((t) => termHit(t, clause.masked, lex)).length;
  let context = 0;
  if (ctx.afterQuestion && rule.context?.afterQuestion) context += rule.context.afterQuestion;
  if (ctx.inTopic && rule.context?.inTopic) context += rule.context.inTopic;
  const terms: ScoreTerm[] = [
    { name: 'base', value: rule.base },
    { name: 'keyword', value: groups * w.keyword },
    { name: 'pattern', value: pattern * w.pattern },
    { name: 'entity', value: entityHits * w.entity },
    { name: 'feature', value: features * w.feature },
    { name: 'exclude', value: excluded * w.exclude },
    { name: 'context', value: context },
  ].filter((t) => t.name === 'base' || t.value !== 0);
  const score = terms.reduce((s, t) => s + t.value, 0);
  return { intent: rule.intent, rule: rule.id, score, priority: rule.priority, order, terms };
}

/** Best first: score, then priority, then rule order (6.3: 同分取优先级高者，再同取规则编号小者). */
export function compareScores(a: IntentScore, b: IntentScore): number {
  return b.score - a.score || b.priority - a.priority || a.order - b.order;
}

/** Classify one analysed clause (6.3 step 7). */
export function classifyClause(
  clause: Clause,
  set: IntentRuleSet,
  lex: IntentLexicon,
  ctx: ClassifyContext,
  extra: readonly EntityHit[] = [],
): ClauseResult {
  const ranked: IntentScore[] = [];
  set.rules.forEach((rule, order) => {
    const s = scoreRule(rule, order, clause, set, lex, ctx, extra);
    if (s) ranked.push(s);
  });
  ranked.sort(compareScores);
  // one entry per intent: its best rule
  const seen = new Set<IntentId>();
  const best = ranked.filter((s) => (seen.has(s.intent) ? false : (seen.add(s.intent), true)));
  const top = best[0];
  if (!top || top.score < set.threshold)
    return { clause, intent: 'unknown', score: 0, ranked: best };
  return { clause, intent: top.intent, score: top.score, ranked: best };
}

function groupRank(set: IntentRuleSet, intent: IntentId): number {
  const g: MergeGroup = set.intents[intent]?.group ?? 'none';
  const at = set.merge.indexOf(g);
  return at < 0 ? set.merge.length : at;
}

/** Merge order of classified clauses (6.3 step 8): group, then score, then position. */
function mergeOrder(set: IntentRuleSet, results: readonly ClauseResult[]): number[] {
  return results
    .map((r, i) => i)
    .filter((i) => (results[i] as ClauseResult).intent !== 'unknown')
    .sort((a, b) => {
      const ra = results[a] as ClauseResult;
      const rb = results[b] as ClauseResult;
      return groupRank(set, ra.intent) - groupRank(set, rb.intent) || rb.score - ra.score || a - b;
    });
}

/**
 * Input clamp for classifyIntent: `dialogue.say` already rejects anything longer than
 * this before the classifier ever sees it, but the pipeline's own clause-split and
 * pattern-match cost both grow faster than linearly, so a caller that forgets its own
 * cap (a test, a future script command) must not be able to feed an unbounded cost.
 */
const MAX_INPUT = 200;

/**
 * Classify free player text (builtin_ai 6.3): normalize, split, extract, score, merge. With
 * no lexicon or rules in the content every input is `unknown`.
 */
export function classifyIntent(
  input: string,
  content: IntentContent,
  ctx: ClassifyContext = {},
): ClassifyResult {
  const lex = content.intentLexicon;
  const set = content.intentRules;
  if (input.length > MAX_INPUT) input = input.slice(0, MAX_INPUT);
  if (!lex || !set) {
    return {
      normalized: input,
      clauses: [],
      main: 'unknown',
      secondary: null,
      mainClause: -1,
      entities: [],
    };
  }
  const normalized = normalizeInput(input, lex);
  const texts = splitClauses(normalized, lex);
  const results: ClauseResult[] = [];
  let prev: EntityHit[] = [];
  for (const text of texts) {
    const clause = analyzeClause(text, content, ctx);
    // a clause without entities borrows the previous clause's, or the conversation's last
    // one when it uses a pronoun (6.3 step 6); borrowed entities only score `needs`
    const extra: EntityHit[] = [];
    if (clause.entities.length === 0) {
      extra.push(...prev.map((e) => ({ ...e, start: -1, end: -1 })));
      const ref = pronounEntity(clause.masked, lex, ctx.lastEntity);
      if (ref) extra.push(ref);
    }
    results.push(classifyClause(clause, set, lex, ctx, extra));
    if (clause.entities.length > 0) prev = clause.entities;
  }
  const order = mergeOrder(set, results);
  const mainIdx = order[0] ?? -1;
  const main = mainIdx >= 0 ? (results[mainIdx] as ClauseResult).intent : 'unknown';
  const secondIdx = order.find((i) => (results[i] as ClauseResult).intent !== main);
  return {
    normalized,
    clauses: results,
    main,
    secondary: secondIdx === undefined ? null : (results[secondIdx] as ClauseResult).intent,
    mainClause: mainIdx,
    entities: results.flatMap((r) => r.clause.entities),
  };
}
