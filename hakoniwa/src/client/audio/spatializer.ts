// Spatializer (audio_direction.md 8.4, 10.1): where a sound sits for the listener, the camera
// focus (the player). Pan follows the screen: the horizontal offset over half the viewport,
// clamped to -1..1 and scaled by 0.8 (never hard left or right). Distance: no loss within 4 m,
// a roll-off to -24 dB at 30 m, silence beyond 30 m except threats, which keep -18 dB and their
// direction (with the screen-edge arrow). Sounds high on the screen (further from the camera)
// lose up to 3 dB and gain a 12 to 6 kHz low-pass; a source in another indoor area loses 9 dB
// behind a 1.5 kHz low-pass. The eight reverb zones are parameter sets; the impulse responses
// are generated at run time from them (./audio_bus.ts), no third-party samples. Stereo sounds
// (music, beds, interface, cutscene) are not placed. Also the three listening distances of the
// prologue's eavesdropping beat (P5). Pure.

import { REVERB_ZONES, type ReverbZoneId } from '../../systems/world/atlas';
import { pixelsPerUnit, viewBasis } from '../hd2d/view';

export interface Listener {
  /** The camera focus in tiles (one tile is one metre). */
  x: number;
  y: number;
  yawDeg: number;
  pitchDeg: number;
  /** Zoom step (device pixels per tile over 16). */
  step: number;
  /** Viewport in device pixels. */
  viewportW: number;
  viewportH: number;
  /** Zoomed-out views (battlefield, lord view) scale distances by their zoom (8.4). */
  distanceScale?: number;
  /** Indoor area id of the listener (a building), or null outdoors. */
  zone?: string | null;
}

export interface SourcePlace {
  x: number;
  y: number;
  /** Threats stay audible beyond 30 m (8.4). */
  threat?: boolean;
  zone?: string | null;
}

export type Direction = 'left' | 'right' | 'behind' | 'far';

export interface Placement {
  audible: boolean;
  pan: number;
  gainDb: number;
  lowpassHz: number | null;
  /** Outside the viewport. */
  offscreen: boolean;
  /** Caption direction (10.4), or null when the source is in front of the listener. */
  direction: Direction | null;
}

export const NEAR_M = 4;
export const FAR_M = 30;
export const FAR_DB = -24;
export const THREAT_FAR_DB = -18;
export const PAN_SCALE = 0.8;
export const DEPTH_MAX_DB = -3;
export const OCCLUSION_DB = -9;
export const OCCLUSION_LOWPASS_HZ = 1500;

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/** Roll-off from 4 m (0 dB) to 30 m (-24 dB), on the inverse-distance curve's log shape. */
export function distanceDb(m: number): number {
  if (m <= NEAR_M) return 0;
  return (FAR_DB * Math.log(m / NEAR_M)) / Math.log(FAR_M / NEAR_M);
}

/** Screen offset of a ground point from the focus, in device pixels (x right, y up). */
export function screenOffset(l: Listener, x: number, y: number): { sx: number; sy: number } {
  const b = viewBasis(l.pitchDeg, l.yawDeg);
  const ppu = pixelsPerUnit(l.step);
  const rx = x - l.x;
  const rz = y - l.y;
  return { sx: (rx * b.right[0] + rz * b.right[2]) * ppu, sy: (rx * b.up[0] + rz * b.up[2]) * ppu };
}

