// Provider-layer types: connections, model profiles, capability records, price cards, the
// adapter interface and the shapes the connection test and model listing return. Pure
// types; see docs/50_tech/llm_providers.md 3.1, 3.7, 5.6 and 7.2.

import type {
  BindingRole,
  LlmCallResult,
  LlmCallSpec,
  LlmUsage,
  OutputChannel,
  ProblemCode,
  ProviderErrorClass,
  ProviderId,
} from '../contracts';

export type ProviderKind = ProviderId;

/** Which local service a 'local' connection talks to (llm_providers.md 3.4). */
export type LocalFlavor = 'ollama' | 'lmstudio' | 'llamacpp' | 'generic';

/** Parameter class of a model; 'small' is below the 7B class (no role accepts it). */
export type SizeClass = 'small' | '7b' | '14b' | '30b' | 'cloud' | 'unknown';

export type SuitLabel = 'ok' | 'marginal' | 'not_recommended';

export interface ConnectionAuth {
  scheme: 'x_api_key' | 'bearer' | 'custom_header' | 'none';
  headerName?: string;
}

/** A connection as the game sees it: no key, only its state (llm_providers.md 3.1). */
export interface ConnectionPublic {
  /** Generated locally, conn_<8 random characters>; the dev proxy uses 'dev_proxy'. */
  id: string;
  kind: ProviderKind;
  flavor?: LocalFlavor;
  name: string;
  /** Normalised base address (no trailing slash). */
  baseUrl: string;
  auth: ConnectionAuth;
  keyState: 'none' | 'saved' | 'session_only';
  keyLast4?: string;
  /** Names of extra request headers; their values are stored like keys. */
  extraHeaderNames: string[];
  currency: 'USD' | 'CNY';
  maxInFlight: number;
  /** Anthropic only: ask for the server-side refusal fallback (AQ-16). */
  serverFallback?: boolean;
  /** Enabled models; also the guard's whitelist. */
  models: ModelProfile[];
  lastTest?: ConnectionTestReport;
}

/** Schema dialect flags a model needs on its json_schema channel (llm_providers.md 3.6). */
export interface DialectFlags {
  oneOfToAnyOf: boolean;
  stripConstraints: boolean;
}

/** What a model can do, from the known model table or the connection test probes. */
export interface Capability {
  /** Usable channels in priority order; the first is the runtime channel. */
  channels: OutputChannel[];
  /** How the tool carrier forces the submit call (only meaningful with tool_carrier). */
  toolChoice: 'named' | 'required' | 'auto';
  streaming: 'yes' | 'no';
  /** Whether a stream ends with usage. */
  streamUsage: 'yes' | 'no';
  promptCache: 'explicit' | 'automatic' | 'server_slot' | 'none';
  cacheUsageField: 'anthropic' | 'cached_tokens' | 'hit_miss' | 'none';
  thinking: 'adaptive' | 'reasoning_effort' | 'think_flag' | 'tag_strip' | 'none';
  effort: boolean;
  maxTokensParam: 'max_tokens' | 'max_completion_tokens' | 'num_predict';
  samplingParams: boolean;
  contextTokens: number;
  contextSource: 'known_table' | 'service_meta' | 'player' | 'default';
  /** Largest output cap the model accepts (the guard also caps at 16000). */
  maxOutputTokens: number;
  serverFallback: boolean;
  /** Whether a forced tool choice is accepted (Anthropic tool carrier). */
  forcedTool: boolean;
  dialect: DialectFlags;
  /** known_table, probe, or default (the unprobed generic record of the kind). */
  source: 'known_table' | 'probe' | 'default';
  probedAt?: string;
}

/** Per million tokens (llm_providers.md 3.1). */
export interface PriceCard {
  currency: 'USD' | 'CNY';
  input: number;
  cacheRead: number;
  cacheWrite5m?: number;
  cacheWrite1h?: number;
  output: number;
  longPromptThreshold?: number;
  longPrompt?: Omit<PriceCard, 'currency' | 'longPromptThreshold' | 'longPrompt'>;
}

export interface ModelProfile {
  model: string;
  displayName?: string;
  capability: Capability;
  price?: PriceCard;
  sizeClass?: SizeClass;
  labels?: Partial<Record<BindingRole, SuitLabel>>;
  /** Advanced slot setting for compatible and local services; never sent to Anthropic. */
  temperature?: number;
}

/** Response and request header bags use lower-case names. */
export type HeaderBag = Readonly<Record<string, string>>;

/** One HTTP request an adapter builds. Never carries a key: the sender adds auth headers. */
export interface AdapterHttpRequest {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
  /** How the sender should read the answer. */
  read: 'json' | 'sse' | 'ndjson';
}

export interface AdapterHttpResponse {
  status: number;
  body: string;
  headers: HeaderBag;
  latencyMs: number;
  firstByteMs?: number;
}

/** Transport-level failures before any status code (llm_providers.md 10.1 network rows). */
export type NetErrorKind = 'timeout' | 'dns' | 'refused' | 'reset' | 'tls' | 'cors' | 'other';

export type AdapterSendResult =
  | { ok: true; res: AdapterHttpResponse }
  | { ok: false; netError: NetErrorKind; latencyMs: number; message?: string };

/** Injected sender (desktop gateway, dev proxy, tests); adds auth and enforces timeouts. */
export type AdapterSend = (
  req: AdapterHttpRequest,
  opts: { timeoutMs: number },
) => Promise<AdapterSendResult>;

/** An adapter's verdict on a failed call. Defects (bad_request) carry no player problem. */
export interface AdapterError {
  cls: ProviderErrorClass;
  problem?: ProblemCode;
  httpStatus?: number;
  retryAfterMs?: number;
  /** Developer text, scrubbed and bounded. */
  message: string;
  providerRequestId?: string;
  /** The request parameter the service rejected, when the error names one. */
  unsupportedParam?: string;
}

