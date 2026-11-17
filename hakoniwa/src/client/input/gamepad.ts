// Gamepad reading (release_engineering.md 4.4; ux_and_onboarding.md 16.1): one snapshot of
// the standard-mapping buttons and axes per poll in, edge events and stick values out.
// Sticks use a radial dead zone (inner 0.15, outer 0.95 by default) rescaled to 0..1; the
// left stick also yields the 8-way movement intent the kernel takes (the same intent the
// keyboard sends, so determinism does not depend on the device). Buttons yield down, up,
// hold (crossed the hold time while still down) and repeat (auto-repeat while down, for
// navigation); sticks yield gestures (a push past a threshold in one of four directions,
// re-armed when the stick comes back, repeating while held). What an event means is the
// action layer's business (input_hub.ts). Pure: time comes in with every snapshot.

import type { Intent } from './keymap';
import { PAD_BUTTONS, type PadButton, type StickDir, type StickId } from './pad_bindings';

/** One poll of one gamepad (the Gamepad API's standard mapping, values 0..1, axes -1..1). */
export interface PadSnapshot {
  id: string;
  buttons: readonly number[];
  axes: readonly number[];
}

export interface PadReaderOptions {
  /** radial dead zone: inner and outer edge (16.1, release_engineering.md 4.4) */
  deadInner: number;
  deadOuter: number;
  /** long-press time in ms (ux 4.4: 0.3 to 1.5 s) */
  holdMs: number;
  /** auto-repeat: first repeat after, then every */
  repeatDelayMs: number;
  repeatMs: number;
  /** stick gesture: fires past `gestureOn`, re-arms below `gestureOff` (rescaled values) */
  gestureOn: number;
  gestureOff: number;
  /** a button (or trigger) counts as pressed from this value */
  pressAt: number;
}

export const DEFAULT_PAD_READER: PadReaderOptions = {
  deadInner: 0.15,
  deadOuter: 0.95,
  holdMs: 500,
  repeatDelayMs: 400,
  repeatMs: 130,
  gestureOn: 0.6,
  gestureOff: 0.3,
  pressAt: 0.5,
};

export type PadEvent =
  | { type: 'down'; button: PadButton }
  | { type: 'up'; button: PadButton; heldMs: number }
  | { type: 'hold'; button: PadButton }
  | { type: 'repeat'; button: PadButton }
  | { type: 'gesture'; stick: StickId; dir: StickDir; repeat: boolean };

export interface Vec {
  x: number;
  y: number;
}

export interface PadFrame {
  /** a pad was present in this snapshot */
  connected: boolean;
  events: PadEvent[];
  /** dead-zoned, rescaled stick vectors (+y is down, as the axes report) */
  left: Vec;
  right: Vec;
  /** 8-way intent from the left stick (zero inside the dead zone) */
  move: Intent;
  /** a button went down, or a stick was pushed or is held well out (device switching, 16.1) */
  active: boolean;
}

/** Radial dead zone: zero inside `inner`, rescaled to reach 1 at `outer`. */
export function deadZone(x: number, y: number, inner: number, outer: number): Vec {
  const m = Math.hypot(x, y);
  if (!Number.isFinite(m) || m <= inner || m === 0) return { x: 0, y: 0 };
  const span = Math.max(1e-6, outer - inner);
  const scaled = Math.min(1, (m - inner) / span);
  return { x: (x / m) * scaled, y: (y / m) * scaled };
}

/** The 8-way intent of a stick vector (+y down = south), zero below `min`. */
export function eightWay(v: Vec, min = 0.1): Intent {
  if (Math.hypot(v.x, v.y) < min) return { dx: 0, dy: 0 };
  const sector = Math.round(Math.atan2(v.y, v.x) / (Math.PI / 4));
  const a = sector * (Math.PI / 4);
  return { dx: Math.round(Math.cos(a)), dy: Math.round(Math.sin(a)) };
}

/** The dominant direction of a stick vector, or null under `min`. */
export function fourWay(v: Vec, min: number): StickDir | null {
  if (Math.hypot(v.x, v.y) < min) return null;
  if (Math.abs(v.x) >= Math.abs(v.y)) return v.x < 0 ? 'left' : 'right';
  return v.y < 0 ? 'up' : 'down';
}

