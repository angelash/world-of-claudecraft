// Content batches (release_engineering.md 7.3; dev_process.md 3.1 and 3.5): the staged
// file data/_staging/<batch>.json (records waiting for review, never loaded by the
// kernel), its row diff against data/, the overlay that lets the validators see the data
// as if the batch were promoted, the promotion into the target files, and the batch
// record kept in data/_batches/<batch>.json after promotion (the staged file is removed).
// data/_staging/index.json lists every batch for the editor's batch view. Pure: files go
// in and out as values; tools/content/import_cli.ts and the editor do the reading and
// writing.

import type { ContentMap } from '../../../src/core/contracts';
import { diffRows } from '../../../src/editor/content/diff';
import {
  fileShape,
  idOf,
  patchContent,
  type Row,
  rowsOf,
  withRows,
} from '../../../src/editor/content/rows';
import type { ValidatorResult } from '../validators/types';
import type { Todo, Unmapped } from './mapping';

export const STAGING_DIR = '_staging';
export const RECORDS_DIR = '_batches';
export const INDEX_FILE = `${STAGING_DIR}/index.json`;

/** Batch names: content_<act or base>_<category>_<two digits> (dev_process.md 3.1). */
export const BATCH_NAME = /^content_[a-z0-9]+_[a-z0-9_]+_[0-9]{2}$/;

export const stagingFile = (batch: string): string => `${STAGING_DIR}/${batch}.json`;
export const recordFile = (batch: string): string => `${RECORDS_DIR}/${batch}.json`;

/** Data files under these directories are tooling state, never content. */
export function isToolingFile(file: string): boolean {
  return file.startsWith(`${STAGING_DIR}/`) || file.startsWith(`${RECORDS_DIR}/`);
}

export type BatchStatus = 'staged' | 'validated' | 'promoted';

/** One step of the seven-step flow (7.3), as it happened. */
export interface BatchStep {
  step: number;
  name: 'scope' | 'extract' | 'fill' | 'validate' | 'promote' | 'verify' | 'report';
  /** ISO date (yyyy-mm-dd) */
  at: string;
  command?: string;
  note?: string;
}

export interface BatchPart {
  mapping: string;
  catalog: string;
  section: string;
  target: { file: string; table: string; idField?: string };
  records: Row[];
  /** catalog columns no mapping rule fills, per row (for the author) */
  unmapped: Unmapped[];
  /** fields the author still has to fill */
  todo: Todo[];
}

export interface ValidationSummary {
  milestone: string;
  at: string;
  ok: boolean;
  results: { id: string; title: string; errors: number; warnings: number }[];
}

export interface StagedBatch {
  batch: string;
  status: BatchStatus;
  /** one line: what the batch covers (catalog section or id list) */
  scope: string;
  depends: string[];
  parts: BatchPart[];
  steps: BatchStep[];
  validation?: ValidationSummary;
}

export interface BatchIndexEntry {
  batch: string;
  status: BatchStatus;
  /** path under data/: the staged file, or the record once promoted */
  file: string;
}

export interface BatchIndex {
  batches: BatchIndexEntry[];
}

export interface PartDiff {
  file: string;
  table: string;
  added: string[];
  changed: { id: string; fields: string[] }[];
  unchanged: string[];
}

/** The batch record kept after promotion (step 7). */
export interface BatchRecord {
  batch: string;
  status: 'promoted';
  scope: string;
  depends: string[];
  sources: { mapping: string; catalog: string; section: string }[];
  files: string[];
  added: string[];
  changed: { id: string; fields: string[] }[];
  removed: string[];
  /** the same ids per target file and table */
  diff: PartDiff[];
  /** catalog cells no mapping rule filled, as staged (for the next author) */
  unmapped: Unmapped[];
  validation?: ValidationSummary;
  steps: BatchStep[];
}

export function emptyIndex(): BatchIndex {
  return { batches: [] };
}

export function readIndex(value: unknown): BatchIndex {
  const list = (value as { batches?: unknown } | undefined)?.batches;
  if (!Array.isArray(list)) return emptyIndex();
  return {
    batches: list.filter(
      (e): e is BatchIndexEntry =>
        !!e &&
        typeof (e as BatchIndexEntry).batch === 'string' &&
        typeof (e as BatchIndexEntry).file === 'string',
    ),
  };
}

/** The index with one entry set (added or replaced), sorted by batch name. */
export function withIndexEntry(index: BatchIndex, entry: BatchIndexEntry): BatchIndex {
  const batches = index.batches.filter((e) => e.batch !== entry.batch);
  batches.push(entry);
  batches.sort((a, b) => a.batch.localeCompare(b.batch));
  return { batches };
}

