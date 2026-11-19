// PK-M1-24, the scene and world side: the stage directives (camera, light, weather, court
// mirror, motion) recorded by the story layer and turned into the world picture; switch tiles
// read from the live map and faded on screen; the local sediment haze easing over two
// seconds; a gate with several ways out asking where to go; and the combat adapter's world
// marks (threat, boss, cast, ground warnings of area casts).

import { describe, expect, it } from 'vitest';
import { worldMarks } from '../src/client/adapters/combat';
import { ZOOM_STEPS } from '../src/client/hd2d/view';
import {
  gateAction,
  gateExits,
  gatePrompt,
  moveCursor,
  optionByNumber,
} from '../src/client/hud/exit_choice_model';
import {
  emptyStage,
  enterNode,
  MIRROR_MAX_S,
  type StageCamera,
} from '../src/client/hud/story/stage';
import { SEDIMENT_FADE_MS, SedimentFader } from '../src/client/render/sediment_fade';
import {
  ANGLE_PITCH,
  atMinute,
  clockLerp,
  LIGHT_MINUTES,
  mirrorShown,
  motionSample,
  presetWeather,
  resolveStageRef,
  SHOT_TILES,
  STAGE_FADE_MS,
  StageDirector,
  shotView,
  stepIndexForTiles,
} from '../src/client/render/stage_direct';
import { liveMapOf, SWITCH_FADE_MS, SwitchFader } from '../src/client/render/switch_fade';
import type { GameView } from '../src/client/view/game_view';
import { buildContent } from '../src/content';
import { calendarAt, tickAtDay } from '../src/core/time';
import {
  STAGE_CAMERA_ANGLES,
  STAGE_CAMERA_MOVES,
  STAGE_LIGHT_PRESETS,
  STAGE_MOTIONS,
  STAGE_SHOT_SIZES,
  STAGE_WEATHER_PRESETS,
  type StageDirective,
} from '../src/systems/scenes/types';
import type { MapDef } from '../src/systems/world/types';

const MAP: MapDef = {
  id: 'gatehouse',
  name: 'gatehouse',
  region: 'edgestone_area',
  width: 12,
  height: 10,
  rows: Array.from({ length: 10 }, () => '............'),
  legend: { '.': 'grass' },
  locations: [{ id: 'plaza', name: 'plaza', kind: 'field', x: 2, y: 2, w: 4, h: 2 }],
  spawns: [],
  exits: [
    { id: 'to_field', x: 6, y: 9, toMap: 'field', toX: 1, toY: 1, label: 'outside' },
    { id: 'to_region', x: 6, y: 9, toMap: 'region', toX: 0, toY: 0, label: 'travel' },
    {
      id: 'to_wall',
      x: 7,
      y: 9,
      toMap: 'wall',
      toX: 0,
      toY: 0,
      label: 'wall',
      requiresFlags: ['wall_open'],
    },
    { id: 'west', x: 0, y: 4, toMap: 'west', toX: 0, toY: 0, label: 'west' },
  ],
  switches: [
    { id: 'gate', x: 3, y: 5, w: 2, h: 1, closedTile: 'wall', openWhen: 'gate_open' },
    { id: 'reeds', x: 8, y: 1, w: 1, h: 3, closedTile: 'water', openWhen: 'reeds_cut' },
  ],
};

const cam = (c: Partial<StageCamera>): StageCamera => ({ op: 'camera', start: 0, ...c });

