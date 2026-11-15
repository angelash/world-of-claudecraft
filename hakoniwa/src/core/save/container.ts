// The save container (release_engineering.md 5.2 to 5.7) over any SaveStorage. One run
// volume per game (`runs/<runId>/`) holds content-addressed snapshots and segments that
// every slot of that run shares; a slot is just a header naming files in the volume.
//
// Write order (5.4): segments, then the snapshot, each as a temp file then renamed to its
// hash name (skipped when already present); then the current header is copied to
// `.prev.json` and the new header is written as a temp file and renamed: that rename is
// the commit point. A power cut before it leaves the old header whole, and every file it
// names untouched. The current header becomes the previous one only while it is usable
// (it verifies and its snapshot is whole), so a save never pushes the last good
// generation out of a slot. A header from a newer build is never overwritten (5.5).
//
// Collection (5.4 step 5) is mark and sweep: files no header or previous header names
// (headers this build cannot read are marked loosely) move to `trash/<stamp>/...` once
// they are an hour old, and trashed files are deleted after 14 days. Unreferenced valid
// snapshots, in the volume or the trash, are the "recoverable saves" of 5.7 and can be
// committed into a slot again.

import {
  parseRecoverableId,
  type Recoverable,
  recoverableId,
  type SaveBackend,
  type SaveFailure,
  type SaveFileBlob,
  type SaveReadFile,
  type SaveReadRequest,
  type SaveReadResult,
  type SaveWriteRequest,
  type SaveWriteResult,
  type SlotRecord,
} from './backend';
import { decodeSavePrefix } from './codec';
import {
  CONTAINER_VERSION,
  checkHeader,
  headerRefs,
  isHeaderDraft,
  isRunId,
  isSha256,
  isSlotId,
  looseRefs,
  NO_FLAGS,
  parseHeader,
  SAVE_FORMAT,
  type SaveVersions,
  type SlotHeader,
  type SlotHeaderDraft,
  type SlotId,
  sealHeader,
} from './header';
import { sha256Hex } from './sha256';
import {
  filePath,
  headerPath,
  parseFilePath,
  parseTrashPath,
  prevHeaderPath,
  RUNS_DIR,
  type SaveStorage,
  SLOTS_DIR,
  type StoredKind,
  TMP_SUFFIX,
  TRASH_DIR,
  trashPath,
} from './storage';

export const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

export interface ContainerOptions {
  /** Wall clock, ms since the epoch (injected: the kernel reads no clock). */
  now: () => number;
  /** This machine: shown in the slot list to tell cloud-synced writers apart (5.7). */
  writer: { id: string; name: string };
  /** Files younger than this are never collected (cloud-sync race guard). Default 1 hour. */
  freshMs?: number;
  /** Trashed files are deleted after this. Default 14 days. */
  trashMs?: number;
  /** Collect after every write and delete. Default true. */
  autoCollect?: boolean;
  /** Version fields for headers the container writes itself (restore). */
  versions?: Partial<SaveVersions>;
  /**
   * Temp-name tag (lowercase letters and digits) of this instance, so two instances on one
   * store (two browser tabs) never write the same temp file. Default none.
   */
  tmpTag?: string;
}

