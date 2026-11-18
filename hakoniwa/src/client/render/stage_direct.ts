// The world picture of a scene's stage directives (catalog_cutscenes.md 2.3 and 13.5): the
// camera shot (angle, shot size, movement, framing), the light (a time-of-day preset or a
// colour mood), the weather on screen, the court mirror's time limit and the standee
// motions. The story layer records each directive with the real time it was entered
// (src/client/hud/story/stage.ts); this module turns that into the view, calendar, weather
// and animation the renderers draw. Light and weather changes take one second; leaving the
// scene fades back to the world's own. Nothing here touches the world: the kernel's clock,
// weather and positions stay as they are. Pure; Node-tested.

import type { Calendar } from '../../core/time';
import type {
  StageCameraAngle,
  StageLightPreset,
  StageShotSize,
  StageWeatherPreset,
} from '../../systems/scenes/types';
import type { MapDef, Weather } from '../../systems/world/types';
import { clampStepIndex, type ViewRequest, wrapYaw, ZOOM_STEPS } from '../hd2d/view';
import type { StageCamera } from '../hud/story/stage';
import { type AnimName, type Dir, frameAt } from '../sprites/anim_spec';
import type { Rgb } from '../sprites/pixels';
import type { AnimSample } from './anim_state';
import { TILE_PX } from './camera';
import type { LightMood } from './scene';

/** Light and weather presets fade in over this long (13.5). */
export const STAGE_FADE_MS = 1000;

export const ANGLE_PITCH: Readonly<Record<StageCameraAngle, number>> = {
  standard: 40,
  low: 22,
  high: 65,
  top: 85,
  side: 40,
};

/** Ground tiles a shot size shows top to bottom (2.3); close is twice the near zoom. */
export const SHOT_TILES: Readonly<Record<StageShotSize, number>> = {
  far: 60,
  full: 30,
  mid: 16,
  near: 8,
  close: 4,
};

const TIGHTER: Readonly<Record<StageShotSize, StageShotSize>> = {
  far: 'full',
  full: 'mid',
  mid: 'near',
  near: 'close',
  close: 'close',
};
const WIDER: Readonly<Record<StageShotSize, StageShotSize>> = {
  far: 'far',
  full: 'far',
  mid: 'full',
  near: 'mid',
  close: 'near',
};
const HIGHER: Readonly<Record<StageCameraAngle, StageCameraAngle>> = {
  low: 'standard',
  standard: 'high',
  side: 'high',
  high: 'top',
  top: 'top',
};
const LOWER: Readonly<Record<StageCameraAngle, StageCameraAngle>> = {
  top: 'high',
  high: 'standard',
  standard: 'low',
  side: 'low',
  low: 'low',
};

/** A side shot turns at most this far (2.3: an orthographic camera does not orbit wide). */
export const SIDE_YAW_MAX = 20;

const clamp01 = (k: number) => Math.max(0, Math.min(1, k));
const ease = (k: number) => {
  const t = clamp01(k);
  return t * t * (3 - 2 * t);
};

/** The zoom step index that shows about `tiles` ground tiles top to bottom at a pitch. */
export function stepIndexForTiles(tiles: number, deviceH: number, pitchDeg: number): number {
  const sinP = Math.max(0.2, Math.sin((Math.max(5, Math.min(89, pitchDeg)) * Math.PI) / 180));
  const want = deviceH / (TILE_PX * Math.max(1, tiles) * sinP);
  let best = 0;
  for (let i = 0; i < ZOOM_STEPS.length; i++) {
    const s = ZOOM_STEPS[i] as number;
    if (Math.abs(s - want) < Math.abs((ZOOM_STEPS[best] as number) - want)) best = i;
  }
  return clampStepIndex(best);
}

export type Pt = { x: number; y: number };

/**
 * The view of a shot at `nowMs`. `anchor` is the framing point taken when the shot began
 * (a held shot does not drift), `follow` the live position of the focus (a tracking shot
 * follows it), `to` the end of a pan. Zoom stays on the whole steps (2.3).
 */
