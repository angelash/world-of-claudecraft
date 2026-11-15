// The look layer's decor placement rules (docs/50_tech/art_pipeline.md 5.1 and 5.2,
// docs/40_design/world/scene_flow.md): decor is drawn but never blocks, so its foot tile
// must be one a person could stand on, never a door and never an exit. These tests pin
// lookProblems on a small hand-made map (every blocking kind, the door, the exit) and
// then hold the shipped maps to the same rules plus the scene-flow conventions.

import { describe, expect, it } from 'vitest';
import { buildContent, validateContent } from '../src/content';
import { DECOR_KINDS, type DecorDef, lookProblems, styleOf } from '../src/systems/world/look';
import { BLOCKING_TILES, type MapDef, type TileKind } from '../src/systems/world/types';

// Row 0 holds one tile of every walkable kind except the door; row 1 one tile of every
// blocking kind, then a door, a plain tile and an exit tile; '?' is not in the legend.
const PLAZA: MapDef = {
  id: 'plaza_test',
  name: '测试广场',
  region: 'borderstone_region',
  width: 10,
  height: 3,
  rows: ['.,=s_aAncb', '#~WTrx+.e?', '..........'],
  legend: {
    '.': 'grass',
    ',': 'dirt',
    '=': 'road',
    s: 'stone',
    _: 'floor',
    a: 'sand',
    A: 'ash',
    n: 'snow',
    c: 'crop',
    b: 'bridge',
    '#': 'wall',
    '~': 'water',
    W: 'deep_water',
    T: 'tree',
    r: 'rock',
    x: 'void',
    '+': 'door',
    e: 'grass',
  },
  locations: [{ id: 'square', name: '广场', kind: 'plaza', x: 0, y: 0, w: 10, h: 3 }],
  spawns: [],
  exits: [{ id: 'to_town', x: 8, y: 1, toMap: 'town', toX: 1, toY: 1, label: '回镇上' }],
};

const at = (kind: DecorDef['kind'], x: number, y: number): DecorDef => ({ kind, x, y });
const problemsFor = (decor: DecorDef[]) => lookProblems({ ...PLAZA, decor });

describe('lookProblems: decor stands where a person could stand', () => {
  it('accepts decor on every walkable ground kind, including fractional feet inside a tile', () => {
    const decor = Array.from({ length: 10 }, (_, x) => at('barrel', x + 0.5, 0.5));
    expect(problemsFor(decor)).toEqual([]);
    // (7.5, 1.5) is plain grass between the door and the exit; 0.01 and 0.99 stay in the tile
    expect(
      problemsFor([at('lamp', 7.5, 1.5), at('lamp', 7.01, 1.99), at('lamp', 0.99, 2.01)]),
    ).toEqual([]);
  });

  it('reports decor on each blocking kind, naming the kind', () => {
    const blocking: [number, TileKind][] = [
      [0, 'wall'],
      [1, 'water'],
      [2, 'deep_water'],
      [3, 'tree'],
      [4, 'rock'],
      [5, 'void'],
    ];
    for (const [x, kind] of blocking) {
      expect(BLOCKING_TILES.has(kind)).toBe(true);
      const out = problemsFor([at('crate', x + 0.5, 1.5)]);
      expect(out).toEqual([`map plaza_test: decor 0 (${x + 0.5},1.5) on a blocking ${kind} tile`]);
    }
  });

  it('treats a character missing from the legend as void, like the walkability grid', () => {
    expect(problemsFor([at('crate', 9.5, 1.5)])).toEqual([
      'map plaza_test: decor 0 (9.5,1.5) on a blocking void tile',
    ]);
  });

  it('reports decor in a doorway and on an exit tile, by the tile its foot falls in', () => {
    expect(problemsFor([at('sign', 6.5, 1.5)])).toEqual([
      'map plaza_test: decor 0 (6.5,1.5) on a door tile',
    ]);
    expect(problemsFor([at('sign', 6.9, 1.1)])).toEqual([
      'map plaza_test: decor 0 (6.9,1.1) on a door tile',
    ]);
    expect(problemsFor([at('lamp', 8.5, 1.5)])).toEqual([
      "map plaza_test: decor 0 (8.5,1.5) on the tile of exit 'to_town'",
    ]);
    // the neighbours of the door and the exit are fine
    expect(problemsFor([at('lamp', 6.5, 0.5), at('lamp', 6.5, 2.5), at('lamp', 8.5, 2.5)])).toEqual(
      [],
    );
  });

  it('numbers every bad item and reports outside-the-map once, without a tile verdict', () => {
    const out = problemsFor([
      at('lamp', 0.5, 0.5),
      at('lamp', 0.5, 1.5),
      at('lamp', -1, 0.5),
      at('lamp', 10, 0.5),
      at('lamp', 0.5, 3),
    ]);
    expect(out).toEqual([
      'map plaza_test: decor 1 (0.5,1.5) on a blocking wall tile',
      'map plaza_test: decor 2 (-1,0.5) outside the map',
      'map plaza_test: decor 3 (10,0.5) outside the map',
      'map plaza_test: decor 4 (0.5,3) outside the map',
    ]);
  });

  it('still reports an unknown kind alongside a tile problem', () => {
    const out = problemsFor([{ kind: 'rocket' as never, x: 0.5, y: 1.5 }]);
    expect(out).toEqual([
      "map plaza_test: decor 0 unknown kind 'rocket'",
      'map plaza_test: decor 0 (0.5,1.5) on a blocking wall tile',
    ]);
  });
});

