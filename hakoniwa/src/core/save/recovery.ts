// Corruption recovery (release_engineering.md 5.6): the four levels, one entry point.
//   1. the current header is broken: the previous generation (loadSlot);
//   2. the current snapshot is missing, fails its hash, its decoding, its migration or
//      validateWorld: the previous generation's snapshot (loadSlot);
//   3. neither generation loads: the latest anchor of the slot that loads (the current
//      generation's first), then the slot's command segments replayed with the model off
//      up to the header's tick, or as far as the segments can be read; the engine leaves
//      replay and goes on live;
//   4. no anchor loads either: the candidates are listed for the player to pick (other
//      slots of the same run, their anchors, and the run's unreferenced snapshots in the
//      volume and the trash). A candidate on the broken slot's own timeline (the other
//      slot's command segments open the broken slot's chain) is replayed forward through
//      the broken slot's segments as in level 3.
// A level 3 or 4 recovery writes a new save, flagged `recovered`, into another slot (the
// first free manual slot, else the oldest autosave; an ironman run's own slot, its only
// one, 5.9), never over the broken one, and every recovery above level 0 is logged. Only
// the segments after the snapshot are read. The world comes out as the replay reproduces
// it; for a run played with the model, the replay runs in replay mode, so afterwards the
// recorded mode is put back and the requests the log shows answered are closed, so the
// model is not asked twice. The kernel reads no clock: the caller passes the save time.

import type { AiMode } from '../ai_port';
import type { ContentMap } from '../contracts';
import { Engine, type EngineOptions } from '../engine';
import type { GameSystem } from '../system';
import { type LoggedCommand, WORLD_VERSION, type World } from '../world';
import { recoverableId, type SaveBackend, type SlotRecord } from './backend';
import {
  AUTO_SLOTS,
  MANUAL_SLOTS,
  type SaveVersions,
  type SegmentRef,
  type SlotHeader,
  type SlotId,
} from './header';
import { IRONMAN_SLOT } from './ironman';
import { createMigrator, type WorldMigrator } from './migrate';
import { runReplay } from './replay';
import {
  type LoadedSave,
  type LoadOptions,
  loadSlot,
  RunSaver,
  readSegments,
  readWorld,
  SaveLoadError,
} from './run_saver';
import type { DecodedSegment } from './segments';
import type { SliceOwner } from './validate';
import { type BuildVersions, buildVersions, newerFields } from './versions';

/** The game a replay runs: the same content and systems the run was played with. */
export interface RecoveryGame {
  content: ContentMap;
  systems: readonly GameSystem[];
  /** engine options for the replayed engine (logLimit and the like) */
  engine?: EngineOptions;
}

export interface RecoveryOptions {
  game: RecoveryGame;
  /** this build's version fields for the recovered save's header */
  versions: Omit<SaveVersions, 'worldVersion'>;
  /** real-world time of the recovered save, ISO string (the kernel reads no clock) */
  savedAt: string;
  /**
   * The loader hook for a slot's own snapshots. Default: the shipped migrations with the
   * game's systems as slice owners (their `validateSlice` and `idFields`).
   */
  migrate?: WorldMigrator;
  /** The hook for anchors and other snapshots. Default: `migrate` with every rename. */
  migrateAnchor?: (text: string) => World;
  /** where the recovered save goes (default: chooseRecoverySlot) */
  target?: SlotId;
  load?: LoadOptions;
  /** the recovery log (5.6: every recovery is logged; default: console.warn) */
  log?: (entry: RecoveryLog) => void;
  /**
   * When a file the slot names is missing (5.7: maybe still syncing from the cloud), stop
   * with that SaveLoadError (`cloudPending`) instead of recovering, so the player can wait
   * for the sync. Default false: recover.
   */
  waitForCloud?: boolean;
}

/** A replay of level 3 (or of a level 4 candidate). */
export interface ReplaySpan {
  /** the snapshot the replay started from */
  fromTick: number;
  /** the tick the broken header recorded */
  targetTick: number;
  /** the tick reached (below the target when a segment could not be read) */
  reachedTick: number;
  commands: number;
}

export interface Recovered {
  /** the recovered world and the new header, flagged `recovered` (level 3 or 4) */
  loaded: LoadedSave;
  /** the slot the recovered save was written to */
  slot: SlotId;
  /** the engine the world was recovered on, live (null for a snapshot restored as it is) */
  engine: Engine | null;
  span: ReplaySpan | null;
}

