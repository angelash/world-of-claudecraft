// Declarative mappings from a design catalog table to staged data records
// (release_engineering.md 7.1 and 7.3 step 2). A mapping names the catalog, the section,
// the expected header row and the target data file and table, then one rule per column:
// which field it fills and with which cell parser, or that it stays with the author.
// Constants (`defaults`) and a small `derive` hook cover fields no single column carries.
// The engine is generic; a new catalog table is a new mapping module under
// tools/content/mappings/, never a new parser. Pure.

import { type MdTable, parseTables, rowId, tablesInSection } from './markdown';
import { type CellParser, PARSERS } from './parsers';

export type Row = Record<string, unknown>;

export interface ColumnRule {
  /** header text as written in the catalog */
  column: string;
  /** target field; omit to leave the column with the author (listed as unmapped) */
  field?: string;
  /** cell parser: a PARSERS name or a function */
  parse?: string | CellParser;
  /** why the column stays with the author, when it has no field */
  note?: string;
  /** the column feeds the mapping's derive hook (not listed as unmapped) */
  derived?: boolean;
}

export interface CatalogMapping {
  /** mapping id, e.g. `gathering.dian_sources` */
  id: string;
  /** one English line: what the mapping imports */
  title: string;
  /** catalog path under hakoniwa/ */
  catalog: string;
  /** heading number (or full heading text) of the section holding the table */
  section: string;
  /** the table's header row, in order (selects the table inside the section) */
  headers: readonly string[];
  /** where the records go */
  target: { file: string; table: string; idField?: string };
  columns: readonly ColumnRule[];
  /** constant fields of every record, with the reason in the mapping module's comments */
  defaults?: Readonly<Row>;
  /** fields computed from the record and the raw cells (by header) */
  derive?: (record: Row, cells: Readonly<Record<string, string>>) => void;
  /** fields every record needs before validation (missing ones go to the todo list) */
  required?: readonly string[];
  /** key order of the records (the target file's convention); unlisted keys follow */
  fieldOrder?: readonly string[];
}

export interface Unmapped {
  id: string;
  column: string;
  value: string;
  note?: string;
}

export interface Todo {
  id: string;
  field: string;
  reason: string;
}

export interface Extraction {
  mapping: string;
  catalog: string;
  section: string;
  /** 1-based line of the table's header row */
  line: number;
  records: Row[];
  unmapped: Unmapped[];
  todo: Todo[];
  /** requested ids the table does not have */
  missing: string[];
}

function parserOf(rule: ColumnRule): CellParser {
  if (typeof rule.parse === 'function') return rule.parse;
  const p = PARSERS[rule.parse ?? 'text'];
  if (!p) throw new Error(`unknown cell parser ${String(rule.parse)} for column ${rule.column}`);
  return p;
}

function setPath(target: Row, path: string, value: unknown): void {
  const parts = path.split('.');
  let cur = target;
  for (const p of parts.slice(0, -1)) {
    const next = cur[p];
    if (!next || typeof next !== 'object' || Array.isArray(next)) cur[p] = {};
    cur = cur[p] as Row;
  }
  cur[parts[parts.length - 1] as string] = value;
}

function getPath(target: Row, path: string): unknown {
  let cur: unknown = target;
  for (const p of path.split('.')) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = (cur as Row)[p];
  }
  return cur;
}

/** The mapping's table in a parsed document, or an error message. */
export function findTable(tables: readonly MdTable[], mapping: CatalogMapping): MdTable | string {
  const candidates = tablesInSection(tables, mapping.section).filter(
    (t) =>
      t.headers.length === mapping.headers.length &&
      t.headers.every((h, i) => h === mapping.headers[i]),
  );
  if (candidates.length === 0)
    return `${mapping.catalog}: no table with headers ${mapping.headers.join(' | ')} under section ${mapping.section}`;
  if (candidates.length > 1)
    return `${mapping.catalog}: ${candidates.length} tables match under section ${mapping.section}`;
  return candidates[0] as MdTable;
}

/** Validate a mapping against its table's headers: every rule names a real column. */
export function mappingProblems(mapping: CatalogMapping): string[] {
  const out: string[] = [];
  const headers = new Set(mapping.headers);
  for (const r of mapping.columns) {
    if (!headers.has(r.column)) out.push(`${mapping.id}: rule for unknown column ${r.column}`);
    if (typeof r.parse === 'string' && !PARSERS[r.parse])
      out.push(`${mapping.id}: unknown parser ${r.parse}`);
  }
  if (!mapping.columns.some((r) => r.field === (mapping.target.idField ?? 'id')))
    out.push(`${mapping.id}: no column fills the id field`);
  return out;
}

/**
 * Map the id rows of the mapping's table to records. `ids` selects rows (in table order);
 * without it every id row is taken.
 */
export function extract(md: string, mapping: CatalogMapping, ids?: readonly string[]): Extraction {
  const problems = mappingProblems(mapping);
  if (problems.length) throw new Error(problems.join('; '));
  const table = findTable(parseTables(md), mapping);
  if (typeof table === 'string') throw new Error(table);
  const idField = mapping.target.idField ?? 'id';
  const want = ids ? new Set(ids) : null;
  const out: Extraction = {
    mapping: mapping.id,
    catalog: mapping.catalog,
    section: mapping.section,
    line: table.line,
    records: [],
    unmapped: [],
    todo: [],
    missing: [],
  };
  const seen = new Set<string>();
  for (const row of table.rows) {
    const id = rowId(row);
    if (!id || (want && !want.has(id))) continue;
    seen.add(id);
    const cells: Record<string, string> = {};
    table.headers.forEach((h, i) => {
      cells[h] = row.cells[i] ?? '';
    });
    const record: Row = structuredClone({ ...(mapping.defaults ?? {}) });
    for (const header of table.headers) {
      const rule = mapping.columns.find((r) => r.column === header);
      const cell = cells[header] ?? '';
      if (!rule?.field) {
        if (cell.trim() !== '' && !rule?.derived)
          out.unmapped.push({ id, column: header, value: cell, note: rule?.note });
        continue;
      }
      const value = parserOf(rule)(cell);
      if (value === undefined) {
        out.todo.push({ id, field: rule.field, reason: `column ${header} gave no value: ${cell}` });
        continue;
      }
      setPath(record, rule.field, value);
    }
    mapping.derive?.(record, cells);
    // the id field first, then the mapping's field order, as in the data files
    const ordered: Row = { [idField]: record[idField] };
    for (const k of mapping.fieldOrder ?? []) if (k in record) ordered[k] = record[k];
    Object.assign(ordered, record);
    for (const field of mapping.required ?? []) {
      if (
        getPath(ordered, field) === undefined &&
        !out.todo.some((t) => t.id === id && t.field === field)
      )
        out.todo.push({ id, field, reason: 'required field not filled' });
    }
    out.records.push(ordered);
  }
  if (want) for (const id of want) if (!seen.has(id)) out.missing.push(id);
  return out;
}
