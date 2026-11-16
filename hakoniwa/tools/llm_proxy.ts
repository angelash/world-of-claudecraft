// The model proxy behind /api/llm (Node only; the browser never imports the SDK or sees a
// key; D-059). POST /api/llm takes the LlmCallSpec contract (docs/50_tech/llm_providers.md
// 3.1, 12; the game client and the editor workbench send it through DevProxyTransport): the
// pseudo connection 'dev_proxy' goes through the official SDK with the same body the release
// Anthropic adapter builds (buildSpecMessageParams, pinned by
// tests/llm_dev_proxy_contract.test.ts); compatible and local connections from
// .local/llm_dev.json go through the shared pure adapters of src/ai/providers/ and Node
// fetch, redirects not followed. Answers are LlmCallResult receipts with problem codes
// (llm_providers.md 10).
// The SDK path sends structured outputs (output_config.format), an explicit effort, cache
// breakpoints on the stable system blocks, no thinking or sampling parameters (Claude 5.5
// models think adaptively; disabling it is a 400), check refusal before reading content,
// and request the server-side refusal fallback for Opus 5.5 and Sonnet 5.5 (Haiku 5.5 has
// none). The connection test and the model listing (/api/llm/test, /api/llm/models) run the
// shared flows of src/ai/providers/connection_test.ts. Errors use the SDK's typed
// exceptions or the adapters' classifiers; messages are scrubbed of credentials.
// See docs/50_tech/ai_architecture.md 2.3.1, 9.1 and 11.1.

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type Anthropic from '@anthropic-ai/sdk';
import type {
  JsonSchema,
  LlmCallResult,
  LlmCallSpec,
  ModelTier,
  PromptSegment,
  SegmentCache,
} from '../src/ai/contracts';
import { costUsd, costWithCard, DEFAULT_TIER_MODELS, priceOf } from '../src/ai/pricing';
import {
  type AdapterError,
  type AdapterHttpRequest,
  type AdapterSend,
  adapterFor,
  anthropicAdapter,
  type Capability,
  type ConnectionPublic,
  type ConnectionTestReport,
  defaultBaseUrl,
  defaultCapability,
  EMPTY_TURN,
  fetchModelListing,
  fillEstimatedInput,
  type HeaderBag,
  knownModelIds,
  type LocalFlavor,
  type ModelListing,
  type ModelProfile,
  type NetErrorKind,
  normalizeBaseUrl,
  outputGuidance,
  type PriceCard,
  profileFor,
  rewriteSchema,
  runConnectionTest,
  SERVER_FALLBACK_BETA,
  SUBMIT_DESCRIPTION,
  SUBMIT_TOOL,
} from '../src/ai/providers';

export { SERVER_FALLBACK_BETA };

/** Hard caps on what a client may ask for (defense in depth, ai_architecture.md 11.1). */
export const MAX_TOKENS_CAP = 16_000;
export const MAX_BODY_BYTES = 256 * 1024;

type SdkClient = InstanceType<typeof Anthropic>;
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * The dev proxy connection's enabled models, which are also its whitelist (llm_providers.md
 * 7.4 item 4): the known Anthropic models. Server-side fallback targets are priced in the
 * price book but never called directly.
 */
export function devProxyModels(): string[] {
  return knownModelIds('anthropic');
}

/**
 * Tier to model map: env HAKONIWA_MODEL_TOP / _MID / _LOW, then options, then the
 * recommended preset table; only models the dev proxy connection enables are accepted.
 */
export function resolveTierModels(
  env: Record<string, string | undefined>,
  overrides: Partial<Record<ModelTier, string>> = {},
  warn: (msg: string) => void = () => {},
): Record<ModelTier, string> {
  const out = { ...DEFAULT_TIER_MODELS };
  const enabled = devProxyModels();
  for (const tier of ['top', 'mid', 'low'] as const) {
    const wanted = env[`HAKONIWA_MODEL_${tier.toUpperCase()}`] ?? overrides[tier];
    if (!wanted) continue;
    if (enabled.includes(wanted)) out[tier] = wanted;
    else warn(`[dev-api] model ${wanted} for tier ${tier} is not whitelisted; using ${out[tier]}`);
  }
  return out;
}

type TextBlockParam = Anthropic.Beta.Messages.BetaTextBlockParam;
type ContentBlockParam = Anthropic.Beta.Messages.BetaContentBlockParam;
type MessageParam = Anthropic.Beta.Messages.BetaMessageParam;
type CacheControl = Anthropic.Beta.Messages.BetaCacheControlEphemeral;

