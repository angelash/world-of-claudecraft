// AiRunner: the bridge between the kernel's open AI requests and the model providers.
// After ticks (or on demand) it takes undispatched requests within a concurrency cap and
// decides per request who answers: with the player's settings it resolves a route (binding
// role, slot, connection, model; llm_providers.md 4.3), with a single legacy provider it
// uses the role's tier; then the degrade ladder, per-agent shelving, cooldowns, the deadline
// and the budget (reserve first, lower a slot before declining) decide whether to call. It
// assembles the prompt from the role pack and the request context, sends a routed
// LlmCallSpec (or the legacy request), validates the answer, and resolves the kernel request
// with a proposal or a decline. Health is kept per connection (circuit breakers, disabled
// models, rate-limit backoff), output-channel downgrades and bad-output runs per model, and
// the player-facing problems are collected for the settings page. A decline never stops the
// world: the request's deterministic fallback runs on the next tick (D-010, D-036). The
// runner holds no DOM and reads time only through the injected clock. See
// docs/50_tech/ai_architecture.md 2.3, 2.4 and 9.

import type { AiRequest, AiResolution } from '../core/ai_port';
import type { AnyCommand, AnyWorldEvent } from '../core/contracts';
import { AuditLog, type AuditRecord } from './audit';
import {
  Budget,
  type BudgetConfig,
  type BudgetScope,
  type BudgetSnapshot,
  type Cost,
  type DegradeLevel,
} from './budget';
import type {
  BindingRole,
  Clock,
  LlmCallResult,
  LlmCallSpec,
  LlmErrorCode,
  LlmOutcome,
  LlmProvider,
  LlmRequest,
  LlmUsage,
  ModelTier,
  ProblemCode,
  ProviderId,
  Timers,
} from './contracts';
import { BINDING_ROLES, TIER_ORDER } from './contracts';
import { findLeaksIn } from './leak';
import {
  bindingOf,
  isReservedKind,
  type LadderReason,
  ladderDecline,
  ROLE_PROBE_KIND,
  type RouteHints,
} from './llm_config/kinds';
import { poolOf, type SharePool, sharesFor } from './llm_config/presets';
import {
  type BuiltinReason,
  lowerRoute,
  type ModelRoute,
  type RouteHealth,
  resolveRoute,
} from './llm_config/routing';
import { connectionOf, type LlmSettings, profileOf } from './llm_config/settings';
import { collectStrings, recoverJson, validateProposal } from './output';
import {
  costUsd,
  costWithCard,
  DEFAULT_TIER_MODELS,
  estimateCallUsd,
  estimateTokens,
  fallbackCardOf,
  maxCard,
  priceCardOf,
  promptTokens,
} from './pricing';
import { buildOutputSchema, renderContext } from './prompt';
import { callSpecFromRequest } from './providers/call_spec';
import { noteChannelResult } from './providers/capabilities';
import {
  isOutputUnsupported,
  type MergedProblem,
  mergeProblems,
  nextBadOutput,
  type ProblemReport,
  problemForLegacyError,
} from './providers/problems';
import { fillEstimatedInput } from './providers/shared';
import { outcomeFromResult } from './providers/transport_provider';
import type { Capability, PriceCard } from './providers/types';
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
  /** How long a model that is still loading keeps its connection closed. Default 30 seconds. */
  loadingCooldownMs?: number;
}

