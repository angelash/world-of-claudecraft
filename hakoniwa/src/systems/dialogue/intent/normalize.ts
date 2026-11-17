// Free-input normalization and clause split (builtin_ai.md 6.3 steps 1 and 2): full-width to
// half-width, one form per punctuation mark, traditional to simplified through the lexicon's
// character table, typo and slang corrections, lowercase, no spacing between non-ASCII
// characters, no repeated punctuation; then at most three clauses cut at sentence ends,
// commas and the connectives. Every word list is data (data/dialogue/lexicon.json). Pure.

import type { IntentLexicon } from './types';

/** Clause cap (builtin_ai 6.3 step 2). */
export const MAX_CLAUSES = 3;

interface Folds {
  chars: Map<string, string>;
  typos: [string, string][];
}

const folds = new WeakMap<IntentLexicon, Folds>();

function foldsOf(lex: IntentLexicon): Folds {
  let f = folds.get(lex);
  if (f) return f;
  const chars = new Map<string, string>();
  for (const [from, to] of Object.entries(lex.fold.punct)) chars.set(from, to);
  const pairs = Array.from(lex.fold.traditional.join(''));
  for (let i = 0; i + 1 < pairs.length; i += 2)
    chars.set(pairs[i] as string, pairs[i + 1] as string);
  // longest typo first, so a longer correction is not cut by a shorter one inside it
  const typos = Object.entries(lex.typos).sort((a, b) => b[0].length - a[0].length);
  f = { chars, typos };
  folds.set(lex, f);
  return f;
}

/** U+FF01..U+FF5E to U+0021..U+007E, the ideographic space to a space. */
function halfWidth(ch: string): string {
  const c = ch.codePointAt(0) ?? 0;
  if (c === 0x3000) return ' ';
  if (c >= 0xff01 && c <= 0xff5e) return String.fromCharCode(c - 0xfee0);
  return ch;
}

const ASCII_WORD = /[a-z0-9]/;
/** Punctuation kept by the normalized form (sentence ends, commas, quotes). */
const PUNCT = /[.,!?;:"'~()[\]<>]/;

/**
 * Normalize player text (6.3 step 1). Spaces survive only between two ASCII word
 * characters; runs of one punctuation mark collapse to one ("??" to "?", "..." to ".").
 */
export function normalizeInput(text: string, lex: IntentLexicon): string {
  const f = foldsOf(lex);
  let out = '';
  for (const raw of Array.from(text)) {
    // the private-use range starting at MASK_BASE (entities.ts) is reserved for the
    // pipeline's own entity-mask characters; a user-typed one must not be able to pose
    // as a mask once this text reaches maskEntities/matchPattern.
    if (raw.length === 1 && raw.charCodeAt(0) >= 0xe000 && raw.charCodeAt(0) <= 0xf8ff) continue;
    const half = halfWidth(raw);
    out += f.chars.get(half) ?? half;
  }
  out = out.toLowerCase();
  for (const [from, to] of f.typos) if (out.includes(from)) out = out.split(from).join(to);
  // spaces: keep one between ASCII words only
  let spaced = '';
  const chars = Array.from(out);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    if (/\s/.test(ch)) {
      const prev = spaced.slice(-1);
      let j = i + 1;
      while (j < chars.length && /\s/.test(chars[j] as string)) j++;
      const next = chars[j] ?? '';
      if (ASCII_WORD.test(prev) && ASCII_WORD.test(next)) spaced += ' ';
      i = j - 1;
      continue;
    }
    if (PUNCT.test(ch) && spaced.slice(-1) === ch) continue;
    spaced += ch;
  }
  return spaced.trim();
}

const SENTENCE_END = /[.!?;]/;
const COMMA = /[,:]/;

/**
 * Split a normalized text into at most MAX_CLAUSES clauses (6.3 step 2): at sentence ends,
 * commas and the connectives (a connective opens a new clause only when it is not at the
 * very start and more text follows it). Pieces past the cap join the last clause. The end
 * mark stays with its clause (a "?" still makes a question).
 */
export function splitClauses(normalized: string, lex: IntentLexicon): string[] {
  const pieces: string[] = [];
  let cur = '';
  const chars = Array.from(normalized);
  const push = () => {
    const t = cur.trim();
    if (t.replace(/[.,!?;:"'~()[\]<>\s]/g, '') !== '') pieces.push(t);
    else if (t !== '' && pieces.length > 0) pieces[pieces.length - 1] += t;
    cur = '';
  };
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] as string;
    if (SENTENCE_END.test(ch)) {
      cur += ch;
      // keep a run of end marks together
      while (i + 1 < chars.length && SENTENCE_END.test(chars[i + 1] as string)) {
        cur += chars[i + 1];
        i++;
      }
      push();
      continue;
    }
    if (COMMA.test(ch)) {
      push();
      continue;
    }
    // A connective only opens a new clause right after a split already made (cur is
    // empty): matching it anywhere mid-clause would cut ordinary words that happen to
    // contain one as a substring (e.g. "还有" inside "你家里还有什么人", "对了" inside
    // "把话说完"). Mid-clause, a connective is just more of the sentence.
    const atStart = cur.trim() === '';
    if (atStart && pieces.length > 0) {
      const conn = lex.split.find((w) => {
        if (chars.length - i < w.length) return false;
        for (let k = 0; k < w.length; k++) if (chars[i + k] !== w[k]) return false;
        return true;
      });
      if (conn && chars.length - i > conn.length + 1) {
        i += conn.length - 1;
        continue;
      }
    }
    cur += ch;
  }
  push();
  if (pieces.length <= MAX_CLAUSES) return pieces;
  const head = pieces.slice(0, MAX_CLAUSES - 1);
  head.push(pieces.slice(MAX_CLAUSES - 1).join(','));
  return head;
}

/**
 * The clause without punctuation and spaces (what keyword groups and patterns read).
 * Quote marks are kept: they carry no keyword meaning but are the cue entity extraction's
 * quoted-name pass (builtin_ai 6.3 step 4) reads, so stripping them here would hide every
 * quoted unknown name before it is ever looked for.
 */
export function compact(text: string): string {
  return text.replace(/[.,!?;:~()[\]<>\s]/g, '');
}

/** Strip the filler particles from both ends (anchored patterns read this). */
export function stripParticles(text: string, lex: IntentLexicon): string {
  const set = new Set(Array.from(lex.particles));
  const chars = Array.from(text);
  let a = 0;
  let b = chars.length;
  while (b > a && set.has(chars[b - 1] as string)) b--;
  while (a < b && set.has(chars[a] as string) && b - a > 1) a++;
  return chars.slice(a, b).join('');
}
