// The deterministic tick loop. Per tick, in order:
//   1. expire AI requests past their deadline (queue their fallbacks),
//   2. apply inbox commands (player, AI, fallback, script) then system-queued commands,
//   3. run every system's tick in phase order,
//   4. drain events to subscribers in system order (handlers may emit more),
//   5. record recent events and notify external listeners.
// Same seed + same logged inbox commands = same world. See architecture.md 4.
// The replay log lives on the world until a save drains it into a `commands` segment
// (drainLog, release_engineering.md 13.6); a world snapshot plus the segments after it
// replay with replayFrom.

import type { AiMode, AiPort, AiRequest, AiRequestSpec, AiResolution } from './ai_port';
import type {
  AnyCommand,
  AnyWorldEvent,
  CommandKind,
  CommandMap,
  CommandResult,
  CommandSource,
  ContentMap,
  EventKind,
  EventMap,
  FlagValue,
  WorldEvent,
} from './contracts';
import { hashSeed, Rng } from './rng';
import type { GameSystem, SystemContext } from './system';
import { createWorld, type LoggedCommand, type World } from './world';

export interface EngineOptions {
  aiMode?: AiMode;
  /** How many recent events to keep on the world for UI and debugging. */
  recentLimit?: number;
  /** Safety cap on events processed in one tick. */
  maxEventsPerTick?: number;
  /**
   * Replay-log length at which `logFull` asks for a safe-point autosave (the save drains
   * the log). Only past LOG_HARD_FACTOR times this, with nobody draining, are the oldest
   * entries dropped, so memory stays bounded in runs that never save.
   */
  logLimit?: number;
}

/** The hard cap of the in-memory replay log, as a multiple of `logLimit`. */
export const LOG_HARD_FACTOR = 4;

export type EventListener = (events: readonly AnyWorldEvent[], world: World) => void;

const LOGGED_SOURCES = new Set(['player', 'ai', 'fallback', 'script']);
/** With the AI off, a run is fully determined by these; its fallbacks fire again on replay. */
const OFF_REPLAY_SOURCES = new Set(['player', 'script']);

export class Engine {
  readonly systems: readonly GameSystem[];
  private readonly listeners = new Set<EventListener>();
  private readonly recentLimit: number;
  private readonly maxEventsPerTick: number;
  private readonly logLimit: number;
  private replayLog: LoggedCommand[] = [];
  private replayCursor = 0;
  /** Commands come from replayLog and are not logged again (until endReplay). */
  private replaying = false;
  /** Entries were dropped at the hard cap since the last drain. */
  private gap = false;

  private constructor(
    readonly world: World,
    readonly content: ContentMap,
    systems: readonly GameSystem[],
    opts: EngineOptions,
  ) {
    this.systems = [...systems].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
    this.recentLimit = opts.recentLimit ?? 400;
    this.maxEventsPerTick = opts.maxEventsPerTick ?? 20000;
    this.logLimit = opts.logLimit ?? 200000;
    const ids = new Set<string>();
    for (const s of this.systems) {
      if (ids.has(s.id)) throw new Error(`duplicate system id ${s.id}`);
      ids.add(s.id);
    }
  }

  /** Create a fresh world and initialise every system's slice. */
  static create(
    seed: number,
    content: ContentMap,
    systems: readonly GameSystem[],
    opts: EngineOptions = {},
  ): Engine {
    const engine = new Engine(createWorld(seed, opts.aiMode ?? 'off'), content, systems, opts);
    const pending: AnyWorldEvent[] = [];
    const ctx = engine.makeContext(pending);
    for (const s of engine.systems) s.init?.(ctx);
    engine.drain(ctx, pending);
    return engine;
  }

  /** Resume an existing (for example loaded) world. */
  static resume(
    world: World,
    content: ContentMap,
    systems: readonly GameSystem[],
    opts: EngineOptions = {},
  ): Engine {
    if (opts.aiMode) world.ai.mode = opts.aiMode;
    return new Engine(world, content, systems, opts);
  }

