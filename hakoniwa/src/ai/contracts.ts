// Provider-neutral contracts of the AI layer. The kernel files AiRequestSpecs (core/ai_port);
// the AiRunner turns each into one LlmRequest, a provider answers with an LlmResult or an
// LlmFailure, and the runner resolves the kernel request with a proposal or a decline.
// Nothing here talks to a network or reads a clock: transports and clocks are injected.
// See docs/50_tech/ai_architecture.md 2.3.1 and 2.4.

/** Model tier. The proxy maps tiers to concrete models (see pricing.ts DEFAULT_TIER_MODELS). */
export type ModelTier = 'top' | 'mid' | 'low';

export const TIER_ORDER: readonly ModelTier[] = ['top', 'mid', 'low'];

/** Thinking effort hint; sent as output_config.effort by the Anthropic proxy. */
export type Effort = 'low' | 'medium' | 'high';

/** Prompt cache lifetime hint for the stable prefix (5 minutes or 1 hour). */
export type CacheTtl = '5m' | '1h';

/** A JSON Schema object (structured outputs subset: every object sets additionalProperties false). */
export type JsonSchema = { [key: string]: unknown };

/** One model call in provider-neutral form. */
export interface LlmRequest {
  /** Kernel request id, for logs and audit only (never part of the prompt). */
  requestId?: string;
  tier: ModelTier;
  /** Stable rules text, byte-identical for every agent of a role: first cache breakpoint. */
  system: string;
  /** Per-agent stable text (persona, voice), placed after system: second cache breakpoint. */
  stable?: string;
  /** Volatile per-request text (situation, memory, menu, player words). Never cached. */
  context: string;
  /** Output JSON Schema (structured outputs). */
  schema: JsonSchema;
  /** Output cap, thinking included. */
  maxTokens: number;
  /** Role plus purpose, for example 'npc.daily/morning_plan'. */
  purpose: string;
  effort?: Effort;
  cacheTtl?: CacheTtl;
}

export interface LlmUsage {
  /** uncached input tokens */
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
  /** all cache writes (5 minute and 1 hour) */
  cacheCreationInputTokens: number;
  /** the part of cacheCreationInputTokens written with the 1 hour lifetime */
  cacheCreation1hInputTokens?: number;
}

/** A model answered (the answer may still fail validation). */
export interface LlmResult {
  ok: true;
  /** Parsed JSON output, or null when the text is not valid JSON. */
  json: unknown;
  /** Raw text output. */
  text: string;
  usage: LlmUsage;
  /** Model that served the answer (may differ from the requested one under server-side fallback). */
  model: string;
  stopReason: string;
  /** Cost in US dollars as computed by the provider (0 when unknown). */
  costUsd: number;
  latencyMs: number;
}

export type LlmErrorCode =
  | 'model_off'
  | 'no_proxy'
  | 'no_credentials'
  | 'auth_failed'
  | 'rate_limited'
  | 'overloaded'
  | 'server_error'
  | 'timeout'
  | 'network'
  | 'aborted'
  | 'bad_request'
  | 'refusal'
  | 'bad_response'
  | 'mock_exhausted';

/** No usable answer. A refusal can still carry usage and cost. */
export interface LlmFailure {
  ok: false;
  error: LlmErrorCode;
  message: string;
  retryAfterMs?: number;
  usage?: LlmUsage;
  costUsd?: number;
  model?: string;
  stopReason?: string;
  latencyMs?: number;
}

export type LlmOutcome = LlmResult | LlmFailure;

/** Minimal abort signal shape (satisfied by AbortSignal in Node and browsers). */
export interface AbortSignalLike {
  readonly aborted: boolean;
  addEventListener(type: 'abort', listener: () => void): void;
}

export interface LlmProvider {
  readonly id: string;
  /** False when this provider cannot answer right now; the runner then declines at once. */
  available(): boolean;
  /** Should resolve (not reject) with an LlmFailure on errors. */
  complete(req: LlmRequest, signal?: AbortSignalLike): Promise<LlmOutcome>;
  /** Tier to model mapping as the provider knows it (for cost estimates). */
  tierModels?(): Partial<Record<ModelTier, string>>;
}

