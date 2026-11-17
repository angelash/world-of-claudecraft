// The asset review desk's pure core (docs/50_tech/art_pipeline.md 15; assets/README.md 3.3
// and 3.4): the candidate pool shapes, the review decision rules, and the rows and counts the
// editor's review tool shows. No file access, so every rule is unit tested directly
// (tests/asset_review.test.ts); review/store.ts does the reading and writing.

import { type ManifestRecord, STATUSES, type Status } from '../core/manifest';
import { ART_REASONS, AUDIO_REASONS, isReasonList } from '../core/reasons';

export type AssetKind = 'art' | 'audio';

/** One file of a candidate: the take itself, or a layer of it (adaptive music stems). */
export interface CandidateFile {
  role: 'main' | 'layer';
  label: string;
  /** Path relative to assets/, forward slashes, inside _candidates/. */
  path: string;
}

/** One generated take waiting in the pool (assets/_candidates/<kind>/<id>/candidates.json). */
export interface Candidate {
  key: string;
  label: string;
  /** Takes generated together (same prompt or method) share a group. */
  group: string;
  method: string;
  /** Tool id in assets/tools.json. */
  tool: string;
  toolVersion: string;
  models: string[];
  seed: string;
  prompt: string;
  promptLang: 'zh' | 'en';
  /** YYYY-MM-DD. */
  generatedAt: string;
  settings: Record<string, unknown>;
  metrics: Record<string, number | string>;
  files: CandidateFile[];
  note: string;
}

/**
 * single: adopting picks one take as the original. sequence: adopting picks takes in
 * order and joins them with one second of silence (effects with variations, 9.2).
 */
export type AdoptMode = 'single' | 'sequence';

export interface CandidateSet {
  assetId: string;
  kind: AssetKind;
  createdAt: string;
  /** What produced the set (a script path or "manual"). */
  source: string;
  adoptMode: AdoptMode;
  /** How many takes a sequence wants (the entry's variation count); 0 when not fixed. */
  adoptCount: number;
  candidates: Candidate[];
}

/** One line of assets/review_log.jsonl: the append-only trail of every desk action. */
export interface ReviewEvent {
  at: string;
  id: string;
  action: 'adopt' | 'review';
  status: Status;
  reason: string;
  note: string;
  reviewer: string;
  sha256: string;
  candidates?: string[];
  /** Where an original replaced by an adoption was kept (relative to assets/). */
  parked?: string;
}

export interface Decision {
  status: Status;
  reasons: string[];
  note: string;
  reviewer: string;
}

export function reasonCodesFor(kind: AssetKind): readonly string[] {
  return kind === 'audio' ? AUDIO_REASONS : ART_REASONS;
}

/**
 * Apply a reviewer's decision to a record. The rules match validateManifest: approved and
 * retired name the reviewer and the day; rework and rejected also need reason codes of
 * the record's kind; sending a record back to review clears the last decision.
 */
export function applyDecision(
  record: ManifestRecord,
  decision: Decision,
  today: string,
): { record?: ManifestRecord; errors: string[] } {
  const errors: string[] = [];
  if (!STATUSES.includes(decision.status)) errors.push(`unknown status ${decision.status}`);
  const reviewer = decision.reviewer.trim();
  const codes = [...new Set(decision.reasons.map((r) => r.trim()).filter(Boolean))].sort();
  const reason = codes.join(',');
  const needsReason = decision.status === 'rework' || decision.status === 'rejected';
  if (decision.status !== 'review' && reviewer === '') errors.push('reviewer is required');
  if (needsReason && !isReasonList(reason, record.kind)) {
    errors.push(`${decision.status} needs reason codes of a ${record.kind} asset`);
  }
  if (!needsReason && codes.length > 0 && !isReasonList(reason, record.kind)) {
    errors.push(`unknown reason codes for a ${record.kind} asset`);
  }
  if (errors.length > 0) return { errors };
  if (decision.status === 'review') {
    return {
      record: { ...record, status: 'review', reason: '', reviewer: '', reviewedAt: '' },
      errors,
    };
  }
  return {
    record: {
      ...record,
      status: decision.status,
      reason: needsReason ? reason : '',
      reviewer,
      reviewedAt: today,
    },
    errors,
  };
}

