// Transports and the routed runner path (docs/50_tech/llm_providers.md 2.2, 7, 10, 14;
// release_engineering.md 13.9): TransportProvider over an injected LlmTransport; the desktop
// IpcTransport over the preload bridge's model channel; the web demo's LocalHttpTransport to
// loopback services only; the dev server's DevProxyTransport; and the runner's use of the
// receipts (price card settlement, estimated input, channel downgrades, bad-output runs,
// disabled models, circuits).

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { HkBridge } from '../desktop/bridge';
import type { LlmCallResult, LlmCallSpec, LlmTransport, LlmUsage } from '../src/ai/contracts';
import { EMPTY_USAGE } from '../src/ai/contracts';
import { createMockService } from '../src/ai/mocks/mock_service';
import { ScriptedTransport } from '../src/ai/mocks/scripted';
import { costWithCard, priceCardOf } from '../src/ai/pricing';
import {
  legacyErrorOf,
  outcomeFromResult,
  TransportProvider,
} from '../src/ai/providers/transport_provider';
import type { Capability, ConnectionPublic } from '../src/ai/providers/types';
import { DevProxyTransport } from '../src/ai/transports/dev_proxy';
import { type IpcLlmChannel, IpcTransport } from '../src/ai/transports/ipc';
import {
  type FetchFn,
  type FetchResponseLike,
  LocalHttpTransport,
} from '../src/ai/transports/local_http';
import {
  anthropicConn,
  done,
  localConn,
  preset,
  probeSystem,
  routedRunner,
} from './fixtures/llm_config/fixtures';

// Compile-time pin: the shell's bridge satisfies the channel IpcTransport needs.
const _pin: (b: HkBridge['llm']) => IpcLlmChannel = (b) => b;
void _pin;

function spec(extra: Partial<LlmCallSpec> = {}): LlmCallSpec {
  return {
    requestId: 'ai7#1',
    provider: 'local',
    connectionId: 'conn_local',
    slot: 'low',
    bindingRole: 'core_npc',
    model: 'mock-chat',
    segments: [
      { role: 'rules', text: '规则' },
      { role: 'turn', text: '本轮' },
    ],
    output: {
      schemaId: 'npc.daily',
      schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      maxTokens: 500,
    },
    timeoutMs: 10_000,
    reserve: { usd: 0, tokens: 600 },
    purpose: 'npc.daily/probe',
    ...extra,
  };
}

const okReceipt = (extra: Partial<LlmCallResult> = {}): LlmCallResult => ({
  ok: true,
  text: '{"commands":[]}',
  json: { commands: [] },
  usage: { ...EMPTY_USAGE, inputTokens: 10, outputTokens: 5 },
  latencyMs: 3,
  ...extra,
});

