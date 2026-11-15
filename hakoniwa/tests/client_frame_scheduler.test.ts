// Frame scheduler and frame signals (docs/50_tech/release_engineering.md 6.3, RE-06):
// a still picture draws nothing, a marked frame draws at once, a moving camera and
// animating figures keep drawing, weather and floating text draw every frame, water and
// motes follow the 12 fps ambient beat, a paused screen goes to zero frames, overlay-only
// changes skip the HD-2D world pass, and the loop's input and simulation pace never depend
// on whether a frame was drawn.

import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/client/app/clock';
import { projectToScreen, type ViewRequest } from '../src/client/hd2d/view';
import type { AnimSample } from '../src/client/render/anim_state';
import { AnimTracker } from '../src/client/render/anim_state';
import { followCamera, worldToScreen } from '../src/client/render/camera';
import {
  ALL_LAYERS,
  AMBIENT_FPS,
  DecorClock,
  type FrameActivity,
  type FrameInput,
  FrameScheduler,
  type FrameSignature,
  NO_ACTIVITY,
  REDRAW_REASONS,
  SIGNATURE_PARTS,
} from '../src/client/render/frame_scheduler';
import {
  footTransform,
  frameSignals,
  MOVE_PULSE_MS,
  mapHasWater,
  type SignalOptions,
  waterTilesIn,
} from '../src/client/render/frame_signals';
import type { MarkerKind } from '../src/client/render/markers';
import { markerBob } from '../src/client/render/markers';
import { roofsForMap } from '../src/client/render/roofs';
import { buildScene, type Scene, type SceneInput } from '../src/client/render/scene';
import { lookFromAppearance } from '../src/client/sprites/look';
import { calendarAt, tickAtDay } from '../src/core/time';
import type { MapDef } from '../src/systems/world/types';

const FRAME_MS = 1000 / 60;

// ---------------------------------------------------------------------------
// Scheduler core with synthetic signatures

function sig(over: Partial<FrameSignature> = {}): FrameSignature {
  const s = {} as FrameSignature;
  for (const p of SIGNATURE_PARTS) s[p] = 1;
  return { ...s, ...over };
}

function activity(over: Partial<FrameActivity> = {}): FrameActivity {
  return { ...NO_ACTIVITY, ...over };
}

function input(nowMs: number, over: Partial<FrameInput> = {}): FrameInput {
  return { nowMs, signature: sig(), activity: NO_ACTIVITY, quiet: false, ...over };
}

/** Run `frames` frames at 60 fps from t0 and count draws; `make` builds each input. */
function run(
  s: FrameScheduler,
  frames: number,
  make: (i: number, nowMs: number) => FrameInput,
  t0 = 0,
): number {
  let draws = 0;
  for (let i = 0; i < frames; i++) {
    const now = t0 + i * FRAME_MS;
    if (s.decide(make(i, now)).draw) draws++;
  }
  return draws;
}

describe('frame scheduler: reasons and layers', () => {
  it('names the redraw reasons of release_engineering.md 6.3 plus tick and ui', () => {
    expect([...REDRAW_REASONS]).toEqual([
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
    ]);
    expect(AMBIENT_FPS).toBe(12);
  });

  it('draws every layer on the first frame', () => {
    const s = new FrameScheduler();
    const d = s.decide(input(0));
    expect(d.draw).toBe(true);
    expect(d.layers).toEqual(ALL_LAYERS);
  });
});

