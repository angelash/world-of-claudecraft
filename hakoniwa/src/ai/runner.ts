// AiRunner: the bridge between the kernel's open AI requests and a model provider.
// After ticks (or on demand) it takes undispatched requests within a concurrency cap,
// decides per request whether to call a model (provider health, degradation level,
// cooldowns, budget) or decline at once, assembles the prompt from the role pack and the
// request context, validates the answer, and resolves the kernel request with a proposal
// or a decline. A decline never stops the world: the request's deterministic fallback runs
// on the next tick (D-010, D-036). The runner holds no DOM and reads time only through the
// injected clock. See docs/50_tech/ai_architecture.md 2.3 and 2.4.

import type { AiRequest, AiResolution } from '../core/ai_port';
import type { AnyCommand, AnyWorldEvent } from '../core/contracts';
import { AuditLog, type AuditRecord } from './audit';
import { Budget, type BudgetConfig, type BudgetSnapshot, type DegradeLevel } from './budget';
import type {
  Clock,
  LlmErrorCode,
  LlmOutcome,
  LlmProvider,
  LlmRequest,
  ModelTier,
  Timers,
} from './contracts';
import { TIER_ORDER } from './contracts';
import { findLeaksIn } from './leak';
import { collectStrings, recoverJson, validateProposal } from './output';
import { costUsd, DEFAULT_TIER_MODELS, estimateCallUsd } from './pricing';
import { buildOutputSchema, renderContext } from './prompt';
import type { RolePack, RoleRegistry } from './roles';

/** The slice of the kernel Engine the runner needs (Engine satisfies it structurally). */
export interface AiHost {
  readonly tick: number;
  takeAiRequests(limit?: number): AiRequest[];
  resolveAi(requestId: string, resolution: AiResolution): boolean;
  onEvents?(listener: (events: readonly AnyWorldEvent[]) => void): () => void;
}

export interface AiHealthOptions {
  /** Consecutive failures of one agent (in one role) before it is shelved. Default 3. */
  agentFailureLimit?: number;
  /** How long a shelved agent's requests go straight to the fallback. Default 5 minutes. */
  agentShelveMs?: number;
  /** Consecutive provider-side failures (5xx, overload, network, timeout) that open the circuit. Default 5. */
  providerFailureLimit?: number;
  /** How long an open circuit declines everything. Default 60 seconds. */
  providerCooldownMs?: number;
}

export interface AiRunnerOptions {
  engine: AiHost;
  provider: LlmProvider;
  roles: RoleRegistry;
  /** Real-time clock (ms). The client passes performance.now or Date.now; tests a fake. */
  clock: Clock;
  /** Defaults to the global setTimeout and clearTimeout. */
  timers?: Timers;
  /** Defaults to a fresh AuditLog. */
  audit?: AuditLog;
  budget?: Partial<BudgetConfig>;
  /** Calls in flight at once. Default 4. */
  maxConcurrent?: number;
  /** Tier per role, overriding the role pack default (Q-004 presets). */
  roleTiers?: Record<string, ModelTier>;
  /** Tier to model map used for cost estimates; defaults to the provider's map, then the preset. */
  tierModels?: Partial<Record<ModelTier, string>>;
  /** Per-role cooldown overrides in ms. */
  cooldownMs?: Record<string, number>;
  /**
   * Overwrite data.revision of every proposed command with the request's revision, so
   * handlers can drop stale proposals without the model ever seeing a revision number.
   * Default true.
   */
  injectRevision?: boolean;
  /** Locked phrases for a request (reveal ledger); a hit in the answer declines it. */
  forbiddenPhrases?: (req: AiRequest) => readonly string[];
  /** Keep full prompt text in audit records (development). Default true. */
  recordPrompts?: boolean;
  /**
   * Real ms per tick at the current speed. When set, a call's timeout is capped by the time
   * left before the request's deadline, and requests that cannot make it are declined.
   */
  msPerTick?: number;
  health?: AiHealthOptions;
}

export interface AiRunnerStatus {
  epoch: number;
  inFlight: number;
  level: DegradeLevel;
  budget: BudgetSnapshot;
  providerAvailable: boolean;
  /** real ms until which every request is declined (open circuit or rate-limit backoff) */
  blockedUntil: number;
}

