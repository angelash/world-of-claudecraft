// Frame scheduler (release_engineering.md 6.3, art_pipeline.md 2.11): decides, once per
// animation frame, whether the world is redrawn and which layers. The session's loop keeps
// running every frame (input, the fixed-step simulation clock and the HUD never wait on
// it); only the renderer call is gated. Three kinds of reasons make a frame dirty:
//
// - one-shot reasons the session raises (resize, quality, map), consumed by the next draw;
// - change keys of the visible world (frame_signals.ts), compared against the last drawn
//   frame, so a moving camera or a walking figure redraws every frame and a still picture
//   draws nothing;
// - time-driven activity: short effects in flight every frame, screen weather every frame,
//   water and motes on the ambient beat (AMBIENT_FPS).
//
// While the game is paused or a scene panel covers the world ("quiet"), time-driven
// decoration stops (idle breathing, marker bob, weather, water, motes, and DecorClock
// holds their time) so a paused screen draws no frames; state changes (camera, selection,
// a resize, a figure starting another animation) still draw at once.
// A dirty frame is always drawn in the same animation frame that observed the change, so
// the scheduler adds no input latency. Pure; Node-tested.

export const REDRAW_REASONS = [
  'camera',
  'motion',
  'anim',
  'roof',
  'fx',
  'ambient',
  'lightmap',
  'ground',
  'overlay',
  'resize',
  'quality',
  'map',
  'tick',
  'ui',
] as const;
export type RedrawReason = (typeof REDRAW_REASONS)[number];

/**
 * Layers a frame can redraw. The HD-2D renderer keeps the three.js world (scene graph,
 * lights, post chain) and the 2D overlay canvas (names, markers, bubbles, floating text,
 * weather) apart, so an overlay-only change skips the world pass and the other way round.
 * The flat renderer has one canvas and repaints everything for either layer.
 */
export interface FrameLayers {
  world: boolean;
  overlay: boolean;
}

export const ALL_LAYERS: Readonly<FrameLayers> = Object.freeze({ world: true, overlay: true });
const NO_LAYERS: Readonly<FrameLayers> = Object.freeze({ world: false, overlay: false });
const WORLD: Readonly<FrameLayers> = Object.freeze({ world: true, overlay: false });
const OVERLAY: Readonly<FrameLayers> = Object.freeze({ world: false, overlay: true });

/** Layers each one-shot reason dirties (time-driven reasons carry their own layers). */
export const REASON_LAYERS: Readonly<Record<RedrawReason, Readonly<FrameLayers>>> = {
  camera: ALL_LAYERS,
  motion: ALL_LAYERS,
  anim: ALL_LAYERS,
  roof: WORLD,
  fx: ALL_LAYERS,
  ambient: ALL_LAYERS,
  lightmap: WORLD,
  ground: WORLD,
  overlay: OVERLAY,
  resize: ALL_LAYERS,
  quality: ALL_LAYERS,
  map: ALL_LAYERS,
  tick: ALL_LAYERS,
  ui: ALL_LAYERS,
};

/** The ambient beat: water and motes advance at this rate on an otherwise still screen. */
export const AMBIENT_FPS = 12;

/**
 * Parts of a frame's change signature, one number each (frame_signals.ts). A part that
 * differs from the last drawn frame raises its reason and dirties its layers.
 */
export const SIGNATURE_PARTS = [
  'camera',
  'motion',
  'pose',
  'anim',
  'bob',
  'roof',
  'lightmap',
  'tick',
  'ui',
  'overlay',
] as const;
export type SignaturePart = (typeof SIGNATURE_PARTS)[number];
export type FrameSignature = Record<SignaturePart, number>;

interface PartRule {
  reason: RedrawReason;
  layers: Readonly<FrameLayers>;
  /** advances with the clock alone (idle frames, marker bob): ignored while quiet */
  timeDriven: boolean;
}

const PART_RULES: Readonly<Record<SignaturePart, PartRule>> = {
  // camera: pan, zoom, turn, tilt, the followed figure moving
  camera: { reason: 'camera', layers: ALL_LAYERS, timeDriven: false },
  // positions of the figures in view (names follow their heads)
  motion: { reason: 'motion', layers: ALL_LAYERS, timeDriven: false },
  // a figure in view started another animation or turned (a death, an attack, a hit cue)
  pose: { reason: 'anim', layers: ALL_LAYERS, timeDriven: false },
  // a figure in view stepped to its next animation frame (labels sit on the frame height)
  anim: { reason: 'anim', layers: ALL_LAYERS, timeDriven: true },
  // overhead markers bob on the overlay
  bob: { reason: 'anim', layers: OVERLAY, timeDriven: true },
  // roof dissolve
  roof: { reason: 'roof', layers: WORLD, timeDriven: false },
  // static and dynamic lights
  lightmap: { reason: 'lightmap', layers: WORLD, timeDriven: false },
  // world state a tick changes: map, hour and day, weather, figures in view and their looks
  tick: { reason: 'tick', layers: ALL_LAYERS, timeDriven: false },
  // selection, hover, placement preview, the click-to-move target
  ui: { reason: 'ui', layers: ALL_LAYERS, timeDriven: false },
  // names, markers, glyphs, bubbles, the exit hint, floating text coming and going
  overlay: { reason: 'overlay', layers: OVERLAY, timeDriven: false },
};

/** Time-driven activity in view this frame (frame_signals.ts). */
export interface FrameActivity {
  /** short effects in flight that end on their own (click-to-move pulse, floating text) */
  effects: Readonly<FrameLayers>;
  /** endless screen weather: particles, drifting fog, lightning (overlay) */
  weather: boolean;
  /** endless ambience on the ambient beat: water and film grain (world), motes (overlay) */
  ambient: Readonly<FrameLayers>;
}

