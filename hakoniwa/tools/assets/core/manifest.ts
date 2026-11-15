// The asset manifest and tool register (art_pipeline.md 6.5; assets/README.md 3): record
// shapes, field validation, the two-way reconciliation between records and files, and the
// list of approved assets whose prompt changed since generation (a re-review list, not an
// error). Pure: callers pass the parsed JSON, the expected entries and the file listing.

import { isReasonList } from './reasons';

export const STATUSES = ['review', 'approved', 'rework', 'rejected', 'retired'] as const;
export type Status = (typeof STATUSES)[number];

export interface ManifestRecord {
  id: string;
  kind: 'art' | 'audio';
  file: string;
  template: string;
  style: string;
  promptHash: string;
  promptLang: 'zh' | 'en';
  tool: string;
  toolVersion: string;
  seed: string;
  refs: string[];
  generatedAt: string;
  sha256: string;
  aigcLabel: string;
  converted: boolean;
  status: Status;
  reason: string;
  reviewer: string;
  reviewedAt: string;
  milestone: string;
  notes: string;
}

export interface ToolRecord {
  id: string;
  name: string;
  usedVersions: string[];
  termsUrl: string;
  termsCheckedAt: string;
  commercialUse: boolean;
  outputRights: string;
  aigcLabel: string;
  kind: 'image' | 'audio' | 'font';
}

/** What the prompt library expects for one id (tools/prompts/build.ts manifestOf plus style). */
export interface ExpectedEntry {
  id: string;
  kind: 'image' | 'audio';
  file: string;
  template: string;
  milestone: string;
  promptHash: string;
  style?: string;
}

export const RECORD_FIELDS: readonly (keyof ManifestRecord)[] = [
  'id',
  'kind',
  'file',
  'template',
  'style',
  'promptHash',
  'promptLang',
  'tool',
  'toolVersion',
  'seed',
  'refs',
  'generatedAt',
  'sha256',
  'aigcLabel',
  'converted',
  'status',
  'reason',
  'reviewer',
  'reviewedAt',
  'milestone',
  'notes',
];

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA = /^[0-9a-f]{64}$/;
const HASH12 = /^[0-9a-f]{12}$/;

export function validateTools(tools: unknown): string[] {
  const out: string[] = [];
  if (!Array.isArray(tools)) return ['tools.json must be an array'];
  const seen = new Set<string>();
  tools.forEach((t: Partial<ToolRecord>, i) => {
    const where = `tools.json[${i}]${t?.id ? ` (${t.id})` : ''}`;
    if (!t || typeof t !== 'object') {
      out.push(`${where}: not an object`);
      return;
    }
    for (const f of [
      'id',
      'name',
      'termsUrl',
      'termsCheckedAt',
      'outputRights',
      'aigcLabel',
    ] as const) {
      if (typeof t[f] !== 'string' || t[f] === '') out.push(`${where}: ${f} is required`);
    }
    if (t.id && seen.has(t.id)) out.push(`${where}: duplicate tool id`);
    if (t.id) seen.add(t.id);
    if (!Array.isArray(t.usedVersions)) out.push(`${where}: usedVersions must be a list`);
    if (typeof t.commercialUse !== 'boolean')
      out.push(`${where}: commercialUse must be true or false`);
    if (t.termsCheckedAt && !DATE.test(t.termsCheckedAt))
      out.push(`${where}: termsCheckedAt must be YYYY-MM-DD`);
    if (!['image', 'audio', 'font'].includes(t.kind as string))
      out.push(`${where}: kind must be image, audio or font`);
  });
  return out;
}

export interface ManifestContext {
  tools: ToolRecord[];
  expected: Map<string, ExpectedEntry>;
}

