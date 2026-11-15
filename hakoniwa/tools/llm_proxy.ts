// The model proxy behind /api/llm (Node only; the browser never imports the SDK or sees a
// key). It accepts only the neutral LlmRequest (src/ai/contracts.ts), maps the tier to a
// whitelisted model, and calls the Messages API through the official SDK with:
// structured outputs (output_config.format), an explicit effort, cache breakpoints on the
// stable system blocks, no thinking or sampling parameters (Claude 5.5 models think
// adaptively; disabling it is a 400), a refusal check before reading content, and the
// server-side refusal fallback for Opus 5.5 and Sonnet 5.5 (Haiku 5.5 has none).
// Errors use the SDK's typed exceptions; messages are scrubbed of credentials.
// See docs/50_tech/ai_architecture.md 2.3.1, 9.1 and 11.1.

import type Anthropic from '@anthropic-ai/sdk';
import type { CacheTtl, Effort, JsonSchema, LlmUsage, ModelTier } from '../src/ai/contracts';
import { CALLABLE_MODELS, costUsd, DEFAULT_TIER_MODELS, priceOf } from '../src/ai/pricing';

export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/** Hard caps on what a client may ask for (defense in depth, ai_architecture.md 11.1). */
export const MAX_TOKENS_CAP = 16_000;
export const MAX_BODY_BYTES = 256 * 1024;

type SdkClient = InstanceType<typeof Anthropic>;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type BetaMessage = Anthropic.Beta.Messages.BetaMessage;

export interface NeutralLlmBody {
  tier: ModelTier;
  system: string;
  stable: string;
  context: string;
  schema: JsonSchema;
  maxTokens: number;
  effort: Effort;
  cacheTtl: CacheTtl;
  purpose: string;
  requestId: string;
}

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Validate and normalise a POST /api/llm body. */
export function parseLlmBody(
  raw: unknown,
  maxTokensCap = MAX_TOKENS_CAP,
): ParseResult<NeutralLlmBody> {
  if (!isObj(raw)) return { ok: false, error: 'body must be a JSON object' };
  const tier = raw.tier;
  if (tier !== 'top' && tier !== 'mid' && tier !== 'low') return { ok: false, error: 'bad tier' };
  if (typeof raw.system !== 'string' || raw.system.trim() === '') {
    return { ok: false, error: 'system must be a non-empty string' };
  }
  if (raw.stable !== undefined && typeof raw.stable !== 'string')
    return { ok: false, error: 'bad stable' };
  if (typeof raw.context !== 'string') return { ok: false, error: 'context must be a string' };
  if (!isObj(raw.schema) || raw.schema.type !== 'object') {
    return { ok: false, error: 'schema must be a JSON Schema object' };
  }
  const mt = raw.maxTokens;
  if (typeof mt !== 'number' || !Number.isInteger(mt) || mt < 1)
    return { ok: false, error: 'bad maxTokens' };
  const effort = raw.effort ?? 'medium';
  if (effort !== 'low' && effort !== 'medium' && effort !== 'high')
    return { ok: false, error: 'bad effort' };
  const cacheTtl = raw.cacheTtl ?? '5m';
  if (cacheTtl !== '5m' && cacheTtl !== '1h') return { ok: false, error: 'bad cacheTtl' };
  return {
    ok: true,
    value: {
      tier,
      system: raw.system,
      stable: typeof raw.stable === 'string' ? raw.stable : '',
      context: raw.context,
      schema: raw.schema,
      maxTokens: Math.min(mt, maxTokensCap),
      effort,
      cacheTtl,
      purpose: typeof raw.purpose === 'string' ? raw.purpose.slice(0, 120) : '',
      requestId: typeof raw.requestId === 'string' ? raw.requestId.slice(0, 64) : '',
    },
  };
}

/** Tier to model map: env HAKONIWA_MODEL_TOP / _MID / _LOW, then options, then the preset. */
export function resolveTierModels(
  env: Record<string, string | undefined>,
  overrides: Partial<Record<ModelTier, string>> = {},
  warn: (msg: string) => void = () => {},
): Record<ModelTier, string> {
  const out = { ...DEFAULT_TIER_MODELS };
  for (const tier of ['top', 'mid', 'low'] as const) {
    const wanted = env[`HAKONIWA_MODEL_${tier.toUpperCase()}`] ?? overrides[tier];
    if (!wanted) continue;
    if (CALLABLE_MODELS.includes(wanted)) out[tier] = wanted;
    else warn(`[dev-api] model ${wanted} for tier ${tier} is not whitelisted; using ${out[tier]}`);
  }
  return out;
}

