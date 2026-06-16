// Every flat locale-overlay key must be a real leaf path of the authoritative
// nested `en` (a member of Leaves<typeof en>). A typo'd or stale dotted key is a
// bug: the build (scripts/i18n_build.mjs) would unflatten it into a node that `en`
// never had, and the generated locale is typed `: EnTranslations`, so a phantom
// branch either bloats the resolved table or shadows a real value.
//
// tsc cannot enforce this: the overlays are typed `Record<string, string>` because
// `TranslationKey = Leaves<typeof en, 5>` stops at depth 5 while the deepest real
// leaves (entities.quests.<id>.objectives.0.label) are 6 segments deep. So this
// test is the guard the phase invariant calls for ("a typo'd dotted key must fail
// tsc OR a test").
//
// This is a SUBSET check (every overlay key is in Leaves(en)), distinct from the
// dense exact-equality check in i18n_flat_overlay_dense.test.ts. Subset is the
// PERMANENT invariant: when Phase 6 relaxes the overlays to sparse, the dense check
// goes away but "no key outside Leaves(en)" must still hold, so this guard stays.

import { describe, expect, it } from 'vitest';
import { en } from '../src/ui/i18n.en';
import { es } from '../src/ui/i18n.locales/es';
import { es_ES } from '../src/ui/i18n.locales/es_ES';
import { fr_FR } from '../src/ui/i18n.locales/fr_FR';
import { fr_CA } from '../src/ui/i18n.locales/fr_CA';
import { en_CA } from '../src/ui/i18n.locales/en_CA';
import { it_IT } from '../src/ui/i18n.locales/it_IT';
import { de_DE } from '../src/ui/i18n.locales/de_DE';
import { zh_CN } from '../src/ui/i18n.locales/zh_CN';
import { zh_TW } from '../src/ui/i18n.locales/zh_TW';
import { ko_KR } from '../src/ui/i18n.locales/ko_KR';
import { ja_JP } from '../src/ui/i18n.locales/ja_JP';
import { pt_BR } from '../src/ui/i18n.locales/pt_BR';
import { ru_RU } from '../src/ui/i18n.locales/ru_RU';

// Recurse into plain objects only (arrays/non-objects are leaves) - the same
// object-vs-leaf rule scripts/i18n_flatten.mjs and the build's deepMerge use.
function flatten(node: unknown, prefix = '', out: Record<string, unknown> = {}): Record<string, unknown> {
  for (const key of Object.keys(node as Record<string, unknown>)) {
    const value = (node as Record<string, unknown>)[key];
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      flatten(value, path, out);
    } else {
      out[path] = value;
    }
  }
  return out;
}

const enLeaves = new Set(Object.keys(flatten(en)));

// The guard predicate: dotted keys present in the overlay that are NOT real `en`
// leaves. An empty result means every key is a member of Leaves(en).
function keysNotInEnLeaves(overlay: Record<string, string>): string[] {
  return Object.keys(overlay).filter((k) => !enLeaves.has(k)).sort();
}

const overlays: Record<string, Record<string, string>> = {
  es, es_ES, fr_FR, fr_CA, en_CA, it_IT, de_DE,
  zh_CN, zh_TW, ko_KR, ja_JP, pt_BR, ru_RU,
};

describe('flat overlay keys are members of Leaves(en)', () => {
  for (const [lang, overlay] of Object.entries(overlays)) {
    it(`${lang}: has no dotted key outside Leaves(en)`, () => {
      expect(keysNotInEnLeaves(overlay)).toEqual([]);
    });
  }

  // Prove the guard has teeth: a typo'd or stale dotted key IS rejected. If this
  // ever passes vacuously (e.g. enLeaves accidentally contains everything), these
  // synthetic keys would slip through silently.
  it('rejects a typo of an existing key (extra trailing segment)', () => {
    const realKey = Object.keys(es)[0];
    const typo = `${realKey}.__typo__`;
    expect(enLeaves.has(typo)).toBe(false);
    const mutated = { ...es, [typo]: 'oops' };
    expect(keysNotInEnLeaves(mutated)).toEqual([typo]);
  });

  it('rejects a wholly invented dotted key', () => {
    const invented = 'this.key.does.not.exist.in.en';
    expect(enLeaves.has(invented)).toBe(false);
    const mutated = { ...es, [invented]: 'oops' };
    expect(keysNotInEnLeaves(mutated)).toEqual([invented]);
  });

  it('rejects a near-miss misspelling of a real key', () => {
    const realKey = Object.keys(es).find((k) => k.includes('.'))!;
    const misspelled = realKey.replace('.', '_'); // dot to underscore: a different, non-existent path
    expect(enLeaves.has(misspelled)).toBe(false);
    const mutated = { ...es, [misspelled]: 'oops' };
    expect(keysNotInEnLeaves(mutated)).toContain(misspelled);
  });
});
