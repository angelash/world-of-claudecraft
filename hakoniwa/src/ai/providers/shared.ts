// Helpers the adapters share: segment grouping, JSON recovery, thinking-tag stripping,
// line splitting for event streams, usage estimates and receipt shapes. Pure.

import type {
  LlmCallResult,
  LlmCallSpec,
  LlmUsage,
  OutputChannel,
  PromptSegment,
  SegmentRole,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';
import { recoverJson } from '../output';
import { estimateTokens } from '../pricing';
import type { AdapterError, ModelProfile, StreamState } from './types';

/** The user message text when a turn is empty (providers reject empty content). */
export const EMPTY_TURN = '（无）';

export function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

export function str(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

/** Strip trailing slashes and surrounding blanks from a base address. */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

export function joinUrl(base: string, path: string): string {
  return `${normalizeBaseUrl(base)}${path.startsWith('/') ? path : `/${path}`}`;
}

/** The base address without a trailing /v1 (native endpoints of local services). */
export function rootUrl(base: string): string {
  return normalizeBaseUrl(base).replace(/\/v1$/, '');
}

const SYSTEM_ROLES: ReadonlySet<SegmentRole> = new Set(['rules', 'persona', 'private']);

export function isSystemSegment(s: PromptSegment): boolean {
  return SYSTEM_ROLES.has(s.role);
}

/** The runtime channel of a profile, with prompt_only as the floor. */
export function channelOf(prof: ModelProfile): OutputChannel {
  return prof.capability.channels[0] ?? 'prompt_only';
}

/** Parse JSON text strictly (null when it is not JSON). */
export function parseJsonText(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Lenient recovery for JSON mode and prompt-only answers (code fences, prose around). */
export function recoverJsonText(text: string): unknown {
  const v = recoverJson(null, text);
  return v === undefined ? null : v;
}

const THINK_BLOCK = /<(think|thinking|reasoning)>[\s\S]*?<\/\1>/gi;
const THINK_OPEN = /<(think|thinking|reasoning)>[\s\S]*$/i;

/** Remove thinking tags a model wrapped around its reasoning (llm_providers.md 3.3). */
export function stripThinking(text: string): string {
  return text.replace(THINK_BLOCK, '').replace(THINK_OPEN, '').trim();
}

/**
 * The visible part of a streamed text so far: complete thinking blocks removed, an open
 * thinking block held back, and a partial opening tag at the end held back too.
 */
export function visibleStreamText(raw: string): string {
  let t = raw.replace(THINK_BLOCK, '').replace(THINK_OPEN, '');
  const lt = t.lastIndexOf('<');
  if (lt >= 0 && /^<\/?[a-z]*$/i.test(t.slice(lt)) && t.length - lt <= 11) t = t.slice(0, lt);
  return t.replace(/^\s+/, '');
}

/** Split buffered stream text into complete lines and the unfinished rest. */
export function splitLines(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const all = (buffer + chunk).replace(/\r\n?/g, '\n');
  const parts = all.split('\n');
  const rest = parts.pop() ?? '';
  return { lines: parts, rest };
}

/** The payload of an SSE `data:` line (undefined for other lines). */
export function sseData(line: string): string | undefined {
  if (!line.startsWith('data:')) return undefined;
  return line.slice(5).replace(/^ /, '');
}

/** A fresh stream state. */
export function newStreamState(
  provider: StreamState['provider'],
  channel: OutputChannel,
  providerRequestId?: string,
): StreamState {
  const s: StreamState = {
    provider,
    channel,
    buffer: '',
    text: '',
    thinking: '',
    toolArgs: '',
    usage: { ...EMPTY_USAGE },
    usageSeen: false,
    fallbackUsed: false,
    blocks: [],
    open: {},
    done: false,
  };
  if (providerRequestId) s.providerRequestId = providerRequestId;
  return s;
}

/** The receipt of a stream that stopped before its end marker (a cut connection). */
export const STREAM_CUT: AdapterError = {
  cls: 'network',
  problem: 'network',
  message: 'stream ended before its end marker',
};

/** A copy of a stream state that a step may change freely. */
export function copyState(s: StreamState): StreamState {
  return {
    ...s,
    usage: { ...s.usage },
    blocks: [...s.blocks],
    open: Object.fromEntries(Object.entries(s.open).map(([k, v]) => [k, { ...v }])),
  };
}

/** A failed receipt from an adapter verdict. */
export function failure(
  err: AdapterError,
  latencyMs: number,
  extra: Partial<LlmCallResult> = {},
): LlmCallResult {
  const out: LlmCallResult = {
    ok: false,
    error: { cls: err.cls, message: err.message },
    latencyMs,
    ...extra,
  };
  if (err.httpStatus !== undefined && out.error) out.error.httpStatus = err.httpStatus;
  if (err.retryAfterMs !== undefined && out.error) out.error.retryAfterMs = err.retryAfterMs;
  if (err.unsupportedParam !== undefined && out.error) out.error.param = err.unsupportedParam;
  if (err.problem) out.problem = err.problem;
  if (err.providerRequestId) out.providerRequestId = err.providerRequestId;
  return out;
}

/** All prompt text of a spec (for input estimates). */
export function specText(spec: LlmCallSpec): string {
  return spec.segments.map((s) => s.text).join('\n');
}

/**
 * Fill the input side of an estimated usage from the spec (llm_providers.md 3.8: a stream
 * that ended without usage is estimated, and the ledger marks it so).
 */
export function fillEstimatedInput(result: LlmCallResult, spec: LlmCallSpec): LlmCallResult {
  if (!result.usageEstimated || !result.usage) return result;
  const usage: LlmUsage = { ...result.usage, inputTokens: estimateTokens(specText(spec)) };
  return { ...result, usage };
}

/** Output-only estimate when a service returns no usage. */
export function estimatedUsage(text: string): LlmUsage {
  return { ...EMPTY_USAGE, outputTokens: estimateTokens(text) };
}
