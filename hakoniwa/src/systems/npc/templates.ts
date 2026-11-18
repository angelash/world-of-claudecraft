// Resident templates (catalog_characters_lotha.md 6): the placements a template row
// spreads its people over, and the content checks of the catalog fields (band, knowledge
// tier, potential odds, unbelief parameters). Pure: no world, no RNG.

import type { ResidentPlacement, ResidentTemplate } from './types';

/** Hidden potential codes (content_bible.md 9.3, a closed set). */
export const POTENTIAL_CODES = [
  'command',
  'huntking',
  'bulwark',
  'counsel',
  'farsight',
  'witness',
  'doorsense',
  'luck',
  'unbroken',
  'fertile',
  'craft',
  'trade',
  'healhand',
  'teach',
  'steward',
  'scout',
  'bard',
  'spiritsense',
  'scholar',
  'blade',
  'devout',
] as const;

/** The id prefix of the catalog's resident templates (content_bible.md 12.2). */
export const TEMPLATE_PREFIX = 'tpl_';

const TIERS = ['K0', 'K1', 'K2', 'K3', 'K4', 'K5'];
const BANDS = ['L3', 'L4'];

/**
 * The placements of a resident template: its own map row (the first-round groups), or the
 * catalog template's placement list (empty: the template waits to be named up).
 */
export function placementsOf(t: ResidentTemplate): ResidentPlacement[] {
  if (t.placements) return t.placements;
  if (!t.map) return [];
  return [{ map: t.map, count: t.count ?? 0, homes: t.homes ?? [], works: t.works ?? [] }];
}

const in01 = (v: number) => typeof v === 'number' && v >= 0 && v <= 1;

/** Problems of one template row's own fields (the map and schedule checks are the pack's). */
export function residentRowProblems(t: ResidentTemplate): string[] {
  const out: string[] = [];
  const who = `resident ${t.id}`;
  if (t.id.startsWith(TEMPLATE_PREFIX) && !t.placements)
    out.push(`${who}: a catalog template lists its placements (an empty list when none)`);
  if (!t.placements && !t.map) out.push(`${who}: needs a map or a placement list`);
  if (t.band !== undefined && !BANDS.includes(t.band)) out.push(`${who}: band ${t.band}`);
  if (t.knowledge !== undefined && !TIERS.includes(t.knowledge))
    out.push(`${who}: unknown knowledge tier ${t.knowledge}`);
  if (t.exaggerate !== undefined && !(t.exaggerate >= 1 && t.exaggerate <= 3))
    out.push(`${who}: exaggeration must be 1 to 3`);
  if (t.potential) {
    if (!(t.potential.chance > 0 && t.potential.chance <= 1))
      out.push(`${who}: potential chance must be in (0, 1]`);
    for (const c of t.potential.codes)
      if (!(POTENTIAL_CODES as readonly string[]).includes(c))
        out.push(`${who}: unknown potential ${c}`);
  }
  const u = t.unbelief;
  if (u) {
    if (!(u.ceiling >= 0 && u.ceiling <= 70)) out.push(`${who}: unbelief ceiling out of range`);
    if (!(u.threshold >= 0 && u.threshold <= 100))
      out.push(`${who}: unbelief threshold out of range`);
    if (!in01(u.pressure) || !in01(u.oldOrder))
      out.push(`${who}: unbelief pressure and old order are 0 to 1`);
  }
  return out;
}