describe('frame scheduler: on-demand redraw', () => {
  it('draws nothing while the picture stays still (unpaused, ten seconds)', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    expect(run(s, 600, (_, now) => input(now), FRAME_MS)).toBe(0);
    expect(s.stats.frames).toBe(601);
    expect(s.stats.draws).toBe(1);
  });

  it('draws the very next frame after a one-shot mark, once', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    s.invalidate('resize');
    const d = s.decide(input(FRAME_MS));
    expect(d.draw).toBe(true);
    expect(d.reasons).toEqual(['resize']);
    expect(d.layers).toEqual(ALL_LAYERS);
    expect(s.decide(input(2 * FRAME_MS)).draw).toBe(false);
  });

  it('merges several marks into one frame and keeps each reason', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    s.invalidate('map');
    s.invalidate('quality');
    s.invalidate('map');
    const d = s.decide(input(FRAME_MS));
    expect(d.reasons).toEqual(['quality', 'map']);
    expect(s.decide(input(2 * FRAME_MS)).draw).toBe(false);
  });

  it('draws every frame while the camera moves and stops when it settles', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const moving = run(s, 60, (i, now) => input(now, { signature: sig({ camera: 100 + i }) }));
    expect(moving).toBe(60);
    const settled = run(s, 60, (_, now) => input(now, { signature: sig({ camera: 159 }) }), 1000);
    expect(settled).toBe(0);
  });

  it('keeps drawing while a figure in view animates, only on frames it changes', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    // A frame change every third display frame.
    const draws = run(s, 60, (i, now) =>
      input(now, { signature: sig({ anim: 1 + Math.floor((i + 1) / 3) }) }),
    );
    expect(draws).toBe(20);
  });

  it('maps parts to layers: overlay content skips the world pass, roofs and lights skip the overlay', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const overlay = s.decide(input(1, { signature: sig({ overlay: 2 }) }));
    expect(overlay.layers).toEqual({ world: false, overlay: true });
    expect(overlay.reasons).toEqual(['overlay']);
    const roof = s.decide(input(2, { signature: sig({ overlay: 2, roof: 2 }) }));
    expect(roof.layers).toEqual({ world: true, overlay: false });
    const light = s.decide(input(3, { signature: sig({ overlay: 2, roof: 2, lightmap: 2 }) }));
    expect(light.layers).toEqual({ world: true, overlay: false });
    const bob = s.decide(
      input(4, { signature: sig({ overlay: 2, roof: 2, lightmap: 2, bob: 3 }) }),
    );
    expect(bob.layers).toEqual({ world: false, overlay: true });
    expect(bob.reasons).toEqual(['anim']);
    const tick = s.decide(
      input(5, { signature: sig({ overlay: 2, roof: 2, lightmap: 2, bob: 3, tick: 9 }) }),
    );
    expect(tick.layers).toEqual(ALL_LAYERS);
    expect(tick.reasons).toEqual(['tick']);
  });

  it('draws screen weather every frame on the overlay only', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const rain = activity({ weather: true });
    const draws = run(s, 60, (_, now) => input(now, { activity: rain }), FRAME_MS);
    expect(draws).toBe(60);
    // Only the first frame drew the world.
    expect(s.stats.worldDraws).toBe(1);
    expect(s.stats.overlayDraws).toBe(61);
  });

  it('advances water and motes on the ambient beat (about 12 fps)', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const water = activity({ ambient: { world: true, overlay: false } });
    const draws = run(s, 120, (_, now) => input(now, { activity: water }), FRAME_MS);
    expect(draws).toBeGreaterThanOrEqual(23);
    expect(draws).toBeLessThanOrEqual(24);
    const d = s.decide(input(3000, { activity: water }));
    expect(d.reasons).toEqual(['ambient']);
    expect(d.layers).toEqual({ world: true, overlay: false });
  });

  it('plays short effects to the end every frame, then draws once more to clear them', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const floats = activity({ effects: { world: false, overlay: true } });
    let n = 0;
    for (let i = 1; i <= 30; i++) {
      // Floating text for 20 frames; its count is part of the overlay key.
      const on = i <= 20;
      const d = s.decide(
        input(i * FRAME_MS, {
          signature: sig({ overlay: on ? 2 : 1 }),
          activity: on ? floats : NO_ACTIVITY,
        }),
      );
      if (d.draw) n++;
    }
    expect(n).toBe(21);
  });

  it('draws every frame when asked to behave like the old loop', () => {
    const s = new FrameScheduler();
    s.alwaysDraw = true;
    expect(run(s, 30, (_, now) => input(now))).toBe(30);
  });
});