/** Structural problems of a staged batch file (empty: usable). */
export function batchProblems(value: unknown): string[] {
  const b = value as Partial<StagedBatch> | null;
  if (!b || typeof b !== 'object') return ['not an object'];
  const out: string[] = [];
  if (typeof b.batch !== 'string' || !BATCH_NAME.test(b.batch)) out.push('bad batch name');
  if (!Array.isArray(b.parts) || b.parts.length === 0) out.push('no parts');
  for (const [i, p] of (b.parts ?? []).entries()) {
    const file = p?.target?.file;
    if (!p || typeof file !== 'string' || typeof p.target?.table !== 'string') {
      out.push(`part ${i}: no target`);
      continue;
    }
    if (!/^[a-z0-9_]+(\/[a-z0-9_]+)*\.json$/.test(file) || isToolingFile(file))
      out.push(`part ${i}: target ${file} is not a data file path`);
    if (!Array.isArray(p.records)) {
      out.push(`part ${i}: no records`);
      continue;
    }
    const idField = p.target.idField ?? 'id';
    const seen = new Set<string>();
    for (const r of p.records) {
      const id = idOf(r, idField);
      if (id === undefined) out.push(`part ${i}: a record has no ${idField}`);
      else if (seen.has(id)) out.push(`part ${i}: record ${id} appears twice`);
      else seen.add(id);
    }
  }
  return out;
}

/** Where a part's records may go: a file a pack schema loads into that table. */
export interface TargetSchema {
  file: string;
  table: string;
  idField: string;
}

/**
 * Problems of the batch's targets against the data: the target file must be one a pack
 * loads into the table (else the promoted rows never reach the game), a single-row file
 * only takes its own row, and a record id may not already live in another file of the
 * same table (that would be a second row with the id, not an update).
 */
export function targetProblems(
  batch: StagedBatch,
  files: ReadonlyMap<string, unknown>,
  schemas: readonly TargetSchema[],
): string[] {
  const out: string[] = [];
  for (const g of groups(batch)) {
    if (!schemas.some((s) => s.file === g.file && s.table === g.table))
      out.push(`${g.file}: no content pack loads it into table ${g.table}`);
    const data = files.get(g.file);
    if (data !== undefined && fileShape(data, g.table, g.idField) === 'single') {
      const own = idOf(data, g.idField);
      for (const r of g.records)
        if (idOf(r, g.idField) !== own)
          out.push(`${g.file}: a single-row file only takes its own row ${own}`);
    }
    for (const s of schemas) {
      if (s.table !== g.table || s.file === g.file) continue;
      const other = new Set(
        (rowsOf(files.get(s.file), s.table, s.idField) ?? []).map((r) => idOf(r, s.idField)),
      );
      for (const r of g.records) {
        const id = idOf(r, g.idField);
        if (id !== undefined && other.has(id))
          out.push(`${g.table}:${id} already lives in ${s.file}; update it there`);
      }
    }
  }
  return out;
}

/**
 * The rows with the records merged in: a record whose id exists updates that row (the
 * mapped fields win, fields the catalog does not carry stay), a new id is appended.
 */
export function mergeRows(
  existing: readonly Row[],
  records: readonly Row[],
  idField = 'id',
): Row[] {
  const out = existing.map((r) => r);
  for (const rec of records) {
    const id = idOf(rec, idField);
    const at = out.findIndex((r) => idOf(r, idField) === id);
    if (at >= 0) out[at] = { ...(out[at] as Row), ...rec };
    else out.push(rec);
  }
  return out;
}

/** The parts of a batch grouped by target file and table, records in part order. */
export interface TargetGroup {
  file: string;
  table: string;
  idField: string;
  records: Row[];
}

export function groups(batch: StagedBatch): TargetGroup[] {
  const out: TargetGroup[] = [];
  for (const part of batch.parts) {
    const idField = part.target.idField ?? 'id';
    let g = out.find((x) => x.file === part.target.file && x.table === part.target.table);
    if (!g) {
      g = { file: part.target.file, table: part.target.table, idField, records: [] };
      out.push(g);
    }
    g.records.push(...part.records);
  }
  return out;
}

/** Row diff of each target (file and table) against the current data files. */
export function batchDiff(batch: StagedBatch, files: ReadonlyMap<string, unknown>): PartDiff[] {
  return groups(batch).map((g) => {
    const before = rowsOf(files.get(g.file), g.table, g.idField) ?? [];
    const after = mergeRows(before, g.records, g.idField);
    const d = diffRows(before, after, g.idField);
    const ids = [...new Set(g.records.map((r) => idOf(r, g.idField) ?? ''))];
    const changed = d.changed.filter((c) => ids.includes(c.id));
    return {
      file: g.file,
      table: g.table,
      added: d.added,
      changed,
      unchanged: ids.filter((id) => !d.added.includes(id) && !changed.some((c) => c.id === id)),
    };
  });
}