describe('the stage records the world directives', () => {
  it('keeps camera, light, weather, mirror and motions with their entry time', () => {
    const { state } = enterNode(
      emptyStage(),
      [
        { op: 'camera', angle: 'low', size: 'near', focus: 'janu' },
        { op: 'light', preset: 'dusk' },
        { op: 'weather', preset: 'rain' },
        { op: 'mirror', map: 'divine_court', seconds: 90 },
        { op: 'motion', who: 'janu', action: 'nod' },
        { op: 'motion', who: 'janu', action: 'kneel' },
      ],
      1000,
      false,
    );
    expect(state.camera).toMatchObject({ angle: 'low', size: 'near', focus: 'janu', start: 1000 });
    expect(state.light).toEqual({ preset: 'dusk', start: 1000 });
    expect(state.weather).toEqual({ preset: 'rain', start: 1000 });
    // the mirror is capped at twenty seconds
    expect(state.mirror).toEqual({
      map: 'divine_court',
      start: 1000,
      until: 1000 + MIRROR_MAX_S * 1000,
    });
    expect(state.motions).toEqual([{ who: 'janu', action: 'kneel', start: 1000 }]);
    const next = enterNode(state, [{ op: 'camera_end' }, { op: 'mirror_end' }], 2000, false).state;
    expect(next.camera).toBeNull();
    expect(next.mirror).toBeNull();
    // the light and the motions carry on to the next node
    expect(next.light).toEqual(state.light);
    expect(next.motions).toEqual(state.motions);
    // an expired mirror is dropped on the next node
    expect(enterNode(state, [], 1000 + 21000, false).state.mirror).toBeNull();
  });
});

describe('a shot of the stage camera (catalog_cutscenes.md 2.3)', () => {
  const at = { x: 10, y: 8 };

  it('takes the angle pitch and frames the shot size in whole zoom steps', () => {
    for (const angle of ['standard', 'low', 'high', 'top'] as const) {
      const v = shotView(cam({ angle, size: 'mid' }), 0, at, null, null, 1080);
      expect(v.pitch).toBe(ANGLE_PITCH[angle]);
      expect(ZOOM_STEPS).toContain(v.step);
      expect(v.yaw).toBe(0);
    }
    const far = shotView(cam({ size: 'far' }), 0, at, null, null, 1080);
    const near = shotView(cam({ size: 'near' }), 0, at, null, null, 1080);
    expect(near.step).toBeGreaterThan(far.step);
    expect(stepIndexForTiles(SHOT_TILES.mid, 1080, 40)).toBeGreaterThan(
      stepIndexForTiles(SHOT_TILES.full, 1080, 40),
    );
  });

  it('pushes in, rises and pans over its seconds; a side shot turns at most 20 degrees', () => {
    const push = cam({ size: 'full', move: 'push', seconds: 2 });
    expect(shotView(push, 2000, at, null, null, 1080).step).toBeGreaterThan(
      shotView(push, 0, at, null, null, 1080).step,
    );
    const rise = cam({ angle: 'standard', move: 'rise', seconds: 1 });
    expect(shotView(rise, 1000, at, null, null, 1080).pitch).toBe(ANGLE_PITCH.high);
    const pan = cam({ move: 'pan', seconds: 2 });
    const mid = shotView(pan, 1000, at, null, { x: 20, y: 8 }, 1080);
    expect(mid.focusX).toBeCloseTo(15);
    expect(shotView(pan, 2000, at, null, { x: 20, y: 8 }, 1080).focusX).toBeCloseTo(20);
    expect(shotView(cam({ angle: 'side', yaw: 70 }), 0, at, null, null, 1080).yaw).toBe(20);
    // unknown words fall back to the standard angle and the mid shot
    const odd = shotView(
      cam({ angle: 'tilted' as never, size: 'huge' as never }),
      0,
      at,
      null,
      null,
      1080,
    );
    expect(odd.pitch).toBe(ANGLE_PITCH.standard);
    expect(odd.step).toBe(shotView(cam({}), 0, at, null, null, 1080).step);
    expect(shotView(cam({ angle: 'side', yaw: -70 }), 0, at, null, null, 1080).yaw).toBe(340);
    // tracking follows the live focus, a held shot keeps its anchor
    expect(shotView(cam({ move: 'track' }), 0, at, { x: 3, y: 3 }, null, 1080).focusX).toBe(3);
    expect(shotView(cam({ move: 'hold' }), 0, at, { x: 3, y: 3 }, null, 1080).focusX).toBe(10);
  });

  it('finds the player, an entity by id or ref, a location, or tiles', () => {
    const ctx = {
      playerId: 'p',
      entities: [
        { id: 'p', x: 1, y: 2 },
        { id: 'npc#4', ref: 'janu', x: 7, y: 3 },
      ],
      map: MAP,
    };
    expect(resolveStageRef(undefined, ctx)).toEqual({ x: 1, y: 2, id: 'p' });
    expect(resolveStageRef('janu', ctx)).toEqual({ x: 7, y: 3, id: 'npc#4' });
    expect(resolveStageRef('plaza', ctx)).toEqual({ x: 4, y: 3 });
    expect(resolveStageRef('5.5, 6', ctx)).toEqual({ x: 5.5, y: 6 });
    expect(resolveStageRef('99,99', ctx)).toEqual({ x: 12, y: 10 });
    expect(resolveStageRef('nobody', ctx)).toBeNull();
  });

  it('anchors a held shot once and hands the camera back when the shot ends', () => {
    const d = new StageDirector();
    let janu = { x: 7, y: 3 };
    const resolve = (r: string | undefined) => (r === 'janu' ? janu : { x: 0, y: 0 });
    const c = cam({ focus: 'janu', start: 0 });
    expect(d.view(c, 0, resolve, 1080)?.focusX).toBe(7);
    janu = { x: 9, y: 3 };
    expect(d.view(c, 100, resolve, 1080)?.focusX).toBe(7);
    expect(d.view(null, 200, resolve, 1080)).toBeNull();
    // a focus that is not on the map yet borrows the player, then takes over once it appears
    let late: { x: number; y: number } | null = null;
    const r2 = (r: string | undefined) => (r === 'late' ? late : { x: 1, y: 1 });
    const c2 = cam({ focus: 'late', start: 300 });
    expect(d.view(c2, 300, r2, 1080)?.focusX).toBe(1);
    late = { x: 9, y: 9 };
    expect(d.view(c2, 350, r2, 1080)?.focusX).toBe(9);
    late = { x: 4, y: 4 };
    expect(d.view(c2, 400, r2, 1080)?.focusX).toBe(9);
  });
});

