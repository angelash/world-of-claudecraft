// The slot header (release_engineering.md 5.3): the commit point of a save. It names the
// run volume, the five version numbers, the content-addressed snapshot, the command and
// history segments and the anchors, plus a hash over its own canonical JSON. Slot ids,
// run ids and hashes are the same file-name rules the desktop main process enforces.

import type { AiMode } from '../ai_port';
import { WORLD_VERSION } from '../world';
import { RENAME_VERSION } from './renames';
import { sha256Text } from './sha256';

export const SAVE_FORMAT = 'hakoniwa-save';
/** Container format: directory layout, header and file encodings (5.5). */
export const CONTAINER_VERSION = 1;

/**
 * Slot ids (5.1): one quick save, three rotating autosaves, twenty manual saves and the
 * ironman save. A slot id is a file name, so only these are ever accepted.
 */
export const SLOT_IDS = [
  'quick',
  'auto_1',
  'auto_2',
  'auto_3',
  'manual_01',
  'manual_02',
  'manual_03',
  'manual_04',
  'manual_05',
  'manual_06',
  'manual_07',
  'manual_08',
  'manual_09',
  'manual_10',
  'manual_11',
  'manual_12',
  'manual_13',
  'manual_14',
  'manual_15',
  'manual_16',
  'manual_17',
  'manual_18',
  'manual_19',
  'manual_20',
  'ironman',
] as const;
export type SlotId = (typeof SLOT_IDS)[number];
export const AUTO_SLOTS: readonly SlotId[] = ['auto_1', 'auto_2', 'auto_3'];
export const MANUAL_SLOTS: readonly SlotId[] = SLOT_IDS.filter((s) => s.startsWith('manual_'));

const SLOT_SET: ReadonlySet<string> = new Set(SLOT_IDS);
const RUN_ID = /^r-[0-9a-f]{8,32}$/;
const SHA256 = /^[0-9a-f]{64}$/;

export function isSlotId(value: unknown): value is SlotId {
  return typeof value === 'string' && SLOT_SET.has(value);
}

/** Run ids are generated at new game: `r-` and 8 to 32 lowercase hex digits. */
export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && RUN_ID.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

/** A run id from caller-supplied random bytes (the kernel draws no randomness). */
export function runIdFromBytes(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes.subarray(0, 16)) hex += b.toString(16).padStart(2, '0');
  if (hex.length < 8) throw new Error('a run id needs at least 4 random bytes');
  return `r-${hex}`;
}

export interface FileRef {
  sha256: string;
  /** stored (encoded) size */
  bytes: number;
}

/** Streams of append-only segments (5.3). */
export type SegmentKind = 'history' | 'commands' | 'ai';
export const SEGMENT_KINDS: readonly SegmentKind[] = ['history', 'commands', 'ai'];

/** One segment: the stream's entries with fromTick < tick <= toTick. */
export interface SegmentRef extends FileRef {
  kind: SegmentKind;
  fromTick: number;
  toTick: number;
  /** entries in the segment */
  count: number;
  /** the world's AI mode while these commands were logged (a replay plays them so) */
  aiMode?: AiMode;
  /** made by merging older segments (5.4); never merged again */
  merged?: boolean;
}

/** A full world snapshot at a past tick; same file format as the slot snapshot. */
export interface AnchorRef {
  tick: number;
  sha256: string;
  /** an ironman run's act-change anchor (5.3): the act entered; kept beside the periodic ones */
  act?: string;
}

export interface SaveFlags {
  ironman: boolean;
  demo: boolean;
  tainted: boolean;
  recovered: boolean;
}

/** Slot list data only; loading never depends on it (5.3). */
export interface SaveSummary {
  act: string;
  /** map id */
  map: string;
  /** map display name at save time */
  mapName?: string;
  level?: number;
  doorStage?: number;
  playSeconds?: number;
  /** AI preset name, never an address or a key (5.10) */
  aiPreset?: string;
}