describe('frame scheduler: pause and covered screens', () => {
  it('draws no frame while paused, whatever idle animation, bob, weather or water do', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const busy = activity({ weather: true, ambient: { world: true, overlay: true } });
    const draws = run(
      s,
      600,
      (i, now) =>
        input(now, {
          quiet: true,
          activity: busy,
          signature: sig({ anim: 1 + Math.floor(i / 13), bob: i % 7 }),
        }),
      FRAME_MS,
    );
    expect(draws).toBe(0);
  });

  it('still draws at once for a camera turn or a selection while paused', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    expect(s.decide(input(1, { quiet: true, signature: sig({ camera: 2 }) })).draw).toBe(true);
    expect(s.decide(input(2, { quiet: true, signature: sig({ camera: 2, ui: 5 }) })).draw).toBe(
      true,
    );
    s.invalidate('resize');
    expect(s.decide(input(3, { quiet: true, signature: sig({ camera: 2, ui: 5 }) })).draw).toBe(
      true,
    );
  });

  it('catches up on idle animation the frame the pause ends', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    expect(s.decide(input(1, { quiet: true, signature: sig({ anim: 7 }) })).draw).toBe(false);
    const d = s.decide(input(2, { quiet: false, signature: sig({ anim: 7 }) }));
    expect(d.draw).toBe(true);
    expect(d.reasons).toEqual(['anim']);
  });

  it('still catches up when overlay-only frames were drawn during the pause', () => {
    // Floating text keeps the overlay drawing while paused; the standee's frame moved on
    // underneath. Those overlay frames must not count the world's frame as drawn.
    const s = new FrameScheduler();
    s.decide(input(0));
    const floats = activity({ effects: { world: false, overlay: true } });
    const paused = s.decide(
      input(1, { quiet: true, activity: floats, signature: sig({ anim: 5 }) }),
    );
    expect(paused.layers).toEqual({ world: false, overlay: true });
    const resumed = s.decide(input(2, { quiet: false, signature: sig({ anim: 5 }) }));
    expect(resumed.draw).toBe(true);
    expect(resumed.layers.world).toBe(true);
    expect(s.decide(input(3, { quiet: false, signature: sig({ anim: 5 }) })).draw).toBe(false);
  });

  it('draws a figure starting another animation at once, even while quiet', () => {
    const s = new FrameScheduler();
    s.decide(input(0));
    const d = s.decide(input(1, { quiet: true, signature: sig({ pose: 2 }) }));
    expect(d.draw).toBe(true);
    expect(d.reasons).toEqual(['anim']);
    expect(d.layers).toEqual(ALL_LAYERS);
  });

  it('holds decoration time while quiet and resumes without a jump', () => {
    const c = new DecorClock();
    expect(c.advance(5000, false)).toBe(0);
    expect(c.advance(5100, false)).toBe(100);
    expect(c.advance(5200, true)).toBe(100);
    expect(c.advance(9200, true)).toBe(100);
    expect(c.advance(9250, false)).toBe(150);
  });
});

describe('frame scheduler: input and simulation keep their pace', () => {
  it('ticks the simulation every frame whether or not the frame is drawn', () => {
    const clock = new FixedStepClock();
    const s = new FrameScheduler();
    let steps = 0;
    let draws = 0;
    for (let i = 0; i < 60; i++) {
      steps += clock.advance(FRAME_MS).steps;
      if (s.decide(input(i * FRAME_MS)).draw) draws++;
    }
    expect(steps).toBe(20);
    expect(draws).toBe(1);
  });

  it('draws a moved figure in the same frame the tick moves it (no added latency)', () => {
    const clock = new FixedStepClock();
    const s = new FrameScheduler();
    let x = 0;
    let pressedAt = -1;
    let shownAt = -1;
    for (let i = 0; i < 30; i++) {
      // A key goes down at frame 5; the next tick moves the figure.
      if (i === 5) pressedAt = i;
      const { steps } = clock.advance(FRAME_MS);
      if (steps > 0 && pressedAt >= 0) x += steps;
      const d = s.decide(input(i * FRAME_MS, { signature: sig({ motion: 1000 + x }) }));
      if (x > 0 && shownAt < 0) {
        expect(d.draw).toBe(true);
        shownAt = i;
      }
    }
    // The tick lands within one tick (3 frames at 60 fps) of the key; drawing adds nothing.
    expect(shownAt).toBeGreaterThanOrEqual(pressedAt);
    expect(shownAt - pressedAt).toBeLessThanOrEqual(3);
  });
});

