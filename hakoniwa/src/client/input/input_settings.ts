// Input settings (ux_and_onboarding.md 4.4 "gamepad options" and "long press", 16.4, 16.6;
// release_engineering.md 4.4): stick dead zones, camera sensitivity and pitch inversion, soft
// targeting (on for the pad, optional for key and mouse, cone width, lock on cast), rumble
// strength, confirm and back swapped, the glyph family and the long-press time. They live in
// the sync settings part (SyncSettings.input, settings_schema.ts checks every field) next to
// the key overrides, shared by every save. Pure.

import { GLYPH_SETTINGS, type GlyphSetting } from './device';
import { SOFT_CONES, type SoftCone } from './soft_target';

export interface InputSettings {
  /** radial stick dead zone, inner and outer edge (release_engineering.md 4.4) */
  padDeadInner: number;
  padDeadOuter: number;
  /** camera and virtual cursor speed multiplier */
  cameraSensitivity: number;
  invertPitch: boolean;
  /** soft targeting with a gamepad (16.4, on by default) */
  softLock: boolean;
  /** soft targeting with keyboard and mouse (off by default) */
  softLockKbm: boolean;
  softCone: SoftCone;
  /** using an ability on the soft target makes it the hard target */
  lockOnCast: boolean;
  /** rumble strength 0 to 100 (16.7) */
  rumble: number;
  /** A and B trade roles (16.6 rule 5) */
  swapConfirmBack: boolean;
  glyphs: GlyphSetting;
  /** long-press time in seconds (4.4: 0.3 to 1.5) */
  holdSeconds: number;
}

export const INPUT_RANGES = {
  padDeadInner: [0, 0.5],
  padDeadOuter: [0.5, 1],
  cameraSensitivity: [0.25, 3],
  rumble: [0, 100],
  holdSeconds: [0.3, 1.5],
} as const;

export function defaultInputSettings(): InputSettings {
  return {
    padDeadInner: 0.15,
    padDeadOuter: 0.95,
    cameraSensitivity: 1,
    invertPitch: false,
    softLock: true,
    softLockKbm: false,
    softCone: 60,
    lockOnCast: true,
    rumble: 100,
    swapConfirmBack: false,
    glyphs: 'auto',
    holdSeconds: 0.5,
  };
}

export { GLYPH_SETTINGS, SOFT_CONES };
