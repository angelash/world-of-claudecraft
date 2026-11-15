// ChaosTransport (docs/50_tech/llm_providers.md 16.1; release_engineering.md 10.8): wraps
// another transport and, by a seeded schedule, makes a connection fail the way real services
// do: every problem code of llm_providers.md 10.1 (status, class, retry hint), malformed or
// half JSON, refusals, a stream cut halfway, slow answers. Faults come from an explicit queue
// first, then from per-fault rates drawn with the seed, so a run is reproducible. Used to
// check that the world never waits, fallbacks land on time, problems are classified and caps
// hold. Pure apart from the injected timers.

import type {
  AbortSignalLike,
  LlmCallResult,
  LlmCallSpec,
  LlmTransport,
  ProblemCode,
  ProviderErrorClass,
  Timers,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';
import { type SeededRandom, seededRandom } from './rng';

export type ChaosFault =
  | ProblemCode
  /** A successful answer whose text is not JSON. */
  | 'bad_json'
  /** A successful answer cut at the output cap, JSON unfinished. */
  | 'half_json'
  /** The stream stops halfway: one delta, then a transport failure. */
  | 'stream_cut'
  /** The inner answer, after a delay longer than the call's timeout. */
  | 'slow';

export interface ChaosOptions {
  seed: number;
  /** Probability per call of each fault; the rates are tried in this object's order. */
  rates?: Partial<Record<ChaosFault, number>>;
  /** Faults for the next calls in order, before any random one. */
  queue?: ChaosFault[];
  /** Only calls on these connections are disturbed. */
  connections?: readonly string[];
  /** Extra latency for every call, drawn uniformly (needs timers). */
  latencyMs?: readonly [number, number];
  timers?: Timers;
}

interface FaultShape {
  cls: ProviderErrorClass;
  httpStatus?: number;
  problem?: ProblemCode;
  retryAfterMs?: number;
  param?: string;
}

/** The receipt shape each problem code has when a real service raises it (10.1). */
const FAULTS: Readonly<Record<ProblemCode, FaultShape>> = {
  key_invalid: { cls: 'auth', httpStatus: 401, problem: 'key_invalid' },
  permission_denied: { cls: 'auth', httpStatus: 403, problem: 'permission_denied' },
  insufficient_balance: { cls: 'quota', httpStatus: 402, problem: 'insufficient_balance' },
  model_not_found: { cls: 'model_unavailable', httpStatus: 404, problem: 'model_not_found' },
  model_not_loaded: { cls: 'model_unavailable', httpStatus: 503, problem: 'model_not_loaded' },
  timeout: { cls: 'timeout', problem: 'timeout' },
  context_too_long: { cls: 'context_too_long', httpStatus: 400, problem: 'context_too_long' },
  rate_limited: {
    cls: 'rate_limited',
    httpStatus: 429,
    problem: 'rate_limited',
    retryAfterMs: 20_000,
  },
  overloaded: { cls: 'overloaded', httpStatus: 529, problem: 'overloaded' },
  server_error: { cls: 'server', httpStatus: 500, problem: 'server_error' },
  network: { cls: 'network', problem: 'network' },
  tls_error: { cls: 'network', problem: 'tls_error' },
  endpoint_wrong: { cls: 'network', httpStatus: 302, problem: 'endpoint_wrong' },
  cors_blocked: { cls: 'network', problem: 'cors_blocked' },
  refusal: { cls: 'refusal', problem: 'refusal' },
  // A rejected output parameter carries no problem yet: the runtime raises
  // unsupported_output on the third strike (llm_providers.md 3.5).
  unsupported_output: { cls: 'bad_request', httpStatus: 400, param: 'response_format' },
  // Unparseable answers are successes the runtime fails; see bad_json.
  bad_output: { cls: 'bad_request' },
  keychain_unavailable: { cls: 'auth', problem: 'keychain_unavailable' },
  not_configured: { cls: 'auth', problem: 'not_configured' },
  cap_reached: { cls: 'quota', problem: 'cap_reached' },
};

/** The receipt a fault produces for this spec (no network involved). */
export function faultResult(
  fault: Exclude<ChaosFault, 'slow' | 'stream_cut'>,
  spec: LlmCallSpec,
): LlmCallResult {
  if (fault === 'bad_json' || fault === 'bad_output' || fault === 'half_json') {
    const half = fault === 'half_json';
    return {
      ok: true,
      text: half ? '{"commands":[{"kind":"' : 'not json at all',
      json: null,
      stopReason: half ? 'max_tokens' : 'end',
      usage: { ...EMPTY_USAGE, inputTokens: 100, outputTokens: half ? spec.output.maxTokens : 5 },
      servedModel: spec.model,
      latencyMs: 0,
    };
  }
  const f = FAULTS[fault];
  const out: LlmCallResult = {
    ok: false,
    error: { cls: f.cls, message: `chaos ${fault}` },
    latencyMs: 0,
  };
  if (f.problem) out.problem = f.problem;
  if (out.error && f.httpStatus !== undefined) out.error.httpStatus = f.httpStatus;
  if (out.error && f.retryAfterMs !== undefined) out.error.retryAfterMs = f.retryAfterMs;
  if (out.error && f.param !== undefined) out.error.param = f.param;
  if (fault === 'refusal') {
    out.stopReason = 'refusal';
    out.usage = { ...EMPTY_USAGE, inputTokens: 100, outputTokens: 3 };
  }
  return out;
}

export class ChaosTransport implements LlmTransport {
  /** Every fault injected, in order. */
  readonly injected: { requestId: string; fault: ChaosFault }[] = [];
  private readonly rng: SeededRandom;
  private readonly queue: ChaosFault[];

  constructor(
    private readonly inner: LlmTransport,
    private readonly opts: ChaosOptions,
  ) {
    this.rng = seededRandom(opts.seed);
    this.queue = [...(opts.queue ?? [])];
  }

  private draw(): ChaosFault | undefined {
    const queued = this.queue.shift();
    if (queued) return queued;
    const x = this.rng.next();
    let acc = 0;
    for (const [fault, rate] of Object.entries(this.opts.rates ?? {})) {
      acc += rate ?? 0;
      if (x < acc) return fault as ChaosFault;
    }
    return undefined;
  }

  private wait(ms: number, signal?: AbortSignalLike): Promise<void> {
    const timers = this.opts.timers;
    if (!timers || ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const h = timers.set(resolve, ms);
      signal?.addEventListener('abort', () => {
        timers.clear(h);
        resolve();
      });
    });
  }

  async send(
    spec: LlmCallSpec,
    opts: { signal?: AbortSignalLike; onDelta?: (text: string) => void } = {},
  ): Promise<LlmCallResult> {
    const target = !this.opts.connections || this.opts.connections.includes(spec.connectionId);
    const fault = target ? this.draw() : undefined;
    const lat = this.opts.latencyMs;
    const extra = target && lat ? this.rng.int(lat[0], lat[1]) : 0;
    await this.wait(extra, opts.signal);
    if (!fault) return this.inner.send(spec, opts);
    this.injected.push({ requestId: spec.requestId, fault });
    if (fault === 'slow') {
      await this.wait(spec.timeoutMs + 1, opts.signal);
      return this.inner.send(spec, opts);
    }
    if (fault === 'stream_cut') {
      opts.onDelta?.('{"commands":[');
      return {
        ok: false,
        error: { cls: 'network', message: 'chaos stream cut' },
        problem: 'network',
        latencyMs: extra,
      };
    }
    return { ...faultResult(fault, spec), latencyMs: extra };
  }
}