export type SlotRecovery =
  | { level: 0 | 1 | 2; loaded: LoadedSave }
  | ({ level: 3 } & Recovered)
  | { level: 4; candidates: RecoveryCandidate[]; cloudPending: boolean };

/** A snapshot the player may pick at level 4. */
export interface RecoveryCandidate {
  /** recoverable id `<runId>.<sha256>` */
  id: string;
  runId: string;
  sha256: string;
  tick: number;
  /** story act at that tick */
  act: string;
  /** named by another slot, or an unreferenced snapshot in the run volume or the trash */
  source: 'slot' | 'volume' | 'trash';
  slot?: SlotId;
  generation?: 'current' | 'prev';
  role?: 'snapshot' | 'anchor';
  /** where picking it gets to: past `tick` when the broken slot's segments carry it on */
  reachTick: number;
}

export interface RecoveryLog {
  slot: SlotId;
  level: 1 | 2 | 3 | 4;
  runId: string | null;
  /** where the recovered save went */
  target?: SlotId;
  fromTick?: number;
  targetTick?: number;
  reachedTick?: number;
  /** level 4 listing: how many candidates */
  candidates?: number;
  reasons: string[];
}

export class RecoveryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RecoveryError';
  }
}

/** One line of developer text for a recovery log entry. */
export function formatRecoveryLog(e: RecoveryLog): string {
  const parts = [`[saves] slot ${e.slot} recovered at level ${e.level}`];
  if (e.fromTick !== undefined) {
    parts.push(`replayed ${e.fromTick} -> ${e.reachedTick} of ${e.targetTick}`);
  }
  if (e.candidates !== undefined) parts.push(`${e.candidates} candidates to pick from`);
  if (e.target) parts.push(`saved to ${e.target}`);
  if (e.reasons.length > 0) parts.push(`(${e.reasons.join('; ')})`);
  return parts.join(', ');
}

const defaultLog = (e: RecoveryLog): void => console.warn(formatRecoveryLog(e));

function holdsNewer(r: SlotRecord, build: BuildVersions): boolean {
  return (
    r.problem === 'newer_container' ||
    (r.header !== null && newerFields(r.header, build).length > 0) ||
    (r.prev !== null && newerFields(r.prev, build).length > 0)
  );
}

/**
 * The slot a recovered save goes to: the ironman slot for an ironman run (its only slot),
 * else the first free manual slot, else the oldest autosave that is not the broken slot
 * (never one holding a newer version's save). Throws RecoveryError when none is left.
 */
export function chooseRecoverySlot(
  records: readonly SlotRecord[],
  broken: SlotId,
  ironman: boolean,
  build: BuildVersions = buildVersions(),
): SlotId {
  if (ironman) return IRONMAN_SLOT;
  const taken = new Set(records.map((r) => r.slot));
  const free = MANUAL_SLOTS.find((s) => !taken.has(s) && s !== broken);
  if (free) return free;
  const autos = AUTO_SLOTS.filter((s) => s !== broken)
    .map((s) => ({ s, r: records.find((x) => x.slot === s) }))
    .filter((a) => !a.r || !holdsNewer(a.r, build))
    .map((a) => ({ s: a.s, at: (a.r?.header ?? a.r?.prev)?.savedAt ?? '' }));
  autos.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const pick = autos[0]?.s;
  if (!pick) throw new RecoveryError('no slot is free for the recovered save');
  return pick;
}

const msg = (err: unknown): string => String((err as Error)?.message ?? err);

// ---------------------------------------------------------------------------
// One recovery's shared state

interface Ctx {
  backend: SaveBackend;
  slot: SlotId;
  opts: RecoveryOptions;
  migrate: WorldMigrator;
  migrateAnchor: (text: string) => World;
  reasons: string[];
  /** decoded command segments by hash (null: unreadable) */
  segments: Map<string, DecodedSegment | null>;
}

function context(backend: SaveBackend, slot: SlotId, opts: RecoveryOptions): Ctx {
  const migrate =
    opts.migrate ?? createMigrator({ owners: opts.game.systems as readonly SliceOwner[] });
  const migrateAnchor =
    opts.migrateAnchor ?? ((text: string) => migrate(text, { renameVersion: 0 } as SlotHeader));
  return { backend, slot, opts, migrate, migrateAnchor, reasons: [], segments: new Map() };
}