/** Real-time clock in milliseconds, injected by the host (tests use a fake). */
export interface Clock {
  now(): number;
}

/** Timer functions, injected so tests can drive timeouts by hand. */
export interface Timers {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

/** Minimal HTTP response shape (satisfied by fetch's Response). */
export interface HttpResponseLike {
  readonly status: number;
  json(): Promise<unknown>;
}

export interface HttpRequestInit {
  method: 'GET' | 'POST' | 'PUT';
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignalLike;
}

/** Injected HTTP transport (defaults to the global fetch where one is used). */
export type HttpTransport = (url: string, init: HttpRequestInit) => Promise<HttpResponseLike>;

/** The one output shape every role answers with (see prompt.ts buildOutputSchema). */
export interface AiProposalOutput {
  commands: { kind: string; data: unknown }[];
  speech?: string;
  thought?: string;
}

export const EMPTY_USAGE: LlmUsage = Object.freeze({
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
  cacheCreationInputTokens: 0,
});

// ---------------------------------------------------------------------------
// Player-configured model contract (docs/50_tech/llm_providers.md 3.1, 10.1 and
// docs/50_tech/ai_architecture.md 2.3.1). The AI layer emits one LlmCallSpec per call; a
// pure provider adapter (src/ai/providers/) turns it into a provider request and turns the
// provider answer back into an LlmCallResult. LlmRequest above stays the runner's legacy
// shape until routing lands (callSpecFromRequest in src/ai/providers/call_spec.ts bridges).

/** Provider kinds a connection can have; 'none' is the no-model provider. */
export type ProviderId = 'none' | 'anthropic' | 'openai_compat' | 'local';

export const PROVIDER_IDS: readonly ProviderId[] = ['none', 'anthropic', 'openai_compat', 'local'];

/** Model slot (high, mid, low); the slot names are the legacy tier names. */
export type Slot = ModelTier;

/** The six roles a player binds models to (D-067; llm_providers.md 4.1). */
export type BindingRole =
  | 'goddess'
  | 'core_npc'
  | 'present_npc'
  | 'offstage_batch'
  | 'ruler_general'
  | 'court_reviewer';

export const BINDING_ROLES: readonly BindingRole[] = [
  'goddess',
  'core_npc',
  'present_npc',
  'offstage_batch',
  'ruler_general',
  'court_reviewer',
];

/** Structured output channels in fallback order (llm_providers.md 3.5). */
export type OutputChannel = 'json_schema' | 'tool_carrier' | 'json_mode' | 'prompt_only';

export const OUTPUT_CHANNELS: readonly OutputChannel[] = [
  'json_schema',
  'tool_carrier',
  'json_mode',
  'prompt_only',
];

/** Neutral prompt segment roles (ai_architecture.md 7.1); a spec lists them in sending order. */
export type SegmentRole =
  | 'rules'
  | 'persona'
  | 'private'
  | 'history_user'
  | 'history_assistant'
  | 'operator'
  | 'player_data'
  | 'turn';

/** Cache hint: short is about 5 minutes, long about 1 hour; adapters honour it by capability. */
export type SegmentCache = 'none' | 'short' | 'long';

/**
 * Provider-specific opaque blocks kept with a session segment, for example Anthropic
 * thinking blocks with their signatures (AQ-11). Sent back verbatim within the same
 * segment to the same provider; never shown, never parsed.
 */
export interface ProviderBlocks {
  provider: ProviderId;
  model?: string;
  blocks: readonly unknown[];
}

export interface PromptSegment {
  role: SegmentRole;
  text: string;
  cache?: SegmentCache;
  /** Only on history_assistant segments: the provider blocks returned with that answer. */
  opaque?: ProviderBlocks;
}

/** One model call in neutral form (ai_architecture.md 2.3.1 plus llm_providers.md 3.1). */
export interface LlmCallSpec {
  /** Same as the kernel request id, with an attempt suffix. */
  requestId: string;
  provider: ProviderId;
  /** The player's connection (never an address or a header). */
  connectionId: string;
  slot: Slot;
  bindingRole: BindingRole;
  model: string;
  /** Neutral segments; their order is the sending order. */
  segments: PromptSegment[];
  output: {
    schemaId: string;
    schemaVersion?: string;
    schema: JsonSchema;
    maxTokens: number;
    /**
     * Context values the local variant writes into its schema as constants (llm_providers.md
     * 3.4 item 3), by dot path ('commands.[].data' style); other dialects ignore them.
     */
    constants?: Record<string, string | number | boolean>;
  };
  effort?: Effort;
  /** Only interactive kinds stream, and only where the capability allows it. */
  stream?: boolean;
  timeoutMs: number;
  /** What the budgeter reserved for this call; the gateway guard re-checks caps with it. */
  reserve: { usd: number; tokens: number };
  /** Decision kind and purpose, for logs and the ledger only (never part of the prompt). */
  purpose?: string;
}

/** Scheduling and health side of an error (ai_architecture.md 2.3.1). */
export type ProviderErrorClass =
  | 'timeout'
  | 'rate_limited'
  | 'overloaded'
  | 'server'
  | 'bad_request'
  | 'context_too_long'
  | 'auth'
  | 'quota'
  | 'model_unavailable'
  | 'network'
  | 'refusal';

/** Player-facing problem codes (llm_providers.md 10.1); see src/ai/providers/problems.ts. */
export type ProblemCode =
  | 'key_invalid'
  | 'permission_denied'
  | 'insufficient_balance'
  | 'model_not_found'
  | 'model_not_loaded'
  | 'timeout'
  | 'context_too_long'
  | 'rate_limited'
  | 'overloaded'
  | 'server_error'
  | 'network'
  | 'tls_error'
  | 'endpoint_wrong'
  | 'cors_blocked'
  | 'refusal'
  | 'unsupported_output'
  | 'bad_output'
  | 'keychain_unavailable'
  | 'not_configured'
  | 'cap_reached';

export type LlmStopReason = 'end' | 'max_tokens' | 'refusal' | 'other';

export interface LlmCallError {
  cls: ProviderErrorClass;
  httpStatus?: number;
  retryAfterMs?: number;
  /** The request parameter the service rejected as unsupported, when it names one. */
  param?: string;
  /** Developer text (English), scrubbed of credentials and bounded; never shown to players. */
  message: string;
}

/** Throughput a local service reported with the answer (llm_providers.md 3.4 item 6). */
export interface LlmTimings {
  promptTokensPerSec?: number;
  genTokensPerSec?: number;
}

/** The neutral answer every adapter parses into (ai_architecture.md 2.3.1, llm_providers.md 7.3). */
export interface LlmCallResult {
  ok: boolean;
  /** Raw structured text (the JSON object text, thinking and code fences removed). */
  text?: string;
  /** Parsed JSON, or null when the text is not valid JSON. */
  json?: unknown;
  stopReason?: LlmStopReason;
  /** The provider's own stop reason, for the ledger. */
  rawStopReason?: string;
  usage?: LlmUsage;
  /** True when usage was estimated (a stream that ended without usage). */
  usageEstimated?: boolean;
  /** The model that actually answered (server-side fallback may change it). */
  servedModel?: string;
  fallbackUsed?: boolean;
  providerRequestId?: string;
  /** The output channel the request used. */
  channel?: OutputChannel;
  /** Opaque provider blocks to keep with the session segment (thinking with signatures). */
  opaque?: ProviderBlocks;
  /** Settled by the spend book from the connection's price card; adapters never set it. */
  costUsd?: number;
  timings?: LlmTimings;
  error?: LlmCallError;
  problem?: ProblemCode;
  latencyMs: number;
  firstByteMs?: number;
}

/** One message on the call port (llm_providers.md 7.3). */
export type LlmPortMessage =
  | { t: 'delta'; text: string }
  | { t: 'done'; result: LlmCallResult }
  | { t: 'error'; result: LlmCallResult };

/**
 * Sends a call spec and returns the receipt; streams body deltas (no thinking) to onDelta.
 * Implementations: desktop IPC, the dev proxy, local HTTP for the web demo (llm_providers.md
 * 2.2). Should resolve, not reject, with ok false and a problem code on failure.
 */
export interface LlmTransport {
  send(
    spec: LlmCallSpec,
    opts?: { signal?: AbortSignalLike; onDelta?: (text: string) => void },
  ): Promise<LlmCallResult>;
}