/** The picks an adoption names, checked against the set's mode. */
export function checkAdoption(set: CandidateSet, keys: readonly string[]): string[] {
  const errors: string[] = [];
  if (keys.length === 0) errors.push('pick at least one candidate');
  if (set.adoptMode === 'single' && keys.length > 1) errors.push('this asset takes one candidate');
  if (set.adoptMode === 'sequence' && set.adoptCount > 0 && keys.length !== set.adoptCount) {
    errors.push(`this asset takes ${set.adoptCount} variations in order`);
  }
  if (new Set(keys).size !== keys.length) errors.push('a candidate is picked twice');
  const known = new Set(set.candidates.map((c) => c.key));
  for (const k of keys) if (!known.has(k)) errors.push(`no candidate ${k}`);
  if (errors.length > 0) return errors;
  const picked = keys.map((k) => set.candidates.find((c) => c.key === k) as Candidate);
  if (new Set(picked.map((c) => c.tool)).size > 1) {
    errors.push('picked candidates come from different tools; adopt them one tool at a time');
  }
  if (picked.some((c) => !c.files.some((f) => f.role === 'main'))) {
    errors.push('a picked candidate has no main file');
  }
  return errors;
}

/** Shape check of a candidates.json file; returns problems, empty when usable. */
export function candidateSetProblems(value: unknown, where: string): string[] {
  const out: string[] = [];
  const v = value as Partial<CandidateSet> | null;
  if (!v || typeof v !== 'object') return [`${where}: not an object`];
  if (typeof v.assetId !== 'string' || v.assetId === '') out.push(`${where}: assetId is required`);
  if (v.kind !== 'art' && v.kind !== 'audio') out.push(`${where}: kind must be art or audio`);
  if (v.adoptMode !== 'single' && v.adoptMode !== 'sequence') {
    out.push(`${where}: adoptMode must be single or sequence`);
  }
  if (!Array.isArray(v.candidates)) return [...out, `${where}: candidates must be a list`];
  const keys = new Set<string>();
  v.candidates.forEach((c, i) => {
    const at = `${where}.candidates[${i}]`;
    if (!c || typeof c !== 'object') {
      out.push(`${at}: not an object`);
      return;
    }
    if (typeof c.key !== 'string' || c.key === '') out.push(`${at}: key is required`);
    else if (keys.has(c.key)) out.push(`${at}: duplicate key ${c.key}`);
    else keys.add(c.key);
    if (typeof c.tool !== 'string' || c.tool === '') out.push(`${at}: tool is required`);
    for (const f of [
      'label',
      'group',
      'method',
      'toolVersion',
      'seed',
      'prompt',
      'generatedAt',
      'note',
    ] as const) {
      if (typeof c[f] !== 'string') out.push(`${at}: ${f} must be text`);
    }
    if (c.promptLang !== 'zh' && c.promptLang !== 'en')
      out.push(`${at}: promptLang must be zh or en`);
    if (!Array.isArray(c.models) || c.models.some((x) => typeof x !== 'string')) {
      out.push(`${at}: models must be a list of names`);
    }
    for (const f of ['settings', 'metrics'] as const) {
      if (!c[f] || typeof c[f] !== 'object' || Array.isArray(c[f]))
        out.push(`${at}: ${f} must be an object`);
    }
    if (!Array.isArray(c.files) || c.files.length === 0) {
      out.push(`${at}: files must be a non-empty list`);
      return;
    }
    for (const f of c.files) {
      if (!f || typeof f.path !== 'string' || safeCandidatePath(f.path) === null) {
        out.push(`${at}: file path must stay inside _candidates/`);
      } else if (f.role !== 'main' && f.role !== 'layer') {
        out.push(`${at}: file role must be main or layer`);
      }
    }
  });
  return out;
}

/** A pool path (relative to assets/) normalized, or null when it leaves _candidates/. */
export function safeCandidatePath(rel: string): string | null {
  const p = rel.replace(/\\/g, '/');
  if (p.startsWith('/') || /^[a-zA-Z]:/.test(p)) return null;
  const parts = p.split('/');
  if (parts.some((s) => s === '..' || s === '.' || s === '')) return null;
  if (parts[0] !== '_candidates' || parts.length < 4) return null;
  return p;
}

/** What the desk knows about one prompt entry (the library entry plus its subject). */
export interface EntryInfo {
  id: string;
  kind: 'image' | 'audio';
  file: string;
  template: string;
  milestone: string;
  category: string;
  subject?: { zh: string; en: string };
}

/**
 * A record's status; "candidates" when only pool takes exist; "unregistered" when an
 * original sits under art/ or audio/ without a record (register it before deciding).
 */
export type RowState = Status | 'candidates' | 'unregistered';