/** Build the Messages API request (beta surface, so the fallback beta can be attached). */
export function buildMessageParams(body: NeutralLlmBody, model: string): CreateParams {
  const cache =
    body.cacheTtl === '1h'
      ? ({ type: 'ephemeral', ttl: '1h' } as const)
      : ({ type: 'ephemeral' } as const);
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: 'text', text: body.system, cache_control: cache },
  ];
  if (body.stable.trim() !== '')
    system.push({ type: 'text', text: body.stable, cache_control: cache });
  const params: CreateParams = {
    model,
    max_tokens: body.maxTokens,
    system,
    messages: [{ role: 'user', content: body.context.trim() === '' ? '（无）' : body.context }],
    output_config: {
      effort: body.effort,
      format: { type: 'json_schema', schema: body.schema },
    },
  };
  if (priceOf(model)?.serverFallback) {
    params.betas = [SERVER_FALLBACK_BETA];
    params.fallbacks = 'default';
  }
  return params;
}

export function toUsage(u: BetaMessage['usage']): LlmUsage {
  return {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheReadInputTokens: u.cache_read_input_tokens ?? 0,
    cacheCreationInputTokens: u.cache_creation_input_tokens ?? 0,
    cacheCreation1hInputTokens: u.cache_creation?.ephemeral_1h_input_tokens ?? 0,
  };
}

export interface ProxyPayload {
  ok: boolean;
  [key: string]: unknown;
}

/** Turn a Messages API response into the proxy's JSON payload (refusal checked first). */
export function readMessage(
  msg: BetaMessage,
  requestedModel: string,
  latencyMs: number,
): ProxyPayload {
  const usage = toUsage(msg.usage);
  const served = msg.model || requestedModel;
  const cost = priceOf(served) ? costUsd(served, usage) : costUsd(requestedModel, usage);
  const fallbackUsed = (msg.usage.iterations ?? []).some((it) => it.type === 'fallback_message');
  if (msg.stop_reason === 'refusal') {
    return {
      ok: false,
      error: 'refusal',
      message: `模型拒答（${msg.stop_details?.category ?? '未分类'}）`,
      stopReason: 'refusal',
      usage,
      costUsd: cost,
      model: served,
      latencyMs,
      fallbackUsed,
    };
  }
  const text = msg.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return {
    ok: true,
    json,
    text,
    usage,
    model: served,
    stopReason: msg.stop_reason ?? '',
    costUsd: cost,
    latencyMs,
    fallbackUsed,
  };
}

type Ctor = abstract new (...args: never[]) => object;

/** The SDK's typed exception classes (the default export carries them as statics). */
export interface SdkErrorClasses {
  APIError: Ctor;
  AuthenticationError: Ctor;
  PermissionDeniedError: Ctor;
  RateLimitError: Ctor;
  BadRequestError: Ctor;
  NotFoundError: Ctor;
  APIConnectionError: Ctor;
  APIConnectionTimeoutError: Ctor;
  APIUserAbortError: Ctor;
  InternalServerError: Ctor;
}

const KEY_PATTERN = /sk-ant-[A-Za-z0-9_-]+/g;

/** Remove anything that looks like a credential from a message, and bound its length. */
export function redact(message: string, env: Record<string, string | undefined>): string {
  let m = message.replace(KEY_PATTERN, '[redacted]');
  for (const name of ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN']) {
    const v = env[name];
    if (v && v.length >= 8) m = m.split(v).join('[redacted]');
  }
  return m.slice(0, 300);
}

function retryAfterMs(err: unknown, fallbackMs: number): number {
  const headers = (err as { headers?: { get?: (k: string) => string | null } }).headers;
  const raw = headers?.get?.('retry-after');
  const secs = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : fallbackMs;
}

export interface ProxyResponse {
  status: number;
  payload: ProxyPayload;
}