// ---------------------------------------------------------------------------
// Frame signals from real scenes

const MAP: MapDef = {
  id: 'm',
  name: '测试',
  region: 'test',
  width: 40,
  height: 30,
  rows: Array.from({ length: 30 }, (_, y) =>
    y === 0 || y === 29 ? '#'.repeat(40) : `#${'.'.repeat(38)}#`,
  ),
  legend: { '#': 'wall', '.': 'grass', '~': 'water' },
  locations: [{ id: 'hut', name: '小屋', kind: 'home', x: 4, y: 4, w: 3, h: 3 }],
  spawns: [],
  exits: [],
};

// A pond next to the focus, and one in the far corner of the map, out of view.
const WET: MapDef = {
  ...MAP,
  id: 'wet',
  rows: MAP.rows.map((r, y) => (y === 16 ? `#${'.'.repeat(18)}~~~${'.'.repeat(17)}#` : r)),
};
const FAR_WET: MapDef = {
  ...MAP,
  id: 'far_wet',
  rows: MAP.rows.map((r, y) => (y === 1 ? `#~~${'.'.repeat(36)}#` : r)),
};

const LOOK = lookFromAppearance({ base: 'human', colors: [] });
const IDLE: AnimSample = { anim: 'idle', dir: 'down', frame: 0 };

interface Fig {
  id: string;
  x: number;
  y: number;
  anim?: AnimSample;
  marker?: MarkerKind | null;
}

function ent(f: Fig): SceneInput['entities'][number] {
  return {
    entity: {
      id: f.id,
      kind: 'npc',
      name: f.id,
      mapId: MAP.id,
      x: f.x,
      y: f.y,
      facing: 0,
      speed: 1,
      radius: 0.3,
      faction: 't',
      appearance: { base: 'human', colors: [] },
      tags: [],
      alive: true,
    },
    x: f.x,
    y: f.y,
    look: LOOK,
    anim: f.anim ?? IDLE,
    marker: f.marker ?? null,
  };
}

const VIEW: ViewRequest = { focusX: 20, focusY: 15, step: 2, pitch: 36, yaw: 0 };
const HD: SignalOptions = { flat: false, deviceW: 800, deviceH: 600, dpr: 1 };
const FLAT: SignalOptions = { ...HD, flat: true };

function scene(over: Partial<SceneInput> & { figs?: Fig[]; openness?: number } = {}): Scene {
  const { figs, openness, ...rest } = over;
  return buildScene({
    map: MAP,
    view: VIEW,
    timeMs: 0,
    playerId: 'player',
    calendar: calendarAt(tickAtDay(0, 12)),
    weather: 'clear',
    entities: (figs ?? [{ id: 'a', x: 20, y: 15 }]).map(ent),
    standees: [],
    roofs: roofsForMap(MAP),
    roofOpenness: () => openness ?? 0,
    selection: null,
    hover: null,
    bubbles: [],
    ...rest,
  });
}

function changed(a: Scene, b: Scene, opts = HD): string[] {
  const x = frameSignals(a, opts).signature;
  const y = frameSignals(b, opts).signature;
  return SIGNATURE_PARTS.filter((p) => x[p] !== y[p]);
}