describe('light, mood and weather of the stage', () => {
  const noon = calendarAt(tickAtDay(0, 12));

  it('fades a time preset in over a second from what was on screen, and back', () => {
    const d = new StageDirector();
    expect(d.calendar(noon, null, 0)).toBe(noon);
    const night = { preset: 'night' as const, start: 1000 };
    expect(d.calendar(noon, night, 1000).minuteOfDay).toBeCloseTo(720);
    expect(d.calendar(noon, night, 1500).minuteOfDay).toBeCloseTo(clockLerp(720, 1320, 0.5));
    expect(d.calendar(noon, night, 2000).minuteOfDay).toBe(LIGHT_MINUTES.night);
    // the scene ends: back to the world's clock over a second
    expect(d.calendar(noon, null, 3000).minuteOfDay).toBe(1320);
    expect(d.calendar(noon, null, 3000 + STAGE_FADE_MS)).toBe(noon);
  });

  it('goes the short way around midnight and keeps the clock fields consistent', () => {
    expect(clockLerp(1380, 60, 0.5)).toBeCloseTo(0);
    expect(clockLerp(60, 1380, 0.5)).toBeCloseTo(0);
    const c = atMinute(noon, 125.5);
    expect([c.hour, c.minute, c.dayIndex]).toEqual([2, 5, noon.dayIndex]);
  });

  it('ramps a colour mood in, keeps it across nodes, and fades it out or over', () => {
    const d = new StageDirector();
    const dream = { preset: 'dream' as const, start: 0 };
    expect(d.mood(dream, null, 0)).toBeNull();
    expect(d.mood(dream, null, 500)).toEqual({ kind: 'dream', k: 0.5 });
    expect(d.mood(dream, null, 1000)).toEqual({ kind: 'dream', k: 1 });
    // a later node naming the same mood does not restart it
    expect(d.mood({ preset: 'dream', start: 5000 }, null, 5000)).toEqual({ kind: 'dream', k: 1 });
    // the scene ends: it fades out instead of snapping off
    expect(d.mood(null, null, 6000)?.kind).toBe('dream');
    expect(d.mood(null, null, 6250)?.k).toBeCloseTo(0.5);
    expect(d.mood(null, null, 7000)).toBeNull();
    // one mood over another: the old leaves over the first half, the new comes in after
    const e = new StageDirector();
    e.mood({ preset: 'door', start: 0 }, null, 0);
    e.mood({ preset: 'door', start: 0 }, null, 1000);
    expect(e.mood({ preset: 'divine', start: 2000 }, null, 2000)).toEqual({ kind: 'door', k: 1 });
    expect(e.mood({ preset: 'divine', start: 2000 }, null, 2250)?.kind).toBe('door');
    expect(e.mood({ preset: 'divine', start: 2000 }, null, 2750)).toEqual({
      kind: 'divine',
      k: 0.5,
    });
    // a time preset carries no mood; the ash storm brings its own
    expect(new StageDirector().mood({ preset: 'dusk', start: 0 }, null, 500)).toBeNull();
    const a = new StageDirector();
    a.mood(null, { preset: 'ashstorm', start: 0 }, 0);
    expect(a.mood(null, { preset: 'ashstorm', start: 0 }, 2000)).toEqual({
      kind: 'ashstorm',
      k: 1,
    });
    expect(presetWeather('ashstorm', 'clear')).toBe('ashfall');
    expect(presetWeather('world', 'snow')).toBe('snow');
    // a word outside the vocabulary keeps the picture
    expect(presetWeather('hail' as never, 'snow')).toBe('snow');
    expect(STAGE_LIGHT_PRESETS.filter((p) => LIGHT_MINUTES[p] !== undefined)).toHaveLength(5);
  });

  it('cross-fades the weather over a second, also back to the world', () => {
    const d = new StageDirector();
    expect(d.weather('clear', null, 0)).toEqual({ weather: 'clear', fade: null });
    const rain = { preset: 'rain' as const, start: 100 };
    expect(d.weather('clear', rain, 100)).toEqual({
      weather: 'rain',
      fade: { from: 'clear', t: 0 },
    });
    expect(d.weather('clear', rain, 600).fade?.t).toBeCloseTo(0.5);
    expect(d.weather('clear', rain, 1100).fade).toBeNull();
    expect(d.weather('clear', null, 2000)).toEqual({
      weather: 'clear',
      fade: { from: 'rain', t: 0 },
    });
  });
});

