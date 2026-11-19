// The model of the 亮 method (ux_and_onboarding.md 17.2): one HUD element at a time gets an
// outline that pulses twice; with reduced flashing on (18.8) it is a static thick outline
// held for 3 s instead. Pure: the caller passes `now`. The painter is ./glow.ts.

/** Two pulses of this length each (17.2), then the outline goes. */
export const GLOW_PULSE_MS = 700;
export const GLOW_PULSES = 2;
/** The static outline of reduced flashing (17.2, 18.8). */
export const GLOW_STATIC_MS = 3000;

export interface GlowState {
  /** the HUD element's `data-hud` name */
  target: string;
  startedAt: number;
  reduceFlashing: boolean;
}

export interface GlowFrame {
  target: string | null;
  mode: 'pulse' | 'static' | null;
}

/** How long a glow lasts. */
export function glowSpan(reduceFlashing: boolean): number {
  return reduceFlashing ? GLOW_STATIC_MS : GLOW_PULSE_MS * GLOW_PULSES;
}

/** What to draw now; null target once the glow has run its span. */
export function glowFrame(state: GlowState | null, now: number): GlowFrame {
  if (!state || now - state.startedAt >= glowSpan(state.reduceFlashing)) {
    return { target: null, mode: null };
  }
  return { target: state.target, mode: state.reduceFlashing ? 'static' : 'pulse' };
}