/** The five version numbers of 5.5 (container is fixed by this build). */
export interface SaveVersions {
  worldVersion: number;
  gameVersion: string;
  contentVersion: string;
  renameVersion: number;
  build: string;
}

export interface SaveFiles {
  snapshot: FileRef;
  segments: SegmentRef[];
  anchors: AnchorRef[];
}

/** What the writer sends; the backend adds the generation, the writer and the hash. */
export interface SlotHeaderDraft extends SaveVersions {
  format: typeof SAVE_FORMAT;
  container: number;
  slot: SlotId;
  label: string;
  runId: string;
  /** real-world save time, ISO string */
  savedAt: string;
  tick: number;
  flags: SaveFlags;
  summary: SaveSummary;
  files: SaveFiles;
}

export interface SlotHeader extends SlotHeaderDraft {
  generation: number;
  writerId: string;
  writerName: string;
  /** SHA-256 of the canonical JSON of every other field */
  headerSha256: string;
}

export const NO_FLAGS: SaveFlags = {
  ironman: false,
  demo: false,
  tainted: false,
  recovered: false,
};

/**
 * `contentVersion` (5.5): `c-` and the first 8 hex digits of the SHA-256 of the built
 * content's JSON, so any data change gives a new value. Computed once per content object.
 */
export function contentVersionOf(content: unknown): string {
  const known = contentVersions.get(content as object);
  if (known) return known;
  let v = 'c-unknown';
  try {
    v = `c-${sha256Text(JSON.stringify(content) ?? '').slice(0, 8)}`;
  } catch {
    // Not serialisable: keep the marker; saves still load (the field is informative).
  }
  if (typeof content === 'object' && content !== null) contentVersions.set(content, v);
  return v;
}

const contentVersions = new WeakMap<object, string>();

/** JSON with object keys sorted at every level: the input of the header hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJson(v)).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`;
}

export function headerHash(header: Omit<SlotHeader, 'headerSha256'> | SlotHeader): string {
  const { headerSha256: _drop, ...rest } = header as SlotHeader;
  return sha256Text(canonicalJson(rest));
}

/** Finish a draft into a committed header. */
export function sealHeader(
  draft: SlotHeaderDraft,
  commit: { generation: number; writerId: string; writerName: string },
): SlotHeader {
  const base = { ...draft, ...commit, headerSha256: '' };
  base.headerSha256 = headerHash(base);
  return base;
}

/** Every content-addressed file a header references, snapshot first. */
export function headerRefs(h: SlotHeaderDraft): { kind: 'snapshot' | 'segment'; sha256: string }[] {
  const out: { kind: 'snapshot' | 'segment'; sha256: string }[] = [
    { kind: 'snapshot', sha256: h.files.snapshot.sha256 },
  ];
  for (const a of h.files.anchors) out.push({ kind: 'snapshot', sha256: a.sha256 });
  for (const s of h.files.segments) out.push({ kind: 'segment', sha256: s.sha256 });
  return out;
}

// ---------------------------------------------------------------------------
// Validation (hand-written, like the rest of the content checks)

/** `newer_container`: written by a newer build in a form this one cannot read (5.5). */
export type HeaderProblem = 'bad_json' | 'bad_shape' | 'bad_hash' | 'newer_container';

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min;
const isStr = (v: unknown, max = 512): v is string => typeof v === 'string' && v.length <= max;

function isFileRef(v: unknown): v is FileRef {
  return isObj(v) && isSha256(v.sha256) && isInt(v.bytes);
}

const AI_MODES: readonly unknown[] = ['off', 'external', 'replay'];

function isSegmentRef(v: unknown): v is SegmentRef {
  const s = v as SegmentRef;
  return (
    isFileRef(v) &&
    SEGMENT_KINDS.includes(s.kind) &&
    isInt(s.fromTick) &&
    isInt(s.toTick) &&
    s.toTick >= s.fromTick &&
    isInt(s.count) &&
    (s.aiMode === undefined || AI_MODES.includes(s.aiMode)) &&
    (s.merged === undefined || typeof s.merged === 'boolean')
  );
}