/** One commands segment, read through the broken slot (once; failures noted once). */
async function segmentOf(ctx: Ctx, s: SegmentRef): Promise<DecodedSegment | null> {
  if (ctx.segments.has(s.sha256)) return ctx.segments.get(s.sha256) ?? null;
  let d: DecodedSegment | null = null;
  try {
    d = (await readSegments(ctx.backend, ctx.slot, [s]))[0] ?? null;
  } catch (err) {
    ctx.reasons.push(`segment ${s.fromTick}..${s.toTick}: ${msg(err)}`);
  }
  ctx.segments.set(s.sha256, d);
  return d;
}

interface Plan {
  commands: LoggedCommand[];
  reach: number;
  aiMode: AiMode | undefined;
}

function emptyPlan(tick: number): Plan {
  return { commands: [], reach: tick, aiMode: undefined };
}

/**
 * The commands that carry a snapshot at `tick` on along a header's chain, the tick they
 * reach and their AI mode. Only the segments after the snapshot are read; the plan stops
 * where one cannot be read or the AI mode changes. With `owner` (the header the snapshot
 * came from, when that is not `h`), the snapshot must lie on the chain's timeline: the
 * owner's commands segments open the chain, and no command of the rest of the chain comes
 * at or before `tick`; otherwise nothing is replayed.
 */
async function planFrom(
  ctx: Ctx,
  h: SlotHeader,
  tick: number,
  owner: SlotHeader | null,
): Promise<Plan> {
  const none = emptyPlan(tick);
  if (tick >= h.tick) return none;
  const all = h.files.segments.filter((s) => s.kind === 'commands');
  let shared = 0;
  if (owner) {
    const own = owner.files.segments.filter((s) => s.kind === 'commands');
    // A chain without commands cannot be placed on another timeline.
    if (tick > owner.tick || own.length === 0 || own.length > all.length) return none;
    for (let i = 0; i < own.length; i++) {
      if (own[i]?.sha256 !== all[i]?.sha256) return none;
    }
    shared = own.length;
  }
  let reach = h.tick;
  let aiMode: AiMode | undefined;
  const commands: LoggedCommand[] = [];
  let started = false;
  let prev: DecodedSegment | null = null;
  for (let i = 0; i < all.length; i++) {
    const s = all[i] as SegmentRef;
    if (s.toTick <= tick) continue;
    if (!started && s.fromTick > tick) return none;
    if (aiMode !== undefined && s.aiMode !== undefined && s.aiMode !== aiMode) {
      reach = s.fromTick;
      break;
    }
    const d = await segmentOf(ctx, s);
    const follows =
      !prev ||
      (d?.meta.first === prev.meta.first + prev.meta.count && d.meta.fromTick === prev.meta.toTick);
    if (!d || !follows) {
      if (d && !follows) ctx.reasons.push(`segment ${s.fromTick}..${s.toTick} does not follow on`);
      reach = s.fromTick;
      break;
    }
    started = true;
    prev = d;
    aiMode ??= s.aiMode;
    for (const e of d.entries) {
      if (e.tick <= tick) {
        // Already in the snapshot; from a segment the owner does not share, it is a
        // command of another branch: the snapshot is not on this timeline.
        if (owner && i >= shared) return none;
        continue;
      }
      commands.push(e);
    }
  }
  reach = Math.max(tick, Math.min(reach, h.tick));
  return { commands: commands.filter((e) => e.tick <= reach), reach, aiMode };
}

/**
 * Carry a snapshot on by a plan, on the recovery game. With nothing to replay the world is
 * simply resumed (its queued commands kept). After a replay the engine leaves replay; a
 * model run gets its recorded AI mode back, and the requests its log answered are closed.
 */
function carryOn(ctx: Ctx, world: World, plan: Plan): Engine {
  const g = ctx.opts.game;
  if (plan.reach <= world.meta.tick) {
    return Engine.resume(world, g.content, g.systems, { ...g.engine, aiMode: world.ai.mode });
  }
  const aiMode = plan.aiMode ?? world.ai.mode;
  const run = runReplay(world, g.content, g.systems, plan.commands, plan.reach, {
    ...g.engine,
    aiMode,
  });
  const engine = run.engine;
  engine.endReplay();
  if (aiMode !== 'replay' && engine.world.ai.mode !== aiMode) {
    engine.world.ai.mode = aiMode;
    const answered = new Set<string>();
    for (const e of plan.commands) {
      const src = e.command.source as { type: string; requestId?: string };
      if ((src.type === 'ai' || src.type === 'fallback') && src.requestId) {
        answered.add(src.requestId);
      }
    }
    engine.world.ai.pending = engine.world.ai.pending.filter((r) => !answered.has(r.id));
  }
  return engine;
}

