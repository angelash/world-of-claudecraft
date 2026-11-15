// HD-2D scene pure cores (docs/50_tech/art_pipeline.md 1 to 2 and 5.1 to 5.2): view
// math, style packs and the look layer, scene layout, procedural textures, geometry, the
// light map, sun and sky, quality tiers and decor sprites. Everything here runs in Node;
// the three.js renderer only executes what these modules decide.

import { describe, expect, it } from 'vitest';
import { sunDirection, sunSkyAt } from '../src/client/hd2d/daylight';
import {
  addPolygon,
  boxMesh,
  emptyMesh,
  roofMesh,
  standeeMesh,
  wallMesh,
} from '../src/client/hd2d/geometry';
import { paintGround, waterMask } from '../src/client/hd2d/ground';
import { buildingAt, buildLayout, DOOR_HEIGHT } from '../src/client/hd2d/layout';
import { LIGHTMAP_PX, lightsKey, paintLightmap, steppedFalloff } from '../src/client/hd2d/lightmap';
import { QUALITY_TIERS, resolveQuality, tierPixelRatio } from '../src/client/hd2d/quality';
import { standeeHitBox, standeeQuad } from '../src/client/hd2d/standee';
import { resolveLook, STYLE_PACKS, stylePackFor } from '../src/client/hd2d/style_packs';
import {
  ATLAS_CELLS,
  paintDoor,
  paintRoof,
  paintWallAtlas,
  wallPixels,
} from '../src/client/hd2d/textures';
import {
  clampPitch,
  DEFAULT_PITCH,
  defaultStepIndex,
  orbit,
  PITCH_MAX,
  PITCH_MIN,
  projectToScreen,
  sanitizePrefs,
  screenFacing,
  screenIntentToWorld,
  screenToGround,
  snapFocus,
  stepAt,
  togglePreset,
  turn,
  VIEW_PRESETS,
  viewBasis,
  ZOOM_STEPS,
  zoomBy,
} from '../src/client/hd2d/view';
import { AnimTracker } from '../src/client/render/anim_state';
import { decorSprite, shopSignSprite } from '../src/client/render/decor_art';
import { dirFromFacing } from '../src/client/sprites/anim_spec';
import { getAlpha, getPixel, matrixHash, opaqueCount } from '../src/client/sprites/pixels';
import { calendarAt, tickAtDay } from '../src/core/time';
import { DECOR_KINDS, lookProblems, STYLE_IDS, styleOf } from '../src/systems/world/look';
import type { MapDef } from '../src/systems/world/types';

const TOWN: MapDef = {
  id: 'town',
  name: '测试镇',
  region: 'borderstone_region',
  width: 12,
  height: 9,
  rows: [
    'TT..........',
    '....#####...',
    '....#___#...',
    '....#___#..r',
    '....##+##...',
    '............',
    'HHHH...~~~..',
    '.......~~W..',
    '............',
  ],
  legend: {
    '.': 'grass',
    T: 'tree',
    r: 'rock',
    '#': 'wall',
    H: 'wall',
    _: 'floor',
    '+': 'door',
    '~': 'water',
    W: 'deep_water',
  },
  locations: [
    { id: 'tavern', name: '酒馆', kind: 'tavern', x: 5, y: 2, w: 3, h: 2, tags: ['building'] },
  ],
  spawns: [],
  exits: [],
  decor: [
    { kind: 'lamp', x: 3.5, y: 5.5 },
    { kind: 'barrel', x: 9.5, y: 4.5 },
  ],
};

