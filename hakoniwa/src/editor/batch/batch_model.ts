// Batch view model (release_engineering.md 7.3 and 7.5): the staged batch files of
// data/_staging/, their row diff against the workspace's data, the author's open todo
// list and unmapped catalog cells, record edits (step 3), the V1 to V10 input with the
// batch applied (step 4) and the promotion plan (step 5). The batch logic itself lives in
// tools/content/catalog/batch.ts and is shared with the command line importer; this
// module only shapes it for the view. Pure: no DOM, the reads and writes happen in
// batch_ui.ts.
//
// Promotion order (promotePlan, carried out by batch_ui.ts): the batch record is written
// first, then the target files, the index entry, and last the staged file is removed.
// Writing a data file makes the Vite dev server reload the page, so a promotion can stop
// half way; the record written first marks it, and interruptedPromotion() lets the view
// finish it (every later step is idempotent).

import {
  applyBatch,
  type BatchIndex,
  type BatchIndexEntry,
  type BatchPart,
  type BatchRecord,
  type BatchStatus,
  batchDiff,
  batchProblems,
  batchRecord,
  INDEX_FILE,
  openTodo,
  overlayContent,
  type PartDiff,
  RECORDS_DIR,
  recordFile,
  STAGING_DIR,
  type StagedBatch,
  stagingFile,
  summarizeValidation,
  type TargetSchema,
  targetProblems,
  withIndexEntry,
  withStep,
} from '../../../tools/content/catalog/batch';
import type { Todo, Unmapped } from '../../../tools/content/catalog/mapping';
import { mappingById } from '../../../tools/content/mappings';
import type {
  Finding,
  ValidationInput,
  ValidatorResult,
} from '../../../tools/content/validators/types';
import type { ContentPack } from '../../content/pack';
import type { ContentMap, FlagValue } from '../../core/contracts';
import { idOf, type Row } from '../content/rows';
import { deepEqual, errorMessage, hashText } from '../util/json';

export const MILESTONES = ['M0', 'M1', 'M2', 'M3', 'M4', 'M5', 'M6'] as const;

/** Fields a mapping requires (the todo list's source, tools/content/mappings). */
export const requiredOf = (mapping: string): readonly string[] =>
  mappingById(mapping)?.required ?? [];

/** Fields the batch's mappings require that a record still lacks. */
export function todoOf(batch: StagedBatch): Todo[] {
  return openTodo(batch, requiredOf);
}

// ---------------------------------------------------------------------------
// Listing and loading

