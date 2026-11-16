// Quality tiers (art_pipeline.md 2.11 and 2.12). A tier only sheds look: shadows, bloom,
// tilt-shift, grain, pixel ratio. It never removes information a player acts on (names,
// overhead markers, cast bars, enemy positions, ground warnings), which live in the
// overlay layer and are drawn at every tier. "flat" selects the Canvas2D top-down
// renderer, which is also the automatic fallback without WebGL. Pure; Node-tested.
//
// The ultra tier (D-078) exists as a tier but opens with the Beta (development plan
// PK-M3-01): until then the settings menu does not list it and a stored "ultra" is not a
// valid choice, so nothing can select it.

/** The ids the settings menu offers and a stored preference may hold. */
export const QUALITY_IDS = ['auto', 'high', 'mid', 'low', 'flat'] as const;
export type QualityId = (typeof QUALITY_IDS)[number];

/** Every tier the renderers know, richest first (art_pipeline.md 2.11). */
export const QUALITY_TIER_IDS = ['ultra', 'high', 'mid', 'low', 'flat'] as const;
export type QualityTier = (typeof QUALITY_TIER_IDS)[number];

/** Tiers that are built but not yet offered to players. */
export const UNRELEASED_TIERS: ReadonlySet<QualityTier> = new Set<QualityTier>(['ultra']);

export interface QualitySettings {
  tier: QualityTier;
  /** shadow map size in texels, 0 disables sun shadows */
  shadowMap: number;
  softShadows: boolean;
  bloom: boolean;
  tiltShift: boolean;
  grain: boolean;
  maxPixelRatio: number;
}

export const QUALITY_TIERS: Readonly<Record<QualityTier, QualitySettings>> = {
  // The ultra extras (volumetric light and morning mist, bokeh depth of field, water
  // reflections, grass trails) come with the tier's release; until then it differs from high
  // by the shadow map only.
  ultra: {
    tier: 'ultra',
    shadowMap: 4096,
    softShadows: true,
    bloom: true,
    tiltShift: true,
    grain: true,
    maxPixelRatio: 2,
  },
  high: {
    tier: 'high',
    shadowMap: 2048,
    softShadows: true,
    bloom: true,
    tiltShift: true,
    grain: true,
    maxPixelRatio: 2,
  },
  mid: {
    tier: 'mid',
    shadowMap: 1024,
    softShadows: false,
    bloom: false,
    tiltShift: false,
    grain: true,
    maxPixelRatio: 1.5,
  },
  low: {
    tier: 'low',
    shadowMap: 0,
    softShadows: false,
    bloom: false,
    tiltShift: false,
    grain: false,
    maxPixelRatio: 1,
  },
  flat: {
    tier: 'flat',
    shadowMap: 0,
    softShadows: false,
    bloom: false,
    tiltShift: false,
    grain: false,
    maxPixelRatio: 2,
  },
};

export function isQualityId(s: unknown): s is QualityId {
  return typeof s === 'string' && (QUALITY_IDS as readonly string[]).includes(s);
}

/** Resolve "auto": touch devices take the mid tier, desktops the high tier. */
export function resolveQuality(
  id: QualityId,
  env: { touch: boolean; webgl: boolean },
): QualitySettings {
  if (!env.webgl) return QUALITY_TIERS.flat;
  if (id === 'auto') return QUALITY_TIERS[env.touch ? 'mid' : 'high'];
  return QUALITY_TIERS[id];
}

/**
 * Device pixel ratio actually rendered by a tier. Above the tier's cap the ratio drops by
 * a whole divisor of the device ratio, so the browser stretches the WebGL canvas by an
 * integer factor and every rendered pixel stays the same size on screen.
 */
export function tierPixelRatio(q: QualitySettings, dpr: number): number {
  if (dpr <= q.maxPixelRatio) return dpr;
  return dpr / Math.ceil(dpr / q.maxPixelRatio);
}