describe('HD-2D view math', () => {
  const vp = { w: 1280, h: 720 };
  it('projects ground points and inverts them for every pitch and yaw', () => {
    for (const pitch of [PITCH_MIN, DEFAULT_PITCH, 64, PITCH_MAX]) {
      for (const yaw of [0, 45, 90, 200, 315]) {
        const v = { focusX: 10.25, focusY: 7.5, step: 3, pitch, yaw };
        const s = projectToScreen(v, vp, 13.5, 0, 4.25);
        const g = screenToGround(v, vp, s.x, s.y);
        expect(g.x).toBeCloseTo(13.5, 6);
        expect(g.y).toBeCloseTo(4.25, 6);
      }
    }
  });

  it('puts north up and east right at yaw 0, and lifts heights by cos(pitch)', () => {
    const v = { focusX: 0, focusY: 0, step: 2, pitch: 36, yaw: 0 };
    const centre = projectToScreen(v, vp, 0, 0, 0);
    expect(centre).toEqual({ x: 640, y: 360 });
    const north = projectToScreen(v, vp, 0, 0, -1);
    const east = projectToScreen(v, vp, 1, 0, 0);
    expect(north.y).toBeLessThan(360);
    expect(east.x).toBeGreaterThan(640);
    // one metre of ground depth shrinks by sin(pitch); one metre of height by cos(pitch)
    expect(360 - north.y).toBeCloseTo(32 * Math.sin((36 * Math.PI) / 180), 6);
    const up = projectToScreen(v, vp, 0, 1, 0);
    expect(360 - up.y).toBeCloseTo(32 * Math.cos((36 * Math.PI) / 180), 6);
    expect(east.x - 640).toBe(32);
  });

  it('keeps the basis orthonormal', () => {
    const b = viewBasis(50, 123);
    const dot = (a: number[], c: number[]) => a.reduce((s, x, i) => s + x * (c[i] as number), 0);
    expect(dot(b.right, b.up)).toBeCloseTo(0, 9);
    expect(dot(b.right, b.toCamera)).toBeCloseTo(0, 9);
    expect(dot(b.up, b.toCamera)).toBeCloseTo(0, 9);
    expect(dot(b.up, b.up)).toBeCloseTo(1, 9);
  });

  it('turns screen-relative movement by the yaw so up always walks away from the camera', () => {
    expect(screenIntentToWorld(0, -1, 0)).toEqual({ dx: 0, dy: -1 });
    expect(screenIntentToWorld(1, 0, 0)).toEqual({ dx: 1, dy: 0 });
    // camera on the east looking west: screen up walks west, screen right walks north
    expect(screenIntentToWorld(0, -1, 90)).toEqual({ dx: -1, dy: 0 });
    expect(screenIntentToWorld(1, 0, 90)).toEqual({ dx: 0, dy: -1 });
    expect(screenIntentToWorld(0, 0, 90)).toEqual({ dx: 0, dy: 0 });
  });

  it('shows the front of a figure that faces the camera after turning', () => {
    // facing east (0 rad) with the camera east of it: the figure faces the viewer
    expect(dirFromFacing(screenFacing(0, 90))).toBe('down');
    expect(dirFromFacing(screenFacing(0, 0))).toBe('right');
    expect(dirFromFacing(screenFacing(-Math.PI / 2, 90))).toBe('right');
  });

  it('steps zoom, pitch, yaw and presets within their ranges', () => {
    expect(stepAt(-3)).toBe(ZOOM_STEPS[0]);
    expect(stepAt(99)).toBe(ZOOM_STEPS[ZOOM_STEPS.length - 1]);
    expect(stepAt(defaultStepIndex(1080))).toBe(3);
    expect(clampPitch(10)).toBe(PITCH_MIN);
    expect(clampPitch(120)).toBe(PITCH_MAX);
    const p = { stepIndex: 2, pitch: 36, yaw: 0 };
    expect(turn(p, 1).yaw).toBe(45);
    expect(turn({ ...p, yaw: 50 }, -1).yaw).toBe(0);
    expect(turn(p, -1).yaw).toBe(315);
    expect(togglePreset(p).pitch).toBe(VIEW_PRESETS.overview.pitch);
    expect(togglePreset(togglePreset(p)).pitch).toBe(VIEW_PRESETS.street.pitch);
    expect(zoomBy(p, 20).stepIndex).toBe(ZOOM_STEPS.length - 1);
    expect(orbit(p, 0, 1000).pitch).toBe(PITCH_MAX);
    expect(orbit(p, 100, 0).yaw).toBe(320);
  });

  it('sanitises stored prefs and snaps the focus to whole device pixels', () => {
    expect(sanitizePrefs({ stepIndex: 'x', pitch: 500, yaw: -90 }, 1080)).toEqual({
      stepIndex: defaultStepIndex(1080),
      pitch: PITCH_MAX,
      yaw: 270,
    });
    expect(sanitizePrefs(null, 720).pitch).toBe(DEFAULT_PITCH);
    const v = { focusX: 3.1234, focusY: 5.6789, step: 3, pitch: 36, yaw: 0 };
    const f = snapFocus(v);
    expect(f.x * 48).toBeCloseTo(Math.round(f.x * 48), 6);
    expect(Math.abs(f.x - v.focusX)).toBeLessThan(1 / 48);
  });
});

