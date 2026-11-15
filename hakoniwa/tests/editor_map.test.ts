// Map editor: immutable editing operations, the undo stack, and map checks
// (shape, objects, exit references, reachability via the world system's findPath).

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import {
  checkExitRefs,
  checkMap,
  checkObjects,
  checkReachability,
  checkShape,
  walkComponents,
} from '../src/editor/map/map_checks';
import {
  addObject,
  blankMap,
  charAt,
  fillRect,
  hitTest,
  isMapLike,
  legendUsage,
  lineCells,
  moveObject,
  newExit,
  newLocation,
  newSpawn,
  paintCells,
  rectBetween,
  removeLegend,
  removeObject,
  resizeMap,
  setLegend,
  updateObject,
} from '../src/editor/map/map_ops';
import { TILE_COLORS, TILE_KINDS } from '../src/editor/map/palette';
import { History } from '../src/editor/util/history';
import { gridOf } from '../src/systems/world/grid';
import type { MapDef } from '../src/systems/world/types';

/** 7x5: a wall splits the floor into a west room (x 1..2) and an east room (x 4..5). */
function twoRooms(): MapDef {
  return {
    id: 'rooms',
    name: '双室',
    region: 'test',
    width: 7,
    height: 5,
    rows: ['#######', '#..#..#', '#..#..#', '#..#..#', '#######'],
    legend: { '#': 'wall', '.': 'floor', '+': 'door' },
    locations: [
      { id: 'west', name: '西室', kind: 'home', x: 1, y: 1, w: 2, h: 3 },
      { id: 'east', name: '东室', kind: 'home', x: 4, y: 1, w: 2, h: 3 },
    ],
    spawns: [],
    exits: [{ id: 'out', x: 0, y: 2, toMap: 'rooms', toX: 1, toY: 1, label: '门' }],
  };
}

describe('map operations', () => {
  it('paints cells without mutating the input', () => {
    const map = twoRooms();
    const rowsBefore = [...map.rows];
    const next = paintCells(map, [{ x: 3, y: 2 }], '+');
    expect(next).not.toBe(map);
    expect(map.rows).toEqual(rowsBefore);
    expect(charAt(next, 3, 2)).toBe('+');
    expect(next.rows[1]).toBe(map.rows[1]);
  });

  it('returns the same map when nothing changes (no empty undo steps)', () => {
    const map = twoRooms();
    expect(paintCells(map, [{ x: 0, y: 0 }], '#')).toBe(map);
    expect(paintCells(map, [{ x: 99, y: 0 }], '.')).toBe(map);
  });

  it('fills rectangles from two corners in any order', () => {
    const map = twoRooms();
    const r = rectBetween({ x: 5, y: 3 }, { x: 4, y: 1 });
    expect(r).toEqual({ x: 4, y: 1, w: 2, h: 3 });
    const next = fillRect(map, r, '#');
    expect(next.rows[1]).toBe('#..####');
    expect(next.rows[3]).toBe('#..####');
  });

  it('draws gapless lines', () => {
    const cells = lineCells({ x: 0, y: 0 }, { x: 5, y: 2 });
    expect(cells[0]).toEqual({ x: 0, y: 0 });
    expect(cells[cells.length - 1]).toEqual({ x: 5, y: 2 });
    for (let i = 1; i < cells.length; i++) {
      const a = cells[i - 1] as { x: number; y: number };
      const b = cells[i] as { x: number; y: number };
      expect(Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y))).toBe(1);
    }
  });

  it('resizes keeping the top-left content', () => {
    const map = twoRooms();
    const big = resizeMap(map, 9, 6, '.');
    expect(big.width).toBe(9);
    expect(big.rows.length).toBe(6);
    expect(big.rows[0]).toBe('#######..');
    expect(big.rows[5]).toBe('.........');
    const small = resizeMap(map, 3, 2, '.');
    expect(small.rows).toEqual(['###', '#..']);
  });

  it('manages the legend and refuses to drop a used character', () => {
    const map = twoRooms();
    expect(legendUsage(map)).toEqual({ '#': 23, '.': 12, '+': 0 });
    expect(removeLegend(map, '#')).toBeNull();
    const without = removeLegend(map, '+') as MapDef;
    expect(Object.keys(without.legend)).toEqual(['#', '.']);
    expect(setLegend(map, '~', 'water').legend['~']).toBe('water');
  });

  it('adds, updates, moves and removes objects immutably', () => {
    let map = twoRooms();
    const original = map;
    const sp = newSpawn(map, { x: 4, y: 2 });
    expect(sp).toMatchObject({ id: 'rooms_spawn', x: 4.5, y: 2.5 });
    map = addObject(map, 'spawn', sp);
    map = updateObject(map, { kind: 'spawn', id: sp.id }, { ref: 'wolf', count: 2 });
    map = moveObject(map, { kind: 'spawn', id: sp.id }, 1, 0);
    expect(map.spawns[0]).toMatchObject({ ref: 'wolf', count: 2, x: 5.5 });
    map = updateObject(map, { kind: 'spawn', id: sp.id }, { count: undefined });
    expect('count' in (map.spawns[0] as object)).toBe(false);
    map = removeObject(map, { kind: 'spawn', id: sp.id });
    expect(map.spawns).toEqual([]);
    expect(original.spawns).toEqual([]);
    expect(newLocation(map, { x: 1, y: 1, w: 1, h: 1 }).id).toBe('loc');
    expect(newExit(map, { x: 6, y: 2 }).id).toBe('exit');
  });

  it('hit-tests exits before spawns before the smallest location', () => {
    let map = twoRooms();
    map = addObject(map, 'location', { id: 'nook', name: 'n', kind: 'x', x: 1, y: 1, w: 1, h: 1 });
    map = addObject(map, 'spawn', { id: 's', kind: 'npc', ref: 'r', x: 2.5, y: 2.5 });
    expect(hitTest(map, 0, 2)).toEqual({ kind: 'exit', id: 'out' });
    expect(hitTest(map, 2, 2)).toEqual({ kind: 'spawn', id: 's' });
    expect(hitTest(map, 1, 1)).toEqual({ kind: 'location', id: 'nook' });
    expect(hitTest(map, 1, 3)).toEqual({ kind: 'location', id: 'west' });
    expect(hitTest(map, 3, 0)).toBeNull();
  });

  it('keeps the world grid cache honest: an edited map gets a fresh grid', () => {
    const map = twoRooms();
    expect(gridOf(map).walk[2 * 7 + 3]).toBe(0);
    const opened = paintCells(map, [{ x: 3, y: 2 }], '+');
    expect(gridOf(opened).walk[2 * 7 + 3]).toBe(1);
    expect(gridOf(map).walk[2 * 7 + 3]).toBe(0);
  });

  it('recognises map-shaped rows only', () => {
    expect(isMapLike(twoRooms())).toBe(true);
    expect(isMapLike({ ...twoRooms(), legend: [] })).toBe(false);
    expect(isMapLike({ ...twoRooms(), rows: [1] })).toBe(false);
    expect(isMapLike(blankMap('m', 'M', 4, 3))).toBe(true);
  });

  it('gives every tile kind a colour', () => {
    expect(TILE_KINDS.length).toBe(Object.keys(TILE_COLORS).length);
    expect(TILE_KINDS).toContain('deep_water');
  });
});

