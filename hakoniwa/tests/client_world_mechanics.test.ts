// The renderer side of the map mechanics (PK-M1-16): the seven new decor kinds draw their
// own procedural sprites, a landmark tree replaces the tree of its tile, the mine lamp
// lights at night, and the sediment haze converts the canon level (with local hot spots
// where the camera looks) to the render scale (map_briefs.md 1.2, art_pipeline.md 2.8).

import { describe, expect, it } from 'vitest';
import { buildLayout } from '../src/client/hd2d/layout';
import { STYLE_PACKS } from '../src/client/hd2d/style_packs';
import { decorSprite } from '../src/client/render/decor_art';
import { buildScene, divineLevel, sedimentLevel } from '../src/client/render/scene';
import { matrixHash, opaqueCount } from '../src/client/sprites/pixels';
import { calendarAt, tickAtDay } from '../src/core/time';
import { DECOR_KINDS } from '../src/systems/world/look';
import type { MapDef } from '../src/systems/world/types';

const NEW_KINDS = DECOR_KINDS.slice(14);

const GROVE: MapDef = {
  id: 'grove',
  name: '测试林',
  region: 'edgestone_area',
  width: 8,
  height: 6,
  rows: ['TTT.....', 'T.......', '........', '........', '........', '........'],
  legend: { '.': 'grass', T: 'tree' },
  locations: [
    { id: 'glade', name: '林间', kind: 'field', x: 0, y: 0, w: 8, h: 6 },
    { id: 'gully', name: '晶沟', kind: 'ruin', x: 5, y: 3, w: 3, h: 3, sediment: 3 },
  ],
  spawns: [],
  exits: [],
  sediment: 1,
  decor: [
    { kind: 'landmark_tree', x: 1.5, y: 0.5 },
    { kind: 'mine_lamp', x: 4.5, y: 2.5 },
    { kind: 'lamp', x: 6.5, y: 0.5 },
  ],
};

describe('the new decor kinds draw their own sprites', () => {
  it('gives each new kind a sprite of its own, not the sign board fallback', () => {
    const sign = matrixHash(decorSprite('sign').matrix);
    const hashes = NEW_KINDS.map((k) => matrixHash(decorSprite(k).matrix));
    for (const [i, h] of hashes.entries()) expect(h, NEW_KINDS[i]).not.toBe(sign);
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it('draws variants of stones, door frames and ground marks, and a lit mine lamp', () => {
    for (const k of ['standing_stone', 'doorframe', 'ground_mark'] as const) {
      const v = [0, 1, 2].map((n) => matrixHash(decorSprite(k, n).matrix));
      expect(new Set(v).size, k).toBe(3);
    }
    // variant 1 of the door frame is a fallen arch: wider than tall
    const fallen = decorSprite('doorframe', 1).matrix;
    expect(fallen.w).toBeGreaterThan(fallen.h);
    expect(decorSprite('mine_lamp').lightAt).toBeDefined();
    expect(decorSprite('dry_well').lightAt).toBeUndefined();
    // the landmark tree towers over a person-sized prop
    expect(decorSprite('landmark_tree').matrix.h).toBeGreaterThan(48);
    expect(opaqueCount(decorSprite('landmark_tree').matrix)).toBeGreaterThan(400);
  });
});

describe('the layout places the new decor', () => {
  const layout = buildLayout(GROVE, STYLE_PACKS.wild_forest);

  it('replaces the tree of a landmark tree tile, and only that tree', () => {
    const trees = layout.standees.filter((s) => s.source === 'tree').map((s) => s.id);
    expect(trees.sort()).toEqual(['tree:0:0', 'tree:0:1', 'tree:2:0']);
    expect(layout.standees.find((s) => s.id === 'decor:0')?.kind).toBe('landmark_tree');
  });

  it('registers the mine lamp as a night light of radius 3 next to the lamp', () => {
    const lights = Object.fromEntries(layout.lights.map((l) => [l.id, [l.radius, l.night]]));
    expect(lights).toEqual({ 'grove:decor:1': [3, true], 'grove:decor:2': [4.2, true] });
  });
});

describe('the sediment haze reads the canon level where the camera looks', () => {
  it('converts the map level by the render formula over the top of the render scale', () => {
    const at = (sediment: number) => sedimentLevel({ ...GROVE, sediment });
    expect([0, 1, 2, 3, 4, 5, 6].map(at)).toEqual([0, 1, 2, 4, 5, 6, 7].map((n) => n / 7));
    expect(sedimentLevel({ ...GROVE, sediment: undefined })).toBe(0);
  });

  it('switches to a hot spot inside its rectangle and back outside it', () => {
    expect(sedimentLevel(GROVE, 1.5, 1.5)).toBe(1 / 7);
    expect(sedimentLevel(GROVE, 6.5, 4.5)).toBe(4 / 7);
    const scene = (focusX: number, focusY: number) =>
      buildScene({
        map: GROVE,
        view: { focusX, focusY, step: 2, pitch: 36, yaw: 0 },
        timeMs: 0,
        playerId: 'player',
        calendar: calendarAt(tickAtDay(0, 12)),
        weather: 'clear',
        entities: [],
        standees: [],
        roofs: [],
        roofOpenness: () => 0,
        selection: null,
        hover: null,
        bubbles: [],
      });
    expect(scene(1.5, 1.5).sediment).toBe(1 / 7);
    expect(scene(6.5, 4.5).sediment).toBe(4 / 7);
  });

  it('gives the divine realm its radiance by atlas region', () => {
    expect(divineLevel({ ...GROVE, region: 'divine_realm' })).toBe(1);
    // the radiance follows the region, never a map id
    expect(divineLevel({ ...GROVE, id: 'divine_court', region: 'test' })).toBe(0);
    expect(divineLevel(GROVE)).toBe(0);
  });
});
