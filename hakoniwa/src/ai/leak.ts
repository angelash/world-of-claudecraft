// Leak check helper: which forbidden phrases (locked proper names and coined words of the
// reveal ledger) occur in a text. Matching is on normalised text (NFKC, no whitespace, no
// invisible characters, case-folded), so spacing or full-width tricks do not hide a hit.
// This is the output-side backstop, not the main guard: prompts must never contain locked
// knowledge in the first place. See docs/50_tech/ai_architecture.md 7.4 and 12.5.

import { stripInvisible } from './prompt';

export function normaliseForMatch(s: string): string {
  return stripInvisible(s.normalize('NFKC')).replace(/\s+/g, '').toLowerCase();
}

/** Forbidden phrases found in `text`, unique, in the order of `phrases`. */
export function findLeaks(text: string, phrases: readonly string[]): string[] {
  if (!text || phrases.length === 0) return [];
  const hay = normaliseForMatch(text);
  const hits: string[] = [];
  for (const p of phrases) {
    const needle = normaliseForMatch(p);
    if (needle && hay.includes(needle) && !hits.includes(p)) hits.push(p);
  }
  return hits;
}

/** Forbidden phrases found in any of several texts. */
export function findLeaksIn(texts: readonly string[], phrases: readonly string[]): string[] {
  const hits: string[] = [];
  for (const t of texts) {
    for (const h of findLeaks(t, phrases)) if (!hits.includes(h)) hits.push(h);
  }
  return hits;
}