/** Map a thrown error to an HTTP status and payload, without string matching. */
export function classifyError(
  err: unknown,
  E: SdkErrorClasses,
  env: Record<string, string | undefined>,
  hasEnvCredentials: boolean,
): ProxyResponse {
  const msg = redact(err instanceof Error ? err.message : String(err), env);
  if (err instanceof E.AuthenticationError || err instanceof E.PermissionDeniedError) {
    return {
      status: 503,
      payload: { ok: false, error: 'auth_failed', message: '模型凭据无效或无权限' },
    };
  }
  if (err instanceof E.RateLimitError) {
    return {
      status: 503,
      payload: {
        ok: false,
        error: 'rate_limited',
        message: '模型限流',
        retryAfterMs: retryAfterMs(err, 20_000),
      },
    };
  }
  if (err instanceof E.APIUserAbortError) {
    return { status: 499, payload: { ok: false, error: 'aborted', message: '请求已取消' } };
  }
  if (err instanceof E.APIConnectionTimeoutError) {
    return {
      status: 503,
      payload: { ok: false, error: 'timeout', message: '模型请求超时', retryAfterMs: 10_000 },
    };
  }
  if (err instanceof E.APIConnectionError) {
    return {
      status: 503,
      payload: { ok: false, error: 'network', message: '无法连接模型服务', retryAfterMs: 10_000 },
    };
  }
  if (err instanceof E.InternalServerError) {
    const status = (err as { status?: number }).status;
    return {
      status: 503,
      payload: {
        ok: false,
        error: status === 529 ? 'overloaded' : 'server_error',
        message: status === 529 ? '模型服务繁忙' : '模型服务出错',
        retryAfterMs: retryAfterMs(err, 30_000),
      },
    };
  }
  if (err instanceof E.BadRequestError || err instanceof E.NotFoundError) {
    return { status: 400, payload: { ok: false, error: 'bad_request', message: msg } };
  }
  if (err instanceof E.APIError) {
    return { status: 502, payload: { ok: false, error: 'server_error', message: msg } };
  }
  // Not an API error: with no credential in the environment this is the SDK failing to
  // resolve any authentication (no key, no token, no `ant auth login` profile).
  if (!hasEnvCredentials) {
    return {
      status: 503,
      payload: { ok: false, error: 'no_credentials', message: '没有可用的模型凭据' },
    };
  }
  return { status: 500, payload: { ok: false, error: 'server_error', message: msg } };
}

/** Which credential the environment provides, if any (never returns the value). */
export function envCredentialSource(
  env: Record<string, string | undefined>,
): 'api_key' | 'auth_token' | null {
  if (env.ANTHROPIC_API_KEY) return 'api_key';
  if (env.ANTHROPIC_AUTH_TOKEN) return 'auth_token';
  return null;
}

export interface LlmServiceOptions {
  /** Tier to model overrides (env HAKONIWA_MODEL_* wins). */
  tiers?: Partial<Record<ModelTier, string>>;
  /** Upstream timeout per call (ms). Default 120 seconds. */
  requestTimeoutMs?: number;
  maxTokensCap?: number;
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
  /** Injected for tests; defaults to a lazily imported SDK client. */
  loadSdk?: () => Promise<{ client: SdkClient; errors: SdkErrorClasses }>;
  now?: () => number;
}

export interface StatusPayload {
  available: boolean;
  source?: 'api_key' | 'auth_token' | 'profile';
  reason?: 'no_credentials' | 'auth_failed' | 'network';
  tiers: Record<ModelTier, string>;
  serverFallback: Record<ModelTier, boolean>;
}

const STATUS_TTL_MS = 5 * 60_000;

async function defaultLoadSdk(): Promise<{ client: SdkClient; errors: SdkErrorClasses }> {
  const mod = await import('@anthropic-ai/sdk');
  const Sdk = mod.default;
  return { client: new Sdk(), errors: Sdk };
}

export class LlmService {
  readonly tiers: Record<ModelTier, string>;
  private readonly env: Record<string, string | undefined>;
  private readonly log: (line: string) => void;
  private readonly loadSdk: () => Promise<{ client: SdkClient; errors: SdkErrorClasses }>;
  private readonly now: () => number;
  private readonly requestTimeoutMs: number;
  readonly maxTokensCap: number;
  private sdk?: Promise<{ client: SdkClient; errors: SdkErrorClasses }>;
  private statusCache?: { at: number; body: StatusPayload };
  private authFailedAt = Number.NEGATIVE_INFINITY;

