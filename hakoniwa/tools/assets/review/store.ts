// The asset review desk's file side (assets/README.md 3.3 and 3.4): reads the manifest, the
// tool register, the prompt library and the candidate pool; adopts pool takes as originals
// (encode, register a review record); applies review decisions (rejected originals move to
// _rejected/); appends every action to assets/review_log.jsonl. Writes are temp-then-rename
// so a crash never leaves half a manifest. Used by review/routes.ts on the dev server.

import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, relative, sep } from 'node:path';
import { parseOgg } from '../core/audio/ogg';
import {
  type ManifestRecord,
  manifestJson,
  type ToolRecord,
  upsertRecord,
  validateManifest,
} from '../core/manifest';
import { readPngText } from '../core/png';
import { aigcLabelOf, newRecord } from '../core/register';
import { decodeAudio, encodeOgg, ffmpegPath } from '../ffmpeg';
import { processedFilesOf } from '../import';
import { type LibraryEntry, listFiles, loadLibrary, readJson, sha256, today } from '../lib';
import {
  type AssetRow,
  applyDecision,
  buildRows,
  type Candidate,
  type CandidateSet,
  candidateSetProblems,
  checkAdoption,
  type Decision,
  type EntryInfo,
  type KindCounts,
  type ReviewEvent,
  reasonCodesFor,
  safeCandidatePath,
  summarize,
  unregisteredFiles,
} from './model';

export class ReviewError extends Error {
  constructor(
    readonly code: string,
    readonly details: string[] = [],
  ) {
    super(details.length > 0 ? `${code}: ${details.join('; ')}` : code);
  }
}

const SAMPLE_RATE = 48000;

export interface DeskPaths {
  assets: string;
  manifest: string;
  tools: string;
  prompts: string;
  pool: string;
  rejected: string;
  log: string;
}

/** Paths under <root>/assets; promptsDir overrides the prompt library (tests use the real one). */
export function deskPaths(root: string, promptsDir?: string): DeskPaths {
  const assets = join(root, 'assets');
  return {
    assets,
    manifest: join(assets, 'manifest.json'),
    tools: join(assets, 'tools.json'),
    prompts: promptsDir ?? join(assets, 'prompts'),
    pool: join(assets, '_candidates'),
    rejected: join(assets, '_rejected'),
    log: join(assets, 'review_log.jsonl'),
  };
}

function writeAtomic(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, text);
  renameSync(temp, path);
}

interface SpecItem {
  id: string;
  subject?: { zh?: string; en?: string };
}

const subjectCache = new Map<
  string,
  { signature: string; map: Map<string, { zh: string; en: string }> }
>();

/** Subject text of every prompt entry, cached until a spec file changes. */
function subjects(promptsDir: string): Map<string, { zh: string; en: string }> {
  const dir = join(promptsDir, 'specs');
  if (!existsSync(dir)) return new Map();
  const names = readdirSync(dir)
    .filter((n) => n.endsWith('.json'))
    .sort();
  const signature = names.map((n) => `${n}:${statSync(join(dir, n)).mtimeMs}`).join('|');
  const hit = subjectCache.get(dir);
  if (hit && hit.signature === signature) return hit.map;
  const map = new Map<string, { zh: string; en: string }>();
  for (const n of names) {
    const spec = readJson<{ items?: SpecItem[] }>(join(dir, n), {});
    for (const it of spec.items ?? []) {
      if (it.subject) map.set(it.id, { zh: it.subject.zh ?? '', en: it.subject.en ?? '' });
    }
  }
  subjectCache.set(dir, { signature, map });
  return map;
}

function entryInfos(paths: DeskPaths): {
  lib: Map<string, LibraryEntry>;
  infos: Map<string, EntryInfo>;
  problems: string[];
} {
  const lib = loadLibrary(paths.prompts);
  const subj = subjects(paths.prompts);
  const infos = new Map<string, EntryInfo>();
  for (const e of lib.expected.values()) {
    const s = subj.get(e.id);
    infos.set(e.id, {
      id: e.id,
      kind: e.kind,
      file: e.file,
      template: e.template,
      milestone: e.milestone,
      category: e.category,
      ...(s ? { subject: s } : {}),
    });
  }
  return { lib: lib.expected, infos, problems: lib.problems };
}

