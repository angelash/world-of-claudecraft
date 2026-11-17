// Gamepad rumble table (audio_direction.md 10.5, D-081; ux_and_onboarding.md 16.7, 18.8):
// which moments shake the pad, how hard and how long, scaled by the rumble strength setting
// and switched off by reduce flashing and shaking. A ramp (the major door's weak-to-medium
// second) is cut into steps, because a dual-rumble effect holds one level. Pure; the DOM side
// (./haptics.ts) sends the steps to the first pad that has an actuator.

export const RUMBLE_EVENTS = [
  'crit_dealt',
  'heavy_hit_taken',
  'boss_stomp',
  'presence_pulse',
  'major_door',
  'seal_loosen_major',
] as const;
export type RumbleEvent = (typeof RUMBLE_EVENTS)[number];

export interface RumbleEffect {
  durationMs: number;
  /** Low-frequency motor 0 to 1. */
  strong: number;
  /** High-frequency motor 0 to 1. */
  weak: number;
  /** Rise from zero over the whole duration. */
  ramp?: boolean;
}

/** Short is about a tenth of a second; weak, medium as in 10.5. */
export const RUMBLE_TABLE: Readonly<Record<RumbleEvent, RumbleEffect>> = {
  // The player lands a critical hit: short, weak.
  crit_dealt: { durationMs: 100, strong: 0, weak: 0.3 },
  // A heavy blow taken: short, medium.
  heavy_hit_taken: { durationMs: 160, strong: 0.5, weak: 0.3 },
  // A boss or colossus stomps: medium, 0.3 s.
  boss_stomp: { durationMs: 300, strong: 0.55, weak: 0.25 },
  // Presence heartbeat: a weak pulse on each beat.
  presence_pulse: { durationMs: 90, strong: 0.25, weak: 0 },
  // A major door opens: weak to medium over 1 s.
  major_door: { durationMs: 1000, strong: 0.5, weak: 0.35, ramp: true },
  // The seal loosens a great step or more: medium, 1 s.
  seal_loosen_major: { durationMs: 1000, strong: 0.5, weak: 0.4 },
};

export interface RumbleStep {
  atMs: number;
  durationMs: number;
  strong: number;
  weak: number;
}

const RAMP_STEPS = 4;

/** The steps to play for an event, or none (strength 0, or reduce flashing and shaking). */
export function rumbleSteps(
  ev: RumbleEvent,
  strength: number,
  reduceShaking: boolean,
): RumbleStep[] {
  const s = Math.max(0, Math.min(1, strength));
  if (reduceShaking || s === 0) return [];
  const e = RUMBLE_TABLE[ev];
  if (!e.ramp)
    return [{ atMs: 0, durationMs: e.durationMs, strong: e.strong * s, weak: e.weak * s }];
  const part = e.durationMs / RAMP_STEPS;
  return Array.from({ length: RAMP_STEPS }, (_, i) => {
    // Weak (a third) up to the full level.
    const k = (1 + (2 * i) / (RAMP_STEPS - 1)) / 3;
    return {
      atMs: Math.round(i * part),
      durationMs: Math.round(part),
      strong: e.strong * s * k,
      weak: e.weak * s * k,
    };
  });
}
