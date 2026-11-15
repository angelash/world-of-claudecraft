// Providers behind the LlmProvider seam:
// - NullProvider: no model; the runner declines every request (rules-only play, D-010).
// - ProxyProvider: POSTs the neutral request to the local proxy /api/llm (tools/dev_api.ts),
//   which holds the credentials. The browser never sees a key.
// - MockProvider: scripted answers for tests; never touches a network.
// See docs/50_tech/ai_architecture.md 2.3.1 and 11.1.

import { defaultTransport } from './audit';
import type {
  AbortSignalLike,
  Clock,
  HttpTransport,
  LlmErrorCode,
  LlmFailure,
  LlmOutcome,
  LlmProvider,
  LlmRequest,
  LlmResult,
  LlmUsage,
  ModelTier,
} from './contracts';
import { EMPTY_USAGE } from './contracts';

export class NullProvider implements LlmProvider {
  readonly id = 'none';
  available(): boolean {
    return false;
  }
  async complete(): Promise<LlmOutcome> {
    return { ok: false, error: 'model_off', message: '未配置模型' };
  }
}

// ---------------------------------------------------------------------------

export interface ProxyStatus {
  available: boolean;
  /** why not available: 'no_credentials', 'auth_failed', 'network', 'no_proxy', ... */
  reason?: string;
  tiers?: Partial<Record<ModelTier, string>>;
}

export interface ProxyProviderOptions {
  /** Origin of the dev server; '' (default) means same origin. */
  baseUrl?: string;
  /** Defaults to the global fetch. */
  transport?: HttpTransport;
  /** Used for latency and for retrying after an "unavailable" verdict. */
  clock?: Clock;
  /** After the proxy reports no credentials or is missing, try again after this long. */
  recheckMs?: number;
}

const UNAVAILABLE: ReadonlySet<LlmErrorCode> = new Set([
  'no_credentials',
  'auth_failed',
  'no_proxy',
]);

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/** Read an LlmUsage from a JSON body field (missing fields count as zero). */
export function readUsage(v: unknown): LlmUsage {
  if (!isObj(v)) return { ...EMPTY_USAGE };
  const u: LlmUsage = {
    inputTokens: num(v.inputTokens),
    outputTokens: num(v.outputTokens),
    cacheReadInputTokens: num(v.cacheReadInputTokens),
    cacheCreationInputTokens: num(v.cacheCreationInputTokens),
  };
  if (typeof v.cacheCreation1hInputTokens === 'number') {
    u.cacheCreation1hInputTokens = num(v.cacheCreation1hInputTokens);
  }
  return u;
}

const ERROR_CODES: ReadonlySet<string> = new Set<LlmErrorCode>([
  'model_off',
  'no_proxy',
  'no_credentials',
  'auth_failed',
  'rate_limited',
  'overloaded',
  'server_error',
  'timeout',
  'network',
  'aborted',
  'bad_request',
  'refusal',
  'bad_response',
  'mock_exhausted',
]);

export class ProxyProvider implements LlmProvider {
  readonly id = 'proxy';
  private readonly base: string;
  private readonly transport?: HttpTransport;
  private readonly clock?: Clock;
  private readonly recheckMs: number;
  private downUntil = Number.NEGATIVE_INFINITY;
  private down = false;
  private tiers: Partial<Record<ModelTier, string>> = {};

  constructor(opts: ProxyProviderOptions = {}) {
    this.base = opts.baseUrl ?? '';
    this.transport = opts.transport;
    this.clock = opts.clock;
    this.recheckMs = opts.recheckMs ?? 60_000;
  }

  available(): boolean {
    if (!this.down) return true;
    if (this.clock && this.clock.now() >= this.downUntil) {
      this.down = false;
      return true;
    }
    return false;
  }

  tierModels(): Partial<Record<ModelTier, string>> {
    return this.tiers;
  }

  private markDown(): void {
    this.down = true;
    this.downUntil = this.clock ? this.clock.now() + this.recheckMs : Number.POSITIVE_INFINITY;
  }

  private send(): HttpTransport | undefined {
    return this.transport ?? defaultTransport();
  }

  /** Ask the proxy whether a model is reachable; updates availability and the tier map. */
  async status(signal?: AbortSignalLike): Promise<ProxyStatus> {
    const transport = this.send();
    if (!transport) return { available: false, reason: 'no_transport' };
    try {
      const res = await transport(`${this.base}/api/llm/status`, { method: 'GET', signal });
      if (res.status === 404) {
        this.markDown();
        return { available: false, reason: 'no_proxy' };
      }
      const body = await res.json();
      if (!isObj(body)) return { available: false, reason: 'bad_response' };
      const tiers: Partial<Record<ModelTier, string>> = {};
      if (isObj(body.tiers)) {
        for (const t of ['top', 'mid', 'low'] as const) {
          const m = body.tiers[t];
          if (typeof m === 'string') tiers[t] = m;
        }
      }
      this.tiers = tiers;
      const available = body.available === true;
      if (available) this.down = false;
      else this.markDown();
      return {
        available,
        reason: typeof body.reason === 'string' ? body.reason : undefined,
        tiers,
      };
    } catch {
      return { available: false, reason: 'network' };
    }
  }