/** Every candidates.json under _candidates/<kind>/<id>/, with the problems of broken ones. */
export function readCandidateSets(paths: DeskPaths): { sets: CandidateSet[]; problems: string[] } {
  const sets: CandidateSet[] = [];
  const problems: string[] = [];
  for (const kind of ['art', 'audio'] as const) {
    const dir = join(paths.pool, kind);
    if (!existsSync(dir)) continue;
    for (const id of readdirSync(dir).sort()) {
      const file = join(dir, id, 'candidates.json');
      if (!existsSync(file)) continue;
      const where = `_candidates/${kind}/${id}/candidates.json`;
      let value: unknown;
      try {
        value = JSON.parse(readFileSync(file, 'utf8'));
      } catch {
        problems.push(`${where}: not valid JSON`);
        continue;
      }
      const issues = candidateSetProblems(value, where);
      if ((value as CandidateSet)?.assetId !== id) issues.push(`${where}: assetId must be ${id}`);
      if (sets.some((s) => s.assetId === id))
        issues.push(`${where}: ${id} is pooled under two kinds`);
      if (issues.length > 0) problems.push(...issues);
      else sets.push(value as CandidateSet);
    }
  }
  return { sets, problems };
}

export function readRecords(paths: DeskPaths): ManifestRecord[] {
  return readJson<ManifestRecord[]>(paths.manifest, []);
}

export function readTools(paths: DeskPaths): ToolRecord[] {
  return readJson<ToolRecord[]>(paths.tools, []);
}

export interface DeskListing {
  today: string;
  rows: AssetRow[];
  summary: Record<'art' | 'audio', KindCounts>;
  reasonCodes: { art: readonly string[]; audio: readonly string[] };
  tools: ToolRecord[];
  problems: string[];
}

export function listDesk(paths: DeskPaths): DeskListing {
  const { infos, problems } = entryInfos(paths);
  const records = readRecords(paths);
  const pool = readCandidateSets(paths);
  const onDisk = [...listFiles(paths.assets, 'art'), ...listFiles(paths.assets, 'audio')];
  const loose = unregisteredFiles(onDisk, records);
  // Processed results beside each record (import output), so review sees what ships.
  const rows = buildRows(infos, records, pool.sets, loose).map((row) => {
    if (!row.record) return row;
    const processed = processedFilesOf(paths.assets, row.record).filter(
      (f) => !f.endsWith('.json'),
    );
    return processed.length > 0 ? { ...row, processed } : row;
  });
  return {
    today: today(),
    rows,
    summary: summarize(infos, records, pool.sets, loose),
    reasonCodes: { art: reasonCodesFor('art'), audio: reasonCodesFor('audio') },
    tools: readTools(paths),
    problems: [...problems, ...pool.problems],
  };
}

export function readLog(paths: DeskPaths, id?: string): ReviewEvent[] {
  if (!existsSync(paths.log)) return [];
  const events: ReviewEvent[] = [];
  for (const line of readFileSync(paths.log, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const e = JSON.parse(line) as ReviewEvent;
      if (!id || e.id === id) events.push(e);
    } catch {
      // a torn last line from a crash is skipped, never fatal
    }
  }
  return events;
}

function appendLog(paths: DeskPaths, event: ReviewEvent): void {
  mkdirSync(dirname(paths.log), { recursive: true });
  appendFileSync(paths.log, `${JSON.stringify(event)}\n`);
}

function errorsOf(
  paths: DeskPaths,
  records: ManifestRecord[],
  id: string,
  lib: Map<string, LibraryEntry>,
): string[] {
  return validateManifest(records, { tools: readTools(paths), expected: lib }).filter((e) =>
    e.includes(`(${id})`),
  );
}

/**
 * Throw if the change gives this id a validation error it did not have before. Errors the
 * record already had (its prompt entry was deleted, its tool lost clearance) do not block
 * a decision, so such a record can still be rejected or retired; strict mode (approval)
 * refuses any error at all.
 */
function checkRecords(
  paths: DeskPaths,
  before: ManifestRecord[],
  after: ManifestRecord[],
  id: string,
  lib: Map<string, LibraryEntry>,
  strict = false,
): void {
  const old = strict ? new Set<string>() : new Set(errorsOf(paths, before, id, lib));
  const added = errorsOf(paths, after, id, lib).filter((e) => !old.has(e));
  if (added.length > 0) throw new ReviewError('invalid_record', added);
}

/** Move a file out of the tracked tree into _rejected/<kind>/, never overwriting; returns where. */
function parkFile(paths: DeskPaths, kind: 'art' | 'audio', abs: string): string {
  const kindDir = join(paths.rejected, kind);
  mkdirSync(kindDir, { recursive: true });
  const name = basename(abs);
  let target = join(kindDir, name);
  for (let k = 2; existsSync(target); k++)
    target = join(kindDir, name.replace(/(\.[^.]+)$/, `_${k}$1`));
  renameSync(abs, target);
  return target;
}

