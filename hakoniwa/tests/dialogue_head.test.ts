// The head noun of a free-text clause (PK-M1-29; builtin_ai.md 6.3): in "遗迹里的神纹" the
// ruins only modify the sigil, so the sigil's topic answers before the place topic.

import { describe, expect, it } from 'vitest';
import lexicon from '../data/dialogue/lexicon.json';
import { modifierEntities, onlyModifies } from '../src/systems/dialogue/intent/head';
import type { EntityHit } from '../src/systems/dialogue/intent/types';

// the shipped links (data/dialogue/lexicon.json `modifierLinks`)
const lex = { modifierLinks: lexicon.modifierLinks };

const hit = (kind: string, id: string, start: number, end: number): EntityHit =>
  ({ kind, id, text: id, source: 'content', start, end }) as EntityHit;

describe('the head noun of a clause', () => {
  it('reads "X里的Y" and "X的Y" as X modifying Y', () => {
    const ruins = hit('place', '遗迹', 0, 2);
    const sigil = hit('lore', '神纹', 4, 6);
    expect([...modifierEntities('遗迹里的神纹是什么', [ruins, sigil], lex)]).toEqual([ruins]);
    const a = hit('place', '遗迹', 0, 2);
    const b = hit('lore', '神纹', 3, 5);
    expect([...modifierEntities('遗迹的神纹', [a, b], lex)]).toEqual([a]);
    expect(onlyModifies('遗迹里的神纹是什么', [ruins, sigil], 'place', lex)).toBe(true);
    expect(onlyModifies('遗迹里的神纹是什么', [ruins, sigil], 'lore', lex)).toBe(false);
  });

  it('keeps two entities joined by anything else as two heads', () => {
    const ruins = hit('place', '遗迹', 0, 2);
    const sigil = hit('lore', '神纹', 3, 5);
    expect(modifierEntities('遗迹和神纹', [ruins, sigil], lex).size).toBe(0);
    expect(onlyModifies('遗迹和神纹', [ruins, sigil], 'place', lex)).toBe(false);
    // no entity of the kind: nothing to reorder
    expect(onlyModifies('神纹', [hit('lore', '神纹', 0, 2)], 'place', lex)).toBe(false);
  });

  it('links nothing when the lexicon has no modifier links', () => {
    const ruins = hit('place', '遗迹', 0, 2);
    const sigil = hit('lore', '神纹', 4, 6);
    expect(modifierEntities('遗迹里的神纹', [ruins, sigil], {}).size).toBe(0);
  });
});