  async complete(req: LlmRequest, signal?: AbortSignalLike): Promise<LlmOutcome> {
    const transport = this.send();
    if (!transport) return { ok: false, error: 'no_proxy', message: '没有可用的网络传输' };
    const t0 = this.clock?.now() ?? 0;
    const latency = () => (this.clock ? Math.max(0, this.clock.now() - t0) : 0);
    let status: number;
    let body: unknown;
    try {
      const res = await transport(`${this.base}/api/llm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(req),
        signal,
      });
      status = res.status;
      body = await res.json().catch(() => undefined);
    } catch {
      return {
        ok: false,
        error: signal?.aborted ? 'aborted' : 'network',
        message: signal?.aborted ? '请求已取消' : '无法连接模型代理',
        latencyMs: latency(),
      };
    }
    if (status === 404) {
      this.markDown();
      return {
        ok: false,
        error: 'no_proxy',
        message: '没有模型代理（/api/llm 不存在）',
        latencyMs: latency(),
      };
    }
    if (!isObj(body)) {
      return {
        ok: false,
        error: 'bad_response',
        message: `代理返回了无法解析的内容（HTTP ${status}）`,
        latencyMs: latency(),
      };
    }
    if (body.ok === true) {
      const result: LlmResult = {
        ok: true,
        json: body.json ?? null,
        text: typeof body.text === 'string' ? body.text : '',
        usage: readUsage(body.usage),
        model: typeof body.model === 'string' ? body.model : '',
        stopReason: typeof body.stopReason === 'string' ? body.stopReason : '',
        costUsd: num(body.costUsd),
        latencyMs: typeof body.latencyMs === 'number' ? body.latencyMs : latency(),
      };
      return result;
    }
    const code =
      typeof body.error === 'string' && ERROR_CODES.has(body.error)
        ? (body.error as LlmErrorCode)
        : 'server_error';
    if (UNAVAILABLE.has(code)) this.markDown();
    const failure: LlmFailure = {
      ok: false,
      error: code,
      message: typeof body.message === 'string' ? body.message : `HTTP ${status}`,
      latencyMs: latency(),
    };
    if (typeof body.retryAfterMs === 'number') failure.retryAfterMs = body.retryAfterMs;
    if (body.usage !== undefined) failure.usage = readUsage(body.usage);
    if (typeof body.costUsd === 'number') failure.costUsd = body.costUsd;
    if (typeof body.model === 'string') failure.model = body.model;
    if (typeof body.stopReason === 'string') failure.stopReason = body.stopReason;
    return failure;
  }
}

// ---------------------------------------------------------------------------

export type MockAnswer =
  | LlmOutcome
  /** shorthand for a successful answer with this JSON */
  | { json: unknown; costUsd?: number; usage?: Partial<LlmUsage>; model?: string };

export type MockStep =
  | MockAnswer
  | ((req: LlmRequest, call: number) => MockAnswer | Promise<MockAnswer>);

export interface MockProviderOptions {
  available?: boolean;
  /** Keep answering with the last step when the script runs out (default false). */
  repeatLast?: boolean;
  tiers?: Partial<Record<ModelTier, string>>;
}

/** Scripted provider for tests: answers in order, records every request it receives. */
export class MockProvider implements LlmProvider {
  readonly id = 'mock';
  readonly calls: LlmRequest[] = [];
  private readonly script: MockStep[];
  private readonly opts: MockProviderOptions;
  isAvailable: boolean;

  constructor(script: MockStep[] | MockStep = [], opts: MockProviderOptions = {}) {
    this.script = Array.isArray(script) ? [...script] : [script];
    this.opts = opts;
    this.isAvailable = opts.available ?? true;
  }

  /** A successful answer carrying `json` (and the same object as text). */
  static ok(json: unknown, extra: Partial<LlmResult> = {}): LlmResult {
    return {
      ok: true,
      json,
      text: JSON.stringify(json),
      usage: { ...EMPTY_USAGE },
      model: 'mock',
      stopReason: 'end_turn',
      costUsd: 0,
      latencyMs: 0,
      ...extra,
    };
  }

  static fail(error: LlmErrorCode, message: string = error): LlmFailure {
    return { ok: false, error, message };
  }

  available(): boolean {
    return this.isAvailable;
  }

  tierModels(): Partial<Record<ModelTier, string>> {
    return this.opts.tiers ?? {};
  }

  async complete(req: LlmRequest): Promise<LlmOutcome> {
    const n = this.calls.length;
    this.calls.push(req);
    let step = this.script[n];
    if (step === undefined && this.opts.repeatLast) step = this.script[this.script.length - 1];
    if (step === undefined) return MockProvider.fail('mock_exhausted', '脚本已用完');
    const answer = typeof step === 'function' ? await step(req, n) : step;
    if ('ok' in answer) return answer;
    return MockProvider.ok(answer.json, {
      costUsd: answer.costUsd ?? 0,
      usage: { ...EMPTY_USAGE, ...answer.usage },
      model: answer.model ?? 'mock',
    });
  }
}
