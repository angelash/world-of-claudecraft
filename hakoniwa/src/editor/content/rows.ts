// Row access for data files and the "content with drafts" rebuild. A data file is an
// array of rows, an object holding the rows under the table name, or one row on its
// own (for example one map per file: data/combat/maps/*.json). Packs
// import their JSON statically, so to validate unsaved edits the editor takes the built
// ContentMap and swaps the rows that came from an edited file for the edited rows.
// Pure: no DOM.

import type { ContentMap } from '../../core/contracts';

export type Row = Record<string, unknown>;

export type FileShape = 'array' | 'keyed' | 'single' | 'other';

/** How a data file holds the rows of a table. */
export function fileShape(data: unknown, table: string, idField = 'id'): FileShape {
  if (Array.isArray(data)) return 'array';
  if (!data || typeof data !== 'object') return 'other';
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj[table])) return 'keyed';
  const id = obj[idField];
  return typeof id === 'string' || typeof id === 'number' ? 'single' : 'other';
}

/** Rows of a data file for a table, or null when the file is not row-shaped. */
export function rowsOf(data: unknown, table: string, idField = 'id'): Row[] | null {
  switch (fileShape(data, table, idField)) {
    case 'array':
      return data as Row[];
    case 'keyed':
      return (data as Record<string, unknown>)[table] as Row[];
    case 'single':
      return [data as Row];
    case 'other':
      return null;
  }
}

/**
 * The file data with its rows for a table replaced, keeping the file's shape. A
 * single-row file keeps exactly one row (the editor does not add or delete there).
 */
export function withRows(data: unknown, table: string, rows: Row[], idField = 'id'): unknown {
  switch (fileShape(data, table, idField)) {
    case 'keyed':
      return { ...(data as Record<string, unknown>), [table]: rows };
    case 'single':
      return rows[0] ?? data;
    default:
      return rows;
  }
}

export function idOf(row: unknown, idField: string): string | undefined {
  if (!row || typeof row !== 'object') return undefined;
  const v = (row as Record<string, unknown>)[idField];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : undefined;
}

export interface FilePatch {
  table: string;
  idField: string;
  /** rows this file contributed to the built content (matched by identity or id) */
  previous: readonly unknown[];
  /** the rows to put in their place */
  rows: readonly unknown[];
}

/**
 * Replace previous rows in an array table with new rows. The new rows go where the
 * first replaced row was (keeping pack order), or at the end when none matched.
 */
export function patchArrayTable(base: readonly unknown[], patch: FilePatch): unknown[] {
  const byRef = new Set(patch.previous);
  const byId = new Set<string>();
  for (const r of patch.previous) {
    const id = idOf(r, patch.idField);
    if (id !== undefined) byId.add(id);
  }
  const out: unknown[] = [];
  let inserted = false;
  for (const r of base) {
    const id = idOf(r, patch.idField);
    if (byRef.has(r) || (id !== undefined && byId.has(id))) {
      if (!inserted) {
        out.push(...patch.rows);
        inserted = true;
      }
      continue;
    }
    out.push(r);
  }
  if (!inserted) out.push(...patch.rows);
  return out;
}

/** A shallow copy of the content with every patch applied to its array table. */
export function patchContent(base: ContentMap, patches: readonly FilePatch[]): ContentMap {
  const out: Record<string, unknown> = { ...(base as unknown as Record<string, unknown>) };
  for (const p of patches) {
    const current = out[p.table];
    out[p.table] = patchArrayTable(Array.isArray(current) ? current : [], p);
  }
  return out as unknown as ContentMap;
}
