// Storage layout of the desktop build (docs/50_tech/release_engineering.md 5.2, 2.5, 12.1):
// the fixed user data directory name, where settings, secrets, the model ledger, logs and
// saves live under it, and the id and file name rules the file save backend (PK-M0-16) and
// the settings store (PK-M0-20) build their paths with. Pure: path joins and checks only;
// nothing here touches the file system.

import { join } from 'node:path';

/**
 * The user data directory name. Fixed: it never follows the product display name or the
 * language, because the Steam Auto-Cloud paths (4.3) are written against it.
 */
export const USER_DATA_DIR_NAME = 'HakoniwaChronicle';

/** `<system app data>/HakoniwaChronicle`; the shell passes it to app.setPath('userData'). */
export function userDataDir(appDataDir: string): string {
  return join(appDataDir, USER_DATA_DIR_NAME);
}

/** Settings files (13.10): sync follows the cloud, local stays on this machine. */
export type SettingsPart = 'sync' | 'local';
export const SETTINGS_PARTS: readonly SettingsPart[] = ['sync', 'local'];

/** Save file kinds (5.3): world snapshots and append-only segments. */
export type SaveFileKind = 'snapshot' | 'segment';
export const SNAPSHOT_EXT = '.hks';
export const SEGMENT_EXT = '.hkg';

/** Suffixes of the write protocol (5.4) and of the settings fallback (13.10). */
export const TMP_SUFFIX = '.tmp';
export const PREV_SUFFIX = '.prev';
export const BAD_SUFFIX = '.bad';

/**
 * Slot ids (5.1): three rotating autosaves, one quick save, twenty manual saves and the
 * ironman save. The slot id is a file name, so only these are ever accepted.
 */
export const SLOT_IDS: readonly string[] = Object.freeze([
  'quick',
  'auto_1',
  'auto_2',
  'auto_3',
  ...Array.from({ length: 20 }, (_, i) => `manual_${String(i + 1).padStart(2, '0')}`),
  'ironman',
]);

const SLOT_SET: ReadonlySet<string> = new Set(SLOT_IDS);
const RUN_ID = /^r-[0-9a-f]{8,32}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const SAVE_FILE = /^([0-9a-f]{64})\.(hks|hkg)$/;

export function isSlotId(value: unknown): value is string {
  return typeof value === 'string' && SLOT_SET.has(value);
}

/** Run ids are generated at new game: `r-` and 8 to 32 lowercase hex digits. */
export function isRunId(value: unknown): value is string {
  return typeof value === 'string' && RUN_ID.test(value);
}

export function isSha256(value: unknown): value is string {
  return typeof value === 'string' && SHA256.test(value);
}

/** Content-addressed file name: 64 lowercase hex digits plus the kind's fixed suffix. */
export function saveFileName(sha256: string, kind: SaveFileKind): string {
  if (!isSha256(sha256)) throw new Error('bad sha256');
  return sha256 + (kind === 'snapshot' ? SNAPSHOT_EXT : SEGMENT_EXT);
}

/** The hash and kind of a content-addressed file name, or null for any other name. */
export function parseSaveFileName(name: unknown): { sha256: string; kind: SaveFileKind } | null {
  if (typeof name !== 'string') return null;
  const m = SAVE_FILE.exec(name);
  if (!m) return null;
  return { sha256: m[1] as string, kind: m[2] === 'hks' ? 'snapshot' : 'segment' };
}

function slot(id: string): string {
  if (!isSlotId(id)) throw new Error('bad slot id');
  return id;
}

function run(id: string): string {
  if (!isRunId(id)) throw new Error('bad run id');
  return id;
}

/** Every path under the user data directory (5.2). Builders throw on a bad id. */
export interface StorageLayout {
  readonly root: string;
  readonly settingsSync: string;
  readonly settingsLocal: string;
  readonly secrets: string;
  readonly llmDir: string;
  readonly ledger: string;
  readonly flags: string;
  readonly logsDir: string;
  readonly mainLog: string;
  readonly rendererLog: string;
  readonly savesDir: string;
  readonly runsDir: string;
  readonly slotsDir: string;
  readonly thumbsDir: string;
  readonly trashDir: string;
  settings(part: SettingsPart): string;
  runDir(runId: string): string;
  snapshotDir(runId: string): string;
  segmentDir(runId: string): string;
  snapshot(runId: string, sha256: string): string;
  segment(runId: string, sha256: string): string;
  slotHeader(slotId: string): string;
  slotHeaderPrev(slotId: string): string;
  thumb(slotId: string): string;
  /** Directories the shell creates at startup. */
  readonly dirs: readonly string[];
}

export function storageLayout(root: string): StorageLayout {
  const savesDir = join(root, 'saves');
  const runsDir = join(savesDir, 'runs');
  const slotsDir = join(savesDir, 'slots');
  const thumbsDir = join(savesDir, 'thumbs');
  const trashDir = join(savesDir, 'trash');
  const llmDir = join(root, 'llm');
  const logsDir = join(root, 'logs');
  const settingsSync = join(root, 'settings.sync.json');
  const settingsLocal = join(root, 'settings.local.json');
  const runDir = (runId: string) => join(runsDir, run(runId));
  return {
    root,
    settingsSync,
    settingsLocal,
    secrets: join(root, 'secrets.bin'),
    llmDir,
    ledger: join(llmDir, 'ledger.jsonl'),
    flags: join(root, 'flags.jsonl'),
    logsDir,
    mainLog: join(logsDir, 'main.log'),
    rendererLog: join(logsDir, 'renderer.log'),
    savesDir,
    runsDir,
    slotsDir,
    thumbsDir,
    trashDir,
    settings: (part) => (part === 'sync' ? settingsSync : settingsLocal),
    runDir,
    snapshotDir: (runId) => join(runDir(runId), 'snap'),
    segmentDir: (runId) => join(runDir(runId), 'seg'),
    snapshot: (runId, sha) => join(runDir(runId), 'snap', saveFileName(sha, 'snapshot')),
    segment: (runId, sha) => join(runDir(runId), 'seg', saveFileName(sha, 'segment')),
    slotHeader: (slotId) => join(slotsDir, `${slot(slotId)}.json`),
    slotHeaderPrev: (slotId) => join(slotsDir, `${slot(slotId)}${PREV_SUFFIX}.json`),
    thumb: (slotId) => join(thumbsDir, `${slot(slotId)}.png`),
    dirs: [root, llmDir, logsDir, savesDir, runsDir, slotsDir, thumbsDir, trashDir],
  };
}