describe('style packs and the look layer', () => {
  it('has a pack for every style id and maps regions and indoor maps to packs', () => {
    for (const id of STYLE_IDS) expect(STYLE_PACKS[id].id).toBe(id);
    expect(styleOf({ region: 'valen_valley' })).toBe('valen_city');
    expect(styleOf({ region: 'nowhere', indoor: true })).toBe('sealed_ruins');
    expect(styleOf({ region: 'nowhere' })).toBe('lothar_plain');
    expect(styleOf({ style: 'ash_waste', region: 'valen_valley' })).toBe('ash_waste');
    expect(stylePackFor(TOWN).id).toBe('lothar_plain');
  });

  it('resolves building looks deterministically from the pack, with overrides winning', () => {
    const pack = STYLE_PACKS.lothar_plain;
    const a = resolveLook(pack, { id: 'tavern', kind: 'tavern' }, undefined);
    expect(resolveLook(pack, { id: 'tavern', kind: 'tavern' }, undefined)).toEqual(a);
    expect(a.category).toBe('tavern');
    expect(a.sign).toBe('mug');
    expect(pack.buildings.tavern.walls).toContain(a.wall);
    const o = resolveLook(
      pack,
      { id: 'tavern', kind: 'tavern' },
      {
        roof: 'hip',
        wall: 'stone',
        wallHeight: 5,
        roofColors: ['#112233'],
      },
    );
    expect(o).toMatchObject({ roof: 'hip', wall: 'stone', wallHeight: 5 });
    expect(o.roofColors[0]).toBe(0x112233);
  });

  it('reports look-layer problems: unknown pack, location, kind, colour, out-of-map decor', () => {
    expect(lookProblems(TOWN)).toEqual([]);
    const bad = lookProblems({
      ...TOWN,
      style: 'neon',
      looks: { ghost: { roof: 'dome' as never, roofColors: ['red'] }, tavern: { wallHeight: 40 } },
      decor: [
        { kind: 'rocket' as never, x: 1, y: 1 },
        { kind: 'lamp', x: 99, y: 1 },
      ],
    });
    expect(bad).toHaveLength(7);
    expect(bad.join('\n')).toMatch(/unknown style pack 'neon'/);
    expect(bad.join('\n')).toMatch(/look for unknown location 'ghost'/);
    expect(bad.join('\n')).toMatch(/wallHeight 40/);
    expect(bad.join('\n')).toMatch(/outside the map/);
  });
});

describe('scene layout', () => {
  const layout = buildLayout(TOWN, STYLE_PACKS.lothar_plain);
  it('turns a roofed location into one shell with walls, a door, faces and windows', () => {
    expect(layout.buildings).toHaveLength(1);
    const b = layout.buildings[0];
    if (!b) throw new Error('no building');
    expect(b.rect).toEqual({ x: 4, y: 1, w: 5, h: 4 });
    expect(b.doors).toEqual([{ x: 6, y: 4, outward: 's', interior: false }]);
    expect(b.walls).toHaveLength(13);
    expect(b.ridge).toBe('x');
    // outward faces of the north wall get a pane every third tile, never on corners
    const north = b.faces.filter((f) => f.y === 1 && f.side === 'n');
    expect(north.map((f) => f.cell).filter((c) => c === 'pane')).toHaveLength(1);
    expect(north.find((f) => f.x === 4)?.cell).not.toBe('pane');
    // faces toward the interior use the inner cell; the lintel over the door has faces too
    expect(b.faces.some((f) => f.cell === 'inner')).toBe(true);
    expect(b.faces.some((f) => f.lintel && f.x === 6 && f.y === 4)).toBe(true);
    expect(buildingAt(layout, 6.5, 3)?.locationId).toBe('tavern');
    expect(buildingAt(layout, 1, 8)).toBeNull();
  });

  it('keeps walls outside every shell as free walls with the pack height', () => {
    expect(layout.free.tiles).toHaveLength(4);
    expect(layout.free.material).toBe('palisade');
    expect(layout.free.height).toBe(2.2);
    const indoor = buildLayout({ ...TOWN, indoor: true }, STYLE_PACKS.sealed_ruins);
    expect(indoor.buildings).toHaveLength(0);
    expect(indoor.free.tiles).toHaveLength(17);
    expect(indoor.free.height).toBe(STYLE_PACKS.sealed_ruins.indoorWallHeight);
  });

  it('places trees, rocks, decor and a hanging shop sign as standees, and static lights', () => {
    const kinds = layout.standees.map((s) => `${s.source}:${s.kind}`);
    expect(kinds.filter((k) => k === 'tree:tree')).toHaveLength(2);
    expect(kinds).toContain('rock:rock');
    expect(kinds).toContain('decor:lamp');
    expect(kinds).toContain('decor:barrel');
    const sign = layout.standees.find((s) => s.source === 'sign');
    expect(sign?.kind).toBe('mug');
    expect(sign?.lift).toBeGreaterThan(1.5);
    expect(layout.lights.map((l) => l.id).sort()).toEqual(['town:decor:0', 'town:door:6:4']);
    expect(layout.lights.every((l) => l.night)).toBe(true);
  });
});

