// Request execution in the utility process. Provider adapters are shared with every host;
// only this boundary owns network access, credentials, cancellation and persisted spend.

import { Budget, type Cost } from '../../src/ai/budget';
import type { LlmCallResult, LlmCallSpec, ProblemCode } from '../../src/ai/contracts';
import { checkGatewayRoute, connectionFingerprint } from '../../src/ai/gateway/guard';
import type { LlmSettings } from '../../src/ai/llm_config/settings';
import { costWithCard, estimateTokens, fallbackCardOf } from '../../src/ai/pricing';
import {
  adapterFor,
  fetchModelListing,
  fillEstimatedInput,
  runConnectionTest,
} from '../../src/ai/providers';
import type {
  AdapterHttpRequest,
  AdapterHttpResponse,
  AdapterSend,
  ConnectionPublic,
} from '../../src/ai/providers/types';
import { redact } from '../logging';
import { containsCredential } from './credential_filter';
import { failedResult, type LedgerWindow } from './protocol';

export interface GatewayLedgerEntry {
  id: string;
  at: number;
  day: string;
  run: string;
  scope?: string;
  connectionId: string;
  model: string;
  role: string;
  status: 'ok' | 'failed' | 'aborted' | 'timeout' | 'pending';
  tokens: number;
  usd?: number;
  latencyMs: number;
  problem?: ProblemCode;
  source?: 'game' | 'test';
}

interface PersistedSpend {
  version: 1;
  entries: GatewayLedgerEntry[];
  days: Record<string, Cost>;
  runs: Record<string, Cost>;
}

/** The host sender uses Electron net.fetch with manual redirects. Credentials never ride back. */
export type GatewaySend = (
  request: AdapterHttpRequest,
  signal: AbortSignal,
) => Promise<AdapterHttpResponse>;

export interface GatewayRuntimeOptions {
  settings(): LlmSettings;
  secret(connectionId: string, target: string, requestedFingerprint: string): string | undefined;
  send: GatewaySend;
  now?(): number;
  runId?(): string;
  restored?: unknown;
  persist?(state: unknown): void;
}