function summaryOf(world: World, h: SlotHeader | null): SlotHeader['summary'] {
  return {
    ...(h?.summary ?? { map: '' }),
    act: String(world.meta.flags.act ?? h?.summary.act ?? ''),
  };
}

function targetSlot(ctx: Ctx, records: readonly SlotRecord[], ironman: boolean): SlotId {
  const build = buildVersions(ctx.opts.load?.gameVersion);
  const target = ctx.opts.target ?? chooseRecoverySlot(records, ctx.slot, ironman, build);
  if (target === ctx.slot && !ironman) {
    throw new RecoveryError(`the recovered save may not go over the broken slot ${ctx.slot}`);
  }
  return target;
}

/**
 * Save a recovered world of run `runId` as a new save flagged recovered (trigger
 * `recovery`), labelled like the save it stands for (`like`).
 */
async function saveRecovered(
  ctx: Ctx,
  engine: Engine,
  runId: string,
  like: SlotHeader | null,
  target: SlotId,
  flags: { ironman: boolean; demo: boolean },
): Promise<SlotHeader> {
  const saver = new RunSaver({
    backend: ctx.backend,
    runId,
    versions: ctx.opts.versions,
    flags,
  });
  const res = await saver.save(
    { world: engine.world, drainLog: () => engine.drainLog() },
    {
      slot: target,
      savedAt: ctx.opts.savedAt,
      label: like?.label ?? '',
      trigger: 'recovery',
      flags: { recovered: true },
      summary: summaryOf(engine.world, like),
      // the interface's segment (guidance, tracking, notes) survives a recovery
      ...(like?.client ? { client: like.client } : {}),
    },
  );
  if (!res.ok) throw new RecoveryError(`saving the recovered world failed: ${res.reason}`);
  return res.header;
}

// ---------------------------------------------------------------------------

/**
 * Load a slot, recovering as far as 5.6 allows: levels 0 to 2 load as loadSlot does,
 * level 3 replays from an anchor and saves the result, level 4 lists the candidates
 * (pick one with recoverFromCandidate). Throws SaveLoadError for an empty slot or a save
 * of a newer version, RecoveryError when the recovered world cannot be saved.
 */
export async function recoverSlot(
  backend: SaveBackend,
  slot: SlotId,
  opts: RecoveryOptions,
): Promise<SlotRecovery> {
  const ctx = context(backend, slot, opts);
  const log = opts.log ?? defaultLog;
  let cloudPending = false;
  try {
    const loaded = await loadSlot(backend, slot, ctx.migrate, opts.load);
    if (loaded.level === 1 || loaded.level === 2) {
      const rec = (await backend.list()).find((r) => r.slot === slot);
      const why =
        loaded.level === 1
          ? `current header ${rec?.problem ?? 'unusable'}`
          : 'current snapshot unusable';
      log({ slot, level: loaded.level, runId: loaded.header.runId, reasons: [why] });
    }
    return { level: loaded.level as 0 | 1 | 2, loaded };
  } catch (err) {
    if (!(err instanceof SaveLoadError) || err.problem !== 'unreadable') throw err;
    if (err.cloudPending && opts.waitForCloud) throw err;
    cloudPending = err.cloudPending;
    ctx.reasons.push(err.message);
  }
  const records = await backend.list();
  const rec = records.find((r) => r.slot === slot);
  // The current generation's anchors, latest first, then the previous generation's
  // others (an older generation may be another branch: the newest one comes first). Each
  // replays along whichever generation's chain carries it furthest.
  const headers = [rec?.header, rec?.prev].filter((h): h is SlotHeader => !!h);
  const anchors: { owner: SlotHeader; tick: number; sha256: string }[] = [];
  for (const h of headers) {
    const own = h.files.anchors
      .filter((a) => a.tick <= h.tick && !anchors.some((x) => x.sha256 === a.sha256))
      .sort((a, b) => b.tick - a.tick);
    for (const a of own) anchors.push({ owner: h, tick: a.tick, sha256: a.sha256 });
  }
  for (const a of anchors) {
    let world: World;
    try {
      world = await readWorld(backend, slot, a.sha256, ctx.migrateAnchor);
    } catch (err) {
      ctx.reasons.push(`anchor ${a.tick}: ${msg(err)}`);
      continue;
    }
    let best: { plan: Plan; h: SlotHeader } = { plan: emptyPlan(a.tick), h: a.owner };
    for (const h of headers) {
      const plan = await planFrom(ctx, h, a.tick, h === a.owner ? null : a.owner);
      if (plan.reach > best.plan.reach) best = { plan, h };
    }
    const { plan, h } = best;
    let engine: Engine;
    try {
      engine = carryOn(ctx, world, plan);
    } catch (err) {
      ctx.reasons.push(`replay from ${a.tick}: ${msg(err)}`);
      continue;
    }
    const target = targetSlot(ctx, records, h.flags.ironman || slot === IRONMAN_SLOT);
    const header = await saveRecovered(ctx, engine, h.runId, h, target, {
      ironman: h.flags.ironman || slot === IRONMAN_SLOT,
      demo: h.flags.demo,
    });
    log({
      slot,
      level: 3,
      runId: h.runId,
      target,
      fromTick: a.tick,
      targetTick: h.tick,
      reachedTick: engine.tick,
      reasons: ctx.reasons,
    });
    return {
      level: 3,
      loaded: { world: engine.world, header, level: 3, cloudPending, aiMode: engine.world.ai.mode },
      slot: target,
      engine,
      span: {
        fromTick: a.tick,
        targetTick: h.tick,
        reachedTick: engine.tick,
        commands: plan.commands.length,
      },
    };
  }
  const candidates = await listCandidates(ctx, records);
  log({
    slot,
    level: 4,
    runId: (rec?.header ?? rec?.prev)?.runId ?? null,
    candidates: candidates.length,
    reasons: ctx.reasons,
  });
  return { level: 4, candidates, cloudPending };
}

