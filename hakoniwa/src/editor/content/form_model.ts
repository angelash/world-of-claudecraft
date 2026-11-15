// Form model of the content editor: converting form input to field values and back,
// field and row validation against a TableSchema, new and copied rows, search and
// sort. Pure: no DOM. The DOM layer (content_ui.ts) only wires inputs to these.

import type { FieldSchema, TableSchema } from '../../content/pack';
import { fmt, T } from '../text';
import { cloneJson } from '../util/json';
import { idOf, type Row } from './rows';

export type { Row } from './rows';

export type ParseResult = { ok: true; value: unknown } | { ok: false; error: string };

/** Ids of a content table, or undefined when the table is unknown (ref not checked). */
export type RefLookup = (table: string) => ReadonlySet<string> | undefined;

export type ProblemCode =
  | 'required'
  | 'type'
  | 'range'
  | 'enum'
  | 'ref'
  | 'id_missing'
  | 'id_duplicate';

export interface FieldProblem {
  field: string;
  code: ProblemCode;
  message: string;
}

export interface RowProblem extends FieldProblem {
  index: number;
  id: string | undefined;
}

export function isEmptyValue(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
}

/** List values edit one item per line unless they hold objects or arrays. */
export function listMode(value: unknown): 'lines' | 'json' {
  if (value === undefined || value === null) return 'lines';
  if (!Array.isArray(value)) return 'json';
  return value.every((x) => typeof x === 'string' || typeof x === 'number') ? 'lines' : 'json';
}

/** Text shown in a form input for a value. */
export function formatValue(field: FieldSchema, value: unknown): string {
  if (value === undefined || value === null) return '';
  switch (field.type) {
    case 'string':
    case 'text':
    case 'enum':
    case 'ref':
      return typeof value === 'string' ? value : JSON.stringify(value);
    case 'number':
      return typeof value === 'number' ? String(value) : JSON.stringify(value);
    case 'boolean':
      return value === true ? 'true' : value === false ? 'false' : JSON.stringify(value);
    case 'list':
      return listMode(value) === 'lines'
        ? (value as unknown[]).map(String).join('\n')
        : JSON.stringify(value, null, 2);
    case 'json':
      return JSON.stringify(value, null, 2);
  }
}

/**
 * Parse form input into a field value. Empty input means "unset" (undefined); the
 * required check is validation's job, so the user can clear a field and see why.
 * `previous` decides list item types (a list of numbers stays numeric).
 */
export function parseValue(field: FieldSchema, raw: string, previous?: unknown): ParseResult {
  const text = raw;
  const trimmed = text.trim();
  switch (field.type) {
    case 'string':
    case 'text':
      return { ok: true, value: text === '' ? undefined : text };
    case 'enum':
    case 'ref':
      return { ok: true, value: trimmed === '' ? undefined : trimmed };
    case 'number': {
      if (trimmed === '') return { ok: true, value: undefined };
      const n = Number(trimmed);
      return Number.isFinite(n) ? { ok: true, value: n } : { ok: false, error: T.field.badNumber };
    }
    case 'boolean':
      if (trimmed === '') return { ok: true, value: undefined };
      if (trimmed === 'true') return { ok: true, value: true };
      if (trimmed === 'false') return { ok: true, value: false };
      return { ok: false, error: T.field.badBoolean };
    case 'list': {
      if (listMode(previous) === 'json' && trimmed !== '') return parseJsonText(trimmed);
      const lines = text
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => l !== '');
      const numeric =
        Array.isArray(previous) &&
        previous.length > 0 &&
        previous.every((x) => typeof x === 'number');
      if (numeric) {
        const nums = lines.map(Number);
        if (nums.some((n) => !Number.isFinite(n))) return { ok: false, error: T.field.badNumber };
        return { ok: true, value: nums };
      }
      return { ok: true, value: lines };
    }
    case 'json':
      return trimmed === '' ? { ok: true, value: undefined } : parseJsonText(trimmed);
  }
}

function parseJsonText(text: string): ParseResult {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (e) {
    const detail = e instanceof Error ? e.message : '';
    return { ok: false, error: detail ? fmt(T.field.badJsonDetail, { detail }) : T.field.badJson };
  }
}

function problem(field: FieldSchema, code: ProblemCode, message: string): FieldProblem {
  return { field: field.key, code, message };
}