describe('procedural textures and geometry', () => {
  it('paints a wall atlas with one 16-pixel column per cell and lit panes in the emissive', () => {
    const col = STYLE_PACKS.lothar_plain.materials.timber_plaster;
    if (!col) throw new Error('no material');
    const a = paintWallAtlas('timber_plaster', col, 2.6, 0xffd58a, 3);
    expect(a.color.w).toBe(16 * ATLAS_CELLS.length);
    expect(a.color.h).toBe(wallPixels(2.6));
    expect(a.heightPx).toBe(42);
    const pane = ATLAS_CELLS.indexOf('pane');
    let glowing = 0;
    for (let y = 0; y < a.emissive.h; y++)
      for (let x = 0; x < a.emissive.w; x++) {
        if (getPixel(a.emissive, x, y) === 0) continue;
        glowing++;
        expect(Math.floor(x / 16)).toBe(pane);
      }
    expect(glowing).toBeGreaterThan(20);
    expect(matrixHash(paintWallAtlas('timber_plaster', col, 2.6, 0xffd58a, 3).color)).toBe(
      matrixHash(a.color),
    );
  });

  it('cuts palisade stake tips out of the wall texture and keeps other walls opaque', () => {
    const p = STYLE_PACKS.lothar_plain.materials.palisade;
    const s = STYLE_PACKS.lothar_plain.materials.stone;
    if (!p || !s) throw new Error('no material');
    expect(getAlpha(paintWallAtlas('palisade', p, 2.2, 0, 1).color, 0, 0)).toBe(0);
    const stone = paintWallAtlas('stone', s, 2.2, 0, 1).color;
    expect(opaqueCount(stone)).toBe(stone.w * stone.h);
  });

  it('paints roofs and doors at the requested size, deterministically', () => {
    const r = paintRoof('tile', [0xa8543a, 0x70382a, 0xc86a4a], 96, 48, 7);
    expect([r.w, r.h]).toEqual([96, 48]);
    expect(matrixHash(paintRoof('tile', [0xa8543a, 0x70382a, 0xc86a4a], 96, 48, 7))).toBe(
      matrixHash(r),
    );
    expect(matrixHash(paintRoof('slate', [0xa8543a, 0x70382a, 0xc86a4a], 96, 48, 7))).not.toBe(
      matrixHash(r),
    );
    expect(paintDoor(0x6e4626).h).toBe(Math.round(DOOR_HEIGHT * 16));
  });

  it('builds wall faces with outward normals, lintels above the door and caps on top', () => {
    const layout = buildLayout(TOWN, STYLE_PACKS.lothar_plain);
    const b = layout.buildings[0];
    if (!b) throw new Error('no building');
    const md = wallMesh(b.faces, b.walls, 2.6, 42);
    expect(md.indices.length).toBe((b.faces.length + b.walls.length) * 6);
    // every lintel quad starts at the door height
    const lintel = wallMesh(
      b.faces.filter((f) => f.lintel),
      [],
      2.6,
      42,
    );
    const ys = lintel.positions.filter((_, i) => i % 3 === 1);
    expect(Math.min(...ys)).toBeCloseTo(DOOR_HEIGHT);
    // a south face's normal points south
    const south = wallMesh([{ x: 0, y: 0, side: 's', cell: 'plain', lintel: false }], [], 2, 32);
    expect(south.normals.slice(0, 3)).toEqual([0, 0, 1]);
  });

  it('builds gable, hip and flat roofs over a shell', () => {
    const rect = { x: 0, y: 0, w: 6, h: 4 };
    const gable = roofMesh(rect, 2.6, 'gable', 'x');
    expect(gable.slopes.indices.length).toBe(12);
    expect(gable.gables.indices.length).toBe(6);
    expect(gable.ridgeY).toBeCloseTo(2.6 + 2 * Math.tan((36 * Math.PI) / 180));
    const hip = roofMesh(rect, 2.6, 'hip', 'x');
    expect(hip.slopes.indices.length).toBe(18);
    expect(hip.gables.indices.length).toBe(0);
    const flat = roofMesh(rect, 2.4, 'flat', 'x');
    expect(flat.ridgeY).toBeCloseTo(2.52);
    for (const n of [gable, hip].flatMap((r) => [r.slopes.normals])) {
      for (let i = 1; i < n.length; i += 3) expect(n[i]).toBeGreaterThan(0);
    }
  });

  it('flips a polygon so its front faces the requested way', () => {
    const md = emptyMesh();
    addPolygon(
      md,
      [
        [0, 0, 0],
        [0, 0, 1],
        [1, 0, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
      ],
      [0, 1, 0],
    );
    expect(md.normals.slice(0, 3)).toEqual([0, 1, 0]);
  });

  it('anchors standee quads at the foot and sizes hit boxes by the zoom step', () => {
    const q = standeeQuad(48, 48, 24, 44);
    expect(q).toEqual({ left: -1.5, right: 1.5, bottom: -0.25, top: 2.75 });
    expect(standeeMesh(q).positions.length).toBe(12);
    expect(standeeHitBox({ x: 100, y: 200 }, 14, 28, 3)).toEqual({ x: 79, y: 116, w: 42, h: 90 });
  });
});

describe('ground, light map and sky', () => {
  it('bakes the ground in pack colours with flat walls and masks water per tile', () => {
    const g = paintGround(TOWN, STYLE_PACKS.lothar_plain);
    expect([g.w, g.h]).toEqual([12 * 16, 9 * 16]);
    const m = waterMask(TOWN);
    const at = (x: number, y: number) => [m[(y * 12 + x) * 4], m[(y * 12 + x) * 4 + 1]];
    expect(at(7, 6)).toEqual([255, 0]);
    expect(at(9, 7)).toEqual([255, 255]);
    expect(at(0, 0)).toEqual([0, 0]);
    expect(matrixHash(paintGround(TOWN, STYLE_PACKS.ash_waste))).not.toBe(matrixHash(g));
  });

  it('steps the light falloff into bands and paints only near the lights', () => {
    expect(steppedFalloff(5, 4, 0, 0)).toBe(0);
    expect(steppedFalloff(0, 4, 0, 0)).toBe(1);
    expect([0, 0.32, 0.64, 1]).toContain(steppedFalloff(1.7, 4, 3, 1));
    const lights = [{ id: 'a', x: 2, y: 2, radius: 2, color: 0xff8000, intensity: 1 }];
    const buf = paintLightmap(lights, 12, 9);
    expect(buf.length).toBe(12 * LIGHTMAP_PX * 9 * LIGHTMAP_PX * 4);
    const px = (x: number, y: number) => buf[(y * 12 * LIGHTMAP_PX + x) * 4] as number;
    expect(px(2 * LIGHTMAP_PX, 2 * LIGHTMAP_PX)).toBeGreaterThan(60);
    expect(px(40, 30)).toBe(0);
    expect(lightsKey([...lights, { ...lights[0], id: 'b' } as (typeof lights)[0]])).toBe(
      lightsKey([{ ...lights[0], id: 'b' } as (typeof lights)[0], ...lights]),
    );
  });

  it('brightens noon over midnight, greys bad weather and fixes indoor light', () => {
    const pack = STYLE_PACKS.lothar_plain;
    const noon = sunSkyAt(calendarAt(tickAtDay(0, 12)), 'clear', false, pack);
    const night = sunSkyAt(calendarAt(tickAtDay(1, 1)), 'clear', false, pack);
    const storm = sunSkyAt(calendarAt(tickAtDay(0, 12)), 'storm', false, pack);
    expect(noon.sunIntensity).toBeGreaterThan(night.sunIntensity);
    expect(noon.daylight).toBe(1);
    expect(night.lampLevel).toBeGreaterThan(0.9);
    expect(storm.sunIntensity).toBeLessThan(noon.sunIntensity);
    expect(storm.wet).toBe(1);
    const indoor = sunSkyAt(calendarAt(tickAtDay(1, 1)), 'storm', true, pack);
    expect(indoor.sun).toBe(pack.light.indoor.sun);
    expect(indoor.wet).toBe(0);
    const [x, y] = sunDirection(8, 1);
    expect(x).toBeGreaterThan(0); // morning sun in the east
    expect(y).toBeGreaterThan(0);
    expect(sunDirection(17, 1)[0]).toBeLessThan(0); // evening sun in the west
  });
});

describe('quality tiers and decor sprites', () => {
  it('resolves auto by device and falls back to flat without WebGL', () => {
    expect(resolveQuality('auto', { touch: true, webgl: true }).tier).toBe('mid');
    expect(resolveQuality('auto', { touch: false, webgl: true }).tier).toBe('high');
    expect(resolveQuality('high', { touch: false, webgl: false }).tier).toBe('flat');
    expect(QUALITY_TIERS.low.shadowMap).toBe(0);
    expect(QUALITY_TIERS.high.bloom).toBe(true);
    expect(tierPixelRatio(QUALITY_TIERS.low, 3)).toBe(1);
    expect(tierPixelRatio(QUALITY_TIERS.high, 1.25)).toBe(1.25);
  });

  it('draws every decor kind with its foot inside the sprite, lights on lamps', () => {
    for (const k of DECOR_KINDS) {
      const s = decorSprite(k, 1);
      expect(opaqueCount(s.matrix), k).toBeGreaterThan(20);
      expect(s.anchorX).toBeGreaterThanOrEqual(0);
      expect(s.anchorX).toBeLessThanOrEqual(s.matrix.w);
      expect(s.anchorY).toBeLessThanOrEqual(s.matrix.h);
    }
    expect(decorSprite('lamp').lightAt).toBeDefined();
    expect(decorSprite('barrel').lightAt).toBeUndefined();
    expect(shopSignSprite('none')).toBeNull();
    expect(
      opaqueCount(shopSignSprite('anvil')?.matrix ?? decorSprite('sign').matrix),
    ).toBeGreaterThan(50);
  });
});

describe('review follow-ups', () => {
  it('matches projectToScreen with the three.js orthographic camera the renderer builds', async () => {
    const THREE = await import('three');
    const vp = { w: 1280, h: 720 };
    for (const [pitch, yaw] of [
      [36, 0],
      [64, 135],
      [50, 290],
    ] as const) {
      const v = { focusX: 20, focusY: 15, step: 3, pitch, yaw };
      const b = viewBasis(pitch, yaw);
      const ppu = 48;
      const cam = new THREE.OrthographicCamera(
        -vp.w / 2 / ppu,
        vp.w / 2 / ppu,
        vp.h / 2 / ppu,
        -vp.h / 2 / ppu,
        0.1,
        800,
      );
      cam.position.set(20 + b.toCamera[0] * 240, b.toCamera[1] * 240, 15 + b.toCamera[2] * 240);
      cam.up.set(0, 1, 0);
      cam.lookAt(20, 0, 15);
      cam.updateMatrixWorld();
      cam.updateProjectionMatrix();
      for (const [x, h, y] of [
        [23, 0, 12],
        [18.5, 2.6, 17],
      ] as const) {
        const p = new THREE.Vector3(x, h, y).project(cam);
        const s = projectToScreen(v, vp, x, h, y);
        expect(s.x).toBeCloseTo(((p.x + 1) / 2) * vp.w, 4);
        expect(s.y).toBeCloseTo(((1 - p.y) / 2) * vp.h, 4);
      }
    }
  });

  it('snaps the focus on the rendered pixel grid, odd viewports included', () => {
    const v = { focusX: 3.1234, focusY: 5.6789, step: 3, pitch: 36, yaw: 0 };
    for (const vp of [
      { w: 1280, h: 720 },
      { w: 1281, h: 721 },
    ]) {
      for (const grid of [1, 2]) {
        const f = snapFocus(v, vp, grid);
        const snapped = { ...v, focusX: f.x, focusY: f.y };
        // texel columns land on whole multiples of the grid; the ground origin row does too
        // (rows are foreshortened by sin(pitch), so only the anchored row is exact)
        const s = projectToScreen(snapped, vp, 10, 0, 10);
        const o = projectToScreen(snapped, vp, 0, 0, 0);
        const off = (n: number) => Math.abs(n / grid - Math.round(n / grid));
        expect(off(s.x)).toBeLessThan(1e-6);
        expect(off(o.y)).toBeLessThan(1e-6);
      }
    }
  });

  it('lowers the pixel ratio only by whole divisors of the device ratio', () => {
    expect(tierPixelRatio(QUALITY_TIERS.mid, 2)).toBe(1);
    expect(tierPixelRatio(QUALITY_TIERS.high, 3)).toBe(1.5);
    expect(tierPixelRatio(QUALITY_TIERS.mid, 1.5)).toBe(1.5);
  });

  it('turns idle figures with the camera and keeps never-moved ones face-on', () => {
    const t = new AnimTracker();
    const base = { id: 'a', alive: true, moving: false, travelled: 0 };
    // walked east once, then stands
    t.sample({ ...base, facing: 0.0001, moving: true }, 0);
    expect(t.sample({ ...base, facing: 0.0001, yawDeg: 0 }, 10).dir).toBe('right');
    expect(t.sample({ ...base, facing: 0.0001, yawDeg: 90 }, 20).dir).toBe('down');
    expect(t.sample({ ...base, facing: 0.0001, yawDeg: 180 }, 30).dir).toBe('left');
    // never moved: face-on under any yaw
    expect(t.sample({ ...base, id: 'b', facing: 0, yawDeg: 135 }, 0).dir).toBe('down');
  });

  it('keeps faces between neighbouring buildings and next to town walls', () => {
    const map: MapDef = {
      ...TOWN,
      id: 'pair',
      width: 10,
      height: 5,
      rows: ['..........', '.####HHHH.', '.#__##__#H', '.##+##+##.', '..........'],
      legend: { ...TOWN.legend, H: 'wall' },
      locations: [
        { id: 'a', name: 'a', kind: 'home', x: 2, y: 2, w: 2, h: 1, tags: ['building'] },
        { id: 'b', name: 'b', kind: 'church', x: 6, y: 2, w: 2, h: 1, tags: ['building'] },
      ],
      decor: [],
    };
    const l = buildLayout(map, STYLE_PACKS.lothar_plain);
    const [a, b] = l.buildings;
    if (!a || !b) throw new Error('two buildings expected');
    // a's east wall column (x=4) faces b's west wall column (x=5) and the other way round
    expect(a.faces.some((f) => f.x === 4 && f.side === 'e')).toBe(true);
    expect(b.faces.some((f) => f.x === 5 && f.side === 'w')).toBe(true);
    // the free wall tile east of b shows a face toward the building's wall
    expect(l.free.faces.some((f) => f.x === 9 && f.y === 2 && f.side === 'w')).toBe(true);
  });

  it('gives interior doors no lamp and no sign', () => {
    const map: MapDef = {
      ...TOWN,
      id: 'inner',
      rows: [
        '............',
        '....#######.',
        '....#__+__#.',
        '....#__#__#.',
        '....###+###.',
        '............',
        '............',
        '............',
        '............',
      ],
      locations: [
        { id: 'tavern', name: 't', kind: 'tavern', x: 5, y: 2, w: 5, h: 2, tags: ['building'] },
      ],
      decor: [],
    };
    const l = buildLayout(map, STYLE_PACKS.lothar_plain);
    const doors = l.buildings[0]?.doors ?? [];
    expect(doors.find((d) => d.y === 2)?.interior).toBe(true);
    expect(doors.find((d) => d.y === 4)?.interior).toBe(false);
    expect(l.lights.filter((x) => x.id.includes(':door:'))).toHaveLength(1);
    const sign = l.standees.find((s) => s.source === 'sign');
    expect(sign?.y).toBeGreaterThan(4.5);
  });

  it('builds chimney boxes with metre texture coordinates', () => {
    const md = boxMesh(0, 0.6, 2, 4, 0, 0.6);
    expect(md.indices.length).toBe(5 * 6);
    // v runs down from the top: the top edge of a side has v = -4
    expect(Math.min(...md.uvs.filter((_, i) => i % 2 === 1))).toBeCloseTo(-4);
  });

  it('moves the light smoothly through the whole day, no jump at midnight', () => {
    const dir = (h: number) => sunDirection(h, 0);
    for (const h of [21, 23.99, 0, 4.99, 5]) expect(dir(h)[1]).toBeGreaterThan(0);
    const a = dir(23.99);
    const b = dir(0.01);
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.02);
    expect(dir(22)[0]).toBeLessThan(0); // moon in the west early in the night
    expect(dir(4.5)[0]).toBeGreaterThan(0); // and in the east before dawn
  });
});
