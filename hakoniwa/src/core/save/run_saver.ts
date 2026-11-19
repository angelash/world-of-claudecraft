// The game side of the save container: one RunSaver per running world. At a safe point it
// drains the engine's replay log and serialises the world synchronously (5.4 step 1),
// then encodes, hashes and commits through a SaveBackend: the drained commands become a
// `commands` segment (13.6), the world a snapshot, and every few game days the snapshot
// also becomes an anchor. Drained commands stay pending until a save commits, so a failed
// save loses nothing. The chain of segments restarts from a fresh anchor whenever it can
// no longer replay the run: the engine dropped log entries at its hard cap, the AI mode
// changed when a save was loaded, or a file of the chain went missing. loadSlot reads a
// slot back, falling back to the previous generation when the current one is broken
// (levels 1 and 2 of 5.6), migrating every snapshot to this build (./migrate.ts). Levels 3
// and 4 are in ./recovery.ts. The ironman rules of 5.9 are enforced here: an ironman run
// saves only to its own slot, only from autosave triggers and exit, and leaves an anchor
// at every act change.

import type { AiMode } from '../ai_port';
import { TICKS_PER_GAME_DAY } from '../time';
import { type LoggedCommand, WORLD_VERSION, type World } from '../world';
import type { SaveBackend, SaveFileBlob, SaveWriteResult } from './backend';
import { decodeSaveBytes, defaultCodec, type SaveCodec } from './codec';
import {
  type AnchorRef,
  type ClientSegmentData,
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
import { IRONMAN_SLOT, ironmanViolation, type SaveTrigger } from './ironman';
import { anchorMigrator, defaultMigrator, NewerSaveError, type WorldMigrator } from './migrate';
import {
  type DecodedSegment,
  decodeCommandSegment,
  encodeCommandSegment,
  joinSegments,
} from './segments';
import { sha256Hex } from './sha256';
import { buildVersions, newerFields } from './versions';
import { serializeWorld } from './world_file';

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
  /** what asked for the save; an ironman run accepts only `auto`, `exit` and `recovery` */
  trigger?: SaveTrigger;
  /** the interface's segment (opaque here; header.ts bounds it) */
  client?: ClientSegmentData;
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
  private from: {
    tick: number;
    sha256: string;
    mode: AiMode | undefined;
    /** written by another build: its segments do not replay under this one */
    otherBuild: boolean;
  } | null;
  /** the story act at the last save (an ironman run anchors every act change) */
  private lastAct: string | null;
  /** the next snapshot becomes an anchor (a restarted chain has none of its own yet) */
  private forceAnchor = false;
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
    // The run flags carry over from the loaded save and cannot be switched off.
    const inherited = from ? pickRunFlags(from) : {};
    const asked = opts.flags ?? {};
    this.runFlags = {
      ...asked,
      ironman: inherited.ironman === true || asked.ironman === true,
      demo: inherited.demo === true || asked.demo === true,
    };
    // 5.9: a recovered ironman run stays marked recovered.
    if (this.runFlags.ironman && (inherited.recovered || asked.recovered)) {
      this.runFlags.recovered = true;
    }
    this.chain = from ? [...from.files.segments] : [];
    this.anchors = from ? [...from.files.anchors] : [];
    const commands = this.chain.filter((s) => s.kind === 'commands');
    this.coveredTick = commands.length
      ? (commands[commands.length - 1] as SegmentRef).toTick
      : (from?.tick ?? 0);
    this.chainSlot = from?.slot ?? null;
    this.from = from
      ? {
          tick: from.tick,
          sha256: from.files.snapshot.sha256,
          mode: opts.fromMode,
          otherBuild: !sameBuild(from, this.versions),
        }
      : null;
    this.lastAct = from ? from.summary.act : null;
  }

  /** The run is an ironman run (5.9). */
  get ironman(): boolean {
    return this.runFlags.ironman === true;
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
    // Refused before the log is drained, so a refused save loses nothing.
    const ironman = this.ironman || req.flags?.ironman === true;
    const refused = ironmanViolation(ironman, req.slot, req.trigger);
    if (refused) return Promise.resolve({ ok: false, code: 'bad_request', reason: refused });
    const gap = source.logGap === true;
    const drained = source.drainLog();
    const tick = source.world.meta.tick;
    const mode = source.world.ai.mode;
    const snapshot = serializeWorld(source.world);
    const act = String(source.world.meta.flags.act ?? '').slice(0, 64);
    const from = this.from;
    this.from = null;
    let restart: { tick: number; anchor: AnchorRef | null } | null = null;
    if (gap) {
      // The log lost entries: these commands do not carry the run on. Start over here.
      restart = { tick, anchor: null };
    } else {
      for (const e of drained) this.pending.push(e);
      if (from && ((from.mode !== undefined && from.mode !== mode) || from.otherBuild)) {
        // The AI mode changed with the load, or another build wrote the loaded save (its
        // commands replay only under that build): replays start at the loaded snapshot,
        // which the loader migrates like any snapshot.
        restart = { tick: from.tick, anchor: { tick: from.tick, sha256: from.sha256 } };
      }
    }
    this.inFlight++;
    const run = this.tail.then(async () => {
      if (restart) this.restartChain(restart.tick, restart.anchor, true);
      // Against the last committed save, so a failed save leaves the act change to the next.
      const actAnchor = ironman && this.lastAct !== null && act !== this.lastAct ? act : null;
      const res = await this.commit(tick, snapshot, mode, req, actAnchor);
      if (res.ok) this.lastAct = act;
      return res;
    });
    this.tail = run.catch(() => undefined);
    return run.finally(() => {
      this.inFlight--;
    });
  }

  /**
   * Begin a new chain at `tick`: no segments, the given anchor (or the next snapshot). An
   * ironman run's act anchors are kept (they are whole snapshots, replayed or not), except
   * when the restart is for a missing file, which may be one of them.
   */
  private restartChain(tick: number, anchor: AnchorRef | null, keepActs: boolean): void {
    this.chain = [];
    const acts = keepActs ? this.anchors.filter((a) => a.act !== undefined && a.tick < tick) : [];
    this.anchors = anchor ? [...acts, anchor] : acts;
    // Without a given anchor the next snapshot opens the new chain, whatever its age.
    this.forceAnchor = anchor === null;
    this.coveredTick = tick;
    this.pending = this.pending.filter((e) => e.tick > tick);
    this.chainSlot = null;
  }

  private async commit(
    tick: number,
    snapshot: string,
    mode: AiMode,
    req: SaveRequest,
    actAnchor: string | null,
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
    const policy = this.forceAnchor ? { ...this.anchorPolicy, everyTicks: 0 } : this.anchorPolicy;
    const anchors = nextAnchors(this.anchors, tick, snapSha, policy, actAnchor);
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
      ...(req.client ? { client: req.client } : {}),
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
      this.restartChain(tick, null, false);
      const fresh: AnchorRef[] = [
        actAnchor === null ? { tick, sha256: snapSha } : { tick, sha256: snapSha, act: actAnchor },
      ];
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
        this.forceAnchor = false;
      }
      return res;
    }
    if (res.ok) {
      this.forceAnchor = false;
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

/** The loaded header was written with this build's version fields. */
function sameBuild(h: SlotHeader, v: Omit<SaveVersions, 'worldVersion'>): boolean {
  return (
    h.worldVersion === WORLD_VERSION &&
    h.renameVersion === v.renameVersion &&
    h.contentVersion === v.contentVersion &&
    h.gameVersion === v.gameVersion &&
    h.build === v.build
  );
}

function pickRunFlags(h: SlotHeader): Partial<SaveFlags> {
  // Ironman and demo belong to the run (only an ironman run writes the ironman slot);
  // recovered and tainted describe one save, except that a recovered ironman run stays
  // marked (5.9).
  const ironman = h.flags.ironman || h.slot === IRONMAN_SLOT;
  return { ironman, demo: h.flags.demo, recovered: ironman && h.flags.recovered };
}

function commandCount(chain: readonly SegmentRef[]): number {
  let n = 0;
  for (const s of chain) if (s.kind === 'commands') n += s.count;
  return n;
}

/**
 * The anchors after a save: the snapshot becomes one when the last is at least
 * `everyTicks` old, keeping the latest `keep`. An act anchor (an ironman run's act change,
 * 5.3) is always added, carries its act and is kept for good beside the periodic ones.
 */
export function nextAnchors(
  anchors: readonly AnchorRef[],
  tick: number,
  sha256: string,
  policy: AnchorPolicy,
  act: string | null = null,
): AnchorRef[] {
  const last = anchors[anchors.length - 1];
  let out: AnchorRef[];
  if (last && last.tick === tick && last.sha256 === sha256) {
    if (act === null || last.act !== undefined) return [...anchors];
    out = [...anchors.slice(0, -1), { ...last, act }];
  } else if (act !== null) {
    out = [...anchors, { tick, sha256, act }];
  } else if (last && tick - last.tick < policy.everyTicks) {
    return [...anchors];
  } else {
    out = [...anchors, { tick, sha256 }];
  }
  const keep = Math.max(1, policy.keep);
  let periodic = out.filter((a) => a.act === undefined).length;
  return out.filter((a) => {
    if (a.act !== undefined || periodic <= keep) return true;
    periodic--;
    return false;
  });
}

// ---------------------------------------------------------------------------
// Reading

/** empty: no save; unreadable: no generation loads; newer: saved by a newer version (5.5) */
export type LoadProblem = 'empty' | 'unreadable' | 'newer';

export class SaveLoadError extends Error {
  constructor(
    readonly problem: LoadProblem,
    message: string,
    /** a referenced file was missing: maybe still syncing from the cloud (5.7) */
    readonly cloudPending = false,
  ) {
    super(message);
    this.name = 'SaveLoadError';
  }
}

export interface LoadedSave {
  world: World;
  /** the header the world came from (the previous generation after a fallback) */
  header: SlotHeader;
  /**
   * 0: current generation; 1: header broken, previous used; 2: files broken, previous
   * used; 3: replayed from an anchor; 4: a snapshot the player picked (./recovery.ts)
   */
  level: 0 | 1 | 2 | 3 | 4;
  /** a referenced file was missing: probably still syncing from the cloud (5.7) */
  cloudPending: boolean;
  /** the AI mode the world was saved with (resuming may change it on the world) */
  aiMode: AiMode;
}

export interface LoadOptions {
  /** this build's game version, to refuse saves of a newer release (5.5) */
  gameVersion?: string;
}

/**
 * Read a slot's world through the migrations, falling back to the previous generation
 * (5.6 levels 1 and 2). A save of a newer build is refused (SaveLoadError `newer`): a
 * newer current generation is never replaced by an older previous one.
 */
export async function loadSlot(
  backend: SaveBackend,
  slot: SlotId,
  migrate: WorldMigrator = defaultMigrator,
  opts: LoadOptions = {},
): Promise<LoadedSave> {
  const rec = (await backend.list()).find((r) => r.slot === slot);
  if (!rec) throw new SaveLoadError('empty', `slot ${slot} is empty`);
  const build = buildVersions(opts.gameVersion);
  const newer = (h: SlotHeader | null) => (h ? newerFields(h, build) : []);
  if (rec.problem === 'newer_container' || newer(rec.header).length > 0) {
    throw new SaveLoadError('newer', `slot ${slot} was saved by a newer version`);
  }
  const tries: { header: SlotHeader; level: 0 | 1 | 2 }[] = [];
  if (rec.header) tries.push({ header: rec.header, level: 0 });
  if (rec.prev) tries.push({ header: rec.prev, level: rec.header ? 2 : 1 });
  let cloudPending = false;
  let sawNewer = false;
  const reasons: string[] = [];
  for (const t of tries) {
    if (newer(t.header).length > 0) {
      sawNewer = true;
      reasons.push(`generation ${t.header.generation} is from a newer version`);
      continue;
    }
    try {
      const world = await readWorld(backend, slot, t.header.files.snapshot.sha256, (text) =>
        migrate(text, t.header),
      );
      return { world, header: t.header, level: t.level, cloudPending, aiMode: world.ai.mode };
    } catch (err) {
      if (err instanceof MissingFile) cloudPending = true;
      if (err instanceof NewerSaveError) {
        // The newest generation holds a newer world: the slot is a newer build's.
        if (t === tries[0]) {
          throw new SaveLoadError('newer', `slot ${slot} was saved by a newer version`);
        }
        sawNewer = true;
      }
      reasons.push(String((err as Error)?.message ?? err));
    }
  }
  if (sawNewer) throw new SaveLoadError('newer', `slot ${slot} was saved by a newer version`);
  if (rec.problem && rec.problem !== 'missing') reasons.unshift(`header ${rec.problem}`);
  throw new SaveLoadError(
    'unreadable',
    `slot ${slot} is unreadable: ${reasons.join('; ')}`,
    cloudPending,
  );
}

/** A referenced file is not in the run volume (yet): probably still syncing (5.7). */
export class MissingFile extends Error {}

async function readBytes(backend: SaveBackend, slot: SlotId, sha256: string): Promise<Uint8Array> {
  const res = await backend.read({ slotId: slot, hashes: [sha256] });
  if (!res.ok) throw new Error(res.reason);
  const f = res.files[0];
  if (!f?.bytes) throw new MissingFile(`file ${sha256} is missing`);
  if (!f.ok) throw new Error(`file ${sha256} fails its hash`);
  return f.bytes;
}

/**
 * Read one snapshot (the slot's own or an anchor) referenced by a slot. By default it is
 * migrated with every rename (an anchor may predate the build that wrote its header; the
 * renames are idempotent), as the loader would have migrated it.
 */
export async function readWorld(
  backend: SaveBackend,
  slot: SlotId,
  sha256: string,
  migrate: (text: string) => World = anchorMigrator,
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
