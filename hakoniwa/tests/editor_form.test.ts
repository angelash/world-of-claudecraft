// Content editor form model: input parsing, field and row validation, new and copied
// rows, search and sort, plus the row diff shown before saving.

import { describe, expect, it } from 'vitest';
import type { FieldSchema, TableSchema } from '../src/content/pack';
import { diffRows, isEmptyDiff } from '../src/editor/content/diff';
import {
  copyRow,
  extraFields,
  filterRows,
  formatValue,
  newRow,
  parseValue,
  type Row,
  setField,
  sortIndices,
  tableColumns,
  uniqueId,
  validateField,
  validateRows,
  withExtraFields,
} from '../src/editor/content/form_model';

const f = (
  key: string,
  type: FieldSchema['type'],
  extra: Partial<FieldSchema> = {},
): FieldSchema => ({
  key,
  label: key,
  type,
  ...extra,
});

const SCHEMA: TableSchema = {
  table: 'monsters',
  label: '怪物',
  file: 'combat/monsters.json',
  idField: 'id',
  nameField: 'name',
  fields: [
    f('id', 'string', { required: true }),
    f('name', 'string', { required: true }),
    f('level', 'number', { min: 1, max: 60 }),
    f('elite', 'boolean'),
    f('family', 'enum', { options: ['beast', 'undead'] }),
    f('drop', 'ref', { refTable: 'items' }),
    f('tags', 'list'),
    f('loot', 'list', { refTable: 'items' }),
    f('desc', 'text'),
    f('ai', 'json'),
  ],
};

const refs = (table: string) => (table === 'items' ? new Set(['fang', 'pelt']) : undefined);

describe('parseValue', () => {
  it('treats empty input as unset for every type', () => {
    for (const field of SCHEMA.fields) {
      const r = parseValue(field, '');
      expect(r).toEqual({ ok: true, value: field.type === 'list' ? [] : undefined });
    }
  });

  it('parses numbers and rejects garbage', () => {
    expect(parseValue(f('n', 'number'), ' 12.5 ')).toEqual({ ok: true, value: 12.5 });
    const bad = parseValue(f('n', 'number'), '12a');
    expect(bad.ok).toBe(false);
  });

  it('parses booleans strictly', () => {
    expect(parseValue(f('b', 'boolean'), 'true')).toEqual({ ok: true, value: true });
    expect(parseValue(f('b', 'boolean'), 'false')).toEqual({ ok: true, value: false });
    expect(parseValue(f('b', 'boolean'), 'yes').ok).toBe(false);
  });

  it('parses lists one item per line, numeric when the old list was numeric', () => {
    expect(parseValue(f('l', 'list'), 'a\n b \n\nc')).toEqual({ ok: true, value: ['a', 'b', 'c'] });
    expect(parseValue(f('l', 'list'), '1\n2', [5])).toEqual({ ok: true, value: [1, 2] });
    expect(parseValue(f('l', 'list'), '1\nx', [5]).ok).toBe(false);
  });

  it('edits lists of objects as JSON', () => {
    const prev = [{ a: 1 }];
    expect(formatValue(f('l', 'list'), prev)).toContain('"a": 1');
    expect(parseValue(f('l', 'list'), '[{"a":2}]', prev)).toEqual({ ok: true, value: [{ a: 2 }] });
    expect(parseValue(f('l', 'list'), '[{"a":', prev).ok).toBe(false);
  });

  it('validates JSON text', () => {
    expect(parseValue(f('j', 'json'), '{"x": [1, 2]}')).toEqual({ ok: true, value: { x: [1, 2] } });
    const bad = parseValue(f('j', 'json'), '{x: 1}');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toContain('JSON');
  });

  it('round-trips through formatValue', () => {
    const cases: [FieldSchema, unknown][] = [
      [f('s', 'string'), 'abc'],
      [f('n', 'number'), 7],
      [f('b', 'boolean'), true],
      [f('l', 'list'), ['x', 'y']],
      [f('j', 'json'), { a: [1, { b: 2 }] }],
    ];
    for (const [field, value] of cases) {
      expect(parseValue(field, formatValue(field, value), value)).toEqual({ ok: true, value });
    }
  });
});