/**
 * Level 4: the snapshots a player may pick for a broken slot, best first (the furthest
 * tick reached). Snapshots another slot names are read and checked here; unreferenced
 * ones (volume, trash) were checked by the container (hash and world file head) and are
 * migrated when picked. When the broken slot's run is unknown (no header parses), every
 * run's snapshots are offered.
 */
export async function listRecoveryCandidates(
  backend: SaveBackend,
  slot: SlotId,
  opts: RecoveryOptions,
): Promise<RecoveryCandidate[]> {
  return listCandidates(context(backend, slot, opts), await backend.list());
}

async function listCandidates(
  ctx: Ctx,
  records: readonly SlotRecord[],
): Promise<RecoveryCandidate[]> {
  const rec = records.find((r) => r.slot === ctx.slot);
  const broken = rec?.header ?? rec?.prev ?? null;
  const runId = broken?.runId ?? null;
  const build = buildVersions(ctx.opts.load?.gameVersion);
  const seen = new Set<string>();
  // The broken slot's own files have failed already.
  for (const h of [rec?.header, rec?.prev]) {
    if (!h) continue;
    seen.add(h.files.snapshot.sha256);
    for (const a of h.files.anchors) seen.add(a.sha256);
  }
  const out: RecoveryCandidate[] = [];
  for (const r of records) {
    if (r.slot === ctx.slot) continue;
    for (const [g, generation] of [
      [r.header, 'current'],
      [r.prev, 'prev'],
    ] as const) {
      if (!g || (runId !== null && g.runId !== runId) || newerFields(g, build).length > 0) continue;
      const snaps = [
        { sha256: g.files.snapshot.sha256, tick: g.tick, role: 'snapshot' as const },
        ...g.files.anchors.map((a) => ({
          sha256: a.sha256,
          tick: a.tick,
          role: 'anchor' as const,
        })),
      ];
      for (const sn of snaps) {
        if (seen.has(sn.sha256)) continue;
        seen.add(sn.sha256);
        let world: World;
        try {
          world = await readWorld(ctx.backend, r.slot, sn.sha256, ctx.migrateAnchor);
        } catch {
          continue;
        }
        const plan = broken ? await planFrom(ctx, broken, sn.tick, g) : null;
        out.push({
          id: recoverableId(g.runId, sn.sha256),
          runId: g.runId,
          sha256: sn.sha256,
          tick: sn.tick,
          act: String(world.meta.flags.act ?? ''),
          source: 'slot',
          slot: r.slot,
          generation,
          role: sn.role,
          reachTick: plan && plan.reach > sn.tick ? plan.reach : sn.tick,
        });
      }
    }
  }
  for (const rc of await ctx.backend.recoverables()) {
    if ((runId !== null && rc.runId !== runId) || seen.has(rc.sha256)) continue;
    if (rc.worldVersion > WORLD_VERSION) continue;
    seen.add(rc.sha256);
    out.push({
      id: rc.id,
      runId: rc.runId,
      sha256: rc.sha256,
      tick: rc.tick,
      act: rc.act,
      source: rc.inTrash ? 'trash' : 'volume',
      reachTick: rc.tick,
    });
  }
  out.sort((a, b) => b.reachTick - a.reachTick || b.tick - a.tick || (a.id < b.id ? -1 : 1));
  return out;
}