function isAnchorRef(v: unknown): v is AnchorRef {
  return (
    isObj(v) && isInt(v.tick) && isSha256(v.sha256) && (v.act === undefined || isStr(v.act, 64))
  );
}

function isFlags(v: unknown): v is SaveFlags {
  return (
    isObj(v) &&
    typeof v.ironman === 'boolean' &&
    typeof v.demo === 'boolean' &&
    typeof v.tainted === 'boolean' &&
    typeof v.recovered === 'boolean'
  );
}

/** Shape check of a draft, without the commit fields. */
export function isHeaderDraft(v: unknown): v is SlotHeaderDraft {
  if (!isObj(v)) return false;
  const files = v.files;
  return (
    v.format === SAVE_FORMAT &&
    isInt(v.container, 1) &&
    isInt(v.worldVersion, 1) &&
    isStr(v.gameVersion, 64) &&
    isStr(v.contentVersion, 64) &&
    isInt(v.renameVersion) &&
    isStr(v.build, 64) &&
    isSlotId(v.slot) &&
    isStr(v.label, 200) &&
    isRunId(v.runId) &&
    isStr(v.savedAt, 64) &&
    isInt(v.tick) &&
    isFlags(v.flags) &&
    isObj(v.summary) &&
    isStr(v.summary.act, 64) &&
    isStr(v.summary.map, 128) &&
    isObj(files) &&
    isFileRef(files.snapshot) &&
    Array.isArray(files.segments) &&
    files.segments.every(isSegmentRef) &&
    Array.isArray(files.anchors) &&
    files.anchors.every(isAnchorRef)
  );
}

export type ParsedHeader = { ok: true; header: SlotHeader } | { ok: false; problem: HeaderProblem };

/**
 * Every file a header might name, read loosely: the run id and any hash under `files`.
 * Collection keeps these for headers this build cannot use (a newer container, an
 * unknown shape), so a newer build's saves survive an older one (5.5).
 */
export function looseRefs(text: string): { runId: string; sha256: string[] } | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(v) || !isRunId(v.runId)) return null;
  const found = new Set<string>();
  const walk = (x: unknown, depth: number): void => {
    if (depth > 8) return;
    if (isSha256(x)) found.add(x);
    else if (Array.isArray(x)) for (const y of x) walk(y, depth + 1);
    else if (isObj(x)) for (const y of Object.values(x)) walk(y, depth + 1);
  };
  walk(v.files, 0);
  return { runId: v.runId, sha256: [...found] };
}

/** Parse and verify a committed header: shape, container version and self hash. */
export function parseHeader(text: string): ParsedHeader {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return { ok: false, problem: 'bad_json' };
  }
  return checkHeader(v);
}

export function checkHeader(v: unknown): ParsedHeader {
  // A newer build may change the header's shape or hash: its raw version numbers tell it
  // apart from damage, so its slot is refused rather than recovered over (5.5). A header
  // of a newer world or rename version that this build can still parse stays readable
  // (the slot list shows it; loading refuses it, ./versions.ts).
  const raw = isObj(v) ? v : null;
  if (raw && isInt(raw.container) && raw.container > CONTAINER_VERSION) {
    return { ok: false, problem: 'newer_container' };
  }
  const newerData =
    !!raw &&
    ((isInt(raw.worldVersion) && raw.worldVersion > WORLD_VERSION) ||
      (isInt(raw.renameVersion) && raw.renameVersion > RENAME_VERSION));
  if (
    !isHeaderDraft(v) ||
    !isInt((v as SlotHeader).generation, 1) ||
    !isStr((v as SlotHeader).writerId, 64) ||
    !isStr((v as SlotHeader).writerName, 128) ||
    !isSha256((v as SlotHeader).headerSha256)
  ) {
    return { ok: false, problem: newerData ? 'newer_container' : 'bad_shape' };
  }
  const h = v as SlotHeader;
  if (headerHash(h) !== h.headerSha256) {
    return { ok: false, problem: newerData ? 'newer_container' : 'bad_hash' };
  }
  return { ok: true, header: h };
}