describe('staged motions and the court mirror', () => {
  const base = { anim: 'idle' as const, dir: 'right' as const, frame: 2 };

  it('plays every motion of the vocabulary, turning toward or away from the player', () => {
    for (const m of STAGE_MOTIONS) expect(motionSample(m, 0, base, 'left').anim, m).toBeTruthy();
    expect(motionSample('kneel', 0, base, null).anim).toBe('pray');
    expect(motionSample('turn', 0, base, null).dir).toBe('left');
    expect(motionSample('look_up', 0, base, null).dir).toBe('up');
    expect(motionSample('approach', 0, base, 'down')).toMatchObject({ anim: 'walk', dir: 'down' });
    expect(motionSample('retreat', 0, base, 'down').dir).toBe('up');
    // a one-shot holds its last frame
    expect(motionSample('nod', 10000, base, null).frame).toBe(1);
  });

  it('holds the standing frame for a pose without art and keeps the mirror to its time', () => {
    expect(motionSample('art_chr_janu_reach', 500, base, null)).toEqual({
      anim: 'idle',
      dir: 'right',
      frame: 0,
    });
    expect(mirrorShown({ until: 1000 }, 999)).toBe(true);
    expect(mirrorShown({ until: 1000 }, 1000)).toBe(false);
    expect(mirrorShown(null, 0)).toBe(false);
  });
});