  constructor(opts: LlmServiceOptions = {}) {
    this.env = opts.env ?? process.env;
    this.log = opts.log ?? ((line) => console.info(line));
    this.tiers = resolveTierModels(this.env, opts.tiers, this.log);
    this.loadSdk = opts.loadSdk ?? defaultLoadSdk;
    this.now = opts.now ?? (() => Date.now());
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 120_000;
    this.maxTokensCap = opts.maxTokensCap ?? MAX_TOKENS_CAP;
  }

  private getSdk(): Promise<{ client: SdkClient; errors: SdkErrorClasses }> {
    if (!this.sdk) {
      this.sdk = this.loadSdk();
      this.sdk.catch(() => {
        this.sdk = undefined;
      });
    }
    return this.sdk;
  }

  private base(): Omit<StatusPayload, 'available'> {
    const fb = (t: ModelTier) => priceOf(this.tiers[t])?.serverFallback ?? false;
    return {
      tiers: this.tiers,
      serverFallback: { top: fb('top'), mid: fb('mid'), low: fb('low') },
    };
  }

  /** GET /api/llm/status. Environment credentials are trusted; a profile is probed (cached). */
  async status(): Promise<StatusPayload> {
    const now = this.now();
    if (now - this.authFailedAt < STATUS_TTL_MS) {
      return { ...this.base(), available: false, reason: 'auth_failed' };
    }
    const source = envCredentialSource(this.env);
    if (source) return { ...this.base(), available: true, source };
    if (this.statusCache && now - this.statusCache.at < STATUS_TTL_MS) return this.statusCache.body;
    let body: StatusPayload;
    try {
      const { client } = await this.getSdk();
      await client.models.list({ limit: 1 }, { timeout: 10_000, maxRetries: 0 });
      body = { ...this.base(), available: true, source: 'profile' };
    } catch (err) {
      let reason: StatusPayload['reason'] = 'no_credentials';
      try {
        const { errors } = await this.getSdk();
        if (err instanceof errors.APIConnectionError) reason = 'network';
        else if (
          err instanceof errors.AuthenticationError ||
          err instanceof errors.PermissionDeniedError
        ) {
          reason = 'auth_failed';
        }
      } catch {
        reason = 'no_credentials';
      }
      body = { ...this.base(), available: false, reason };
    }
    this.statusCache = { at: now, body };
    return body;
  }

  /** POST /api/llm with an already parsed body. */
  async complete(body: NeutralLlmBody, signal?: AbortSignal): Promise<ProxyResponse> {
    const model = this.tiers[body.tier];
    const params = buildMessageParams(body, model);
    const t0 = this.now();
    let sdk: { client: SdkClient; errors: SdkErrorClasses };
    try {
      sdk = await this.getSdk();
    } catch {
      return {
        status: 503,
        payload: { ok: false, error: 'no_credentials', message: '模型 SDK 无法加载' },
      };
    }
    try {
      const msg = await sdk.client.beta.messages.create(params, {
        signal,
        timeout: this.requestTimeoutMs,
      });
      const payload = readMessage(msg, model, this.now() - t0);
      const u = payload.usage as LlmUsage;
      this.log(
        `[llm] ${body.purpose || '-'} tier=${body.tier} model=${String(payload.model)} ` +
          `${payload.ok ? String(payload.stopReason) : String(payload.error)} in=${u.inputTokens} ` +
          `cache_read=${u.cacheReadInputTokens} cache_write=${u.cacheCreationInputTokens} ` +
          `out=${u.outputTokens} usd=${Number(payload.costUsd).toFixed(5)} ${this.now() - t0}ms`,
      );
      return { status: 200, payload };
    } catch (err) {
      const res = classifyError(err, sdk.errors, this.env, envCredentialSource(this.env) !== null);
      if (res.payload.error === 'auth_failed') this.authFailedAt = this.now();
      if (res.payload.error === 'no_credentials') this.statusCache = undefined;
      this.log(
        `[llm] ${body.purpose || '-'} tier=${body.tier} model=${model} error=${String(res.payload.error)}`,
      );
      return res;
    }
  }
}
