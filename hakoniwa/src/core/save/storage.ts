// The byte store under a save container: a tiny file-system seam with exactly the
// primitives the write order of release_engineering.md 5.4 needs. Three implementations:
// memory (tests, with power-cut injection), IndexedDB (web) and node:fs (the desktop main
// process and tests). Paths are relative, '/'-separated, under the saves directory (5.2):
//
//   runs/<runId>/snap/<sha256>.hks     world snapshots, content addressed
//   runs/<runId>/seg/<sha256>.hkg      append-only segments, content addressed
//   slots/<slotId>.json                slot header: the commit point
//   slots/<slotId>.prev.json           the previous generation's header
//   trash/<stamp>/runs/...             unreferenced files waiting to be deleted

import { isRunId, isSha256, isSlotId } from './header';

export interface StoredStat {
  bytes: number;
  /** last write time, milliseconds since the epoch */
  mtimeMs: number;
}

export interface SaveStorage {
  /** Whole file, or null when it does not exist. */
  read(path: string): Promise<Uint8Array | null>;
  /**
   * Create or replace a file and flush it to stable storage (fsync). Not atomic: a power
   * cut in the middle can leave a torn file, which is why the container only ever writes
   * `.tmp` names and renames them into place.
   */
  write(path: string, data: Uint8Array): Promise<void>;
  /** Atomically replace `to` with `from` (creates parent directories). */
  rename(from: string, to: string): Promise<void>;
  /** Delete a file; a missing file is not an error. */
  remove(path: string): Promise<void>;
  /** Every file under a directory prefix (recursive), as full relative paths. */
  list(dir: string): Promise<string[]>;
  stat(path: string): Promise<StoredStat | null>;
}

export const SNAPSHOT_EXT = '.hks';
export const SEGMENT_EXT = '.hkg';
export const TMP_SUFFIX = '.tmp';
export type StoredKind = 'snapshot' | 'segment';

export const RUNS_DIR = 'runs';
export const SLOTS_DIR = 'slots';
export const TRASH_DIR = 'trash';

function checkRun(runId: string): string {
  if (!isRunId(runId)) throw new Error(`bad run id ${runId}`);
  return runId;
}

function checkSha(sha: string): string {
  if (!isSha256(sha)) throw new Error('bad sha256');
  return sha;
}

function checkSlot(slot: string): string {
  if (!isSlotId(slot)) throw new Error(`bad slot id ${slot}`);
  return slot;
}

export function filePath(runId: string, kind: StoredKind, sha256: string): string {
  return kind === 'snapshot'
    ? `${RUNS_DIR}/${checkRun(runId)}/snap/${checkSha(sha256)}${SNAPSHOT_EXT}`
    : `${RUNS_DIR}/${checkRun(runId)}/seg/${checkSha(sha256)}${SEGMENT_EXT}`;
}

export function headerPath(slot: string): string {
  return `${SLOTS_DIR}/${checkSlot(slot)}.json`;
}

export function prevHeaderPath(slot: string): string {
  return `${SLOTS_DIR}/${checkSlot(slot)}.prev.json`;
}

const FILE_PATH = /^runs\/(r-[0-9a-f]{8,32})\/(snap|seg)\/([0-9a-f]{64})\.(hks|hkg)$/;

/** The run, kind and hash of a content-addressed file path, or null. */
export function parseFilePath(
  path: string,
): { runId: string; kind: StoredKind; sha256: string } | null {
  const m = FILE_PATH.exec(path);
  if (!m) return null;
  const kind: StoredKind = m[2] === 'snap' ? 'snapshot' : 'segment';
  if ((kind === 'snapshot') !== (m[4] === 'hks')) return null;
  return { runId: m[1] as string, kind, sha256: m[3] as string };
}

const TRASH_PATH = /^trash\/(\d+)\/(runs\/.+)$/;

/** Where a file goes when it is collected (the stamp is the time it was moved). */
export function trashPath(path: string, stampMs: number): string {
  return `${TRASH_DIR}/${Math.floor(stampMs)}/${path}`;
}

/** The trash stamp and the original path of a trashed file, or null. */
export function parseTrashPath(path: string): { stampMs: number; original: string } | null {
  const m = TRASH_PATH.exec(path);
  return m ? { stampMs: Number(m[1]), original: m[2] as string } : null;
}

/** Reject anything that could leave the saves directory. */
export function assertSafePath(path: string): void {
  if (
    path.length === 0 ||
    path.length > 400 ||
    path.startsWith('/') ||
    path.includes('\\') ||
    path.includes(':') ||
    path.split('/').some((s) => s === '' || s === '.' || s === '..')
  ) {
    throw new Error(`unsafe save path ${path}`);
  }
}