describe('switch tiles and the sediment haze on screen', () => {
  it('paints closed switches into the live map with a key of the closed set', () => {
    const shut = liveMapOf(MAP, {});
    expect(shut.closed).toEqual(['gate', 'reeds']);
    expect(shut.key).toBe('gate,reeds');
    const legendOf = (m: MapDef, x: number, y: number) => m.legend[m.rows[y]?.[x] ?? ''];
    expect(legendOf(shut.map, 3, 5)).toBe('wall');
    expect(legendOf(shut.map, 8, 2)).toBe('water');
    const open = liveMapOf(MAP, { gate_open: true, reeds_cut: true });
    expect(open.map).toBe(MAP);
    expect(open.key).toBe('');
    expect(liveMapOf({ ...MAP, switches: [] }, {}).map.switches).toEqual([]);
  });

  it('fades only the switches that changed, and not on arrival', () => {
    const f = new SwitchFader();
    expect(f.update(MAP, ['gate', 'reeds'], 0)).toBe(false);
    expect(f.state(0)).toBeNull();
    expect(f.update(MAP, ['reeds'], 100)).toBe(true);
    expect(f.state(100 + SWITCH_FADE_MS / 2)).toEqual({
      rects: [{ x: 3, y: 5, w: 2, h: 1 }],
      t: 0.5,
    });
    // a second change during the fade keeps fading the first rectangle too
    expect(f.update(MAP, [], 200)).toBe(true);
    expect(f.state(200)?.rects).toHaveLength(2);
    expect(f.state(200 + SWITCH_FADE_MS)).toBeNull();
    // another map starts without a fade
    expect(f.update({ ...MAP, id: 'other' }, ['gate'], 300)).toBe(false);
  });

  it('eases the haze to a new level over two seconds and snaps on a new map', () => {
    const f = new SedimentFader();
    expect(f.value('m', 0.2, 0)).toBe(0.2);
    expect(f.value('m', 0.6, 1000)).toBeCloseTo(0.2);
    expect(f.value('m', 0.6, 1000 + SEDIMENT_FADE_MS / 2)).toBeCloseTo(0.4);
    expect(f.moving(1000 + SEDIMENT_FADE_MS / 2)).toBe(true);
    expect(f.value('m', 0.6, 1000 + SEDIMENT_FADE_MS)).toBeCloseTo(0.6);
    expect(f.moving(1000 + SEDIMENT_FADE_MS)).toBe(false);
    // turning back midway starts from what is on screen
    f.value('m', 0, 5000);
    const midway = f.value('m', 0, 5000 + SEDIMENT_FADE_MS / 2);
    expect(f.value('m', 0.6, 5000 + SEDIMENT_FADE_MS / 2)).toBeCloseTo(midway);
    expect(f.value('n', 0.9, 9000)).toBe(0.9);
  });
});

describe('a gate with several ways out', () => {
  const on = (open: string[]) => (k: string) => open.includes(k);

  it('groups the exits on and beside the nearest exit tile, locked ones listed', () => {
    const ways = gateExits(MAP, { x: 6.5, y: 8.6 }, on([]));
    expect(ways.map((w) => [w.id, w.open])).toEqual([
      ['to_field', true],
      ['to_region', true],
      ['to_wall', false],
    ]);
    expect(gatePrompt(ways)).toEqual({ key: 'ui.hud.prompt.exit_many', params: { count: 3 } });
    expect(gateAction(ways)).toEqual({ kind: 'ask' });
    expect(gateExits(MAP, { x: 6, y: 2 }, on([]))).toEqual([]);
  });

  it('leaves at once through a single way and names it in the prompt', () => {
    const one = gateExits(MAP, { x: 0.5, y: 4.5 }, on([]));
    expect(one).toEqual([{ id: 'west', label: 'west', open: true }]);
    expect(gatePrompt(one)).toEqual({ key: 'ui.hud.prompt.exit', params: { label: 'west' } });
    expect(gateAction(one)).toEqual({ kind: 'leave', exitId: 'west' });
    const locked = [{ id: 'x', label: 'x', open: false }];
    expect(gatePrompt(locked)?.key).toBe('ui.hud.prompt.exit_locked');
  });

  it('picks open ways by number and skips locked ones with the cursor', () => {
    const ways = gateExits(MAP, { x: 6.5, y: 8.6 }, on([]));
    expect(optionByNumber(ways, 2)?.id).toBe('to_region');
    expect(optionByNumber(ways, 3)).toBeNull();
    expect(optionByNumber(ways, 9)).toBeNull();
    expect(moveCursor(ways, 1, 1)).toBe(0);
    expect(moveCursor(ways, 0, -1)).toBe(1);
    expect(moveCursor([{ id: 'a', label: 'a', open: false }], 0, 1)).toBe(-1);
  });
});

