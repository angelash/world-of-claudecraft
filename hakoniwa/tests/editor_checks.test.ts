// Content check desk rules: forbidden characters, id naming, empty and invalid fields,
// map exit references, validateContent problems, and the jump targets of each issue.

import { describe, expect, it } from 'vitest';
import { allSchemas, buildContent, validateContent } from '../src/content';
import type { TableSchema } from '../src/content/pack';
import {
  type CheckInput,
  FORBIDDEN_RE,
  findForbidden,
  guessTarget,
  isValidId,
  runChecks,
  scanValue,
} from '../src/editor/checks/rules';
import { staticDataFiles } from '../src/editor/state/static_data';
import type { MapDef } from '../src/systems/world/types';

// Built from code points so this file itself stays free of the characters it tests.
const EM_DASH = String.fromCodePoint(0x2014);
const EN_DASH = String.fromCodePoint(0x2013);
const BAR = String.fromCodePoint(0x2015);
const STAR = String.fromCodePoint(0x2605);
const CHECK = String.fromCodePoint(0x2714);
const VS16 = String.fromCodePoint(0xfe0f);
const EMOJI = String.fromCodePoint(0x1f600);

const ITEMS: TableSchema = {
  table: 'items',
  label: '物品',
  file: 'combat/items.json',
  idField: 'id',
  nameField: 'name',
  fields: [
    { key: 'id', label: 'ID', type: 'string', required: true },
    { key: 'name', label: '名称', type: 'string', required: true },
    { key: 'desc', label: '描述', type: 'text' },
    { key: 'kind', label: '类别', type: 'enum', options: ['weapon', 'goods'] },
    { key: 'map', label: '地图', type: 'ref', refTable: 'maps' },
  ],
};

const MAPS: TableSchema = {
  ...(allSchemas().find((s) => s.file === 'world/maps_test.json') as TableSchema),
};

function map(id: string, extra: Partial<MapDef> = {}): MapDef {
  return {
    id,
    name: id,
    region: 'r',
    width: 5,
    height: 3,
    rows: ['#####', '#...#', '#####'],
    legend: { '#': 'wall', '.': 'floor' },
    locations: [{ id: 'gate_town', name: 'g', kind: 'gate', x: 1, y: 1, w: 1, h: 1 }],
    spawns: [],
    exits: [],
    ...extra,
  };
}

function input(files: Record<string, unknown>, problems: string[] = []): CheckInput {
  return { schemas: [ITEMS, MAPS], files: new Map(Object.entries(files)), problems };
}

