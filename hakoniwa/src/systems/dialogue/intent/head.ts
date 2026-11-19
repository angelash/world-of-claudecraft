// The head noun of a clause (builtin_ai.md 6.3 step 3 refinement): in "遗迹里的神纹" the
// question is about 神纹; 遗迹 only says where. An entity followed by a locative or
// possessive particle and then another entity is a modifier of that later entity. The R1
// step of the intent table names topics by the entity kind of its template ({place},
// {lore}); when every entity of that kind is a modifier, the head entity's topics go first,
// so "遗迹里的神纹是什么" reaches the sigil (and its misdirection, MIS-05) before the ruins.
// Pure.

import type { EntityHit, IntentLexicon } from './types';

/**
 * Whether the text between two entities links a modifier to its head: one of the lexicon's
 * `modifierLinks` (data/dialogue/lexicon.json; the possessive particle with or without a
 * locative before it).
 */
function isModifierLink(between: string, lex: Pick<IntentLexicon, 'modifierLinks'>): boolean {
  return (lex.modifierLinks ?? []).includes(between);
}

/** The entities of a clause that only modify a later entity. */
export function modifierEntities(
  text: string,
  entities: readonly EntityHit[],
  lex: Pick<IntentLexicon, 'modifierLinks'>,
): Set<EntityHit> {
  const out = new Set<EntityHit>();
  const sorted = [...entities].sort((a, b) => a.start - b.start);
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i] as EntityHit;
    const b = sorted[i + 1] as EntityHit;
    if (b.start < a.end) continue;
    if (isModifierLink(text.slice(a.end, b.start), lex)) out.add(a);
  }
  return out;
}

/** True when the clause names entities of `kind` and every one of them is a modifier. */
export function onlyModifies(
  text: string,
  entities: readonly EntityHit[],
  kind: string,
  lex: Pick<IntentLexicon, 'modifierLinks'>,
): boolean {
  const ofKind = entities.filter((e) => e.kind === kind);
  if (ofKind.length === 0) return false;
  const mods = modifierEntities(text, entities, lex);
  return ofKind.every((e) => mods.has(e));
}