describe('the combat adapter marks the world', () => {
  function fakeView(extra: { telegraphs?: object; channel?: boolean } = {}): GameView {
    const ent = (id: string, kind: string, x: number) => ({
      id,
      kind,
      name: id,
      mapId: 'm',
      x,
      y: 5,
      facing: 0,
      alive: true,
      tags: [],
    });
    const unit = (id: string, side: string, extra: object) => ({
      id,
      side,
      combatUntil: 100,
      cast: null,
      target: null,
      monsterId: null,
      downed: false,
      ...extra,
    });
    const entities = [ent('p', 'player', 5), ent('wolf', 'monster', 8), ent('boss', 'monster', 30)];
    const world = {
      slices: {
        combat: {
          units: {
            p: unit('p', 'ally', {}),
            wolf: unit('wolf', 'enemy', {
              target: 'p',
              monsterId: 'wolf',
              cast: { abilityId: 'howl', targetId: 'p', start: 40, end: 60, x: 8, y: 5 },
            }),
            boss: unit('boss', 'enemy', {
              monsterId: 'warden',
              cast: {
                abilityId: 'slam',
                targetId: 'p',
                start: 50,
                end: 70,
                x: 30,
                y: 5,
                ...(extra.channel ? { channel: { every: 5, next: 55, n: 0 } } : {}),
              },
            }),
          },
          ...(extra.telegraphs ? { telegraphs: extra.telegraphs } : {}),
        },
      },
    };
    return {
      tick: 50,
      world,
      content: {
        abilities: [
          { id: 'howl', target: 'area', radius: 3 },
          { id: 'slam', target: 'enemy_area', radius: 2, uninterruptible: true },
          { id: 'crystalfall', target: 'area', radius: 2, telegraph: { lead: 2 } },
        ],
        monsters: [
          { id: 'wolf', rank: 'normal' },
          { id: 'warden', rank: 'boss' },
        ],
      },
      playerId: () => 'p',
      entitiesOnMap: () => entities,
      entity: (id: string) => entities.find((e) => e.id === id),
    } as unknown as GameView;
  }

  it('marks the threat, the boss in a fight and both casts, and lays the area circles', () => {
    const { marks, warnings } = worldMarks(fakeView(), 'm');
    expect(marks.get('wolf')).toEqual({
      threat: true,
      boss: false,
      cast: { progress: 0.5, interruptible: true },
    });
    expect(marks.get('boss')).toEqual({
      threat: false,
      boss: true,
      cast: { progress: 0, interruptible: false },
    });
    expect(marks.has('p')).toBe(false);
    // the wolf's howl is around itself, the boss's slam around its target, the player
    expect(warnings).toEqual([
      {
        id: 'cast:wolf',
        shape: { kind: 'circle', x: 8, y: 5, radius: 3 },
        progress: 0.5,
        hostile: true,
      },
      {
        id: 'cast:boss',
        shape: { kind: 'circle', x: 5, y: 5, radius: 2 },
        progress: 0,
        hostile: true,
      },
    ]);
  });

  it('hands the actual ability school and cast elapsed time to cosmetic bitmap effects', () => {
    const view = fakeView();
    const content = view.content as unknown as { abilities: { id: string; school?: string }[] };
    const ability = content.abilities.find((row) => row.id === 'howl');
    if (ability) ability.school = 'fire';
    const { marks } = worldMarks(view, 'm');
    expect(marks.get('wolf')?.cast).toMatchObject({ school: 'fire', elapsedMs: 500 });
  });

  it('draws the kernel warnings: locked cells, a following circle, a flashing pulse zone', () => {
    const { warnings } = worldMarks(
      fakeView({
        telegraphs: {
          a: {
            id: 'a',
            casterId: 'wolf',
            mapId: 'm',
            kind: 'circle',
            tier: 'heavy',
            cells: [7, 4, 8, 4],
            start: 40,
            settle: 60,
          },
          b: {
            id: 'b',
            casterId: 'boss',
            mapId: 'm',
            kind: 'circle',
            tier: 'normal',
            cells: [],
            start: 50,
            settle: 70,
            follow: 'p',
            radius: 2,
          },
          c: {
            id: 'c',
            casterId: 'boss',
            mapId: 'm',
            kind: 'circle',
            tier: 'normal',
            cells: [1, 1],
            start: 10,
            settle: 20,
            pulse: { every: 20, next: 52, until: 200 },
          },
          d: {
            id: 'd',
            casterId: 'boss',
            mapId: 'other',
            kind: 'circle',
            tier: 'normal',
            cells: [0, 0],
            start: 0,
            settle: 9,
          },
        },
      }),
      'm',
    );
    const tg = warnings.filter((w) => w.id.startsWith('tg:'));
    expect(tg.map((w) => w.id)).toEqual(['tg:a', 'tg:b', 'tg:c']);
    expect(tg[0]).toMatchObject({
      shape: { kind: 'cells', cells: [7, 4, 8, 4] },
      progress: 0.5,
      hostile: true,
    });
    expect(tg[1]?.shape).toEqual({ kind: 'circle', x: 5, y: 5, radius: 2 });
    expect(tg[2]?.progress).toBe(1);
    expect(tg[2]?.pulse).toBeCloseTo(0.6);
  });

  it('drains a channel and skips the circle of a cast the kernel warns itself', () => {
    const { marks } = worldMarks(fakeView({ channel: true }), 'm');
    expect(marks.get('boss')?.cast?.progress).toBe(1);
    const v = fakeView();
    const wolf = (
      v.world as unknown as {
        slices: { combat: { units: Record<string, { cast: { abilityId: string } }> } };
      }
    ).slices.combat.units.wolf;
    if (wolf) wolf.cast.abilityId = 'crystalfall';
    expect(worldMarks(v, 'm').warnings.map((w) => w.id)).toEqual(['cast:boss']);
  });
});