/** The data files as they would be after promotion (only the target files change). */
export function applyBatch(
  files: ReadonlyMap<string, unknown>,
  batch: StagedBatch,
): Map<string, unknown> {
  const out = new Map(files);
  for (const g of groups(batch)) {
    const data = out.get(g.file);
    const merged = mergeRows(rowsOf(data, g.table, g.idField) ?? [], g.records, g.idField);
    out.set(g.file, data === undefined ? merged : withRows(data, g.table, merged, g.idField));
  }
  return out;
}

/** The content as it would be built after promotion (the editor's draft overlay). */
export function overlayContent(
  base: ContentMap,
  files: ReadonlyMap<string, unknown>,
  batch: StagedBatch,
): ContentMap {
  return patchContent(
    base,
    groups(batch).map((g) => {
      const previous = rowsOf(files.get(g.file), g.table, g.idField) ?? [];
      return {
        table: g.table,
        idField: g.idField,
        previous,
        rows: mergeRows(previous, g.records, g.idField),
      };
    }),
  );
}

export function summarizeValidation(
  results: readonly ValidatorResult[],
  milestone: string,
  at: string,
): ValidationSummary {
  return {
    milestone,
    at,
    ok: results.every((r) => r.ok),
    results: results.map((r) => ({
      id: r.id,
      title: r.title,
      errors: r.errors,
      warnings: r.warnings,
    })),
  };
}

/**
 * Fields the batch's mappings require that a record still lacks: the author's list for
 * step 3 (`required` gives a mapping's required fields, tools/content/mappings).
 */
export function openTodo(
  batch: StagedBatch,
  required: (mapping: string) => readonly string[],
): Todo[] {
  const out: Todo[] = [];
  for (const part of batch.parts) {
    const idField = part.target.idField ?? 'id';
    for (const rec of part.records) {
      for (const field of required(part.mapping)) {
        const v = field
          .split('.')
          .reduce<unknown>(
            (cur, k) =>
              cur && typeof cur === 'object' ? (cur as Record<string, unknown>)[k] : undefined,
            rec,
          );
        if (v === undefined || v === null || v === '')
          out.push({ id: idOf(rec, idField) ?? '?', field, reason: 'required field not filled' });
      }
    }
  }
  return out;
}

/** The batch with one step appended. */
export function withStep(batch: StagedBatch, step: BatchStep): StagedBatch {
  return { ...batch, steps: [...batch.steps, step] };
}

export function batchRecord(batch: StagedBatch, diff: readonly PartDiff[]): BatchRecord {
  return {
    batch: batch.batch,
    status: 'promoted',
    scope: batch.scope,
    depends: batch.depends,
    sources: batch.parts.map((p) => ({
      mapping: p.mapping,
      catalog: p.catalog,
      section: p.section,
    })),
    files: [...new Set(batch.parts.map((p) => p.target.file))],
    added: diff.flatMap((d) => d.added),
    changed: diff.flatMap((d) => d.changed),
    removed: [],
    diff: [...diff],
    unmapped: batch.parts.flatMap((p) => p.unmapped),
    validation: batch.validation,
    steps: batch.steps,
  };
}

/** The batch report (dev_process.md 3.5 batch_report.md) as markdown. */
export function reportMarkdown(
  record: BatchRecord | StagedBatch,
  diff: readonly PartDiff[],
): string {
  const lines: string[] = [];
  lines.push(`# ${record.batch} batch report`, '');
  lines.push(`- Scope: ${record.scope}`);
  lines.push(`- Depends on: ${record.depends.length ? record.depends.join(', ') : 'none'}`);
  lines.push(`- Status: ${record.status}`, '');
  lines.push('## Ids', '');
  for (const d of diff) {
    lines.push(`- ${d.file} (${d.table})`);
    lines.push(`  - added: ${d.added.length ? d.added.join(', ') : 'none'}`);
    lines.push(
      `  - changed: ${d.changed.length ? d.changed.map((c) => `${c.id} (${c.fields.join(', ')})`).join('; ') : 'none'}`,
    );
  }
  lines.push('  - removed: none', '');
  lines.push('## Validation', '');
  const v = record.validation;
  if (!v) lines.push('not validated');
  else {
    lines.push(`${v.milestone}, ${v.at}: ${v.ok ? 'all green' : 'failing'}`, '');
    for (const r of v.results)
      lines.push(`- ${r.id} ${r.title}: ${r.errors} errors, ${r.warnings} warnings`);
  }
  lines.push('', '## Steps', '');
  for (const s of record.steps)
    lines.push(
      `${s.step}. ${s.name} (${s.at})${s.command ? `: \`${s.command}\`` : ''}${s.note ? `. ${s.note}` : ''}`,
    );
  return `${lines.join('\n')}\n`;
}