describe('the shipped maps follow the scene-flow decor rules', () => {
  const content = buildContent();
  // The ten built maps of scene_flow.md (the test field is a fixture, not a scene).
  const BUILT = [
    'divine_court',
    'seal_ruins',
    'seal_ruins_depths',
    'borderstone',
    'forest_edge',
    'old_outpost',
    'ash_waste',
    'inner_court',
    'wallenburg',
    'wallenburg_sewers',
  ];
  const map = (id: string): MapDef => {
    const m = content.maps.find((q) => q.id === id);
    if (!m) throw new Error(`no map ${id}`);
    return m;
  };
  const tile = (m: MapDef, x: number, y: number): TileKind =>
    m.legend[m.rows[Math.floor(y)]?.[Math.floor(x)] ?? ''] ?? 'void';

  it('content validation passes with the look layer in place', () => {
    expect(validateContent(content).filter((p) => p.includes('decor'))).toEqual([]);
    for (const id of BUILT) expect(lookProblems(map(id))).toEqual([]);
  });

  it('every built map carries decor, kept to a modest amount, on tile centres', () => {
    for (const id of BUILT) {
      const m = map(id);
      const decor = m.decor ?? [];
      expect(decor.length, id).toBeGreaterThan(0);
      expect(decor.length, id).toBeLessThanOrEqual(m.indoor ? 12 : 60);
      for (const d of decor) {
        expect(DECOR_KINDS).toContain(d.kind);
        expect([d.x % 1, d.y % 1], `${id} ${d.kind} (${d.x},${d.y})`).toEqual([0.5, 0.5]);
      }
    }
  });

  it('decor stands beside roads, not on them', () => {
    for (const id of BUILT) {
      for (const d of map(id).decor ?? [])
        expect(tile(map(id), d.x, d.y), `${id} ${d.kind} (${d.x},${d.y})`).not.toBe('road');
    }
  });

  it('two decor items never share a tile', () => {
    for (const id of BUILT) {
      const keys = (map(id).decor ?? []).map((d) => `${Math.floor(d.x)},${Math.floor(d.y)}`);
      expect(new Set(keys).size, id).toBe(keys.length);
    }
  });

  it('underground scenes use the sealed-ruins pack; the rest keep their region pack', () => {
    for (const id of ['seal_ruins', 'seal_ruins_depths', 'wallenburg_sewers'])
      expect(styleOf(map(id)), id).toBe('sealed_ruins');
    expect(styleOf(map('borderstone'))).toBe('lothar_plain');
    expect(styleOf(map('old_outpost'))).toBe('lothar_plain');
    expect(styleOf(map('wallenburg'))).toBe('valen_city');
    expect(styleOf(map('forest_edge'))).toBe('wild_forest');
    expect(styleOf(map('ash_waste'))).toBe('ash_waste');
    expect(styleOf(map('divine_court'))).toBe('divine_court');
    expect(styleOf(map('inner_court'))).toBe('divine_court');
  });

  it('every way out of a town or wild map has a light or a sign within four tiles', () => {
    // scene_flow.md 2: exits back toward safety are marked; dungeon exits are lit by their
    // braziers or the daylight shaft, so only outdoor maps are held to this.
    for (const id of BUILT) {
      const m = map(id);
      if (m.indoor || m.exits.length === 0) continue;
      for (const e of m.exits) {
        const near = (m.decor ?? []).some(
          (d) =>
            ['lamp', 'brazier', 'sign', 'banner'].includes(d.kind) &&
            Math.hypot(d.x - (e.x + 0.5), d.y - (e.y + 0.5)) <= 4,
        );
        expect(near, `${id} exit ${e.id}`).toBe(true);
      }
    }
  });
});
