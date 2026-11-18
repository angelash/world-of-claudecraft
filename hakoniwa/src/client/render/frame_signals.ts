// Frame signals for the frame scheduler (release_engineering.md 6.3): one built Scene
// reduced to a change signature (a number per part: camera, figure positions, animation
// poses and frames, marker bob, roofs, lights, world state, selection and placement,
// overlay content: combat marks and ground warnings included) and its time-driven activity
// (effects in flight, screen weather, water in view, film grain, motes; a stage weather,
// mood or switch-tile fade changes the signature on every frame while it runs). Only figures in view count, with a margin wide enough for
// tall sprites, labels, bubbles and their long evening shadows, so a crowd walking off
// screen does not keep the frame dirty. The hash folds 32-bit words with an FNV step, which is one-to-one in the running
// value, so changing any one number always changes its part (strings fold their length
// first). Pure; Node-tested.

import { tileAt } from '../../systems/world/grid';
import type { MapDef, Weather } from '../../systems/world/types';
import { pixelsPerUnit, viewBasis } from '../hd2d/view';
import { clampZoom, followCamera, TILE_PX } from './camera';
import { showsCastBar, wantsEdgeArrow } from './combat_marks';
import type { FrameActivity, FrameSignature } from './frame_scheduler';
import { markerBob } from './markers';
import type { Scene } from './scene';

/** Length of the click-to-move pulse both renderers draw under the target point. */
export const MOVE_PULSE_MS = 700;

/** Weather that animates on screen every frame (particles, drifting fog, lightning). */
export const ANIMATED_WEATHER: ReadonlySet<Weather> = new Set<Weather>([
  'rain',
  'storm',
  'snow',
  'ashfall',
  'fog',
]);

/**
 * View margin around the screen: sprite pixels (scaled by zoom) plus text pixels (by dpr).
 * Sixteen tiles cover a tall figure's shadow with the sun low (about four times its height).
 */
export const VIEW_MARGIN_SPRITE_PX = 16 * TILE_PX;
export const VIEW_MARGIN_TEXT_PX = 240;

export interface SignalOptions {
  /** the flat Canvas2D renderer draws this frame (top-down, integer zoom) */
  flat: boolean;
  /** viewport in device pixels */
  deviceW: number;
  deviceH: number;
  dpr: number;
  /** the HD-2D tier animates film grain in the post chain (it shimmers on the ambient beat) */
  grain?: boolean;
}

export interface FrameSignals {
  signature: FrameSignature;
  activity: FrameActivity;
}

const SEED = 0x811c9dc5;
const PRIME = 0x01000193;
const F64 = new Float64Array(1);
const U32 = new Uint32Array(F64.buffer);

function word(h: number, w: number): number {
  return Math.imul(h ^ w, PRIME) >>> 0;
}

function num(h: number, n: number): number {
  F64[0] = n;
  return word(word(h, U32[0] as number), U32[1] as number);
}

function str(h: number, s: string): number {
  let k = word(h, s.length);
  for (let i = 0; i < s.length; i++) k = word(k, s.charCodeAt(i));
  return k;
}

function flag(h: number, b: boolean): number {
  return word(h, b ? 1 : 2);
}

/** Summed-area table of water tiles, (width + 1) by (height + 1), memoised per map. */
const waterMemo = new WeakMap<MapDef, Uint32Array>();

function waterTable(map: MapDef): Uint32Array {
  let sat = waterMemo.get(map);
  if (!sat) {
    const w = map.width + 1;
    sat = new Uint32Array(w * (map.height + 1));
    for (let y = 0; y < map.height; y++) {
      let row = 0;
      for (let x = 0; x < map.width; x++) {
        const k = tileAt(map, x, y);
        if (k === 'water' || k === 'deep_water') row++;
        sat[(y + 1) * w + x + 1] = (sat[y * w + x + 1] as number) + row;
      }
    }
    waterMemo.set(map, sat);
  }
  return sat;
}

/** Number of water tiles in the tile rectangle [x0, x1) by [y0, y1), clamped to the map. */
export function waterTilesIn(map: MapDef, x0: number, y0: number, x1: number, y1: number): number {
  const ax = Math.max(0, Math.min(map.width, Math.floor(x0)));
  const ay = Math.max(0, Math.min(map.height, Math.floor(y0)));
  const bx = Math.max(ax, Math.min(map.width, Math.ceil(x1)));
  const by = Math.max(ay, Math.min(map.height, Math.ceil(y1)));
  const sat = waterTable(map);
  const w = map.width + 1;
  const at = (x: number, y: number) => sat[y * w + x] as number;
  return at(bx, by) - at(ax, by) - at(bx, ay) + at(ax, ay);
}

/** Whether a map has animated water anywhere. */
export function mapHasWater(map: MapDef): boolean {
  return waterTilesIn(map, 0, 0, map.width, map.height) > 0;
}

