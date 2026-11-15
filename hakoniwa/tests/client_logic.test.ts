import { describe, expect, it } from 'vitest';
import { FixedStepClock } from '../src/client/app/clock';
import { parseConfig } from '../src/client/app/config';
import { createSandboxGame, resumeSandboxGame } from '../src/client/app/sandbox';
import { belongsInBox, DialogueQueue } from '../src/client/hud/dialogue_queue';
import { minimapMatrix, minimapScale } from '../src/client/hud/minimap_model';
import { isQuotaError, MemoryStore, SaveStore, slotLabel } from '../src/client/hud/save_slots';
import { type Action, bindingFor, intentFromHeld, sameIntent } from '../src/client/input/keymap';
import { exitOpen, nearestExit, nextTarget, pickEntity } from '../src/client/input/picking';
import { AnimTracker } from '../src/client/render/anim_state';
import {
  BubbleBoard,
  firstSentence,
  layoutBoxes,
  MAX_THOUGHTS,
  wrapText,
} from '../src/client/render/bubbles';
import { InterpBuffer } from '../src/client/render/interp';
import { lampLit, lightingAt, lightWeights } from '../src/client/render/lighting';
import { markerMatrix, topMarker } from '../src/client/render/markers';
import {
  dissolveLevel,
  RoofFader,
  roofPixels,
  roofsForMap,
  roofsToOpen,
} from '../src/client/render/roofs';
import { buildScene, doorLights, relationOf, shouldShowName } from '../src/client/render/scene';
import { bakeGround, mapProps, propKind, tileTexture } from '../src/client/render/tile_art';
import { lightningFlash, weatherParticles } from '../src/client/render/weather_fx';
import { lookFromAppearance } from '../src/client/sprites/look';
import { getPixel, matrixHash, opaqueCount } from '../src/client/sprites/pixels';
import { createGameView } from '../src/client/view/game_view';
import { parseFlagValue } from '../src/client/windows/debug_window';
import { serializeWorld, worldHash } from '../src/core/save';
import { calendarAt, TICK_HZ, tickAtDay } from '../src/core/time';
import type { MapDef } from '../src/systems/world/types';

const MAP: MapDef = {
  id: 'm',
  name: '测试',
  region: 'test',
  width: 8,
  height: 6,
  rows: ['########', '#..TT~~#', '#,,,..r#', '#,,+..=#', '#....s.#', '########'],
  legend: {
    '#': 'wall',
    '.': 'grass',
    T: 'tree',
    '~': 'water',
    ',': 'floor',
    '+': 'door',
    r: 'rock',
    '=': 'road',
    s: 'sand',
  },
  locations: [
    { id: 'hut', name: '小屋', kind: 'home', x: 1, y: 2, w: 2, h: 2 },
    { id: 'field', name: '田', kind: 'field', x: 4, y: 3, w: 3, h: 2 },
  ],
  spawns: [],
  exits: [
    { id: 'east', x: 6, y: 4, toMap: 'x', toX: 1, toY: 1, label: '东门' },
    {
      id: 'west',
      x: 1,
      y: 4,
      toMap: 'x',
      toX: 1,
      toY: 1,
      label: '封门',
      requiresFlags: ['door.a'],
    },
  ],
};

describe('client main-loop clock', () => {
  it('turns real time into whole 20 Hz ticks and keeps the remainder as alpha', () => {
    const c = new FixedStepClock();
    const tick = 1000 / TICK_HZ;
    expect(c.advance(tick * 2.5)).toEqual({ steps: 2, alpha: 0.5 });
    expect(c.advance(tick * 0.5).steps).toBe(1);
  });

  it('runs more ticks per frame at 2x and 4x without changing tick length', () => {
    const c = new FixedStepClock();
    c.setSpeed(4);
    expect(c.advance(100).steps).toBe(8);
    c.setSpeed(2);
    expect(c.advance(100).steps).toBe(4);
  });

  it('holds time while paused and caps long gaps', () => {
    const c = new FixedStepClock(250, 40);
    c.togglePause();
    expect(c.advance(1000).steps).toBe(0);
    c.togglePause();
    expect(c.advance(10000).steps).toBe(5); // gap capped to 250 ms
    c.setSpeed(4);
    const capped = new FixedStepClock(100000, 12);
    capped.setSpeed(4);
    expect(capped.advance(10000).steps).toBe(12);
  });
});