describe('frame signals: change signature', () => {
  it('is stable for the same scene and ignores time when nothing animates by time', () => {
    expect(changed(scene(), scene())).toEqual([]);
    expect(changed(scene(), scene({ timeMs: 12345 }))).toEqual([]);
  });

  it('puts each kind of change into its own part', () => {
    const base = scene();
    expect(changed(base, scene({ view: { ...VIEW, focusX: 20.5 } }))).toEqual(['camera']);
    expect(changed(base, scene({ view: { ...VIEW, yaw: 45 } }))).toEqual(['camera']);
    expect(changed(base, scene({ figs: [{ id: 'a', x: 20.25, y: 15 }] }))).toEqual(['motion']);
    expect(
      changed(base, scene({ figs: [{ id: 'a', x: 20, y: 15, anim: { ...IDLE, frame: 1 } }] })),
    ).toEqual(['anim']);
    expect(
      changed(base, scene({ figs: [{ id: 'a', x: 20, y: 15, anim: { ...IDLE, anim: 'death' } }] })),
    ).toEqual(['pose']);
    expect(
      changed(base, scene({ figs: [{ id: 'a', x: 20, y: 15, anim: { ...IDLE, dir: 'left' } }] })),
    ).toEqual(['pose']);
    expect(changed(base, scene({ openness: 0.5 }))).toEqual(['roof']);
    expect(changed(base, scene({ calendar: calendarAt(tickAtDay(0, 12, 1)) }))).toEqual(['tick']);
    expect(changed(base, scene({ weather: 'rain' }))).toEqual(['tick']);
    // An NPC's name already shows, so selecting it changes only the rings and the target.
    expect(changed(base, scene({ selection: 'a' }))).toEqual(['ui']);
    expect(changed(base, scene({ hover: 'a' }))).toEqual(['ui']);
    expect(
      changed(
        base,
        scene({ bubbles: [{ speakerId: 'a', text: '你好。', kind: 'say', start: 0, until: 9e9 }] }),
      ),
    ).toEqual(['overlay']);
    expect(changed(base, scene({ exitHint: { x: 3, y: 3, text: '东门' } }))).toEqual(['overlay']);
    expect(
      changed(
        base,
        scene({
          floats: [
            { entityId: 'a', text: '12', kind: 'damage', rise: 6, dx: 0, alpha: 1, scale: 1 },
          ],
        }),
      ),
    ).toEqual(['overlay']);
    expect(changed(base, scene({ moveTarget: { x: 22, y: 15, ageMs: 10 } }))).toEqual(['ui']);
    expect(
      changed(
        base,
        scene({
          placement: { ok: true, tiles: [{ x: 9, y: 9 }], blocked: [], entrance: null, label: 'x' },
        }),
      ),
    ).toEqual(['ui']);
    expect(
      changed(
        base,
        scene({
          staticLights: [
            {
              id: 'lamp',
              x: 10,
              y: 10,
              h: 2,
              radius: 3,
              color: 0xffc878,
              intensity: 1,
              night: false,
            },
          ],
        }),
      ),
    ).toEqual(['lightmap']);
  });

  it('bobs overhead markers by time only while a marker is in view', () => {
    const marked = (t: number) =>
      scene({ timeMs: t, figs: [{ id: 'a', x: 20, y: 15, marker: 'quest' }] });
    expect(changed(marked(0), marked(470))).toEqual(['bob']);
    // The bob follows the overlay's whole-pixel formula.
    expect(frameSignals(marked(470), HD).signature.bob).toBe(markerBob(470, VIEW.step));
    expect(markerBob(470, 2)).toBe(Math.round(Math.sin(470 / 300) * 2));
    expect(markerBob(470, 0.5)).toBe(Math.round(Math.sin(470 / 300)));
    // Marker far out of view: no bob.
    const far = (t: number) =>
      scene({
        timeMs: t,
        view: { ...VIEW, focusX: 2000, focusY: 2000 },
        figs: [{ id: 'a', x: 20, y: 15, marker: 'quest' }],
      });
    expect(changed(far(0), far(470))).toEqual([]);
  });

  it('ignores figures far outside the view, and notices one walking in', () => {
    const near = { id: 'a', x: 20, y: 15 };
    const crowd = (x: number, frame: number) =>
      scene({ figs: [near, { id: 'far', x, y: 15, anim: { anim: 'walk', dir: 'right', frame } }] });
    // A wide map: the far figure walks and animates out of view.
    const wide: MapDef = { ...MAP, width: 400, rows: MAP.rows.map((r) => r.padEnd(400, '.')) };
    const wideScene = (x: number, frame: number) => ({ ...crowd(x, frame), map: wide });
    expect(changed(wideScene(300, 0), wideScene(301, 1))).toEqual([]);
    expect(changed(wideScene(300, 0), wideScene(30, 1))).toEqual([
      'motion',
      'pose',
      'anim',
      'tick',
      'overlay',
    ]);
  });

  it('projects feet like the renderers do (HD-2D oblique and the flat follow camera)', () => {
    const s = scene({ view: { ...VIEW, yaw: 30, pitch: 50, step: 3 } });
    const t = footTransform(s, HD);
    const p = projectToScreen(s.view, { w: HD.deviceW, h: HD.deviceH }, 23, 0, 11);
    expect(t.ax * 23 + t.bx * 11 + t.cx).toBeCloseTo(p.x, 6);
    expect(t.ay * 23 + t.by * 11 + t.cy).toBeCloseTo(p.y, 6);
    const f = footTransform(s, FLAT);
    const at = followCamera(
      { x: s.view.focusX, y: s.view.focusY },
      MAP.width,
      MAP.height,
      800,
      600,
      3,
    );
    const q = worldToScreen({ zoom: 3, x: at.x, y: at.y, viewW: 800, viewH: 600 }, 23, 11);
    expect(f.ax * 23 + f.bx * 11 + f.cx).toBeCloseTo(q.sx, 6);
    expect(f.ay * 23 + f.by * 11 + f.cy).toBeCloseTo(q.sy, 6);
  });
});

