// The game side of the save container: one RunSaver per running world. At a safe point it
// drains the engine's replay log and serialises the world synchronously (5.4 step 1),
// then encodes, hashes and commits through a SaveBackend: the drained commands become a
// `commands` segment (13.6), the world a snapshot, and every few game days the snapshot
// also becomes an anchor. Drained commands stay pending until a save commits, so a failed
// save loses nothing. The chain of segments restarts from a fresh anchor whenever it can
// no longer replay the run: the engine dropped log entries at its hard cap, the AI mode
// changed when a save was loaded, or a file of the chain went missing. loadSlot reads a
// slot back, falling back to the previous generation when the current one is broken
// (levels 1 and 2 of 5.6); the migration chain plugs into its `migrate` hook (PK-M0-18).

import type { AiMode } from '../ai_port';
import { TICKS_PER_GAME_DAY } from '../time';
import { type LoggedCommand, WORLD_VERSION, type World } from '../world';
import type { SaveBackend, SaveFileBlob, SaveWriteResult } from './backend';
import { decodeSaveBytes, defaultCodec, type SaveCodec } from './codec';
import {
  type AnchorRef,
  CONTAINER_VERSION,
  NO_FLAGS,
  SAVE_FORMAT,
  type SaveFlags,
  type SaveSummary,
  type SaveVersions,
  type SegmentRef,
  type SlotHeader,
  type SlotHeaderDraft,
  type SlotId,
} from './header';
import {
  type DecodedSegment,
  decodeCommandSegment,
  encodeCommandSegment,
  joinSegments,
} from './segments';
import { sha256Hex } from './sha256';
import { deserializeWorld, serializeWorld } from './world_file';

/** What a save takes from the running game: the world and its replay log. */
export interface LogSource {
  readonly world: World;
  /** The commands logged since the last call (Engine.drainLog). */
  drainLog(): LoggedCommand[];
  /** The log dropped entries since the last drain (Engine.logGap). */
  readonly logGap?: boolean;
}

export interface AnchorPolicy {
  /** A snapshot becomes an anchor when the last one is at least this old. */
  everyTicks: number;
  /** Anchors kept per header (the newest). */
  keep: number;
}

/** 5.3: one anchor every 7 game days, the latest 4 kept. */
export const DEFAULT_ANCHORS: AnchorPolicy = { everyTicks: 7 * TICKS_PER_GAME_DAY, keep: 4 };
/**
 * 5.4: once a stream has more than this many segments, the next save merges the ones not
 * merged yet into one (earlier merged segments stay as they are).
 */
export const MERGE_ABOVE = 64;

export interface RunSaverOptions {
  backend: SaveBackend;
  runId: string;
  /** The version fields of this build (worldVersion comes from the kernel). */
  versions: Omit<SaveVersions, 'worldVersion'>;
  codec?: SaveCodec;
  anchors?: AnchorPolicy;
  mergeAbove?: number;
  /** Continue the chain of a loaded slot (its segments, anchors and tick). */
  from?: SlotHeader | null;
  /** The AI mode the loaded snapshot was saved with (LoadedSave.aiMode). */
  fromMode?: AiMode;
  flags?: Partial<SaveFlags>;
}

export interface SaveRequest {
  slot: SlotId;
  /** real-world save time, ISO string */
  savedAt: string;
  summary: SaveSummary;
  label?: string;
  flags?: Partial<SaveFlags>;
}

export class RunSaver {
  readonly runId: string;
  private readonly backend: SaveBackend;
  private readonly codec: SaveCodec;
  private readonly anchorPolicy: AnchorPolicy;
  private readonly mergeAbove: number;
  private readonly versions: Omit<SaveVersions, 'worldVersion'>;
  private readonly runFlags: Partial<SaveFlags>;
  /** committed segments of the chain this world continues */
  private chain: SegmentRef[];
  private anchors: AnchorRef[];
  /** drained but not yet committed commands */
  private pending: LoggedCommand[] = [];
  /** the chain covers commands up to this tick */
  private coveredTick: number;
  /** a slot whose header references the whole committed chain (for merging) */
  private chainSlot: SlotId | null;
  /** the loaded snapshot and its AI mode, until the first save has checked the mode */
  private from: { tick: number; sha256: string; mode: AiMode | undefined } | null;
  private tail: Promise<unknown> = Promise.resolve();
  private inFlight = 0;