describe('History', () => {
  it('undoes and redoes commits', () => {
    const h = new History('a');
    h.commit('b');
    h.commit('c');
    expect(h.undo()).toBe('b');
    expect(h.undo()).toBe('a');
    expect(h.undo()).toBeUndefined();
    expect(h.present).toBe('a');
    expect(h.redo()).toBe('b');
    expect(h.present).toBe('b');
    h.commit('x');
    expect(h.canRedo).toBe(false);
  });

  it('merges a batch into one step and skips empty batches', () => {
    const h = new History(0);
    h.begin();
    h.commit(1);
    h.commit(2);
    h.commit(3);
    h.end();
    expect(h.undoDepth).toBe(1);
    expect(h.undo()).toBe(0);
    h.begin();
    h.end();
    expect(h.undoDepth).toBe(0);
  });

  it('cancels a batch back to its start', () => {
    const h = new History('a');
    h.begin();
    h.commit('b');
    h.cancel();
    expect(h.present).toBe('a');
    expect(h.canUndo).toBe(false);
  });

  it('undo during a batch closes it first', () => {
    const h = new History('a');
    h.begin();
    h.commit('b');
    expect(h.undo()).toBe('a');
    expect(h.redo()).toBe('b');
  });

  it('is bounded', () => {
    const h = new History(0, 3);
    for (let i = 1; i <= 10; i++) h.commit(i);
    expect(h.undoDepth).toBe(3);
    h.undo();
    h.undo();
    expect(h.undo()).toBe(7);
    expect(h.undo()).toBeUndefined();
  });

  it('reset forgets everything', () => {
    const h = new History('a');
    h.commit('b');
    h.reset('z');
    expect(h.present).toBe('z');
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
  });
});