/** Whether any water tile shows on screen (one tile of slack around the view). */
export function waterInView(
  map: MapDef,
  ft: FootTransform,
  deviceW: number,
  deviceH: number,
): boolean {
  const det = ft.ax * ft.by - ft.bx * ft.ay;
  if (!det) return mapHasWater(map);
  let x0 = Number.POSITIVE_INFINITY;
  let y0 = Number.POSITIVE_INFINITY;
  let x1 = Number.NEGATIVE_INFINITY;
  let y1 = Number.NEGATIVE_INFINITY;
  for (const [sx, sy] of [
    [0, 0],
    [deviceW, 0],
    [0, deviceH],
    [deviceW, deviceH],
  ] as const) {
    const dx = sx - ft.cx;
    const dy = sy - ft.cy;
    const x = (ft.by * dx - ft.bx * dy) / det;
    const y = (ft.ax * dy - ft.ay * dx) / det;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  }
  return waterTilesIn(map, x0 - 1, y0 - 1, x1 + 1, y1 + 1) > 0;
}

/**
 * Ground point (tiles) to device pixels for the renderer drawing this frame, as an affine
 * map sx = ax * x + bx * y + cx, sy = ay * x + by * y + cy: the HD-2D oblique projection
 * around the focus at ground height, or the flat camera that follows the focus and stops
 * at the map edges.
 */
export interface FootTransform {
  ax: number;
  bx: number;
  cx: number;
  ay: number;
  by: number;
  cy: number;
}

export function footTransform(scene: Scene, opts: SignalOptions): FootTransform {
  const v = scene.view;
  const w = opts.deviceW;
  const h = opts.deviceH;
  if (opts.flat) {
    const zoom = clampZoom(v.step);
    const cam = followCamera(
      { x: v.focusX, y: v.focusY },
      scene.map.width,
      scene.map.height,
      w,
      h,
      zoom,
    );
    const k = TILE_PX * zoom;
    return { ax: k, bx: 0, cx: -cam.x * zoom, ay: 0, by: k, cy: -cam.y * zoom };
  }
  const b = viewBasis(v.pitch, v.yaw);
  const ppu = pixelsPerUnit(v.step);
  const [r0, , r2] = b.right;
  const [u0, , u2] = b.up;
  return {
    ax: r0 * ppu,
    bx: r2 * ppu,
    cx: w / 2 - (v.focusX * r0 + v.focusY * r2) * ppu,
    ay: -u0 * ppu,
    by: -u2 * ppu,
    cy: h / 2 + (v.focusX * u0 + v.focusY * u2) * ppu,
  };
}

/** Device pixels per sprite pixel on the overlay (what the renderers pass as its scale). */
export function overlayScale(scene: Scene, flat: boolean): number {
  return flat ? clampZoom(scene.view.step) : scene.view.step;
}