describe('client interpolation and animation state', () => {
  it('interpolates between the last two captures and snaps teleports', () => {
    const b = new InterpBuffer();
    b.capture([{ id: 'a', x: 1, y: 1, mapId: 'm' }]);
    b.capture([{ id: 'a', x: 2, y: 1, mapId: 'm' }]);
    expect(b.sample('a', 0.5)).toEqual({ x: 1.5, y: 1 });
    expect(b.moving('a')).toBe(true);
    expect(b.travelled('a')).toBeCloseTo(1);
    b.capture([{ id: 'a', x: 9, y: 9, mapId: 'm' }]);
    expect(b.sample('a', 0.1)).toEqual({ x: 9, y: 9 });
    b.capture([{ id: 'a', x: 9, y: 9, mapId: 'other' }]);
    expect(b.moving('a')).toBe(false);
    b.capture([]);
    expect(b.sample('a', 1)).toBeNull();
  });

  it('chooses walk, idle, one-shot and death animations from motion and cues', () => {
    const t = new AnimTracker();
    const base = { id: 'n', alive: true, facing: Math.PI / 2, moving: false, travelled: 0 };
    expect(t.sample(base, 0)).toMatchObject({ anim: 'idle', dir: 'down' });
    expect(t.sample({ ...base, moving: true, facing: 0, travelled: 0.7 }, 10)).toMatchObject({
      anim: 'walk',
      dir: 'right',
      frame: 2,
    });
    // facing is kept after stopping
    expect(t.sample({ ...base, facing: 0, moving: false }, 20).dir).toBe('right');
    t.cue('n', 'attack', 100);
    expect(t.sample(base, 150).anim).toBe('attack');
    expect(t.sample(base, 1000).anim).toBe('idle');
    expect(t.sample({ ...base, alive: false }, 2000)).toMatchObject({ anim: 'death', frame: 0 });
    expect(t.sample({ ...base, alive: false }, 9000)).toMatchObject({ anim: 'death', frame: 3 });
    t.cue('n', 'hit', 9100);
    expect(t.sample({ ...base, alive: false }, 9150).anim).toBe('death');
  });
});

describe('client input rules', () => {
  it('maps keys by code and builds diagonal intents with cancelling opposites', () => {
    expect(bindingFor('KeyW')?.action).toBe('move_up');
    expect(bindingFor('Digit7')).toEqual({ action: 'hotbar', slot: 7 });
    expect(bindingFor('KeyE')?.action).toBe('interact');
    expect(bindingFor('Escape')?.action).toBe('menu');
    expect(bindingFor('Space')?.action).toBe('advance');
    expect(bindingFor('KeyQ')).toBeUndefined();
    const held = new Set<Action>(['move_up', 'move_right']);
    expect(intentFromHeld(held)).toEqual({ dx: 1, dy: -1 });
    held.add('move_left');
    expect(intentFromHeld(held)).toEqual({ dx: 0, dy: -1 });
    expect(intentFromHeld(new Set())).toEqual({ dx: 0, dy: 0 });
    expect(sameIntent({ dx: 1, dy: 0 }, { dx: 1, dy: 0 })).toBe(true);
    expect(sameIntent(null, { dx: 0, dy: 0 })).toBe(false);
  });

  it('picks the front-most entity under the pointer', () => {
    const boxes = [
      { id: 'back', x: 0, y: 0, w: 50, h: 50, sortY: 3 },
      { id: 'front', x: 20, y: 20, w: 50, h: 50, sortY: 4 },
    ];
    expect(pickEntity(boxes, 30, 30)).toBe('front');
    expect(pickEntity(boxes, 5, 5)).toBe('back');
    expect(pickEntity(boxes, 200, 200)).toBeNull();
  });

  it('finds exits within the world system reach and checks their flags', () => {
    expect(nearestExit(MAP, { x: 6.2, y: 4.4 })?.id).toBe('east');
    expect(nearestExit(MAP, { x: 3.5, y: 1.5 })).toBeNull();
    const west = MAP.exits[1];
    expect(west && exitOpen(west, () => false)).toBe(false);
    expect(west && exitOpen(west, (k) => k === 'door.a')).toBe(true);
  });

  it('cycles Tab targets by distance, skipping self, dead, hidden and objects', () => {
    const e = (id: string, x: number, extra: Record<string, unknown> = {}) => ({
      id,
      x,
      y: 0,
      alive: true,
      hidden: false,
      kind: 'npc' as const,
      ...extra,
    });
    const list = [
      e('me', 0),
      e('far', 5),
      e('near', 1),
      e('dead', 0.5, { alive: false }),
      e('box', 0.2, { kind: 'object' as const }),
    ];
    expect(nextTarget(list, { x: 0, y: 0 }, null, 'me')).toBe('near');
    expect(nextTarget(list, { x: 0, y: 0 }, 'near', 'me')).toBe('far');
    expect(nextTarget(list, { x: 0, y: 0 }, 'far', 'me')).toBe('near');
    expect(nextTarget(list, { x: 0, y: 0 }, null, 'me', 0.5)).toBeNull();
  });
});