export interface CollectReport {
  trashed: number;
  deleted: number;
  rescued: number;
  tmpRemoved: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fail(code: SaveFailure['code'], reason: string): SaveFailure {
  return { ok: false, code, reason };
}

function message(err: unknown): string {
  return String((err as Error)?.message ?? err);
}

/** A storage error as a failure: quota and disk-full errors get their own code. */
function ioFailure(err: unknown): SaveFailure {
  const e = err as { name?: string; code?: unknown } | null;
  const quota =
    e?.name === 'QuotaExceededError' ||
    e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    e?.code === 'ENOSPC' ||
    e?.code === 22;
  return fail(quota ? 'quota' : 'io', message(err));
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** ISO 8601 UTC text of an epoch time, without reading a clock. */
export function isoTime(ms: number): string {
  const t = Math.floor(ms);
  const days = Math.floor(t / DAY_MS);
  let rem = t - days * DAY_MS;
  const hh = Math.floor(rem / HOUR_MS);
  rem -= hh * HOUR_MS;
  const mi = Math.floor(rem / 60000);
  rem -= mi * 60000;
  const ss = Math.floor(rem / 1000);
  const msPart = rem - ss * 1000;
  // Civil date from days since 1970-01-01 (proleptic Gregorian).
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp < 10 ? mp + 3 : mp - 9;
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0);
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mi)}:${pad(ss)}.${pad(msPart, 3)}Z`;
}

/** A save refused because the slot holds a header from a newer build (5.5). */
class NewerSave extends Error {}

/** Header file name to slot id: `manual_07.json` and `manual_07.prev.json` both give `manual_07`. */
function slotOfHeaderPath(path: string): SlotId | null {
  const m = /^slots\/([a-z0-9_]+?)(\.prev)?\.json$/.exec(path);
  return m && isSlotId(m[1]) ? (m[1] as SlotId) : null;
}

export class ContainerBackend implements SaveBackend {
  private readonly now: () => number;
  private readonly freshMs: number;
  private readonly trashMs: number;
  private readonly autoCollect: boolean;
  private readonly writer: { id: string; name: string };
  private readonly tmpSuffix: string;
  /** Snapshot facts by hash, for the recoverable list (snapshots never change). */
  private readonly infos = new Map<string, SnapshotInfo | null>();
  /** Serialises every operation: one writer at a time, and no read during a collection. */
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly storage: SaveStorage,
    private readonly opts: ContainerOptions,
  ) {
    this.now = opts.now;
    this.freshMs = opts.freshMs ?? HOUR_MS;
    this.trashMs = opts.trashMs ?? 14 * DAY_MS;
    this.autoCollect = opts.autoCollect ?? true;
    // Keep the commit fields inside what a header may hold, or nothing would verify.
    this.writer = { id: opts.writer.id.slice(0, 64), name: opts.writer.name.slice(0, 128) };
    const tag = opts.tmpTag ?? '';
    if (!/^[a-z0-9]{0,16}$/.test(tag)) throw new Error(`bad temp tag ${tag}`);
    this.tmpSuffix = tag ? `.${tag}${TMP_SUFFIX}` : TMP_SUFFIX;
  }

  private tmp(path: string): string {
    return path + this.tmpSuffix;
  }

  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.tail.then(fn, fn);
    this.tail = run.catch(() => undefined);
    return run;
  }

  // -------------------------------------------------------------------------
  // SaveBackend

  list(): Promise<SlotRecord[]> {
    return this.exclusive(() => this.listNow());
  }

  write(req: SaveWriteRequest): Promise<SaveWriteResult> {
    return this.exclusive(async () => {
      const bad = this.checkWrite(req);
      if (bad) return bad;
      try {
        // Segments before snapshots (5.4 steps 2 and 3).
        const order = [...req.files].sort(
          (a, b) => Number(a.kind === 'snapshot') - Number(b.kind === 'snapshot'),
        );
        for (const f of order) await this.putFile(req.runId, f);
        for (const ref of headerRefs(req.header)) {
          const path = filePath(req.runId, ref.kind, ref.sha256);
          if (!(await this.storage.stat(path)) && !(await this.rescue(path))) {
            return fail('missing_file', `${ref.kind} ${ref.sha256} is not in the run volume`);
          }
        }
        const header = await this.commit(req.header);
        await this.afterChange();
        return { ok: true, header };
      } catch (err) {
        return commitFailure(err);
      }
    });
  }

  read(req: SaveReadRequest): Promise<SaveReadResult> {
    return this.exclusive(async () => {
      if (!isSlotId(req.slotId) || !Array.isArray(req.hashes)) {
        return fail('bad_request', 'bad read request');
      }
      const rec = await this.record(req.slotId);
      if (!rec) return fail('not_found', `slot ${req.slotId} is empty`);
      const known = new Map<string, { kind: StoredKind; runId: string }>();
      for (const h of [rec.prev, rec.header]) {
        if (!h) continue;
        for (const r of headerRefs(h)) known.set(r.sha256, { kind: r.kind, runId: h.runId });
      }
      const files: SaveReadFile[] = [];
      for (const sha of req.hashes) {
        const ref = isSha256(sha) ? known.get(sha) : undefined;
        if (!ref) return fail('not_referenced', `${sha} is not referenced by slot ${req.slotId}`);
        const path = filePath(ref.runId, ref.kind, sha);
        let bytes = await this.storage.read(path);
        if (!bytes && (await this.rescue(path))) bytes = await this.storage.read(path);
        files.push({ sha256: sha, kind: ref.kind, bytes, ok: !!bytes && sha256Hex(bytes) === sha });
      }
      return { ok: true, files };
    });
  }

  delete(req: { slotId: SlotId }): Promise<void> {
    return this.exclusive(async () => {
      if (!isSlotId(req.slotId)) throw new Error(`bad slot id ${req.slotId}`);
      // Previous generation first: a cut in between leaves the slot with its current
      // generation only (readable whenever it was readable before).
      await this.storage.remove(prevHeaderPath(req.slotId));
      await this.storage.remove(headerPath(req.slotId));
      await this.afterChange();
    });
  }

  recoverables(): Promise<Recoverable[]> {
    return this.exclusive(() => this.findRecoverables());
  }

  restore(req: { candidateId: string; slotId: SlotId }): Promise<SaveWriteResult> {
    return this.exclusive(async () => {
      const id = parseRecoverableId(req.candidateId);
      if (!id || !isSlotId(req.slotId)) return fail('bad_request', 'bad restore request');
      try {
        const path = filePath(id.runId, 'snapshot', id.sha256);
        if (!(await this.storage.stat(path)) && !(await this.rescue(path))) {
          return fail('not_found', `no recoverable save ${req.candidateId}`);
        }
        const bytes = await this.storage.read(path);
        const whole = !!bytes && sha256Hex(bytes) === id.sha256;
        const info = whole && bytes ? await this.info(id.sha256, bytes) : null;
        if (!bytes || !info) return fail('not_found', `snapshot ${id.sha256} is not valid`);
        const v = this.opts.versions ?? {};
        const draft: SlotHeaderDraft = {
          format: SAVE_FORMAT,
          container: CONTAINER_VERSION,
          worldVersion: info.version,
          gameVersion: v.gameVersion ?? '',
          contentVersion: v.contentVersion ?? '',
          renameVersion: v.renameVersion ?? 0,
          build: v.build ?? '',
          slot: req.slotId,
          label: '',
          runId: id.runId,
          savedAt: isoTime(this.now()),
          tick: info.tick,
          flags: { ...NO_FLAGS, recovered: true },
          summary: { act: info.act, map: '' },
          files: {
            snapshot: { sha256: id.sha256, bytes: bytes.length },
            segments: [],
            anchors: [{ tick: info.tick, sha256: id.sha256 }],
          },
        };
        const header = await this.commit(draft);
        await this.afterChange();
        return { ok: true, header };
      } catch (err) {
        return commitFailure(err);
      }
    });
  }

  /** Run collection now (also runs after every write and delete unless disabled). */
  collect(): Promise<CollectReport> {
    return this.exclusive(() => this.collectNow());
  }

  // -------------------------------------------------------------------------

  private checkWrite(req: SaveWriteRequest): SaveFailure | null {
    if (!req || !isSlotId(req.slotId) || !isRunId(req.runId)) {
      return fail('bad_request', 'bad slot or run id');
    }
    const h = req.header;
    if (!isHeaderDraft(h) || h.slot !== req.slotId || h.runId !== req.runId) {
      return fail('bad_request', 'bad header');
    }
    if (h.container > CONTAINER_VERSION) return fail('bad_request', 'newer container version');
    if (!Array.isArray(req.files)) return fail('bad_request', 'bad file list');
    for (const f of req.files) {
      if (
        !f ||
        (f.kind !== 'snapshot' && f.kind !== 'segment') ||
        !isSha256(f.sha256) ||
        !(f.bytes instanceof Uint8Array)
      ) {
        return fail('bad_request', 'bad file');
      }
      if (sha256Hex(f.bytes) !== f.sha256) {
        return fail('hash_mismatch', `${f.kind} bytes do not hash to ${f.sha256}`);
      }
    }
    return null;
  }

  /** Content-addressed write: `.tmp`, then rename; skipped when the name already holds it. */
  private async putFile(runId: string, f: SaveFileBlob): Promise<void> {
    const path = filePath(runId, f.kind, f.sha256);
    const st = await this.storage.stat(path);
    if (st && st.bytes === f.bytes.length) {
      const have = await this.storage.read(path);
      if (have && sha256Hex(have) === f.sha256) return;
    }
    const tmp = this.tmp(path);
    await this.storage.write(tmp, f.bytes);
    await this.storage.rename(tmp, path);
  }

  /** The header's snapshot is present and whole. */
  private async usable(h: SlotHeader): Promise<boolean> {
    const bytes = await this.storage.read(filePath(h.runId, 'snapshot', h.files.snapshot.sha256));
    return !!bytes && sha256Hex(bytes) === h.files.snapshot.sha256;
  }

  /**
   * Copy the current header to `.prev.json` when it is usable, then write the new one (the
   * commit point). A broken current generation is dropped instead, so the previous one
   * stays the slot's fallback. A header from a newer build is never replaced.
   */
  private async commit(draft: SlotHeaderDraft): Promise<SlotHeader> {
    const slot = draft.slot;
    const curPath = headerPath(slot);
    const prevPath = prevHeaderPath(slot);
    const curBytes = await this.storage.read(curPath);
    const cur = curBytes ? parseHeader(decoder.decode(curBytes)) : null;
    const prevBytes = await this.storage.read(prevPath);
    const prev = prevBytes ? parseHeader(decoder.decode(prevBytes)) : null;
    for (const h of [cur, prev]) {
      if (h && !h.ok && h.problem === 'newer_container') {
        throw new NewerSave(`slot ${slot} holds a save from a newer version`);
      }
    }
    if (curBytes && cur?.ok && (await this.usable(cur.header))) {
      await this.storage.write(this.tmp(prevPath), curBytes);
      await this.storage.rename(this.tmp(prevPath), prevPath);
    }
    const generation =
      Math.max(cur?.ok ? cur.header.generation : 0, prev?.ok ? prev.header.generation : 0) + 1;
    const header = sealHeader(draft, {
      generation,
      writerId: this.writer.id,
      writerName: this.writer.name,
    });
    const check = checkHeader(header);
    if (!check.ok) throw new Error(`the new header would not verify (${check.problem})`);
    await this.storage.write(this.tmp(curPath), encoder.encode(JSON.stringify(header)));
    await this.storage.rename(this.tmp(curPath), curPath);
    return header;
  }

  private async afterChange(): Promise<void> {
    if (!this.autoCollect) return;
    try {
      await this.collectNow();
    } catch {
      // Collection is housekeeping: the save itself is already committed.
    }
  }

  private async readHeader(path: string): Promise<ReturnType<typeof parseHeader> | null> {
    const bytes = await this.storage.read(path);
    return bytes ? parseHeader(decoder.decode(bytes)) : null;
  }

  private async record(slot: SlotId): Promise<SlotRecord | null> {
    const cur = await this.readHeader(headerPath(slot));
    const prev = await this.readHeader(prevHeaderPath(slot));
    if (!cur && !prev) return null;
    const header = cur?.ok ? cur.header : null;
    const rec: SlotRecord = { slot, header, prev: prev?.ok ? prev.header : null };
    if (!header) rec.problem = cur && !cur.ok ? cur.problem : 'missing';
    return rec;
  }

  private async listNow(): Promise<SlotRecord[]> {
    const slots = new Set<SlotId>();
    for (const p of await this.storage.list(SLOTS_DIR)) {
      const s = slotOfHeaderPath(p);
      if (s) slots.add(s);
    }
    const out: SlotRecord[] = [];
    for (const s of [...slots].sort()) {
      const rec = await this.record(s);
      if (rec) out.push(rec);
    }
    return out;
  }

  /**
   * Every file path any header file references: verified headers exactly, and headers this
   * build cannot use (newer container, other shape, unknown slot) loosely, by every hash
   * they carry, so collection never takes files a newer build still needs.
   */
  private async marked(): Promise<Set<string>> {
    const refs = new Set<string>();
    for (const p of await this.storage.list(SLOTS_DIR)) {
      if (!p.endsWith('.json')) continue;
      const bytes = await this.storage.read(p);
      if (!bytes) continue;
      const text = decoder.decode(bytes);
      const h = parseHeader(text);
      if (h.ok) {
        for (const r of headerRefs(h.header)) refs.add(filePath(h.header.runId, r.kind, r.sha256));
        continue;
      }
      const loose = looseRefs(text);
      if (!loose) continue;
      for (const sha of loose.sha256) {
        refs.add(filePath(loose.runId, 'snapshot', sha));
        refs.add(filePath(loose.runId, 'segment', sha));
      }
    }
    return refs;
  }

  /** Move a trashed copy of `path` back into the volume. */
  private async rescue(path: string): Promise<boolean> {
    for (const p of await this.storage.list(TRASH_DIR)) {
      const t = parseTrashPath(p);
      if (t?.original !== path) continue;
      await this.storage.rename(p, path);
      return true;
    }
    return false;
  }

  private async collectNow(): Promise<CollectReport> {
    const now = this.now();
    const report: CollectReport = { trashed: 0, deleted: 0, rescued: 0, tmpRemoved: 0 };
    const refs = await this.marked();
    // Temp files a cut left behind. Only old ones: another instance on the same store (a
    // second tab) may be writing a fresh one right now.
    for (const p of [
      ...(await this.storage.list(SLOTS_DIR)),
      ...(await this.storage.list(RUNS_DIR)),
    ]) {
      if (!p.endsWith(TMP_SUFFIX)) continue;
      const st = await this.storage.stat(p);
      if (st && now - st.mtimeMs < this.freshMs) continue;
      await this.storage.remove(p);
      report.tmpRemoved++;
    }
    for (const p of await this.storage.list(RUNS_DIR)) {
      if (!parseFilePath(p) || refs.has(p)) continue;
      const st = await this.storage.stat(p);
      if (!st || now - st.mtimeMs < this.freshMs) continue;
      await this.storage.rename(p, trashPath(p, now));
      report.trashed++;
    }
    for (const p of await this.storage.list(TRASH_DIR)) {
      const t = parseTrashPath(p);
      if (!t) continue;
      if (refs.has(t.original)) {
        // A header synced from another machine names it again.
        if (!(await this.storage.stat(t.original))) {
          await this.storage.rename(p, t.original);
          report.rescued++;
        } else {
          await this.storage.remove(p);
          report.deleted++;
        }
      } else if (now - t.stampMs >= this.trashMs) {
        await this.storage.remove(p);
        report.deleted++;
      }
    }
    return report;
  }

  private async info(sha256: string, bytes: Uint8Array): Promise<SnapshotInfo | null> {
    let info = this.infos.get(sha256);
    if (info === undefined) {
      info = await snapshotInfo(bytes);
      this.infos.set(sha256, info);
    }
    return info;
  }

  private async findRecoverables(): Promise<Recoverable[]> {
    const refs = await this.marked();
    const seen = new Set<string>();
    const out: Recoverable[] = [];
    const candidates: { path: string; original: string; inTrash: boolean }[] = [];
    for (const p of await this.storage.list(RUNS_DIR)) {
      candidates.push({ path: p, original: p, inTrash: false });
    }
    for (const p of await this.storage.list(TRASH_DIR)) {
      const t = parseTrashPath(p);
      if (t) candidates.push({ path: p, original: t.original, inTrash: true });
    }
    for (const c of candidates) {
      const f = parseFilePath(c.original);
      if (f?.kind !== 'snapshot' || refs.has(c.original)) continue;
      const id = recoverableId(f.runId, f.sha256);
      if (seen.has(id)) continue;
      let info = this.infos.get(f.sha256);
      if (info === undefined) {
        const bytes = await this.storage.read(c.path);
        info = bytes && sha256Hex(bytes) === f.sha256 ? await snapshotInfo(bytes) : null;
        this.infos.set(f.sha256, info);
      }
      if (!info) continue;
      seen.add(id);
      const st = await this.storage.stat(c.path);
      out.push({
        id,
        runId: f.runId,
        sha256: f.sha256,
        tick: info.tick,
        worldVersion: info.version,
        act: info.act,
        bytes: st?.bytes ?? 0,
        mtimeMs: st?.mtimeMs ?? 0,
        inTrash: c.inTrash,
      });
    }
    out.sort((a, b) => a.runId.localeCompare(b.runId) || b.tick - a.tick);
    return out;
  }
}

export interface SnapshotInfo {
  tick: number;
  version: number;
  act: string;
}

/** How much of a snapshot's text to decode to read its header fields. */
const INFO_PREFIX = 64 * 1024;
const WORLD_FILE_HEAD =
  /^\{"format":"hakoniwa-save","version":(\d+),"savedAtTick":(\d+),"world":\{"meta":/;

/**
 * Tick, world version and act of an encoded snapshot, from the start of its text only
 * (the world file begins with its format, version and tick, then the world's meta and
 * flags), or null when it is not a world file. The caller checks the hash first.
 */
export async function snapshotInfo(bytes: Uint8Array): Promise<SnapshotInfo | null> {
  let text: string;
  try {
    text = await decodeSavePrefix(bytes, INFO_PREFIX);
  } catch {
    return null;
  }
  const head = WORLD_FILE_HEAD.exec(text);
  if (!head) return null;
  const flagsAt = text.indexOf('"flags":{');
  const flags = flagsAt < 0 ? '' : text.slice(flagsAt, text.indexOf('}', flagsAt) + 1);
  const act = /"act":"([^"\\]*)"/.exec(flags)?.[1] ?? '';
  return { tick: Number(head[2]), version: Number(head[1]), act };
}

/** Failures of a write or restore: a newer save in the slot, or a storage error. */
function commitFailure(err: unknown): SaveFailure {
  if (err instanceof NewerSave) return fail('newer_version', err.message);
  return ioFailure(err);
}