/** Bundled module keys (`/data/_staging/x.json`) to paths under data/. */
export function bundledPaths(keys: Iterable<string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const key of keys) out.set(key.replace(/^\/data\//, ''), key);
  return out;
}

const baseName = (file: string): string => (file.split('/').pop() ?? file).replace(/\.json$/, '');

/**
 * The batches to list: the index entries, plus staged or record files the index does not
 * name (the bundled copy can list its files; the dev service cannot), sorted by name.
 */
export function batchList(index: BatchIndex, files: Iterable<string> = []): BatchIndexEntry[] {
  const out = new Map(index.batches.map((e) => [e.batch, e]));
  const named = new Set(index.batches.map((e) => e.file));
  for (const file of files) {
    if (file === INDEX_FILE || named.has(file) || !file.endsWith('.json')) continue;
    let status: BatchStatus;
    if (file.startsWith(`${STAGING_DIR}/`)) status = 'staged';
    else if (file.startsWith(`${RECORDS_DIR}/`)) status = 'promoted';
    else continue;
    const batch = baseName(file);
    if (!out.has(batch)) out.set(batch, { batch, status, file });
  }
  return [...out.values()].sort((a, b) => a.batch.localeCompare(b.batch));
}

export type LoadedBatch =
  | { kind: 'staged'; batch: StagedBatch }
  | { kind: 'record'; record: BatchRecord }
  | { kind: 'bad'; problems: string[] };

function isRecord(value: unknown): value is BatchRecord {
  const r = value as Partial<BatchRecord> | null;
  return (
    !!r &&
    typeof r === 'object' &&
    r.status === 'promoted' &&
    typeof r.batch === 'string' &&
    Array.isArray(r.files) &&
    Array.isArray(r.steps)
  );
}

/** A staged batch file, a batch record, or the structural problems of either. */
export function interpretBatchFile(value: unknown): LoadedBatch {
  if (isRecord(value)) return { kind: 'record', record: value };
  const problems = batchProblems(value);
  if (problems.length) return { kind: 'bad', problems };
  const b = value as StagedBatch;
  return {
    kind: 'staged',
    batch: {
      ...b,
      depends: Array.isArray(b.depends) ? b.depends : [],
      steps: Array.isArray(b.steps) ? b.steps : [],
      parts: b.parts.map((p) => ({
        ...p,
        unmapped: Array.isArray(p.unmapped) ? p.unmapped : [],
        todo: Array.isArray(p.todo) ? p.todo : [],
      })),
    },
  };
}

// ---------------------------------------------------------------------------
// The view of one staged batch

export type RecordState = 'added' | 'changed' | 'unchanged';

export interface RecordView {
  index: number;
  id: string;
  record: Row;
  state: RecordState;
  /** changed fields against the current data (state changed) */
  fields: string[];
  /** catalog cells of this row no mapping rule fills, with the mapping's note */
  unmapped: Unmapped[];
  /** required fields this record still lacks */
  todo: Todo[];
}

export interface PartView {
  index: number;
  part: BatchPart;
  idField: string;
  /** the mapping's one-line title, when the mapping is known */
  title?: string;
  diff: PartDiff;
  records: RecordView[];
}

export interface BatchView {
  parts: PartView[];
  todo: Todo[];
  totals: { added: number; changed: number; unchanged: number };
}

/** The note of an unmapped column (the extraction's, else the mapping's column rule). */
function withNote(mapping: string, u: Unmapped): Unmapped {
  if (u.note) return u;
  const note = mappingById(mapping)?.columns.find((c) => c.column === u.column)?.note;
  return note ? { ...u, note } : u;
}

/** Per part and record: diff state, unmapped cells and open todo against `files`. */
export function batchView(batch: StagedBatch, files: ReadonlyMap<string, unknown>): BatchView {
  const diffs = batchDiff(batch, files);
  const parts = batch.parts.map((part, index): PartView => {
    const idField = part.target.idField ?? 'id';
    // diffs are per target (file and table); parts sharing a target share its diff
    const diff = diffs.find(
      (d) => d.file === part.target.file && d.table === part.target.table,
    ) as PartDiff;
    const todo = openTodo({ ...batch, parts: [part] }, requiredOf);
    const records = part.records.map((record, i): RecordView => {
      const id = idOf(record, idField) ?? '?';
      const changed = diff.changed.find((c) => c.id === id);
      return {
        index: i,
        id,
        record,
        state: diff.added.includes(id) ? 'added' : changed ? 'changed' : 'unchanged',
        fields: changed?.fields ?? [],
        unmapped: part.unmapped.filter((u) => u.id === id).map((u) => withNote(part.mapping, u)),
        todo: todo.filter((t) => t.id === id),
      };
    });
    return { index, part, idField, title: mappingById(part.mapping)?.title, diff, records };
  });
  return {
    parts,
    todo: todoOf(batch),
    totals: {
      added: diffs.reduce((n, d) => n + d.added.length, 0),
      changed: diffs.reduce((n, d) => n + d.changed.length, 0),
      unchanged: diffs.reduce((n, d) => n + d.unchanged.length, 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Step 3: record edits

export type RecordEdit =
  | { ok: true; batch: StagedBatch }
  | { ok: false; error: 'json' | 'not_object' | 'no_id' | 'duplicate_id'; detail: string };

/** Replace one record with the author's JSON text (the id may change, not collide). */
export function editRecord(
  batch: StagedBatch,
  partIndex: number,
  recordIndex: number,
  text: string,
): RecordEdit {
  const part = batch.parts[partIndex];
  if (!part || recordIndex < 0 || recordIndex >= part.records.length)
    return { ok: false, error: 'not_object', detail: `no record ${partIndex}/${recordIndex}` };
  const idField = part.target.idField ?? 'id';
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'json', detail: errorMessage(e) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return { ok: false, error: 'not_object', detail: '' };
  const id = idOf(value, idField);
  if (id === undefined || id === '') return { ok: false, error: 'no_id', detail: idField };
  if (part.records.some((r, i) => i !== recordIndex && idOf(r, idField) === id))
    return { ok: false, error: 'duplicate_id', detail: id };
  const records = part.records.map((r, i) => (i === recordIndex ? (value as Row) : r));
  const parts = batch.parts.map((p, i) => (i === partIndex ? { ...p, records } : p));
  return { ok: true, batch: { ...batch, parts } };
}

/** Ids of the records that differ between two versions of a batch (edited ones first seen). */
export function editedIds(before: StagedBatch, after: StagedBatch): string[] {
  const out: string[] = [];
  after.parts.forEach((part, p) => {
    const idField = part.target.idField ?? 'id';
    const old = before.parts[p]?.records ?? [];
    part.records.forEach((rec, i) => {
      if (deepEqual(rec, old[i])) return;
      const id = idOf(rec, idField) ?? '?';
      if (!out.includes(id)) out.push(id);
    });
  });
  return out;
}

function withoutValidation(batch: StagedBatch): StagedBatch {
  const out = { ...batch };
  delete out.validation;
  return out;
}

/** The batch as saved after the author's fill-in: back to staged with a fill step (3). */
export function filledBatch(batch: StagedBatch, at: string, ids: readonly string[]): StagedBatch {
  const note = ids.length
    ? `filled in the editor batch view: ${ids.join(', ')}`
    : 'filled in the editor batch view';
  return withStep(
    { ...withoutValidation(batch), status: 'staged' },
    { step: 3, name: 'fill', at, note },
  );
}

/** The index with the batch's staged entry (status and staged file). */
export function stagedIndex(index: BatchIndex, batch: StagedBatch): BatchIndex {
  return withIndexEntry(index, {
    batch: batch.batch,
    status: batch.status,
    file: stagingFile(batch.batch),
  });
}

// ---------------------------------------------------------------------------
// Step 4: validation

export interface WorkspaceData {
  /** the workspace content (drafts applied) */
  content: ContentMap;
  /** every data file (drafts applied), keyed by path under data/ */
  files: ReadonlyMap<string, unknown>;
  packs: readonly ContentPack[];
}

/** Inputs the view loads lazily (game modules, source texts); each is optional. */
export interface ValidationExtras {
  codeSources?: Readonly<Record<string, string>>;
  /** world flags of a fresh world over the given content */
  initialFlags?: (content: ContentMap) => Record<string, FlagValue>;
  endingRoutes?: readonly string[];
  routeProblems?: (content: ContentMap) => readonly string[];
  uiText?: Readonly<Record<string, string>>;
}

/**
 * The V1 to V10 input with the batch applied: the content and the data files as they
 * would be after promotion. The asset id list stays undefined (the editor has no prompt
 * library reader; V7 reports it as unavailable). A failing initial-flags build leaves
 * the flags out (V9 then judges from writers only); a failing route check becomes one
 * route problem.
 */
export function validationInput(
  ws: WorkspaceData,
  batch: StagedBatch,
  milestone: number,
  extras: ValidationExtras = {},
): ValidationInput {
  const content = overlayContent(ws.content, ws.files, batch);
  const files = applyBatch(ws.files, batch);
  let initialFlags: Record<string, FlagValue> | undefined;
  try {
    initialFlags = extras.initialFlags?.(content);
  } catch {
    initialFlags = undefined;
  }
  let routeProblems: readonly string[] | undefined;
  try {
    routeProblems = extras.routeProblems?.(content);
  } catch (e) {
    routeProblems = [`route table check crashed: ${errorMessage(e)}`];
  }
  return {
    content,
    packs: ws.packs,
    files,
    milestone,
    codeSources: extras.codeSources,
    initialFlags,
    assetIds: undefined,
    uiText: extras.uiText,
    endingRoutes: extras.endingRoutes,
    routeProblems,
  };
}

/** An interface text table flattened to dotted keys (V10 scans it with the data). */
export { flattenText } from '../../../tools/content/validators/names';

/** Identity of a validation run: the workspace revision, the milestone and the batch. */
export function runKey(revision: number, milestone: string, batch: StagedBatch): string {
  return `${revision}|${milestone}|${hashText(JSON.stringify(batch))}`;
}

/** A validator's findings by level. */
export function splitFindings(r: ValidatorResult): {
  errors: Finding[];
  warnings: Finding[];
  infos: Finding[];
} {
  return {
    errors: r.findings.filter((f) => f.level === 'error'),
    warnings: r.findings.filter((f) => f.level === 'warning'),
    infos: r.findings.filter((f) => f.level === 'info'),
  };
}

// ---------------------------------------------------------------------------
// Step 5: promotion

/** Distinct target files of the batch, in part order. */
export function targetFiles(batch: StagedBatch): string[] {
  return [...new Set(batch.parts.map((p) => p.target.file))];
}

/**
 * Target files with unsaved drafts that the promotion would not write as they are (an
 * unrelated draft would be saved along with the batch).
 */
export function dirtyTargets(
  batch: StagedBatch,
  files: ReadonlyMap<string, unknown>,
  isDirty: (file: string) => boolean,
): string[] {
  const merged = applyBatch(files, batch);
  return targetFiles(batch).filter((f) => isDirty(f) && !deepEqual(files.get(f), merged.get(f)));
}

export type PromoteBlock =
  | 'readonly'
  | 'dirty'
  | 'dirty_target'
  | 'todo'
  | 'not_run'
  | 'stale'
  | 'failing';

export interface PromoteState {
  /** the dev service is available (writes possible) */
  writable: boolean;
  /** the batch has edits not saved to the staged file */
  dirty: boolean;
  dirtyTargets: readonly string[];
  todo: number;
  /** the last validation run, if any */
  run: { key: string; ok: boolean } | null;
  /** runKey of the current state */
  key: string;
}

/** Why the batch cannot be promoted now (null: it can). */
export function promoteBlock(s: PromoteState): PromoteBlock | null {
  if (!s.writable) return 'readonly';
  if (s.dirty) return 'dirty';
  if (s.dirtyTargets.length) return 'dirty_target';
  if (s.todo > 0) return 'todo';
  if (!s.run) return 'not_run';
  if (s.run.key !== s.key) return 'stale';
  if (!s.run.ok) return 'failing';
  return null;
}

export interface PromotePlan {
  /** every target file with the batch's records merged */
  writes: { file: string; data: unknown }[];
  record: BatchRecord;
  recordPath: string;
  /** the index with the batch's entry promoted */
  index: BatchIndex;
  /** the staged file to remove */
  staged: string;
  diff: PartDiff[];
}

/**
 * What a promotion writes: the merged target files, the batch record (validation summary,
 * then a validate step 4 and a promote step 5 appended), the promoted index entry and the
 * staged file to remove. Throws unless every validator is green and no field is open.
 */
export function promotePlan(
  batch: StagedBatch,
  files: ReadonlyMap<string, unknown>,
  index: BatchIndex,
  results: readonly ValidatorResult[],
  milestone: string,
  at: string,
  schemas?: readonly TargetSchema[],
): PromotePlan {
  if (results.length === 0 || !results.every((r) => r.ok))
    throw new Error('promotion needs every validator green');
  if (todoOf(batch).length) throw new Error('promotion needs every required field filled');
  const targets0 = schemas ? targetProblems(batch, files, schemas) : [];
  if (targets0.length) throw new Error(targets0.join('; '));
  const diff = batchDiff(batch, files);
  const merged = applyBatch(files, batch);
  const targets = targetFiles(batch);
  let next: StagedBatch = {
    ...batch,
    status: 'promoted',
    validation: summarizeValidation(results, milestone, at),
  };
  next = withStep(next, {
    step: 4,
    name: 'validate',
    at,
    note: `V1 to V10 green at ${milestone} (editor batch view)`,
  });
  next = withStep(next, {
    step: 5,
    name: 'promote',
    at,
    note: `into ${targets.join(', ')} (editor batch view)`,
  });
  return {
    writes: targets.map((file) => ({ file, data: merged.get(file) })),
    record: batchRecord(next, diff),
    recordPath: recordFile(batch.batch),
    index: promotedIndex(index, batch.batch),
    staged: stagingFile(batch.batch),
    diff,
  };
}

/** The index with the batch's entry promoted (its file is now the batch record). */
export function promotedIndex(index: BatchIndex, batch: string): BatchIndex {
  return withIndexEntry(index, { batch, status: 'promoted', file: recordFile(batch) });
}

/**
 * A promotion that stopped half way: the record exists and continues the staged batch's
 * steps with a promote step, while the staged file still exists (or, once it is gone, the
 * index still lists the batch as staged). A batch re-extracted under a promoted name has
 * fresh steps and does not match.
 */
export function interruptedPromotion(
  staged: StagedBatch | null,
  record: unknown,
  entry?: BatchIndexEntry,
): boolean {
  if (!isRecord(record)) return false;
  if (!staged) return !!entry && entry.status !== 'promoted';
  const steps = record.steps;
  if (steps.length <= staged.steps.length) return false;
  if (steps[steps.length - 1]?.name !== 'promote') return false;
  return staged.steps.every((s, i) => deepEqual(s, steps[i]));
}

/** The files a promotion that is being finished still has to write (merge is idempotent). */
export function finishWrites(
  batch: StagedBatch,
  files: ReadonlyMap<string, unknown>,
): { file: string; data: unknown }[] {
  const merged = applyBatch(files, batch);
  return targetFiles(batch).map((file) => ({ file, data: merged.get(file) }));
}