const SYSTEM_SEGMENTS: ReadonlySet<PromptSegment['role']> = new Set([
  'rules',
  'persona',
  'private',
]);

/** SDK-side cache breakpoints: at most four, a one-hour entry never after a five-minute one. */
function sdkCache(): (c: SegmentCache | undefined) => CacheControl | undefined {
  let used = 0;
  let sawShort = false;
  return (c) => {
    if (c === undefined || c === 'none' || used >= 4) return undefined;
    used += 1;
    if (c === 'long' && !sawShort) return { type: 'ephemeral', ttl: '1h' };
    sawShort = true;
    return { type: 'ephemeral' };
  };
}

function sdkText(text: string, cc: CacheControl | undefined): TextBlockParam {
  return cc ? { type: 'text', text, cache_control: cc } : { type: 'text', text };
}

/**
 * The SDK path for an LlmCallSpec on the dev proxy connection, written against the SDK's
 * parameter types. It must put the same body on the wire as the release Anthropic adapter
 * (src/ai/providers/anthropic.ts); tests/llm_dev_proxy_contract.test.ts compares the two
 * field by field. Non-streaming: the dev proxy answers in one piece.
 */
export function buildSpecMessageParams(
  spec: LlmCallSpec,
  conn: ConnectionPublic,
  prof: ModelProfile,
): CreateParams {
  const cap = prof.capability;
  const channel = cap.channels[0] ?? 'prompt_only';
  const cache = sdkCache();
  const system: TextBlockParam[] = [];
  for (const s of spec.segments) {
    if (SYSTEM_SEGMENTS.has(s.role) && s.text.trim() !== '')
      system.push(sdkText(s.text, cache(s.cache)));
  }
  const tool = channel === 'tool_carrier';
  const forced = tool && cap.forcedTool && cap.toolChoice === 'named';
  const anyTool = tool && cap.forcedTool && cap.toolChoice === 'required';
  if (channel === 'prompt_only' || (tool && !forced && !anyTool)) {
    system.push(sdkText(outputGuidance(spec.output.schema, { mustCallSubmit: tool }), undefined));
  }
  const turns: { role: MessageParam['role']; blocks: ContentBlockParam[] }[] = [];
  let sawTurn = false;
  for (const s of spec.segments) {
    if (SYSTEM_SEGMENTS.has(s.role)) continue;
    const isTurn = s.role === 'turn';
    sawTurn ||= isTurn;
    const text = isTurn && s.text.trim() === '' ? EMPTY_TURN : s.text;
    if (!isTurn && text.trim() === '') continue;
    const role: MessageParam['role'] =
      s.role === 'history_assistant' ? 'assistant' : s.role === 'operator' ? 'system' : 'user';
    const blocks: ContentBlockParam[] = [];
    if (role === 'assistant' && s.opaque?.provider === 'anthropic') {
      blocks.push(...(s.opaque.blocks as ContentBlockParam[]));
    }
    blocks.push(sdkText(text, role === 'system' ? undefined : cache(s.cache)));
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.blocks.push(...blocks);
    else turns.push({ role, blocks });
  }
  if (!sawTurn && !turns.some((t) => t.role === 'user')) {
    turns.push({ role: 'user', blocks: [sdkText(EMPTY_TURN, undefined)] });
  }
  const messages = turns.map((t): MessageParam => {
    const only = t.blocks.length === 1 ? t.blocks[0] : undefined;
    const plain =
      only && only.type === 'text' && !('cache_control' in only) ? only.text : undefined;
    return { role: t.role, content: plain ?? t.blocks } as MessageParam;
  });
  const params: CreateParams = {
    model: spec.model,
    max_tokens: spec.output.maxTokens,
    system,
    messages,
  };
  const schema = () =>
    rewriteSchema(spec.output.schema, 'anthropic', { flags: cap.dialect }).schema as JsonSchema;
  const outputConfig: NonNullable<CreateParams['output_config']> = {};
  if (cap.effort && spec.effort) outputConfig.effort = spec.effort;
  if (channel === 'json_schema') outputConfig.format = { type: 'json_schema', schema: schema() };
  if (Object.keys(outputConfig).length > 0) params.output_config = outputConfig;
  if (tool) {
    params.tools = [
      {
        name: SUBMIT_TOOL,
        description: SUBMIT_DESCRIPTION,
        input_schema: schema() as Anthropic.Beta.Messages.BetaTool.InputSchema,
      },
    ];
    params.tool_choice = forced
      ? { type: 'tool', name: SUBMIT_TOOL }
      : anyTool
        ? { type: 'any' }
        : { type: 'auto' };
  }
  if (cap.serverFallback && conn.serverFallback !== false) {
    params.betas = [SERVER_FALLBACK_BETA];
    params.fallbacks = 'default';
  }
  return params;
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

/** Which credential the environment provides, if any (never returns the value). */
export function envCredentialSource(
  env: Record<string, string | undefined>,
): 'api_key' | 'auth_token' | null {
  if (env.ANTHROPIC_API_KEY) return 'api_key';
  if (env.ANTHROPIC_AUTH_TOKEN) return 'auth_token';
  return null;
}

// --- dev connections (.local/llm_dev.json) and senders -----------------------------------

/** The pseudo connection served through the SDK (llm_providers.md 4.7, 12). */
export const DEV_PROXY_CONNECTION_ID = 'dev_proxy';

/** Default location of the developer's compatible and local connections (not in git). */
export const DEV_CONNECTIONS_FILE = fileURLToPath(
  new URL('../.local/llm_dev.json', import.meta.url),
);

export interface DevModelConfig {
  model: string;
  capability?: Partial<Capability>;
  price?: PriceCard;
  temperature?: number;
}

/** One compatible or local connection of .local/llm_dev.json (credentials stay in Node). */
export interface DevConnectionConfig {
  id: string;
  kind: 'openai_compat' | 'local';
  flavor?: LocalFlavor;
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  auth?: 'bearer' | 'x_api_key' | 'custom_header' | 'none';
  headerName?: string;
  extraHeaders?: Record<string, string>;
  currency?: 'USD' | 'CNY';
  models: (string | DevModelConfig)[];
}

const FLAVORS: readonly LocalFlavor[] = ['ollama', 'lmstudio', 'llamacpp', 'generic'];

/** Validate the dev connection file; bad entries are skipped with a warning. */
export function parseDevConnections(
  raw: unknown,
  warn: (m: string) => void = () => {},
): DevConnectionConfig[] {
  const list = isObj(raw) && Array.isArray(raw.connections) ? raw.connections : [];
  const out: DevConnectionConfig[] = [];
  for (const c of list) {
    if (
      !isObj(c) ||
      typeof c.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,64}$/.test(c.id) ||
      c.id === DEV_PROXY_CONNECTION_ID ||
      (c.kind !== 'openai_compat' && c.kind !== 'local') ||
      !Array.isArray(c.models)
    ) {
      warn('[dev-api] skipped a malformed entry in .local/llm_dev.json');
      continue;
    }
    const flavor = FLAVORS.includes(c.flavor as LocalFlavor)
      ? (c.flavor as LocalFlavor)
      : undefined;
    const models = c.models.filter(
      (m): m is string | DevModelConfig =>
        (typeof m === 'string' && m !== '') || (isObj(m) && typeof m.model === 'string'),
    );
    const conf: DevConnectionConfig = { id: c.id, kind: c.kind, models };
    if (flavor) conf.flavor = flavor;
    if (typeof c.name === 'string') conf.name = c.name;
    if (typeof c.baseUrl === 'string') conf.baseUrl = c.baseUrl;
    if (typeof c.apiKey === 'string' && c.apiKey !== '') conf.apiKey = c.apiKey;
    if (
      c.auth === 'bearer' ||
      c.auth === 'x_api_key' ||
      c.auth === 'custom_header' ||
      c.auth === 'none'
    ) {
      conf.auth = c.auth;
    }
    if (typeof c.headerName === 'string' && /^[A-Za-z0-9-]+$/.test(c.headerName)) {
      conf.headerName = c.headerName;
    }
    if (isObj(c.extraHeaders)) {
      conf.extraHeaders = Object.fromEntries(
        Object.entries(c.extraHeaders).filter(
          (e): e is [string, string] => /^[A-Za-z0-9-]+$/.test(e[0]) && typeof e[1] === 'string',
        ),
      );
    }
    if (c.currency === 'USD' || c.currency === 'CNY') conf.currency = c.currency;
    out.push(conf);
  }
  return out;
}

