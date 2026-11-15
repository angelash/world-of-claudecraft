// Import alias table (development_plan.md 4.1 PK-M0-08; art_pipeline.md 3.8): content ids that
// share another subject's art. The dian-tainted or greyed rungs of a creature ladder reuse the
// base species' sheets with a swatch row and an overlay, and the labyrinth's mudspawn is the
// same mud fiend; they never get prompt entries of their own.
//
// Registration refuses files named after an alias subject and names the canonical file; the
// coverage report counts an alias as covered by its subject.

export const ART_ALIASES: Readonly<Record<string, string>> = {
  dian_wolf: 'grey_wolf',
  dian_boar: 'forest_boar',
  ashhorn_deer: 'greyelm_deer',
  mudspawn: 'mud_fiend',
};

/** Art subject of a content id (the id itself when it is not an alias). */
export function artSubject(contentId: string): string {
  return ART_ALIASES[contentId] ?? contentId;
}

/**
 * Canonical asset id for an id that names an alias subject (art_mon_dian_wolf_d becomes
 * art_mon_grey_wolf_d); null when the id names no alias.
 */
export function canonicalAssetId(assetId: string): string | null {
  const m = /^art_([a-z0-9]+)_(.+)$/.exec(assetId);
  if (!m) return null;
  const rest = m[2]!;
  for (const [alias, subject] of Object.entries(ART_ALIASES)) {
    if (rest === alias || rest.startsWith(`${alias}_`))
      return `art_${m[1]}_${subject}${rest.slice(alias.length)}`;
  }
  return null;
}