  constructor(opts: RunSaverOptions) {
    this.runId = opts.runId;
    this.backend = opts.backend;
    this.codec = opts.codec ?? defaultCodec();
    this.anchorPolicy = opts.anchors ?? DEFAULT_ANCHORS;
    this.mergeAbove = opts.mergeAbove ?? MERGE_ABOVE;
    this.versions = opts.versions;
    const from = opts.from ?? null;
    this.runFlags = { ...(from ? pickRunFlags(from.flags) : {}), ...opts.flags };
    this.chain = from ? [...from.files.segments] : [];
    this.anchors = from ? [...from.files.anchors] : [];
    const commands = this.chain.filter((s) => s.kind === 'commands');
    this.coveredTick = commands.length
      ? (commands[commands.length - 1] as SegmentRef).toTick
      : (from?.tick ?? 0);
    this.chainSlot = from?.slot ?? null;
    this.from = from
      ? { tick: from.tick, sha256: from.files.snapshot.sha256, mode: opts.fromMode }
      : null;
  }

  /** True while a save is being encoded or written ("not writing" is part of a safe point). */
  get writing(): boolean {
    return this.inFlight > 0;
  }

  /** Resolves once every save started so far has finished. */
  idle(): Promise<void> {
    return this.tail.then(() => undefined);
  }

  /** Commands drained from the engine that no committed save holds yet. */
  get pendingCommands(): number {
    return this.pending.length;
  }

  /** The committed segments and anchors (for tests and the replay tool). */
  get committed(): { segments: readonly SegmentRef[]; anchors: readonly AnchorRef[] } {
    return { segments: this.chain, anchors: this.anchors };
  }

  /**
   * Save the world into a slot. The world and the log are taken synchronously, so the
   * caller may keep stepping the engine while the save is encoded and written.
   */
  save(source: LogSource, req: SaveRequest): Promise<SaveWriteResult> {
    const gap = source.logGap === true;
    const drained = source.drainLog();
    const tick = source.world.meta.tick;
    const mode = source.world.ai.mode;
    const snapshot = serializeWorld(source.world);
    const from = this.from;
    this.from = null;
    let restart: { tick: number; anchor: AnchorRef | null } | null = null;
    if (gap) {
      // The log lost entries: these commands do not carry the run on. Start over here.
      restart = { tick, anchor: null };
    } else {
      for (const e of drained) this.pending.push(e);
      if (from?.mode !== undefined && from.mode !== mode) {
        // The AI mode changed with the load: replays start at the loaded snapshot.
        restart = { tick: from.tick, anchor: { tick: from.tick, sha256: from.sha256 } };
      }
    }
    this.inFlight++;
    const run = this.tail.then(async () => {
      if (restart) this.restartChain(restart.tick, restart.anchor);
      return this.commit(tick, snapshot, mode, req);
    });
    this.tail = run.catch(() => undefined);
    return run.finally(() => {
      this.inFlight--;
    });
  }

  /** Begin a new chain at `tick`: no segments, the given anchor (or the next snapshot). */
  private restartChain(tick: number, anchor: AnchorRef | null): void {
    this.chain = [];
    this.anchors = anchor ? [anchor] : [];
    this.coveredTick = tick;
    this.pending = this.pending.filter((e) => e.tick > tick);
    this.chainSlot = null;
  }