function dayKey(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function validCost(v: unknown): v is Cost {
  const x = v as Cost | null;
  return (
    !!x &&
    Number.isFinite(x.tokens) &&
    x.tokens >= 0 &&
    (x.usd === undefined || (Number.isFinite(x.usd) && x.usd >= 0))
  );
}

function restoredState(raw: unknown): PersistedSpend {
  const empty: PersistedSpend = { version: 1, entries: [], days: {}, runs: {} };
  if (!raw) return empty;
  const v = raw as Partial<PersistedSpend>;
  if (v.version !== 1 || !Array.isArray(v.entries) || !v.days || !v.runs) {
    throw new Error('gateway spend state is unreadable');
  }
  for (const [k, cost] of Object.entries(v.days)) {
    if (k.length > 32 || !validCost(cost)) throw new Error('gateway day spend is invalid');
    empty.days[k] = { tokens: cost.tokens, ...(cost.usd !== undefined ? { usd: cost.usd } : {}) };
  }
  for (const [k, cost] of Object.entries(v.runs)) {
    if (k.length > 128 || !validCost(cost)) throw new Error('gateway run spend is invalid');
    empty.runs[k] = { tokens: cost.tokens, ...(cost.usd !== undefined ? { usd: cost.usd } : {}) };
  }
  for (const rawEntry of v.entries) {
    const e = rawEntry as GatewayLedgerEntry;
    if (
      !e ||
      typeof e.id !== 'string' ||
      e.id.length > 96 ||
      !validCost(e) ||
      !Number.isFinite(e.at) ||
      typeof e.day !== 'string' ||
      typeof e.run !== 'string' ||
      typeof e.connectionId !== 'string' ||
      typeof e.model !== 'string' ||
      typeof e.role !== 'string' ||
      !Number.isFinite(e.latencyMs) ||
      !['ok', 'failed', 'aborted', 'timeout', 'pending'].includes(e.status)
    ) {
      throw new Error('gateway ledger entry is invalid');
    }
    // Whitelist fields: a corrupted or newer document cannot smuggle prompt text into replies.
    empty.entries.push({
      id: e.id,
      at: e.at,
      day: e.day,
      run: e.run,
      connectionId: e.connectionId.slice(0, 64),
      model: e.model.slice(0, 200),
      role: e.role.slice(0, 64),
      status: e.status,
      tokens: e.tokens,
      latencyMs: e.latencyMs,
      ...(typeof e.scope === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(e.scope)
        ? { scope: e.scope }
        : {}),
      ...(e.source === 'game' || e.source === 'test' ? { source: e.source } : {}),
      ...(e.usd !== undefined ? { usd: e.usd } : {}),
    });
  }
  return empty;
}

export function createGatewayRuntime(opts: GatewayRuntimeOptions) {
  const now = opts.now ?? Date.now;
  // Until the call contract names a save lineage, conservatively share run spend globally.
  const runId = opts.runId ?? (() => 'device');
  const state = restoredState(opts.restored);
  const active = new Map<
    string,
    { controller: AbortController; cancel: (timeout?: boolean) => void; connectionId: string }
  >();
  let scope = 'device';
  const seen = new Set(state.entries.map((e) => `${e.scope ?? 'device'}/${e.id}`));
  const requests = new Map<string, number[]>();
  const budget = new Budget(
    { caps: opts.settings().caps },
    { now },
    { dayKey: () => dayKey(now()), runId },
  );
  const hourly = state.entries.filter((e) => e.at >= now() - 3_600_000);
  budget.seed({
    hour: hourly.reduce<Cost>(
      (a, e) => ({ tokens: a.tokens + e.tokens, usd: (a.usd ?? 0) + (e.usd ?? 0) }),
      { tokens: 0, usd: 0 },
    ),
    day: state.days[dayKey(now())],
    run: state.runs[runId()],
  });
  const write = () =>
    opts.persist?.({
      ...state,
      entries: state.entries.filter(
        (e, i, all) => e.at >= now() - 3_600_000 || i >= all.length - 500,
      ),
    });
  const total = (book: Record<string, Cost>, key: string, cost: Cost, multiplier: number) => {
    const prev = book[key] ?? { tokens: 0, usd: 0 };
    book[key] = {
      tokens: Math.max(0, prev.tokens + cost.tokens * multiplier),
      usd: Math.max(0, (prev.usd ?? 0) + (cost.usd ?? 0) * multiplier),
    };
    if (book === state.days) {
      while (Object.keys(book).length > 90) delete book[Object.keys(book)[0] as string];
    }
  };
  const allSecrets = (c: ConnectionPublic) =>
    ['key', ...c.extraHeaderNames.map((h) => `header:${h}`)]
      .map((target) => opts.secret(c.id, target, connectionFingerprint(c)))
      .filter((x): x is string => !!x);
  const headers = (
    c: ConnectionPublic,
    request: AdapterHttpRequest,
    held: Set<string>,
  ): AdapterHttpRequest | null => {
    const h = { ...request.headers };
    const requestedFingerprint = connectionFingerprint(c);
    const key = opts.secret(c.id, 'key', requestedFingerprint);
    if (c.auth.scheme !== 'none' && !key) return null;
    if (key) {
      if (c.auth.scheme === 'bearer') h.Authorization = `Bearer ${key}`;
      else if (c.auth.scheme === 'x_api_key') h['x-api-key'] = key;
      else if (c.auth.scheme === 'custom_header' && c.auth.headerName) h[c.auth.headerName] = key;
      held.add(key);
    }
    for (const name of c.extraHeaderNames) {
      const value = opts.secret(c.id, `header:${name}`, requestedFingerprint);
      if (!value) return null;
      h[name] = value;
      held.add(value);
    }
    return { ...request, headers: h };
  };
  const fail = (message: string, problem: ProblemCode = 'not_configured') =>
    failedResult('bad_request', message, problem);
  const sanitize = (
    result: LlmCallResult,
    c: ConnectionPublic,
    held: Set<string>,
  ): LlmCallResult => {
    // Credentials echoed in a provider response must not cross into the game either.
    const credentials = [...held, ...allSecrets(c)];
    const leaks = containsCredential(result, credentials);
    if (!leaks) {
      return result.error
        ? {
            ...result,
            error: { ...result.error, message: redact(result.error.message, credentials) },
          }
        : result;
    }
    // A scrubbed JSON string may no longer match its structured output schema. Fail closed.
    return failedResult(
      'bad_request',
      'provider response contained credential material',
      'bad_output',
    );
  };

  const connectionSend =
    (c: ConnectionPublic, held: Set<string>): AdapterSend =>
    async (req, options) => {
      const authed = headers(c, req, held);
      if (!authed) return { ok: false, netError: 'other', latencyMs: 0 };
      const recent = (requests.get(c.id) ?? []).filter((t) => t > now() - 60_000);
      requests.set(c.id, recent);
      if (
        recent.length >= (c.kind === 'local' ? 60 : 120) ||
        [...active.values()].filter((a) => a.connectionId === c.id).length >= c.maxInFlight
      ) {
        return { ok: false, netError: 'other', latencyMs: 0 };
      }
      recent.push(now());
      const controller = new AbortController();
      const start = now();
      const requestId = `test-${start}-${recent.length}`;
      // Explicit tests bypass caps, but their conservative cost still counts in the book.
      const body = req.body ? (JSON.parse(req.body) as Record<string, unknown>) : {};
      const output = Number(body.max_tokens ?? body.max_completion_tokens ?? 128);
      const model = typeof body.model === 'string' ? body.model : (c.models[0]?.model ?? '');
      const profile = c.models.find((p) => p.model === model);
      const usage = {
        inputTokens: estimateTokens(req.body ?? ''),
        outputTokens: Number.isFinite(output) ? Math.max(0, Math.min(16000, output)) : 128,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      };
      const cost: Cost = {
        tokens: req.method === 'GET' ? 0 : usage.inputTokens + usage.outputTokens,
        ...(profile?.price
          ? {
              usd:
                req.method === 'GET'
                  ? 0
                  : costWithCard(profile.price, usage, opts.settings().caps.fxCnyPerUsd),
            }
          : {}),
      };
      const entry: GatewayLedgerEntry = {
        id: requestId,
        at: start,
        day: dayKey(start),
        run: runId(),
        scope,
        connectionId: c.id,
        model,
        role: 'connection_test',
        status: 'pending',
        source: 'test',
        latencyMs: 0,
        ...cost,
      };
      budget.reserve(requestId, 'connection_test', cost, 'test');
      state.entries.push(entry);
      total(state.days, entry.day, cost, 1);
      total(state.runs, entry.run, cost, 1);
      try {
        write();
      } catch {
        budget.release(requestId);
        total(state.days, entry.day, cost, -1);
        total(state.runs, entry.run, cost, -1);
        state.entries.pop();
        return { ok: false, netError: 'other', latencyMs: 0 };
      }
      active.set(requestId, { controller, cancel: () => controller.abort(), connectionId: c.id });
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stop = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => {
            controller.abort();
            reject(new Error('timeout'));
          },
          Math.min(300_000, options.timeoutMs),
        );
      });
      try {
        const res = await Promise.race([opts.send(authed, controller.signal), stop]);
        entry.status = res.status >= 200 && res.status < 300 ? 'ok' : 'failed';
        return { ok: true, res };
      } catch {
        entry.status = controller.signal.aborted ? 'timeout' : 'failed';
        return {
          ok: false,
          netError: controller.signal.aborted ? 'timeout' : 'other',
          latencyMs: now() - start,
        };
      } finally {
        clearTimeout(timer);
        active.delete(requestId);
        budget.settle(requestId, cost);
        entry.latencyMs = now() - start;
        try {
          write();
        } catch {
          /* Persisted test reservation remains conservative. */
        }
      }
    };

  return {
    async call(spec: LlmCallSpec): Promise<LlmCallResult> {
      const requestKey = `${scope}/${spec.requestId}`;
      if (seen.has(requestKey)) return failedResult('bad_request', 'duplicate request id');
      const settings = opts.settings();
      budget.setConfig({ caps: settings.caps });
      const route = checkGatewayRoute(settings, spec);
      if (!route.ok) return fail(route.message);
      const c = route.connection;
      const held = new Set(allSecrets(c));
      const count = [...active.values()].filter((a) => a.connectionId === c.id).length;
      const recent = (requests.get(c.id) ?? []).filter((t) => t > now() - 60_000);
      requests.set(c.id, recent);
      if (count >= c.maxInFlight || recent.length >= (c.kind === 'local' ? 60 : 120)) {
        return failedResult('rate_limited', 'gateway rate or concurrency limit', 'rate_limited');
      }
      const request = adapterFor(c.kind).build(spec, c, route.profile);
      const authed = headers(c, request, held);
      if (!authed) return fail('connection credentials are missing');
      if (budget.canAfford(spec.bindingRole, route.reserve, { reserved: true }) !== 'ok') {
        return fail('gateway spending limit reached', 'cap_reached');
      }
      seen.add(requestKey);
      if (seen.size > 10_000) seen.delete(seen.values().next().value as string);
      recent.push(now());
      budget.reserve(requestKey, spec.bindingRole, route.reserve);
      const entry: GatewayLedgerEntry = {
        id: spec.requestId,
        at: now(),
        day: dayKey(now()),
        run: runId(),
        scope,
        connectionId: c.id,
        model: spec.model,
        role: spec.bindingRole,
        status: 'pending',
        source: 'game',
        ...route.reserve,
        latencyMs: 0,
      };
      state.entries.push(entry);
      total(state.days, entry.day, route.reserve, 1);
      total(state.runs, entry.run, route.reserve, 1);
      try {
        write();
      } catch {
        budget.release(requestKey);
        total(state.days, entry.day, route.reserve, -1);
        total(state.runs, entry.run, route.reserve, -1);
        state.entries.pop();
        return failedResult('network', 'spend book could not be persisted', 'network');
      }
      const controller = new AbortController();
      let cancel: (timeout?: boolean) => void = () => {};
      const cancelled = new Promise<LlmCallResult>((resolve) => {
        cancel = (timeout = false) => {
          controller.abort();
          entry.status = timeout ? 'timeout' : 'aborted';
          resolve(
            failedResult(
              timeout ? 'timeout' : 'network',
              timeout ? 'request timed out' : 'aborted',
              timeout ? 'timeout' : undefined,
            ),
          );
        };
      });
      active.set(requestKey, { controller, cancel, connectionId: c.id });
      const timer = setTimeout(() => cancel(true), Math.min(300_000, spec.timeoutMs));
      const adapter = adapterFor(c.kind);
      const sent = opts
        .send(authed, controller.signal)
        .then((res) => {
          if (request.read === 'json')
            return fillEstimatedInput(
              adapter.parse(res.status, res.body, res.latencyMs, route.profile, res.headers),
              spec,
            );
          const stream = adapter.parseStreamEvent(
            adapter.startStream(route.profile, res.headers),
            res.body,
          );
          return fillEstimatedInput(
            adapter.endStream(stream.state, res.latencyMs, route.profile),
            spec,
          );
        })
        .catch(() => failedResult('network', 'provider transport failed', 'network'));
      let result = await Promise.race([sent, cancelled]);
      clearTimeout(timer);
      active.delete(requestKey);
      result = sanitize(result, c, held);
      const settledCard = result.fallbackUsed
        ? (fallbackCardOf(route.profile.model) ?? route.profile.price)
        : route.profile.price;
      const settled: Cost = result.usage
        ? {
            tokens:
              result.usage.inputTokens +
              result.usage.cacheReadInputTokens +
              result.usage.cacheCreationInputTokens +
              result.usage.outputTokens,
            ...(settledCard
              ? { usd: costWithCard(settledCard, result.usage, settings.caps.fxCnyPerUsd) }
              : {}),
          }
        : route.reserve;
      budget.settle(requestKey, settled);
      total(state.days, entry.day, route.reserve, -1);
      total(state.runs, entry.run, route.reserve, -1);
      total(state.days, entry.day, settled, 1);
      total(state.runs, entry.run, settled, 1);
      if (entry.status === 'pending') entry.status = result.ok ? 'ok' : 'failed';
      Object.assign(entry, settled, {
        latencyMs: now() - entry.at,
        ...(result.problem ? { problem: result.problem } : {}),
      });
      // Keep every reservation in the hour window; older entries are already in the totals.
      state.entries = state.entries.filter(
        (e, i, all) => e.at >= now() - 3_600_000 || i >= all.length - 500,
      );
      try {
        write();
      } catch {
        /* The persisted reservation remains conservative after restart. */
      }
      return { ...result, ...(settled.usd !== undefined ? { costUsd: settled.usd } : {}) };
    },
    abort(id: string) {
      active.get(`${scope}/${id}`)?.cancel();
    },
    abortAll() {
      for (const a of active.values()) a.cancel(true);
    },
    abortConnection(connectionId: string) {
      for (const a of active.values()) if (a.connectionId === connectionId) a.cancel();
    },
    setScope(hint: string) {
      // Renderer hints isolate request ids only. They never reset the authoritative caps.
      if (!/^[A-Za-z0-9_-]{1,128}$/.test(hint)) return false;
      for (const a of active.values()) a.cancel();
      scope = hint;
      return true;
    },
    ledger(window: LedgerWindow) {
      const snapshot = budget.snapshot();
      const entries = state.entries
        .filter((e) =>
          window === 'hour'
            ? e.at >= now() - 3_600_000
            : window === 'day'
              ? e.day === dayKey(now())
              : e.run === runId(),
        )
        .slice(-500);
      return { snapshot, entries: entries.map((e) => ({ ...e })) };
    },
    async models(connectionId: string) {
      const c = opts.settings().connections.find((v) => v.id === connectionId);
      if (!c) return { connectionId, ok: false, models: [], problem: 'not_configured' };
      const held = new Set(allSecrets(c));
      const listing = await fetchModelListing(c, connectionSend(c, held));
      if (containsCredential(listing, held)) {
        return { connectionId, ok: false, models: [], problem: 'bad_output' };
      }
      return listing;
    },
    async test(connectionId: string, depth: 'quick' | 'deep', models?: string[]) {
      const c = opts.settings().connections.find((v) => v.id === connectionId);
      if (!c) return null;
      const held = new Set(allSecrets(c));
      const report = await runConnectionTest(
        {
          conn: c,
          depth,
          profiles: models ? c.models.filter((p) => models.includes(p.model)) : c.models,
          hasKey: c.auth.scheme === 'none' || !!opts.secret(c.id, 'key', connectionFingerprint(c)),
          testedAt: new Date(now()).toISOString(),
        },
        connectionSend(c, held),
      );
      return containsCredential(report, held) ? null : report;
    },
  };
}