  /**
   * Replay a recorded run: a fresh world with the same seed and the logged external
   * commands re-applied at their original ticks. By default the AI is in replay mode
   * (proposals and fallbacks come from the log). Pass `aiMode: 'off'` for a run played with
   * the AI off: it replays as replayFrom does, off and from its player and script commands,
   * so conditions that read whether the AI is on see what the run saw and its fallbacks
   * fire again exactly as they did.
   */
  static replay(
    seed: number,
    content: ContentMap,
    systems: readonly GameSystem[],
    log: readonly LoggedCommand[],
    opts: EngineOptions = {},
  ): Engine {
    const off = opts.aiMode === 'off';
    const engine = Engine.create(seed, content, systems, {
      ...opts,
      aiMode: off ? 'off' : 'replay',
    });
    engine.replaying = true;
    engine.replayLog = off
      ? log.filter((e) => OFF_REPLAY_SOURCES.has(e.command.source.type))
      : [...log];
    return engine;
  }

  /**
   * Resume a snapshot and replay the logged commands after its tick (release_engineering.md
   * 13.6), so a run continued from any save reaches the same world without the model.
   * A run that had the AI off stays off: it is fully determined by its player and script
   * commands, and its fallbacks fire again exactly as they did (a replay-mode AI would
   * resolve them later and read as "AI on" to conditions). A run with the model replays in
   * replay mode, its proposals and fallbacks taken from the log. `opts.aiMode` names the
   * mode the logged commands were played under when it differs from the snapshot's.
   * The world is taken over (its inbox, log and AI mode change); pass a copy to keep it.
   */
  static replayFrom(
    world: World,
    content: ContentMap,
    systems: readonly GameSystem[],
    log: readonly LoggedCommand[],
    opts: EngineOptions = {},
  ): Engine {
    const from = world.meta.tick;
    const off = (opts.aiMode ?? world.ai.mode) === 'off';
    // Logged-source commands waiting in the inbox are logged when applied next tick, so
    // the log brings them back; keeping them too would apply them twice.
    world.inbox = world.inbox.filter((c) => !LOGGED_SOURCES.has(c.source.type));
    world.log = [];
    const engine = Engine.resume(world, content, systems, {
      ...opts,
      aiMode: off ? 'off' : 'replay',
    });
    engine.replaying = true;
    engine.replayLog = log.filter(
      (e) => e.tick > from && (!off || OFF_REPLAY_SOURCES.has(e.command.source.type)),
    );
    return engine;
  }

  get tick(): number {
    return this.world.meta.tick;
  }

  /** The replay log has reached `logLimit`: autosave at the next safe point to drain it. */
  get logFull(): boolean {
    return this.world.log.length >= this.logLimit;
  }

  /**
   * The log lost its oldest entries at the hard cap since the last drain, so it no longer
   * carries the run on from the previous save (a saver starts a new chain and anchor).
   */
  get logGap(): boolean {
    return this.gap;
  }

  /**
   * Hand over the commands logged since the last drain and forget them (a save writes
   * them into a `commands` segment, release_engineering.md 13.6).
   */
  drainLog(): LoggedCommand[] {
    const out = this.world.log;
    this.world.log = [];
    this.gap = false;
    return out;
  }

  /** Stop replaying (between ticks): commands from now on are applied live and logged. */
  endReplay(): void {
    this.replaying = false;
    this.replayLog = [];
    this.replayCursor = 0;
  }

  /** Queue an external command (player by default) for the next tick. */
  queue<K extends CommandKind>(
    kind: K,
    data: CommandMap[K],
    source: CommandSource = { type: 'player' },
  ): void {
    this.world.inbox.push({ kind, data, source } as AnyCommand);
  }

  onEvents(listener: EventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  step(ticks = 1): void {
    for (let i = 0; i < ticks; i++) this.runTick();
  }

  /** Hand pending, not yet dispatched AI requests to the AI layer (highest priority first). */
  takeAiRequests(limit = Number.POSITIVE_INFINITY): AiRequest[] {
    if (this.world.ai.mode !== 'external') return [];
    const fresh = this.world.ai.pending
      .filter((r) => !r.dispatched)
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.createdTick - b.createdTick);
    const taken = fresh.slice(0, limit);
    for (const r of taken) r.dispatched = true;
    return taken;
  }

