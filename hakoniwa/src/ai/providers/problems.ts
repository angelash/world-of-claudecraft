// Player-facing problem codes (docs/50_tech/llm_providers.md 10): the twenty codes with
// their error class, scope, automatic handling, fix actions and zh-Hans source text, plus
// the provider-neutral recognition rules (transport failures, redirects, web pages instead
// of JSON, retry hints), the counters that raise bad_output, the mapping of legacy proxy
// error codes, and the merge and toast rules of 10.2. Provider-specific body matching lives
// in each adapter's classify. Pure: no clock, no network.

import type { LlmErrorCode, ProblemCode, ProviderErrorClass, ProviderId } from '../contracts';
import type { AdapterError, HeaderBag, NetErrorKind } from './types';

/** The twenty codes in the order of the table in llm_providers.md 10.1. */
export const PROBLEM_CODES: readonly ProblemCode[] = [
  'key_invalid',
  'permission_denied',
  'insufficient_balance',
  'model_not_found',
  'model_not_loaded',
  'timeout',
  'context_too_long',
  'rate_limited',
  'overloaded',
  'server_error',
  'network',
  'tls_error',
  'endpoint_wrong',
  'cors_blocked',
  'refusal',
  'unsupported_output',
  'bad_output',
  'keychain_unavailable',
  'not_configured',
  'cap_reached',
];

/** Who a problem takes out of service (llm_providers.md 10.3). */
export type ProblemScope = 'connection' | 'model' | 'role' | 'global';

/** The automatic handling column of 10.1. */
export type ProblemAuto =
  | 'circuit_open'
  | 'circuit_until_retest'
  | 'slot_disabled'
  | 'probe_until_loaded'
  | 'health_count'
  | 'tighten_input'
  | 'retry_after'
  | 'backoff_once'
  | 'circuit_half_open'
  | 'refusal_stats'
  | 'downgrade_channel'
  | 'role_model_degrade'
  | 'memory_only'
  | 'role_builtin'
  | 'degrade_ladder';

/** Settings actions behind the fix buttons (llm_providers.md 10.2). */
export type FixAction =
  | 'enter_key'
  | 'open_console'
  | 'other_connection'
  | 'pick_model'
  | 'show_pull_help'
  | 'retry'
  | 'show_load_help'
  | 'faster_tier'
  | 'show_latency'
  | 'longer_context_model'
  | 'edit_context_length'
  | 'lower_concurrency'
  | 'show_start_help'
  | 'edit_address'
  | 'append_v1'
  | 'show_cors_help'
  | 'download_desktop'
  | 'change_model'
  | 'retest'
  | 'bigger_model'
  | 'learn_keychain'
  | 'use_session_only'
  | 'open_slots'
  | 'open_bindings'
  | 'edit_caps'
  | 'open_ledger';

export interface ProblemInfo {
  code: ProblemCode;
  cls: ProviderErrorClass;
  scope: ProblemScope;
  /** Rate limits, overload, server errors and timeouts heal on their own (10.2). */
  selfHealing: boolean;
  auto: ProblemAuto;
  fixes: readonly FixAction[];
  /** Provider kinds where the code can be recognised (the "not applicable" cells of 10.1). */
  applies: readonly Exclude<ProviderId, 'none'>[];
  /** Text keys (D-077); the client text table owns the rendered strings. */
  titleKey: string;
  bodyKey: string;
  /** zh-Hans source text for the text table (llm_providers.md 10.1). */
  source: { title: string; body: string; localBody?: string };
}

const ALL = ['anthropic', 'openai_compat', 'local'] as const;
const CLOUD = ['anthropic', 'openai_compat'] as const;
const LOCAL = ['local'] as const;

function info(
  code: ProblemCode,
  cls: ProviderErrorClass,
  scope: ProblemScope,
  auto: ProblemAuto,
  fixes: readonly FixAction[],
  applies: readonly Exclude<ProviderId, 'none'>[],
  source: ProblemInfo['source'],
): ProblemInfo {
  return {
    code,
    cls,
    scope,
    selfHealing: SELF_HEALING.has(code),
    auto,
    fixes,
    applies,
    titleKey: `llm.problem.${code}.title`,
    bodyKey: `llm.problem.${code}.body`,
    source,
  };
}

