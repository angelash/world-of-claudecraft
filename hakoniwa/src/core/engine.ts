// The deterministic tick loop. Per tick, in order:
//   1. expire AI requests past their deadline (queue their fallbacks),
//   2. apply inbox commands (player, AI, fallback, script) then system-queued commands,
//   3. run every system's tick in phase order,
//   4. drain events to subscribers in system order (handlers may emit more),
//   5. record recent events and notify external listeners.
// Same seed + same logged inbox commands = same world. See architecture.md 4.

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
  /** Maximum replay-log length kept in memory (oldest entries are dropped). */
  logLimit?: number;
}

export type EventListener = (events: readonly AnyWorldEvent[], world: World) => void;

const LOGGED_SOURCES = new Set(['player', 'ai', 'fallback', 'script']);

export class Engine {
  readonly systems: readonly GameSystem[];
  private readonly listeners = new Set<EventListener>();
  private readonly recentLimit: number;
  private readonly maxEventsPerTick: number;
  private readonly logLimit: number;
  private replayLog: LoggedCommand[] = [];
  private replayCursor = 0;

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
   * Replay a recorded run: a fresh world with the same seed, AI in replay mode, and the
   * logged external commands re-applied at their original ticks.
   */
  static replay(
    seed: number,
    content: ContentMap,
    systems: readonly GameSystem[],
    log: readonly LoggedCommand[],
    opts: EngineOptions = {},
  ): Engine {
    const engine = Engine.create(seed, content, systems, { ...opts, aiMode: 'replay' });
    engine.replayLog = [...log];
    return engine;
  }

  get tick(): number {
    return this.world.meta.tick;
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

    this.expireAiRequests(ctx);

    if (world.ai.mode === 'replay') {
      while (
        this.replayCursor < this.replayLog.length &&
        (this.replayLog[this.replayCursor] as LoggedCommand).tick <= world.meta.tick
      ) {
        world.inbox.push((this.replayLog[this.replayCursor] as LoggedCommand).command);
        this.replayCursor++;
      }
    }

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
    if (LOGGED_SOURCES.has(cmd.source.type) && this.world.ai.mode !== 'replay') {
      this.world.log.push({ tick: ctx.tick, command: cmd });
      if (this.world.log.length > this.logLimit) {
        this.world.log.splice(0, this.world.log.length - this.logLimit);
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
