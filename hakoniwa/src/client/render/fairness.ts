// The graphics fairness list (art_pipeline.md 2.12 and 4.10) as data: what every quality
// tier keeps, where it is drawn, and what a tier may shed. A quality tier is a set of look
// knobs (quality.ts); none of them may name a kept item, and the screen weather layers
// (fog, particles) that sit over the world have opacity caps so ground warnings and
// selection rings stay readable in any weather. The overlay draws the kept combat marks
// after the weather, so no tier and no weather covers them. Pure; Node-tested.

import type { Weather } from '../../systems/world/types';

/** Where a kept item is drawn: never in a pass a tier turns off. */
export type FairLayer = 'overlay' | 'world' | 'hud' | 'audio';

export interface KeptItem {
  id: string;
  layer: FairLayer;
  /** the module that draws it */
  by: string;
}

/** Information a player acts on: every tier, the flat one included, keeps all of it. */
export const KEPT_EVERY_TIER: readonly KeptItem[] = [
  { id: 'names', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'overhead_markers', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'enemy_cast_bars', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'uninterruptible_border', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'ground_warnings', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'offscreen_threat_arrows', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'threat_names', layer: 'overlay', by: 'render/overlay_painter.ts' },
  { id: 'threat_rings', layer: 'world', by: 'hd2d/entities.ts, render/flat_renderer.ts' },
  { id: 'selection_rings', layer: 'world', by: 'hd2d/entities.ts, render/flat_renderer.ts' },
  { id: 'enemy_positions_facing', layer: 'world', by: 'hd2d/entities.ts' },
  { id: 'windup_frames', layer: 'world', by: 'render/anim_state.ts' },
  {
    id: 'hidden_self_party_silhouette',
    layer: 'world',
    by: 'hd2d/entities.ts, render/flat_renderer.ts',
  },
  { id: 'sediment_haze', layer: 'overlay', by: 'hd2d/weather_overlay.ts, hd2d/post.ts' },
  { id: 'self_party_hp', layer: 'hud', by: 'hud/unit_frames.ts, hud/party_frames.ts' },
  { id: 'self_debuffs', layer: 'hud', by: 'hud/unit_frames.ts' },
  { id: 'target_hp_precision', layer: 'hud', by: 'hud/unit_frames.ts' },
  { id: 'key_cues', layer: 'audio', by: 'audio/' },
];

/** Look a tier may shed (2.12 right column). */
export const CUTTABLE = [
  'shadows',
  'shadow_resolution',
  'bloom',
  'tilt_shift',
  'grain',
  'volumetric_light',
  'depth_of_field',
  'reflections',
  'weather_particle_density',
  'pixel_ratio',
  'sky_layers',
  'ambient_critters',
  'fx_decor_particles',
  'flat_depth',
] as const;

/** The QualitySettings fields and the look each one sheds; nothing else may be a knob. */
export const QUALITY_KNOBS: Readonly<Record<string, (typeof CUTTABLE)[number] | 'tier'>> = {
  tier: 'tier',
  shadowMap: 'shadow_resolution',
  softShadows: 'shadows',
  bloom: 'bloom',
  tiltShift: 'tilt_shift',
  grain: 'grain',
  maxPixelRatio: 'pixel_ratio',
  skyLayers: 'sky_layers',
};

/** The fog layer over the world never gets more opaque than this (2.12). */
export const FOG_ALPHA_CAP = 0.35;
/** A weather particle is never drawn more opaque than this. */
export const PARTICLE_ALPHA_CAP = 0.75;
/** The haze mixed into the graded picture (fog, ash, overcast) stays under this. */
export const HAZE_CAP = 0.2;
/** A storm's lightning never whites the screen more than this (rings and marks stay seen). */
export const FLASH_ALPHA_CAP = 0.35;

/** Opacity of the lightning flash after the cap. */
export function flashAlpha(flash: number): number {
  return Math.max(0, Math.min(FLASH_ALPHA_CAP, flash * 0.85));
}

/** Opacity of a weather particle after the cap. */
export function particleAlpha(alpha: number): number {
  return Math.max(0, Math.min(PARTICLE_ALPHA_CAP, alpha));
}

/** Grade haze for a weather's raw haze (0..1) after the cap. */
export function gradeHaze(raw: number): number {
  return Math.max(0, Math.min(HAZE_CAP, raw * 0.22));
}

/** Weathers the acceptance screenshots cover (4.10: storm, thick fog, ashfall at least). */
export const FAIRNESS_WEATHERS: readonly Weather[] = ['clear', 'storm', 'fog', 'ashfall'];

/** Problems with a tier's settings: a field that is not a known look knob. */
export function knobProblems(settings: object): string[] {
  return Object.keys(settings)
    .filter((k) => !Object.hasOwn(QUALITY_KNOBS, k))
    .map((k) => `quality field '${k}' is not a look knob of the fairness list`);
}