const SELF_HEALING: ReadonlySet<ProblemCode> = new Set([
  'rate_limited',
  'overloaded',
  'server_error',
  'timeout',
]);

export const PROBLEMS: Readonly<Record<ProblemCode, ProblemInfo>> = {
  key_invalid: info(
    'key_invalid',
    'auth',
    'connection',
    'circuit_open',
    ['enter_key', 'open_console'],
    ALL,
    { title: '密钥无效', body: '这把密钥无效或已被撤销。' },
  ),
  permission_denied: info(
    'permission_denied',
    'auth',
    'model',
    'slot_disabled',
    ['pick_model', 'enter_key'],
    ALL,
    { title: '权限不足', body: '这把密钥无权使用该模型。' },
  ),
  insufficient_balance: info(
    'insufficient_balance',
    'quota',
    'connection',
    'circuit_until_retest',
    ['open_console', 'other_connection'],
    CLOUD,
    { title: '余额不足', body: '提供方账户的余额或额度不足。' },
  ),
  model_not_found: info(
    'model_not_found',
    'model_unavailable',
    'model',
    'slot_disabled',
    ['pick_model', 'show_pull_help'],
    ALL,
    { title: '无此模型', body: '这个服务上没有该模型。' },
  ),
  model_not_loaded: info(
    'model_not_loaded',
    'model_unavailable',
    'model',
    'probe_until_loaded',
    ['retry', 'show_load_help'],
    LOCAL,
    { title: '本机模型未加载', body: '本机服务还没有加载这个模型。' },
  ),
  timeout: info(
    'timeout',
    'timeout',
    'role',
    'health_count',
    ['faster_tier', 'show_latency'],
    ALL,
    { title: '回复太慢', body: '模型回复太慢，这一次已由内置 AI 代答。' },
  ),
  context_too_long: info(
    'context_too_long',
    'context_too_long',
    'role',
    'tighten_input',
    ['longer_context_model', 'edit_context_length'],
    ALL,
    { title: '上下文超长', body: '题面超出了这个模型的上下文长度。' },
  ),
  rate_limited: info(
    'rate_limited',
    'rate_limited',
    'connection',
    'retry_after',
    ['lower_concurrency'],
    ALL,
    { title: '限流', body: '提供方限流了，稍后自动恢复。' },
  ),
  overloaded: info('overloaded', 'overloaded', 'connection', 'backoff_once', [], ALL, {
    title: '服务繁忙',
    body: '提供方服务繁忙，稍后自动恢复。',
  }),
  server_error: info('server_error', 'server', 'connection', 'backoff_once', [], ALL, {
    title: '服务出错',
    body: '提供方服务出错，稍后自动恢复。',
  }),
  network: info(
    'network',
    'network',
    'connection',
    'circuit_half_open',
    ['retry', 'show_start_help'],
    ALL,
    {
      title: '无法连接',
      body: '无法连接到提供方，请检查网络。',
      localBody: '本机服务没有启动。',
    },
  ),
  tls_error: info('tls_error', 'network', 'connection', 'circuit_open', ['edit_address'], CLOUD, {
    title: '证书错误',
    body: '这个地址的证书无法校验。',
  }),
  endpoint_wrong: info(
    'endpoint_wrong',
    'network',
    'connection',
    'circuit_open',
    ['append_v1', 'edit_address'],
    ALL,
    { title: '地址不对', body: '这个地址不像兼容的接口，多数服务的地址以 /v1 结尾。' },
  ),
  cors_blocked: info(
    'cors_blocked',
    'network',
    'connection',
    'circuit_open',
    ['show_cors_help', 'download_desktop'],
    LOCAL,
    {
      title: '浏览器拦截',
      body: '浏览器拦截了对本机服务的访问，需要在本机服务里允许本页面的来源。',
    },
  ),
  refusal: info('refusal', 'refusal', 'role', 'refusal_stats', ['change_model'], CLOUD, {
    title: '拒答',
    body: '这个模型经常拒绝回答，可能不适合本作的题材。',
  }),
  unsupported_output: info(
    'unsupported_output',
    'bad_request',
    'model',
    'downgrade_channel',
    ['retest', 'change_model'],
    ALL,
    { title: '不支持结构化输出', body: '这个模型不支持本作需要的输出格式，已改用较弱的格式。' },
  ),
  bad_output: info(
    'bad_output',
    'bad_request',
    'role',
    'role_model_degrade',
    ['bigger_model'],
    ALL,
    {
      title: '输出常出错',
      body: '这个模型的输出经常不合格式。',
    },
  ),
  keychain_unavailable: info(
    'keychain_unavailable',
    'auth',
    'connection',
    'memory_only',
    ['learn_keychain', 'use_session_only'],
    ALL,
    { title: '钥匙串不可用', body: '系统钥匙串不可用，密钥只能保存到本次运行结束。' },
  ),
  not_configured: info(
    'not_configured',
    'auth',
    'role',
    'role_builtin',
    ['open_slots', 'open_bindings'],
    ALL,
    { title: '未配置', body: '这个角色还没有可用的模型。' },
  ),
  cap_reached: info(
    'cap_reached',
    'quota',
    'global',
    'degrade_ladder',
    ['edit_caps', 'open_ledger'],
    ALL,
    {
      title: '达到上限',
      body: '已达到花费上限，相关角色改由内置 AI 驱动，世界照常运行。',
    },
  ),
};