export function place(src: SourcePlace, l: Listener, mono = false): Placement {
  const { sx, sy } = screenOffset(l, src.x, src.y);
  const halfW = Math.max(1, l.viewportW / 2);
  const halfH = Math.max(1, l.viewportH / 2);
  const offscreen = Math.abs(sx) > halfW || Math.abs(sy) > halfH;
  const meters = Math.hypot(src.x - l.x, src.y - l.y) * (l.distanceScale ?? 1);
  let pan = clamp(sx / halfW, -1, 1) * PAN_SCALE;
  let gainDb: number;
  let audible = true;
  let direction: Direction | null = null;
  if (meters > FAR_M) {
    if (!src.threat) audible = false;
    gainDb = THREAT_FAR_DB;
    direction = 'far';
  } else {
    gainDb = distanceDb(meters);
  }
  let lowpassHz: number | null = null;
  // Depth: further up the screen is further from the camera.
  const depth = clamp(sy / halfH, 0, 1);
  if (depth > 0) {
    gainDb += DEPTH_MAX_DB * depth;
    lowpassHz = Math.round(12000 - 6000 * depth);
  }
  const lz = l.zone ?? null;
  const sz = src.zone ?? null;
  if (lz !== sz) {
    gainDb += OCCLUSION_DB;
    lowpassHz = Math.min(lowpassHz ?? OCCLUSION_LOWPASS_HZ, OCCLUSION_LOWPASS_HZ);
  }
  if (direction === null) {
    if (sy < -halfH * 0.5 && offscreen) direction = 'behind';
    else if (pan <= -0.2) direction = 'left';
    else if (pan >= 0.2) direction = 'right';
  }
  if (mono) pan = 0;
  return { audible, pan, gainDb, lowpassHz, offscreen, direction };
}

// ---------------------------------------------------------------------------
// Reverb zones (8.4)

/** The eight zones are the atlas vocabulary (a map's `reverbZone`). */
export { REVERB_ZONES };
export type ReverbZone = ReverbZoneId;

export interface ReverbPreset {
  /** RT60 of the generated tail. */
  decaySec: number;
  preDelayMs: number;
  /** Send level of placed sounds into the zone. */
  wetDb: number;
  /** Damping of the tail. */
  lowpassHz: number;
}

/** Parameter sets the run-time impulse responses are generated from; changes ramp over 1 s. */
export const REVERB_PRESETS: Readonly<Record<ReverbZone, ReverbPreset>> = {
  outdoor: { decaySec: 0.6, preDelayMs: 20, wetDb: -24, lowpassHz: 6000 },
  street: { decaySec: 1.0, preDelayMs: 15, wetDb: -18, lowpassHz: 7000 },
  room: { decaySec: 0.5, preDelayMs: 5, wetDb: -16, lowpassHz: 8000 },
  hall: { decaySec: 1.8, preDelayMs: 25, wetDb: -12, lowpassHz: 7000 },
  dungeon: { decaySec: 2.4, preDelayMs: 30, wetDb: -10, lowpassHz: 5000 },
  sewer: { decaySec: 3.2, preDelayMs: 40, wetDb: -8, lowpassHz: 4000 },
  divine: { decaySec: 4.5, preDelayMs: 60, wetDb: -9, lowpassHz: 9000 },
  dream: { decaySec: 3.8, preDelayMs: 80, wetDb: -6, lowpassHz: 3500 },
};
export const REVERB_RAMP_MS = 1000;

export function isReverbZone(v: unknown): v is ReverbZone {
  return typeof v === 'string' && (REVERB_ZONES as readonly string[]).includes(v);
}

// ---------------------------------------------------------------------------
// The prologue's listening distances (prologue_antechamber.md 3.1; catalog_cutscenes.md
// cut_p_argument): the eavesdrop level (p_eavesdrop_level 0 to 3) picks a tier once, before the
// argument starts; the voices behind the curtain and the antechamber track's L2 follow it.

export type ListenTier = 'far' | 'mid' | 'near';

export interface ListenMix {
  /** Gain of the voices group (dialogue blips and voice sounds of the scene). */
  gainDb: number;
  /** Through the curtain: muffled far away, clear close up. */
  lowpassHz: number | null;
  /** The antechamber track opens L2 near the curtain (4.2 mus_pro_antechamber). */
  musicL2: boolean;
}

export const LISTEN_MIX: Readonly<Record<ListenTier, ListenMix>> = {
  far: { gainDb: -18, lowpassHz: 1200, musicL2: false },
  mid: { gainDb: -9, lowpassHz: 4000, musicL2: true },
  near: { gainDb: 0, lowpassHz: null, musicL2: true },
};

/** The tier of an eavesdrop level: 0 and 1 (the cough) far, 2 middle, 3 near. */
export function listenTierOf(level: number): ListenTier {
  return level >= 3 ? 'near' : level === 2 ? 'mid' : 'far';
}

/** A noise from the player lowers the tier one step for the rest (near to mid, mid to far). */
export function quieterTier(t: ListenTier): ListenTier {
  return t === 'near' ? 'mid' : 'far';
}