export interface AssetRow {
  id: string;
  kind: AssetKind;
  category: string;
  template: string;
  milestone: string;
  file: string;
  subject?: { zh: string; en: string };
  state: RowState;
  record?: ManifestRecord;
  candidates?: CandidateSet;
  /** The original on disk that waits for registration (state "unregistered"). */
  unregisteredFile?: string;
  /** Processed results of the record (import output, relative to assets/). */
  processed?: string[];
  /** Set when the record or pool names an id the prompt library does not have. */
  orphan?: boolean;
}

/** Files under art/ and audio/ (paths relative to assets/) that no record names. */
export function unregisteredFiles(
  files: readonly string[],
  records: readonly ManifestRecord[],
): string[] {
  const recorded = new Set(records.map((r) => r.file));
  return files.filter((f) => !recorded.has(f));
}

/**
 * Rows for every id that has a record, pool takes or an unregistered original, ordered
 * by kind, category, id. An unregistered file whose path is no entry's file shows under
 * its file name, marked orphan.
 */
export function buildRows(
  entries: ReadonlyMap<string, EntryInfo>,
  records: readonly ManifestRecord[],
  sets: readonly CandidateSet[],
  unregistered: readonly string[] = [],
): AssetRow[] {
  const recordOf = new Map(records.map((r) => [r.id, r]));
  const setOf = new Map(sets.map((s) => [s.assetId, s]));
  const idOfFile = new Map([...entries.values()].map((e) => [e.file, e.id]));
  const looseFile = new Map<string, string>();
  for (const f of unregistered) {
    // A segment folder audio/<outDir>/<id>/ joins into audio/<outDir>/<id>.ogg on register.
    const folder = f.slice(0, f.lastIndexOf('/'));
    const id =
      idOfFile.get(f) ??
      idOfFile.get(`${folder}.ogg`) ??
      f.slice(f.lastIndexOf('/') + 1).replace(/\.[^.]+$/, '');
    if (!recordOf.has(id) && !looseFile.has(id)) looseFile.set(id, f);
  }
  const ids = new Set([...recordOf.keys(), ...setOf.keys(), ...looseFile.keys()]);
  const rows: AssetRow[] = [];
  for (const id of ids) {
    const e = entries.get(id);
    const record = recordOf.get(id);
    const set = setOf.get(id);
    const loose = looseFile.get(id);
    const kind: AssetKind = e
      ? e.kind === 'image'
        ? 'art'
        : 'audio'
      : (record?.kind ?? set?.kind ?? (loose?.startsWith('audio/') ? 'audio' : 'art'));
    rows.push({
      id,
      kind,
      category: e?.category ?? 'unknown',
      template: e?.template ?? record?.template ?? '',
      milestone: e?.milestone ?? record?.milestone ?? '',
      file: e?.file ?? record?.file ?? loose ?? '',
      ...(e?.subject ? { subject: e.subject } : {}),
      state: record ? record.status : loose ? 'unregistered' : 'candidates',
      ...(loose ? { unregisteredFile: loose } : {}),
      ...(record ? { record } : {}),
      ...(set ? { candidates: set } : {}),
      ...(e ? {} : { orphan: true }),
    });
  }
  return rows.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.category.localeCompare(b.category) ||
      a.id.localeCompare(b.id),
  );
}

export interface KindCounts {
  expected: number;
  candidates: number;
  review: number;
  approved: number;
  rework: number;
  rejected: number;
  retired: number;
  /** Originals on disk that no record names yet. */
  unregistered: number;
  /** Expected entries with neither a record, pool takes nor an original on disk. */
  untouched: number;
}

/** Coverage per kind: how much of the prompt library is generated, waiting, decided. */
export function summarize(
  entries: ReadonlyMap<string, EntryInfo>,
  records: readonly ManifestRecord[],
  sets: readonly CandidateSet[],
  unregistered: readonly string[] = [],
): Record<AssetKind, KindCounts> {
  const zero = (): KindCounts => ({
    expected: 0,
    candidates: 0,
    review: 0,
    approved: 0,
    rework: 0,
    rejected: 0,
    retired: 0,
    unregistered: 0,
    untouched: 0,
  });
  const out: Record<AssetKind, KindCounts> = { art: zero(), audio: zero() };
  const recordOf = new Map(records.map((r) => [r.id, r]));
  const pooled = new Set(sets.map((s) => s.assetId));
  const loose = new Set(unregistered);
  for (const e of entries.values()) {
    const c = out[e.kind === 'image' ? 'art' : 'audio'];
    c.expected++;
    const r = recordOf.get(e.id);
    if (r) c[r.status]++;
    else if (loose.has(e.file)) c.unregistered++;
    else if (pooled.has(e.id)) c.candidates++;
    else c.untouched++;
  }
  return out;
}
