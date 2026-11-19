// Audio unlock with a gamepad only (ux_and_onboarding.md 18.5 "only a gamepad": every content
// reachable; audio_direction.md 10.1): the browser starts audio output only after a user
// activation, and a click or a key press is one, a gamepad button is not in every browser (the
// HTML activation rule counts keyboard, mouse and touch events; Chromium does not count Gamepad
// API reads). A player who never touches the mouse or keyboard would hear nothing. This watcher
// reads the pad snapshot the session polls every frame and asks for the unlock on the first
// button press (a fresh press, not a button held since before the page could see it), and on
// every later press until the output reports running, since a browser may refuse the first
// try. The desktop shell lifts the autoplay rule for its window, so there the first request
// already starts the output. Pure; the caller passes the snapshot and the unlock.

import type { PadSnapshot } from '../input/gamepad';

/** A button reads as pressed past this (analog triggers report 0 to 1). */
export const PAD_PRESS = 0.5;

export class PadAudioUnlock {
  private held = new Set<number>();
  private seen = false;
  private done = false;

  /**
   * Feed one snapshot (null: no pad). Answers true when a fresh press asks for the unlock now.
   * `running` reports whether the output already plays (then nothing more is asked).
   */
  press(snap: PadSnapshot | null, running: boolean): boolean {
    if (this.done || running) {
      this.done = true;
      return false;
    }
    if (!snap) {
      this.held.clear();
      return false;
    }
    const down = new Set<number>();
    snap.buttons.forEach((v, i) => {
      if (v >= PAD_PRESS) down.add(i);
    });
    // the first snapshot only records what is already held (a press before the page saw it)
    if (!this.seen) {
      this.seen = true;
      this.held = down;
      return false;
    }
    let fresh = false;
    for (const i of down) if (!this.held.has(i)) fresh = true;
    this.held = down;
    return fresh;
  }

  /** Stop asking (the session's output started some other way). */
  settle(): void {
    this.done = true;
  }
}
