// Virtual cursor (release_engineering.md 4.4: "where pointing is needed, a virtual cursor on
// the right stick"; ux_and_onboarding.md 16.3): a pointer a gamepad steers where a control
// must point at a spot (the map window, placing a building). Speed follows the square of
// the stick (fine near the centre, fast at the rim), scaled by the camera sensitivity
// setting; the cursor stays inside the viewport. A press of A clicks under it. Pure.

import type { Vec } from './gamepad';

/** CSS pixels per second at full deflection and sensitivity 1. */
export const CURSOR_SPEED = 900;

export interface CursorState {
  x: number;
  y: number;
}

/** A cursor at the centre of a viewport. */
export function centeredCursor(w: number, h: number): CursorState {
  return { x: Math.round(w / 2), y: Math.round(h / 2) };
}

/** Move the cursor by a stick vector over `dtMs`, clamped to the viewport. */
export function moveCursor(
  c: CursorState,
  stick: Vec,
  dtMs: number,
  view: { w: number; h: number },
  sensitivity = 1,
): CursorState {
  const m = Math.hypot(stick.x, stick.y);
  if (m === 0 || dtMs <= 0) return c;
  const speed = CURSOR_SPEED * sensitivity * m * m * (Math.min(dtMs, 100) / 1000);
  const x = Math.max(0, Math.min(view.w - 1, c.x + (stick.x / m) * speed));
  const y = Math.max(0, Math.min(view.h - 1, c.y + (stick.y / m) * speed));
  return x === c.x && y === c.y ? c : { x, y };
}
