// Gamepad polling (release_engineering.md 4.4): reads the browser Gamepad API once per call
// (the session calls it every animation frame, which keeps running while the renderer idles,
// release_engineering.md 6.3) and hands a snapshot of the most recently used pad in the
// standard mapping to the action layer. Thin DOM layer over input/gamepad.ts.

import type { PadSnapshot } from './gamepad';

/** The most recently used connected pad with a usable layout, or null. */
export function readGamepad(nav: Navigator = navigator): PadSnapshot | null {
  let pads: readonly (Gamepad | null)[] = [];
  try {
    pads = nav.getGamepads?.() ?? [];
  } catch {
    // a permissions policy can forbid the Gamepad API
    return null;
  }
  let best: Gamepad | null = null;
  for (const p of pads) {
    if (!p?.connected) continue;
    if (p.mapping !== 'standard' && p.buttons.length < 16) continue;
    if (!best || p.timestamp > best.timestamp) best = p;
  }
  if (!best) return null;
  return {
    id: best.id,
    buttons: best.buttons.map((b) => b.value || (b.pressed ? 1 : 0)),
    axes: [...best.axes],
  };
}
