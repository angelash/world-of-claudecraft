// Pad rumble output: the thin DOM side of ./rumble.ts (audio_direction.md 10.5). It sends each
// step to the first connected pad that has a vibration actuator, as a dual-rumble effect.
// Pads without one, browsers without the Gamepad API and a failing effect are all silent.

import type { RumbleStep } from './rumble';

interface Actuator {
  playEffect(
    type: 'dual-rumble',
    params: {
      startDelay: number;
      duration: number;
      strongMagnitude: number;
      weakMagnitude: number;
    },
  ): Promise<unknown>;
}

function actuator(): Actuator | null {
  const nav = globalThis.navigator as
    | (Navigator & { getGamepads?: () => (Gamepad | null)[] })
    | undefined;
  if (!nav?.getGamepads) return null;
  try {
    for (const pad of nav.getGamepads()) {
      const a = (pad as (Gamepad & { vibrationActuator?: Actuator }) | null)?.vibrationActuator;
      if (pad?.connected && a && typeof a.playEffect === 'function') return a;
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Play rumble steps (each at its offset). A new effect replaces the one playing, so the steps
 * of a ramp are started one after the other rather than queued with a start delay.
 */
export function playRumble(steps: readonly RumbleStep[]): void {
  const a = actuator();
  if (!a) return;
  for (const s of steps) {
    const play = () =>
      a
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: s.durationMs,
          strongMagnitude: Math.max(0, Math.min(1, s.strong)),
          weakMagnitude: Math.max(0, Math.min(1, s.weak)),
        })
        .catch(() => {});
    if (s.atMs <= 0) void play();
    else setTimeout(play, s.atMs);
  }
}