/** Reasons the runner declines a request (written to the kernel decline and the audit). */
export type DeclineReason =
  | 'model_off'
  | 'provider_unhealthy'
  | 'degraded_all'
  | 'degraded_reserved_only'
  | 'degraded_routine'
  | 'agent_shelved'
  | 'agent_busy'
  | 'cooldown'
  | 'budget_hour'
  | 'budget_role'
  | 'budget_total'
  | 'deadline'
  | 'timeout'
  | 'invalid_output'
  | 'all_commands_rejected'
  | 'empty'
  | 'leak'
  | LlmErrorCode;

const DETAIL: Partial<Record<DeclineReason, string>> = {
  model_off: '模型不可用，走规则兜底',
  provider_unhealthy: '模型服务连续出错，暂时全部走规则兜底',
  degraded_all: '预算已用尽，全部走规则兜底',
  degraded_reserved_only: '节能模式：只保留玩家正在进行的交谈与剧情锚点',
  degraded_routine: '节能模式：日常与背景决策改走规则',
  agent_shelved: '该角色连续失败，暂时改走规则',
  agent_busy: '该角色已有请求在途',
  cooldown: '该角色冷却中',
  budget_hour: '小时预算不足',
  budget_role: '该类决策的预算份额不足',
  budget_total: '总预算不足',
  deadline: '赶不上截止时间',
  timeout: '模型超时',
  invalid_output: '模型输出不合格式',
  all_commands_rejected: '提议的命令全部不合规',
  empty: '模型没有提出命令',
  leak: '输出含有未解锁的内容',
};

const PROVIDER_FAILURES: ReadonlySet<string> = new Set([
  'overloaded',
  'server_error',
  'network',
  'timeout',
]);

/** Failures that say nothing about the agent or the prompt (no model configured at all). */
const NOT_AGENT_FAILURES: ReadonlySet<string> = new Set([
  'model_off',
  'no_proxy',
  'no_credentials',
  'auth_failed',
  'aborted',
]);

const MIN_CALL_MS = 500;

function lowerTier(t: ModelTier): ModelTier {
  const i = TIER_ORDER.indexOf(t);
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, i + 1)] as ModelTier;
}

function defaultTimers(): Timers {
  return {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as Parameters<typeof clearTimeout>[0]),
  };
}

interface InFlight {
  promise: Promise<void>;
  key: string;
}

export class AiRunner {
  readonly audit: AuditLog;
  readonly budget: Budget;
  private engine: AiHost;
  private readonly provider: LlmProvider;
  private readonly roles: RoleRegistry;
  private readonly clock: Clock;
  private readonly timers: Timers;
  private readonly opts: AiRunnerOptions;
  private readonly maxConcurrent: number;
  private readonly inFlight = new Map<string, InFlight>();
  private readonly busy = new Set<string>();
  private readonly lastDispatch = new Map<string, number>();
  private readonly agentFailures = new Map<string, number>();
  private readonly shelvedUntil = new Map<string, number>();
  private providerFailures = 0;
  private blockedUntil = Number.NEGATIVE_INFINITY;
  private epoch = 0;
  private detachFn?: () => void;
  private pumping = false;
  private pumpAgain = false;

  constructor(opts: AiRunnerOptions) {
    this.opts = opts;
    this.engine = opts.engine;
    this.provider = opts.provider;
    this.roles = opts.roles;
    this.clock = opts.clock;
    this.timers = opts.timers ?? defaultTimers();
    this.audit = opts.audit ?? new AuditLog();
    this.budget = new Budget(opts.budget ?? {}, opts.clock);
    this.maxConcurrent = Math.max(1, opts.maxConcurrent ?? 4);
  }

  /** Pump automatically whenever the kernel files a request. Returns the detach function. */
  attach(): () => void {
    this.detachFn?.();
    const on = this.engine.onEvents?.bind(this.engine);
    if (!on) throw new Error('AiRunner.attach: the host has no onEvents');
    const off = on((events) => {
      if (events.some((e) => e.kind === 'ai.requested')) this.pump();
    });
    this.detachFn = off;
    this.pump();
    return () => {
      off();
      if (this.detachFn === off) this.detachFn = undefined;
    };
  }

  /**
   * Point the runner at another engine (for example after loading a save). Answers still in
   * flight belong to the old world and are dropped when they arrive.
   */
  rebind(engine: AiHost): void {
    const wasAttached = !!this.detachFn;
    this.detachFn?.();
    this.detachFn = undefined;
    this.engine = engine;
    this.epoch += 1;
    this.busy.clear();
    if (wasAttached) this.attach();
  }