/** Problems of one field value (empty list = valid). */
export function validateField(
  field: FieldSchema,
  value: unknown,
  refs?: RefLookup,
): FieldProblem[] {
  if (isEmptyValue(value)) {
    return field.required ? [problem(field, 'required', T.field.required)] : [];
  }
  const out: FieldProblem[] = [];
  switch (field.type) {
    case 'string':
    case 'text':
      if (typeof value !== 'string') out.push(problem(field, 'type', T.field.notText));
      break;
    case 'number':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        out.push(problem(field, 'type', T.field.notNumber));
      } else {
        if (field.min !== undefined && value < field.min) {
          out.push(problem(field, 'range', fmt(T.field.belowMin, { min: field.min })));
        }
        if (field.max !== undefined && value > field.max) {
          out.push(problem(field, 'range', fmt(T.field.aboveMax, { max: field.max })));
        }
      }
      break;
    case 'boolean':
      if (typeof value !== 'boolean') out.push(problem(field, 'type', T.field.notBoolean));
      break;
    case 'enum':
      if (typeof value !== 'string' || !(field.options ?? []).includes(value)) {
        out.push(problem(field, 'enum', fmt(T.field.notInOptions, { v: String(value) })));
      }
      break;
    case 'ref':
      if (typeof value !== 'string') out.push(problem(field, 'type', T.field.notText));
      else out.push(...checkRef(field, value, refs));
      break;
    case 'list':
      if (!Array.isArray(value)) {
        out.push(problem(field, 'type', T.field.notList));
        break;
      }
      for (const item of value) {
        if (field.options && !field.options.includes(String(item))) {
          out.push(problem(field, 'enum', fmt(T.field.notInOptions, { v: String(item) })));
        }
        if (field.refTable) out.push(...checkRef(field, String(item), refs));
      }
      break;
    case 'json':
      break;
  }
  return out;
}

function checkRef(field: FieldSchema, value: string, refs?: RefLookup): FieldProblem[] {
  if (!field.refTable || !refs) return [];
  const ids = refs(field.refTable);
  if (!ids || ids.has(value)) return [];
  return [problem(field, 'ref', fmt(T.field.refMissing, { table: field.refTable, v: value }))];
}

export function validateRow(schema: TableSchema, row: Row, refs?: RefLookup): FieldProblem[] {
  const out: FieldProblem[] = [];
  const hasIdField = schema.fields.some((f) => f.key === schema.idField);
  if (!hasIdField && isEmptyValue(row[schema.idField])) {
    out.push({ field: schema.idField, code: 'id_missing', message: T.field.idMissing });
  }
  for (const f of schema.fields) {
    const probs = validateField(f, row[f.key], refs);
    if (f.key === schema.idField) {
      for (const p of probs) if (p.code === 'required') p.code = 'id_missing';
      if (isEmptyValue(row[f.key]) && probs.length === 0) {
        probs.push({ field: f.key, code: 'id_missing', message: T.field.idMissing });
      }
    }
    out.push(...probs);
  }
  return out;
}

/** Problems of every row of a file, including duplicate ids inside the file. */
export function validateRows(
  schema: TableSchema,
  rows: readonly Row[],
  refs?: RefLookup,
): RowProblem[] {
  const out: RowProblem[] = [];
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    const id = idOf(row, schema.idField);
    for (const p of validateRow(schema, row, refs)) out.push({ ...p, index, id });
    if (id !== undefined && id !== '') {
      if (seen.has(id)) {
        out.push({
          field: schema.idField,
          code: 'id_duplicate',
          message: fmt(T.field.idDuplicate, { id }),
          index,
          id,
        });
      } else seen.set(id, index);
    }
  });
  return out;
}

/** `prefix`, or `prefix_2`, `prefix_3`, ... whichever is free. */
export function uniqueId(prefix: string, taken: Iterable<string>): string {
  const set = new Set(taken);
  if (!set.has(prefix)) return prefix;
  for (let n = 2; ; n++) {
    const id = `${prefix}_${n}`;
    if (!set.has(id)) return id;
  }
}

export function defaultValue(field: FieldSchema): unknown {
  switch (field.type) {
    case 'number':
      return field.min ?? 0;
    case 'boolean':
      return false;
    case 'enum':
      return field.options?.[0];
    case 'list':
      return [];
    case 'string':
    case 'text':
    case 'ref':
      return '';
    case 'json':
      return undefined;
  }
}

/** Per-table templates for rows that need structure to be usable (a new map). */
export type RowTemplate = (id: string) => Row;

export function newRow(
  schema: TableSchema,
  rows: readonly Row[],
  templates: Record<string, RowTemplate> = {},
): Row {
  const ids = rows.map((r) => idOf(r, schema.idField)).filter((x): x is string => !!x);
  const id = uniqueId('new', ids);
  const template = templates[schema.table];
  if (template) return { ...template(id), [schema.idField]: id };
  const row: Row = {};
  for (const f of schema.fields) {
    if (!f.required) continue;
    const v = defaultValue(f);
    if (v !== undefined) row[f.key] = v;
  }
  row[schema.idField] = id;
  if (schema.nameField) row[schema.nameField] = T.content.newRowName;
  return row;
}