  /**
   * Resolve an AI request. A proposal's commands are validated against the request's
   * allowed kinds and enter the inbox; the request is closed either way. Returns false
   * when the request is unknown or already closed (for example it expired).
   */
  resolveAi(requestId: string, resolution: AiResolution): boolean {
    const ai = this.world.ai;
    const idx = ai.pending.findIndex((r) => r.id === requestId);
    if (idx < 0) return false;
    const req = ai.pending[idx] as AiRequest;
    ai.pending.splice(idx, 1);
    if (resolution.type === 'proposal') {
      const allowed = new Set<string>(req.allowed);
      for (const cmd of resolution.commands) {
        if (!allowed.has(cmd.kind)) continue;
        this.world.inbox.push({
          ...cmd,
          source: { type: 'ai', agentId: req.agentId, requestId: req.id },
        } as AnyCommand);
      }
      this.pushOutOfTickEvent('ai.resolved', {
        requestId,
        agentId: req.agentId,
        outcome: 'proposal',
      });
    } else {
      for (const cmd of req.fallback) {
        this.world.inbox.push({
          ...cmd,
          source: { type: 'fallback', agentId: req.agentId, requestId: req.id },
        } as AnyCommand);
      }
      this.pushOutOfTickEvent('ai.resolved', {
        requestId,
        agentId: req.agentId,
        outcome: 'declined',
      });
    }
    return true;
  }

  // ---------------------------------------------------------------------------

  private runTick(): void {
    const world = this.world;
    world.meta.tick += 1;
    const pending: AnyWorldEvent[] = [];
    const ctx = this.makeContext(pending);

    // Replayed commands go in before expiring AI requests, the place the live run had
    // them: queued between ticks, ahead of the fallbacks expiry adds this tick.
    if (this.replaying) {
      while (
        this.replayCursor < this.replayLog.length &&
        (this.replayLog[this.replayCursor] as LoggedCommand).tick <= world.meta.tick
      ) {
        world.inbox.push((this.replayLog[this.replayCursor] as LoggedCommand).command);
        this.replayCursor++;
      }
    }

    this.expireAiRequests(ctx);

    const external = world.inbox;
    const internal = world.queue;
    world.inbox = [];
    world.queue = [];
    for (const cmd of external) this.applyCommand(ctx, cmd);
    for (const cmd of internal) this.applyCommand(ctx, cmd);

    for (const s of this.systems) s.tick?.(ctx);

    this.drain(ctx, pending);
  }

  private expireAiRequests(ctx: SystemContext): void {
    const ai = this.world.ai;
    if (ai.pending.length === 0) return;
    const keep: AiRequest[] = [];
    for (const req of ai.pending) {
      // With the AI off, requests resolve to their fallback on the very next tick,
      // so a no-model run is fully determined by seed plus player input.
      const due = ai.mode === 'off' ? req.createdTick < ctx.tick : req.deadlineTick <= ctx.tick;
      if (!due) {
        keep.push(req);
        continue;
      }
      if (ai.mode !== 'replay') {
        for (const cmd of req.fallback) {
          this.world.inbox.push({
            ...cmd,
            source: { type: 'fallback', agentId: req.agentId, requestId: req.id },
          } as AnyCommand);
        }
      }
      ctx.emit('ai.resolved', {
        requestId: req.id,
        agentId: req.agentId,
        outcome: ai.mode === 'off' ? 'fallback' : 'expired',
      });
    }
    ai.pending = keep;
  }