/** The change signature and time-driven activity of a built scene. */
export function frameSignals(scene: Scene, opts: SignalOptions): FrameSignals {
  const v = scene.view;
  const scale = overlayScale(scene, opts.flat);
  const margin = VIEW_MARGIN_SPRITE_PX * scale + VIEW_MARGIN_TEXT_PX * opts.dpr;
  const ft = footTransform(scene, opts);
  const minX = -margin;
  const minY = -margin;
  const maxX = opts.deviceW + margin;
  const maxY = opts.deviceH + margin;

  let camera = num(num(num(num(num(SEED, v.focusX), v.focusY), v.step), v.pitch), v.yaw);
  camera = num(num(num(word(camera, opts.flat ? 1 : 2), opts.deviceW), opts.deviceH), opts.dpr);
  let motion = SEED;
  let pose = SEED;
  let anim = SEED;
  let roof = SEED;
  let tick = str(SEED, scene.map.id);
  tick = num(num(tick, scene.calendar.dayIndex), scene.calendar.minuteOfDay);
  tick = num(num(str(tick, scene.weather), scene.sediment), scene.divine);
  let ui = SEED;
  let overlay = SEED;
  let markers = false;
  let glow = false;
  let inView = 0;

  for (const it of scene.items) {
    if (it.type === 'roof') {
      roof = num(roof, it.openness);
      continue;
    }
    if (it.type !== 'entity') continue;
    // Selection and hover count wherever the figure is (rings and the target frame).
    if (it.selected || it.hovered) ui = str(flag(flag(ui, it.selected), it.hovered), it.id);
    const sx = ft.ax * it.x + ft.bx * it.y + ft.cx;
    const sy = ft.ay * it.x + ft.by * it.y + ft.cy;
    const outside = sx < minX || sx > maxX || sy < minY || sy > maxY;
    // off screen, a threat counts by the direction of its edge arrow (whole degrees)
    if (outside && wantsEdgeArrow(it)) {
      const deg = Math.round(
        (Math.atan2(sy - opts.deviceH / 2, sx - opts.deviceW / 2) * 180) / Math.PI,
      );
      overlay = word(flag(str(overlay, it.id), it.marks.boss), deg + 1000);
    }
    if (outside) continue;
    inView++;
    motion = num(num(str(motion, it.id), it.x), it.y);
    pose = str(str(pose, it.anim.anim), it.anim.dir);
    anim = num(anim, it.anim.frame);
    tick = str(str(str(str(tick, it.id), it.kind), it.relation), it.look.key);
    overlay = flag(overlay, it.showName);
    if (it.showName) overlay = str(overlay, it.name);
    overlay = str(str(overlay, it.marker ?? ''), it.glyph ?? '');
    if (it.marker) markers = true;
    // only a bar someone sees redraws the overlay (combat_marks.ts showsCastBar)
    const cast = showsCastBar(it) ? it.marks.cast : null;
    overlay = flag(overlay, !!cast);
    if (cast) overlay = num(flag(overlay, cast.interruptible), cast.progress);
    tick = flag(tick, it.marks.threat);
    if (it.look.archetype === 'goddess' || it.look.archetype === 'spirit') glow = true;
  }
  tick = word(tick, inView);

  let lightmap = word(SEED, scene.staticLights.length);
  for (const l of scene.staticLights) {
    lightmap = num(
      num(num(num(num(str(lightmap, l.id), l.x), l.y), l.radius), l.color),
      l.intensity,
    );
  }
  lightmap = word(lightmap, scene.dynamicLights.length);
  for (const l of scene.dynamicLights) {
    lightmap = num(
      num(num(num(num(str(lightmap, l.id), l.x), l.y), l.radius), l.color),
      l.intensity,
    );
  }

  const pl = scene.placement;
  ui = flag(ui, !!pl);
  if (pl) {
    ui = str(flag(ui, pl.ok), pl.label);
    ui = word(ui, pl.tiles.length);
    for (const t of pl.tiles) ui = num(num(ui, t.x), t.y);
    ui = word(ui, pl.blocked.length);
    for (const t of pl.blocked) ui = num(num(ui, t.x), t.y);
    ui = flag(ui, !!pl.entrance);
    if (pl.entrance) ui = num(num(ui, pl.entrance.x), pl.entrance.y);
  }
  const mt = scene.moveTarget;
  const pulse = !!mt && mt.ageMs < MOVE_PULSE_MS;
  ui = flag(ui, pulse);
  if (mt && pulse) ui = num(num(ui, mt.x), mt.y);

  overlay = word(overlay, scene.bubbles.length);
  for (const b of scene.bubbles) {
    overlay = num(str(str(str(overlay, b.speakerId), b.kind), b.text), b.start);
  }
  const hint = scene.exitHint;
  overlay = flag(overlay, !!hint);
  if (hint) overlay = str(num(num(overlay, hint.x), hint.y), hint.text);
  overlay = word(overlay, scene.floats.length);
  overlay = word(overlay, scene.warnings.length);
  for (const w of scene.warnings) {
    const sh = w.shape;
    overlay = num(num(flag(str(overlay, w.id), w.hostile), w.progress), w.pulse ?? 0);
    overlay = str(overlay, sh.kind);
    if (sh.kind === 'cells') {
      overlay = word(overlay, sh.cells.length);
      for (const c of sh.cells) overlay = word(overlay, c);
      continue;
    }
    overlay = num(num(overlay, sh.x), sh.y);
    if (sh.kind === 'line') overlay = num(num(num(overlay, sh.length), sh.width), sh.dir);
    else overlay = num(overlay, sh.radius);
    if (sh.kind === 'cone') overlay = num(num(overlay, sh.dir), sh.arc);
    if (sh.kind === 'ring') overlay = num(overlay, sh.inner);
  }
  const wf = scene.weatherFade;
  tick = flag(tick, !!wf);
  if (wf) {
    tick = num(str(tick, wf.from), wf.t);
    overlay = num(overlay, wf.t);
  }
  tick = flag(tick, !!scene.mood);
  if (scene.mood) tick = num(str(tick, scene.mood.kind), scene.mood.k);
  const sf = scene.switchFade;
  roof = flag(roof, !!sf);
  if (sf) roof = num(word(roof, sf.rects.length), sf.t);

  return {
    signature: {
      camera,
      motion,
      pose,
      anim,
      bob: markers ? markerBob(scene.timeMs, scale) : 0,
      roof,
      lightmap,
      tick,
      ui,
      overlay,
    },
    activity: {
      effects: { world: pulse, overlay: scene.floats.length > 0 },
      weather: ANIMATED_WEATHER.has(scene.weather),
      ambient: {
        // Water in view (ground shader or flat water frames), HD-2D film grain, and the
        // flat renderer's pulsing divine glows.
        world:
          waterInView(scene.map, ft, opts.deviceW, opts.deviceH) ||
          (!opts.flat && !!opts.grain) ||
          (opts.flat && glow),
        // Sediment and divine motes.
        overlay: scene.sediment > 0 || scene.divine > 0,
      },
    },
  };
}
