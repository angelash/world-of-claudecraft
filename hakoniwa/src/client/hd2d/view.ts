// HD-2D view math (art_pipeline.md 1.2 and 2.3): an orthographic camera looking down at
// the map from `pitch` degrees above the horizon, turned by `yaw` around the vertical,
// with integer zoom steps (device pixels per ground pixel). Scene axes: X east = tile x,
// Z south = tile y, Y up; one unit is one tile is one metre. With yaw 0 the camera sits
// south of its focus, so north is up on screen like the kernel's +y-is-south maps.
// Pure (no three.js, no DOM); Node-tested.

import { TILE_PX } from '../render/camera';

export const DEFAULT_PITCH = 36;
export const PITCH_MIN = 30;
export const PITCH_MAX = 82;
/**
 * What the lens itself allows: a cutscene's low and top shots (catalog_cutscenes.md 2.3, 22
 * and 85 degrees) go past the player's own range.
 */
export const LENS_PITCH_MIN = 20;
export const LENS_PITCH_MAX = 86;
/** Device pixels per ground pixel. */
export const ZOOM_STEPS: readonly number[] = [1, 2, 3, 4, 5, 6, 8, 10, 12];
/** Keyboard rotation step in degrees (Z and X keys). */
export const YAW_STEP = 45;

export type ViewPresetId = 'street' | 'overview';
export const VIEW_PRESETS: Readonly<Record<ViewPresetId, { pitch: number }>> = {
  street: { pitch: 36 },
  overview: { pitch: 64 },
};

/** What the player controls: zoom step index, pitch and yaw in degrees. */
export interface ViewPrefs {
  stepIndex: number;
  pitch: number;
  yaw: number;
}

/** A complete view: the prefs plus the focus point on the ground (tiles). */
export interface ViewRequest {
  focusX: number;
  focusY: number;
  /** device pixels per ground pixel (one of ZOOM_STEPS, or the flat renderer's zoom) */
  step: number;
  pitch: number;
  yaw: number;
}

export interface Viewport {
  /** device pixels */
  w: number;
  h: number;
}

export type Vec3 = [number, number, number];

export interface ViewBasis {
  /** unit vector from the focus toward the camera */
  toCamera: Vec3;
  /** screen right in world space */
  right: Vec3;
  /** screen up in world space (perpendicular to the view direction) */
  up: Vec3;
  /** on the ground, the direction that goes up the screen (away from the camera) */
  away: Vec3;
  sinP: number;
  cosP: number;
}

const RAD = Math.PI / 180;

export function clampPitch(p: number): number {
  return Math.max(PITCH_MIN, Math.min(PITCH_MAX, p));
}

export function wrapYaw(y: number): number {
  const w = y % 360;
  return w < 0 ? w + 360 : w;
}

export function clampStepIndex(i: number): number {
  return Math.max(0, Math.min(ZOOM_STEPS.length - 1, Math.round(i)));
}

export function stepAt(index: number): number {
  return ZOOM_STEPS[clampStepIndex(index)] as number;
}

/** Default zoom step: about 20 tiles of screen height at the default pitch. */
export function defaultStepIndex(deviceH: number): number {
  const want = deviceH / (TILE_PX * 20);
  let best = 0;
  for (let i = 0; i < ZOOM_STEPS.length; i++) {
    const s = ZOOM_STEPS[i] as number;
    if (Math.abs(s - want) < Math.abs((ZOOM_STEPS[best] as number) - want)) best = i;
  }
  return best;
}

export function defaultPrefs(deviceH: number): ViewPrefs {
  return { stepIndex: defaultStepIndex(deviceH), pitch: DEFAULT_PITCH, yaw: 0 };
}

/** Prefs read back from storage, with every field validated. */
export function sanitizePrefs(raw: unknown, deviceH: number): ViewPrefs {
  const d = defaultPrefs(deviceH);
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<Record<keyof ViewPrefs, unknown>>;
  const num = (v: unknown, f: number) => (typeof v === 'number' && Number.isFinite(v) ? v : f);
  return {
    stepIndex: clampStepIndex(num(r.stepIndex, d.stepIndex)),
    pitch: clampPitch(num(r.pitch, d.pitch)),
    yaw: wrapYaw(num(r.yaw, d.yaw)),
  };
}

/** Right-drag orbit: horizontal pixels turn the yaw, vertical pixels change the pitch. */
export function orbit(p: ViewPrefs, dxCss: number, dyCss: number): ViewPrefs {
  return { ...p, yaw: wrapYaw(p.yaw - dxCss * 0.4), pitch: clampPitch(p.pitch + dyCss * 0.25) };
}

/** Z and X keys: turn by YAW_STEP and snap to the nearest multiple of it. */
export function turn(p: ViewPrefs, dir: 1 | -1): ViewPrefs {
  const snapped = Math.round(p.yaw / YAW_STEP) * YAW_STEP;
  return { ...p, yaw: wrapYaw(snapped + dir * YAW_STEP) };
}

/** G key: street view and overview alternate (the nearer preset counts as current). */
export function togglePreset(p: ViewPrefs): ViewPrefs {
  const mid = (VIEW_PRESETS.street.pitch + VIEW_PRESETS.overview.pitch) / 2;
  const next = p.pitch < mid ? VIEW_PRESETS.overview : VIEW_PRESETS.street;
  return { ...p, pitch: next.pitch };
}

