// Anthropic Messages API adapter (docs/50_tech/llm_providers.md 3.2): system segments as
// cached text blocks (at most four breakpoints, one-hour entries before five-minute ones),
// history and the turn as messages, kernel notices as a mid-conversation system message,
// structured output through output_config.format (or a forced submit tool where a model
// accepts one), an explicit effort, no thinking or sampling parameters, the server-side
// refusal fallback for models that have it; parsing checks refusal before content, keeps
// thinking blocks opaque, and normalises usage. Pure: builds and parses, never sends.

import type {
  LlmCallResult,
  LlmCallSpec,
  LlmStopReason,
  LlmUsage,
  PromptSegment,
  SegmentCache,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';
import { knownModel, probeProfile, probeSpec } from './capabilities';
import { outputGuidance } from './guidance';
import {
  headerOf,
  netErrorProblem,
  readErrorBody,
  rejectedParam,
  retryAfterMs,
  scrubMessage,
  statusBaseline,
  withDetail,
} from './problems';
import { dialectFor, rewriteSchema } from './schema_dialect';
import {
  channelOf,
  copyState,
  EMPTY_TURN,
  estimatedUsage,
  failure,
  isObj,
  isSystemSegment,
  joinUrl,
  newStreamState,
  num,
  parseJsonText,
  recoverJsonText,
  STREAM_CUT,
  splitLines,
  sseData,
  str,
} from './shared';
import type {
  AdapterError,
  AdapterHttpRequest,
  ConnectionPublic,
  HeaderBag,
  ModelListing,
  ModelMeta,
  ModelProfile,
  NetErrorKind,
  ProbeKind,
  ProviderAdapter,
  StreamEvent,
  StreamState,
  StreamStep,
} from './types';

/** The Messages API version the pinned official SDK sends (checked by the dev proxy contract test). */
export const ANTHROPIC_VERSION = '2026-10-21';
export const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';
export const MAX_CACHE_BREAKPOINTS = 4;
/** The submit tool of the tool carrier channel. */
export const SUBMIT_TOOL = 'submit';
export const SUBMIT_DESCRIPTION = '提交本轮的决定。';

type CacheControl = { type: 'ephemeral'; ttl?: '1h' };
type TextBlock = { type: 'text'; text: string; cache_control?: CacheControl };

/**
 * Cache breakpoints in request order: at most four, and a one-hour entry never follows a
 * five-minute one (it is shortened instead).
 */
function cacheAssigner(): (c: SegmentCache | undefined) => CacheControl | undefined {
  let used = 0;
  let sawShort = false;
  return (c) => {
    if (!c || c === 'none' || used >= MAX_CACHE_BREAKPOINTS) return undefined;
    used++;
    if (c === 'long' && !sawShort) return { type: 'ephemeral', ttl: '1h' };
    sawShort = true;
    return { type: 'ephemeral' };
  };
}

function textBlock(text: string, cache: CacheControl | undefined): TextBlock {
  return cache ? { type: 'text', text, cache_control: cache } : { type: 'text', text };
}

type Msg = { role: 'user' | 'assistant' | 'system'; blocks: unknown[] };

function msgRole(s: PromptSegment): Msg['role'] {
  if (s.role === 'history_assistant') return 'assistant';
  if (s.role === 'operator') return 'system';
  return 'user';
}

/** Single plain text block: send a string, as the SDK path and the legacy proxy do. */
function content(blocks: unknown[]): unknown {
  if (blocks.length === 1) {
    const b = blocks[0];
    if (isObj(b) && b.type === 'text' && !('cache_control' in b)) return b.text;
  }
  return blocks;
}

function buildMessages(
  segs: readonly PromptSegment[],
  cache: ReturnType<typeof cacheAssigner>,
): Record<string, unknown>[] {
  const msgs: Msg[] = [];
  let sawTurn = false;
  for (const s of segs) {
    const role = msgRole(s);
    const isTurn = s.role === 'turn';
    if (isTurn) sawTurn = true;
    const text = isTurn && s.text.trim() === '' ? EMPTY_TURN : s.text;
    if (!isTurn && text.trim() === '') continue;
    const blocks: unknown[] = [];
    if (role === 'assistant' && s.opaque?.provider === 'anthropic') blocks.push(...s.opaque.blocks);
    blocks.push(textBlock(text, role === 'system' ? undefined : cache(s.cache)));
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.blocks.push(...blocks);
    else msgs.push({ role, blocks });
  }
  if (!sawTurn && !msgs.some((m) => m.role === 'user')) {
    msgs.push({ role: 'user', blocks: [textBlock(EMPTY_TURN, undefined)] });
  }
  return msgs.map((m) => ({ role: m.role, content: content(m.blocks) }));
}

/** The Messages API body for a spec (exported for the dev proxy contract test). */
export function anthropicBody(
  spec: LlmCallSpec,
  conn: ConnectionPublic,
  prof: ModelProfile,
): { body: Record<string, unknown>; betas: string[] } {
  const cap = prof.capability;
  const channel = channelOf(prof);
  const cache = cacheAssigner();
  const system: TextBlock[] = spec.segments
    .filter((s) => isSystemSegment(s) && s.text.trim() !== '')
    .map((s) => textBlock(s.text, cache(s.cache)));
  // Models that refuse a forced tool choice (Opus 5.5, Sonnet 5.5) refuse `any` as well, so
  // without forcedTool the carrier runs on `auto` with the "must call submit" guidance.
  const toolMode = channel === 'tool_carrier';
  const forced = toolMode && cap.forcedTool && cap.toolChoice === 'named';
  const required = toolMode && cap.forcedTool && cap.toolChoice === 'required';
  if (channel === 'prompt_only' || (toolMode && !forced && !required)) {
    system.push(
      textBlock(outputGuidance(spec.output.schema, { mustCallSubmit: toolMode }), undefined),
    );
  }
  const messages = buildMessages(
    spec.segments.filter((s) => !isSystemSegment(s)),
    cache,
  );
  const body: Record<string, unknown> = {
    model: spec.model,
    max_tokens: spec.output.maxTokens,
    system,
    messages,
  };
  const outputConfig: Record<string, unknown> = {};
  if (cap.effort && spec.effort) outputConfig.effort = spec.effort;
  const dialect = () =>
    rewriteSchema(spec.output.schema, dialectFor('anthropic'), { flags: cap.dialect }).schema;
  if (channel === 'json_schema') outputConfig.format = { type: 'json_schema', schema: dialect() };
  if (Object.keys(outputConfig).length > 0) body.output_config = outputConfig;
  if (toolMode) {
    body.tools = [{ name: SUBMIT_TOOL, description: SUBMIT_DESCRIPTION, input_schema: dialect() }];
    body.tool_choice = forced
      ? { type: 'tool', name: SUBMIT_TOOL }
      : required
        ? { type: 'any' }
        : { type: 'auto' };
  }
  const betas: string[] = [];
  if (cap.serverFallback && conn.serverFallback !== false) {
    body.fallbacks = 'default';
    betas.push(SERVER_FALLBACK_BETA);
  }
  if (spec.stream && cap.streaming === 'yes') body.stream = true;
  return { body, betas };
}

function headers(betas: readonly string[]): Record<string, string> {
  const h: Record<string, string> = {
    'content-type': 'application/json',
    'anthropic-version': ANTHROPIC_VERSION,
  };
  if (betas.length > 0) h['anthropic-beta'] = betas.join(',');
  return h;
}

/** Anthropic usage to the neutral usage (1 hour writes from the cache_creation detail). */
export function readAnthropicUsage(u: unknown, into: LlmUsage = { ...EMPTY_USAGE }): LlmUsage {
  if (!isObj(u)) return into;
  const out: LlmUsage = { ...into };
  if (typeof u.input_tokens === 'number') out.inputTokens = u.input_tokens;
  if (typeof u.output_tokens === 'number') out.outputTokens = u.output_tokens;
  if (typeof u.cache_read_input_tokens === 'number') {
    out.cacheReadInputTokens = u.cache_read_input_tokens;
  }
  if (typeof u.cache_creation_input_tokens === 'number') {
    out.cacheCreationInputTokens = u.cache_creation_input_tokens;
  }
  const cc = u.cache_creation;
  out.cacheCreation1hInputTokens = isObj(cc)
    ? num(cc.ephemeral_1h_input_tokens)
    : (out.cacheCreation1hInputTokens ?? 0);
  return out;
}

function stopOf(raw: string | undefined): LlmStopReason {
  switch (raw) {
    case 'end_turn':
    case 'stop_sequence':
    case 'tool_use':
      return 'end';
    case 'max_tokens':
    case 'model_context_window_exceeded':
      return 'max_tokens';
    case 'refusal':
      return 'refusal';
    default:
      return 'other';
  }
}

function fallbackOf(usage: unknown): { used: boolean; model?: string } {
  const its = isObj(usage) && Array.isArray(usage.iterations) ? usage.iterations : [];
  const fb = its.find((it) => isObj(it) && it.type === 'fallback_message');
  return fb && isObj(fb) ? { used: true, model: str(fb.model) } : { used: false };
}

const THINKING_TYPES = new Set(['thinking', 'redacted_thinking']);

/** Turn content blocks into the receipt (shared by parse and endStream). */
function receipt(
  blocks: readonly unknown[],
  raw: {
    stop?: string;
    usage: LlmUsage;
    model?: string;
    fallback: { used: boolean; model?: string };
    requestId?: string;
  },
  prof: ModelProfile,
  latencyMs: number,
): LlmCallResult {
  const channel = channelOf(prof);
  const base: Partial<LlmCallResult> = {
    usage: raw.usage,
    servedModel: raw.fallback.model ?? raw.model ?? prof.model,
    fallbackUsed: raw.fallback.used,
    channel,
    rawStopReason: raw.stop,
  };
  if (raw.requestId) base.providerRequestId = raw.requestId;
  if (raw.stop === 'refusal') {
    return failure({ cls: 'refusal', problem: 'refusal', message: 'model refused' }, latencyMs, {
      ...base,
      stopReason: 'refusal',
    });
  }
  const texts: string[] = [];
  let toolInput: unknown;
  const opaque: unknown[] = [];
  for (const b of blocks) {
    if (!isObj(b)) continue;
    if (b.type === 'text' && typeof b.text === 'string') texts.push(b.text);
    else if (b.type === 'tool_use' && b.name === SUBMIT_TOOL && toolInput === undefined) {
      toolInput = b.input;
    } else if (typeof b.type === 'string' && THINKING_TYPES.has(b.type)) opaque.push(b);
  }
  let text: string;
  let json: unknown;
  if (channel === 'tool_carrier') {
    // The carrier answers only through the submit call; a text reply is no answer.
    text = toolInput !== undefined ? JSON.stringify(toolInput) : texts.join('');
    json = toolInput !== undefined ? toolInput : null;
  } else {
    text = texts.join('');
    json = channel === 'json_schema' ? parseJsonText(text) : recoverJsonText(text);
  }
  const out: LlmCallResult = {
    ok: true,
    text,
    json,
    stopReason: stopOf(raw.stop),
    ...base,
    latencyMs,
  };
  if (opaque.length > 0)
    out.opaque = { provider: 'anthropic', model: out.servedModel, blocks: opaque };
  return out;
}

const UNSUPPORTED =
  /not supported|unsupported|does not support|not permitted|unknown (field|parameter)|extra inputs/i;
const CONTEXT =
  /prompt is too long|too many (input )?tokens|context (length|win)|exceeds? .*context/i;
const BALANCE = /credit balance|billing|insufficient (funds|credit|balance)/i;
const PARAMS = [
  'output_config',
  'json_schema',
  'format',
  'tool_choice',
  'tools',
  'effort',
  'thinking',
  'temperature',
  'top_p',
  'top_k',
  'fallbacks',
];

function paramIn(message: string, explicit?: string): string | undefined {
  return rejectedParam(message, PARAMS, explicit);
}

/** Anthropic stream error types mapped to the HTTP status they stand for. */
const ERROR_TYPE_STATUS: Record<string, number> = {
  invalid_request_error: 400,
  authentication_error: 401,
  billing_error: 402,
  permission_error: 403,
  not_found_error: 404,
  request_too_large: 413,
  rate_limit_error: 429,
  api_error: 500,
  timeout_error: 504,
  overloaded_error: 529,
};

function classifyAnthropic(
  status: number,
  body: string,
  headers: HeaderBag,
  netError?: NetErrorKind,
): AdapterError {
  if (netError) return netErrorProblem(netError);
  const eb = readErrorBody(body);
  const msg = eb.message ?? '';
  const done = (e: AdapterError) => withDetail(e, eb, headers, 'request-id');
  const at = { httpStatus: status };
  if (status === 529 || eb.type === 'overloaded_error') {
    return done({
      ...at,
      cls: 'overloaded',
      problem: 'overloaded',
      message: `HTTP ${status}`,
      retryAfterMs: retryAfterMs(headers),
    });
  }
  if (eb.type === 'billing_error' || (status === 400 && BALANCE.test(msg))) {
    return done({
      ...at,
      cls: 'quota',
      problem: 'insufficient_balance',
      message: `HTTP ${status}`,
    });
  }
  const base = statusBaseline(status, body, headers);
  if (base) return done(base);
  if (status === 413 || eb.type === 'request_too_large' || (status === 400 && CONTEXT.test(msg))) {
    return done({
      ...at,
      cls: 'context_too_long',
      problem: 'context_too_long',
      message: `HTTP ${status}`,
    });
  }
  if (status === 404) {
    return /\bmodel\b/i.test(msg)
      ? done({ ...at, cls: 'model_unavailable', problem: 'model_not_found', message: 'HTTP 404' })
      : done({ ...at, cls: 'network', problem: 'endpoint_wrong', message: 'HTTP 404' });
  }
  if (status >= 400 && status < 500) {
    const param = UNSUPPORTED.test(msg) ? paramIn(msg, eb.param) : undefined;
    const e: AdapterError = { ...at, cls: 'bad_request', message: `HTTP ${status}` };
    // unsupported_output is raised by the channel tracker on the third strike (3.5), not here.
    if (param) e.unsupportedParam = param;
    return done(e);
  }
  return done({ ...at, cls: 'network', problem: 'endpoint_wrong', message: 'not a JSON answer' });
}

function parseAnthropic(
  status: number,
  body: string,
  latencyMs: number,
  prof: ModelProfile,
  headersIn: HeaderBag = {},
): LlmCallResult {
  if (status < 200 || status >= 300) {
    return failure(classifyAnthropic(status, body, headersIn), latencyMs);
  }
  const msg = parseJsonText(body);
  if (isObj(msg) && msg.type === 'error') {
    const e = isObj(msg.error) ? msg.error : {};
    const statusFor = ERROR_TYPE_STATUS[str(e.type) ?? ''] ?? 500;
    return failure(classifyAnthropic(statusFor, body, headersIn), latencyMs);
  }
  if (!isObj(msg) || !Array.isArray(msg.content)) {
    return failure(classifyAnthropic(status, body, headersIn), latencyMs);
  }
  return receipt(
    msg.content,
    {
      stop: str(msg.stop_reason),
      usage: readAnthropicUsage(msg.usage),
      model: str(msg.model),
      fallback: fallbackOf(msg.usage),
      requestId: headerOf(headersIn, 'request-id'),
    },
    prof,
    latencyMs,
  );
}

function streamStep(state: StreamState, chunk: string): StreamStep {
  const s = copyState(state);
  const events: StreamEvent[] = [];
  const { lines, rest } = splitLines(s.buffer, chunk);
  s.buffer = rest;
  for (const line of lines) {
    const data = sseData(line);
    if (data === undefined || data === '') continue;
    const ev = parseJsonText(data);
    if (!isObj(ev)) continue;
    switch (ev.type) {
      case 'message_start': {
        const m = isObj(ev.message) ? ev.message : {};
        s.servedModel = str(m.model) ?? s.servedModel;
        s.usage = readAnthropicUsage(m.usage, s.usage);
        if (isObj(m.usage)) s.usageSeen = true;
        break;
      }
      case 'content_block_start': {
        const i = num(ev.index);
        s.open[i] = isObj(ev.content_block) ? { ...ev.content_block } : {};
        if (s.open[i]?.type === 'tool_use') (s.open[i] as Record<string, unknown>).partial = '';
        break;
      }
      case 'content_block_delta': {
        const i = num(ev.index);
        const blk = s.open[i] ?? {};
        const d = isObj(ev.delta) ? ev.delta : {};
        if (d.type === 'text_delta' && typeof d.text === 'string') {
          blk.text = `${str(blk.text) ?? ''}${d.text}`;
          if (s.channel !== 'tool_carrier') {
            s.text += d.text;
            events.push({ t: 'text', text: d.text });
          }
        } else if (d.type === 'thinking_delta' && typeof d.thinking === 'string') {
          blk.thinking = `${str(blk.thinking) ?? ''}${d.thinking}`;
          s.thinking += d.thinking;
          events.push({ t: 'thinking', text: d.thinking });
        } else if (d.type === 'signature_delta' && typeof d.signature === 'string') {
          blk.signature = `${str(blk.signature) ?? ''}${d.signature}`;
        } else if (d.type === 'input_json_delta' && typeof d.partial_json === 'string') {
          blk.partial = `${str(blk.partial) ?? ''}${d.partial_json}`;
          if (blk.name === SUBMIT_TOOL) {
            s.toolArgs += d.partial_json;
            if (s.channel === 'tool_carrier') events.push({ t: 'text', text: d.partial_json });
          }
        }
        s.open[i] = blk;
        break;
      }
      case 'content_block_stop': {
        const i = num(ev.index);
        const blk = s.open[i];
        if (blk) {
          if (blk.type === 'tool_use') {
            const { partial, ...rest } = blk;
            const input = parseJsonText(str(partial) || '{}');
            s.blocks.push({ ...rest, input: input ?? {} });
          } else s.blocks.push(blk);
          delete s.open[i];
        }
        break;
      }
      case 'message_delta': {
        const d = isObj(ev.delta) ? ev.delta : {};
        if (typeof d.stop_reason === 'string') s.rawStop = d.stop_reason;
        if (isObj(ev.usage)) {
          s.usage = readAnthropicUsage(ev.usage, s.usage);
          s.usageSeen = true;
          const fb = fallbackOf(ev.usage);
          if (fb.used) {
            s.fallbackUsed = true;
            if (fb.model) s.servedModel = fb.model;
          }
          events.push({ t: 'usage', usage: { ...s.usage } });
        }
        break;
      }
      case 'message_stop':
        s.done = true;
        events.push({ t: 'done' });
        break;
      case 'error': {
        const e = isObj(ev.error) ? ev.error : {};
        const statusFor = ERROR_TYPE_STATUS[str(e.type) ?? ''] ?? 500;
        s.error = classifyAnthropic(statusFor, JSON.stringify(ev), {});
        s.done = true;
        events.push({ t: 'error', error: s.error });
        break;
      }
      default:
        break;
    }
  }
  return { state: s, events };
}

function endAnthropic(state: StreamState, latencyMs: number, prof: ModelProfile): LlmCallResult {
  const flushed = state.buffer.trim() === '' ? state : streamStep(state, '\n').state;
  return endFlushed(flushed, latencyMs, prof);
}

function endFlushed(state: StreamState, latencyMs: number, prof: ModelProfile): LlmCallResult {
  if (state.error) return failure(state.error, latencyMs, { usage: state.usage });
  if (!state.done) return failure(STREAM_CUT, latencyMs, { usage: state.usage });
  const blocks = [...state.blocks, ...Object.values(state.open)];
  const result = receipt(
    blocks,
    {
      stop: state.rawStop,
      usage: state.usage,
      model: state.servedModel,
      fallback: {
        used: state.fallbackUsed,
        model: state.fallbackUsed ? state.servedModel : undefined,
      },
      requestId: state.providerRequestId,
    },
    prof,
    latencyMs,
  );
  if (!state.usageSeen) {
    result.usageEstimated = true;
    result.usage = estimatedUsage(state.text || state.toolArgs);
  }
  return result;
}

function listModelsRequest(conn: ConnectionPublic, cursor?: string): AdapterHttpRequest {
  const q = cursor ? `?limit=100&after_id=${encodeURIComponent(cursor)}` : '?limit=100';
  return {
    method: 'GET',
    url: joinUrl(conn.baseUrl, `/v1/models${q}`),
    headers: headers([]),
    read: 'json',
  };
}

function parseModelsAnthropic(status: number, body: string, conn: ConnectionPublic): ModelListing {
  const out: ModelListing = { connectionId: conn.id, ok: false, models: [] };
  const v = status >= 200 && status < 300 ? parseJsonText(body) : null;
  if (!isObj(v) || !Array.isArray(v.data)) {
    const e = classifyAnthropic(status, body, {});
    if (e.problem) out.problem = e.problem;
    out.message = scrubMessage(e.message);
    return out;
  }
  out.ok = true;
  const others: string[] = [];
  for (const m of v.data) {
    if (!isObj(m) || typeof m.id !== 'string') continue;
    const k = knownModel('anthropic', m.id);
    if (!k) {
      others.push(m.id);
      continue;
    }
    const entry = {
      model: m.id,
      displayName: str(m.display_name) ?? k.displayName,
      known: true,
    } as ModelListing['models'][number];
    if (typeof m.max_input_tokens === 'number') entry.contextTokens = m.max_input_tokens;
    if (typeof m.max_tokens === 'number') entry.maxOutputTokens = m.max_tokens;
    entry.sizeClass = 'cloud';
    out.models.push(entry);
  }
  if (others.length > 0) out.otherIds = others;
  if (v.has_more === true && typeof v.last_id === 'string') out.nextCursor = v.last_id;
  return out;
}

export const anthropicAdapter: ProviderAdapter = {
  kind: 'anthropic',
  build(spec, conn, prof) {
    const { body, betas } = anthropicBody(spec, conn, prof);
    return {
      method: 'POST',
      url: joinUrl(conn.baseUrl, '/v1/messages'),
      headers: headers(betas),
      body: JSON.stringify(body),
      read: body.stream === true ? 'sse' : 'json',
    };
  },
  parse: parseAnthropic,
  startStream(prof, headers) {
    return newStreamState('anthropic', channelOf(prof), headerOf(headers, 'request-id'));
  },
  parseStreamEvent: streamStep,
  endStream: endAnthropic,
  classify: classifyAnthropic,
  listModels: listModelsRequest,
  parseModels: parseModelsAnthropic,
  modelMeta(conn, model) {
    return {
      method: 'GET',
      url: joinUrl(conn.baseUrl, `/v1/models/${encodeURIComponent(model)}`),
      headers: headers([]),
      read: 'json',
    };
  },
  parseModelMeta(status, body): ModelMeta {
    const v = status >= 200 && status < 300 ? parseJsonText(body) : null;
    if (!isObj(v)) return {};
    const meta: ModelMeta = { sizeClass: 'cloud' };
    if (typeof v.max_input_tokens === 'number') meta.contextTokens = v.max_input_tokens;
    return meta;
  },
  probe(kind: ProbeKind, conn, prof) {
    const p = probeProfile(kind, prof);
    return anthropicAdapter.build(probeSpec(conn, p, kind), conn, p);
  },
};
