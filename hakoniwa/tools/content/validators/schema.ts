// V1 schema (release_engineering.md 7.4): fields, types and required values. Two sources,
// both existing code: every pack validator through validateContent (src/content/index.ts;
// the registry pack is left to V4 so its rules are reported once), and the pack schemas
// (TableSchema) applied row by row with the editor's form model (validateRows), the same
// check the editor runs before saving. The asset fields of every appearance (sheet, doll
// layers, portrait, bust, variants) are shape-checked with the world system's own
// appearanceProblems (src/systems/world/appearance.ts: an asset id of the right category);
// whether the asset is in the requirement list is V7. Reference fields are V2.

import { validateContent } from '../../../src/content';
import type { FieldSchema, TableSchema } from '../../../src/content/pack';
import { type RowProblem, validateRows } from '../../../src/editor/content/form_model';
import { rowsOf } from '../../../src/editor/content/rows';
import { appearanceProblems } from '../../../src/systems/world/appearance';
import type { Appearance } from '../../../src/systems/world/types';
import type { Finding, ValidationInput, Validator } from './types';

/** The pack whose rules V4 reports. */
export const REGISTRY_PACK = 'registry';

function detail(field: FieldSchema | undefined, p: RowProblem, value: unknown): string {
  switch (p.code) {
    case 'required':
    case 'id_missing':
      return 'required value missing';
    case 'type':
      return `expected ${field?.type ?? 'another type'}, got ${Array.isArray(value) ? 'array' : typeof value}`;
    case 'range':
      return `${String(value)} outside ${field?.min ?? ''} to ${field?.max ?? ''}`;
    case 'enum':
      return `value not in (${(field?.options ?? []).join(', ')})`;
    default:
      return p.code;
  }
}

/** Schema problems of the rows of every schema file present in `files`. */
export function schemaFindings(
  schemas: readonly TableSchema[],
  files: ReadonlyMap<string, unknown>,
): Finding[] {
  const out: Finding[] = [];
  for (const schema of schemas) {
    const rows = rowsOf(files.get(schema.file), schema.table, schema.idField);
    if (!rows) continue;
    for (const p of validateRows(schema, rows)) {
      // duplicate ids are the generic validateContent check, references are V2
      if (p.code === 'id_duplicate' || p.code === 'ref') continue;
      const field = schema.fields.find((f) => f.key === p.field);
      const value = rows[p.index]?.[p.field];
      out.push({
        level: 'error',
        message: `${schema.file} ${schema.table}:${p.id ?? `#${p.index + 1}`} ${p.field}: ${detail(field, p, value)}`,
        file: schema.file,
        table: schema.table,
        row: p.id,
        path: p.field,
      });
    }
  }
  return out;
}

/** Shape problems of the `appearance` field of every row that has one. */
export function appearanceFindings(content: ValidationInput['content']): Finding[] {
  const out: Finding[] = [];
  for (const [table, value] of Object.entries(content as unknown as Record<string, unknown>)) {
    if (!Array.isArray(value)) continue;
    for (const row of value) {
      const a = (row as { appearance?: unknown } | null)?.appearance;
      if (!a || typeof a !== 'object') continue;
      const id = (row as { id?: unknown }).id;
      const rowId = typeof id === 'string' ? id : '';
      for (const message of appearanceProblems(`${table} ${rowId}`, a as Appearance))
        out.push({ level: 'error', message, table, row: rowId, path: 'appearance' });
    }
  }
  return out;
}

export const schemaValidator: Validator = {
  id: 'V1',
  title: 'schema',
  run(input: ValidationInput): Finding[] {
    const out: Finding[] = [];
    const packs = input.packs.filter((p) => p.id !== REGISTRY_PACK);
    // generic checks (unique ids), then each pack validator isolated so one that throws
    // on half-filled staged data is reported instead of hiding the others
    for (const message of validateContent(input.content, [])) out.push({ level: 'error', message });
    for (const pack of packs) {
      try {
        for (const message of pack.validate?.(input.content) ?? [])
          out.push({ level: 'error', message: `${pack.id}: ${message}` });
      } catch (e) {
        out.push({
          level: 'error',
          message: `${pack.id}: validator crashed (${e instanceof Error ? e.message : String(e)})`,
        });
      }
    }
    out.push(...appearanceFindings(input.content));
    out.push(
      ...schemaFindings(
        packs.flatMap((p) => p.schemas ?? []),
        input.files,
      ),
    );
    return out;
  },
};