export interface AiRunnerOptions {
  engine: AiHost;
  /**
   * Legacy: one provider for every request, tiers from the role packs (tests, the editor
   * workbench, headless tools). Ignored when `settings` is given.
   */
  provider?: LlmProvider;
  /**
   * The player's model settings (llm_providers.md 4): every request is routed. Read on
   * every request, so edits apply from the next request on (17).
   */
  settings?: LlmSettings | (() => LlmSettings);
  /** The provider serving a connection when routing (one TransportProvider may serve all). */
  providers?: (connectionId: string) => LlmProvider | undefined;
  roles: RoleRegistry;
  /** Real-time clock (ms). The client passes performance.now or Date.now; tests a fake. */
  clock: Clock;
  /** Defaults to the global setTimeout and clearTimeout. */
  timers?: Timers;
  /** Defaults to a fresh AuditLog. */
  audit?: AuditLog;
  /**
   * Budget configuration. With settings, caps and shares come from the settings and this
   * only adds tuning (thresholds, hysteresis).
   */
  budget?: Partial<BudgetConfig>;
  /** Day key and save line id for the day and run windows (host facts, 4.7). */
  budgetScope?: BudgetScope;
  /** Route facts per request (with the player, NPC tier, game day); none by default. */
  routeHints?: (req: AiRequest) => RouteHints | undefined;
  /** A model's capability moved down one output channel (3.5); the host saves it. */
  onCapability?: (connectionId: string, model: string, capability: Capability) => void;
  /** Calls in flight at once. Default 4. */
  maxConcurrent?: number;
  /** Legacy: tier per role, overriding the role pack default. */
  roleTiers?: Record<string, ModelTier>;
  /** Legacy: tier to model map for estimates; defaults to the provider's map, then the preset. */
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

/** Who drives a binding role right now (screen A of the settings page). */
export type DriverView =
  | { driver: 'model'; slot: ModelTier; connectionId: string; model: string; rerouted: boolean }
  | { driver: 'builtin'; reason: BuiltinReason | LadderReason | `cap_${'hour' | 'day' | 'run'}` };

export interface AiRunnerStatus {
  epoch: number;
  inFlight: number;
  level: DegradeLevel;
  budget: BudgetSnapshot;
  providerAvailable: boolean;
  /** real ms until which every request is declined (legacy provider circuit or backoff) */
  blockedUntil: number;
  /** Per binding role, with settings only. */
  drivers?: Record<BindingRole, DriverView>;
  problems: MergedProblem[];
}

/** Reasons the runner declines a request (written to the kernel decline and the audit). */
export type DeclineReason =
  | 'model_off'
  | 'provider_unhealthy'
  | BuiltinReason
  | LadderReason
  | 'degraded_routine'
  | 'agent_shelved'
  | 'agent_busy'
  | 'cooldown'
  | 'budget_hour'
  | 'budget_day'
  | 'budget_run'
  | 'budget_role'
  | 'budget_single'
  | 'budget_total'
  | 'deadline'
  | 'timeout'
  | 'invalid_output'
  | 'all_commands_rejected'
  | 'empty'
  | 'leak'
  | LlmErrorCode
  | ProblemCode;

const DETAIL: Partial<Record<DeclineReason, string>> = {
  model_off: '模型不可用，走规则兜底',
  provider_unhealthy: '模型服务连续出错，暂时全部走规则兜底',
  role_builtin: '该角色设为内置 AI',
  not_configured: '该角色没有可用的模型',
  connection_down: '连接熔断且无法改道，走规则兜底',
  degraded_all: '已达到花费上限，全部走规则兜底',
  degraded_reserved_only: '节能模式：只保留玩家正在进行的交谈与剧情锚点',
  degraded_goddess_plan: '节能模式：女神隔日规划',
  degraded_ruler: '节能模式：统治者与将领改用规则',
  degraded_npc_chat: '节能模式：NPC 之间的交谈改用话题菜单',
  degraded_present: '节能模式：在场 NPC 改用日程模板',
  degraded_tidy: '节能模式：整理轮推迟',
  degraded_present_event: '节能模式：在场 NPC 的事件轮改用规则',
  degraded_offstage: '节能模式：离场批量日记改用规则',
  agent_shelved: '该角色连续失败，暂时改走规则',
  agent_busy: '该角色已有请求在途',
  cooldown: '该角色冷却中',
  budget_hour: '小时预算不足',
  budget_day: '今日预算不足',
  budget_run: '本局预算不足',
  budget_role: '该类决策的预算份额不足',
  budget_single: '单次请求过大',
  budget_total: '总预算不足',
  deadline: '赶不上截止时间',
  timeout: '模型超时',
  invalid_output: '模型输出不合格式',
  all_commands_rejected: '提议的命令全部不合规',
  empty: '模型没有提出命令',
  leak: '输出含有未解锁的内容',
};

/** Legacy provider-side failures that count toward the circuit. */
const PROVIDER_FAILURES: ReadonlySet<string> = new Set([
  'overloaded',
  'server_error',
  'network',
  'timeout',
]);

/** Failures that say nothing about the agent or the prompt (configuration or account). */
const NOT_AGENT_FAILURES: ReadonlySet<string> = new Set([
  'model_off',
  'no_proxy',
  'no_credentials',
  'auth_failed',
  'aborted',
  'key_invalid',
  'permission_denied',
  'insufficient_balance',
  'model_not_found',
  'not_configured',
  'cap_reached',
  'keychain_unavailable',
  'endpoint_wrong',
  'tls_error',
  'cors_blocked',
]);

/** Problems that close the connection until the player acts (retry, new key, new address). */
const BLOCK_UNTIL_RESET: ReadonlySet<ProblemCode> = new Set([
  'key_invalid',
  'insufficient_balance',
  'tls_error',
  'endpoint_wrong',
  'cors_blocked',
  'not_configured',
]);

/** Problems that disable the model's slot on that connection. */
const DISABLE_MODEL: ReadonlySet<ProblemCode> = new Set(['permission_denied', 'model_not_found']);

/** Self-healing problems that count toward the connection's circuit. */
const COUNTED: ReadonlySet<ProblemCode> = new Set([
  'overloaded',
  'server_error',
  'network',
  'timeout',
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

function usageTokens(u: LlmUsage): number {
  return promptTokens(u) + u.outputTokens;
}

interface InFlight {
  promise: Promise<void>;
  key: string;
}

interface ConnHealth {
  failures: number;
  blockedUntil: number;
  /** Set by a problem that only the player can clear (BLOCK_UNTIL_RESET). */
  blockedFor?: ProblemCode;
  disabled: Set<string>;
  unsupportedRuns: Map<string, number>;
}

/** Who answers one request: the slot, model, connection, provider and share pool. */
interface Choice {
  tier: ModelTier;
  model: string;
  connectionId: string;
  provider: LlmProvider;
  providerKind: ProviderId;
  bindingRole: BindingRole;
  shareKey: string;
  share?: number;
  /** Routed (settings): the spec path. Absent on the legacy path. */
  route?: ModelRoute;
  /** The price card used for settlement (settings path); none means tokens only. */
  card?: PriceCard;
  /** The worst-case card for the reservation: a server-side fallback may settle higher. */
  reserveCard?: PriceCard;
  /** The player's exchange rate for CNY cards. */
  fx?: number;
}

interface Answer {
  outcome: LlmOutcome;
  result?: LlmCallResult;
  /** What the call cost; null when nothing was billed (the reservation is released). */
  cost: Cost | null;
}

export class AiRunner {
  readonly audit: AuditLog;
  readonly budget: Budget;
  private engine: AiHost;
  private readonly provider?: LlmProvider;
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
  private readonly health = new Map<string, ConnHealth>();
  private readonly badOutputRuns = new Map<string, number>();
  private readonly problemLog = new Map<string, ProblemReport & { lastSeenMs: number }>();
  private settingsSeen?: LlmSettings;
  /** The budget configuration last derived from the settings (to skip no-op updates). */
  private budgetJson = '';
  private pools: SharePool[] = [];
  private epoch = 0;
  private detachFn?: () => void;
  private pumping = false;
  private pumpAgain = false;
  private readonly routeHealth: RouteHealth;

  constructor(opts: AiRunnerOptions) {
    this.opts = opts;
    this.engine = opts.engine;
    this.provider = opts.provider;
    this.roles = opts.roles;
    this.clock = opts.clock;
    this.timers = opts.timers ?? defaultTimers();
    this.audit = opts.audit ?? new AuditLog();
    const s = this.settings();
    if (s) {
      this.settingsSeen = s;
      this.pools = sharesFor(s);
    }
    const cfg = s ? this.budgetConfigOf(s) : (opts.budget ?? {});
    if (s) this.budgetJson = JSON.stringify(cfg);
    this.budget = new Budget(cfg, opts.clock, opts.budgetScope);
    this.maxConcurrent = Math.max(1, opts.maxConcurrent ?? 4);
    this.routeHealth = {
      isOpen: (id) => this.clock.now() < this.healthOf(id).blockedUntil,
      isModelDisabled: (id, model) => this.healthOf(id).disabled.has(model),
    };
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
    this.syncSettings();
    const legacy = this.provider && !this.settings() ? this.healthOf(this.provider.id) : undefined;
    const out: AiRunnerStatus = {
      epoch: this.epoch,
      inFlight: this.inFlight.size,
      level: this.budget.level(),
      budget: this.budget.snapshot(),
      providerAvailable: this.settings() ? true : (this.provider?.available() ?? false),
      blockedUntil: legacy?.blockedUntil ?? Number.NEGATIVE_INFINITY,
      problems: this.problems(),
    };
    const drivers = this.drivers();
    if (drivers) out.drivers = drivers;
    return out;
  }

  /** The current driver of every binding role (settings only). */
  drivers(): Record<BindingRole, DriverView> | undefined {
    const s = this.settings();
    if (!s) return undefined;
    const level = this.budget.level();
    const snap = this.budget.snapshot();
    const out = {} as Record<BindingRole, DriverView>;
    for (const role of BINDING_ROLES) {
      const kind = ROLE_PROBE_KIND[role];
      const r = resolveRoute(kind, { degradeLevel: level, health: this.routeHealth }, s);
      if (r.driver === 'builtin') {
        out[role] = { driver: 'builtin', reason: r.reason };
        continue;
      }
      const ladder = ladderDecline(level, kind);
      if (ladder) {
        const cap = level >= 9 && snap.ratio >= 1 && snap.tightest ? snap.tightest : undefined;
        out[role] = { driver: 'builtin', reason: cap ? `cap_${cap}` : ladder };
        continue;
      }
      out[role] = {
        driver: 'model',
        slot: r.slot,
        connectionId: r.connectionId,
        model: r.model,
        rerouted: r.rerouted,
      };
    }
    return out;
  }

  /** Player-facing problems, one entry per code (llm_providers.md 10.2). */
  problems(): MergedProblem[] {
    return mergeProblems([...this.problemLog.values()]);
  }

  /** The player pressed retry (or saved a new key or address): close the books on a connection. */
  resetConnection(connectionId: string): void {
    this.health.delete(connectionId);
    for (const [k, p] of this.problemLog)
      if (p.connectionId === connectionId) this.problemLog.delete(k);
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

  // --- settings and health --------------------------------------------------------------

  private settings(): LlmSettings | undefined {
    const s = this.opts.settings;
    return typeof s === 'function' ? s() : s;
  }

  private budgetConfigOf(s: LlmSettings): Partial<BudgetConfig> {
    const caps: BudgetConfig['caps'] = { hour: { ...s.caps.hour }, day: { ...s.caps.day } };
    if (s.caps.run) caps.run = { ...s.caps.run };
    return {
      ...this.opts.budget,
      caps,
      perHourUsd: undefined,
      totalUsd: undefined,
      roleShares: Object.fromEntries(this.pools.map((p) => [p.id, p.share])),
    };
  }

  /**
   * New settings take effect from the next request: caps and shares when they changed, and a
   * clean slate (health and problems) for every connection whose address, auth, key or model
   * list changed or that is gone.
   */
  private syncSettings(): void {
    const s = this.settings();
    const prev = this.settingsSeen;
    if (!s || s === prev) return;
    this.settingsSeen = s;
    this.pools = sharesFor(s);
    const cfg = this.budgetConfigOf(s);
    const cfgJson = JSON.stringify(cfg);
    if (cfgJson !== this.budgetJson) {
      this.budgetJson = cfgJson;
      this.budget.setConfig(cfg);
    }
    const key = (id: string, of: LlmSettings | undefined) => {
      const c = of && connectionOf(of, id);
      return c
        ? JSON.stringify([
            c.kind,
            c.baseUrl,
            c.auth,
            c.keyState,
            c.keyLast4,
            c.extraHeaderNames,
            c.models.map((m) => m.model),
          ])
        : undefined;
    };
    const ids = new Set([
      ...this.health.keys(),
      ...[...this.problemLog.values()].map((p) => p.connectionId ?? ''),
    ]);
    for (const id of ids) {
      if (id === '' || key(id, s) === key(id, prev)) continue;
      this.resetConnection(id);
    }
  }

  private healthOf(connectionId: string): ConnHealth {
    let h = this.health.get(connectionId);
    if (!h) {
      h = {
        failures: 0,
        blockedUntil: Number.NEGATIVE_INFINITY,
        disabled: new Set(),
        unsupportedRuns: new Map(),
      };
      this.health.set(connectionId, h);
    }
    return h;
  }

  private noteProblem(report: ProblemReport): void {
    const k = `${report.code}|${report.connectionId ?? ''}|${report.model ?? ''}|${report.role ?? ''}`;
    this.problemLog.set(k, { ...report, lastSeenMs: this.clock.now() });
  }

  // --- routing ----------------------------------------------------------------------------

  private modelFor(tier: ModelTier): string {
    return (
      this.opts.tierModels?.[tier] ??
      this.provider?.tierModels?.()[tier] ??
      DEFAULT_TIER_MODELS[tier]
    );
  }

  private legacyChoice(
    provider: LlmProvider,
    tier: ModelTier,
    req: AiRequest,
    pack: RolePack,
    hints: RouteHints,
  ): Choice {
    return {
      tier,
      model: this.modelFor(tier),
      connectionId: provider.id,
      provider,
      providerKind: 'anthropic',
      bindingRole: bindingOf(req.role, hints),
      shareKey: req.role,
      share: pack.budgetShare,
    };
  }

  private routedChoice(r: ModelRoute, provider: LlmProvider, s: LlmSettings): Choice {
    const pool = poolOf(this.pools, r.bindingRole);
    const prof = profileOf(s, r.connectionId, r.model);
    const card = prof?.price ?? priceCardOf(r.provider, r.model);
    const fallback =
      r.provider === 'anthropic' &&
      prof?.capability.serverFallback === true &&
      connectionOf(s, r.connectionId)?.serverFallback !== false;
    const choice: Choice = {
      tier: r.slot,
      model: r.model,
      connectionId: r.connectionId,
      provider,
      providerKind: r.provider,
      bindingRole: r.bindingRole,
      shareKey: pool?.id ?? r.bindingRole,
      route: r,
    };
    if (pool) choice.share = pool.share;
    if (card) {
      choice.card = card;
      choice.reserveCard = fallback ? maxCard(card, fallbackCardOf(r.model)) : card;
    }
    if (s.caps.fxCnyPerUsd !== undefined) choice.fx = s.caps.fxCnyPerUsd;
    return choice;
  }

  /** Who answers, or why nobody does (fallback next tick). */
  private pick(
    req: AiRequest,
    pack: RolePack,
    level: DegradeLevel,
    reserved: boolean,
    hints: RouteHints,
    now: number,
  ): Choice | DeclineReason {
    const s = this.settings();
    if (s) {
      const r = resolveRoute(
        req.role,
        { degradeLevel: level, reserved, health: this.routeHealth, hints, fallbackTier: pack.tier },
        s,
      );
      if (r.driver === 'builtin') return r.reason;
      const provider = this.opts.providers?.(r.connectionId);
      if (!provider?.available()) return 'not_configured';
      return this.routedChoice(r, provider, s);
    }
    const provider = this.provider;
    if (!provider?.available()) return 'model_off';
    if (now < this.healthOf(provider.id).blockedUntil) return 'provider_unhealthy';
    // D-036: from ladder level 2 the request first drops one tier.
    let tier = this.opts.roleTiers?.[req.role] ?? pack.tier;
    if (level >= 2 && !reserved) tier = lowerTier(tier);
    return this.legacyChoice(provider, tier, req, pack, hints);
  }

  /** The same request one slot lower (budget), or undefined when there is none. */
  private lower(c: Choice, req: AiRequest, pack: RolePack, hints: RouteHints): Choice | undefined {
    const s = this.settings();
    if (c.route && s) {
      const r = lowerRoute(c.route, s, this.routeHealth);
      const provider = r && this.opts.providers?.(r.connectionId);
      return r && provider?.available() ? this.routedChoice(r, provider, s) : undefined;
    }
    if (c.tier === 'low') return undefined;
    return this.legacyChoice(c.provider, lowerTier(c.tier), req, pack, hints);
  }

  /**
   * Worst-case reservation: estimated input plus 15 percent at the full input price and the
   * whole output cap (thinking included); tokens count the same way.
   */
  private estimate(c: Choice, promptText: string, maxTokens: number): Cost {
    const input = Math.ceil(estimateTokens(promptText) * 1.15);
    const tokens = input + maxTokens;
    if (!c.route) return { usd: estimateCallUsd(c.model, promptText, maxTokens), tokens };
    const card = c.reserveCard ?? c.card;
    if (!card) return { tokens };
    const usage = {
      inputTokens: input,
      outputTokens: maxTokens,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    };
    return { usd: costWithCard(card, usage, c.fx), tokens };
  }

  /** Per-agent checks after routing: shelved, busy, cooldown, deadline. */
  private gate(
    req: AiRequest,
    pack: RolePack,
    key: string,
    now: number,
  ): DeclineReason | { timeoutMs: number } {
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
    this.syncSettings();
    const pack = this.roles.get(req.role);
    const now = this.clock.now();
    const level = this.budget.level();
    const key = `${req.agentId}|${req.role}`;
    const hints = this.opts.routeHints?.(req) ?? {};
    const reserved = pack.reserved || isReservedKind(req.role, hints);
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

    const picked = this.pick(req, pack, level, reserved, hints, now);
    if (typeof picked === 'string') {
      this.decline(req, rec, picked, epoch);
      return;
    }
    const ladder = ladderDecline(level, req.role, hints, reserved);
    if (ladder) {
      this.decline(req, rec, ladder, epoch);
      return;
    }
    const gate = this.gate(req, pack, key, now);
    if (typeof gate === 'string') {
      this.decline(req, rec, gate, epoch);
      return;
    }
    const timeoutMs = gate.timeoutMs;

    const rendered = renderContext(req.context, req.allowed);
    const schema = buildOutputSchema(req.allowed, pack);
    const promptText = `${pack.system}\n${rendered.stable}\n${rendered.context}`;

    // D-036: lower the slot first; decline only when even the lowest slot does not fit.
    let choice = picked;
    let cost = this.estimate(choice, promptText, pack.maxTokens);
    for (;;) {
      const verdict = this.budget.canAfford(choice.shareKey, cost, {
        share: choice.share,
        reserved,
      });
      if (verdict === 'ok') break;
      const lower = this.lower(choice, req, pack, hints);
      if (!lower) {
        this.decline(req, rec, `budget_${verdict}` as DeclineReason, epoch);
        return;
      }
      choice = lower;
      cost = this.estimate(choice, promptText, pack.maxTokens);
    }

    const llm: LlmRequest = {
      requestId: req.id,
      tier: choice.tier,
      system: pack.system,
      stable: rendered.stable,
      context: rendered.context,
      schema,
      maxTokens: pack.maxTokens,
      purpose: `${req.role}/${req.purpose}`,
      effort: choice.route?.effort ?? pack.effort,
      cacheTtl: pack.cacheTtl,
    };
    rec.tier = choice.tier;
    rec.requestedModel = choice.model;
    rec.reservedUsd = cost.usd ?? 0;
    rec.reservedTokens = cost.tokens;
    if (choice.route) {
      rec.route = {
        bindingRole: choice.bindingRole,
        slot: choice.tier,
        connectionId: choice.connectionId,
      };
      if (choice.route.rerouted) rec.route.rerouted = true;
      if (choice.route.lowered || choice.tier !== choice.route.slot) rec.route.lowered = true;
    }
    if (rendered.playerText) rec.playerText = rendered.playerText;
    if (this.opts.recordPrompts ?? true) {
      rec.prompt = { system: llm.system, stable: rendered.stable, context: rendered.context };
    }
    const spec: LlmCallSpec | undefined = choice.route
      ? callSpecFromRequest(llm, {
          provider: choice.providerKind,
          connectionId: choice.connectionId,
          bindingRole: choice.bindingRole,
          model: choice.model,
          slot: choice.tier,
          timeoutMs,
          reserve: { usd: cost.usd ?? 0, tokens: cost.tokens },
        })
      : undefined;
    this.budget.reserve(rec.auditId, choice.shareKey, cost);
    this.audit.add(rec);
    this.busy.add(key);
    this.lastDispatch.set(key, now);
    this.dispatch(req, pack, llm, spec, choice, rec, key, timeoutMs, epoch);
  }

  /** Send through the spec path (routed) or the legacy request path. */
  private async invoke(
    choice: Choice,
    llm: LlmRequest,
    spec: LlmCallSpec | undefined,
    signal: AbortSignal | undefined,
  ): Promise<Answer> {
    if (spec && choice.provider.call) {
      const raw = await choice.provider.call(spec, { signal });
      const result = fillEstimatedInput(raw, spec);
      return {
        outcome: outcomeFromResult(result, choice.model),
        result,
        cost: this.costOfResult(result, choice),
      };
    }
    const outcome = await choice.provider.complete(llm, signal);
    return { outcome, cost: this.costOfOutcome(outcome, choice) };
  }

  /** What a receipt cost: the gateway's settlement, else the price card, else tokens only. */
  private costOfResult(r: LlmCallResult, c: Choice): Cost | null {
    if (!r.usage) return r.costUsd !== undefined ? { usd: r.costUsd, tokens: 0 } : null;
    const tokens = usageTokens(r.usage);
    if (r.costUsd !== undefined) return { usd: r.costUsd, tokens };
    const served = r.servedModel && r.servedModel !== c.model ? r.servedModel : undefined;
    const card =
      (served && priceCardOf(c.providerKind, served)) ||
      (served && r.fallbackUsed ? fallbackCardOf(c.model) : undefined) ||
      c.card;
    return card ? { usd: costWithCard(card, r.usage, c.fx), tokens } : { tokens };
  }

  /** What a legacy outcome cost (provider cost, else the price book by served model). */
  private costOfOutcome(o: LlmOutcome, c: Choice): Cost | null {
    if (o.ok) {
      const usd =
        o.costUsd > 0 ? o.costUsd : costUsd(o.model, o.usage) || costUsd(c.model, o.usage);
      return { usd, tokens: usageTokens(o.usage) };
    }
    if (o.costUsd !== undefined || o.usage) {
      const usd = o.costUsd ?? (o.usage ? costUsd(o.model ?? c.model, o.usage) : 0);
      return { usd, tokens: o.usage ? usageTokens(o.usage) : 0 };
    }
    return null;
  }

  private dispatch(
    req: AiRequest,
    pack: RolePack,
    llm: LlmRequest,
    spec: LlmCallSpec | undefined,
    choice: Choice,
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
        this.budget.settle(rec.auditId, {
          usd: rec.reservedUsd ?? 0,
          tokens: rec.reservedTokens ?? 0,
        });
        this.noteFailure(key, 'timeout');
        this.noteTransportFailure(choice, 'timeout');
        this.decline(req, rec, 'timeout', epoch, { latencyMs: this.clock.now() - t0 });
      });
    }, timeoutMs);

    const promise = Promise.resolve()
      .then(() => this.invoke(choice, llm, spec, ctrl?.signal))
      .then(
        (answer) => {
          if (done) {
            // Late answer after a timeout: correct the kept estimate only with real numbers.
            if (answer.cost) this.budget.settle(rec.auditId, answer.cost);
            this.audit.update(rec.auditId, {
              usage: answer.outcome.usage,
              costUsd: answer.cost?.usd,
              detail: `${DETAIL.timeout}（迟到的回复已丢弃）`,
            });
            return;
          }
          if (answer.cost) this.budget.settle(rec.auditId, answer.cost);
          else this.budget.release(rec.auditId);
          finish(() =>
            this.onOutcome(req, pack, rec, key, answer, choice, epoch, this.clock.now() - t0),
          );
        },
        (err: unknown) => {
          if (done) return;
          finish(() => {
            this.budget.release(rec.auditId);
            this.noteFailure(key, 'network');
            this.noteTransportFailure(choice, 'network');
            this.decline(req, rec, 'network', epoch, {
              detail: `提供方异常：${err instanceof Error ? err.name : 'unknown'}`,
            });
          });
        },
      );
    this.inFlight.set(rec.auditId, { promise, key });
  }