export function validateManifest(records: unknown, ctx: ManifestContext): string[] {
  const out: string[] = [];
  if (!Array.isArray(records)) return ['manifest.json must be an array'];
  const tools = new Map(ctx.tools.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const files = new Set<string>();
  records.forEach((r: Partial<ManifestRecord>, i) => {
    const where = `manifest.json[${i}]${r?.id ? ` (${r.id})` : ''}`;
    if (!r || typeof r !== 'object') {
      out.push(`${where}: not an object`);
      return;
    }
    for (const f of RECORD_FIELDS) if (!(f in r)) out.push(`${where}: field ${f} is missing`);
    for (const f of [
      'id',
      'file',
      'template',
      'promptHash',
      'tool',
      'toolVersion',
      'generatedAt',
      'sha256',
      'aigcLabel',
      'milestone',
    ] as const) {
      if (typeof r[f] !== 'string' || r[f] === '') out.push(`${where}: ${f} must not be empty`);
    }
    if (r.id) {
      if (seen.has(r.id)) out.push(`${where}: duplicate id`);
      seen.add(r.id);
    }
    if (r.file) {
      if (files.has(r.file)) out.push(`${where}: file ${r.file} is registered twice`);
      files.add(r.file);
    }
    if (r.kind !== 'art' && r.kind !== 'audio') out.push(`${where}: kind must be art or audio`);
    if (r.promptLang !== 'zh' && r.promptLang !== 'en')
      out.push(`${where}: promptLang must be zh or en`);
    if (r.generatedAt && !DATE.test(r.generatedAt))
      out.push(`${where}: generatedAt must be YYYY-MM-DD`);
    if (r.sha256 && !SHA.test(r.sha256))
      out.push(`${where}: sha256 must be 64 lowercase hex digits`);
    if (r.promptHash && !HASH12.test(r.promptHash))
      out.push(`${where}: promptHash must be 12 hex digits`);
    if (typeof r.converted !== 'boolean') out.push(`${where}: converted must be true or false`);
    if (!Array.isArray(r.refs)) out.push(`${where}: refs must be a list`);
    if (!STATUSES.includes(r.status as Status))
      out.push(`${where}: status must be one of ${STATUSES.join(', ')}`);
    if (
      (r.status === 'rework' || r.status === 'rejected') &&
      !isReasonList(r.reason ?? '', r.kind === 'audio' ? 'audio' : 'art')
    ) {
      out.push(`${where}: ${r.status} needs reason codes (art_pipeline.md 15.3)`);
    }
    if (r.status === 'approved' && (!r.reviewer || !r.reviewedAt || !DATE.test(r.reviewedAt))) {
      out.push(`${where}: approved needs reviewer and reviewedAt (YYYY-MM-DD)`);
    }
    const tool = r.tool ? tools.get(r.tool) : undefined;
    if (r.tool && !tool) out.push(`${where}: tool ${r.tool} is not registered in tools.json`);
    if (tool && !tool.commercialUse)
      out.push(`${where}: tool ${tool.id} does not allow commercial use`);
    if (tool && r.kind && tool.kind !== (r.kind === 'art' ? 'image' : 'audio'))
      out.push(`${where}: tool ${tool.id} is a ${tool.kind} tool`);
    const e = r.id ? ctx.expected.get(r.id) : undefined;
    if (r.id && !e) out.push(`${where}: no prompt entry has this id`);
    if (e) {
      if (r.file !== e.file) out.push(`${where}: file must be ${e.file}`);
      if (r.kind && (r.kind === 'art' ? 'image' : 'audio') !== e.kind)
        out.push(`${where}: kind does not match the prompt entry`);
      if (r.template !== e.template) out.push(`${where}: template must be ${e.template}`);
      if (r.milestone !== e.milestone) out.push(`${where}: milestone must be ${e.milestone}`);
      if ((r.style ?? '') !== (e.style ?? ''))
        out.push(`${where}: style must be "${e.style ?? ''}"`);
    }
    for (const ref of r.refs ?? [])
      if (!ctx.expected.has(ref)) out.push(`${where}: ref ${ref} is not a prompt entry`);
  });
  return out;
}

export interface FileInfo {
  /** Path relative to assets/ with forward slashes. */
  path: string;
  sha256?: string;
}

export interface Reconciliation {
  /** Records whose file is missing (rejected records are allowed to have none). */
  missingFiles: string[];
  /** Files under art/ and audio/ without a record. */
  unregistered: string[];
  /** Records whose file hash differs from the recorded sha256. */
  hashMismatch: string[];
}

/** Two-way record and file check (6.5: records and files correspond one to one). */
export function reconcile(
  records: readonly ManifestRecord[],
  files: readonly FileInfo[],
): Reconciliation {
  const byPath = new Map(files.map((f) => [f.path, f]));
  const recorded = new Set(records.map((r) => r.file));
  const missingFiles: string[] = [];
  const hashMismatch: string[] = [];
  for (const r of records) {
    const f = byPath.get(r.file);
    if (!f) {
      if (r.status !== 'rejected') missingFiles.push(r.file);
      continue;
    }
    if (f.sha256 && f.sha256 !== r.sha256) hashMismatch.push(r.file);
  }
  const unregistered = files.map((f) => f.path).filter((p) => !recorded.has(p));
  return { missingFiles, unregistered, hashMismatch };
}

/** Records generated from an older prompt (the re-review list of prompts/README.md 9). */
export function promptChanged(
  records: readonly ManifestRecord[],
  expected: Map<string, ExpectedEntry>,
): string[] {
  return records
    .filter((r) => {
      const e = expected.get(r.id);
      return (
        e && r.status !== 'rejected' && r.status !== 'retired' && e.promptHash !== r.promptHash
      );
    })
    .map((r) => r.id);
}

/** Insert or replace a record by id; the list stays sorted by id so diffs stay small. */
export function upsertRecord(
  records: readonly ManifestRecord[],
  rec: ManifestRecord,
): ManifestRecord[] {
  return [...records.filter((r) => r.id !== rec.id), rec].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );
}

/** Stable JSON for the manifest (2-space indent, one trailing newline). */
export function manifestJson(records: readonly ManifestRecord[]): string {
  return `${JSON.stringify(
    records.map((r) => Object.fromEntries(RECORD_FIELDS.map((f) => [f, r[f]]))),
    null,
    2,
  )}\n`;
}
