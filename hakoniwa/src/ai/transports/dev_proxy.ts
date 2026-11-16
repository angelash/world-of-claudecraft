// DevProxyTransport (docs/50_tech/llm_providers.md 12; release_engineering.md 13.9): the
// development transport. It POSTs the LlmCallSpec to the dev server's model proxy and reads
// the LlmCallResult back (the proxy answers in one piece); it also reads the proxy's status
// (the pseudo connection 'dev_proxy', its slot models and the served connections), runs the
// connection test and lists models. Development builds only: the client imports this module
// under import.meta.env.DEV, so production builds drop it, and the editor workbench, which
// imports it directly, is not an entry of a release build (vite.config.ts, the desktop
// target); the release bundle never names the proxy's path. Not exported from the src/ai
// barrels for the same reason.

import type {
  AbortSignalLike,
  Clock,
  HttpTransport,
  LlmCallResult,
  LlmCallSpec,
  LlmTransport,
  Slot,
} from '../contracts';
import type { DevProxyFacts } from '../llm_config/presets';
import type { ConnectionPublic, ConnectionTestReport, ModelListing } from '../providers/types';

const LLM_PATH = '/api/llm';

export interface DevProxyStatus extends DevProxyFacts {
  /** Why the proxy cannot answer: no_credentials, auth_failed, network, no_proxy, ... */
  reason?: string;
}

export interface DevProxyTransportOptions {
  /** Origin of the dev server; '' (default) means same origin. */
  baseUrl?: string;
  /** Defaults to the global fetch. */
  transport?: HttpTransport;
  clock?: Clock;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function defaultTransport(): HttpTransport | undefined {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== 'function') return undefined;
  const call = f as (this: unknown, u: string, i: unknown) => ReturnType<HttpTransport>;
  return (url, init) => call.call(globalThis, url, init);
}

export class DevProxyTransport implements LlmTransport {
  private readonly base: string;

  constructor(private readonly opts: DevProxyTransportOptions = {}) {
    this.base = opts.baseUrl ?? '';
  }

  private http(): HttpTransport | undefined {
    return this.opts.transport ?? defaultTransport();
  }

  private since(t0: number): number {
    return this.opts.clock ? Math.max(0, this.opts.clock.now() - t0) : 0;
  }

  async send(spec: LlmCallSpec, opts: { signal?: AbortSignalLike } = {}): Promise<LlmCallResult> {
    const http = this.http();
    const t0 = this.opts.clock?.now() ?? 0;
    if (!http) {
      return {
        ok: false,
        error: { cls: 'auth', message: 'no fetch' },
        problem: 'not_configured',
        latencyMs: 0,
      };
    }
    let status: number;
    let body: unknown;
    try {
      const res = await http(`${this.base}${LLM_PATH}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(spec),
        signal: opts.signal,
      });
      status = res.status;
      body = await res.json().catch(() => undefined);
    } catch {
      return opts.signal?.aborted
        ? { ok: false, error: { cls: 'network', message: 'aborted' }, latencyMs: this.since(t0) }
        : {
            ok: false,
            error: { cls: 'network', message: 'the dev proxy is unreachable' },
            problem: 'network',
            latencyMs: this.since(t0),
          };
    }
    if (status === 404) {
      return {
        ok: false,
        error: { cls: 'auth', message: 'no dev proxy' },
        problem: 'not_configured',
        latencyMs: this.since(t0),
      };
    }
    if (isObj(body) && typeof body.ok === 'boolean' && typeof body.latencyMs === 'number') {
      return body as unknown as LlmCallResult;
    }
    if (isObj(body) && typeof body.ok === 'boolean' && isObj(body.error)) {
      return { ...(body as unknown as LlmCallResult), latencyMs: this.since(t0) };
    }
    return {
      ok: false,
      error: { cls: 'server', message: `unreadable proxy answer (HTTP ${status})` },
      problem: 'server_error',
      latencyMs: this.since(t0),
    };
  }

  /** GET status: whether the proxy answers, its slot models and served connections. */
  async status(signal?: AbortSignalLike): Promise<DevProxyStatus> {
    const http = this.http();
    if (!http) return { available: false, reason: 'no_transport' };
    try {
      const res = await http(`${this.base}${LLM_PATH}/status`, { method: 'GET', signal });
      if (res.status === 404) return { available: false, reason: 'no_proxy' };
      const body = await res.json();
      if (!isObj(body)) return { available: false, reason: 'bad_response' };
      const tiers: Partial<Record<Slot, string>> = {};
      if (isObj(body.tiers)) {
        for (const t of ['top', 'mid', 'low'] as const) {
          const m = body.tiers[t];
          if (typeof m === 'string') tiers[t] = m;
        }
      }
      const out: DevProxyStatus = { available: body.available === true, tiers };
      if (typeof body.reason === 'string') out.reason = body.reason;
      if (Array.isArray(body.connections)) {
        out.connections = body.connections.filter(isObj) as unknown as ConnectionPublic[];
      }
      return out;
    } catch {
      return { available: false, reason: 'network' };
    }
  }

  /** POST test: the connection test (quick or deep) of one served connection. */
  async test(body: {
    connectionId: string;
    depth: 'quick' | 'deep';
    models?: string[];
  }): Promise<ConnectionTestReport | undefined> {
    const http = this.http();
    if (!http) return undefined;
    try {
      const res = await http(`${this.base}${LLM_PATH}/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const v = await res.json();
      return res.status === 200 && isObj(v) ? (v as unknown as ConnectionTestReport) : undefined;
    } catch {
      return undefined;
    }
  }

  /** GET models: the model listing of one served connection. */
  async models(connectionId: string): Promise<ModelListing | undefined> {
    const http = this.http();
    if (!http) return undefined;
    try {
      const res = await http(
        `${this.base}${LLM_PATH}/models?connectionId=${encodeURIComponent(connectionId)}`,
        { method: 'GET' },
      );
      const v = await res.json();
      return res.status === 200 && isObj(v) ? (v as unknown as ModelListing) : undefined;
    } catch {
      return undefined;
    }
  }
}