  private applyCommand(ctx: SystemContext, cmd: AnyCommand): void {
    let result: CommandResult;
    if (cmd.kind === 'flag.set') {
      const data = cmd.data as CommandMap['flag.set'];
      ctx.setFlag(data.key, data.value);
      result = { ok: true };
    } else {
      result = { ok: false, code: 'no_handler', reason: `no handler for ${cmd.kind}` };
      for (const s of this.systems) {
        const handler = s.commands?.[cmd.kind as CommandKind] as
          | ((c: SystemContext, d: unknown, src: CommandSource) => CommandResult)
          | undefined;
        if (handler) {
          result = handler(ctx, cmd.data, cmd.source);
          break;
        }
      }
    }
    if (LOGGED_SOURCES.has(cmd.source.type) && !this.replaying && this.world.ai.mode !== 'replay') {
      this.world.log.push({ tick: ctx.tick, command: cmd });
      const hard = this.logLimit * LOG_HARD_FACTOR;
      if (this.world.log.length > hard) {
        this.world.log.splice(0, this.world.log.length - hard);
        this.gap = true;
      }
    }
    if (cmd.source.type !== 'system' || !result.ok) {
      ctx.emit('command.result', {
        kind: cmd.kind,
        ok: result.ok,
        code: result.ok ? undefined : result.code,
        reason: result.ok ? result.info : result.reason,
        source: cmd.source,
      });
    }
  }

  private drain(ctx: SystemContext, pending: AnyWorldEvent[]): void {
    let processed = 0;
    for (let i = 0; i < pending.length; i++) {
      if (++processed > this.maxEventsPerTick) {
        throw new Error(`event storm: more than ${this.maxEventsPerTick} events in one tick`);
      }
      const ev = pending[i] as AnyWorldEvent;
      for (const s of this.systems) {
        const handler = s.on?.[ev.kind as EventKind] as
          | ((c: SystemContext, e: AnyWorldEvent) => void)
          | undefined;
        handler?.(ctx, ev);
      }
    }
    if (pending.length === 0) return;
    const recent = this.world.recent;
    recent.push(...pending);
    if (recent.length > this.recentLimit) recent.splice(0, recent.length - this.recentLimit);
    for (const l of this.listeners) l(pending, this.world);
  }

  private pushOutOfTickEvent<K extends EventKind>(kind: K, data: EventMap[K]): void {
    const ev = {
      kind,
      tick: this.world.meta.tick,
      seq: ++this.world.meta.seq,
      data,
    } as WorldEvent<K> as unknown as AnyWorldEvent;
    this.world.recent.push(ev);
    for (const l of this.listeners) l([ev], this.world);
  }

  private makeContext(pending: AnyWorldEvent[]): SystemContext {
    const world = this.world;
    const streams = new Map<string, Rng>();
    const ai: AiPort = {
      get enabled() {
        return world.ai.mode === 'external';
      },
      request(spec: AiRequestSpec): string {
        const id = `ai${world.ai.nextId++}`;
        const req: AiRequest = {
          ...spec,
          id,
          createdTick: world.meta.tick,
          deadlineTick: world.meta.tick + Math.max(1, spec.deadlineTicks),
          dispatched: false,
        };
        world.ai.pending.push(req);
        ctx.emit('ai.requested', {
          requestId: id,
          agentId: spec.agentId,
          role: spec.role,
          purpose: spec.purpose,
        });
        return id;
      },
    };
    const ctx: SystemContext = {
      world,
      content: this.content,
      get tick() {
        return world.meta.tick;
      },
      rng(stream: string): Rng {
        let r = streams.get(stream);
        if (!r) {
          let st = world.rng[stream];
          if (!st) {
            st = { s: hashSeed(world.meta.seed, stream) };
            world.rng[stream] = st;
          }
          r = new Rng(st);
          streams.set(stream, r);
        }
        return r;
      },
      emit(kind, data) {
        pending.push({
          kind,
          tick: world.meta.tick,
          seq: ++world.meta.seq,
          data,
        } as unknown as AnyWorldEvent);
      },
      dispatch(kind, data, source) {
        world.queue.push({
          kind,
          data,
          source: source ?? { type: 'system', system: 'unknown' },
        } as AnyCommand);
      },
      ai,
      newId(prefix: string): string {
        const n = (world.ids[prefix] ?? 0) + 1;
        world.ids[prefix] = n;
        return `${prefix}${n}`;
      },
      flag(key: string): FlagValue | undefined {
        return world.meta.flags[key];
      },
      setFlag(key: string, value: FlagValue): void {
        const previous = world.meta.flags[key];
        if (previous === value) return;
        world.meta.flags[key] = value;
        ctx.emit('flag.changed', { key, value, previous });
      },
    };
    return ctx;
  }
}