describe('client speech bubbles and conversation box', () => {
  it('takes the first sentence and cuts long lines', () => {
    expect(firstSentence('你好。今天天气不错！')).toBe('你好。');
    expect(firstSentence('真的吗？我不信。')).toBe('真的吗？');
    expect(firstSentence('没有句号的一句话')).toBe('没有句号的一句话');
    const long = firstSentence('一'.repeat(40));
    expect(Array.from(long)).toHaveLength(24);
    expect(long.endsWith('…')).toBe(true);
  });

  it('wraps CJK text by visual width with an ellipsis when cut', () => {
    expect(wrapText('一二三四五六', 4, 3)).toEqual(['一二', '三四', '五六']);
    expect(wrapText('一二三四五六七八', 4, 2)).toEqual(['一二', '三…']);
    expect(wrapText('ab一c', 3, 2)).toEqual(['ab', '一c']);
  });

  it('keeps one bubble per speaker, expires them, skips narration and caps thoughts', () => {
    const b = new BubbleBoard();
    b.add('a', '你好。', 'say', 0);
    b.add('a', '再见。', 'say', 10);
    b.add('n', '风起了。', 'narrate', 0);
    expect(b.active(100).map((x) => x.text)).toEqual(['再见。']);
    expect(b.active(100000)).toEqual([]);
    for (let i = 0; i < 4; i++) b.add(`t${i}`, '嗯。', 'think', i);
    expect(b.active(10).filter((x) => x.kind === 'think')).toHaveLength(MAX_THOUGHTS);
  });

  it('pushes overlapping bubble boxes apart', () => {
    const out = layoutBoxes([
      { x: 0, y: 100, w: 50, h: 20 },
      { x: 10, y: 95, w: 50, h: 20 },
    ]);
    expect(out).toHaveLength(2);
    expect(Math.abs((out[0]?.y ?? 0) - (out[1]?.y ?? 0))).toBeGreaterThanOrEqual(20);
  });

  it('routes only lines to or from the player, narration and divine speech into the box', () => {
    const line = (
      kind: 'say' | 'divine' | 'narrate' | 'think',
      listenerId?: string,
      speakerId = 'n',
    ) => ({
      speakerId,
      speakerName: '某人',
      text: '……',
      kind,
      listenerId,
    });
    expect(belongsInBox(line('say'), 'player')).toBe(false);
    expect(belongsInBox(line('say', 'player'), 'player')).toBe(true);
    expect(belongsInBox(line('say', undefined, 'player'), 'player')).toBe(true);
    expect(belongsInBox(line('divine'), 'player')).toBe(true);
    expect(belongsInBox(line('narrate'), 'player')).toBe(true);
    const q = new DialogueQueue();
    expect(q.push(line('say'), 'player')).toBe(false);
    q.push(line('divine'), 'player');
    q.push(line('narrate'), 'player');
    expect(q.current?.kind).toBe('divine');
    expect(q.pending).toBe(1);
    expect(q.advance()?.kind).toBe('narrate');
    expect(q.advance()).toBeNull();
    expect(q.open).toBe(false);
  });
});