describe('map checks', () => {
  it('passes the bundled test map, and checks every bundled map without throwing', () => {
    const maps = buildContent().maps;
    const testfield = maps.find((m) => m.id === 'testfield') as MapDef;
    expect(checkMap(testfield, maps).filter((i) => i.severity !== 'info')).toEqual([]);
    for (const m of maps) expect(Array.isArray(checkMap(m, maps))).toBe(true);
  });

  it('reports grid shape problems', () => {
    const map = { ...twoRooms(), rows: ['#######', '#..#..', '#..X..#', '#..#..#'] };
    const msgs = checkShape(map).map((i) => i.message);
    expect(msgs.some((m) => m.includes('行数'))).toBe(true);
    expect(msgs.some((m) => m.includes('第 1 行宽度'))).toBe(true);
    expect(msgs.some((m) => m.includes('"X"'))).toBe(true);
    expect(
      checkShape({ ...twoRooms(), legend: { '#': 'lava' as never, '.': 'floor' } })[0]?.message,
    ).toContain('lava');
  });

  it('finds unreachable locations and exits through the wall', () => {
    const issues = checkReachability(twoRooms());
    const east = issues.find((i) => i.ref?.id === 'east');
    expect(east?.severity).toBe('error');
    expect(issues.find((i) => i.ref?.id === 'west')).toBeUndefined();
    expect(issues.some((i) => i.message.includes('2 块'))).toBe(true);
    const opened = paintCells(twoRooms(), [{ x: 3, y: 2 }], '+');
    expect(checkReachability(opened).filter((i) => i.severity !== 'info')).toEqual([]);
  });

  it('reports a path the default search budget cannot find', () => {
    const issues = checkReachability(paintCells(twoRooms(), [{ x: 3, y: 2 }], '+'), 2);
    expect(issues.find((i) => i.ref?.id === 'east')?.message).toContain('节点上限');
  });

  it('agrees with walkComponents on the partition', () => {
    const c = walkComponents(twoRooms());
    expect(c.sizes).toEqual([6, 6]);
    expect(c.labels[0]).toBe(-1);
    expect(c.labels[1 * 7 + 1]).not.toBe(c.labels[1 * 7 + 4]);
  });

  it('checks object bounds, duplicates, blocked spawns and unusable exits', () => {
    // Widen with solid wall so x 9 has no walkable tile within 1.8 tiles.
    let map = resizeMap(twoRooms(), 10, 5, '#');
    map = addObject(map, 'location', {
      id: 'west',
      name: 'dup',
      kind: 'x',
      x: 8,
      y: 3,
      w: 4,
      h: 4,
    });
    map = addObject(map, 'spawn', { id: 'wall_spawn', kind: 'monster', ref: 'w', x: 3.5, y: 2.5 });
    map = addObject(map, 'exit', {
      id: 'buried',
      x: 9,
      y: 2,
      toMap: 'rooms',
      toX: 1,
      toY: 1,
      label: 'x',
    });
    const msgs = checkObjects(map).map((i) => `${i.severity}:${i.message}`);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('ID 重复：west'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('超出地图范围'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('warning:') && m.includes('wall_spawn'))).toBe(true);
    expect(msgs.some((m) => m.startsWith('error:') && m.includes('buried'))).toBe(true);
    expect(msgs.some((m) => m.includes('out'))).toBe(false);
  });

  it('checks exit targets and the gate_<map> naming convention', () => {
    const ruins: MapDef = {
      ...twoRooms(),
      id: 'seal_ruins',
      locations: [{ id: 'gate_borderstone', name: '入口', kind: 'gate', x: 1, y: 1, w: 1, h: 1 }],
      exits: [],
    };
    const town: MapDef = {
      ...twoRooms(),
      id: 'borderstone',
      exits: [
        {
          id: 'north',
          x: 0,
          y: 2,
          toMap: 'seal_ruins',
          toX: 0,
          toY: 0,
          toLocation: 'gate_borderstone',
          label: '北门',
        },
        {
          id: 'bad_loc',
          x: 0,
          y: 2,
          toMap: 'seal_ruins',
          toX: 0,
          toY: 0,
          toLocation: 'nowhere',
          label: 'x',
        },
        { id: 'bad_map', x: 0, y: 2, toMap: 'atlantis', toX: 0, toY: 0, label: 'x' },
        { id: 'no_map', x: 0, y: 2, toMap: '', toX: 0, toY: 0, label: 'x' },
        { id: 'xy_out', x: 0, y: 2, toMap: 'seal_ruins', toX: 50, toY: 0, label: 'x' },
      ],
    };
    const issues = checkExitRefs(town, [ruins, town]);
    const by = (id: string) => issues.filter((i) => i.ref?.id === id).map((i) => i.severity);
    expect(by('north')).toEqual([]);
    expect(by('bad_loc')).toEqual(['error', 'warning']);
    expect(by('bad_map')).toEqual(['error']);
    expect(by('no_map')).toEqual(['error']);
    expect(by('xy_out')).toEqual(['info', 'error']);
  });
});
