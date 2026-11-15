// Fixed-step clock for the main loop (architecture.md 4.1): real time accumulates and is
// converted into whole 20 Hz ticks; speed 2x and 4x push more ticks per frame rather than
// changing a tick's meaning; pause holds the accumulator. Alpha is the leftover fraction
// used for render interpolation. Pure; Node-tested.

import { TICK_HZ } from '../../core/time';

export type Speed = 1 | 2 | 4;
export const SPEEDS: readonly Speed[] = [1, 2, 4];

export interface ClockStep {
  steps: number;
  /** 0..1 progress toward the next tick */
  alpha: number;
}

export class FixedStepClock {
  speed: Speed = 1;
  paused = false;
  private acc = 0;
  readonly tickMs = 1000 / TICK_HZ;

  /**
   * @param maxFrameMs longest real gap honoured per frame (tab switches, hitches)
   * @param maxSteps hard cap on ticks per frame so a slow machine cannot spiral
   */
  constructor(
    private readonly maxFrameMs = 250,
    private readonly maxSteps = 40,
  ) {}

  advance(dtMs: number): ClockStep {
    if (this.paused) return { steps: 0, alpha: this.acc / this.tickMs };
    const dt = Math.max(0, Math.min(this.maxFrameMs, dtMs));
    this.acc += dt * this.speed;
    let steps = Math.floor(this.acc / this.tickMs);
    if (steps > this.maxSteps) {
      steps = this.maxSteps;
      this.acc = 0;
    } else {
      this.acc -= steps * this.tickMs;
    }
    return { steps, alpha: this.acc / this.tickMs };
  }

  setSpeed(speed: Speed): void {
    this.speed = speed;
  }

  togglePause(): boolean {
    this.paused = !this.paused;
    return this.paused;
  }

  reset(): void {
    this.acc = 0;
  }
}
