// SaveBackend: the only way the game reads and writes saves (release_engineering.md 5.2).
// Its methods mirror the hk:save.* channels one to one (2.3), so the desktop host is a
// pass-through to the main process, while the web build and the tests run the same
// container (./container.ts) in-process over IndexedDB or memory.

import type { HeaderProblem, SlotHeader, SlotHeaderDraft, SlotId } from './header';
import type { StoredKind } from './storage';

/** One content-addressed file of a save write. */
export interface SaveFileBlob {
  kind: StoredKind;
  sha256: string;
  /** the stored (encoded) bytes */
  bytes: Uint8Array;
}

export interface SaveWriteRequest {
  runId: string;
  slotId: SlotId;
  /** New files of this save; files the run volume already holds may be left out. */
  files: SaveFileBlob[];
  header: SlotHeaderDraft;
}

export type SaveErrorCode =
  | 'bad_request'
  | 'hash_mismatch'
  | 'missing_file'
  | 'not_found'
  | 'not_referenced'
  /** out of disk space or browser storage quota */
  | 'quota'
  /** the slot holds a save from a newer version of the game (5.5) */
  | 'newer_version'
  | 'io';

export interface SaveFailure {
  ok: false;
  code: SaveErrorCode;
  reason: string;
}

export type SaveWriteResult = { ok: true; header: SlotHeader } | SaveFailure;

export interface SlotRecord {
  slot: SlotId;
  /** the current generation, or null when it is missing or broken */
  header: SlotHeader | null;
  /** the previous generation (`.prev.json`), or null */
  prev: SlotHeader | null;
  /** why the current generation is unusable (level 1 of 5.6) */
  problem?: HeaderProblem | 'missing';
}

export interface SaveReadRequest {
  slotId: SlotId;
  /** files to read; each must be referenced by the slot's current or previous header */
  hashes: string[];
}

export interface SaveReadFile {
  sha256: string;
  kind: StoredKind;
  /** null when the file is missing (for example not synced from the cloud yet) */
  bytes: Uint8Array | null;
  /** the bytes hash to their name */
  ok: boolean;
}

export type SaveReadResult = { ok: true; files: SaveReadFile[] } | SaveFailure;

/** A valid snapshot no slot references any more (5.7: "recoverable saves"). */
export interface Recoverable {
  /** `<runId>.<sha256>` */
  id: string;
  runId: string;
  sha256: string;
  tick: number;
  worldVersion: number;
  /** story act at that tick, when the world records one */
  act: string;
  bytes: number;
  mtimeMs: number;
  inTrash: boolean;
}

export interface SaveBackend {
  /** Every slot that has a header file, current and previous generation verified. */
  list(): Promise<SlotRecord[]>;
  /** Files first, then the header: the commit point (5.4). */
  write(req: SaveWriteRequest): Promise<SaveWriteResult>;
  read(req: SaveReadRequest): Promise<SaveReadResult>;
  /** Removes the slot's headers only; its files are left to collection. */
  delete(req: { slotId: SlotId }): Promise<void>;
  recoverables(): Promise<Recoverable[]>;
  /** Commit a recoverable snapshot as a new generation of a slot, flagged recovered. */
  restore(req: { candidateId: string; slotId: SlotId }): Promise<SaveWriteResult>;
}

export function recoverableId(runId: string, sha256: string): string {
  return `${runId}.${sha256}`;
}

export function parseRecoverableId(id: string): { runId: string; sha256: string } | null {
  const m = /^(r-[0-9a-f]{8,32})\.([0-9a-f]{64})$/.exec(id);
  return m ? { runId: m[1] as string, sha256: m[2] as string } : null;
}
