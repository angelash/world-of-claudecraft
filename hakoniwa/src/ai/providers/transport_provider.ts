// TransportProvider: the LlmProvider over an injected LlmTransport (docs/50_tech/
// llm_providers.md 2.2, 14). The runner hands it routed LlmCallSpecs (call); hosts that still
// drive it with the legacy LlmRequest (complete) give it default route facts, and the request
// becomes a spec through callSpecFromRequest. Receipts turn back into the runner's LlmOutcome
// with outcomeFromResult. Nothing here touches a network: the transport does.

import type {
  AbortSignalLike,
  BindingRole,
  LlmCallResult,
  LlmCallSpec,
  LlmErrorCode,
  LlmOutcome,
  LlmProvider,
  LlmRequest,
  LlmTransport,
  ModelTier,
  ProviderId,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';
import { callSpecFromRequest } from './call_spec';

/** The legacy error code of a receipt (audit records and the legacy decline reasons). */
export function legacyErrorOf(r: LlmCallResult): LlmErrorCode {
  if (r.problem === 'not_configured') return 'no_credentials';
  switch (r.error?.cls) {
    case 'timeout':
      return 'timeout';
    case 'rate_limited':
      return 'rate_limited';
    case 'overloaded':
      return 'overloaded';
    case 'server':
      return 'server_error';
    case 'network':
      return r.error.message === 'aborted' ? 'aborted' : 'network';
    case 'refusal':
      return 'refusal';
    case 'auth':
    case 'quota':
      return 'auth_failed';
    case 'model_unavailable':
      return r.error.message === 'model_off' ? 'model_off' : 'bad_request';
    case 'bad_request':
    case 'context_too_long':
      return 'bad_request';
    default:
      return 'bad_response';
  }
}

/** A receipt as the runner's LlmOutcome (the problem code rides along on failures). */
export function outcomeFromResult(r: LlmCallResult, requestedModel: string): LlmOutcome {
  if (r.ok) {
    return {
      ok: true,
      json: r.json ?? null,
      text: r.text ?? '',
      usage: r.usage ?? { ...EMPTY_USAGE },
      model: r.servedModel ?? requestedModel,
      stopReason: r.rawStopReason ?? r.stopReason ?? '',
      costUsd: r.costUsd ?? 0,
      latencyMs: r.latencyMs,
    };
  }
  const out: LlmOutcome = {
    ok: false,
    error: legacyErrorOf(r),
    message: r.error?.message ?? r.problem ?? 'failed',
    latencyMs: r.latencyMs,
  };
  if (r.problem) out.problem = r.problem;
  if (r.error?.retryAfterMs !== undefined) out.retryAfterMs = r.error.retryAfterMs;
  if (r.usage) out.usage = r.usage;
  if (r.costUsd !== undefined) out.costUsd = r.costUsd;
  if (r.servedModel) out.model = r.servedModel;
  if (r.rawStopReason ?? r.stopReason) out.stopReason = r.rawStopReason ?? r.stopReason;
  return out;
}

/** A failed receipt for a transport that threw (transports should resolve instead). */
export function thrownResult(err: unknown, signal?: AbortSignalLike): LlmCallResult {
  const aborted = signal?.aborted === true;
  return {
    ok: false,
    error: {
      cls: 'network',
      message: aborted ? 'aborted' : `transport threw ${err instanceof Error ? err.name : 'error'}`,
    },
    ...(aborted ? {} : { problem: 'network' as const }),
    latencyMs: 0,
  };
}

/** Route facts for the legacy `complete` path (one connection, models per tier). */
export interface TransportDefaults {
  provider: ProviderId;
  connectionId: string;
  tierModels: Partial<Record<ModelTier, string>>;
  bindingRole?: BindingRole;
  timeoutMs?: number;
}

export interface TransportProviderOptions {
  id?: string;
  /** False while the transport cannot answer (no proxy, no shell); default always true. */
  available?: () => boolean;
  defaults?: TransportDefaults;
}

export class TransportProvider implements LlmProvider {
  readonly id: string;
  private readonly isAvailable: () => boolean;

  constructor(
    readonly transport: LlmTransport,
    private readonly opts: TransportProviderOptions = {},
  ) {
    this.id = opts.id ?? 'transport';
    this.isAvailable = opts.available ?? (() => true);
  }

  available(): boolean {
    return this.isAvailable();
  }

  tierModels(): Partial<Record<ModelTier, string>> {
    return { ...this.opts.defaults?.tierModels };
  }

  async call(
    spec: LlmCallSpec,
    opts: { signal?: AbortSignalLike; onDelta?: (text: string) => void } = {},
  ): Promise<LlmCallResult> {
    try {
      return await this.transport.send(spec, opts);
    } catch (err) {
      return thrownResult(err, opts.signal);
    }
  }

  async complete(req: LlmRequest, signal?: AbortSignalLike): Promise<LlmOutcome> {
    const d = this.opts.defaults;
    const model = d?.tierModels[req.tier];
    if (!d || !model) {
      return { ok: false, error: 'no_credentials', message: 'no route', problem: 'not_configured' };
    }
    const spec = callSpecFromRequest(req, {
      provider: d.provider,
      connectionId: d.connectionId,
      bindingRole: d.bindingRole ?? 'present_npc',
      model,
      timeoutMs: d.timeoutMs ?? 60_000,
    });
    return outcomeFromResult(await this.call(spec, { signal }), model);
  }
}