describe('validateField', () => {
  it('flags missing required values only', () => {
    expect(validateField(f('a', 'string', { required: true }), '')[0]?.code).toBe('required');
    expect(validateField(f('a', 'string', { required: true }), '  ')[0]?.code).toBe('required');
    expect(validateField(f('a', 'string'), undefined)).toEqual([]);
  });

  it('checks types', () => {
    expect(validateField(f('a', 'string'), 3)[0]?.code).toBe('type');
    expect(validateField(f('a', 'number'), '3')[0]?.code).toBe('type');
    expect(validateField(f('a', 'number'), Number.NaN)[0]?.code).toBe('type');
    expect(validateField(f('a', 'boolean'), 'true')[0]?.code).toBe('type');
    expect(validateField(f('a', 'list'), 'x')[0]?.code).toBe('type');
    expect(validateField(f('a', 'json'), { anything: true })).toEqual([]);
  });

  it('checks number range on both ends', () => {
    const lv = f('lv', 'number', { min: 1, max: 60 });
    expect(validateField(lv, 0)[0]?.code).toBe('range');
    expect(validateField(lv, 61)[0]?.code).toBe('range');
    expect(validateField(lv, 1)).toEqual([]);
    expect(validateField(lv, 60)).toEqual([]);
  });

  it('checks enum options, including list items', () => {
    const fam = f('family', 'enum', { options: ['beast', 'undead'] });
    expect(validateField(fam, 'beast')).toEqual([]);
    expect(validateField(fam, 'dragon')[0]?.code).toBe('enum');
    const tags = f('tags', 'list', { options: ['a', 'b'] });
    expect(validateField(tags, ['a', 'c']).map((p) => p.code)).toEqual(['enum']);
  });

  it('checks refs against the referenced table, single and list', () => {
    const drop = f('drop', 'ref', { refTable: 'items' });
    expect(validateField(drop, 'fang', refs)).toEqual([]);
    expect(validateField(drop, 'claw', refs)[0]?.code).toBe('ref');
    expect(validateField(drop, 'claw')).toEqual([]);
    const loot = f('loot', 'list', { refTable: 'items' });
    expect(validateField(loot, ['fang', 'claw', 'pelt'], refs).length).toBe(1);
    const other = f('x', 'ref', { refTable: 'unknown_table' });
    expect(validateField(other, 'anything', refs)).toEqual([]);
  });
});

describe('validateRows', () => {
  it('reports missing and duplicate ids with row indices', () => {
    const rows: Row[] = [
      { id: 'wolf', name: '狼' },
      { id: '', name: '无名' },
      { id: 'wolf', name: '狼二' },
    ];
    const probs = validateRows(SCHEMA, rows, refs);
    expect(probs).toContainEqual(expect.objectContaining({ index: 1, code: 'id_missing' }));
    expect(probs).toContainEqual(
      expect.objectContaining({ index: 2, code: 'id_duplicate', id: 'wolf' }),
    );
    expect(probs.filter((p) => p.index === 0)).toEqual([]);
  });

  it('reports an id missing even when the schema does not declare the id field', () => {
    const s: TableSchema = { ...SCHEMA, fields: [f('name', 'string')] };
    expect(validateRows(s, [{ name: 'x' }])[0]?.code).toBe('id_missing');
  });

  it('collects field problems per row', () => {
    const probs = validateRows(SCHEMA, [{ id: 'a', name: 'A', level: 99, drop: 'nope' }], refs);
    expect(probs.map((p) => p.field).sort()).toEqual(['drop', 'level']);
  });
});