export const NO_ACTIVITY: Readonly<FrameActivity> = Object.freeze({
  effects: NO_LAYERS,
  weather: false,
  ambient: NO_LAYERS,
});

export interface FrameInput {
  /** animation-frame timestamp, ms */
  nowMs: number;
  signature: FrameSignature;
  activity: FrameActivity;
  /** the game is paused or a scene panel covers the world */
  quiet: boolean;
}

export interface FrameDecision {
  draw: boolean;
  layers: FrameLayers;
  /** why, in REDRAW_REASONS order */
  reasons: RedrawReason[];
}

export interface FrameStats {
  frames: number;
  draws: number;
  worldDraws: number;
  overlayDraws: number;
}

/** Tolerance for frame timestamps landing a hair before the beat. */
const BEAT_SLACK_MS = 1;

const BIT = Object.fromEntries(REDRAW_REASONS.map((r, i) => [r, 1 << i])) as Record<
  RedrawReason,
  number
>;
const NO_REASONS: readonly RedrawReason[] = Object.freeze([]);

export class FrameScheduler {
  /** Draw every frame, as the old loop did (benchmark comparison, release_engineering.md 6.11). */
  alwaysDraw = false;
  readonly stats: FrameStats = { frames: 0, draws: 0, worldDraws: 0, overlayDraws: 0 };
  /** one-shot reasons waiting for the next drawn frame (bit mask over REDRAW_REASONS) */
  private pending = 0;
  private drawn: FrameSignature | null = null;
  private lastWorldMs = Number.NEGATIVE_INFINITY;
  private lastOverlayMs = Number.NEGATIVE_INFINITY;
  private readonly beatMs: number;

  constructor(ambientFps = AMBIENT_FPS) {
    this.beatMs = 1000 / Math.max(1, ambientFps);
  }

  /** Mark the next frame dirty for a one-shot reason (kept until a frame is drawn). */
  invalidate(reason: RedrawReason): void {
    this.pending |= BIT[reason];
  }

  /** Forget the last drawn frame: the next decision redraws every layer. */
  reset(): void {
    this.drawn = null;
  }

  /**
   * Decide this frame. When the answer is to draw, the caller draws the returned layers in
   * this same frame; the scheduler records the frame as drawn.
   */
  decide(input: FrameInput): FrameDecision {
    this.stats.frames++;
    let mask = 0;
    let world = false;
    let overlay = false;
    const add = (reason: RedrawReason, l: Readonly<FrameLayers>) => {
      mask |= BIT[reason];
      world ||= l.world;
      overlay ||= l.overlay;
    };
    for (const r of REDRAW_REASONS) if (this.pending & BIT[r]) add(r, REASON_LAYERS[r]);

    const sig = input.signature;
    const prev = this.drawn;
    for (const part of SIGNATURE_PARTS) {
      const rule = PART_RULES[part];
      if (prev && input.quiet && rule.timeDriven) continue;
      if (!prev || prev[part] !== sig[part]) add(rule.reason, rule.layers);
    }

    const act = input.activity;
    if (act.effects.world || act.effects.overlay) add('fx', act.effects);
    if (!input.quiet) {
      if (act.weather) add('fx', OVERLAY);
      const beatWorld = act.ambient.world && this.due(input.nowMs, this.lastWorldMs);
      const beatOverlay = act.ambient.overlay && this.due(input.nowMs, this.lastOverlayMs);
      if (beatWorld || beatOverlay) add('ambient', { world: beatWorld, overlay: beatOverlay });
    }

    if (this.alwaysDraw) {
      world = true;
      overlay = true;
    }
    const draw = world || overlay;
    if (draw) this.commit(input, world, overlay);
    return {
      draw,
      layers: { world, overlay },
      reasons: mask ? REDRAW_REASONS.filter((r) => mask & BIT[r]) : (NO_REASONS as RedrawReason[]),
    };
  }

  private due(nowMs: number, lastMs: number): boolean {
    return nowMs - lastMs + BEAT_SLACK_MS >= this.beatMs;
  }

  private commit(input: FrameInput, world: boolean, overlay: boolean): void {
    this.pending = 0;
    const kept = this.drawn ?? ({} as FrameSignature);
    // A part counts as drawn only when every layer it touches was drawn. A time-driven part
    // skipped while quiet keeps its old value when this frame drew only another layer, so
    // the frame after the pause still catches it up.
    for (const part of SIGNATURE_PARTS) {
      const l = PART_RULES[part].layers;
      if ((!l.world || world) && (!l.overlay || overlay)) kept[part] = input.signature[part];
    }
    this.drawn = kept;
    this.stats.draws++;
    if (world) {
      this.stats.worldDraws++;
      this.lastWorldMs = input.nowMs;
    }
    if (overlay) {
      this.stats.overlayDraws++;
      this.lastOverlayMs = input.nowMs;
    }
  }
}

/**
 * Time for decoration (water, weather, motes, marker bob, film grain): real time that
 * stops while quiet, so a frame drawn during a pause (a camera turn, a hover) shows the
 * decoration exactly as it stood when the pause began instead of jumping ahead.
 */
export class DecorClock {
  private t = 0;
  private last: number | null = null;

  advance(nowMs: number, quiet: boolean): number {
    if (this.last !== null && !quiet) this.t += Math.max(0, nowMs - this.last);
    this.last = nowMs;
    return this.t;
  }
}