  private async commit(
    tick: number,
    snapshot: string,
    mode: AiMode,
    req: SaveRequest,
  ): Promise<SaveWriteResult> {
    let take = 0;
    while (take < this.pending.length && (this.pending[take] as LoggedCommand).tick <= tick) take++;
    const entries = this.pending.slice(0, take);
    const files: SaveFileBlob[] = [];
    let chain = this.chain;
    if (entries.length > 0) {
      chain = await this.maybeMerge(chain, files);
      const first = commandCount(chain);
      const text = encodeCommandSegment(
        { runId: this.runId, fromTick: this.coveredTick, toTick: tick, first },
        entries,
      );
      const bytes = await this.codec.encode(text);
      const sha256 = sha256Hex(bytes);
      files.push({ kind: 'segment', sha256, bytes });
      chain = [
        ...chain,
        {
          kind: 'commands',
          sha256,
          bytes: bytes.length,
          fromTick: this.coveredTick,
          toTick: tick,
          count: entries.length,
          aiMode: mode,
        },
      ];
    }
    const snapBytes = await this.codec.encode(snapshot);
    const snapSha = sha256Hex(snapBytes);
    const snapFile: SaveFileBlob = { kind: 'snapshot', sha256: snapSha, bytes: snapBytes };
    files.push(snapFile);
    const anchors = nextAnchors(this.anchors, tick, snapSha, this.anchorPolicy);
    const draft = (segments: SegmentRef[], anchorRefs: AnchorRef[]): SlotHeaderDraft => ({
      format: SAVE_FORMAT,
      container: CONTAINER_VERSION,
      worldVersion: WORLD_VERSION,
      ...this.versions,
      slot: req.slot,
      label: req.label ?? '',
      runId: this.runId,
      savedAt: req.savedAt,
      tick,
      flags: { ...NO_FLAGS, ...this.runFlags, ...req.flags },
      summary: req.summary,
      files: {
        snapshot: { sha256: snapSha, bytes: snapBytes.length },
        segments,
        anchors: anchorRefs,
      },
    });
    let res = await this.backend.write({
      runId: this.runId,
      slotId: req.slot,
      files,
      header: draft(chain, anchors),
    });
    if (!res.ok && res.code === 'missing_file' && (this.chain.length || this.anchors.length)) {
      // A file of the chain is gone (deleted with its slots, or never synced): the chain
      // cannot replay any more, so it starts over at this snapshot.
      this.restartChain(tick, null);
      const fresh = [{ tick, sha256: snapSha }];
      res = await this.backend.write({
        runId: this.runId,
        slotId: req.slot,
        files: [snapFile],
        header: draft([], fresh),
      });
      if (res.ok) {
        this.chain = [];
        this.anchors = fresh;
        this.chainSlot = req.slot;
      }
      return res;
    }
    if (res.ok) {
      this.pending.splice(0, take);
      this.chain = chain;
      this.anchors = anchors;
      if (entries.length > 0) this.coveredTick = tick;
      this.chainSlot = req.slot;
    }
    return res;
  }

  /**
   * Merge the commands segments not merged yet into one when the stream has too many
   * (5.4); earlier merged segments are left alone, so no history is copied twice. Best
   * effort: segments of different AI modes are not merged, and when the old segments
   * cannot be read back (their slot was deleted meanwhile) the chain simply stays long.
   */
  private async maybeMerge(chain: SegmentRef[], files: SaveFileBlob[]): Promise<SegmentRef[]> {
    const commands = chain.filter((s) => s.kind === 'commands');
    if (commands.length <= this.mergeAbove || !this.chainSlot) return chain;
    let firstTail = commands.length;
    while (firstTail > 0 && !commands[firstTail - 1]?.merged) firstTail--;
    const tail = commands.slice(firstTail);
    if (tail.length < 2 || tail.some((s) => s.aiMode !== tail[0]?.aiMode)) return chain;
    let all: LoggedCommand[];
    let first: number;
    try {
      const decoded = await readSegments(this.backend, this.chainSlot, tail);
      all = joinSegments(decoded);
      first = decoded[0]?.meta.first ?? 0;
    } catch {
      return chain;
    }
    const fromTick = (tail[0] as SegmentRef).fromTick;
    const toTick = (tail[tail.length - 1] as SegmentRef).toTick;
    const text = encodeCommandSegment({ runId: this.runId, fromTick, toTick, first }, all);
    const bytes = await this.codec.encode(text);
    const sha256 = sha256Hex(bytes);
    files.push({ kind: 'segment', sha256, bytes });
    const merged: SegmentRef = {
      kind: 'commands',
      sha256,
      bytes: bytes.length,
      fromTick,
      toTick,
      count: all.length,
      merged: true,
    };
    if (tail[0]?.aiMode) merged.aiMode = tail[0].aiMode;
    const kept = new Set(tail.map((t) => t.sha256));
    return [...chain.filter((s) => !(s.kind === 'commands' && kept.has(s.sha256))), merged];
  }
}

function pickRunFlags(f: SaveFlags): Partial<SaveFlags> {
  // Ironman and demo belong to the run; recovered and tainted describe one save.
  return { ironman: f.ironman, demo: f.demo };
}

function commandCount(chain: readonly SegmentRef[]): number {
  let n = 0;
  for (const s of chain) if (s.kind === 'commands') n += s.count;
  return n;
}

export function nextAnchors(
  anchors: readonly AnchorRef[],
  tick: number,
  sha256: string,
  policy: AnchorPolicy,
): AnchorRef[] {
  const last = anchors[anchors.length - 1];
  if (last && tick - last.tick < policy.everyTicks) return [...anchors];
  if (last && last.tick === tick && last.sha256 === sha256) return [...anchors];
  return [...anchors, { tick, sha256 }].slice(-Math.max(1, policy.keep));
}