interface ButtonState {
  since: number;
  holdSent: boolean;
  nextRepeat: number;
}

interface GestureState {
  dir: StickDir | null;
  nextRepeat: number;
}

export class PadReader {
  private down = new Map<PadButton, ButtonState>();
  private gestures: Record<StickId, GestureState> = {
    left: { dir: null, nextRepeat: 0 },
    right: { dir: null, nextRepeat: 0 },
  };
  options: PadReaderOptions;

  constructor(options: Partial<PadReaderOptions> = {}) {
    this.options = { ...DEFAULT_PAD_READER, ...options };
  }

  isDown(button: PadButton): boolean {
    return this.down.has(button);
  }

  /** Buttons held right now, in standard order. */
  held(): PadButton[] {
    return PAD_BUTTONS.filter((x) => this.down.has(x));
  }

  /** Read one snapshot (null when no pad is present: everything held is released). */
  read(snap: PadSnapshot | null, nowMs: number): PadFrame {
    const o = this.options;
    const events: PadEvent[] = [];
    let active = false;
    PAD_BUTTONS.forEach((button, i) => {
      const value = snap?.buttons[i] ?? 0;
      const pressed = Number.isFinite(value) && value >= o.pressAt;
      const st = this.down.get(button);
      if (pressed && !st) {
        this.down.set(button, {
          since: nowMs,
          holdSent: false,
          nextRepeat: nowMs + o.repeatDelayMs,
        });
        events.push({ type: 'down', button });
      } else if (!pressed && st) {
        this.down.delete(button);
        events.push({ type: 'up', button, heldMs: nowMs - st.since });
      } else if (pressed && st) {
        if (!st.holdSent && nowMs - st.since >= o.holdMs) {
          st.holdSent = true;
          events.push({ type: 'hold', button });
        }
        if (nowMs >= st.nextRepeat) {
          st.nextRepeat = nowMs + o.repeatMs;
          events.push({ type: 'repeat', button });
        }
      }
    });
    const axis = (i: number) => {
      const v = snap?.axes[i] ?? 0;
      return Number.isFinite(v) ? v : 0;
    };
    const left = deadZone(axis(0), axis(1), o.deadInner, o.deadOuter);
    const right = deadZone(axis(2), axis(3), o.deadInner, o.deadOuter);
    this.gesture('left', left, nowMs, events);
    this.gesture('right', right, nowMs, events);
    // a press, a stick push or a stick held well out; a resting stick that drifts a little
    // past its dead zone does not take the glyphs from the keyboard
    if (events.some((e) => e.type === 'down' || (e.type === 'gesture' && !e.repeat))) active = true;
    if (Math.hypot(left.x, left.y) >= 0.5 || Math.hypot(right.x, right.y) >= 0.5) active = true;
    return { connected: !!snap, events, left, right, move: eightWay(left), active };
  }

  private gesture(stick: StickId, v: Vec, nowMs: number, events: PadEvent[]): void {
    const o = this.options;
    const g = this.gestures[stick];
    const m = Math.hypot(v.x, v.y);
    if (g.dir === null) {
      const dir = fourWay(v, o.gestureOn);
      if (dir) {
        g.dir = dir;
        g.nextRepeat = nowMs + o.repeatDelayMs;
        events.push({ type: 'gesture', stick, dir, repeat: false });
      }
      return;
    }
    const dir = fourWay(v, o.gestureOff);
    if (m < o.gestureOff || dir === null) {
      g.dir = null;
      return;
    }
    if (dir !== g.dir && m >= o.gestureOn) {
      g.dir = dir;
      g.nextRepeat = nowMs + o.repeatDelayMs;
      events.push({ type: 'gesture', stick, dir, repeat: false });
      return;
    }
    if (nowMs >= g.nextRepeat) {
      g.nextRepeat = nowMs + o.repeatMs;
      events.push({ type: 'gesture', stick, dir: g.dir, repeat: true });
    }
  }

  /** Forget every held button and stick (focus loss, the pad went away). */
  reset(): void {
    this.down.clear();
    this.gestures.left = { dir: null, nextRepeat: 0 };
    this.gestures.right = { dir: null, nextRepeat: 0 };
  }
}