  private onOutcome(
    req: AiRequest,
    pack: RolePack,
    rec: AuditRecord,
    key: string,
    answer: Answer,
    choice: Choice,
    epoch: number,
    latencyMs: number,
  ): void {
    const outcome = answer.outcome;
    if (!outcome.ok) {
      if (answer.result && isOutputUnsupported(answer.result)) this.noteUnsupported(choice);
      const problem = outcome.problem ?? problemForLegacyError(outcome.error);
      if (choice.route) this.noteConnFailure(choice, problem, outcome.retryAfterMs);
      else this.noteLegacyFailure(choice, outcome);
      if (problem) {
        this.noteProblem({
          code: problem,
          connectionId: choice.connectionId,
          model: choice.model,
          role: choice.bindingRole,
        });
      }
      this.noteFailure(key, outcome.problem ?? outcome.error);
      this.decline(req, rec, outcome.problem ?? outcome.error, epoch, {
        detail: outcome.message,
        usage: outcome.usage,
        costUsd: answer.cost?.usd,
        model: outcome.model,
        stopReason: outcome.stopReason,
        latencyMs,
        ...(problem ? { problem } : {}),
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
      costUsd: answer.cost?.usd ?? outcome.costUsd,
      latencyMs,
      commands: v.commands,
      rejected: v.rejected,
      validation: { ok: v.ok, errors: v.errors },
      speech: v.speech,
      thought: v.thought,
    };
    this.noteConnSuccess(choice);
    this.noteBadOutput(choice, v.ok);
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

  // --- health bookkeeping ---------------------------------------------------------------

  /** Per-agent failure run: the third in a row shelves the agent (9.3). */
  private noteFailure(key: string, code: string): void {
    if (NOT_AGENT_FAILURES.has(code)) return;
    const h = this.opts.health ?? {};
    const n = (this.agentFailures.get(key) ?? 0) + 1;
    if (n >= (h.agentFailureLimit ?? 3)) {
      this.shelvedUntil.set(key, this.clock.now() + (h.agentShelveMs ?? 5 * 60_000));
      this.agentFailures.delete(key);
    } else this.agentFailures.set(key, n);
  }

  private noteSuccess(key: string): void {
    this.agentFailures.delete(key);
  }

  /** Open the circuit after `limit` counted failures; half-open: one more reopens it. */
  private count(h: ConnHealth, cooldownMs: number): void {
    h.failures += 1;
    const limit = this.opts.health?.providerFailureLimit ?? 5;
    if (h.failures >= limit) {
      h.blockedUntil = Math.max(h.blockedUntil, this.clock.now() + cooldownMs);
      h.failures = limit - 1;
    }
  }

  /** A timeout or a thrown provider counts toward the connection's circuit on both paths. */
  private noteTransportFailure(c: Choice, code: 'timeout' | 'network'): void {
    if (c.route) this.noteConnFailure(c, code);
    else this.count(this.healthOf(c.connectionId), this.opts.health?.providerCooldownMs ?? 60_000);
  }

  /** The legacy provider's circuit (single provider, legacy error codes). */
  private noteLegacyFailure(c: Choice, o: Extract<LlmOutcome, { ok: false }>): void {
    const h = this.healthOf(c.connectionId);
    if (o.error === 'rate_limited' && o.retryAfterMs) {
      h.blockedUntil = Math.max(h.blockedUntil, this.clock.now() + o.retryAfterMs);
    }
    if (PROVIDER_FAILURES.has(o.error)) {
      this.count(h, this.opts.health?.providerCooldownMs ?? 60_000);
    }
  }

  /** A routed connection's health after a failure, by problem code (10.1 automatic handling). */
  private noteConnFailure(c: Choice, problem: ProblemCode | undefined, retryAfterMs?: number) {
    if (!problem) return;
    const h = this.healthOf(c.connectionId);
    if (BLOCK_UNTIL_RESET.has(problem)) {
      h.blockedUntil = Number.POSITIVE_INFINITY;
      h.blockedFor = problem;
    } else if (DISABLE_MODEL.has(problem)) {
      h.disabled.add(c.model);
    } else if (problem === 'rate_limited') {
      if (retryAfterMs) h.blockedUntil = Math.max(h.blockedUntil, this.clock.now() + retryAfterMs);
    } else if (problem === 'model_not_loaded') {
      // The service is loading the model: try again after the probe interval (10.1).
      const ms = this.opts.health?.loadingCooldownMs ?? 30_000;
      h.blockedUntil = Math.max(h.blockedUntil, this.clock.now() + ms);
    } else if (COUNTED.has(problem)) {
      this.count(h, this.opts.health?.providerCooldownMs ?? 60_000);
    }
  }

  private noteConnSuccess(c: Choice): void {
    const h = this.healthOf(c.connectionId);
    h.failures = 0;
    h.unsupportedRuns.delete(c.model);
    for (const [k, p] of this.problemLog) {
      if (p.connectionId !== c.connectionId) continue;
      if (p.code === 'bad_output' || p.code === 'unsupported_output' || p.code === 'refusal') {
        continue;
      }
      this.problemLog.delete(k);
    }
  }

  /** Third "parameter not supported" in a row moves the model down one channel (3.5). */
  private noteUnsupported(c: Choice): void {
    const s = this.settings();
    const prof = s && profileOf(s, c.connectionId, c.model);
    if (!prof) return;
    const h = this.healthOf(c.connectionId);
    const step = noteChannelResult(prof.capability, h.unsupportedRuns.get(c.model) ?? 0, true);
    h.unsupportedRuns.set(c.model, step.run);
    if (step.problem) {
      this.noteProblem({
        code: step.problem,
        connectionId: c.connectionId,
        model: c.model,
        role: c.bindingRole,
      });
      this.opts.onCapability?.(c.connectionId, c.model, step.capability);
    }
  }

  /** Fifth unparseable answer in a row of a role on a model raises bad_output (10.1). */
  private noteBadOutput(c: Choice, parsedOk: boolean): void {
    const k = `${c.bindingRole}|${c.connectionId}|${c.model}`;
    const step = nextBadOutput(this.badOutputRuns.get(k) ?? 0, parsedOk);
    this.badOutputRuns.set(k, step.run);
    if (step.problem) {
      this.noteProblem({
        code: step.problem,
        connectionId: c.connectionId,
        model: c.model,
        role: c.bindingRole,
      });
    }
  }
}
