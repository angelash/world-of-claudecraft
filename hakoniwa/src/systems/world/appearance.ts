// Asset references of an Appearance (art_pipeline.md 3.1 and 6.5): shape checks content
// validation can run on every monster, persona, companion and fixture. They only check that a
// field names an asset id of the right category; whether that asset exists or is approved is
// the art coverage report's question, since an unapproved asset falls back to the procedural
// placeholder at run time. Pure; the kernel never reads these fields.

import type { Appearance, DollBody, DollRecipe } from './types';

export const DOLL_BODIES: readonly DollBody[] = ['h', 'hs', 'hb'];

/** The doll layers in draw order, bottom to top (art_pipeline.md 3.3). */
export const DOLL_LAYERS = [
  'back',
  'outfit',
  'head',
  'hair',
  'ears',
  'headwear',
  'beard',
  'mainHand',
  'offHand',
] as const satisfies readonly (keyof DollRecipe)[];

/** Asset id prefixes each appearance field accepts (art_pipeline.md 6.2 and 6.5). */
export const APPEARANCE_PREFIXES = {
  sheet: ['art_chr_', 'art_mon_', 'art_boss_', 'art_pet_'],
  portrait: ['art_por_'],
  bust: ['art_bust_'],
  doll: ['art_doll_'],
} as const;

const ASSET_ID = /^art_[a-z0-9]+(?:_[a-z0-9]+)+$/;

function refProblem(
  who: string,
  field: string,
  value: unknown,
  prefixes: readonly string[],
): string | null {
  if (typeof value !== 'string' || !ASSET_ID.test(value))
    return `${who}: appearance ${field} '${String(value)}' is not an asset id`;
  if (!prefixes.some((p) => value.startsWith(p)))
    return `${who}: appearance ${field} '${value}' should start with ${prefixes.join(' or ')}`;
  return null;
}

/** Problems in the asset fields of one appearance; `who` names the record in the messages. */
export function appearanceProblems(who: string, a: Appearance): string[] {
  const out: string[] = [];
  const check = (field: string, value: unknown, prefixes: readonly string[]) => {
    if (value === undefined) return;
    const p = refProblem(who, field, value, prefixes);
    if (p) out.push(p);
  };
  check('sheet', a.sheet, APPEARANCE_PREFIXES.sheet);
  check('portrait', a.portrait, APPEARANCE_PREFIXES.portrait);
  check('bust', a.bust, APPEARANCE_PREFIXES.bust);
  if (a.doll !== undefined) {
    if (!DOLL_BODIES.includes(a.doll.body))
      out.push(`${who}: appearance doll body '${String(a.doll.body)}' is not h, hs or hb`);
    for (const layer of DOLL_LAYERS)
      check(`doll.${layer}`, a.doll[layer], APPEARANCE_PREFIXES.doll);
    if (a.doll.swatch !== undefined && (typeof a.doll.swatch !== 'string' || !a.doll.swatch))
      out.push(`${who}: appearance doll swatch must be a non-empty string`);
  }
  for (const [cond, v] of Object.entries(a.variants ?? {})) {
    if (!cond.trim()) out.push(`${who}: appearance variant with an empty condition`);
    if (!v || (v.sheet === undefined && v.portrait === undefined && v.bust === undefined)) {
      out.push(`${who}: appearance variant '${cond}' replaces nothing`);
      continue;
    }
    check(`variants.${cond}.sheet`, v.sheet, APPEARANCE_PREFIXES.sheet);
    check(`variants.${cond}.portrait`, v.portrait, APPEARANCE_PREFIXES.portrait);
    check(`variants.${cond}.bust`, v.bust, APPEARANCE_PREFIXES.bust);
  }
  return out;
}