  status(): AiRunnerStatus {
    return {
      epoch: this.epoch,
      inFlight: this.inFlight.size,
      level: this.budget.level(),
      budget: this.budget.snapshot(),
      providerAvailable: this.provider.available(),
      blockedUntil: this.blockedUntil,
    };
  }

  /** Resolves once no call is in flight (headless runs and tests). */
  async whenIdle(): Promise<void> {
    while (this.inFlight.size > 0) {
      await Promise.all([...this.inFlight.values()].map((f) => f.promise));
    }
  }

  /** Take as many open requests as the concurrency cap allows and handle each. */
  pump(): void {
    if (this.pumping) {
      this.pumpAgain = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.pumpAgain = false;
        for (;;) {
          const free = this.maxConcurrent - this.inFlight.size;
          if (free <= 0) break;
          const batch = this.engine.takeAiRequests(free);
          if (batch.length === 0) break;
          for (const req of batch) this.handle(req);
        }
      } while (this.pumpAgain);
    } finally {
      this.pumping = false;
    }
  }

  // ---------------------------------------------------------------------------

  private modelFor(tier: ModelTier): string {
    return (
      this.opts.tierModels?.[tier] ??
      this.provider.tierModels?.()[tier] ??
      DEFAULT_TIER_MODELS[tier]
    );
  }

  /** Pre-call checks in ladder order; a reason means decline at once (fallback next tick). */
  private gate(
    req: AiRequest,
    pack: RolePack,
    level: DegradeLevel,
    key: string,
    now: number,
  ): DeclineReason | { timeoutMs: number } {
    if (!this.provider.available()) return 'model_off';
    if (now < this.blockedUntil) return 'provider_unhealthy';
    if (level >= 4) return 'degraded_all';
    if (level >= 3 && !pack.reserved) return 'degraded_reserved_only';
    if (level >= 2 && !pack.reserved && (pack.priority === 'C' || pack.priority === 'D')) {
      return 'degraded_routine';
    }
    if ((this.shelvedUntil.get(key) ?? Number.NEGATIVE_INFINITY) > now) return 'agent_shelved';
    if (this.busy.has(key)) return 'agent_busy';
    const cooldown = this.opts.cooldownMs?.[req.role] ?? pack.cooldownMs;
    const last = this.lastDispatch.get(key);
    if (last !== undefined && cooldown > 0 && now - last < cooldown) return 'cooldown';
    let timeoutMs = pack.timeoutMs;
    if (this.opts.msPerTick !== undefined) {
      const left = (req.deadlineTick - this.engine.tick) * this.opts.msPerTick;
      if (left < MIN_CALL_MS) return 'deadline';
      timeoutMs = Math.min(timeoutMs, left);
    }
    return { timeoutMs };
  }

  private handle(req: AiRequest): void {
    const pack = this.roles.get(req.role);
    const now = this.clock.now();
    const level = this.budget.level();
    const key = `${req.agentId}|${req.role}`;
    const rec: AuditRecord = {
      auditId: this.audit.nextId(),
      requestId: req.id,
      agentId: req.agentId,
      role: req.role,
      rolePackVersion: `${pack.role}@${pack.version}`,
      purpose: req.purpose,
      tick: this.engine.tick,
      epoch: this.epoch,
      realMs: now,
      degradeLevel: level,
      outcome: 'pending',
    };
    const epoch = this.epoch;

    const gate = this.gate(req, pack, level, key, now);
    if (typeof gate === 'string') {
      this.decline(req, rec, gate, epoch);
      return;
    }
    const timeoutMs = gate.timeoutMs;

    const rendered = renderContext(req.context, req.allowed);
    const schema = buildOutputSchema(req.allowed, pack);
    const promptText = `${pack.system}\n${rendered.stable}\n${rendered.context}`;

    // D-036: lower the tier first; decline only when even the lowest tier does not fit.
    let tier = this.opts.roleTiers?.[req.role] ?? pack.tier;
    if (level >= 1 && !pack.reserved) tier = lowerTier(tier);
    let model = this.modelFor(tier);
    let estimate = estimateCallUsd(model, promptText, pack.maxTokens);
    for (;;) {
      const verdict = this.budget.canAfford(req.role, estimate, pack.budgetShare, pack.reserved);
      if (verdict === 'ok') break;
      if (tier === 'low') {
        this.decline(req, rec, `budget_${verdict}` as DeclineReason, epoch);
        return;
      }
      tier = lowerTier(tier);
      model = this.modelFor(tier);
      estimate = estimateCallUsd(model, promptText, pack.maxTokens);
    }

    const llm: LlmRequest = {
      requestId: req.id,
      tier,
      system: pack.system,
      stable: rendered.stable,
      context: rendered.context,
      schema,
      maxTokens: pack.maxTokens,
      purpose: `${req.role}/${req.purpose}`,
      effort: pack.effort,
      cacheTtl: pack.cacheTtl,
    };
    rec.tier = tier;
    rec.requestedModel = model;
    rec.reservedUsd = estimate;
    if (rendered.playerText) rec.playerText = rendered.playerText;
    if (this.opts.recordPrompts ?? true) {
      rec.prompt = { system: llm.system, stable: rendered.stable, context: rendered.context };
    }
    this.budget.reserve(rec.auditId, req.role, estimate);
    this.audit.add(rec);
    this.busy.add(key);
    this.lastDispatch.set(key, now);
    this.dispatch(req, pack, llm, rec, key, timeoutMs, epoch);
  }

  private dispatch(
    req: AiRequest,
    pack: RolePack,
    llm: LlmRequest,
    rec: AuditRecord,
    key: string,
    timeoutMs: number,
    epoch: number,
  ): void {
    const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined;
    const t0 = this.clock.now();
    let done = false;
    let handle: unknown;
    const finish = (fn: () => void): void => {
      if (done) return;
      done = true;
      this.timers.clear(handle);
      this.inFlight.delete(rec.auditId);
      if (epoch === this.epoch) this.busy.delete(key);
      fn();
      this.pump();
    };
    handle = this.timers.set(() => {
      finish(() => {
        ctrl?.abort();
        // Keep the estimate (the call may still be billed); a late answer corrects it.
        this.budget.settle(rec.auditId, rec.reservedUsd ?? 0);
        this.noteFailure(key, 'timeout');
        this.decline(req, rec, 'timeout', epoch, { latencyMs: this.clock.now() - t0 });
      });
    }, timeoutMs);

    const promise = Promise.resolve()
      .then(() => this.provider.complete(llm, ctrl?.signal))
      .then(
        (outcome) => {
          if (done) {
            // Late answer after a timeout: correct the kept estimate only with real numbers.
            if (outcome.ok || outcome.usage || outcome.costUsd !== undefined) {
              this.settle(rec, outcome, llm);
            }
            this.audit.update(rec.auditId, {
              usage: outcome.usage,
              costUsd: outcome.costUsd,
              detail: `${DETAIL.timeout}（迟到的回复已丢弃）`,
            });
            return;
          }
          this.settle(rec, outcome, llm);
          finish(() => this.onOutcome(req, pack, rec, key, outcome, epoch, this.clock.now() - t0));
        },
        (err: unknown) => {
          if (done) return;
          finish(() => {
            this.budget.release(rec.auditId);
            this.noteFailure(key, 'network');
            this.decline(req, rec, 'network', epoch, {
              detail: `提供方异常：${err instanceof Error ? err.name : 'unknown'}`,
            });
          });
        },
      );
    this.inFlight.set(rec.auditId, { promise, key });
  }

  /** Replace the reservation by the real cost (or release it when nothing was billed). */
  private settle(rec: AuditRecord, outcome: LlmOutcome, llm: LlmRequest): void {
    const requested = rec.requestedModel ?? this.modelFor(llm.tier);
    if (outcome.ok) {
      const usd =
        outcome.costUsd > 0
          ? outcome.costUsd
          : costUsd(outcome.model, outcome.usage) || costUsd(requested, outcome.usage);
      this.budget.settle(rec.auditId, usd);
    } else if (outcome.costUsd !== undefined || outcome.usage) {
      const usd =
        outcome.costUsd ?? (outcome.usage ? costUsd(outcome.model ?? requested, outcome.usage) : 0);
      this.budget.settle(rec.auditId, usd);
    } else {
      this.budget.release(rec.auditId);
    }
  }

  private onOutcome(
    req: AiRequest,
    pack: RolePack,
    rec: AuditRecord,
    key: string,
    outcome: LlmOutcome,
    epoch: number,
    latencyMs: number,
  ): void {
    if (!outcome.ok) {
      if (outcome.error === 'rate_limited' && outcome.retryAfterMs) {
        this.blockedUntil = Math.max(this.blockedUntil, this.clock.now() + outcome.retryAfterMs);
      }
      this.noteFailure(key, outcome.error);
      this.decline(req, rec, outcome.error, epoch, {
        detail: outcome.message,
        usage: outcome.usage,
        costUsd: outcome.costUsd,
        model: outcome.model,
        stopReason: outcome.stopReason,
        latencyMs,
      });
      return;
    }

    const raw = recoverJson(outcome.json, outcome.text);
    const speakAs = (req.context as { speakAs?: unknown } | null)?.speakAs;
    const v = validateProposal(raw, req.allowed, {
      maxCommands: pack.maxCommands,
      speechMaxChars: pack.speechMaxChars,
      thoughtMaxChars: pack.thoughtMaxChars,
      speakAs: typeof speakAs === 'string' ? speakAs : undefined,
    });
    const patch: Partial<AuditRecord> = {
      rawOutput: outcome.text,
      parsed: raw,
      model: outcome.model,
      stopReason: outcome.stopReason,
      usage: outcome.usage,
      costUsd: outcome.costUsd > 0 ? outcome.costUsd : costUsd(outcome.model, outcome.usage),
      latencyMs,
      commands: v.commands,
      rejected: v.rejected,
      validation: { ok: v.ok, errors: v.errors },
      speech: v.speech,
      thought: v.thought,
    };
    if (!v.ok) {
      this.noteFailure(key, 'invalid_output');
      this.decline(req, rec, 'invalid_output', epoch, {
        ...patch,
        detail: v.errors.join('；') || DETAIL.invalid_output,
      });
      return;
    }
    this.noteSuccess(key);

    const phrases = this.opts.forbiddenPhrases?.(req) ?? [];
    if (phrases.length > 0) {
      const texts = [
        v.speech ?? '',
        v.thought ?? '',
        ...v.commands.flatMap((c) => collectStrings(c.data)),
      ];
      const leaks = findLeaksIn(texts, phrases);
      if (leaks.length > 0) {
        this.decline(req, rec, 'leak', epoch, { ...patch, leaks });
        return;
      }
    }

    if (v.commands.length === 0 && (v.rejected.length > 0 || !pack.emptyIsDecision)) {
      const reason = v.rejected.length > 0 ? 'all_commands_rejected' : 'empty';
      this.decline(req, rec, reason, epoch, patch);
      return;
    }

    const inject = this.opts.injectRevision ?? true;
    const commands = v.commands.map(
      (c) =>
        ({
          kind: c.kind,
          data: inject ? { ...c.data, revision: req.revision } : c.data,
          source: { type: 'ai', agentId: req.agentId, requestId: req.id },
        }) as unknown as AnyCommand,
    );
    const accepted =
      epoch === this.epoch &&
      this.engine.resolveAi(req.id, { type: 'proposal', commands, note: v.speech });
    this.audit.update(rec.auditId, {
      ...patch,
      outcome: accepted ? 'proposal' : 'late',
      reason: accepted ? undefined : epoch === this.epoch ? 'deadline_passed' : 'stale_epoch',
    });
  }

  private decline(
    req: AiRequest,
    rec: AuditRecord,
    reason: DeclineReason,
    epoch: number,
    patch: Partial<AuditRecord> = {},
  ): void {
    const accepted =
      epoch === this.epoch && this.engine.resolveAi(req.id, { type: 'decline', reason });
    const final: Partial<AuditRecord> = {
      detail: DETAIL[reason],
      ...patch,
      outcome: accepted ? 'declined' : 'late',
      reason,
    };
    if (this.audit.get(rec.auditId)) this.audit.update(rec.auditId, final);
    else this.audit.add({ ...rec, ...final });
  }

  private noteFailure(key: string, code: string): void {
    const h = this.opts.health ?? {};
    if (!NOT_AGENT_FAILURES.has(code)) {
      const n = (this.agentFailures.get(key) ?? 0) + 1;
      if (n >= (h.agentFailureLimit ?? 3)) {
        this.shelvedUntil.set(key, this.clock.now() + (h.agentShelveMs ?? 5 * 60_000));
        this.agentFailures.delete(key);
      } else this.agentFailures.set(key, n);
    }

    if (PROVIDER_FAILURES.has(code)) {
      this.providerFailures += 1;
      const limit = h.providerFailureLimit ?? 5;
      if (this.providerFailures >= limit) {
        this.blockedUntil = Math.max(
          this.blockedUntil,
          this.clock.now() + (h.providerCooldownMs ?? 60_000),
        );
        // half-open: one more failure after the cooldown opens the circuit again
        this.providerFailures = limit - 1;
      }
    }
  }

  private noteSuccess(key: string): void {
    this.agentFailures.delete(key);
    this.providerFailures = 0;
  }
}
