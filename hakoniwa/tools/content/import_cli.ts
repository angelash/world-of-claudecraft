// The catalog importer (release_engineering.md 7.3), loaded by import_catalog.ts through
// Vite's module runner. See import_catalog.ts for the commands. Every command that moves a
// batch along records its step (with the command line) in the staged file, later in the
// batch record, so the batch report lists the seven steps as they happened.

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { allSchemas } from '../../src/content';
import { idOf, rowsOf } from '../../src/editor/content/rows';
import { formatJson } from '../../src/editor/util/json';
import {
  applyBatch,
  BATCH_NAME,
  type BatchIndex,
  type BatchPart,
  type BatchRecord,
  type BatchStep,
  batchDiff,
  batchProblems,
  batchRecord,
  groups,
  INDEX_FILE,
  openTodo,
  type PartDiff,
  readIndex,
  recordFile,
  reportMarkdown,
  type StagedBatch,
  stagingFile,
  summarizeValidation,
  type TargetSchema,
  targetProblems,
  withIndexEntry,
  withStep,
} from './catalog/batch';
import { extract, type Todo } from './catalog/mapping';
import { loadValidationInput, ROOT, readDataFiles } from './inputs';
import { MAPPINGS, mappingById } from './mappings';
import { allOk, formatReport, runValidators } from './validators';
import { milestoneIndex } from './validators/types';

type Args = Record<string, string | boolean>;

function parseArgs(argv: readonly string[]): { cmd: string; args: Args } {
  const [cmd = 'help', ...rest] = argv;
  const args: Args = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i] as string;
    if (!a.startsWith('--')) continue;
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[a.slice(2)] = next;
      i++;
    } else args[a.slice(2)] = true;
  }
  return { cmd, args };
}

const today = (): string => new Date().toISOString().slice(0, 10);
const dataPath = (file: string, root: string) => join(root, 'data', file);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeData(file: string, value: unknown, root: string): void {
  const path = dataPath(file, root);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatJson(value));
}

function readBatchIndex(root: string): BatchIndex {
  const path = dataPath(INDEX_FILE, root);
  return existsSync(path) ? readIndex(readJson(path)) : { batches: [] };
}

function checkName(name: string): string {
  if (!BATCH_NAME.test(name)) throw new Error('--batch content_<act>_<category>_<nn> is required');
  return name;
}

function readBatch(name: string, root: string): StagedBatch {
  checkName(name);
  const path = dataPath(stagingFile(name), root);
  if (!existsSync(path)) throw new Error(`no staged batch ${name} (data/${stagingFile(name)})`);
  const value = readJson(path);
  const problems = batchProblems(value);
  if (problems.length) throw new Error(`data/${stagingFile(name)}: ${problems.join('; ')}`);
  const batch = value as StagedBatch;
  if (batch.batch !== name)
    throw new Error(`data/${stagingFile(name)} holds batch ${batch.batch}, not ${name}`);
  return batch;
}

/** The content pack schemas as promotion targets (file and table). */
function targetSchemas(): TargetSchema[] {
  return allSchemas().map((s) => ({ file: s.file, table: s.table, idField: s.idField }));
}

function checkTargets(batch: StagedBatch, root: string): void {
  const problems = targetProblems(batch, readDataFiles(root), targetSchemas());
  if (problems.length) throw new Error(problems.join('; '));
}

function readRecord(name: string, root: string): BatchRecord | null {
  const path = dataPath(recordFile(name), root);
  return existsSync(path) ? (readJson(path) as BatchRecord) : null;
}

function saveBatch(batch: StagedBatch, root: string): void {
  writeData(stagingFile(batch.batch), batch, root);
  writeData(
    INDEX_FILE,
    withIndexEntry(readBatchIndex(root), {
      batch: batch.batch,
      status: batch.status,
      file: stagingFile(batch.batch),
    }),
    root,
  );
}

/** Fields the batch's mappings still need filled. */
export function todoOf(batch: StagedBatch): Todo[] {
  return openTodo(batch, (id) => mappingById(id)?.required ?? []);
}

/**
 * Text of an array data file with records appended, keeping the file's hand formatting
 * (blank lines between groups); null when the file is not a plain array.
 */
export function appendRecordsText(text: string, records: readonly unknown[]): string | null {
  const body = text.replace(/\s+$/, '');
  if (!body.startsWith('[') || !body.endsWith(']')) return null;
  const head = body.slice(0, -1).replace(/\s+$/, '');
  const inner = formatJson(records).replace(/\s+$/, '').split('\n').slice(1, -1).join('\n');
  if (inner === '') return null;
  const sep = head.endsWith('[') ? '\n' : ',\n';
  return `${head}${sep}${inner}\n]\n`;
}