describe('the shipped scenes speak the stage vocabulary', () => {
  it('names only angles, sizes, moves, presets, motions and maps the client knows', () => {
    const content = buildContent();
    const maps = new Set(content.maps.map((m) => m.id));
    const atlas = new Set(
      ((content as { atlas_maps?: { id: string }[] }).atlas_maps ?? []).map((a) => a.id),
    );
    const bad: string[] = [];
    const isIn = (list: readonly string[], v: string | undefined) =>
      v === undefined || list.includes(v);
    for (const scene of content.scenes ?? []) {
      for (const node of scene.nodes) {
        for (const d of (node.stage ?? []) as StageDirective[]) {
          const at = `${scene.id}/${node.id} ${d.op}`;
          if (d.op === 'camera') {
            if (!isIn(STAGE_CAMERA_ANGLES, d.angle)) bad.push(`${at} angle ${d.angle}`);
            if (!isIn(STAGE_SHOT_SIZES, d.size)) bad.push(`${at} size ${d.size}`);
            if (!isIn(STAGE_CAMERA_MOVES, d.move)) bad.push(`${at} move ${d.move}`);
          } else if (d.op === 'light' && !isIn(STAGE_LIGHT_PRESETS, d.preset))
            bad.push(`${at} ${d.preset}`);
          else if (d.op === 'weather' && !isIn(STAGE_WEATHER_PRESETS, d.preset))
            bad.push(`${at} ${d.preset}`);
          else if (
            d.op === 'motion' &&
            !isIn(STAGE_MOTIONS, d.action) &&
            !d.action.startsWith('art_chr_')
          )
            bad.push(`${at} ${d.action}`);
          else if (d.op === 'mirror' && !maps.has(d.map) && !atlas.has(d.map))
            bad.push(`${at} ${d.map}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
