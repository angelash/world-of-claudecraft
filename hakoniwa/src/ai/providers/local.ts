// Local service adapter (docs/50_tech/llm_providers.md 3.4): Ollama through its native
// /api/chat (num_ctx per role, num_predict, keep_alive, think off, schema in `format`,
// newline-delimited streaming, eval counts and durations as throughput), and LM Studio,
// llama.cpp and other compatible services through /chat/completions with the local
// variant (flattened schema with one const branch per verb, at most one call, output
// guidance and decision points, temperature 0.6, no native tools). Classification adds the
// local cases: service not started, model not pulled, model still loading, context size.
// Pure: builds and parses, never sends.

import type { LlmCallResult, LlmCallSpec, LlmStopReason } from '../contracts';
import { EMPTY_USAGE } from '../contracts';
import {
  parseParamSize,
  probeProfile,
  probeSpec,
  ROLE_REQUIREMENTS,
  sizeClassOf,
} from './capabilities';
import {
  chatParts,
  chatRequest,
  chatStreamStep,
  classifyCompat,
  endChat,
  LOCAL_TEMPERATURE,
  parseChat,
  parseModelsList,
} from './openai_compat';
import { headerOf, netErrorProblem, readErrorBody, statusBaseline, withDetail } from './problems';
import {
  copyState,
  estimatedUsage,
  failure,
  isObj,
  joinUrl,
  newStreamState,
  num,
  parseJsonText,
  recoverJsonText,
  rootUrl,
  STREAM_CUT,
  splitLines,
  str,
  stripThinking,
  visibleStreamText,
} from './shared';
import type {
  AdapterError,
  AdapterHttpRequest,
  ConnectionPublic,
  HeaderBag,
  LocalFlavor,
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

/** Ollama keeps the model loaded this long after a call (llm_providers.md 3.4). */
export const OLLAMA_KEEP_ALIVE = '30m';

export function flavorOf(conn: ConnectionPublic): LocalFlavor {
  return conn.flavor ?? 'generic';
}

/** num_ctx: the role's required context, but never above the model's (3.4 item 5). */
export function numCtx(spec: LlmCallSpec, prof: ModelProfile): number {
  return Math.min(ROLE_REQUIREMENTS[spec.bindingRole].minContext, prof.capability.contextTokens);
}

/** The Ollama /api/chat body (exported for the golden tests). */
export function ollamaBody(spec: LlmCallSpec, prof: ModelProfile): Record<string, unknown> {
  const cap = prof.capability;
  const { messages, channel, schema } = chatParts(spec, prof, 'local');
  const stream = spec.stream === true && cap.streaming === 'yes';
  const body: Record<string, unknown> = { model: spec.model, messages, stream };
  if (channel === 'json_schema') body.format = schema;
  else if (channel === 'json_mode') body.format = 'json';
  if (cap.thinking === 'think_flag') body.think = false;
  body.keep_alive = OLLAMA_KEEP_ALIVE;
  const options: Record<string, unknown> = {
    num_ctx: numCtx(spec, prof),
    num_predict: spec.output.maxTokens,
  };
  if (cap.samplingParams) {
    options.temperature = prof.temperature ?? LOCAL_TEMPERATURE;
    options.presence_penalty = 0;
  }
  body.options = options;
  return body;
}

function ollamaRequest(
  spec: LlmCallSpec,
  conn: ConnectionPublic,
  prof: ModelProfile,
): AdapterHttpRequest {
  const body = ollamaBody(spec, prof);
  return {
    method: 'POST',
    url: joinUrl(rootUrl(conn.baseUrl), '/api/chat'),
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    read: body.stream === true ? 'ndjson' : 'json',
  };
}

const LOADING =
  /loading model|model is loading|still loading|no models? (is |are )?loaded|model .*not loaded|please load a model/i;
const NOT_PULLED =
  /model ['"]?[^'"]*['"]? not found|try pulling|pull (it|the model)|no such model/i;
const CONTEXT =
  /exceeds? the (available )?context size|context size|exceed_context_size|input .*truncat|context length|too many tokens|上下文/i;

/** Local classification: the local rows of llm_providers.md 10.1, then the compatible rules. */
export function classifyLocal(
  status: number,
  body: string,
  headers: HeaderBag,
  netError?: NetErrorKind,
): AdapterError {
  if (netError) {
    const e = netErrorProblem(netError);
    return netError === 'refused' || netError === 'dns'
      ? { ...e, message: 'local service not running' }
      : e;
  }
  const eb = readErrorBody(body);
  const text = `${eb.type ?? ''} ${eb.code ?? ''} ${eb.message ?? ''}`;
  const done = (e: AdapterError) => withDetail(e, eb, headers, 'x-request-id');
  const at = { httpStatus: status };
  if (LOADING.test(text) || (status === 503 && eb.type === 'unavailable_error')) {
    return done({
      ...at,
      cls: 'model_unavailable',
      problem: 'model_not_loaded',
      message: `HTTP ${status}`,
    });
  }
  if ((status === 404 || status === 400 || status === 500) && NOT_PULLED.test(text)) {
    return done({
      ...at,
      cls: 'model_unavailable',
      problem: 'model_not_found',
      message: `HTTP ${status}`,
    });
  }
  if ((status === 400 || status === 413 || status === 500) && CONTEXT.test(text)) {
    return done({
      ...at,
      cls: 'context_too_long',
      problem: 'context_too_long',
      message: `HTTP ${status}`,
    });
  }
  if (status === 503) {
    return done({ ...at, cls: 'overloaded', problem: 'overloaded', message: 'HTTP 503' });
  }
  const base = statusBaseline(status, body, headers);
  if (base) return done(base);
  return classifyCompat(status, body, headers);
}

function ollamaStop(raw: string | undefined): LlmStopReason {
  if (raw === 'stop') return 'end';
  if (raw === 'length') return 'max_tokens';
  return 'other';
}

function perSec(count: unknown, nanos: unknown): number | undefined {
  const c = num(count);
  const n = num(nanos);
  return c > 0 && n > 0 ? Math.round((c / (n / 1e9)) * 100) / 100 : undefined;
}

function ollamaTimings(v: Record<string, unknown>): LlmCallResult['timings'] | undefined {
  const p = perSec(v.prompt_eval_count, v.prompt_eval_duration);
  const g = perSec(v.eval_count, v.eval_duration);
  if (p === undefined && g === undefined) return undefined;
  const t: NonNullable<LlmCallResult['timings']> = {};
  if (p !== undefined) t.promptTokensPerSec = p;
  if (g !== undefined) t.genTokensPerSec = g;
  return t;
}

function ollamaReceipt(
  rawText: string,
  v: Record<string, unknown>,
  prof: ModelProfile,
  latencyMs: number,
): LlmCallResult {
  const channel = channelLocal(prof);
  const text = stripThinking(rawText);
  const usage = {
    ...EMPTY_USAGE,
    inputTokens: num(v.prompt_eval_count),
    outputTokens: num(v.eval_count),
  };
  const out: LlmCallResult = {
    ok: true,
    text,
    json: channel === 'json_schema' ? parseJsonText(text) : recoverJsonText(text),
    stopReason: ollamaStop(str(v.done_reason)),
    rawStopReason: str(v.done_reason),
    usage,
    servedModel: str(v.model) ?? prof.model,
    channel,
    latencyMs,
  };
  if (typeof v.prompt_eval_count !== 'number' && typeof v.eval_count !== 'number') {
    out.usageEstimated = true;
  }
  const t = ollamaTimings(v);
  if (t) out.timings = t;
  return out;
}

function channelLocal(prof: ModelProfile) {
  const chans = prof.capability.channels.filter((c) => c !== 'tool_carrier');
  return chans[0] ?? 'prompt_only';
}

function parseOllama(
  status: number,
  body: string,
  latencyMs: number,
  prof: ModelProfile,
  headers: HeaderBag = {},
): LlmCallResult {
  if (status < 200 || status >= 300)
    return failure(classifyLocal(status, body, headers), latencyMs);
  const v = parseJsonText(body);
  if (!isObj(v)) return failure(classifyLocal(status, body, headers), latencyMs);
  if (typeof v.error === 'string') return failure(classifyLocal(500, body, headers), latencyMs);
  const msg = isObj(v.message) ? v.message : {};
  return ollamaReceipt(str(msg.content) ?? '', v, prof, latencyMs);
}

function ollamaStreamStep(state: StreamState, chunk: string): StreamStep {
  const s = copyState(state);
  const events: StreamEvent[] = [];
  const { lines, rest } = splitLines(s.buffer, chunk);
  s.buffer = rest;
  for (const line of lines) {
    if (line.trim() === '') continue;
    const v = parseJsonText(line);
    if (!isObj(v)) continue;
    if (typeof v.error === 'string') {
      s.error = classifyLocal(500, JSON.stringify(v), {});
      s.done = true;
      events.push({ t: 'error', error: s.error });
      continue;
    }
    const msg = isObj(v.message) ? v.message : {};
    const piece = str(msg.content) ?? '';
    if (piece !== '') {
      const before = visibleStreamText(s.text);
      s.text += piece;
      const after = visibleStreamText(s.text);
      if (after.startsWith(before) && after.length > before.length) {
        events.push({ t: 'text', text: after.slice(before.length) });
      }
    }
    const thinking = str(msg.thinking);
    if (thinking) {
      s.thinking += thinking;
      events.push({ t: 'thinking', text: thinking });
    }
    if (typeof v.model === 'string') s.servedModel = v.model;
    if (v.done === true) {
      s.rawStop = str(v.done_reason);
      if (typeof v.prompt_eval_count === 'number' || typeof v.eval_count === 'number') {
        s.usage = {
          ...EMPTY_USAGE,
          inputTokens: num(v.prompt_eval_count),
          outputTokens: num(v.eval_count),
        };
        s.usageSeen = true;
        events.push({ t: 'usage', usage: { ...s.usage } });
      }
      const t = ollamaTimings(v);
      if (t) s.timings = t;
      s.done = true;
      events.push({ t: 'done' });
    }
  }
  return { state: s, events };
}

function endOllama(state: StreamState, latencyMs: number, prof: ModelProfile): LlmCallResult {
  if (state.buffer.trim() !== '')
    return endOllama(ollamaStreamStep(state, '\n').state, latencyMs, prof);
  if (state.error) return failure(state.error, latencyMs, { usage: state.usage });
  if (!state.done) return failure(STREAM_CUT, latencyMs, { usage: state.usage });
  const v: Record<string, unknown> = { done_reason: state.rawStop, model: state.servedModel };
  if (state.usageSeen) {
    v.prompt_eval_count = state.usage.inputTokens;
    v.eval_count = state.usage.outputTokens;
  }
  const out = ollamaReceipt(state.text, v, prof, latencyMs);
  if (state.timings) out.timings = state.timings;
  if (!state.usageSeen) out.usage = estimatedUsage(state.text);
  return out;
}

function parseOllamaTags(status: number, body: string, conn: ConnectionPublic): ModelListing {
  const out: ModelListing = { connectionId: conn.id, ok: false, models: [] };
  const v = status >= 200 && status < 300 ? parseJsonText(body) : null;
  if (!isObj(v) || !Array.isArray(v.models)) {
    const e = classifyLocal(status, body, {});
    if (e.problem) out.problem = e.problem;
    out.message = e.message;
    return out;
  }
  out.ok = true;
  for (const m of v.models) {
    if (!isObj(m)) continue;
    const name = str(m.name) ?? str(m.model);
    if (!name) continue;
    const details = isObj(m.details) ? m.details : {};
    out.models.push({
      model: name,
      sizeClass: sizeClassOf(parseParamSize(str(details.parameter_size))),
      known: false,
    });
  }
  return out;
}

function parseOllamaShow(status: number, body: string): ModelMeta {
  const v = status >= 200 && status < 300 ? parseJsonText(body) : null;
  if (!isObj(v)) return {};
  const meta: ModelMeta = {};
  const info = isObj(v.model_info) ? v.model_info : {};
  for (const [k, val] of Object.entries(info)) {
    if (k.endsWith('.context_length') && typeof val === 'number') meta.contextTokens = val;
  }
  const details = isObj(v.details) ? v.details : {};
  const count = num(info['general.parameter_count']);
  const billions = count > 0 ? count / 1e9 : parseParamSize(str(details.parameter_size));
  meta.sizeClass = sizeClassOf(billions);
  return meta;
}

/** llama.cpp /props and LM Studio /api/v0/models/{model}. */
function parseServiceMeta(status: number, body: string): ModelMeta {
  if (status === 503) return { loaded: false };
  const v = status >= 200 && status < 300 ? parseJsonText(body) : null;
  if (!isObj(v)) return {};
  const meta: ModelMeta = {};
  const gen = isObj(v.default_generation_settings) ? v.default_generation_settings : {};
  const ctx =
    num(gen.n_ctx) || num(v.n_ctx) || num(v.max_context_length) || num(v.loaded_context_length);
  if (ctx > 0) meta.contextTokens = ctx;
  if (v.state === 'loaded') meta.loaded = true;
  else if (v.state === 'not-loaded') meta.loaded = false;
  else if (isObj(v.default_generation_settings)) meta.loaded = true;
  return meta;
}

const isOllama = (conn: ConnectionPublic) => flavorOf(conn) === 'ollama';

/** Native Ollama answers carry `message` and `done`; compatible ones carry `choices`. */
function nativeAnswer(body: string): boolean {
  const v = parseJsonText(body);
  return isObj(v) && !Array.isArray(v.choices) && ('message' in v || 'done' in v);
}

export const localAdapter: ProviderAdapter = {
  kind: 'local',
  build(spec, conn, prof) {
    return isOllama(conn)
      ? ollamaRequest(spec, conn, prof)
      : chatRequest(spec, conn, prof, 'local');
  },
  parse(status, body, latencyMs, prof, headers = {}) {
    return nativeAnswer(body)
      ? parseOllama(status, body, latencyMs, prof, headers)
      : parseChat(status, body, latencyMs, prof, headers, 'local', classifyLocal);
  },
  startStream(prof, headers) {
    return newStreamState('local', channelLocal(prof), headerOf(headers, 'x-request-id'));
  },
  parseStreamEvent(state, chunk) {
    // Ollama streams JSON lines; compatible services stream server-sent events.
    let format = state.format;
    if (!format) {
      const head = (state.buffer + chunk).trimStart();
      if (head === '') return { state, events: [] };
      format = /^(data|event):|^:/.test(head) ? 'sse' : 'ndjson';
    }
    const step =
      format === 'sse'
        ? chatStreamStep(state, chunk, classifyLocal)
        : ollamaStreamStep(state, chunk);
    step.state.format = format;
    return step;
  },
  endStream(state, latencyMs, prof) {
    return state.format === 'ndjson'
      ? endOllama(state, latencyMs, prof)
      : endChat(state, latencyMs, prof, 'local', classifyLocal);
  },
  classify: classifyLocal,
  listModels(conn) {
    const flavor = flavorOf(conn);
    const url =
      flavor === 'ollama'
        ? joinUrl(rootUrl(conn.baseUrl), '/api/tags')
        : flavor === 'lmstudio'
          ? joinUrl(rootUrl(conn.baseUrl), '/api/v0/models')
          : joinUrl(conn.baseUrl, '/models');
    return { method: 'GET', url, headers: {}, read: 'json' };
  },
  parseModels(status, body, conn) {
    return isOllama(conn)
      ? parseOllamaTags(status, body, conn)
      : parseModelsList(status, body, conn, classifyLocal);
  },
  modelMeta(conn, model): AdapterHttpRequest {
    const flavor = flavorOf(conn);
    const root = rootUrl(conn.baseUrl);
    if (flavor === 'ollama') {
      return {
        method: 'POST',
        url: joinUrl(root, '/api/show'),
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model }),
        read: 'json',
      };
    }
    if (flavor === 'lmstudio') {
      return {
        method: 'GET',
        url: joinUrl(root, `/api/v0/models/${encodeURIComponent(model)}`),
        headers: {},
        read: 'json',
      };
    }
    return { method: 'GET', url: joinUrl(root, '/props'), headers: {}, read: 'json' };
  },
  parseModelMeta(status, body) {
    const v = parseJsonText(body);
    return isObj(v) && (isObj(v.model_info) || isObj(v.details))
      ? parseOllamaShow(status, body)
      : parseServiceMeta(status, body);
  },
  probe(kind: ProbeKind, conn, prof) {
    const p = probeProfile(kind, prof);
    return localAdapter.build(probeSpec(conn, p, kind), conn, p);
  },
};