/** A command-line argument as typed in a shell (quoted when it holds spaces or quotes). */
export function quoteArg(a: string): string {
  if (/^[A-Za-z0-9_.,:/=@+-]+$/.test(a)) return a;
  return `"${a.replace(/["\\$`]/g, (c) => `\\${c}`)}"`;
}

function step(
  name: BatchStep['name'],
  n: number,
  argv: readonly string[],
  note?: string,
): BatchStep {
  const s: BatchStep = {
    step: n,
    name,
    at: today(),
    command: `node tools/content/import_catalog.ts ${argv.map(quoteArg).join(' ')}`,
  };
  if (note) s.note = note;
  return s;
}

function printDiff(diff: readonly PartDiff[]): void {
  for (const d of diff) {
    console.log(`  ${d.file} (${d.table})`);
    console.log(`    added: ${d.added.join(', ') || 'none'}`);
    console.log(
      `    changed: ${d.changed.map((c) => `${c.id} (${c.fields.join(', ')})`).join('; ') || 'none'}`,
    );
    if (d.unchanged.length) console.log(`    unchanged: ${d.unchanged.join(', ')}`);
  }
}

function cmdMappings(): number {
  for (const m of MAPPINGS)
    console.log(
      `${m.id.padEnd(30)} ${m.catalog.replace('docs/40_design/content/', '')} ${m.section} -> ${m.target.file} (${m.target.table})  ${m.title}`,
    );
  return 0;
}

function cmdExtract(args: Args, argv: readonly string[], root: string): number {
  const name = String(args.batch ?? '');
  const mapping = mappingById(String(args.mapping ?? ''));
  if (!BATCH_NAME.test(name)) throw new Error('--batch content_<act>_<category>_<nn> is required');
  if (!mapping)
    throw new Error(`--mapping must be one of: ${MAPPINGS.map((m) => m.id).join(', ')}`);
  if (readRecord(name, root))
    throw new Error(
      `${name} is already promoted (data/${recordFile(name)}); stage a new batch number`,
    );
  const ids = typeof args.ids === 'string' ? args.ids.split(',').map((s) => s.trim()) : undefined;
  const md = readFileSync(join(root, mapping.catalog), 'utf8');
  const ex = extract(md, mapping, ids);
  if (ex.missing.length) throw new Error(`ids not in ${mapping.id}: ${ex.missing.join(', ')}`);
  const part: BatchPart = {
    mapping: mapping.id,
    catalog: mapping.catalog,
    section: mapping.section,
    target: mapping.target,
    records: ex.records,
    unmapped: ex.unmapped,
    todo: ex.todo,
  };
  const exists = existsSync(dataPath(stagingFile(name), root));
  let batch: StagedBatch = exists
    ? readBatch(name, root)
    : {
        batch: name,
        status: 'staged',
        scope:
          typeof args.scope === 'string'
            ? args.scope
            : `${mapping.catalog} section ${mapping.section}${ids ? `: ${ids.join(', ')}` : ''}`,
        depends:
          typeof args.depends === 'string' ? args.depends.split(',').map((s) => s.trim()) : [],
        parts: [],
        steps: [],
      };
  if (!exists) batch = withStep(batch, step('scope', 1, argv, batch.scope));
  if (batch.parts.some((p) => p.mapping === mapping.id) && args.replace !== true)
    throw new Error(
      `${name} already has a ${mapping.id} part; pass --replace to extract it again (the author's fills in it are lost)`,
    );
  batch = {
    ...batch,
    status: 'staged',
    validation: undefined,
    parts: [...batch.parts.filter((p) => p.mapping !== mapping.id), part],
  };
  checkTargets(batch, root);
  batch = withStep(
    batch,
    step(
      'extract',
      2,
      argv,
      `${ex.records.length} records, ${ex.unmapped.length} unmapped cells, ${ex.todo.length} fields to fill`,
    ),
  );
  saveBatch(batch, root);
  console.log(
    `staged ${ex.records.length} records into data/${stagingFile(name)} (catalog line ${ex.line})`,
  );
  const byColumn = new Map<string, number>();
  for (const u of ex.unmapped) byColumn.set(u.column, (byColumn.get(u.column) ?? 0) + 1);
  for (const [column, n] of byColumn) {
    const note = mapping.columns.find((c) => c.column === column)?.note;
    console.log(`  unmapped column ${column}: ${n} cells${note ? ` (${note})` : ''}`);
  }
  for (const t of todoOf(batch)) console.log(`  to fill: ${t.id}.${t.field} (${t.reason})`);
  printDiff(batchDiff(batch, readDataFiles(root)));
  return 0;
}