/** The connection as the game sees it: no key, only its state. */
export function devConnectionPublic(c: DevConnectionConfig): ConnectionPublic {
  const flavor = c.kind === 'local' ? (c.flavor ?? 'generic') : undefined;
  const scheme = c.auth ?? (c.apiKey ? 'bearer' : 'none');
  const conn: ConnectionPublic = {
    id: c.id,
    kind: c.kind,
    name: c.name ?? c.id,
    baseUrl: normalizeBaseUrl(c.baseUrl ?? defaultBaseUrl(c.kind, flavor)),
    auth:
      scheme === 'custom_header' ? { scheme, headerName: c.headerName ?? 'x-api-key' } : { scheme },
    keyState: c.apiKey ? 'saved' : 'none',
    extraHeaderNames: Object.keys(c.extraHeaders ?? {}),
    currency: c.currency ?? 'USD',
    maxInFlight: c.kind === 'local' ? 2 : 8,
    models: c.models.map((m) => {
      const cfg: DevModelConfig = typeof m === 'string' ? { model: m } : m;
      const base = profileFor(c.kind, cfg.model, flavor);
      const prof: ModelProfile = {
        ...base,
        capability: { ...defaultCapability(c.kind, flavor), ...cfg.capability },
      };
      if (cfg.price) prof.price = cfg.price;
      if (cfg.temperature !== undefined) prof.temperature = cfg.temperature;
      return prof;
    }),
  };
  if (flavor) conn.flavor = flavor;
  if (c.apiKey) conn.keyLast4 = c.apiKey.slice(-4);
  return conn;
}