export function shotView(
  cam: StageCamera,
  nowMs: number,
  anchor: Pt,
  follow: Pt | null,
  to: Pt | null,
  deviceH: number,
): ViewRequest {
  const secs = Math.max(0.1, cam.seconds ?? 2);
  const k = ease((nowMs - cam.start) / (secs * 1000));
  // a word outside the vocabulary falls back to the default rather than breaking the shot
  const angle: StageCameraAngle =
    cam.angle && Object.hasOwn(ANGLE_PITCH, cam.angle) ? cam.angle : 'standard';
  const size: StageShotSize = cam.size && Object.hasOwn(SHOT_TILES, cam.size) ? cam.size : 'mid';
  const move = cam.move ?? 'hold';
  let pitch = ANGLE_PITCH[angle];
  if (move === 'rise') pitch += (ANGLE_PITCH[HIGHER[angle]] - pitch) * k;
  if (move === 'fall') pitch += (ANGLE_PITCH[LOWER[angle]] - pitch) * k;
  let tiles = SHOT_TILES[size];
  const end =
    move === 'push' ? SHOT_TILES[TIGHTER[size]] : move === 'pull' ? SHOT_TILES[WIDER[size]] : tiles;
  tiles = tiles * (end / tiles) ** k;
  const step = ZOOM_STEPS[stepIndexForTiles(tiles, deviceH, pitch)] as number;
  const yawLimit = (y: number | undefined, d: number) =>
    Math.max(-SIDE_YAW_MAX, Math.min(SIDE_YAW_MAX, y ?? d));
  const yaw = wrapYaw(angle === 'side' ? yawLimit(cam.yaw, 15) : yawLimit(cam.yaw, 0));
  let focus = anchor;
  if (move === 'track' && follow) focus = follow;
  else if (move === 'pan' && to)
    focus = { x: anchor.x + (to.x - anchor.x) * k, y: anchor.y + (to.y - anchor.y) * k };
  return { focusX: focus.x, focusY: focus.y, step, pitch, yaw };
}

/**
 * Where a stage reference stands on the player's map: `player`, an entity id, an entity's
 * content ref (an NPC or speaker id), a location id (its centre), or "x,y" in tiles.
 */
