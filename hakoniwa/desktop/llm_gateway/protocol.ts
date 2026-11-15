// Messages between the main process and the model gateway utility process
// (docs/50_tech/release_engineering.md 2.1 and 2.4, llm_providers.md 7). The gateway checks
// every incoming envelope again (the second guard level) and never trusts that the main
// process already did. Pure.

import type {
  LlmCallResult,
  LlmCallSpec,
  ProblemCode,
  ProviderErrorClass,
} from '../../src/ai/contracts';

/** Key status as the game sees it (llm_providers.md 7.2): never the key, at most its last four. */
export interface KeyStatus {
  state: 'none' | 'saved' | 'session_only';
  last4?: string;
  savedAt?: string;
  backend: 'os_keychain' | 'memory_only';
}

export type LedgerWindow = 'hour' | 'day' | 'run';

/** Main to gateway. `request` travels with exactly one MessagePort; nothing else carries one. */
export type ToGateway =
  | { kind: 'request'; spec: LlmCallSpec }
  | { kind: 'abort'; requestId: string }
  | { kind: 'secret.put'; id: number; connectionId: string; target: string; secret: string }
  | { kind: 'secret.has'; id: number; connectionId: string }
  | { kind: 'secret.clear'; id: number; connectionId: string }
  | { kind: 'models'; id: number; connectionId: string }
  | { kind: 'test'; id: number; connectionId: string; depth: 'quick' | 'deep'; models?: string[] }
  | { kind: 'ledger'; id: number; window: LedgerWindow }
  | { kind: 'wipe'; id: number };

export type GatewayCallKind = Exclude<ToGateway['kind'], 'request' | 'abort'>;

export type GatewayReason = 'bad_request' | 'not_implemented' | 'unavailable';

/** Gateway to main. Replies answer one numbered call; problems are pushes. */
export type FromGateway =
  | { kind: 'reply'; id: number; ok: true; value: unknown }
  | { kind: 'reply'; id: number; ok: false; reason: GatewayReason }
  | { kind: 'problem'; problem: ProblemCode; connectionId?: string };

const CONNECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const TARGET = /^(key|header:[A-Za-z0-9-]{1,64})$/;
/** Same bounds as the key entry rules (desktop/key_entry/rules.ts). */
const MAX_SECRET = 512;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isId = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= Number.MAX_SAFE_INTEGER;
const isConn = (v: unknown): v is string => typeof v === 'string' && CONNECTION_ID.test(v);

const KEYS: Record<ToGateway['kind'], readonly string[]> = {
  request: ['kind', 'spec'],
  abort: ['kind', 'requestId'],
  'secret.put': ['kind', 'id', 'connectionId', 'target', 'secret'],
  'secret.has': ['kind', 'id', 'connectionId'],
  'secret.clear': ['kind', 'id', 'connectionId'],
  models: ['kind', 'id', 'connectionId'],
  test: ['kind', 'id', 'connectionId', 'depth', 'models'],
  ledger: ['kind', 'id', 'window'],
  wipe: ['kind', 'id'],
};

/**
 * Check an envelope from the main process: a known kind, only that kind's fields, the right
 * types. The request spec itself is checked by parseCallSpec in the gateway core.
 */
export function parseToGateway(raw: unknown): { ok: true; msg: ToGateway } | { ok: false } {
  if (!isObj(raw) || typeof raw.kind !== 'string' || !Object.hasOwn(KEYS, raw.kind)) {
    return { ok: false };
  }
  const kind = raw.kind as ToGateway['kind'];
  const allowed = KEYS[kind];
  if (Object.keys(raw).some((k) => !allowed.includes(k))) return { ok: false };
  const m = raw;
  switch (kind) {
    case 'request':
      return isObj(m.spec) ? { ok: true, msg: m as unknown as ToGateway } : { ok: false };
    case 'abort':
      return typeof m.requestId === 'string' && m.requestId.length <= 96
        ? { ok: true, msg: m as unknown as ToGateway }
        : { ok: false };
    case 'secret.put':
      return isId(m.id) &&
        isConn(m.connectionId) &&
        typeof m.target === 'string' &&
        TARGET.test(m.target) &&
        typeof m.secret === 'string' &&
        m.secret.length > 0 &&
        m.secret.length <= MAX_SECRET
        ? { ok: true, msg: m as unknown as ToGateway }
        : { ok: false };
    case 'secret.has':
    case 'secret.clear':
    case 'models':
      return isId(m.id) && isConn(m.connectionId)
        ? { ok: true, msg: m as unknown as ToGateway }
        : { ok: false };
    case 'test':
      return isId(m.id) &&
        isConn(m.connectionId) &&
        (m.depth === 'quick' || m.depth === 'deep') &&
        (m.models === undefined ||
          (Array.isArray(m.models) &&
            m.models.length <= 8 &&
            m.models.every((x) => typeof x === 'string' && x.length <= 200)))
        ? { ok: true, msg: m as unknown as ToGateway }
        : { ok: false };
    case 'ledger':
      return isId(m.id) && (m.window === 'hour' || m.window === 'day' || m.window === 'run')
        ? { ok: true, msg: m as unknown as ToGateway }
        : { ok: false };
    case 'wipe':
      return isId(m.id) ? { ok: true, msg: m as unknown as ToGateway } : { ok: false };
  }
}

const PROBLEMS: ReadonlySet<string> = new Set<ProblemCode>([
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
]);

/** Check a message from the gateway before the main process acts on it. */
export function parseFromGateway(raw: unknown): FromGateway | null {
  if (!isObj(raw)) return null;
  if (raw.kind === 'reply' && isId(raw.id) && typeof raw.ok === 'boolean') {
    if (raw.ok) return { kind: 'reply', id: raw.id, ok: true, value: raw.value };
    const reason = raw.reason;
    if (reason === 'bad_request' || reason === 'not_implemented' || reason === 'unavailable') {
      return { kind: 'reply', id: raw.id, ok: false, reason };
    }
    return null;
  }
  if (raw.kind === 'problem' && typeof raw.problem === 'string' && PROBLEMS.has(raw.problem)) {
    return {
      kind: 'problem',
      problem: raw.problem as ProblemCode,
      ...(isConn(raw.connectionId) ? { connectionId: raw.connectionId } : {}),
    };
  }
  return null;
}

/**
 * A failed call receipt in the shape every port answer uses (llm_providers.md 7.3). A spec
 * defect (7.4 item 2) is a bad_request with no player problem code; refusals the player can
 * act on carry one (not_configured, cap_reached and so on).
 */
export function failedResult(
  cls: ProviderErrorClass,
  message: string,
  problem?: ProblemCode,
): LlmCallResult {
  return { ok: false, error: { cls, message }, latencyMs: 0, ...(problem ? { problem } : {}) };
}
