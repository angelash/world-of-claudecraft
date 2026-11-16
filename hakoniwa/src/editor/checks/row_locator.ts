// Locate the data file of a content row named only by its table and id (a validator
// finding, a flag use), so the row can be opened in the content tool through
// target_links.ts. Shared by the batch view and the registry view. Pure.

import type { TableSchema } from '../../content/pack';
import { idOf, rowsOf } from '../content/rows';
import type { IssueTarget } from './rules';

export type RowLocator = (table: string, id: string, path?: string) => IssueTarget;

/** The top-level field of a row path such as `[2].stages[0].effects` or `trigger`. */
export function topField(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return /^(?:\[\d+\])?\.?([A-Za-z_$][\w$]*)/.exec(path)?.[1];
}

/** A locator over the workspace's schemas and data files (drafts included). */
export function rowLocator(
  schemas: readonly TableSchema[],
  files: ReadonlyMap<string, unknown>,
): RowLocator {
  const index = new Map<string, Map<string, string>>();
  const idsOf = (table: string): Map<string, string> => {
    let ids = index.get(table);
    if (ids) return ids;
    ids = new Map();
    for (const schema of schemas) {
      if (schema.table !== table) continue;
      for (const row of rowsOf(files.get(schema.file), table, schema.idField) ?? []) {
        const id = idOf(row, schema.idField);
        if (id !== undefined && !ids.has(id)) ids.set(id, schema.file);
      }
    }
    index.set(table, ids);
    return ids;
  };
  return (table, id, path) => {
    const file = idsOf(table).get(id);
    if (file === undefined) return { kind: 'none' };
    return { kind: 'row', file, table, id, field: topField(path) };
  };
}