/** Auth and extra headers for a dev connection (only ever built inside Node). */
export function devAuthHeaders(c: DevConnectionConfig): Record<string, string> {
  const h: Record<string, string> = { ...(c.extraHeaders ?? {}) };
  if (!c.apiKey) return h;
  const scheme = c.auth ?? 'bearer';
  if (scheme === 'bearer') h.authorization = `Bearer ${c.apiKey}`;
  else if (scheme === 'x_api_key') h['x-api-key'] = c.apiKey;
  else if (scheme === 'custom_header') h[(c.headerName ?? 'x-api-key').toLowerCase()] = c.apiKey;
  return h;
}

/** Minimal fetch shape (the global fetch of Node satisfies it). */
export type FetchLike = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    redirect: 'manual';
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  headers: { forEach(cb: (value: string, key: string) => void): void };
  text(): Promise<string>;
}>;

/** Answers larger than this are cut (llm_providers.md 7.5). */
export const MAX_ANSWER_BYTES = 2 * 1024 * 1024;

/** Node and undici error codes to transport failure kinds. */
export function netErrorKindOf(err: unknown): NetErrorKind {
  const e = err as { name?: string; code?: string; cause?: { code?: string; name?: string } };
  if (e?.name === 'TimeoutError' || e?.cause?.name === 'TimeoutError') return 'timeout';
  const code = e?.cause?.code ?? e?.code ?? '';
  if (code === 'ECONNREFUSED') return 'refused';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'dns';
  if (code === 'ECONNRESET' || code === 'UND_ERR_SOCKET') return 'reset';
  if (/CERT|SSL|TLS|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)) return 'tls';
  if (code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'ETIMEDOUT') return 'timeout';
  return 'other';
}

/**
 * A sender over fetch: adds the connection's auth headers, never follows redirects, bounds
 * the answer and the time, and maps failures to transport kinds.
 */
export function fetchSender(
  fetchImpl: FetchLike,
  auth: Record<string, string>,
  now: () => number,
  outer?: AbortSignal,
): AdapterSend {
  return async (req: AdapterHttpRequest, opts) => {
    const t0 = now();
    const signals = [AbortSignal.timeout(opts.timeoutMs)];
    if (outer) signals.push(outer);
    try {
      const res = await fetchImpl(req.url, {
        method: req.method,
        headers: { ...req.headers, ...auth },
        ...(req.body !== undefined ? { body: req.body } : {}),
        redirect: 'manual',
        signal: AbortSignal.any(signals),
      });
      const firstByteMs = now() - t0;
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      const body = (await res.text()).slice(0, MAX_ANSWER_BYTES);
      return {
        ok: true,
        res: { status: res.status, body, headers, latencyMs: now() - t0, firstByteMs },
      };
    } catch (err) {
      return { ok: false, netError: netErrorKindOf(err), latencyMs: now() - t0 };
    }
  };
}

function sdkHeaders(h: unknown): HeaderBag {
  const out: Record<string, string> = {};
  const bag = h as { forEach?: (cb: (v: string, k: string) => void) => void } | undefined;
  bag?.forEach?.((v, k) => {
    out[k.toLowerCase()] = v;
  });
  return out;
}

/**
 * A sender for the dev proxy connection that routes the Anthropic adapter's requests
 * through the SDK (models.list, beta.messages.create), so the connection test and the model
 * listing run the shared flows while credentials stay with the SDK.
 */