describe('frame signals: coverage guard', () => {
  it('covers every field a renderer draws (update frameSignals when this list grows)', () => {
    const s = scene({ figs: [{ id: 'a', x: 20, y: 15 }] });
    // A new Scene or SceneEntity field drawn by a renderer must be folded into
    // frameSignals, or a frame showing only that change would never be drawn.
    expect(Object.keys(s).sort()).toEqual(
      [
        'bubbles',
        'calendar',
        'divine',
        'dynamicLights',
        'exitHint',
        'floats',
        'items',
        'lighting',
        'map',
        'moveTarget',
        'placement',
        'sediment',
        'staticLights',
        'timeMs',
        'view',
        'weather',
      ].sort(),
    );
    const e = s.items.find((i) => i.type === 'entity');
    expect(Object.keys(e ?? {}).sort()).toEqual(
      [
        'anim',
        'glyph',
        'hovered',
        'id',
        'kind',
        'look',
        'marker',
        'name',
        'relation',
        'selected',
        'showName',
        'sortY',
        'type',
        'x',
        'y',
      ].sort(),
    );
  });
});

describe('frame signals: time-driven activity', () => {
  it('reports weather, effects in flight, water and motes', () => {
    expect(frameSignals(scene(), HD).activity).toEqual({
      effects: { world: false, overlay: false },
      weather: false,
      ambient: { world: false, overlay: false },
    });
    expect(frameSignals(scene({ weather: 'rain' }), HD).activity.weather).toBe(true);
    expect(frameSignals(scene({ weather: 'fog' }), HD).activity.weather).toBe(true);
    expect(frameSignals(scene({ weather: 'cloudy' }), HD).activity.weather).toBe(false);
    const pulse = (age: number) =>
      frameSignals(scene({ moveTarget: { x: 1, y: 1, ageMs: age } }), HD).activity.effects.world;
    expect(pulse(MOVE_PULSE_MS - 1)).toBe(true);
    expect(pulse(MOVE_PULSE_MS)).toBe(false);
    const floats = scene({
      floats: [{ entityId: 'a', text: '12', kind: 'damage', rise: 6, dx: 0, alpha: 1, scale: 1 }],
    });
    expect(frameSignals(floats, HD).activity.effects.overlay).toBe(true);
    expect(mapHasWater(MAP)).toBe(false);
    expect(mapHasWater(WET)).toBe(true);
    expect(frameSignals(scene({ map: WET }), HD).activity.ambient.world).toBe(true);
    expect(frameSignals(scene({ map: WET }), FLAT).activity.ambient.world).toBe(true);
    const ruins: MapDef = { ...MAP, id: 'ruins', sediment: 3 };
    expect(frameSignals(scene({ map: ruins }), HD).activity.ambient.overlay).toBe(true);
  });

  it('counts water only when it shows on screen', () => {
    expect(mapHasWater(FAR_WET)).toBe(true);
    expect(waterTilesIn(FAR_WET, 0, 0, 40, 30)).toBe(2);
    expect(waterTilesIn(FAR_WET, 3, 0, 40, 30)).toBe(0);
    expect(waterTilesIn(WET, 19, 16, 20, 17)).toBe(1);
    // Far pond out of view: no ambient beat; pan to it and the beat starts.
    expect(frameSignals(scene({ map: FAR_WET }), HD).activity.ambient.world).toBe(false);
    expect(frameSignals(scene({ map: FAR_WET }), FLAT).activity.ambient.world).toBe(false);
    const there = { ...VIEW, focusX: 4, focusY: 3 };
    expect(frameSignals(scene({ map: FAR_WET, view: there }), HD).activity.ambient.world).toBe(
      true,
    );
    expect(frameSignals(scene({ map: FAR_WET, view: there }), FLAT).activity.ambient.world).toBe(
      true,
    );
  });

  it('keeps HD-2D film grain on the ambient beat (the flat renderer has none)', () => {
    expect(frameSignals(scene(), { ...HD, grain: true }).activity.ambient.world).toBe(true);
    expect(frameSignals(scene(), { ...FLAT, grain: true }).activity.ambient.world).toBe(false);
  });

  it('clears the click-to-move pulse with one more frame when it ends', () => {
    const at = (age: number) => scene({ moveTarget: { x: 22, y: 15, ageMs: age } });
    expect(changed(at(MOVE_PULSE_MS - 1), at(MOVE_PULSE_MS))).toEqual(['ui']);
    expect(changed(at(MOVE_PULSE_MS), at(MOVE_PULSE_MS + 500))).toEqual([]);
  });
});