/** Streaming parse state; adapters return a fresh copy on every step. */
export interface StreamState {
  provider: ProviderKind;
  channel: OutputChannel;
  /** Unconsumed partial line. */
  buffer: string;
  text: string;
  thinking: string;
  toolArgs: string;
  usage: LlmUsage;
  usageSeen: boolean;
  servedModel?: string;
  rawStop?: string;
  fallbackUsed: boolean;
  /** Completed Anthropic content blocks (thinking blocks are kept opaque). */
  blocks: unknown[];
  /** Index-keyed partial Anthropic blocks. */
  open: Record<number, Record<string, unknown>>;
  providerRequestId?: string;
  error?: AdapterError;
  done: boolean;
  timings?: { promptTokensPerSec?: number; genTokensPerSec?: number };
  /** Wire format once detected (local services: Ollama lines or server-sent events). */
  format?: 'sse' | 'ndjson';
}

export type StreamEvent =
  | { t: 'text'; text: string }
  | { t: 'thinking'; text: string }
  | { t: 'usage'; usage: LlmUsage }
  | { t: 'error'; error: AdapterError }
  | { t: 'done' };

export interface StreamStep {
  state: StreamState;
  events: StreamEvent[];
}

/** Probe requests of the connection test (llm_providers.md 5.6, 3.7). */
export type ProbeKind =
  | 'structured_json_schema'
  | 'structured_tool_named'
  | 'structured_tool_required'
  | 'structured_tool_auto'
  | 'structured_json_mode'
  | 'structured_prompt_only'
  | 'stream'
  | 'max_completion_tokens'
  | 'reasoning_effort'
  | 'sampling';

export interface ModelListingEntry {
  model: string;
  displayName?: string;
  contextTokens?: number;
  maxOutputTokens?: number;
  sizeClass?: SizeClass;
  /** Local services: whether the model is loaded right now (undefined when unknown). */
  loaded?: boolean;
  /** In the known model table. */
  known: boolean;
}

/** GET /api/llm/models and hk:llm.models (llm_providers.md 7.2). */
export interface ModelListing {
  connectionId: string;
  ok: boolean;
  models: ModelListingEntry[];
  /** Chat models the service lists that the known table does not (Anthropic only). */
  otherIds?: string[];
  nextCursor?: string;
  problem?: ProblemCode;
  message?: string;
}

/** Metadata a local or compatible service reports for one model. */
export interface ModelMeta {
  contextTokens?: number;
  sizeClass?: SizeClass;
  loaded?: boolean;
}

/**
 * A pure provider adapter: translation only. It sends nothing, reads no clock and holds no
 * key; the same spec and capability always give a byte-identical request
 * (llm_providers.md 3.1).
 */
export interface ProviderAdapter {
  readonly kind: ProviderKind;
  build(spec: LlmCallSpec, conn: ConnectionPublic, prof: ModelProfile): AdapterHttpRequest;
  parse(
    status: number,
    body: string,
    latencyMs: number,
    prof: ModelProfile,
    headers?: HeaderBag,
  ): LlmCallResult;
  /** A fresh stream state; `headers` are the response headers (request id). */
  startStream(prof: ModelProfile, headers?: HeaderBag): StreamState;
  parseStreamEvent(state: StreamState, chunk: string): StreamStep;
  /**
   * Close a stream (after the transport saw its end) into a receipt: flushes a last line
   * without a newline, estimates missing usage, and fails a stream cut before its end.
   */
  endStream(state: StreamState, latencyMs: number, prof: ModelProfile): LlmCallResult;
  classify(status: number, body: string, headers: HeaderBag, netError?: NetErrorKind): AdapterError;
  listModels(conn: ConnectionPublic, cursor?: string): AdapterHttpRequest;
  parseModels(status: number, body: string, conn: ConnectionPublic): ModelListing;
  modelMeta?(conn: ConnectionPublic, model: string): AdapterHttpRequest;
  parseModelMeta?(status: number, body: string): ModelMeta;
  probe(kind: ProbeKind, conn: ConnectionPublic, prof: ModelProfile): AdapterHttpRequest;
}

/**
 * Verdict words of the connection test (llm_providers.md 5.6): pass, fail, skipped, not
 * needed, and unsupported for an optional feature the service lacks (streaming), which is
 * not a failure of the connection.
 */
export type TestVerdict = 'pass' | 'fail' | 'skipped' | 'not_needed' | 'unsupported';

export type TestCheckId =
  | 'address'
  | 'reachable'
  | 'auth'
  | 'model'
  | 'structured'
  | 'stream'
  | 'params'
  | 'context';

export interface TestCheck {
  id: TestCheckId;
  verdict: TestVerdict;
  problem?: ProblemCode;
  model?: string;
  latencyMs?: number;
  /** Machine-readable facts for the report screen (no free text). */
  detail?: Record<string, string | number | boolean>;
}

export interface ModelTestRow {
  model: string;
  capability: Capability;
  firstByteMs?: number;
  latencyMs?: number;
  /** Roles whose minimum context this model does not reach (llm_providers.md 4.5). */
  lowContextRoles: BindingRole[];
}

/** POST /api/llm/test and hk:llm.test (llm_providers.md 5.6). */
export interface ConnectionTestReport {
  connectionId: string;
  depth: 'quick' | 'deep';
  ok: boolean;
  checks: TestCheck[];
  models: ModelTestRow[];
  problems: ProblemCode[];
  /** Probe requests sent (the cost note of the report screen). */
  requests: number;
  testedAt: string;
}