function runChecks(batch: StagedBatch, milestoneLabel: string, warnings: boolean, root: string) {
  const input = loadValidationInput({ milestone: milestoneIndex(milestoneLabel), batch, root });
  const results = runValidators(input);
  for (const line of formatReport(results, { warnings })) console.log(line);
  return results;
}

function cmdValidate(args: Args, argv: readonly string[], root: string): number {
  const name = String(args.batch ?? '');
  let batch = readBatch(name, root);
  const label = typeof args.milestone === 'string' ? args.milestone : 'M0';
  checkTargets(batch, root);
  const todo = todoOf(batch);
  for (const t of todo) console.log(`to fill: ${t.id}.${t.field}`);
  console.log(`validating data/ with ${name} applied (${label})`);
  printDiff(batchDiff(batch, readDataFiles(root)));
  const results = runChecks(batch, label, args.warnings === true, root);
  const ok = allOk(results) && todo.length === 0;
  batch = {
    ...batch,
    status: ok ? 'validated' : 'staged',
    validation: summarizeValidation(results, label, today()),
  };
  batch = withStep(
    batch,
    step('validate', 4, argv, ok ? 'V1 to V10 green' : `failing (${todo.length} fields to fill)`),
  );
  saveBatch(batch, root);
  console.log(ok ? 'batch validated' : 'batch not valid');
  return ok ? 0 : 1;
}

function cmdFill(args: Args, argv: readonly string[], root: string): number {
  const name = String(args.batch ?? '');
  let batch = readBatch(name, root);
  const note = typeof args.note === 'string' ? args.note : 'fields filled in the staged file';
  batch = withStep(
    { ...batch, status: 'staged', validation: undefined },
    step('fill', 3, argv, note),
  );
  saveBatch(batch, root);
  const todo = todoOf(batch);
  console.log(
    todo.length ? `${todo.length} fields still to fill` : 'no required field left to fill',
  );
  for (const t of todo) console.log(`  to fill: ${t.id}.${t.field}`);
  return 0;
}

/**
 * The file texts a promotion writes: per target file, the batch's rows appended as text when
 * the file is a plain array and every record is new (the file keeps its hand formatting),
 * else the whole file rewritten with the editor's formatter (updated rows, keyed or
 * single-row files keep their shape). A file that already holds the result is skipped, so
 * finishing an interrupted promotion writes only what is missing.
 */
export function promotionWrites(
  batch: StagedBatch,
  files: ReadonlyMap<string, unknown>,
  textOf: (file: string) => string | undefined,
): { file: string; text: string }[] {
  const next = applyBatch(files, batch);
  const out: { file: string; text: string }[] = [];
  const targets = [...new Set(groups(batch).map((g) => g.file))];
  for (const file of targets) {
    const before = files.get(file);
    const after = next.get(file);
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    const onlyAdded = groups(batch)
      .filter((g) => g.file === file)
      .every((g) => {
        const present = new Set(
          (rowsOf(before, g.table, g.idField) ?? []).map((r) => idOf(r, g.idField)),
        );
        return g.records.every((r) => !present.has(idOf(r, g.idField)));
      });
    const records = groups(batch)
      .filter((g) => g.file === file)
      .flatMap((g) => g.records);
    const text = (textOf(file) ?? '[]\n').replace(/\r\n/g, '\n');
    const appended =
      onlyAdded && Array.isArray(before ?? []) ? appendRecordsText(text, records) : null;
    out.push({ file, text: appended ?? formatJson(after) });
  }
  return out;
}

function cmdPromote(args: Args, argv: readonly string[], root: string): number {
  const name = String(args.batch ?? '');
  let batch = readBatch(name, root);
  if (batch.status !== 'validated')
    throw new Error(`${name} is ${batch.status}; validate it first`);
  const label = batch.validation?.milestone ?? 'M0';
  const existing = readRecord(name, root);
  const files = readDataFiles(root);
  let record: BatchRecord;
  if (existing) {
    // an interrupted promotion: the record was written first; finish the remaining steps
    // without recomputing it (the data may already hold the rows)
    console.log(`finishing the interrupted promotion of ${name}`);
    record = existing;
  } else {
    checkTargets(batch, root);
    // the data may have moved since validation: validate again against the current files
    const results = runChecks(batch, label, false, root);
    if (!allOk(results) || todoOf(batch).length) {
      console.log('promotion refused: the batch no longer validates');
      return 1;
    }
    const diff = batchDiff(batch, files);
    batch = {
      ...batch,
      status: 'promoted',
      validation: summarizeValidation(results, label, today()),
    };
    batch = withStep(
      batch,
      step(
        'promote',
        5,
        argv,
        `into ${[...new Set(batch.parts.map((p) => p.target.file))].join(', ')}`,
      ),
    );
    record = batchRecord(batch, diff);
    // the record first: an interrupted promotion is then visible (rerun promote, or the
    // editor's batch view, finishes it), and every later write is idempotent
    writeData(recordFile(name), record, root);
  }
  for (const w of promotionWrites(batch, files, (file) => {
    const path = dataPath(file, root);
    return existsSync(path) ? readFileSync(path, 'utf8') : undefined;
  })) {
    const path = dataPath(w.file, root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, w.text);
  }
  writeData(
    INDEX_FILE,
    withIndexEntry(readBatchIndex(root), {
      batch: name,
      status: 'promoted',
      file: recordFile(name),
    }),
    root,
  );
  rmSync(dataPath(stagingFile(name), root));
  console.log(`promoted ${name}; record in data/${recordFile(name)}`);
  printDiff(record.diff ?? []);
  return 0;
}