describe('client lighting, weather and ground art', () => {
  it('darkens the tint at night and lights lamps progressively', () => {
    const noon = lightingAt(calendarAt(tickAtDay(0, 12)), 'clear', false);
    const night = lightingAt(calendarAt(tickAtDay(0, 23)), 'clear', false);
    expect(noon.tint).toBe(0xffffff);
    expect(noon.lampLevel).toBe(0);
    expect(night.tint & 0xff).toBeLessThan(0xa0);
    expect(night.lampLevel).toBe(1);
    expect(night.personalLight).toBe(true);
    const lit = Array.from({ length: 200 }, (_, i) => lampLit(`lamp${i}`, 0.5)).filter(
      Boolean,
    ).length;
    expect(lit).toBeGreaterThan(20);
    expect(lit).toBeLessThan(180);
    expect(lampLit('x', 0)).toBe(false);
    const rainy = lightingAt(calendarAt(tickAtDay(0, 12)), 'storm', false);
    expect(rainy.tint).not.toBe(0xffffff);
    const golden = lightWeights(calendarAt(tickAtDay(0, 18, 15)));
    expect(golden.golden).toBeGreaterThan(0.5);
  });

  it('keeps indoor maps lit and weather-free tint', () => {
    const night = lightingAt(calendarAt(tickAtDay(0, 23)), 'storm', true);
    expect(night.lampLevel).toBe(1);
    expect(night.personalLight).toBe(false);
  });

  it('generates weather particles deterministically from time', () => {
    const view = { w: 480, h: 270, camX: 0, camY: 0 };
    const a = weatherParticles('rain', 1234, view);
    expect(a.length).toBeGreaterThan(50);
    expect(weatherParticles('rain', 1234, view)).toEqual(a);
    expect(weatherParticles('rain', 1300, view)).not.toEqual(a);
    expect(weatherParticles('clear', 1234, view)).toEqual([]);
    expect(weatherParticles('snow', 0, view).every((p) => p.kind === 'snow')).toBe(true);
    expect(weatherParticles('ashfall', 0, view).some((p) => p.kind === 'ember')).toBe(true);
    const flashes = Array.from({ length: 2000 }, (_, i) => lightningFlash(i * 50)).filter(
      (v) => v > 0,
    );
    expect(flashes.length).toBeGreaterThan(0);
  });

  it('bakes ground at 16 px per tile, deterministically, with standing props', () => {
    const g = bakeGround(MAP, 0);
    expect(g.w).toBe(8 * 16);
    expect(g.h).toBe(6 * 16);
    expect(matrixHash(bakeGround(MAP, 0))).toBe(matrixHash(g));
    expect(matrixHash(bakeGround(MAP, 1))).not.toBe(matrixHash(g)); // water animates
    expect(opaqueCount(g)).toBe(g.w * g.h);
    expect(propKind('tree')).toBe('tree');
    expect(propKind('grass')).toBeNull();
    expect(mapProps(MAP).map((p) => `${p.kind}@${p.tx},${p.ty}`)).toEqual([
      'tree@3,1',
      'tree@4,1',
      'rock@6,2',
    ]);
    for (const k of ['grass', 'water', 'wall', 'floor', 'void'] as const) {
      expect(tileTexture(k, 0).w).toBe(16);
    }
    // the wall above open ground gets a darker front face at its bottom rows
    const top = getPixel(g, 2 * 16 + 4, 2);
    const face = getPixel(g, 2 * 16 + 4, 14);
    expect(face).not.toBe(top);
  });

  it('gives the minimap one pixel per tile and an integer upscale when it fits', () => {
    expect(minimapMatrix(MAP).w).toBe(8);
    expect(minimapScale(8, 6, 176, 132)).toBe(22);
    expect(minimapScale(400, 300, 176, 132)).toBeCloseTo(0.44);
  });
});

