// Sentence templates of the intent rules (builtin_ai.md 6.3, "句式模板（有序的词与槽）").
// A pattern is a space-separated token list matched in order against the masked clause:
//   word       a literal word
//   a|b|c      any of the literal words
//   @group     any word of a lexicon group
//   {kind}     one entity of that kind ({person|place} for several, {any} for any kind)
//   ^  $       the start or the end of the clause (filler particles stripped)
//   ..         the next token may come any distance later
// Without `..`, a token must start within PATTERN_GAP characters of the previous one's end.
// Pure; compiled patterns are cached per lexicon.

import { maskedEntity } from './entities';
import type { EntityHit, EntityKind, IntentLexicon } from './types';

/** Characters allowed between two consecutive tokens without `..`. */
export const PATTERN_GAP = 4;

type Token =
  | { t: 'words'; words: string[] }
  | { t: 'entity'; kinds: EntityKind[] | 'any' }
  | { t: 'start' }
  | { t: 'end' }
  | { t: 'far' };

export interface CompiledPattern {
  source: string;
  tokens: Token[];
}

const cache = new WeakMap<IntentLexicon, Map<string, CompiledPattern>>();

/** Words of a term: a literal, or every word of an @group (empty for an unknown group). */
export function termWords(term: string, lex: IntentLexicon): string[] {
  if (term.startsWith('@')) return lex.groups[term.slice(1)] ?? [];
  return term.split('|').filter((w) => w !== '');
}

export function compilePattern(source: string, lex: IntentLexicon): CompiledPattern {
  let byLex = cache.get(lex);
  if (!byLex) {
    byLex = new Map();
    cache.set(lex, byLex);
  }
  const hit = byLex.get(source);
  if (hit) return hit;
  const tokens: Token[] = [];
  for (const raw of source.split(' ').filter((x) => x !== '')) {
    if (raw === '^') tokens.push({ t: 'start' });
    else if (raw === '$') tokens.push({ t: 'end' });
    else if (raw === '..') tokens.push({ t: 'far' });
    else if (raw.startsWith('{') && raw.endsWith('}')) {
      const inner = raw.slice(1, -1);
      tokens.push({
        t: 'entity',
        kinds: inner === 'any' ? 'any' : (inner.split('|') as EntityKind[]),
      });
    } else tokens.push({ t: 'words', words: termWords(raw, lex) });
  }
  const compiled = { source, tokens };
  byLex.set(source, compiled);
  return compiled;
}

/** Problems of a pattern source (content validation): unknown groups, kinds, empty tokens. */
export function patternProblems(
  source: string,
  lex: IntentLexicon,
  kinds: readonly string[],
): string[] {
  const out: string[] = [];
  for (const raw of source.split(' ').filter((x) => x !== '')) {
    if (raw.startsWith('@') && !lex.groups[raw.slice(1)]) out.push(`unknown lexicon group ${raw}`);
    if (raw.startsWith('{')) {
      const inner = raw.slice(1, -1);
      for (const k of inner.split('|'))
        if (k !== 'any' && !kinds.includes(k)) out.push(`unknown entity kind ${k}`);
    }
  }
  if (source.trim() === '') out.push('empty pattern');
  return out;
}

/** Length (in UTF-16 units) of a token matched at `pos`, every possible one, or [] when none. */
function matchesAt(
  tok: Token,
  text: string,
  pos: number,
  entities: readonly EntityHit[],
): number[] {
  if (tok.t === 'words') {
    const out: number[] = [];
    for (const w of tok.words) if (w && text.startsWith(w, pos)) out.push(w.length);
    return out;
  }
  if (tok.t === 'entity') {
    const e = maskedEntity(text[pos] ?? '', entities);
    if (!e) return [];
    return tok.kinds === 'any' || tok.kinds.includes(e.kind) ? [1] : [];
  }
  return [];
}

/**
 * True when the pattern matches the masked clause `text` (whose mask characters index
 * `entities`). A small backtracking search; clauses are at most a few dozen characters.
 */
export function matchPattern(
  p: CompiledPattern,
  text: string,
  entities: readonly EntityHit[],
): boolean {
  const toks = p.tokens;
  const go = (ti: number, pos: number, anchored: boolean, far: boolean): boolean => {
    if (ti === toks.length) return true;
    const tok = toks[ti] as Token;
    if (tok.t === 'start') return pos === 0 && go(ti + 1, 0, true, false);
    if (tok.t === 'end') return pos === text.length && go(ti + 1, pos, true, false);
    if (tok.t === 'far') return go(ti + 1, pos, false, true);
    const from = pos;
    const to = anchored ? pos : far || ti === 0 ? text.length - 1 : pos + PATTERN_GAP;
    for (let at = from; at <= Math.min(to, text.length - 1); at++) {
      for (const len of matchesAt(tok, text, at, entities)) {
        if (go(ti + 1, at + len, false, false)) return true;
      }
    }
    return false;
  };
  // a leading `^` anchors; otherwise the first token may start anywhere
  return go(0, 0, false, true);
}