function nowIso(): string {
  return new Date().toISOString();
}

export interface AdoptRequest {
  id: string;
  keys: string[];
  reviewer: string;
  note: string;
  /** Required to replace a record that is approved or retired (as register's --replace). */
  replace: boolean;
}

/** Join decoded takes in order with one second of silence between them. */
function joinTakes(takes: Float32Array[][]): Float32Array[] {
  const channels = Math.max(...takes.map((t) => t.length));
  const gap = SAMPLE_RATE;
  const total = takes.reduce((n, t) => n + (t[0]?.length ?? 0), 0) + gap * (takes.length - 1);
  const out = Array.from({ length: channels }, () => new Float32Array(total));
  let offset = 0;
  takes.forEach((t, i) => {
    for (let c = 0; c < channels; c++)
      out[c]?.set(t[Math.min(c, t.length - 1)] ?? new Float32Array(0), offset);
    offset += (t[0]?.length ?? 0) + (i < takes.length - 1 ? gap : 0);
  });
  return out;
}

/**
 * The AIGC Vorbis comment written on adopted audio. One plain sentence (no "; " and no
 * "="), so the record's "AIGC=<value>" label stays one key when import restores it.
 */
function aigcComment(picked: Candidate[], tool: ToolRecord): string {
  const first = picked[0] as Candidate;
  const models = first.models.length > 0 ? first.models.join(' + ') : 'no model files';
  return `AI generated with ${tool.name}, ${first.toolVersion}, models ${models}, on ${first.generatedAt}`;
}

/** The implicit label of the staged original, read the way register does. */
function labelOfStaged(kind: 'image' | 'audio', bytes: Uint8Array): string {
  try {
    return aigcLabelOf(kind === 'audio' ? parseOgg(bytes).comments : readPngText(bytes));
  } catch {
    return 'none';
  }
}

/** Adopt pool takes as the entry's original and register it for review. */
export function adopt(
  paths: DeskPaths,
  req: AdoptRequest,
): { record: ManifestRecord; event: ReviewEvent } {
  const { lib } = entryInfos(paths);
  const entry = lib.get(req.id);
  if (!entry) throw new ReviewError('unknown_id', [`no prompt entry ${req.id}`]);
  const set = readCandidateSets(paths).sets.find((s) => s.assetId === req.id);
  if (!set) throw new ReviewError('no_candidates', [`no candidates for ${req.id}`]);
  const issues = checkAdoption(set, req.keys);
  if (issues.length > 0) throw new ReviewError('bad_adoption', issues);
  const records = readRecords(paths);
  const existing = records.find((r) => r.id === req.id);
  if (
    existing &&
    (existing.status === 'approved' || existing.status === 'retired') &&
    !req.replace
  ) {
    throw new ReviewError('replace_required', [`${req.id} is ${existing.status}`]);
  }
  const tools = readTools(paths);
  const picked = req.keys.map((k) => set.candidates.find((c) => c.key === k) as Candidate);
  const first = picked[0] as Candidate;
  const tool = tools.find((t) => t.id === first.tool);
  if (!tool) throw new ReviewError('tool_not_registered', [`${first.tool} is not in tools.json`]);
  if (!tool.commercialUse) {
    throw new ReviewError('tool_not_cleared', [`${tool.id}: ${tool.outputRights}`]);
  }
  const mainOf = (c: Candidate) => {
    const f = c.files.find((x) => x.role === 'main');
    const rel = f ? safeCandidatePath(f.path) : null;
    if (!rel) throw new ReviewError('bad_candidate', [`${c.key} has no usable main file`]);
    const abs = join(paths.assets, rel);
    if (!existsSync(abs)) throw new ReviewError('bad_candidate', [`${rel} is missing`]);
    return abs;
  };
  const target = join(paths.assets, entry.file);
  mkdirSync(dirname(target), { recursive: true });
  // Written beside the target under a dot name (listings skip dot files) and moved in only
  // after the record validates, so a refused adoption leaves no stray original behind.
  const staged = join(dirname(target), `.adopting-${process.pid}-${basename(target)}`);
  try {
    return adoptStaged(paths, req, {
      entry,
      set,
      picked,
      tool,
      records,
      lib,
      target,
      staged,
      mainOf,
    });
  } finally {
    if (existsSync(staged)) unlinkSync(staged);
  }
}

interface AdoptContext {
  entry: LibraryEntry;
  set: CandidateSet;
  picked: Candidate[];
  tool: ToolRecord;
  records: ManifestRecord[];
  lib: Map<string, LibraryEntry>;
  target: string;
  staged: string;
  mainOf: (c: Candidate) => string;
}