export function problemInfo(code: ProblemCode): ProblemInfo {
  return PROBLEMS[code];
}

export function isProblemCode(v: unknown): v is ProblemCode {
  return typeof v === 'string' && (PROBLEM_CODES as readonly string[]).includes(v);
}

// --- shared recognition rules -------------------------------------------------------------

const KEY_LIKE = /\b(sk-[A-Za-z0-9_-]{8,}|sk_[A-Za-z0-9_-]{16,})/g;
const BEARER = /\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

/** Remove anything key-like or an auth header value from developer text; at most 300 chars. */
export function scrubMessage(text: string): string {
  return text.replace(KEY_LIKE, '[redacted]').replace(BEARER, '$1 [redacted]').slice(0, 300);
}

/** Case-insensitive header lookup. */
export function headerOf(headers: HeaderBag | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const want = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() === want) return v;
  return undefined;
}

/** retry-after-ms, then retry-after in seconds; undefined when absent or malformed. */
export function retryAfterMs(headers: HeaderBag | undefined): number | undefined {
  const ms = Number(headerOf(headers, 'retry-after-ms'));
  if (Number.isFinite(ms) && ms >= 0 && headerOf(headers, 'retry-after-ms') !== undefined) {
    return Math.round(ms);
  }
  const raw = headerOf(headers, 'retry-after');
  if (raw === undefined || raw.trim() === '') return undefined;
  const secs = Number(raw);
  return Number.isFinite(secs) && secs >= 0 ? Math.round(secs * 1000) : undefined;
}

/** A web page where JSON was expected (llm_providers.md 10.1 endpoint_wrong). */
export function looksLikeWebPage(body: string, headers?: HeaderBag): boolean {
  const ct = headerOf(headers, 'content-type') ?? '';
  if (/text\/html/i.test(ct)) return true;
  return /^\s*(<!doctype html|<html[\s>])/i.test(body);
}

/** Fields of a JSON error body in any of the common shapes. */
export interface ErrorBody {
  type?: string;
  code?: string;
  message?: string;
  param?: string;
}

function str(v: unknown): string | undefined {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  return undefined;
}

/**
 * Anthropic { type: 'error', error: { type, message } }, OpenAI { error: { message, type,
 * code, param } }, Ollama { error: '...' }, llama.cpp { error: { code, message, type } }.
 */
export function readErrorBody(body: string): ErrorBody {
  let v: unknown;
  try {
    v = JSON.parse(body);
  } catch {
    return {};
  }
  if (typeof v !== 'object' || v === null) return {};
  const o = v as Record<string, unknown>;
  const e = o.error;
  if (typeof e === 'string') return { message: e };
  if (typeof e === 'object' && e !== null) {
    const x = e as Record<string, unknown>;
    return { type: str(x.type), code: str(x.code), message: str(x.message), param: str(x.param) };
  }
  return { type: str(o.type), code: str(o.code), message: str(o.message) };
}

/** Transport failures (no status): the same rule for every provider. */
export function netErrorProblem(netError: NetErrorKind): AdapterError {
  switch (netError) {
    case 'timeout':
      return { cls: 'timeout', problem: 'timeout', message: 'request timed out' };
    case 'tls':
      return { cls: 'network', problem: 'tls_error', message: 'certificate verification failed' };
    case 'cors':
      return { cls: 'network', problem: 'cors_blocked', message: 'blocked by the browser (CORS)' };
    default:
      return { cls: 'network', problem: 'network', message: `connection failed (${netError})` };
  }
}

