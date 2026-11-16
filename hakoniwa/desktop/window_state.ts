// The game window's remembered state (docs/50_tech/release_engineering.md 2.7): first start
// fullscreen in packaged builds, windowed in development runs; afterwards the mode the player
// last chose, and in windowed mode the last position and size, back on the primary display
// when the display it was on is gone. Pure: the shell passes the stored settings, the
// displays' work areas and the window's state, and writes back what this module answers.

import type { WindowBounds, WindowSettings } from '../src/client/app/settings_schema';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** At least this much of a window must lie on some display for its position to be kept. */
export const MIN_VISIBLE = Object.freeze({ width: 120, height: 60 });

function overlap(a: Rect, b: Rect): { width: number; height: number } {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return { width: Math.max(0, width), height: Math.max(0, height) };
}

/** True when enough of `bounds` lies on one of the work areas to grab and move it. */
export function visibleOn(bounds: Rect, workAreas: readonly Rect[]): boolean {
  return workAreas.some((area) => {
    const o = overlap(bounds, area);
    return o.width >= MIN_VISIBLE.width && o.height >= MIN_VISIBLE.height;
  });
}

export interface Placement {
  fullscreen: boolean;
  /** Position and size to open with; no x and y means centred on the primary display. */
  bounds: { x?: number; y?: number; width: number; height: number } | null;
  maximize: boolean;
}

/**
 * Where the game window opens. `workAreas` is null when the display list is unavailable:
 * the size is kept and the position is left to the system.
 */
export function initialPlacement(
  stored: WindowSettings,
  opts: {
    packaged: boolean;
    workAreas: readonly Rect[] | null;
    minWidth: number;
    minHeight: number;
  },
): Placement {
  const fullscreen = stored.mode === null ? opts.packaged : stored.mode === 'fullscreen';
  const b = stored.bounds;
  if (!b) return { fullscreen, bounds: null, maximize: stored.maximized };
  const width = Math.max(opts.minWidth, b.width);
  const height = Math.max(opts.minHeight, b.height);
  const keepPosition =
    opts.workAreas !== null && visibleOn({ x: b.x, y: b.y, width, height }, opts.workAreas);
  return {
    fullscreen,
    bounds: keepPosition ? { x: b.x, y: b.y, width, height } : { width, height },
    maximize: stored.maximized,
  };
}

/** The window's state as the shell reads it from the BrowserWindow. */
export interface WindowObservation {
  fullscreen: boolean;
  maximized: boolean;
  minimized: boolean;
  /** Normal (restored) bounds, when the platform reports them. */
  normalBounds: Rect | null;
}

function roundBounds(r: Rect): WindowBounds {
  return {
    x: Math.round(r.x),
    y: Math.round(r.y),
    width: Math.round(r.width),
    height: Math.round(r.height),
  };
}

/**
 * The window settings after an observation. The mode changes only when `modeChanged` (the
 * player toggled fullscreen); bounds and the maximized flag are kept from windowed use only.
 */
export function nextWindowSettings(
  stored: WindowSettings,
  seen: WindowObservation,
  modeChanged: boolean,
): WindowSettings {
  const mode = modeChanged ? (seen.fullscreen ? 'fullscreen' : 'windowed') : stored.mode;
  if (seen.fullscreen || seen.minimized) return { ...stored, mode };
  const bounds = seen.normalBounds ? roundBounds(seen.normalBounds) : stored.bounds;
  return { mode, bounds, maximized: seen.maximized };
}

export function sameWindowSettings(a: WindowSettings, b: WindowSettings): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}
