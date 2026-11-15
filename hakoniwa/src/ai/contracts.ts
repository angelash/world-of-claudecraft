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