export function zoomBy(p: ViewPrefs, delta: number): ViewPrefs {
  return { ...p, stepIndex: clampStepIndex(p.stepIndex + delta) };
}

export function viewBasis(pitchDeg: number, yawDeg: number): ViewBasis {
  const p = Math.max(LENS_PITCH_MIN, Math.min(LENS_PITCH_MAX, pitchDeg)) * RAD;
  const y = wrapYaw(yawDeg) * RAD;
  const sinP = Math.sin(p);
  const cosP = Math.cos(p);
  const sy = Math.sin(y);
  const cy = Math.cos(y);
  return {
    toCamera: [sy * cosP, sinP, cy * cosP],
    right: [cy, 0, -sy],
    up: [-sy * sinP, cosP, -cy * sinP],
    away: [-sy, 0, -cy],
    sinP,
    cosP,
  };
}

/** Device pixels per scene unit. */
export function pixelsPerUnit(step: number): number {
  return step * TILE_PX;
}

/** Scene point (tile x, height in metres, tile y) to device pixels. */
export function projectToScreen(
  v: ViewRequest,
  vp: Viewport,
  x: number,
  h: number,
  y: number,
): { x: number; y: number } {
  const b = viewBasis(v.pitch, v.yaw);
  const ppu = pixelsPerUnit(v.step);
  const rx = x - v.focusX;
  const rz = y - v.focusY;
  const sx = rx * b.right[0] + h * b.right[1] + rz * b.right[2];
  const sy = rx * b.up[0] + h * b.up[1] + rz * b.up[2];
  return { x: vp.w / 2 + sx * ppu, y: vp.h / 2 - sy * ppu };
}

/** Device pixels to the ground point (tiles) under them. */
export function screenToGround(
  v: ViewRequest,
  vp: Viewport,
  sx: number,
  sy: number,
): { x: number; y: number } {
  const b = viewBasis(v.pitch, v.yaw);
  const ppu = pixelsPerUnit(v.step);
  const a = (sx - vp.w / 2) / ppu;
  const u = -(sy - vp.h / 2) / ppu / b.sinP;
  return {
    x: v.focusX + a * b.right[0] + u * b.away[0],
    y: v.focusY + a * b.right[2] + u * b.away[2],
  };
}

/**
 * Screen-relative movement (WASD: dy -1 is up the screen) to a kernel intent in map
 * axes, rounded so the command log stays readable.
 */
export function screenIntentToWorld(
  dx: number,
  dy: number,
  yawDeg: number,
): { dx: number; dy: number } {
  if (dx === 0 && dy === 0) return { dx: 0, dy: 0 };
  const y = wrapYaw(yawDeg) * RAD;
  const s = Math.sin(y);
  const c = Math.cos(y);
  const r = (n: number) => Math.round(n * 1000) / 1000 || 0;
  return { dx: r(dx * c + dy * s), dy: r(-dx * s + dy * c) };
}

/**
 * A kernel facing (radians, atan2 with +y south) as seen on screen under a camera yaw,
 * for choosing the sprite direction (art_pipeline.md 3.5). With the pitch the ground
 * direction is projected as the oblique camera shows it (the away axis shortens by the
 * sine of the pitch), so a figure walking down-right at a shallow angle on screen faces
 * right; without it the screen is taken as seen from straight above.
 */
export function screenFacing(facing: number, yawDeg: number, pitchDeg?: number): number {
  const y = wrapYaw(yawDeg) * RAD;
  if (pitchDeg === undefined) return facing + y;
  const sinP = Math.sin(Math.max(LENS_PITCH_MIN, Math.min(LENS_PITCH_MAX, pitchDeg)) * RAD);
  const dx = Math.cos(facing);
  const dz = Math.sin(facing);
  const right = dx * Math.cos(y) - dz * Math.sin(y);
  const down = sinP * (dx * Math.sin(y) + dz * Math.cos(y));
  return Math.atan2(down, right);
}

/**
 * Camera focus snapped so ground texels land on whole rendered pixels along the screen
 * axes (art_pipeline.md 2.3). `grid` is the size of one rendered (WebGL) pixel in device
 * pixels; the viewport size decides where the screen centre falls inside that grid, so
 * odd sizes stay aligned too.
 */
export function snapFocus(
  v: ViewRequest,
  vp: Viewport = { w: 0, h: 0 },
  grid = 1,
): { x: number; y: number } {
  const b = viewBasis(v.pitch, v.yaw);
  const ppu = pixelsPerUnit(v.step);
  const g = grid > 0 ? grid : 1;
  const mod = (n: number) => ((n % g) + g) % g;
  const snap = (val: number, off: number) => Math.round((val - off) / g) * g + off;
  const a = v.focusX * b.right[0] + v.focusY * b.right[2];
  const u = (v.focusX * b.away[0] + v.focusY * b.away[2]) * b.sinP;
  const sa = snap(a * ppu, mod(vp.w / 2)) / ppu;
  const su = snap(u * ppu, mod(-vp.h / 2)) / ppu / b.sinP;
  return { x: sa * b.right[0] + su * b.away[0], y: sa * b.right[2] + su * b.away[2] };
}