export function sdkSender(
  sdk: { client: SdkClient; errors: SdkErrorClasses },
  now: () => number,
  hasEnvCredentials = true,
): AdapterSend {
  const { client, errors } = sdk;
  return async (req, opts) => {
    const t0 = now();
    const url = new URL(req.url);
    try {
      let body: unknown;
      if (url.pathname.endsWith('/v1/models')) {
        const after = url.searchParams.get('after_id') ?? undefined;
        const page = (await client.models.list(
          { limit: 100, ...(after ? { after_id: after } : {}) },
          { timeout: opts.timeoutMs, maxRetries: 0 },
        )) as unknown as { data: unknown[]; has_more?: boolean; last_id?: string | null };
        body = { data: page.data, has_more: page.has_more === true, last_id: page.last_id ?? null };
      } else {
        const params = JSON.parse(req.body ?? '{}') as CreateParams;
        const beta = req.headers['anthropic-beta'];
        if (beta) params.betas = beta.split(',');
        body = await client.beta.messages.create(params, {
          timeout: opts.timeoutMs,
          maxRetries: 0,
        });
      }
      const latencyMs = now() - t0;
      const rid = requestIdOf(body);
      const headers: Record<string, string> = rid ? { 'request-id': rid } : {};
      return { ok: true, res: { status: 200, body: JSON.stringify(body), headers, latencyMs } };
    } catch (err) {
      const latencyMs = now() - t0;
      if (err instanceof errors.APIConnectionTimeoutError) {
        return { ok: false, netError: 'timeout', latencyMs };
      }
      if (err instanceof errors.APIConnectionError) {
        const kind = netErrorKindOf(err);
        return {
          ok: false,
          netError: kind === 'other' ? netErrorKindOf((err as { cause?: unknown }).cause) : kind,
          latencyMs,
        };
      }
      if (err instanceof errors.APIError) {
        const e = err as { status?: number; error?: unknown; headers?: unknown };
        return {
          ok: true,
          res: {
            status: e.status ?? 500,
            body: JSON.stringify(e.error ?? {}),
            headers: sdkHeaders(e.headers),
            latencyMs,
          },
        };
      }
      // No credential the SDK could resolve: the provider would answer 401.
      if (!hasEnvCredentials)
        return { ok: true, res: { status: 401, body: '{}', headers: {}, latencyMs } };
      return { ok: false, netError: 'other', latencyMs };
    }
  };
}

/** The request id the SDK attaches to a response object (not enumerable). */
function requestIdOf(v: unknown): string | undefined {
  const rid = (v as { _request_id?: unknown } | null)?._request_id;
  return typeof rid === 'string' && rid !== '' ? rid : undefined;
}

/** Remove a dev connection's key and extra header values from developer text. */
function redactConfig(text: string, c: DevConnectionConfig): string {
  let t = text;
  for (const v of [c.apiKey, ...Object.values(c.extraHeaders ?? {})]) {
    if (v && v.length >= 4) t = t.split(v).join('[redacted]');
  }
  return t;
}

/** A failed receipt for a spec this proxy cannot route (llm_providers.md 7.4 items 3, 4). */
export function notConfiguredResult(message: string): LlmCallResult {
  return { ok: false, error: { cls: 'auth', message }, problem: 'not_configured', latencyMs: 0 };
}

/** POST /api/llm/test body. */
export interface TestRequestBody {
  connectionId: string;
  depth: 'quick' | 'deep';
  models?: string[];
}

export function parseTestBody(raw: unknown): ParseResult<TestRequestBody> {
  if (!isObj(raw)) return { ok: false, error: 'body must be a JSON object' };
  const id = raw.connectionId ?? DEV_PROXY_CONNECTION_ID;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return { ok: false, error: 'bad connectionId' };
  }
  const depth = raw.depth ?? 'quick';
  if (depth !== 'quick' && depth !== 'deep') return { ok: false, error: 'bad depth' };
  const out: TestRequestBody = { connectionId: id, depth };
  if (raw.models !== undefined) {
    if (!Array.isArray(raw.models) || !raw.models.every((m) => typeof m === 'string')) {
      return { ok: false, error: 'bad models' };
    }
    out.models = raw.models as string[];
  }
  return { ok: true, value: out };
}

/** Connection test and model listing calls per minute (llm_providers.md 7.2). */
export const PROBE_CALLS_PER_MINUTE = 10;