describe('client roofs and scene', () => {
  it('roofs building locations, not open ones, covering the wall ring', () => {
    const roofs = roofsForMap(MAP);
    expect(roofs.map((r) => r.locationId)).toEqual(['hut']);
    expect(roofs[0]).toMatchObject({ x: 0, y: 1, w: 4, h: 4 });
    expect(roofsForMap({ ...MAP, indoor: true })).toEqual([]);
    const tagged = {
      ...MAP,
      locations: [
        { id: 'p', name: 'p', kind: 'plaza', x: 1, y: 1, w: 2, h: 2, tags: ['building'] },
      ],
    };
    expect(roofsForMap(tagged)).toHaveLength(1);
    const px = roofPixels(roofs[0] as (typeof roofs)[number]);
    expect(px.w).toBe(64);
    expect(px.h).toBe(64);
  });

  it('opens the roof the player stands under and fades it with the dither steps', () => {
    const roofs = roofsForMap(MAP);
    expect([...roofsToOpen(roofs, { x: 1.5, y: 2.5 })]).toEqual(['hut']);
    expect([...roofsToOpen(roofs, { x: 6, y: 4 })]).toEqual([]);
    const f = new RoofFader(160);
    f.update(80, new Set(['hut']), roofs);
    expect(f.openness('hut')).toBeCloseTo(0.5);
    f.update(200, new Set(['hut']), roofs);
    expect(f.openness('hut')).toBe(1);
    f.update(40, new Set(), roofs);
    expect(f.openness('hut')).toBeCloseTo(0.75);
    expect(dissolveLevel(0)).toBe(0);
    expect(dissolveLevel(0.5)).toBe(8);
    expect(dissolveLevel(1)).toBe(16);
  });

  it('classifies relations and name visibility', () => {
    const e = (kind: 'npc' | 'monster' | 'object' | 'player', tags: string[] = []) => ({
      id: kind,
      kind,
      tags,
      faction: 'x',
      name: '名字',
    });
    expect(relationOf(e('player'), 'player')).toBe('self');
    expect(relationOf(e('monster'), 'player')).toBe('hostile');
    expect(relationOf(e('npc'), 'player')).toBe('friendly');
    expect(relationOf(e('npc', ['hostile']), 'player')).toBe('hostile');
    expect(relationOf(e('object'), 'player')).toBe('neutral');
    expect(shouldShowName(e('npc'), 'friendly', false, false)).toBe(true);
    expect(shouldShowName(e('monster'), 'hostile', false, false)).toBe(false);
    expect(shouldShowName(e('monster'), 'hostile', true, false)).toBe(true);
    expect(shouldShowName({ kind: 'player', name: '?' }, 'self', true, true)).toBe(false);
  });

  it('sorts the scene by foot y with ids breaking ties, and hides names under closed roofs', () => {
    const look = lookFromAppearance({ base: 'human', colors: [] });
    const anim = { anim: 'idle' as const, dir: 'down' as const, frame: 0 };
    const ent = (id: string, x: number, y: number) => ({
      entity: {
        id,
        kind: 'npc' as const,
        name: id,
        mapId: 'm',
        x,
        y,
        facing: 0,
        speed: 1,
        radius: 0.3,
        faction: 't',
        appearance: { base: 'human', colors: [] },
        tags: [],
        alive: true,
      },
      x,
      y,
      look,
      anim,
      marker: 'quest' as const,
    });
    const roofs = roofsForMap(MAP);
    const scene = buildScene({
      map: MAP,
      camera: { zoom: 2, x: 0, y: 0, viewW: 400, viewH: 300 },
      timeMs: 0,
      playerId: 'player',
      calendar: calendarAt(tickAtDay(0, 12)),
      weather: 'rain',
      entities: [ent('b', 5, 3), ent('a', 5, 3), ent('inside', 1.5, 2.5)],
      props: mapProps(MAP),
      roofs,
      roofOpenness: () => 0,
      selection: null,
      hover: null,
      bubbles: [],
    });
    const order = scene.items.map((i) => i.id);
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
    expect(order.indexOf('prop:3:1')).toBeLessThan(order.indexOf('inside'));
    expect(order.indexOf('inside')).toBeLessThan(order.indexOf('roof:hut'));
    const inside = scene.items.find((i) => i.id === 'inside');
    expect(inside?.type === 'entity' && inside.showName).toBe(false);
    expect(inside?.type === 'entity' && inside.marker).toBeNull();
    const outside = scene.items.find((i) => i.id === 'a');
    expect(outside?.type === 'entity' && outside.marker).toBe('quest');
    expect(scene.weather).toBe('rain');
    expect(doorLights(MAP)).toHaveLength(1);
  });

  it('draws overhead markers as pixel glyphs and picks the highest priority', () => {
    expect(opaqueCount(markerMatrix('quest'))).toBeGreaterThan(10);
    expect(topMarker(['thinking', 'quest', 'witness'])).toBe('quest');
    expect(topMarker([])).toBeNull();
  });
});

