// LocalHttpTransport (docs/50_tech/llm_providers.md 2.1, 6.2; release_engineering.md 13.9):
// the web demo talks straight to a model service on the player's own machine. Only 'local'
// connections on a loopback address are served (D-081: no cloud keys in a browser); the
// request and the answer go through the shared local adapter, the service's token lives in
// memory only, redirects are not followed, answers are bounded, and a failed fetch is told
// apart into "the service is not running" and "the browser blocked it" (CORS) with one
// no-cors probe. Fetch, clock and timers are injected, so the module stays host-neutral.

import type {
  AbortSignalLike,
  Clock,
  LlmCallResult,
  LlmCallSpec,
  LlmTransport,
  Timers,
} from '../contracts';
import { costWithCard, priceCardOf } from '../pricing';
import { checkBaseUrl } from '../providers/address';
import { SPEC_MAX_TIMEOUT_MS, SPEC_MAX_TOKENS_CAP } from '../providers/call_spec';
import { localAdapter } from '../providers/local';
import { failure, fillEstimatedInput, rootUrl } from '../providers/shared';
import type { ConnectionPublic, HeaderBag, NetErrorKind } from '../providers/types';

/** Answers larger than this are cut (llm_providers.md 7.5). */
export const MAX_LOCAL_ANSWER_BYTES = 2 * 1024 * 1024;

interface ReaderLike {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
  cancel?(): Promise<void>;
}

/** The fetch Response shape this transport reads (the browser's Response satisfies it). */
export interface FetchResponseLike {
  readonly status: number;
  readonly type?: string;
  readonly headers: { forEach(cb: (value: string, key: string) => void): void };
  text(): Promise<string>;
  readonly body?: { getReader(): ReaderLike } | null;
}

export type FetchFn = (
  url: string,
  init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
    redirect?: 'manual';
    mode?: 'cors' | 'no-cors';
    credentials?: 'omit';
    signal?: AbortSignalLike;
  },
) => Promise<FetchResponseLike>;

export interface LocalHttpOptions {
  /** The current local connections (from the settings; read on every call). */
  connections: () => readonly ConnectionPublic[];
  clock: Clock;
  /** Defaults to the global fetch. */
  fetch?: FetchFn;
  /** Defaults to setTimeout and clearTimeout. */
  timers?: Timers;
  /** The host's own loopback rule (PlatformHost.llm on the web), applied on top of ours. */
  endpointAllowed?: (url: string) => boolean;
}

function notConfigured(message: string): LlmCallResult {
  return { ok: false, error: { cls: 'auth', message }, problem: 'not_configured', latencyMs: 0 };
}

function aborted(latencyMs: number): LlmCallResult {
  return { ok: false, error: { cls: 'network', message: 'aborted' }, latencyMs };
}

function defaultFetch(): FetchFn | undefined {
  const f = (globalThis as { fetch?: unknown }).fetch;
  if (typeof f !== 'function') return undefined;
  const call = f as (this: unknown, u: string, i: unknown) => Promise<FetchResponseLike>;
  return (url, init) => call.call(globalThis, url, init);
}

function defaultTimers(): Timers {
  return {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: (h) => clearTimeout(h as Parameters<typeof clearTimeout>[0]),
  };
}

export class LocalHttpTransport implements LlmTransport {
  private readonly tokens = new Map<string, string>();
  private readonly timers: Timers;

  constructor(private readonly opts: LocalHttpOptions) {
    this.timers = opts.timers ?? defaultTimers();
  }

  /** The local service's token for this page only (never written to storage, 17). */
  setToken(connectionId: string, token: string | undefined): void {
    if (token) this.tokens.set(connectionId, token);
    else this.tokens.delete(connectionId);
  }

  hasToken(connectionId: string): boolean {
    return this.tokens.has(connectionId);
  }

  private authHeaders(conn: ConnectionPublic): Record<string, string> {
    const token = this.tokens.get(conn.id);
    if (!token) return {};
    if (conn.auth.scheme === 'x_api_key') return { 'x-api-key': token };
    if (conn.auth.scheme === 'custom_header') {
      return { [(conn.auth.headerName ?? 'x-api-key').toLowerCase()]: token };
    }
    return { authorization: `Bearer ${token}` };
  }

  /**
   * A browser fetch fails the same way for a stopped service and a CORS refusal; an opaque
   * no-cors request still reaches a running service, which tells the two apart.
   */
  private async diagnose(f: FetchFn, conn: ConnectionPublic): Promise<NetErrorKind> {
    try {
      await f(rootUrl(conn.baseUrl), { method: 'GET', mode: 'no-cors', credentials: 'omit' });
      return 'cors';
    } catch {
      return 'refused';
    }
  }