export interface LlmServiceOptions {
  /** Tier to model overrides (env HAKONIWA_MODEL_* wins). */
  tiers?: Partial<Record<ModelTier, string>>;
  maxTokensCap?: number;
  env?: Record<string, string | undefined>;
  log?: (line: string) => void;
  /** Injected for tests; defaults to a lazily imported SDK client. */
  loadSdk?: () => Promise<{ client: SdkClient; errors: SdkErrorClasses }>;
  now?: () => number;
  /** Compatible and local dev connections; default: read from `connectionsFile`. */
  connections?: DevConnectionConfig[];
  /** Default DEV_CONNECTIONS_FILE; null reads nothing. */
  connectionsFile?: string | null;
  /** Injected for tests; defaults to the global fetch. */
  fetch?: FetchLike;
  /** ISO time for test reports; defaults to the wall clock. */
  nowIso?: () => string;
}

export interface StatusPayload {
  available: boolean;
  source?: 'api_key' | 'auth_token' | 'profile';
  reason?: 'no_credentials' | 'auth_failed' | 'network';
  tiers: Record<ModelTier, string>;
  serverFallback: Record<ModelTier, boolean>;
  /** The connections this proxy serves (no keys), with their capability records. */
  connections?: ConnectionPublic[];
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
  readonly maxTokensCap: number;
  private sdk?: Promise<{ client: SdkClient; errors: SdkErrorClasses }>;
  private statusCache?: { at: number; body: StatusPayload };
  private authFailedAt = Number.NEGATIVE_INFINITY;
  private readonly opts: LlmServiceOptions;
  private readonly nowIso: () => string;
  private devConns?: Promise<DevConnectionConfig[]>;
  /** Capabilities found by /api/llm/test, by connection and model. */
  private readonly probed = new Map<string, Capability>();
  private probeTimes: number[] = [];