/**
 * The status-only part every adapter shares: redirects and web pages are a wrong address;
 * 401 and 403 are auth; 402 is balance; 429 is a rate limit; 5xx are server side. Returns
 * undefined for statuses the adapter must read the body for (400, 404, 409, 413, 422).
 */
export function statusBaseline(
  status: number,
  body: string,
  headers: HeaderBag,
): AdapterError | undefined {
  const base = { httpStatus: status, retryAfterMs: retryAfterMs(headers) };
  // Auth, balance and rate statuses mean the same even when a gateway answers with a page.
  if (status === 401) return { ...base, cls: 'auth', problem: 'key_invalid', message: 'HTTP 401' };
  if (status === 403) {
    return { ...base, cls: 'auth', problem: 'permission_denied', message: 'HTTP 403' };
  }
  if (status === 402) {
    return { ...base, cls: 'quota', problem: 'insufficient_balance', message: 'HTTP 402' };
  }
  if (status === 429) {
    return { ...base, cls: 'rate_limited', problem: 'rate_limited', message: 'HTTP 429' };
  }
  if (status >= 300 && status < 400) {
    return { ...base, cls: 'network', problem: 'endpoint_wrong', message: `redirect ${status}` };
  }
  if (status < 500 && looksLikeWebPage(body, headers)) {
    return { ...base, cls: 'network', problem: 'endpoint_wrong', message: 'web page, not JSON' };
  }
  if (status >= 500) {
    return { ...base, cls: 'server', problem: 'server_error', message: `HTTP ${status}` };
  }
  return undefined;
}

/**
 * The parameter an "unsupported parameter" message is about: the explicit `param` field,
 * else the known parameter named first in the message (by position, so "max_tokens is not
 * supported, use max_completion_tokens" names max_tokens).
 */
export function rejectedParam(
  message: string,
  known: readonly string[],
  explicit?: string,
): string | undefined {
  if (explicit) {
    const p = explicit.split('.')[0] ?? explicit;
    return known.find((k) => k === p) ?? p;
  }
  let best: { name: string; at: number } | undefined;
  for (const k of known) {
    const m = new RegExp(`\\b${k}\\b`).exec(message);
    if (m && (!best || m.index < best.at)) best = { name: k, at: m.index };
  }
  return best?.name;
}

/** Attach the scrubbed provider message and request id to a verdict. */
export function withDetail(
  err: AdapterError,
  body: ErrorBody,
  headers: HeaderBag,
  requestIdHeader: string,
): AdapterError {
  const out: AdapterError = { ...err };
  if (body.message) out.message = scrubMessage(`${err.message}: ${body.message}`);
  const rid = headerOf(headers, requestIdHeader);
  if (rid) out.providerRequestId = rid;
  if (out.retryAfterMs === undefined) delete out.retryAfterMs;
  return out;
}

// --- counters and non-adapter recognition ----------------------------------------------

/** Request parameters whose rejection means the output channel does not work (3.5). */
export const OUTPUT_PARAMS: ReadonlySet<string> = new Set([
  'output_config',
  'json_schema',
  'format',
  'response_format',
  'tool_choice',
  'tools',
]);

/**
 * Whether a failed receipt is a "parameter not supported" rejection of the output channel:
 * the runtime feeds it to noteChannelResult, which raises unsupported_output on the third
 * strike and moves the capability down one channel (llm_providers.md 3.5).
 */
export function isOutputUnsupported(result: {
  ok: boolean;
  error?: { cls: ProviderErrorClass; param?: string };
}): boolean {
  const p = result.error?.param;
  return (
    !result.ok && result.error?.cls === 'bad_request' && p !== undefined && OUTPUT_PARAMS.has(p)
  );
}

/** Consecutive parse or schema failures that raise bad_output (llm_providers.md 10.1). */
export const BAD_OUTPUT_LIMIT = 5;

/** Advance the per role and model failure run; returns bad_output on the fifth in a row. */
export function nextBadOutput(
  run: number,
  parsedOk: boolean,
): { run: number; problem?: 'bad_output' } {
  if (parsedOk) return { run: 0 };
  const next = run + 1;
  return next >= BAD_OUTPUT_LIMIT ? { run: 0, problem: 'bad_output' } : { run: next };
}

