// OpenAI-compatible /chat/completions adapter (docs/50_tech/llm_providers.md 3.3), also the
// body of the local variant for LM Studio, llama.cpp and other compatible local services
// (3.4). One system message (rules, persona and private parts under fixed headers), the
// history as alternating messages, kernel notices folded into the last user message, four
// output channels (strict json_schema, a single submit function, JSON mode, prompt only),
// the output cap name the probe found, reasoning effort only where accepted, sampling only
// when set; parsing reads refusals, tool call arguments, cached-token usage in its common
// shapes, and strips thinking tags. Pure: builds and parses, never sends.

import type {
  LlmCallResult,
  LlmCallSpec,
  LlmStopReason,
  LlmUsage,
  OutputChannel,
  PromptSegment,
} from '../contracts';
import { EMPTY_USAGE } from '../contracts';
import { probeProfile, probeSpec } from './capabilities';
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
import { rewriteSchema } from './schema_dialect';
import {
  copyState,
  EMPTY_TURN,
  estimatedUsage,
  failure,
  isObj,
  joinUrl,
  newStreamState,
  num,
  parseJsonText,
  recoverJsonText,
  STREAM_CUT,
  splitLines,
  sseData,
  str,
  stripThinking,
  visibleStreamText,
} from './shared';
import type {
  AdapterError,
  AdapterHttpRequest,
  ConnectionPublic,
  HeaderBag,
  ModelListing,
  ModelProfile,
  NetErrorKind,
  ProbeKind,
  ProviderAdapter,
  StreamEvent,
  StreamState,
  StreamStep,
} from './types';

export type ChatVariant = 'cloud' | 'local';

/** Fixed headers that separate the system parts and the kernel notice. */
export const SECTION_HEADERS = {
  rules: '【规则】',
  persona: '【人设】',
  private: '【私密】',
  operator: '【内核通知】',
} as const;

export const SUBMIT_FUNCTION = 'submit';
export const SUBMIT_FUNCTION_DESCRIPTION = '提交本轮的决定。';
/** Local variant defaults (llm_providers.md 3.4 item 4). */
export const LOCAL_TEMPERATURE = 0.6;

/** The channel the local variant actually uses: it never sends native tools. */
export function chatChannel(prof: ModelProfile, variant: ChatVariant): OutputChannel {
  const chans = prof.capability.channels.filter((c) => variant === 'cloud' || c !== 'tool_carrier');
  return chans[0] ?? 'prompt_only';
}

/** Schema name for response_format (letters, digits, underscores and dashes, at most 64). */
export function schemaName(id: string): string {
  const n = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 64);
  return n === '' ? 'output' : n;
}

function systemText(segs: readonly PromptSegment[]): string {
  const parts: string[] = [];
  for (const s of segs) {
    if (s.text.trim() === '') continue;
    if (s.role === 'rules' || s.role === 'persona' || s.role === 'private') {
      parts.push(`${SECTION_HEADERS[s.role]}\n${s.text}`);
    }
  }
  return parts.join('\n\n');
}

type ChatMsg = { role: 'system' | 'user' | 'assistant'; content: string };