  async send(
    spec: LlmCallSpec,
    opts: { signal?: AbortSignalLike; onDelta?: (text: string) => void } = {},
  ): Promise<LlmCallResult> {
    const conn = this.opts.connections().find((c) => c.id === spec.connectionId);
    if (conn?.kind !== 'local' || spec.provider !== 'local') {
      return notConfigured(`no local connection ${spec.connectionId}`);
    }
    if (
      !checkBaseUrl(conn.baseUrl, 'local', { web: true, flavor: conn.flavor }).ok ||
      this.opts.endpointAllowed?.(conn.baseUrl) === false
    ) {
      return notConfigured('the web demo only reaches local services on loopback');
    }
    const prof = conn.models.find((m) => m.model === spec.model);
    if (!prof) return notConfigured(`model ${spec.model} is not enabled on ${conn.id}`);
    const f = this.opts.fetch ?? defaultFetch();
    if (!f) return notConfigured('no fetch in this host');
    if (opts.signal?.aborted) return aborted(0);

    const cap = prof.capability;
    const stream = spec.stream === true && cap.streaming === 'yes';
    const call: LlmCallSpec = {
      ...spec,
      stream,
      timeoutMs: Math.min(spec.timeoutMs, SPEC_MAX_TIMEOUT_MS),
      output: {
        ...spec.output,
        maxTokens: Math.min(
          spec.output.maxTokens,
          SPEC_MAX_TOKENS_CAP,
          cap.maxOutputTokens > 0 ? cap.maxOutputTokens : SPEC_MAX_TOKENS_CAP,
        ),
      },
    };
    const req = localAdapter.build(call, conn, prof);
    const t0 = this.opts.clock.now();
    const since = () => Math.max(0, this.opts.clock.now() - t0);
    const ctrl = typeof AbortController === 'function' ? new AbortController() : undefined;
    let timedOut = false;
    const timer = this.timers.set(() => {
      timedOut = true;
      ctrl?.abort();
    }, call.timeoutMs);
    opts.signal?.addEventListener('abort', () => ctrl?.abort());
    try {
      let res: FetchResponseLike;
      try {
        res = await f(req.url, {
          method: req.method,
          headers: { ...req.headers, ...this.authHeaders(conn) },
          ...(req.body !== undefined ? { body: req.body } : {}),
          redirect: 'manual',
          credentials: 'omit',
          signal: ctrl?.signal,
        });
      } catch {
        if (opts.signal?.aborted) return aborted(since());
        const kind: NetErrorKind = timedOut ? 'timeout' : await this.diagnose(f, conn);
        return failure(localAdapter.classify(0, '', {}, kind), since());
      }
      const firstByteMs = since();
      // A manual redirect surfaces as an opaque redirect without a status.
      const status = res.type === 'opaqueredirect' ? 302 : res.status;
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k.toLowerCase()] = v;
      });
      let result: LlmCallResult;
      try {
        const reader = stream && status >= 200 && status < 300 ? res.body?.getReader() : undefined;
        if (reader) result = await this.readStream(reader, prof, headers, opts, since);
        else {
          const body = (await res.text()).slice(0, MAX_LOCAL_ANSWER_BYTES);
          result = localAdapter.parse(status, body, since(), prof, headers);
        }
      } catch {
        // The body broke off: our timeout, the caller's abort, or the service dropped it.
        if (opts.signal?.aborted) return aborted(since());
        return failure(localAdapter.classify(0, '', {}, timedOut ? 'timeout' : 'reset'), since());
      }
      if (opts.signal?.aborted) return aborted(since());
      if (timedOut && !result.ok)
        return failure(localAdapter.classify(0, '', {}, 'timeout'), since());
      result.firstByteMs ??= firstByteMs;
      if (result.usage) {
        const card = prof.price ?? priceCardOf('local', prof.model);
        if (card) result.costUsd = costWithCard(card, result.usage);
      }
      return fillEstimatedInput(result, call);
    } finally {
      this.timers.clear(timer);
    }
  }

  private async readStream(
    reader: ReaderLike,
    prof: ConnectionPublic['models'][number],
    headers: HeaderBag,
    opts: { onDelta?: (text: string) => void },
    since: () => number,
  ): Promise<LlmCallResult> {
    const decoder = new TextDecoder();
    let state = localAdapter.startStream(prof, headers);
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value?.byteLength ?? 0;
        if (bytes > MAX_LOCAL_ANSWER_BYTES) {
          await reader.cancel?.();
          break;
        }
        const step = localAdapter.parseStreamEvent(state, decoder.decode(value, { stream: true }));
        state = step.state;
        for (const ev of step.events) if (ev.t === 'text') opts.onDelta?.(ev.text);
        if (state.done) break;
      }
    } catch {
      // A cut stream ends here; endStream fails it when it never finished.
    }
    return localAdapter.endStream(state, since(), prof);
  }
}
