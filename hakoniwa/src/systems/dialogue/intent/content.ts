// Content validation of the lexicon and the intent rule set (builtin_ai.md 18; feeds the
// data validation gate, tools/content/validate.ts). Checks structural integrity only: the
// rule tables are hand written, so a typo here is a real authoring bug, not a generated-id
// drift the parity or reachability validators already catch elsewhere.

import { patternProblems } from './pattern';
import {
  ENTITY_KINDS,
  INTENT_IDS,
  type IntentLexicon,
  type IntentRuleSet,
  RESPOND_IF_NAMES,
} from './types';

const RESPOND_CODES = new Set(['R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9']);

export function ruleSetProblems(
  lex: IntentLexicon | undefined,
  set: IntentRuleSet | undefined,
): string[] {
  const out: string[] = [];
  if (!lex) return ['intentLexicon table missing'];
  if (!set) return ['intentRules table missing'];
  if (lex.modifierLinks !== undefined) {
    const links = lex.modifierLinks;
    if (!Array.isArray(links) || links.some((w) => typeof w !== 'string' || w.length === 0))
      out.push('intentLexicon.modifierLinks must be a list of non-empty strings');
  }
  if (!(set.threshold > 0)) out.push('intentRules.threshold must be positive');
  for (const g of ['keyword', 'pattern', 'entity', 'feature', 'exclude'] as const) {
    if (typeof set.weights[g] !== 'number') out.push(`intentRules.weights.${g} missing`);
  }
  for (const id of INTENT_IDS) {
    if (!set.intents[id]) {
      out.push(`intent ${id}: no response definition`);
      continue;
    }
    const def = set.intents[id];
    if (!set.merge.includes(def.group))
      out.push(`intent ${id}: merge group ${def.group} not in merge order`);
    if (def.respond.length === 0) out.push(`intent ${id}: no response steps`);
    for (const step of def.respond) {
      if (!RESPOND_CODES.has(step.code))
        out.push(`intent ${id}: unknown response code ${step.code}`);
      if (step.if && !(RESPOND_IF_NAMES as readonly string[]).includes(step.if))
        out.push(
          `intent ${id}: unknown if condition ${step.if} (respond.ts holds() has no case for it, defaults to always true)`,
        );
    }
  }
  for (const key of Object.keys(set.intents)) {
    if (!(INTENT_IDS as readonly string[]).includes(key))
      out.push(`intent ${key}: not one of the 52 intent ids`);
  }
  const seen = new Set<string>();
  for (const [order, rule] of set.rules.entries()) {
    if (seen.has(rule.id)) out.push(`rule ${rule.id}: duplicate id`);
    seen.add(rule.id);
    if (!(INTENT_IDS as readonly string[]).includes(rule.intent))
      out.push(`rule ${rule.id}: intent ${rule.intent} is not one of the 52 intent ids`);
    if (!Number.isFinite(rule.priority)) out.push(`rule ${rule.id}: priority must be a number`);
    if (!Number.isFinite(rule.base)) out.push(`rule ${rule.id}: base must be a number`);
    const hasEvidence =
      (rule.any?.length ?? 0) > 0 ||
      (rule.patterns?.length ?? 0) > 0 ||
      (rule.needs?.length ?? 0) > 0;
    if (!hasEvidence)
      out.push(`rule ${rule.id}: no keyword group, pattern or needed entity (never scores)`);
    for (const group of rule.any ?? []) {
      for (const term of group) {
        if (term.startsWith('@') && !lex.groups[term.slice(1)])
          out.push(`rule ${rule.id}: unknown lexicon group ${term}`);
      }
    }
    for (const term of rule.all ?? []) {
      if (term.startsWith('@') && !lex.groups[term.slice(1)])
        out.push(`rule ${rule.id}: unknown lexicon group ${term}`);
    }
    for (const term of rule.exclude ?? []) {
      if (term.startsWith('@') && !lex.groups[term.slice(1)])
        out.push(`rule ${rule.id}: unknown lexicon group ${term} in exclude`);
    }
    for (const kind of rule.needs ?? []) {
      if (!(ENTITY_KINDS as readonly string[]).includes(kind))
        out.push(`rule ${rule.id}: unknown entity kind ${kind}`);
    }
    for (const src of rule.patterns ?? []) {
      for (const p of patternProblems(src, lex, ENTITY_KINDS))
        out.push(`rule ${rule.id}: pattern "${src}": ${p}`);
    }
    void order;
  }
  return out;
}