describe('client save slots and sandbox world', () => {
  it('saves, lists, loads and removes slots in a key-value store', () => {
    const engine = createSandboxGame(7);
    engine.step(40);
    const saves = new SaveStore(new MemoryStore());
    const meta = saves.save('2', engine.world, '客户端沙盒', '2026-11-15T00:00:00.000Z');
    expect(meta.date).toMatch(/^圣历 998 年 春 第 1 日 06:0\d$/);
    expect(meta.bytes).toBe(serializeWorld(engine.world).length);
    expect(Object.keys(saves.list())).toEqual(['2']);
    expect(slotLabel('2')).toBe('存档 2');
    expect(slotLabel('quick')).toBe('快速存档');
    const loaded = saves.load('2');
    expect(loaded && worldHash(loaded)).toBe(worldHash(engine.world));
    expect(saves.load('3')).toBeNull();
    saves.remove('2');
    expect(saves.list()).toEqual({});
    expect(saves.has('2')).toBe(false);
    expect(isQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isQuotaError(new Error('x'))).toBe(false);
  });

  it('resumes a sandbox save and keeps stepping identically to an uninterrupted run', () => {
    const a = createSandboxGame(11);
    a.step(100);
    const text = serializeWorld(a.world);
    const b = resumeSandboxGame(JSON.parse(text).world);
    a.step(200);
    b.step(200);
    expect(worldHash(b.world)).toBe(worldHash(a.world));
  });

  it('exposes the world through GameView with every archetype on the sandbox map', () => {
    const engine = createSandboxGame(3);
    const view = createGameView(engine);
    const map = view.currentMap();
    expect(map?.id).toBe('client_sandbox');
    const bases = new Set(
      view.entitiesOnMap('client_sandbox').map((e) => lookFromAppearance(e.appearance).archetype),
    );
    for (const a of [
      'human',
      'elf',
      'dwarf',
      'halfling',
      'beastkin',
      'demon',
      'undead',
      'slime',
      'wolf',
      'bird',
      'golem',
      'spirit',
      'goddess',
      'object',
    ]) {
      expect(bases.has(a as never)).toBe(true);
    }
    expect(view.holding(view.playerId()).money).toBe(12345);
    expect(view.itemDef('sb_sword')?.name).toBe('旧铁剑');
  });
});

describe('client config and debug helpers', () => {
  it('enables dev mode, sandbox and seed options only in Vite dev builds', () => {
    // production builds: never dev mode, whatever the URL says
    expect(parseConfig('?sandbox=1&seed=5', false)).toEqual({ devMode: false, sandbox: false });
    expect(parseConfig('?dev=1&sandbox=1&seed=5&hour=30', false)).toEqual({
      devMode: false,
      sandbox: false,
    });
    // dev builds: on by default, URL options honoured, ?dev=0 turns it off
    expect(parseConfig('?sandbox=1&seed=5&hour=30', true)).toEqual({
      devMode: true,
      sandbox: true,
      seed: 5,
      startHour: 23,
    });
    expect(parseConfig('', true)).toMatchObject({ devMode: true, sandbox: false, seed: undefined });
    expect(parseConfig('?dev=0&sandbox=1', true)).toEqual({ devMode: false, sandbox: false });
  });

  it('parses typed flag values', () => {
    expect(parseFlagValue('true')).toBe(true);
    expect(parseFlagValue('false')).toBe(false);
    expect(parseFlagValue(' 12 ')).toBe(12);
    expect(parseFlagValue('act1')).toBe('act1');
    expect(parseFlagValue('')).toBe('');
  });
});