describe('frame scheduler with real scenes', () => {
  /** Drive the scheduler like the session: build, signal, decide; count draws. */
  function loop(
    frames: number,
    build: (nowMs: number, i: number) => Scene,
    opts: { quiet?: boolean; flat?: boolean } = {},
  ): { draws: number; world: number; overlay: number } {
    const s = new FrameScheduler();
    const o = opts.flat ? FLAT : HD;
    let draws = 0;
    for (let i = 0; i < frames; i++) {
      const now = 1000 + i * FRAME_MS;
      const sc = build(now, i);
      const { signature, activity } = frameSignals(sc, o);
      if (s.decide({ nowMs: now, signature, activity, quiet: !!opts.quiet }).draw) draws++;
    }
    return { draws, world: s.stats.worldDraws, overlay: s.stats.overlayDraws };
  }

  it('a still screen with no idle figures draws once and then never again', () => {
    expect(loop(600, () => scene({ figs: [] })).draws).toBe(1);
  });

  it('idle breathing redraws only when a frame changes (220 ms frames: under 5 fps per figure)', () => {
    const anim = new AnimTracker();
    const r = loop(300, (now) => {
      const a = anim.sample({ id: 'a', alive: true, facing: 0, moving: false, travelled: 0 }, now);
      return scene({ figs: [{ id: 'a', x: 20, y: 15, anim: a }] });
    });
    // Five seconds: one first frame plus about 4.5 frame changes a second.
    expect(r.draws).toBeGreaterThanOrEqual(22);
    expect(r.draws).toBeLessThanOrEqual(25);
  });

  it('a paused screen in the rain, by water, with a breathing quest giver draws no frame', () => {
    const anim = new AnimTracker();
    const r = loop(
      600,
      (now) => {
        const a = anim.sample(
          { id: 'a', alive: true, facing: 0, moving: false, travelled: 0 },
          now,
        );
        return scene({
          map: WET,
          timeMs: now,
          weather: 'rain',
          figs: [{ id: 'a', x: 20, y: 15, anim: a, marker: 'quest' }],
        });
      },
      { quiet: true },
    );
    expect(r.draws).toBe(1);
  });

  it('rain redraws only the overlay; a turning camera redraws both layers', () => {
    const rain = loop(60, (now) => scene({ timeMs: now, weather: 'rain', figs: [] }));
    expect(rain.draws).toBe(60);
    expect(rain.world).toBe(1);
    const turning = loop(60, (_, i) => scene({ view: { ...VIEW, yaw: i }, figs: [] }));
    expect(turning.world).toBe(60);
    expect(turning.overlay).toBe(60);
  });
});