export function copyRow(schema: TableSchema, row: Row, rows: readonly Row[]): Row {
  const ids = rows.map((r) => idOf(r, schema.idField)).filter((x): x is string => !!x);
  const base = idOf(row, schema.idField) ?? 'row';
  const copy = cloneJson(row);
  copy[schema.idField] = uniqueId(`${base}_copy`, ids);
  if (schema.nameField && typeof copy[schema.nameField] === 'string') {
    copy[schema.nameField] = `${copy[schema.nameField] as string}${T.content.copySuffix}`;
  }
  return copy;
}

/** The row with one field set; undefined removes the key. */
export function setField(row: Row, key: string, value: unknown): Row {
  const out: Row = { ...row };
  if (value === undefined) delete out[key];
  else out[key] = value;
  return out;
}

/** Keys of a row the schema does not declare. */
export function extraFields(schema: TableSchema, row: Row): Row {
  const known = new Set(schema.fields.map((f) => f.key));
  known.add(schema.idField);
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (!known.has(k)) out[k] = v;
  return out;
}

/** Replace the undeclared keys of a row, keeping declared ones and their order. */
export function withExtraFields(schema: TableSchema, row: Row, extras: Row): Row {
  const known = new Set(schema.fields.map((f) => f.key));
  known.add(schema.idField);
  const out: Row = {};
  for (const [k, v] of Object.entries(row)) if (known.has(k)) out[k] = v;
  for (const [k, v] of Object.entries(extras)) if (!known.has(k)) out[k] = v;
  return out;
}

/** Short single-line text for a table cell. */
export function cellText(field: FieldSchema | undefined, value: unknown, max = 40): string {
  if (value === undefined || value === null) return '';
  let text: string;
  if (field?.type === 'boolean' || typeof value === 'boolean') {
    text = value === true ? T.common.yes : value === false ? T.common.no : String(value);
  } else if (typeof value === 'string' || typeof value === 'number') text = String(value);
  else if (Array.isArray(value)) text = `[${value.length}]`;
  else text = JSON.stringify(value);
  text = text.replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

/** Columns for the row table: id, name, then simple fields, up to `limit`. */
export function tableColumns(schema: TableSchema, limit = 7): string[] {
  const cols: string[] = [schema.idField];
  if (schema.nameField && schema.nameField !== schema.idField) cols.push(schema.nameField);
  for (const f of schema.fields) {
    if (cols.length >= limit) break;
    if (cols.includes(f.key)) continue;
    if (f.type === 'text' || f.type === 'json' || f.type === 'list') continue;
    cols.push(f.key);
  }
  return cols;
}

const SEARCHABLE = new Set(['string', 'text', 'enum', 'ref', 'number']);

/** Indices of rows matching a case-insensitive query on id, name and simple fields. */
export function filterRows(schema: TableSchema, rows: readonly Row[], query: string): number[] {
  const q = query.trim().toLowerCase();
  const all = rows.map((_, i) => i);
  if (!q) return all;
  const keys = new Set<string>([schema.idField]);
  if (schema.nameField) keys.add(schema.nameField);
  for (const f of schema.fields) if (SEARCHABLE.has(f.type)) keys.add(f.key);
  return all.filter((i) => {
    const row = rows[i] as Row;
    for (const k of keys) {
      const v = row[k];
      if ((typeof v === 'string' || typeof v === 'number') && String(v).toLowerCase().includes(q)) {
        return true;
      }
    }
    return false;
  });
}

/** Stable sort of row indices by a field; missing values last. */
export function sortIndices(
  rows: readonly Row[],
  indices: readonly number[],
  key: string,
  dir: 'asc' | 'desc',
): number[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...indices].sort((a, b) => {
    const va = (rows[a] as Row)[key];
    const vb = (rows[b] as Row)[key];
    const ea = va === undefined || va === null || va === '';
    const eb = vb === undefined || vb === null || vb === '';
    if (ea || eb) return ea === eb ? a - b : ea ? 1 : -1;
    let c: number;
    if (typeof va === 'number' && typeof vb === 'number') c = va - vb;
    else if (typeof va === 'boolean' && typeof vb === 'boolean') c = Number(va) - Number(vb);
    else c = String(va).localeCompare(String(vb), 'zh-Hans-CN');
    return c !== 0 ? c * sign : a - b;
  });
}