describe('TransportProvider', () => {
  it('passes routed specs through and turns a throwing transport into a network failure', async () => {
    const seen: LlmCallSpec[] = [];
    const p = new TransportProvider({
      send: async (s) => {
        seen.push(s);
        return okReceipt();
      },
    });
    expect(await p.call(spec())).toMatchObject({ ok: true });
    expect(seen[0]?.requestId).toBe('ai7#1');
    const broken = new TransportProvider({
      send: async () => {
        throw new Error('boom');
      },
    });
    expect(await broken.call(spec())).toMatchObject({ ok: false, problem: 'network' });
  });

  it('serves the legacy request through callSpecFromRequest with default route facts', async () => {
    const seen: LlmCallSpec[] = [];
    const p = new TransportProvider(
      {
        send: async (s) => {
          seen.push(s);
          return okReceipt({ servedModel: 'claude-sonnet-5' });
        },
      },
      {
        defaults: {
          provider: 'anthropic',
          connectionId: 'dev_proxy',
          tierModels: { mid: 'claude-sonnet-5-5' },
        },
      },
    );
    const req = {
      requestId: 'ai3',
      tier: 'mid' as const,
      system: '规则',
      stable: '人设',
      context: '本轮',
      schema: { type: 'object' },
      maxTokens: 800,
      purpose: 'npc.dialogue/turn',
    };
    const out = await p.complete(req);
    expect(out).toMatchObject({ ok: true, model: 'claude-sonnet-5', json: { commands: [] } });
    expect(seen[0]).toMatchObject({
      connectionId: 'dev_proxy',
      model: 'claude-sonnet-5-5',
      slot: 'mid',
      requestId: 'ai3#1',
    });
    expect(await p.complete({ ...req, tier: 'top' })).toMatchObject({
      ok: false,
      problem: 'not_configured',
    });
  });

  it('maps receipts to the legacy outcome and error codes', () => {
    const fail = (
      cls: NonNullable<LlmCallResult['error']>['cls'],
      extra: Partial<LlmCallResult> = {},
    ) => ({ ok: false, error: { cls, message: 'm' }, latencyMs: 0, ...extra }) as LlmCallResult;
    expect(legacyErrorOf(fail('auth', { problem: 'not_configured' }))).toBe('no_credentials');
    expect(legacyErrorOf(fail('auth', { problem: 'key_invalid' }))).toBe('auth_failed');
    expect(legacyErrorOf(fail('quota'))).toBe('auth_failed');
    expect(legacyErrorOf(fail('server'))).toBe('server_error');
    expect(legacyErrorOf(fail('context_too_long'))).toBe('bad_request');
    expect(
      legacyErrorOf({
        ok: false,
        error: { cls: 'model_unavailable', message: 'model_off' },
        latencyMs: 0,
      }),
    ).toBe('model_off');
    const o = outcomeFromResult(
      fail('rate_limited', { problem: 'rate_limited', usage: { ...EMPTY_USAGE }, costUsd: 0.001 }),
      'm1',
    );
    expect(o).toMatchObject({
      ok: false,
      error: 'rate_limited',
      problem: 'rate_limited',
      costUsd: 0.001,
    });
  });
});

describe('IpcTransport (desktop)', () => {
  function channel(answer: (s: LlmCallSpec, d?: (t: string) => void) => Promise<LlmCallResult>) {
    const aborted: string[] = [];
    const ch: IpcLlmChannel = { request: answer, abort: (id) => void aborted.push(id) };
    return { ch, aborted };
  }

  it('hands the spec to the bridge and streams deltas', async () => {
    const { ch } = channel(async (_s, d) => {
      d?.('{"comm');
      d?.('ands":[]}');
      return okReceipt();
    });
    const deltas: string[] = [];
    const r = await new IpcTransport(ch).send(spec(), { onDelta: (t) => deltas.push(t) });
    expect(r.ok).toBe(true);
    expect(deltas.join('')).toBe('{"commands":[]}');
  });

  it('aborts through hk:llm.abort, and guards against malformed receipts', async () => {
    let release: (r: LlmCallResult) => void = () => {};
    const { ch, aborted } = channel(() => new Promise((r) => (release = r)));
    const ctrl = new AbortController();
    const pending = new IpcTransport(ch).send(spec(), { signal: ctrl.signal });
    ctrl.abort();
    // The gateway still answers for what was sent: the late receipt keeps its usage (7.3).
    release(okReceipt({ costUsd: 0.002 }));
    expect(await pending).toMatchObject({ ok: true, costUsd: 0.002 });
    expect(aborted).toEqual(['ai7#1']);
    let fail: (e: Error) => void = () => {};
    const dropped = channel(() => new Promise((_r, j) => (fail = j)));
    const c2 = new AbortController();
    const p2 = new IpcTransport(dropped.ch).send(spec(), { signal: c2.signal });
    c2.abort();
    fail(new Error('port closed'));
    expect(await p2).toMatchObject({ ok: false, error: { message: 'aborted' } });
    const pre = new AbortController();
    pre.abort();
    const never = channel(async () => okReceipt());
    expect(await new IpcTransport(never.ch).send(spec(), { signal: pre.signal })).toMatchObject({
      ok: false,
    });
    const bad = channel(async () => ({ nonsense: true }) as unknown as LlmCallResult);
    expect(await new IpcTransport(bad.ch).send(spec())).toMatchObject({
      ok: false,
      error: { cls: 'bad_request' },
    });
    const thrown = channel(async () => {
      throw new Error('ipc');
    });
    expect(await new IpcTransport(thrown.ch).send(spec())).toMatchObject({
      ok: false,
      problem: 'network',
    });
  });
});