/** The keystore backend that cannot persist keys raises keychain_unavailable (6.1). */
export function keychainProblem(
  backend: 'os_keychain' | 'memory_only',
): 'keychain_unavailable' | undefined {
  return backend === 'memory_only' ? 'keychain_unavailable' : undefined;
}

/** Route outcomes that are not_configured: an empty slot or a connection without its key. */
export function configProblem(input: {
  slotEmpty: boolean;
  keyMissing: boolean;
}): 'not_configured' | undefined {
  return input.slotEmpty || input.keyMissing ? 'not_configured' : undefined;
}

/** A guard or budget verdict over a cap window raises cap_reached. */
export function capProblem(
  verdict: 'ok' | 'hour' | 'day' | 'run' | 'role' | 'total',
): 'cap_reached' | undefined {
  return verdict === 'ok' ? undefined : 'cap_reached';
}

/**
 * Legacy dev proxy error codes (src/ai/contracts.ts LlmErrorCode) to problem codes (14).
 * model_off is the deliberate no-model choice (a silent decline, D-010), not a problem.
 */
export function problemForLegacyError(code: LlmErrorCode): ProblemCode | undefined {
  switch (code) {
    case 'no_proxy':
    case 'no_credentials':
      return 'not_configured';
    case 'auth_failed':
      return 'key_invalid';
    case 'rate_limited':
    case 'overloaded':
    case 'server_error':
    case 'timeout':
    case 'network':
    case 'refusal':
      return code;
    default:
      return undefined;
  }
}

// --- presentation rules (llm_providers.md 10.2) -------------------------------------------

export interface ProblemReport {
  code: ProblemCode;
  connectionId?: string;
  model?: string;
  role?: string;
}

export interface MergedProblem {
  code: ProblemCode;
  connectionIds: string[];
  models: string[];
  /** Affected binding roles, in the order of BINDING_ROLES when known. */
  roles: string[];
  count: number;
}

const ROLE_ORDER = [
  'goddess',
  'core_npc',
  'present_npc',
  'offstage_batch',
  'ruler_general',
  'court_reviewer',
];

function roleRank(r: string): number {
  const i = ROLE_ORDER.indexOf(r);
  return i < 0 ? ROLE_ORDER.length : i;
}

/** One entry per code, listing every affected role, connection and model. */
export function mergeProblems(reports: readonly ProblemReport[]): MergedProblem[] {
  const by = new Map<ProblemCode, MergedProblem>();
  for (const r of reports) {
    let m = by.get(r.code);
    if (!m) {
      m = { code: r.code, connectionIds: [], models: [], roles: [], count: 0 };
      by.set(r.code, m);
    }
    m.count++;
    if (r.connectionId && !m.connectionIds.includes(r.connectionId)) {
      m.connectionIds.push(r.connectionId);
    }
    if (r.model && !m.models.includes(r.model)) m.models.push(r.model);
    if (r.role && !m.roles.includes(r.role)) m.roles.push(r.role);
  }
  const out = [...by.values()];
  for (const m of out) {
    m.connectionIds.sort();
    m.models.sort();
    m.roles.sort((a, b) => roleRank(a) - roleRank(b) || (a < b ? -1 : a > b ? 1 : 0));
  }
  return out.sort((a, b) => PROBLEM_CODES.indexOf(a.code) - PROBLEM_CODES.indexOf(b.code));
}

/** Self-healing problems toast only after this long without recovery (10.2). */
export const SELF_HEALING_TOAST_MS = 10 * 60_000;

/** Whether a problem gets a toast now, stays on the overview only, or waits for a scene. */
export function toastDecision(input: {
  code: ProblemCode;
  firstSeenMs: number;
  nowMs: number;
  toastedThisSession: boolean;
  inReservedScene: boolean;
}): 'toast' | 'panel_only' | 'defer' {
  if (input.toastedThisSession) return 'panel_only';
  if (PROBLEMS[input.code].selfHealing && input.nowMs - input.firstSeenMs < SELF_HEALING_TOAST_MS) {
    return 'panel_only';
  }
  return input.inReservedScene ? 'defer' : 'toast';
}