// ---------------------------------------------------------------------------
// Reading

/** empty: no save; unreadable: no generation loads; newer: saved by a newer version (5.5) */
export type LoadProblem = 'empty' | 'unreadable' | 'newer';

export class SaveLoadError extends Error {
  constructor(
    readonly problem: LoadProblem,
    message: string,
  ) {
    super(message);
    this.name = 'SaveLoadError';
  }
}

/** Turns a snapshot's text into a current world; PK-M0-18 plugs the migration chain in. */
export type WorldMigrator = (text: string, header: SlotHeader) => World;

export const strictMigrator: WorldMigrator = (text) => deserializeWorld(text);

export interface LoadedSave {
  world: World;
  /** the header the world came from (the previous generation after a fallback) */
  header: SlotHeader;
  /** 0: current generation; 1: header broken, previous used; 2: files broken, previous used */
  level: 0 | 1 | 2;
  /** a referenced file was missing: probably still syncing from the cloud (5.7) */
  cloudPending: boolean;
  /** the AI mode the world was saved with (resuming may change it on the world) */
  aiMode: AiMode;
}

/** Read a slot's world, falling back to the previous generation (5.6 levels 1 and 2). */
export async function loadSlot(
  backend: SaveBackend,
  slot: SlotId,
  migrate: WorldMigrator = strictMigrator,
): Promise<LoadedSave> {
  const rec = (await backend.list()).find((r) => r.slot === slot);
  if (!rec) throw new SaveLoadError('empty', `slot ${slot} is empty`);
  if (rec.problem === 'newer_container' || (rec.header?.worldVersion ?? 0) > WORLD_VERSION) {
    throw new SaveLoadError('newer', `slot ${slot} was saved by a newer version`);
  }
  const tries: { header: SlotHeader; level: 0 | 1 | 2 }[] = [];
  if (rec.header) tries.push({ header: rec.header, level: 0 });
  if (rec.prev) tries.push({ header: rec.prev, level: rec.header ? 2 : 1 });
  let cloudPending = false;
  const reasons: string[] = [];
  for (const t of tries) {
    try {
      const world = await readWorld(backend, slot, t.header.files.snapshot.sha256, (text) =>
        migrate(text, t.header),
      );
      return { world, header: t.header, level: t.level, cloudPending, aiMode: world.ai.mode };
    } catch (err) {
      if (err instanceof MissingFile) cloudPending = true;
      reasons.push(String((err as Error)?.message ?? err));
    }
  }
  if (rec.problem && rec.problem !== 'missing') reasons.unshift(`header ${rec.problem}`);
  throw new SaveLoadError('unreadable', `slot ${slot} is unreadable: ${reasons.join('; ')}`);
}

class MissingFile extends Error {}

async function readBytes(backend: SaveBackend, slot: SlotId, sha256: string): Promise<Uint8Array> {
  const res = await backend.read({ slotId: slot, hashes: [sha256] });
  if (!res.ok) throw new Error(res.reason);
  const f = res.files[0];
  if (!f?.bytes) throw new MissingFile(`file ${sha256} is missing`);
  if (!f.ok) throw new Error(`file ${sha256} fails its hash`);
  return f.bytes;
}

/** Read one snapshot (the slot's own or an anchor) referenced by a slot. */
export async function readWorld(
  backend: SaveBackend,
  slot: SlotId,
  sha256: string,
  migrate: (text: string) => World = (text) => deserializeWorld(text),
): Promise<World> {
  const text = await decodeSaveBytes(await readBytes(backend, slot, sha256));
  const world = migrate(text);
  if (!Array.isArray(world.log)) world.log = [];
  return world;
}

/** Read and decode commands segments referenced by a slot, in order. */
export async function readSegments(
  backend: SaveBackend,
  slot: SlotId,
  segments: readonly SegmentRef[],
): Promise<DecodedSegment[]> {
  const out: DecodedSegment[] = [];
  for (const s of segments) {
    if (s.kind !== 'commands') continue;
    const text = await decodeSaveBytes(await readBytes(backend, slot, s.sha256));
    const seg = decodeCommandSegment(text);
    if (seg.meta.count !== s.count || seg.meta.toTick !== s.toTick) {
      throw new Error(`segment ${s.sha256} does not match its header entry`);
    }
    out.push(seg);
  }
  return out;
}