function chatMessages(segs: readonly PromptSegment[], system: string): ChatMsg[] {
  const msgs: ChatMsg[] = [];
  if (system !== '') msgs.push({ role: 'system', content: system });
  let sawTurn = false;
  for (const s of segs) {
    if (s.role === 'rules' || s.role === 'persona' || s.role === 'private') continue;
    const isTurn = s.role === 'turn';
    if (isTurn) sawTurn = true;
    let text = isTurn && s.text.trim() === '' ? EMPTY_TURN : s.text;
    if (!isTurn && text.trim() === '') continue;
    const role: ChatMsg['role'] = s.role === 'history_assistant' ? 'assistant' : 'user';
    if (s.role === 'operator') text = `${SECTION_HEADERS.operator}\n${text}`;
    const last = msgs[msgs.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${text}`;
    else msgs.push({ role, content: text });
  }
  if (!sawTurn && !msgs.some((m) => m.role === 'user'))
    msgs.push({ role: 'user', content: EMPTY_TURN });
  return msgs;
}

/** The parts of a chat request both the cloud and the local variant share. */
export function chatParts(
  spec: LlmCallSpec,
  prof: ModelProfile,
  variant: ChatVariant,
): { messages: ChatMsg[]; channel: OutputChannel; schema?: Record<string, unknown> } {
  const cap = prof.capability;
  const channel = chatChannel(prof, variant);
  const local = variant === 'local';
  const toolAuto = channel === 'tool_carrier' && cap.toolChoice === 'auto';
  let system = systemText(spec.segments);
  if (local || channel === 'json_mode' || channel === 'prompt_only' || toolAuto) {
    const g = outputGuidance(spec.output.schema, { local, mustCallSubmit: toolAuto });
    system = system === '' ? g : `${system}\n\n${g}`;
  }
  const out: { messages: ChatMsg[]; channel: OutputChannel; schema?: Record<string, unknown> } = {
    messages: chatMessages(spec.segments, system),
    channel,
  };
  if (channel === 'json_schema' || channel === 'tool_carrier') {
    out.schema = rewriteSchema(
      spec.output.schema,
      local ? 'local' : 'openai_strict',
      local && spec.output.constants ? { constants: spec.output.constants } : {},
    ).schema;
  }
  return out;
}

/** The /chat/completions body (exported for the local adapter and the golden tests). */
export function chatBody(
  spec: LlmCallSpec,
  prof: ModelProfile,
  variant: ChatVariant,
): Record<string, unknown> {
  const cap = prof.capability;
  const { messages, channel, schema } = chatParts(spec, prof, variant);
  const body: Record<string, unknown> = { model: spec.model, messages };
  const capName =
    cap.maxTokensParam === 'max_completion_tokens' ? 'max_completion_tokens' : 'max_tokens';
  body[capName] = spec.output.maxTokens;
  if (channel === 'json_schema') {
    body.response_format = {
      type: 'json_schema',
      json_schema: { name: schemaName(spec.output.schemaId), schema, strict: true },
    };
  } else if (channel === 'tool_carrier') {
    body.tools = [
      {
        type: 'function',
        function: {
          name: SUBMIT_FUNCTION,
          description: SUBMIT_FUNCTION_DESCRIPTION,
          parameters: schema,
        },
      },
    ];
    body.tool_choice =
      cap.toolChoice === 'named'
        ? { type: 'function', function: { name: SUBMIT_FUNCTION } }
        : cap.toolChoice === 'required'
          ? 'required'
          : 'auto';
  } else if (channel === 'json_mode') {
    body.response_format = { type: 'json_object' };
  }
  if (cap.thinking === 'reasoning_effort') {
    if (variant === 'local') body.reasoning_effort = 'low';
    else if (spec.effort) body.reasoning_effort = spec.effort;
  }
  if (cap.samplingParams) {
    if (variant === 'local') {
      body.temperature = prof.temperature ?? LOCAL_TEMPERATURE;
      body.presence_penalty = 0;
    } else if (prof.temperature !== undefined) body.temperature = prof.temperature;
  }
  if (spec.stream && cap.streaming === 'yes') {
    body.stream = true;
    body.stream_options = { include_usage: true };
  }
  return body;
}

export function chatRequest(
  spec: LlmCallSpec,
  conn: ConnectionPublic,
  prof: ModelProfile,
  variant: ChatVariant,
): AdapterHttpRequest {
  const body = chatBody(spec, prof, variant);
  return {
    method: 'POST',
    url: joinUrl(conn.baseUrl, '/chat/completions'),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    read: body.stream === true ? 'sse' : 'json',
  };
}

/** Usage in the compatible shapes (llm_providers.md 3.8). */
export function readCompatUsage(u: unknown): { usage: LlmUsage; seen: boolean } {
  if (!isObj(u)) return { usage: { ...EMPTY_USAGE }, seen: false };
  const prompt = num(u.prompt_tokens);
  const output = num(u.completion_tokens);
  const usage: LlmUsage = { ...EMPTY_USAGE, outputTokens: output };
  const details = isObj(u.prompt_tokens_details) ? u.prompt_tokens_details : {};
  if (
    typeof u.prompt_cache_hit_tokens === 'number' ||
    typeof u.prompt_cache_miss_tokens === 'number'
  ) {
    usage.cacheReadInputTokens = num(u.prompt_cache_hit_tokens);
    usage.inputTokens = num(u.prompt_cache_miss_tokens);
  } else if (typeof details.cached_tokens === 'number') {
    usage.cacheReadInputTokens = details.cached_tokens;
    usage.inputTokens = Math.max(0, prompt - details.cached_tokens);
  } else usage.inputTokens = prompt;
  return { usage, seen: true };
}

function stopOf(raw: string | undefined): LlmStopReason {
  switch (raw) {
    case 'stop':
    case 'tool_calls':
    case 'function_call':
      return 'end';
    case 'length':
      return 'max_tokens';
    case 'content_filter':
      return 'refusal';
    default:
      return 'other';
  }
}

function contentText(c: unknown): string {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) {
    return c.map((p) => (isObj(p) && typeof p.text === 'string' ? p.text : '')).join('');
  }
  return '';
}

/** llama.cpp timings (tokens per second). */
function timingsOf(v: unknown): LlmCallResult['timings'] | undefined {
  if (!isObj(v)) return undefined;
  const t: NonNullable<LlmCallResult['timings']> = {};
  if (typeof v.prompt_per_second === 'number') t.promptTokensPerSec = v.prompt_per_second;
  if (typeof v.predicted_per_second === 'number') t.genTokensPerSec = v.predicted_per_second;
  return Object.keys(t).length > 0 ? t : undefined;
}

interface ChatAnswer {
  rawText: string;
  toolArgs?: string;
  refusal: boolean;
  stop?: string;
  usage: LlmUsage;
  usageSeen: boolean;
  model?: string;
  requestId?: string;
  timings?: LlmCallResult['timings'];
}

function answerReceipt(
  a: ChatAnswer,
  prof: ModelProfile,
  variant: ChatVariant,
  latencyMs: number,
): LlmCallResult {
  const channel = chatChannel(prof, variant);
  const base: Partial<LlmCallResult> = {
    usage: a.usage,
    servedModel: a.model ?? prof.model,
    channel,
    rawStopReason: a.stop,
  };
  if (!a.usageSeen) base.usageEstimated = true;
  if (a.requestId) base.providerRequestId = a.requestId;
  if (a.timings) base.timings = a.timings;
  if (a.refusal || a.stop === 'content_filter') {
    return failure({ cls: 'refusal', problem: 'refusal', message: 'model refused' }, latencyMs, {
      ...base,
      stopReason: 'refusal',
    });
  }
  const carrier = channel === 'tool_carrier' && a.toolArgs !== undefined;
  const text = carrier ? (a.toolArgs as string).trim() : stripThinking(a.rawText);
  // The carrier answers only through the submit call; a text reply is no answer.
  const json =
    channel === 'tool_carrier'
      ? carrier
        ? parseJsonText(text)
        : null
      : channel === 'json_schema'
        ? parseJsonText(text)
        : recoverJsonText(text);
  return { ok: true, text, json, stopReason: stopOf(a.stop), ...base, latencyMs };
}

const QUOTA = /insufficient_quota|quota|balance|billing|credit|余额|欠费|额度/i;
const CONTEXT =
  /context_length_exceeded|context length|maximum context|context win|too many tokens|prompt is too long|上下文/i;
const UNSUPPORTED =
  /unsupported|not supported|does not support|unrecognized|unknown (field|parameter|argument)|not allowed|extra (inputs|fields)|invalid parameter/i;
const MODEL = /\bmodel\b|模型/i;
const KNOWN_PARAMS = [
  'response_format',
  'json_schema',
  'tool_choice',
  'tools',
  'reasoning_effort',
  'max_completion_tokens',
  'max_tokens',
  'temperature',
  'presence_penalty',
  'stream_options',
];

function paramOf(message: string, explicit?: string): string | undefined {
  return rejectedParam(message, KNOWN_PARAMS, explicit);
}

/** The compatible classifier (llm_providers.md 10.1, OpenAI-compatible column). */
export function classifyCompat(
  status: number,
  body: string,
  headers: HeaderBag,
  netError?: NetErrorKind,
): AdapterError {
  if (netError) return netErrorProblem(netError);
  const eb = readErrorBody(body);
  const msg = eb.message ?? '';
  const codeText = `${eb.code ?? ''} ${eb.type ?? ''} ${msg}`;
  const done = (e: AdapterError) => withDetail(e, eb, headers, 'x-request-id');
  const at = { httpStatus: status };
  if (status === 429 && QUOTA.test(codeText)) {
    return done({ ...at, cls: 'quota', problem: 'insufficient_balance', message: 'HTTP 429' });
  }
  if (status === 503) {
    return done({
      ...at,
      cls: 'overloaded',
      problem: 'overloaded',
      message: 'HTTP 503',
      retryAfterMs: retryAfterMs(headers),
    });
  }
  const base = statusBaseline(status, body, headers);
  if (base) return done(base);
  if (status === 413 || ((status === 400 || status === 422) && CONTEXT.test(codeText))) {
    return done({
      ...at,
      cls: 'context_too_long',
      problem: 'context_too_long',
      message: `HTTP ${status}`,
    });
  }
  if (status === 404) {
    return eb.code === 'model_not_found' || MODEL.test(msg)
      ? done({ ...at, cls: 'model_unavailable', problem: 'model_not_found', message: 'HTTP 404' })
      : done({ ...at, cls: 'network', problem: 'endpoint_wrong', message: 'HTTP 404' });
  }
  if (status >= 400 && status < 500) {
    const flagged =
      eb.code === 'unsupported_parameter' ||
      eb.code === 'unsupported_value' ||
      UNSUPPORTED.test(msg);
    const param = flagged ? paramOf(msg, eb.param) : undefined;
    const e: AdapterError = { ...at, cls: 'bad_request', message: `HTTP ${status}` };
    // unsupported_output is raised by the channel tracker on the third strike (3.5), not here.
    if (param) e.unsupportedParam = param;
    return done(e);
  }
  return done({ ...at, cls: 'network', problem: 'endpoint_wrong', message: 'not a JSON answer' });
}

export function parseChat(
  status: number,
  body: string,
  latencyMs: number,
  prof: ModelProfile,
  headers: HeaderBag,
  variant: ChatVariant,
  classify: ProviderAdapter['classify'],
): LlmCallResult {
  if (status < 200 || status >= 300) return failure(classify(status, body, headers), latencyMs);
  const v = parseJsonText(body);
  if (!isObj(v)) return failure(classify(status, body, headers), latencyMs);
  if (v.error !== undefined && !Array.isArray(v.choices)) {
    // An error inside a 2xx answer: classify by its numeric code when it has one.
    const e = isObj(v.error) ? v.error : {};
    const code = typeof e.code === 'number' && e.code >= 400 ? e.code : 500;
    return failure(classify(code, body, headers), latencyMs);
  }
  if (!Array.isArray(v.choices)) {
    return failure(
      { cls: 'network', problem: 'endpoint_wrong', message: 'no choices in the answer' },
      latencyMs,
    );
  }
  const choice = Array.isArray(v.choices) && isObj(v.choices[0]) ? v.choices[0] : {};
  const msg = isObj(choice.message) ? choice.message : {};
  const calls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const call = calls.find((c) => isObj(c) && isObj(c.function));
  const fn = call && isObj(call) && isObj(call.function) ? call.function : undefined;
  const u = readCompatUsage(v.usage);
  const rawText = contentText(msg.content);
  const answer: ChatAnswer = {
    rawText,
    refusal: typeof msg.refusal === 'string' && msg.refusal.trim() !== '',
    stop: str(choice.finish_reason),
    usage: u.seen ? u.usage : estimatedUsage(rawText),
    usageSeen: u.seen,
    model: str(v.model),
    requestId: headerOf(headers, 'x-request-id'),
    timings: timingsOf(v.timings),
  };
  if (fn && typeof fn.arguments === 'string') answer.toolArgs = fn.arguments;
  return answerReceipt(answer, prof, variant, latencyMs);
}

export function chatStreamStep(
  state: StreamState,
  chunk: string,
  classify: ProviderAdapter['classify'],
): StreamStep {
  const s = copyState(state);
  const events: StreamEvent[] = [];
  const { lines, rest } = splitLines(s.buffer, chunk);
  s.buffer = rest;
  for (const line of lines) {
    const data = sseData(line);
    if (data === undefined || data === '') continue;
    if (data.trim() === '[DONE]') {
      s.done = true;
      events.push({ t: 'done' });
      continue;
    }
    const ev = parseJsonText(data);
    if (!isObj(ev)) continue;
    if (ev.error !== undefined) {
      const e = isObj(ev.error) ? ev.error : {};
      const code = typeof e.code === 'number' ? e.code : 500;
      s.error = classify(code, JSON.stringify(ev), {});
      s.done = true;
      events.push({ t: 'error', error: s.error });
      continue;
    }
    if (typeof ev.model === 'string') s.servedModel = ev.model;
    const choice = Array.isArray(ev.choices) && isObj(ev.choices[0]) ? ev.choices[0] : undefined;
    if (choice) {
      const d = isObj(choice.delta) ? choice.delta : {};
      if (typeof d.content === 'string' && d.content !== '') {
        const before = visibleStreamText(s.text);
        s.text += d.content;
        const after = visibleStreamText(s.text);
        if (
          s.channel !== 'tool_carrier' &&
          after.startsWith(before) &&
          after.length > before.length
        ) {
          events.push({ t: 'text', text: after.slice(before.length) });
        }
      }
      const rc = str(d.reasoning_content) ?? str(d.reasoning);
      if (rc) {
        s.thinking += rc;
        events.push({ t: 'thinking', text: rc });
      }
      if (typeof d.refusal === 'string' && d.refusal !== '') s.rawStop = 'content_filter';
      const tcs = Array.isArray(d.tool_calls) ? d.tool_calls : [];
      for (const tc of tcs) {
        if (!isObj(tc) || num(tc.index) !== 0 || !isObj(tc.function)) continue;
        const args = str(tc.function.arguments);
        if (args) {
          s.toolArgs += args;
          if (s.channel === 'tool_carrier') events.push({ t: 'text', text: args });
        }
      }
      if (typeof choice.finish_reason === 'string' && s.rawStop !== 'content_filter') {
        s.rawStop = choice.finish_reason;
      }
    }
    if (isObj(ev.usage)) {
      s.usage = readCompatUsage(ev.usage).usage;
      s.usageSeen = true;
      events.push({ t: 'usage', usage: { ...s.usage } });
    }
    const t = timingsOf(ev.timings);
    if (t) s.timings = t;
  }
  return { state: s, events };
}

export function endChat(
  state: StreamState,
  latencyMs: number,
  prof: ModelProfile,
  variant: ChatVariant,
  classify: ProviderAdapter['classify'] = classifyCompat,
): LlmCallResult {
  if (state.buffer.trim() !== '') {
    const flushed = chatStreamStep(state, '\n', classify).state;
    return endChat(flushed, latencyMs, prof, variant, classify);
  }
  if (state.error) return failure(state.error, latencyMs, { usage: state.usage });
  if (!state.done && state.rawStop === undefined) {
    return failure(STREAM_CUT, latencyMs, { usage: state.usage });
  }
  const answer: ChatAnswer = {
    rawText: state.text,
    refusal: false,
    stop: state.rawStop,
    usage: state.usageSeen ? state.usage : estimatedUsage(state.text || state.toolArgs),
    usageSeen: state.usageSeen,
    model: state.servedModel,
    timings: state.timings,
  };
  if (state.toolArgs !== '') answer.toolArgs = state.toolArgs;
  return answerReceipt(answer, prof, variant, latencyMs);
}

/** Context length fields some listings carry (OpenRouter, LM Studio, others). */
function listedContext(m: Record<string, unknown>): number | undefined {
  for (const k of ['context_length', 'max_context_length', 'context_window']) {
    if (typeof m[k] === 'number') return m[k] as number;
  }
  const meta = isObj(m.meta) ? m.meta : undefined;
  if (meta && typeof meta.n_ctx_train === 'number') return meta.n_ctx_train;
  return undefined;
}

export function parseModelsList(
  status: number,
  body: string,
  conn: ConnectionPublic,
  classify: ProviderAdapter['classify'],
): ModelListing {
  const out: ModelListing = { connectionId: conn.id, ok: false, models: [] };
  const v = status >= 200 && status < 300 ? parseJsonText(body) : null;
  if (!isObj(v) || !Array.isArray(v.data)) {
    const e = classify(status, body, {});
    if (e.problem) out.problem = e.problem;
    out.message = scrubMessage(e.message);
    return out;
  }
  out.ok = true;
  for (const m of v.data) {
    if (!isObj(m) || typeof m.id !== 'string') continue;
    if (m.type === 'embeddings' || m.type === 'embedding') continue;
    const entry: ModelListing['models'][number] = { model: m.id, known: false };
    const ctx = listedContext(m);
    if (ctx !== undefined) entry.contextTokens = ctx;
    if (m.state === 'loaded') entry.loaded = true;
    else if (m.state === 'not-loaded') entry.loaded = false;
    out.models.push(entry);
  }
  return out;
}

export const openaiCompatAdapter: ProviderAdapter = {
  kind: 'openai_compat',
  build: (spec, conn, prof) => chatRequest(spec, conn, prof, 'cloud'),
  parse: (status, body, latencyMs, prof, headers = {}) =>
    parseChat(status, body, latencyMs, prof, headers, 'cloud', classifyCompat),
  startStream: (prof, headers) =>
    newStreamState('openai_compat', chatChannel(prof, 'cloud'), headerOf(headers, 'x-request-id')),
  parseStreamEvent: (state, chunk) => chatStreamStep(state, chunk, classifyCompat),
  endStream: (state, latencyMs, prof) => endChat(state, latencyMs, prof, 'cloud'),
  classify: classifyCompat,
  listModels: (conn) => ({
    method: 'GET',
    url: joinUrl(conn.baseUrl, '/models'),
    headers: {},
    read: 'json',
  }),
  parseModels: (status, body, conn) => parseModelsList(status, body, conn, classifyCompat),
  probe(kind: ProbeKind, conn, prof) {
    const p = probeProfile(kind, prof);
    return chatRequest(probeSpec(conn, p, kind), conn, p, 'cloud');
  },
};