describe('LocalHttpTransport (web demo)', () => {
  const genericLocal = (baseUrl = 'http://127.0.0.1:8080/v1'): ConnectionPublic => ({
    ...localConn('conn_local', ['mock-chat'], baseUrl),
    flavor: 'generic',
    models: localConn('x', ['mock-chat']).models.map((m) => ({
      ...m,
      capability: { ...m.capability },
    })),
  });

  /** A fetch backed by the mock service; records every request. */
  function serviceFetch(opts: Parameters<typeof createMockService>[0] = {}) {
    const svc = createMockService(opts);
    const seen: { url: string; headers: Record<string, string> }[] = [];
    const f: FetchFn = async (url, init) => {
      seen.push({ url, headers: init.headers ?? {} });
      const u = new URL(url);
      const out = svc.handle({
        method: init.method,
        path: u.pathname + u.search,
        headers: Object.fromEntries(
          Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
        ),
        body: init.body ?? '',
      });
      const chunks = out.chunks.map((c) => new TextEncoder().encode(c));
      const res: FetchResponseLike = {
        status: out.status,
        headers: {
          forEach: (cb) => {
            for (const [k, v] of Object.entries(out.headers)) cb(v, k);
          },
        },
        text: async () => out.chunks.join(''),
        body: {
          getReader() {
            let i = 0;
            return {
              read: async () =>
                i < chunks.length ? { done: false, value: chunks[i++] } : { done: true },
            };
          },
        },
      };
      return res;
    };
    return { f, seen, svc };
  }

  const clock = { now: () => 0 };

  it('refuses anything but enabled models of local services on loopback', async () => {
    const { f, seen } = serviceFetch();
    const t = (conns: ConnectionPublic[]) =>
      new LocalHttpTransport({ connections: () => conns, clock, fetch: f });
    expect(await t([genericLocal('http://192.168.1.4:8080/v1')]).send(spec())).toMatchObject({
      problem: 'not_configured',
    });
    expect(await t([anthropicConn('conn_local')]).send(spec())).toMatchObject({
      problem: 'not_configured',
    });
    expect(await t([genericLocal()]).send(spec({ model: 'other' }))).toMatchObject({
      problem: 'not_configured',
    });
    expect(await t([]).send(spec())).toMatchObject({ problem: 'not_configured' });
    expect(seen).toHaveLength(0);
  });

  it('answers through the shared local adapter, prices at zero and keeps the token in memory', async () => {
    const { f, seen } = serviceFetch({
      answer: () => ({ commands: [{ kind: 'x', data: '{}' }] }),
      requireKey: 'tok-local-1',
    });
    const t = new LocalHttpTransport({ connections: () => [genericLocal()], clock, fetch: f });
    expect(await t.send(spec())).toMatchObject({ ok: false, problem: 'key_invalid' });
    t.setToken('conn_local', 'tok-local-1');
    const r = await t.send(spec());
    expect(r).toMatchObject({
      ok: true,
      json: { commands: [{ kind: 'x', data: '{}' }] },
      costUsd: 0,
    });
    expect(seen[1]?.url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    expect(seen[1]?.headers.authorization).toBe('Bearer tok-local-1');
  });

  it('streams deltas when the spec and the capability allow it', async () => {
    const { f } = serviceFetch({ answer: () => ({ commands: [] }), pieceChars: 4 });
    const t = new LocalHttpTransport({ connections: () => [genericLocal()], clock, fetch: f });
    const deltas: string[] = [];
    const r = await t.send(spec({ stream: true }), { onDelta: (d) => deltas.push(d) });
    expect(r).toMatchObject({ ok: true, json: { commands: [] } });
    expect(deltas.length).toBeGreaterThan(1);
    expect(deltas.join('')).toBe('{"commands":[]}');
    // The request asks for usage on the stream (stream_options), and the service sends it.
    expect(r.usageEstimated).toBeUndefined();
    expect(r.usage?.outputTokens).toBeGreaterThan(0);
  });

  it('tells a blocked page (CORS) from a stopped service, and reports redirects as a wrong address', async () => {
    const corsFetch: FetchFn = async (_u, init) => {
      if (init.mode === 'no-cors')
        return { status: 0, type: 'opaque', headers: { forEach: () => {} }, text: async () => '' };
      throw new TypeError('Failed to fetch');
    };
    const conns = () => [genericLocal()];
    expect(
      await new LocalHttpTransport({ connections: conns, clock, fetch: corsFetch }).send(spec()),
    ).toMatchObject({
      problem: 'cors_blocked',
    });
    const down: FetchFn = async () => {
      throw new TypeError('Failed to fetch');
    };
    expect(
      await new LocalHttpTransport({ connections: conns, clock, fetch: down }).send(spec()),
    ).toMatchObject({
      problem: 'network',
    });
    const redirect: FetchFn = async () => ({
      status: 0,
      type: 'opaqueredirect',
      headers: { forEach: () => {} },
      text: async () => '',
    });
    expect(
      await new LocalHttpTransport({ connections: conns, clock, fetch: redirect }).send(spec()),
    ).toMatchObject({
      problem: 'endpoint_wrong',
    });
  });

  it('reports a body that breaks off as a dropped connection, not a thrown error', async () => {
    const broken: FetchFn = async () => ({
      status: 200,
      headers: { forEach: () => {} },
      text: async () => {
        throw new Error('reset');
      },
    });
    const t = new LocalHttpTransport({ connections: () => [genericLocal()], clock, fetch: broken });
    expect(await t.send(spec())).toMatchObject({ ok: false, problem: 'network' });
  });

  it('times out by the spec timeout', async () => {
    const pending: (() => void)[] = [];
    const timers = { set: (fn: () => void) => pending.push(fn), clear: () => {} };
    const hang: FetchFn = (_u, init) =>
      new Promise((_r, reject) =>
        init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      );
    const t = new LocalHttpTransport({
      connections: () => [genericLocal()],
      clock,
      fetch: hang,
      timers,
    });
    const p = t.send(spec());
    await Promise.resolve();
    pending[0]?.();
    expect(await p).toMatchObject({ ok: false, problem: 'timeout' });
  });
});

describe('DevProxyTransport (development)', () => {
  it('posts the spec to the dev server and reads the receipt and the status', async () => {
    const calls: { url: string; body?: string }[] = [];
    const http = async (url: string, init: { body?: string }) => {
      calls.push({ url, body: init.body });
      if (url.endsWith('/status')) {
        return {
          status: 200,
          json: async () => ({
            available: true,
            tiers: { top: 'claude-opus-5-5', low: 7 },
            connections: [anthropicConn('dev_proxy')],
          }),
        };
      }
      return { status: 200, json: async () => okReceipt() };
    };
    const t = new DevProxyTransport({ transport: http });
    expect(await t.send(spec())).toMatchObject({ ok: true });
    expect(calls[0]?.url).toBe('/api/llm');
    expect(JSON.parse(calls[0]?.body ?? '{}').segments).toHaveLength(2);
    const st = await t.status();
    expect(st).toMatchObject({ available: true, tiers: { top: 'claude-opus-5-5' } });
    expect(st.connections?.[0]?.id).toBe('dev_proxy');
  });

  it('reports a missing proxy as not configured and an unreachable one as a network problem', async () => {
    const missing = new DevProxyTransport({
      transport: async () => ({ status: 404, json: async () => ({}) }),
    });
    expect(await missing.send(spec())).toMatchObject({ ok: false, problem: 'not_configured' });
    expect(await missing.status()).toEqual({ available: false, reason: 'no_proxy' });
    const down = new DevProxyTransport({
      transport: async () => {
        throw new Error('refused');
      },
    });
    expect(await down.send(spec())).toMatchObject({ ok: false, problem: 'network' });
    const garbage = new DevProxyTransport({
      transport: async () => ({ status: 502, json: async () => 'x' }),
    });
    expect(await garbage.send(spec())).toMatchObject({ ok: false, problem: 'server_error' });
  });
});

describe('the routed runner reads the receipts (3.5, 3.8, 10.1)', () => {
  const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
  const act = (n: number) => ({
    json: { commands: [{ kind: 'llmtest.act', data: `{"n":${n}}` }] },
  });

  it('settles by the price card when the receipt has no cost, and fills an estimated input', async () => {
    const usage: LlmUsage = {
      ...EMPTY_USAGE,
      inputTokens: 2000,
      outputTokens: 300,
      cacheReadInputTokens: 1000,
    };
    const transport = ScriptedTransport.always(
      okReceipt({
        json: { commands: [{ kind: 'llmtest.act', data: '{"n":1}' }] },
        text: '',
        usage,
      }),
    );
    const { engine, runner } = routedRunner(probeSystem([1]), s, transport);
    engine.step(1);
    await runner.whenIdle();
    const card = priceCardOf('anthropic', 'claude-haiku-5-5');
    if (!card) throw new Error('no card');
    expect(runner.budget.totalUsd()).toBeCloseTo(costWithCard(card, usage), 12);
    expect(runner.budget.used('hour').tokens).toBe(3300);

    const est = ScriptedTransport.always(
      okReceipt({
        json: { commands: [{ kind: 'llmtest.act', data: '{"n":1}' }] },
        usage: { ...EMPTY_USAGE, outputTokens: 7 },
        usageEstimated: true,
      }),
    );
    const r2 = routedRunner(probeSystem([1]), s, est);
    r2.engine.step(1);
    await r2.runner.whenIdle();
    expect(r2.runner.audit.list()[0]?.usage?.inputTokens).toBeGreaterThan(100);
  });

  it('moves a model down one output channel on the third unsupported parameter', async () => {
    const unsupported: LlmCallResult = {
      ok: false,
      error: {
        cls: 'bad_request',
        httpStatus: 400,
        param: 'output_config',
        message: 'unsupported',
      },
      latencyMs: 0,
    };
    const transport = ScriptedTransport.always(unsupported);
    const caps: [string, string, Capability][] = [];
    const { engine, runner } = routedRunner(probeSystem([1, 3, 5]), s, transport, {
      onCapability: (c, m, cap) => caps.push([c, m, cap]),
    });
    for (let i = 0; i < 6; i++) {
      engine.step(1);
      await runner.whenIdle();
    }
    expect(transport.calls).toHaveLength(3);
    expect(caps.map(([c, m, cap]) => [c, m, cap.channels])).toEqual([
      ['conn_a', 'claude-haiku-5-5', ['prompt_only']],
    ]);
    expect(runner.problems().map((p) => p.code)).toEqual(['unsupported_output']);
  });

  it('raises bad_output on the fifth unparseable answer of a role on a model', async () => {
    const transport = ScriptedTransport.always(okReceipt({ json: null, text: 'nope' }));
    const { engine, runner } = routedRunner(probeSystem([1, 3, 5, 7, 9]), s, transport);
    for (let i = 0; i < 10; i++) {
      engine.step(1);
      await runner.whenIdle();
    }
    expect(transport.calls).toHaveLength(5);
    expect(runner.problems().map((p) => [p.code, p.roles, p.models])).toEqual([
      ['bad_output', ['core_npc'], ['claude-haiku-5-5']],
    ]);
  });

  it('closes a connection whose model is still loading for the probe interval', async () => {
    const local = preset(
      {
        preset: 'local',
        connectionId: 'conn_local',
        models: { high: 'qwen3:14b', low: 'qwen3:8b' },
      },
      localConn(),
    );
    const transport = new ScriptedTransport([
      {
        turn: 0,
        answer: {
          ok: false,
          error: { cls: 'model_unavailable', httpStatus: 503, message: 'loading' },
          problem: 'model_not_loaded',
          latencyMs: 0,
        },
      },
      { answer: act(6) },
    ]);
    const { engine, runner, clock } = routedRunner(probeSystem([1, 3, 5]), local, transport);
    engine.step(1);
    await runner.whenIdle();
    engine.step(2);
    await runner.whenIdle();
    expect(runner.audit.list().map((r) => r.reason)).toEqual([
      'model_not_loaded',
      'connection_down',
    ]);
    clock.t += 30_000;
    engine.step(2);
    await runner.whenIdle();
    expect(transport.calls).toHaveLength(2);
    expect(runner.audit.list()[2]?.outcome).toBe('proposal');
  });

  it('disables a model the service does not have, and opens the circuit after repeated overloads', async () => {
    const transport = new ScriptedTransport([
      {
        model: 'claude-haiku-5-5',
        answer: {
          ok: false,
          error: { cls: 'model_unavailable', httpStatus: 404, message: 'x' },
          problem: 'model_not_found',
          latencyMs: 0,
        },
      },
      { model: 'claude-sonnet-5-5', answer: act(4) },
    ]);
    const { engine, runner } = routedRunner(probeSystem([1, 3]), s, transport);
    engine.step(1);
    await runner.whenIdle();
    engine.step(3);
    await runner.whenIdle();
    engine.step(1);
    expect(transport.calls.map((c) => c.model)).toEqual(['claude-haiku-5-5', 'claude-sonnet-5-5']);
    expect(done(engine).map((d) => d.by)).toEqual(['fallback', 'ai']);

    const busy: LlmTransport = ScriptedTransport.always({
      ok: false,
      error: { cls: 'overloaded', httpStatus: 529, message: 'busy' },
      problem: 'overloaded',
      latencyMs: 0,
    });
    const r2 = routedRunner(probeSystem([1, 3, 5, 7, 9, 11]), s, busy);
    for (let i = 0; i < 12; i++) {
      r2.engine.step(1);
      await r2.runner.whenIdle();
    }
    expect((busy as ScriptedTransport).calls).toHaveLength(5);
    expect(
      r2.runner.audit
        .list()
        .map((r) => r.reason)
        .at(-1),
    ).toBe('connection_down');
    expect(r2.runner.drivers()?.core_npc).toEqual({ driver: 'builtin', reason: 'connection_down' });
  });
});

describe('layering of the model path (llm_providers.md 2.2, 16.2)', () => {
  const SRC = join(__dirname, '..', 'src');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((n) => {
      const p = join(dir, n);
      return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
    });
  const code = (f: string) =>
    readFileSync(f, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
  const rel = (f: string) => relative(SRC, f).split(sep).join('/');

  it('keeps settings, routing, estimates and mocks free of network, Electron and Node', () => {
    const pure = [...files(join(SRC, 'ai', 'llm_config')), ...files(join(SRC, 'ai', 'mocks'))];
    const providers = files(join(SRC, 'ai', 'providers'));
    const bad = [...pure, ...providers].filter((f) =>
      /\bfetch\s*\(|XMLHttpRequest|WebSocket|from 'electron'|from 'node:|globalThis/.test(code(f)),
    );
    expect(bad.map(rel)).toEqual([]);
  });

  it('names the dev proxy path only in the development transport', () => {
    // The editor workbench reaches the proxy through DevProxyTransport too (status included).
    const scanned = [
      ...files(join(SRC, 'ai')),
      ...files(join(SRC, 'client')),
      ...files(join(SRC, 'editor')),
    ];
    const hits = scanned
      .filter((f) => code(f).includes('/api/llm'))
      .map(rel)
      .sort();
    expect(hits).toEqual(['ai/transports/dev_proxy.ts']);
    const barrels = ['ai/index.ts', 'ai/transports/index.ts', 'ai/providers/index.ts'];
    for (const b of barrels) expect(code(join(SRC, b))).not.toContain('dev_proxy');
    // The client reaches the dev transport only through a dynamic import guarded by DEV.
    const bridge = code(join(SRC, 'client', 'app', 'ai_bridge.ts'));
    const guard = bridge.indexOf("if (import.meta.env.DEV && this.platform === 'dev') {");
    const load = bridge.indexOf("await import('../../ai/transports/dev_proxy')");
    expect(guard).toBeGreaterThan(0);
    expect(load).toBeGreaterThan(guard);
    expect(bridge.slice(guard, load)).not.toMatch(/\n\s*\}/);
    expect(bridge).not.toMatch(/^import .*dev_proxy/m);
  });
});