  constructor(opts: LlmServiceOptions = {}) {
    this.opts = opts;
    this.nowIso = opts.nowIso ?? (() => new Date().toISOString());
    this.env = opts.env ?? process.env;
    this.log = opts.log ?? ((line) => console.info(line));
    this.tiers = resolveTierModels(this.env, opts.tiers, this.log);
    this.loadSdk = opts.loadSdk ?? defaultLoadSdk;
    this.now = opts.now ?? (() => Date.now());
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

  /**
   * GET /api/llm/status. Environment credentials are trusted; a profile is probed (cached).
   * Also lists the connections this proxy serves with their capability records.
   */
  async status(): Promise<StatusPayload> {
    const core = await this.statusCore();
    return { ...core, connections: await this.connectionsPublic() };
  }

  private async statusCore(): Promise<StatusPayload> {
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

  // --- the LlmCallSpec contract (llm_providers.md 12) ----------------------------------

  private devConnections(): Promise<DevConnectionConfig[]> {
    if (!this.devConns) {
      if (this.opts.connections) this.devConns = Promise.resolve(this.opts.connections);
      else if (this.opts.connectionsFile === null) this.devConns = Promise.resolve([]);
      else {
        const file = this.opts.connectionsFile ?? DEV_CONNECTIONS_FILE;
        this.devConns = readFile(file, 'utf8')
          .then((text) => parseDevConnections(JSON.parse(text), this.log))
          .catch(() => []);
      }
    }
    return this.devConns;
  }

  /** The pseudo connection 'dev_proxy': Anthropic through the SDK, slots from the env. */
  devProxyConnection(): ConnectionPublic {
    const models = [...new Set([...devProxyModels(), ...Object.values(this.tiers)])];
    return {
      id: DEV_PROXY_CONNECTION_ID,
      kind: 'anthropic',
      name: '开发代理',
      baseUrl: normalizeBaseUrl(this.env.ANTHROPIC_BASE_URL ?? defaultBaseUrl('anthropic')),
      // The SDK authenticates; SDK 1.8 sends the key as a bearer token.
      auth: { scheme: 'bearer' },
      keyState: envCredentialSource(this.env) ? 'saved' : 'none',
      extraHeaderNames: [],
      currency: 'USD',
      maxInFlight: 8,
      serverFallback: true,
      models: models.map((m) =>
        this.withProbed(DEV_PROXY_CONNECTION_ID, profileFor('anthropic', m)),
      ),
    };
  }

  private withProbed(connectionId: string, prof: ModelProfile): ModelProfile {
    const cap = this.probed.get(`${connectionId}/${prof.model}`);
    return cap ? { ...prof, capability: cap } : prof;
  }

  /** Every connection this proxy serves, without keys. */
  async connectionsPublic(): Promise<ConnectionPublic[]> {
    const devs = await this.devConnections();
    return [
      this.devProxyConnection(),
      ...devs.map((c) => {
        const conn = devConnectionPublic(c);
        return { ...conn, models: conn.models.map((p) => this.withProbed(conn.id, p)) };
      }),
    ];
  }

  private async resolve(
    connectionId: string,
  ): Promise<{ conn: ConnectionPublic; config?: DevConnectionConfig } | undefined> {
    if (connectionId === DEV_PROXY_CONNECTION_ID) return { conn: this.devProxyConnection() };
    const config = (await this.devConnections()).find((c) => c.id === connectionId);
    if (!config) return undefined;
    const conn = devConnectionPublic(config);
    return {
      conn: { ...conn, models: conn.models.map((p) => this.withProbed(conn.id, p)) },
      config,
    };
  }

  private sender(config: DevConnectionConfig, signal?: AbortSignal): AdapterSend {
    const f = this.opts.fetch ?? (globalThis.fetch as unknown as FetchLike);
    return fetchSender(f, devAuthHeaders(config), this.now, signal);
  }

  /** At most PROBE_CALLS_PER_MINUTE test and listing calls per minute. */
  allowProbe(): boolean {
    const now = this.now();
    this.probeTimes = this.probeTimes.filter((t) => now - t < 60_000);
    if (this.probeTimes.length >= PROBE_CALLS_PER_MINUTE) return false;
    this.probeTimes.push(now);
    return true;
  }

  /** POST /api/llm with an LlmCallSpec: a receipt with a problem code, never a key. */
  async completeSpec(spec: LlmCallSpec, signal?: AbortSignal): Promise<LlmCallResult> {
    const found = await this.resolve(spec.connectionId);
    if (!found || found.conn.kind !== spec.provider) {
      return notConfiguredResult(`unknown connection ${spec.connectionId}`);
    }
    const { conn, config } = found;
    const prof = conn.models.find((m) => m.model === spec.model);
    if (!prof) return notConfiguredResult(`model ${spec.model} is not enabled on ${conn.id}`);
    // The dev proxy answers in one piece; output is capped by the model and the guard.
    const call: LlmCallSpec = {
      ...spec,
      stream: false,
      output: {
        ...spec.output,
        maxTokens: Math.min(
          spec.output.maxTokens,
          this.maxTokensCap,
          prof.capability.maxOutputTokens,
        ),
      },
    };
    let result: LlmCallResult;
    if (!config) result = await this.completeViaSdk(call, conn, prof, signal);
    else {
      const adapter = adapterFor(conn.kind);
      const sent = await this.sender(config, signal)(adapter.build(call, conn, prof), {
        timeoutMs: call.timeoutMs,
      });
      result = sent.ok
        ? adapter.parse(sent.res.status, sent.res.body, sent.res.latencyMs, prof, sent.res.headers)
        : this.failed(adapter.classify(0, '', {}, sent.netError), sent.latencyMs);
      // Unpriced compatible models stay unpriced (undefined), never free.
      if (result.usage && prof.price) result.costUsd = costWithCard(prof.price, result.usage);
      if (result.error) result.error.message = redactConfig(result.error.message, config);
    }
    result = fillEstimatedInput(result, call);
    const u = result.usage;
    this.log(
      `[llm] ${spec.purpose || '-'} conn=${conn.id} model=${result.servedModel ?? spec.model} ` +
        `${result.ok ? (result.stopReason ?? '') : `problem=${result.problem ?? result.error?.cls ?? ''}`} ` +
        `in=${u?.inputTokens ?? 0} cache_read=${u?.cacheReadInputTokens ?? 0} ` +
        `cache_write=${u?.cacheCreationInputTokens ?? 0} out=${u?.outputTokens ?? 0} ` +
        `usd=${(result.costUsd ?? 0).toFixed(5)} ${result.latencyMs}ms`,
    );
    return result;
  }

  /** A failed receipt from an adapter verdict (status, retry hint and problem kept). */
  private failed(e: AdapterError, latencyMs: number): LlmCallResult {
    const out: LlmCallResult = { ok: false, error: { cls: e.cls, message: e.message }, latencyMs };
    if (out.error && e.httpStatus !== undefined) out.error.httpStatus = e.httpStatus;
    if (out.error && e.retryAfterMs !== undefined) out.error.retryAfterMs = e.retryAfterMs;
    if (e.problem) out.problem = e.problem;
    return out;
  }

  private async completeViaSdk(
    spec: LlmCallSpec,
    conn: ConnectionPublic,
    prof: ModelProfile,
    signal?: AbortSignal,
  ): Promise<LlmCallResult> {
    let sdk: { client: SdkClient; errors: SdkErrorClasses };
    try {
      sdk = await this.getSdk();
    } catch {
      return notConfiguredResult('model SDK could not be loaded');
    }
    const params = buildSpecMessageParams(spec, conn, prof);
    const t0 = this.now();
    try {
      // No SDK retries: retry decisions belong to the runner (ai_architecture.md 9.2), as on
      // the release path.
      const msg = await sdk.client.beta.messages.create(params, {
        signal,
        timeout: spec.timeoutMs,
        maxRetries: 0,
      });
      const rid = requestIdOf(msg);
      const result = anthropicAdapter.parse(
        200,
        JSON.stringify(msg),
        this.now() - t0,
        prof,
        rid ? { 'request-id': rid } : {},
      );
      if (result.usage) {
        const served = result.servedModel ?? spec.model;
        result.costUsd = priceOf(served)
          ? costUsd(served, result.usage)
          : costUsd(spec.model, result.usage);
      }
      return result;
    } catch (err) {
      const latencyMs = this.now() - t0;
      const E = sdk.errors;
      if (err instanceof E.APIUserAbortError) {
        return { ok: false, error: { cls: 'network', message: 'aborted' }, latencyMs };
      }
      const net: NetErrorKind | undefined =
        err instanceof E.APIConnectionTimeoutError
          ? 'timeout'
          : err instanceof E.APIConnectionError
            ? 'other'
            : undefined;
      if (net) return this.failed(anthropicAdapter.classify(0, '', {}, net), latencyMs);
      if (err instanceof E.APIError) {
        const e = err as { status?: number; error?: unknown; headers?: unknown };
        const verdict = anthropicAdapter.classify(
          e.status ?? 500,
          JSON.stringify(e.error ?? {}),
          sdkHeaders(e.headers),
        );
        if (verdict.problem === 'key_invalid') this.authFailedAt = this.now();
        return this.failed({ ...verdict, message: redact(verdict.message, this.env) }, latencyMs);
      }
      if (!envCredentialSource(this.env)) {
        this.statusCache = undefined;
        return { ...notConfiguredResult('no model credentials'), latencyMs };
      }
      return this.failed(
        { cls: 'server', problem: 'server_error', message: redact(String(err), this.env) },
        latencyMs,
      );
    }
  }

  /** GET /api/llm/models. */
  async listModels(connectionId: string): Promise<ModelListing | undefined> {
    const found = await this.resolve(connectionId);
    if (!found) return undefined;
    if (!found.config) {
      let sdk: { client: SdkClient; errors: SdkErrorClasses };
      try {
        sdk = await this.getSdk();
      } catch {
        return { connectionId, ok: false, models: [], problem: 'not_configured' };
      }
      return fetchModelListing(
        found.conn,
        sdkSender(sdk, this.now, envCredentialSource(this.env) !== null),
      );
    }
    return fetchModelListing(found.conn, this.sender(found.config));
  }

  /** POST /api/llm/test: the quick connection test; probed capabilities are kept in memory. */
  async testConnection(body: TestRequestBody): Promise<ConnectionTestReport | undefined> {
    const found = await this.resolve(body.connectionId);
    if (!found) return undefined;
    const { conn, config } = found;
    // The dev proxy connection tests the models its slots use unless the body names others.
    const slotModels = Object.values(this.tiers);
    const profiles = body.models
      ? conn.models.filter((m) => body.models?.includes(m.model))
      : config
        ? conn.models
        : conn.models.filter((m) => slotModels.includes(m.model));
    let send: AdapterSend;
    let hasKey: boolean;
    if (config) {
      send = this.sender(config);
      hasKey = config.apiKey !== undefined;
    } else {
      const sdk = await this.getSdk().catch(() => undefined);
      send = sdk
        ? sdkSender(sdk, this.now, envCredentialSource(this.env) !== null)
        : async () => ({ ok: true, res: { status: 401, body: '{}', headers: {}, latencyMs: 0 } });
      hasKey =
        sdk !== undefined &&
        (envCredentialSource(this.env) !== null || (await this.status()).available);
    }
    const report = await runConnectionTest(
      { conn, profiles, depth: body.depth, hasKey, testedAt: this.nowIso() },
      send,
    );
    for (const row of report.models) this.probed.set(`${conn.id}/${row.model}`, row.capability);
    return report;
  }
}
