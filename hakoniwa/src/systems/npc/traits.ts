// Persona traits as codes (builtin_ai.md 4.1 "性格标签到人格乘数的映射"): a persona card
// lists Chinese trait words (content); the vocabulary in ./trait_words.json maps them to
// stable codes the kernel reasons with (stubborn, grudging, outgoing, timid, ...). The
// brain's persona dimensions come from the codes through the content table's trait
// dimension multipliers, one dimension taking the largest multiplier among its traits
// (never a product). Pure and cached per persona card.

import TRAIT_WORDS from './trait_words.json';
import type { PersonaCard } from './types';

const WORDS = TRAIT_WORDS as Record<string, string[]>;

const codeCache = new WeakMap<object, ReadonlySet<string>>();

/** The trait codes a persona card's trait words map to. */
export function traitCodes(p: Pick<PersonaCard, 'traits'> | undefined): ReadonlySet<string> {
  if (!p) return new Set();
  let codes = codeCache.get(p);
  if (!codes) {
    const out = new Set<string>();
    for (const [code, words] of Object.entries(WORDS))
      if (p.traits.some((w) => words.includes(w))) out.add(code);
    codes = out;
    codeCache.set(p, codes);
  }
  return codes;
}

/** True when the persona has the trait (by code). */
export function hasTrait(p: Pick<PersonaCard, 'traits'> | undefined, code: string): boolean {
  return traitCodes(p).has(code);
}

/** Trait code to persona-dimension multipliers (content table npcBrain.traitDims). */
export type TraitDims = Record<string, Record<string, number>>;

/**
 * The multiplier of a persona dimension (builtin_ai.md 2.1 M(a)): the largest multiplier
 * any of the persona's traits gives the dimension; 1 when none speaks to it.
 */
export function personaDim(
  dims: TraitDims | undefined,
  p: Pick<PersonaCard, 'traits'> | undefined,
  dim: string,
): number {
  if (!dims || !p) return 1;
  let best: number | undefined;
  for (const code of traitCodes(p)) {
    const v = dims[code]?.[dim];
    if (v !== undefined && (best === undefined || v > best)) best = v;
  }
  return best ?? 1;
}