export function resolveStageRef(
  ref: string | undefined,
  ctx: {
    playerId: string;
    entities: readonly { id: string; ref?: string; x: number; y: number }[];
    map: Pick<MapDef, 'locations' | 'width' | 'height'>;
  },
): (Pt & { id?: string }) | null {
  const r = (ref ?? 'player').trim();
  const id = r === 'player' || r === '' ? ctx.playerId : r;
  const byId = ctx.entities.find((e) => e.id === id) ?? ctx.entities.find((e) => e.ref === id);
  if (byId) return { x: byId.x, y: byId.y, id: byId.id };
  const loc = ctx.map.locations.find((l) => l.id === r);
  if (loc) return { x: loc.x + loc.w / 2, y: loc.y + loc.h / 2 };
  const m = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/.exec(r);
  if (m) {
    const x = Math.max(0, Math.min(ctx.map.width, Number(m[1])));
    const y = Math.max(0, Math.min(ctx.map.height, Number(m[2])));
    return { x, y };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Light, mood and weather

/** Minutes of day of the time presets (2.3: morning, noon, dusk, night, deep night). */
export const LIGHT_MINUTES: Readonly<Partial<Record<StageLightPreset, number>>> = {
  dawn: 390,
  noon: 720,
  dusk: 1125,
  night: 1320,
  midnight: 120,
};

/** The colour mood of a light preset (2.3: white gold, amber, grey purple, blue gold). */
export const LIGHT_MOODS: Readonly<Partial<Record<StageLightPreset, LightMood>>> = {
  divine: 'divine',
  door: 'door',
  sediment: 'sediment',
  dream: 'dream',
};

/** How a mood grades the picture: a multiply tint and a coloured vignette. */
export const MOOD_GRADES: Readonly<
  Record<LightMood, { tint: Rgb; vignette: Rgb; strength: number }>
> = {
  divine: { tint: 0xfff4dc, vignette: 0xffecbe, strength: 0.3 },
  door: { tint: 0xffe4b8, vignette: 0xd8962a, strength: 0.32 },
  sediment: { tint: 0xd6cce0, vignette: 0x3a1450, strength: 0.45 },
  // low-saturation blue with a dim gold rim
  dream: { tint: 0xc4cce4, vignette: 0x7a6a3a, strength: 0.38 },
  ashstorm: { tint: 0xb8a490, vignette: 0x3a2a1e, strength: 0.42 },
};

const WEATHERS: ReadonlySet<string> = new Set([
  'clear',
  'cloudy',
  'rain',
  'storm',
  'fog',
  'snow',
  'ashfall',
]);

/**
 * The world weather a preset shows (the ash storm is ash under a storm's dark); an unknown
 * word keeps the world's weather (13.5: a directive that cannot be carried out keeps the
 * picture).
 */
export function presetWeather(preset: StageWeatherPreset, world: Weather): Weather {
  if (preset === 'ashstorm') return 'ashfall';
  return WEATHERS.has(preset) ? (preset as Weather) : world;
}

/** Shortest way around the clock from one minute of day to another, at k. */
export function clockLerp(from: number, to: number, k: number): number {
  let d = (to - from) % 1440;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  const m = (from + d * clamp01(k)) % 1440;
  return m < 0 ? m + 1440 : m;
}

/** A calendar showing another minute of the same day (the clock itself never moves). */
export function atMinute(cal: Calendar, minuteOfDay: number): Calendar {
  const m = Math.max(0, Math.min(1439.999, minuteOfDay));
  return { ...cal, minuteOfDay: m, hour: Math.floor(m / 60), minute: Math.floor(m % 60) };
}

/**
 * The stage's memory between frames: where a light or weather change started from, so the
 * one-second fades run from what was on screen, and the framing anchor of each shot.
 */
export class StageDirector {
  private lightKey = 'world';
  private lightFrom = 0;
  private lightStart = Number.NEGATIVE_INFINITY;
  private shownMinute: number | null = null;
  private weatherKey = 'world';
  private weatherFrom: Weather | null = null;
  private weatherStart = Number.NEGATIVE_INFINITY;
  private shownWeather: Weather | null = null;
  private shotKey = '';
  private anchor: Pt | null = null;
  /** the anchor is the shot's own focus (not the player standing in for a focus not found yet) */
  private anchored = false;
  private moodShown: { kind: LightMood; k: number } | null = null;
  private moodFrom: { kind: LightMood; k: number } | null = null;
  private moodKey = '';
  private moodStart = Number.NEGATIVE_INFINITY;

  /** The calendar the picture shows: a time preset, faded from what was on screen. */
  calendar(
    base: Calendar,
    light: { preset: StageLightPreset; start: number } | null,
    nowMs: number,
  ): Calendar {
    const minutes = light ? LIGHT_MINUTES[light.preset] : undefined;
    const key = minutes === undefined ? 'world' : (light?.preset ?? 'world');
    const target = minutes ?? base.minuteOfDay;
    if (key !== this.lightKey) {
      this.lightKey = key;
      this.lightFrom = this.shownMinute ?? target;
      this.lightStart = key === 'world' ? nowMs : (light?.start ?? nowMs);
    }
    const k = (nowMs - this.lightStart) / STAGE_FADE_MS;
    if (k >= 1 && key === 'world') {
      this.shownMinute = base.minuteOfDay;
      return base;
    }
    const m = clockLerp(this.lightFrom, target, k);
    this.shownMinute = m;
    return atMinute(base, m);
  }

  /**
   * The colour mood of the light (and of an ash storm). A new mood ramps in over a second; a
   * mood that ends ramps out; one mood replacing another fades the old out, then the new in;
   * a later node naming the same mood again does not restart it.
   */
  mood(
    light: { preset: StageLightPreset; start: number } | null,
    weather: { preset: StageWeatherPreset; start: number } | null,
    nowMs: number,
  ): { kind: LightMood; k: number } | null {
    const lm = light ? LIGHT_MOODS[light.preset] : undefined;
    const target: LightMood | null = lm ?? (weather?.preset === 'ashstorm' ? 'ashstorm' : null);
    const key = target ?? '';
    if (key !== this.moodKey) {
      this.moodKey = key;
      this.moodFrom = this.moodShown;
      this.moodStart = nowMs;
    }
    const k = clamp01((nowMs - this.moodStart) / STAGE_FADE_MS);
    const from = this.moodFrom;
    let shown: { kind: LightMood; k: number } | null;
    if (from && from.kind !== target) {
      // the old mood leaves over the first half, the new one comes in over the second
      shown =
        k < 0.5
          ? { kind: from.kind, k: from.k * (1 - k * 2) }
          : target
            ? { kind: target, k: (k - 0.5) * 2 }
            : null;
    } else
      shown = target
        ? { kind: target, k: from && from.kind === target ? Math.max(from.k, k) : k }
        : null;
    if (shown && shown.k <= 0) shown = null;
    this.moodShown = shown;
    return shown;
  }

  /** The weather on screen and the fade from the one before, if it is still running. */
  weather(
    base: Weather,
    w: { preset: StageWeatherPreset; start: number } | null,
    nowMs: number,
  ): { weather: Weather; fade: { from: Weather; t: number } | null } {
    const key = w && w.preset !== 'world' ? w.preset : 'world';
    const target = w ? presetWeather(w.preset, base) : base;
    if (key !== this.weatherKey) {
      this.weatherKey = key;
      this.weatherFrom = this.shownWeather ?? target;
      this.weatherStart = key === 'world' ? nowMs : (w?.start ?? nowMs);
    }
    this.shownWeather = target;
    const t = (nowMs - this.weatherStart) / STAGE_FADE_MS;
    const from = this.weatherFrom;
    const fade = from && from !== target && t < 1 ? { from, t: clamp01(t) } : null;
    return { weather: target, fade };
  }

  /**
   * The view of the current shot, or null when the camera is the player's. The framing
   * anchor is taken once per shot.
   */
  view(
    cam: StageCamera | null,
    nowMs: number,
    resolve: (ref: string | undefined) => Pt | null,
    deviceH: number,
  ): ViewRequest | null {
    if (!cam) {
      this.shotKey = '';
      this.anchor = null;
      return null;
    }
    const key = `${cam.start}|${cam.focus ?? ''}|${cam.angle ?? ''}|${cam.size ?? ''}|${cam.move ?? ''}`;
    const live = resolve(cam.focus);
    if (key !== this.shotKey || !this.anchor || (!this.anchored && live)) {
      // a focus not on the map yet borrows the player until it appears
      if (key !== this.shotKey || live) this.anchor = live ?? resolve('player');
      this.anchored = !!live;
      this.shotKey = key;
    }
    if (!this.anchor) return null;
    const to = cam.to ? resolve(cam.to) : null;
    return shotView(cam, nowMs, this.anchor, live, to, deviceH);
  }
}

// ---------------------------------------------------------------------------
// Motions

interface MotionSpec {
  anim: AnimName;
  /** turn the figure: around, up, toward or away from the player */
  face?: 'back' | 'up' | 'toward' | 'away';
}

/** The standee animation of each `@动作` motion (2.3). */
export const MOTION_ANIMS: Readonly<Record<string, MotionSpec>> = {
  walk: { anim: 'walk' },
  run: { anim: 'run' },
  stop: { anim: 'idle' },
  turn: { anim: 'idle', face: 'back' },
  nod: { anim: 'nod' },
  shake_head: { anim: 'shake' },
  sit: { anim: 'sit' },
  stand: { anim: 'idle' },
  kneel: { anim: 'pray' },
  fall: { anim: 'death' },
  raise_hand: { anim: 'wave' },
  draw: { anim: 'combat_idle' },
  cast: { anim: 'cast' },
  look_up: { anim: 'idle', face: 'up' },
  approach: { anim: 'walk', face: 'toward' },
  retreat: { anim: 'walk', face: 'away' },
};

const OPPOSITE: Readonly<Record<Dir, Dir>> = {
  down: 'up',
  up: 'down',
  left: 'right',
  right: 'left',
};

/**
 * The frame a figure shows during a staged motion. A motion the standee has no drawing for
 * (an `art_chr_` pose frame before its art exists, an unknown word) holds the standing
 * frame (13.5). `toward` is the direction from the figure to the player on screen.
 */
export function motionSample(
  action: string,
  elapsedMs: number,
  base: AnimSample,
  toward: Dir | null,
): AnimSample {
  const spec = Object.hasOwn(MOTION_ANIMS, action) ? MOTION_ANIMS[action] : undefined;
  if (!spec) return { anim: 'idle', dir: base.dir, frame: 0 };
  let dir = base.dir;
  if (spec.face === 'back') dir = OPPOSITE[base.dir];
  else if (spec.face === 'up') dir = 'up';
  else if (spec.face === 'toward') dir = toward ?? base.dir;
  else if (spec.face === 'away') dir = toward ? OPPOSITE[toward] : base.dir;
  return { anim: spec.anim, dir, frame: frameAt(spec.anim, Math.max(0, elapsedMs)) };
}

/** Whether the court mirror shows now (13.5: at most 20 seconds). */
export function mirrorShown(m: { until: number } | null, nowMs: number): boolean {
  return !!m && nowMs < m.until;
}