function appendStep(name: string, s: BatchStep, root: string): BatchRecord | StagedBatch {
  const record = readRecord(name, root);
  if (record) {
    const next = { ...record, steps: [...record.steps, s] };
    writeData(recordFile(name), next, root);
    return next;
  }
  const batch = withStep(readBatch(name, root), s);
  saveBatch(batch, root);
  return batch;
}

function cmdVerify(args: Args, argv: readonly string[], root: string): number {
  const name = String(args.batch ?? '');
  const note = typeof args.note === 'string' ? args.note : '';
  if (!note) throw new Error('--note "<command and result>" is required');
  appendStep(name, step('verify', 6, argv, note), root);
  console.log(`recorded verification for ${name}`);
  return 0;
}

function diffOfRecord(r: BatchRecord): PartDiff[] {
  return r.diff ?? [];
}

function cmdReport(args: Args, argv: readonly string[], root: string): number {
  const name = String(args.batch ?? '');
  const after = appendStep(name, step('report', 7, argv), root);
  const diff =
    after.status === 'promoted'
      ? diffOfRecord(after as BatchRecord)
      : batchDiff(after as StagedBatch, readDataFiles(root));
  const md = reportMarkdown(after, diff);
  if (typeof args.out === 'string') writeFileSync(args.out, md);
  console.log(md);
  return 0;
}

function cmdStatus(args: Args, root: string): number {
  if (typeof args.batch === 'string') {
    const record = readRecord(args.batch, root);
    const b = record ?? readBatch(args.batch, root);
    console.log(JSON.stringify({ ...b, parts: undefined }, null, 2));
    if (!record)
      for (const t of todoOf(b as StagedBatch)) console.log(`to fill: ${t.id}.${t.field}`);
    return 0;
  }
  const index = readBatchIndex(root);
  if (index.batches.length === 0) console.log('no batches');
  for (const e of index.batches)
    console.log(`${e.batch.padEnd(32)} ${e.status.padEnd(10)} data/${e.file}`);
  return 0;
}

const HELP = `usage: node tools/content/import_catalog.ts <command> [options]
  mappings                                   list the catalog mappings
  extract  --mapping <id> --batch <name> [--ids a,b] [--depends x,y] [--scope "..."]
                                             steps 1 and 2: stage records in data/_staging/<name>.json
  fill     --batch <name> [--note "..."]     step 3: record the author's fill-in, list what is left
  validate --batch <name> [--milestone M0] [--warnings]
                                             step 4: V1 to V10 with the batch applied
  promote  --batch <name>                    step 5: merge into data/, keep the record in data/_batches/
  verify   --batch <name> --note "..."       step 6: record a verification (tests, playthrough)
  report   --batch <name> [--out <file>]     step 7: print the batch report (markdown)
  status   [--batch <name>]                  list batches, or show one`;

export async function main(argv: string[], root = ROOT): Promise<number> {
  const { cmd, args } = parseArgs(argv);
  try {
    switch (cmd) {
      case 'mappings':
        return cmdMappings();
      case 'extract':
        return cmdExtract(args, argv, root);
      case 'fill':
        return cmdFill(args, argv, root);
      case 'validate':
        return cmdValidate(args, argv, root);
      case 'promote':
        return cmdPromote(args, argv, root);
      case 'verify':
        return cmdVerify(args, argv, root);
      case 'report':
        return cmdReport(args, argv, root);
      case 'status':
        return cmdStatus(args, root);
      default:
        console.log(HELP);
        return cmd === 'help' ? 0 : 1;
    }
  } catch (e) {
    console.error(`import_catalog: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}