/**
 * Level 4, the player's pick: a candidate named by another slot is read, carried on
 * through the broken slot's segments when it lies on that slot's timeline, and saved as
 * a new recovered save; an unreferenced one is committed by the container (restore) and
 * must then load, or the commit is undone (an empty target is emptied again) and
 * RecoveryError is thrown.
 */
export async function recoverFromCandidate(
  backend: SaveBackend,
  slot: SlotId,
  candidate: RecoveryCandidate,
  opts: RecoveryOptions,
): Promise<Recovered> {
  const ctx = context(backend, slot, opts);
  const log = opts.log ?? defaultLog;
  const records = await backend.list();
  const rec = records.find((r) => r.slot === slot);
  const broken = rec?.header ?? rec?.prev ?? null;
  const ownerRec = records.find((x) => x.slot === candidate.slot);
  const owner = (candidate.generation === 'prev' ? ownerRec?.prev : ownerRec?.header) ?? null;
  const ironman = slot === IRONMAN_SLOT || (broken?.flags.ironman ?? owner?.flags.ironman ?? false);
  const demo = broken?.flags.demo ?? owner?.flags.demo ?? false;
  const target = targetSlot(ctx, records, ironman);
  if (candidate.source === 'slot' && candidate.slot && owner) {
    const world = await readWorld(backend, candidate.slot, candidate.sha256, ctx.migrateAnchor);
    const plan =
      broken && broken.runId === candidate.runId
        ? await planFrom(ctx, broken, candidate.tick, owner)
        : emptyPlan(candidate.tick);
    let engine: Engine;
    try {
      engine = carryOn(ctx, world, plan);
    } catch (err) {
      throw new RecoveryError(`replaying from ${candidate.tick} failed: ${msg(err)}`);
    }
    const h = broken && plan.reach > candidate.tick ? broken : owner;
    const header = await saveRecovered(ctx, engine, h.runId, h, target, { ironman, demo });
    log({
      slot,
      level: 4,
      runId: candidate.runId,
      target,
      fromTick: candidate.tick,
      targetTick: broken?.tick ?? candidate.tick,
      reachedTick: engine.tick,
      reasons: ctx.reasons,
    });
    return {
      loaded: {
        world: engine.world,
        header,
        level: 4,
        cloudPending: false,
        aiMode: engine.world.ai.mode,
      },
      slot: target,
      engine,
      span:
        plan.reach > candidate.tick
          ? {
              fromTick: candidate.tick,
              targetTick: h.tick,
              reachedTick: engine.tick,
              commands: plan.commands.length,
            }
          : null,
    };
  }
  const wasEmpty = !records.some((r) => r.slot === target);
  const res = await backend.restore({ candidateId: candidate.id, slotId: target });
  if (!res.ok) throw new RecoveryError(`restoring ${candidate.id} failed: ${res.reason}`);
  let loaded: LoadedSave;
  try {
    loaded = await loadSlot(backend, target, ctx.migrate, opts.load);
    if (loaded.level !== 0 || loaded.header.files.snapshot.sha256 !== candidate.sha256) {
      throw new Error('the restored snapshot is not the one that loads');
    }
  } catch (err) {
    if (wasEmpty) await backend.delete({ slotId: target });
    throw new RecoveryError(`the picked snapshot does not load: ${msg(err)}`);
  }
  let header = loaded.header;
  if (ironman || demo) {
    // The container's restore knows nothing of the run: put its run flags back on it.
    const engine = Engine.resume(loaded.world, opts.game.content, opts.game.systems, {
      ...opts.game.engine,
      aiMode: loaded.world.ai.mode,
    });
    header = await saveRecovered(ctx, engine, candidate.runId, broken, target, { ironman, demo });
  }
  log({
    slot,
    level: 4,
    runId: candidate.runId,
    target,
    fromTick: candidate.tick,
    targetTick: broken?.tick ?? candidate.tick,
    reachedTick: candidate.tick,
    reasons: ctx.reasons,
  });
  return { loaded: { ...loaded, header, level: 4 }, slot: target, engine: null, span: null };
}