describe('forbidden characters', () => {
  it('matches every forbidden class and nothing in ordinary Chinese text', () => {
    for (const ch of [EM_DASH, EN_DASH, BAR, STAR, CHECK, VS16, EMOJI]) {
      expect(FORBIDDEN_RE.test(`a${ch}b`)).toBe(true);
    }
    expect(FORBIDDEN_RE.test('边石镇的北门：通往封门遗迹（第一幕），范围 1 到 3～5。')).toBe(false);
    expect(findForbidden(`x${EMOJI}y${EM_DASH}`)).toEqual([
      { index: 1, codePoint: 0x1f600 },
      { index: 4, codePoint: 0x2014 },
    ]);
  });

  it('scans nested strings and keys with JSON paths', () => {
    const hits = scanValue([
      { id: 'a', desc: `前${EM_DASH}后`, tags: ['ok', STAR] },
      { [`k${EN_DASH}`]: 1 },
    ]);
    expect(hits.map((h) => h.path)).toEqual(['[0].desc', '[0].tags[1]', `[1].k${EN_DASH}`]);
    expect(hits[0]?.codePoint).toBe(0x2014);
  });

  it('turns hits into issues that point at the row and field', () => {
    const issues = runChecks(input({ 'combat/items.json': [{ id: 'sword', name: `剑${EMOJI}` }] }));
    const hit = issues.find((i) => i.rule === 'forbidden');
    expect(hit?.severity).toBe('error');
    expect(hit?.message).toContain('1F600');
    expect(hit?.target).toEqual({
      kind: 'row',
      file: 'combat/items.json',
      table: 'items',
      id: 'sword',
      field: 'name',
    });
  });

  it('points hits in a single-row file (one map per file) at that row', () => {
    const schema: TableSchema = { ...MAPS, file: 'combat/maps/ruins.json' };
    const issues = runChecks({
      schemas: [schema],
      files: new Map([['combat/maps/ruins.json', map('ruins', { name: `遗迹${EM_DASH}` })]]),
      problems: [],
    });
    expect(issues.find((i) => i.rule === 'forbidden')?.target).toEqual({
      kind: 'row',
      file: 'combat/maps/ruins.json',
      table: 'maps',
      id: 'ruins',
      field: 'name',
    });
  });

  it('scans data files that have no schema, pointing at the file', () => {
    const issues = runChecks(input({ 'misc/notes.json': { text: BAR } }));
    expect(issues.find((i) => i.rule === 'forbidden')?.target).toEqual({
      kind: 'file',
      file: 'misc/notes.json',
    });
  });

  it('runs over the real bundled data: no forbidden characters, every issue well formed', () => {
    // Other teams' content is still landing, so only the hard repository rule is pinned.
    const issues = runChecks({
      schemas: allSchemas(),
      files: new Map(Object.entries(staticDataFiles())),
      problems: validateContent(buildContent()),
    });
    expect(issues.filter((i) => i.rule === 'forbidden')).toEqual([]);
    for (const i of issues) {
      expect(['error', 'warning', 'info']).toContain(i.severity);
      expect(['row', 'map', 'file', 'none']).toContain(i.target.kind);
      expect(i.message.length).toBeGreaterThan(0);
    }
  });
});

describe('id naming', () => {
  it('accepts lower snake case (optionally dotted) and canonical ledger codes', () => {
    for (const ok of [
      'a',
      'seal_ruins',
      'gate_borderstone',
      'wolf2',
      'feat.kill',
      'react.greet_2',
      'M01-C01',
      'R2-X10',
    ]) {
      expect(isValidId(ok)).toBe(true);
    }
    for (const bad of [
      'M01',
      'M01-',
      'm01-c01',
      'M01_C01',
      '',
      'Wolf',
      '2wolf',
      'grey-wolf',
      'gate borderstone',
      '_x',
      '狼',
      'feat.',
      '.x',
      'a..b',
      'feat.Kill',
    ]) {
      expect(isValidId(bad)).toBe(false);
    }
  });

  it('checks table ids and ids inside maps', () => {
    const issues = runChecks(
      input({
        'combat/items.json': [{ id: 'BigSword', name: 'x' }],
        'world/maps_test.json': [
          map('town', { spawns: [{ id: 'Spawn-1', kind: 'npc', ref: 'r', x: 2.5, y: 1.5 }] }),
        ],
      }),
    );
    const ids = issues.filter((i) => i.rule === 'id');
    expect(ids.map((i) => i.severity)).toEqual(['warning', 'warning']);
    expect(ids[0]?.target).toMatchObject({ kind: 'row', id: 'BigSword' });
    expect(ids[1]?.target).toMatchObject({ kind: 'map', mapId: 'town', x: 2.5, y: 1.5 });
  });
});