function adoptStaged(
  paths: DeskPaths,
  req: AdoptRequest,
  ctx: AdoptContext,
): { record: ManifestRecord; event: ReviewEvent } {
  const { entry, set, picked, tool, records, lib, target, staged, mainOf } = ctx;
  const first = picked[0] as Candidate;
  let converted = false;
  if (entry.kind === 'audio') {
    if (!ffmpegPath()) throw new ReviewError('ffmpeg_missing');
    const takes = picked.map((c) => decodeAudio(mainOf(c), SAMPLE_RATE));
    const joined = takes.length === 1 ? (takes[0] as Float32Array[]) : joinTakes(takes);
    encodeOgg(joined, SAMPLE_RATE, staged, 8, {
      HAKONIWA_CANDIDATES: req.keys.join(','),
      AIGC: aigcComment(picked, tool),
    });
    converted = true;
  } else {
    if (picked.length !== 1)
      throw new ReviewError('bad_adoption', ['an image takes one candidate']);
    const source = mainOf(first);
    if (
      !source.toLowerCase().endsWith(entry.file.slice(entry.file.lastIndexOf('.')).toLowerCase())
    ) {
      throw new ReviewError('bad_candidate', [
        `${first.key} is not a ${entry.file.split('.').pop()} file`,
      ]);
    }
    copyFileSync(source, staged);
  }
  const bytes = new Uint8Array(readFileSync(staged));
  const hash = sha256(bytes);
  const notes = [
    `picked ${req.keys.join('+')} of ${set.candidates.length} candidates (${first.method})`,
    req.note.trim(),
  ]
    .filter(Boolean)
    .join('; ');
  const record = newRecord(entry, {
    tool: tool.id,
    toolVersion: first.toolVersion,
    seed: picked
      .map((c) => c.seed)
      .filter(Boolean)
      .join(','),
    generatedAt: first.generatedAt,
    sha256: hash,
    aigcLabel: labelOfStaged(entry.kind, bytes),
    converted,
    promptLang: first.promptLang,
    notes,
  });
  const next = upsertRecord(records, record);
  checkRecords(paths, records, next, req.id, lib);
  // The original being replaced (any status) is kept in _rejected/ rather than overwritten.
  const parked = existsSync(target) ? parkFile(paths, record.kind, target) : null;
  renameSync(staged, target);
  try {
    writeAtomic(paths.manifest, manifestJson(next));
  } catch (err) {
    unlinkSync(target);
    if (parked) renameSync(parked, target);
    throw err;
  }
  const event: ReviewEvent = {
    at: nowIso(),
    id: req.id,
    action: 'adopt',
    status: record.status,
    reason: '',
    note: req.note.trim(),
    reviewer: req.reviewer.trim(),
    sha256: hash,
    candidates: req.keys,
    ...(parked ? { parked: relative(paths.assets, parked).split(sep).join('/') } : {}),
  };
  appendLog(paths, event);
  return { record, event };
}

export function review(
  paths: DeskPaths,
  id: string,
  decision: Decision,
): { record: ManifestRecord; event: ReviewEvent } {
  const { lib } = entryInfos(paths);
  const records = readRecords(paths);
  const current = records.find((r) => r.id === id);
  if (!current)
    throw new ReviewError('no_record', [`${id} has no manifest record; adopt a candidate first`]);
  const original = join(paths.assets, current.file);
  if (decision.status !== 'rejected' && !existsSync(original)) {
    // A rejected original already left for _rejected/: adopt again instead of reviving it.
    throw new ReviewError('file_missing', [`${current.file} is not on disk`]);
  }
  const result = applyDecision(current, decision, today());
  if (!result.record) throw new ReviewError('bad_decision', result.errors);
  const next = upsertRecord(records, result.record);
  checkRecords(paths, records, next, id, lib, result.record.status === 'approved');
  // Rejecting moves the original first (assets/README.md 3.3), then writes the record; if
  // the write fails the original goes back, so the tree and the manifest never disagree.
  const parked =
    result.record.status === 'rejected' && existsSync(original)
      ? parkFile(paths, current.kind, original)
      : null;
  try {
    writeAtomic(paths.manifest, manifestJson(next));
  } catch (err) {
    if (parked) renameSync(parked, original);
    throw err;
  }
  const event: ReviewEvent = {
    at: nowIso(),
    id,
    action: 'review',
    status: result.record.status,
    reason: result.record.reason,
    note: decision.note.trim(),
    reviewer: decision.reviewer.trim(),
    sha256: current.sha256,
  };
  appendLog(paths, event);
  return { record: result.record, event };
}