describe('rows', () => {
  it('creates new rows with a free id and required defaults', () => {
    const rows: Row[] = [{ id: 'new' }];
    const row = newRow(SCHEMA, rows);
    expect(row.id).toBe('new_2');
    expect(row.name).toBe('新条目');
    expect(validateRows(SCHEMA, [row]).filter((p) => p.code !== 'required')).toEqual([]);
  });

  it('uses a table template when given', () => {
    const row = newRow(SCHEMA, [], { monsters: (id) => ({ id, name: 'T', level: 5 }) });
    expect(row).toEqual({ id: 'new', name: 'T', level: 5 });
  });

  it('copies rows deeply with a unique id', () => {
    const src: Row = { id: 'wolf', name: '狼', ai: { aggro: [1, 2] } };
    const rows: Row[] = [src, { id: 'wolf_copy' }];
    const copy = copyRow(SCHEMA, src, rows);
    expect(copy.id).toBe('wolf_copy_2');
    expect(copy.name).toBe('狼（副本）');
    (copy.ai as { aggro: number[] }).aggro.push(3);
    expect((src.ai as { aggro: number[] }).aggro).toEqual([1, 2]);
  });

  it('uniqueId fills gaps deterministically', () => {
    expect(uniqueId('x', [])).toBe('x');
    expect(uniqueId('x', ['x', 'x_2'])).toBe('x_3');
  });

  it('setField removes keys for undefined and never mutates', () => {
    const row: Row = { id: 'a', level: 3 };
    const next = setField(row, 'level', undefined);
    expect(next).toEqual({ id: 'a' });
    expect(row).toEqual({ id: 'a', level: 3 });
  });

  it('separates and merges undeclared fields', () => {
    const row: Row = { id: 'a', name: 'A', sediment: 3, indoor: true };
    expect(extraFields(SCHEMA, row)).toEqual({ sediment: 3, indoor: true });
    expect(withExtraFields(SCHEMA, row, { sediment: 4 })).toEqual({
      id: 'a',
      name: 'A',
      sediment: 4,
    });
  });

  it('picks compact table columns', () => {
    expect(tableColumns(SCHEMA)).toEqual(['id', 'name', 'level', 'elite', 'family', 'drop']);
  });
});

describe('search and sort', () => {
  const rows: Row[] = [
    { id: 'wolf', name: '灰狼', level: 5 },
    { id: 'bat', name: '洞穴蝙蝠', level: 2 },
    { id: 'ghoul', name: '食尸鬼' },
    { id: 'boar', name: '野猪', level: 5 },
  ];

  it('filters by id, name and numbers, case-insensitively', () => {
    expect(filterRows(SCHEMA, rows, '')).toEqual([0, 1, 2, 3]);
    expect(filterRows(SCHEMA, rows, 'WOLF')).toEqual([0]);
    expect(filterRows(SCHEMA, rows, '蝙蝠')).toEqual([1]);
    expect(filterRows(SCHEMA, rows, '5')).toEqual([0, 3]);
  });

  it('sorts stably, numbers numerically, missing values last in both directions', () => {
    const all = [0, 1, 2, 3];
    expect(sortIndices(rows, all, 'level', 'asc')).toEqual([1, 0, 3, 2]);
    expect(sortIndices(rows, all, 'level', 'desc')).toEqual([0, 3, 1, 2]);
    expect(sortIndices(rows, all, 'id', 'asc')).toEqual([1, 3, 2, 0]);
  });
});

describe('diffRows', () => {
  it('reports added, removed, changed fields and reorder', () => {
    const before: Row[] = [
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
    ];
    const after: Row[] = [
      { id: 'b', v: 2 },
      { id: 'a', v: 9, extra: true },
      { id: 'd', v: 4 },
    ];
    const d = diffRows(before, after, 'id');
    expect(d.added).toEqual(['d']);
    expect(d.removed).toEqual(['c']);
    expect(d.changed).toEqual([{ id: 'a', fields: ['v', 'extra'] }]);
    expect(d.reordered).toBe(true);
    expect(isEmptyDiff(d)).toBe(false);
  });

  it('is empty for equal rows regardless of key order', () => {
    const d = diffRows([{ id: 'a', x: 1, y: 2 }], [{ y: 2, id: 'a', x: 1 }], 'id');
    expect(isEmptyDiff(d)).toBe(true);
  });
});