describe('empty and invalid fields', () => {
  it('reports required-but-empty as errors and empty optional text as info', () => {
    const issues = runChecks(input({ 'combat/items.json': [{ id: 'a', name: '', desc: ' ' }] }));
    const empty = issues.filter((i) => i.rule === 'empty');
    expect(empty.map((i) => i.severity).sort()).toEqual(['error', 'info']);
    expect(empty.find((i) => i.severity === 'error')?.target).toMatchObject({
      id: 'a',
      field: 'name',
    });
    expect(empty.find((i) => i.severity === 'info')?.target).toMatchObject({
      id: 'a',
      field: 'desc',
    });
  });

  it('reports bad enums, dangling refs and duplicate ids as field errors', () => {
    const issues = runChecks(
      input({
        'combat/items.json': [
          { id: 'a', name: 'A', kind: 'lore', map: 'atlantis' },
          { id: 'a', name: 'A2', map: 'town' },
        ],
        'world/maps_test.json': [map('town')],
      }),
    );
    const field = issues.filter((i) => i.rule === 'field').map((i) => i.message);
    expect(field.some((m) => m.includes('lore'))).toBe(true);
    expect(field.some((m) => m.includes('atlantis'))).toBe(true);
    expect(field.some((m) => m.includes('ID 重复'))).toBe(true);
    expect(field.some((m) => m.includes('town'))).toBe(false);
  });
});

describe('map exit references', () => {
  it('flags unknown target maps and arrival locations, and the gate naming', () => {
    const town = map('town', {
      exits: [
        {
          id: 'to_ruins',
          x: 1,
          y: 1,
          toMap: 'ruins',
          toX: 0,
          toY: 0,
          toLocation: 'gate_town',
          label: 'a',
        },
        {
          id: 'to_void',
          x: 1,
          y: 1,
          toMap: 'void',
          toX: 0,
          toY: 0,
          toLocation: 'gate_town',
          label: 'b',
        },
        {
          id: 'to_ruins_bad',
          x: 1,
          y: 1,
          toMap: 'ruins',
          toX: 0,
          toY: 0,
          toLocation: 'hall',
          label: 'c',
        },
      ],
    });
    const ruins = map('ruins');
    const issues = runChecks(input({ 'world/maps_test.json': [town, ruins] }));
    const refs = issues.filter((i) => i.rule === 'map_ref');
    expect(
      refs.some((i) => i.message.includes('to_ruins：') || i.message.includes('to_ruins ')),
    ).toBe(false);
    expect(refs.filter((i) => i.severity === 'error').map((i) => i.message)).toEqual([
      expect.stringContaining('void'),
      expect.stringContaining('hall'),
    ]);
    expect(refs.find((i) => i.severity === 'warning')?.message).toContain('gate_town');
    expect(refs[0]?.target).toEqual({
      kind: 'map',
      file: 'world/maps_test.json',
      mapId: 'town',
      x: 1,
      y: 1,
    });
  });
});

describe('validateContent problems', () => {
  it('are errors linked to the first known row id they mention', () => {
    const issues = runChecks(
      input({ 'world/maps_test.json': [map('town')] }, [
        'map town: exit x -> unknown map y',
        'something odd',
      ]),
    );
    const v = issues.filter((i) => i.rule === 'validate');
    expect(v.map((i) => i.severity)).toEqual(['error', 'error']);
    expect(v[0]?.target).toEqual({ kind: 'map', file: 'world/maps_test.json', mapId: 'town' });
    expect(v[1]?.target).toEqual({ kind: 'none' });
  });

  it('guessTarget links non-map rows to the table', () => {
    const t = guessTarget('item sword: equipment without slot', [
      { schema: ITEMS, rows: [{ id: 'sword', name: 's' }] },
    ]);
    expect(t).toEqual({ kind: 'row', file: 'combat/items.json', table: 'items', id: 'sword' });
  });

  it('orders issues errors first, keeping rule order within a severity', () => {
    const issues = runChecks(
      input({ 'combat/items.json': [{ id: 'Bad', name: 'x', desc: '' }] }, ['p1']),
    );
    const sev = issues.map((i) => i.severity);
    expect(sev).toEqual(
      [...sev].sort(
        (a, b) => ['error', 'warning', 'info'].indexOf(a) - ['error', 'warning', 'info'].indexOf(b),
      ),
    );
    expect(issues[0]?.rule).toBe('validate');
  });
});
