// The model-path doubles (docs/50_tech/llm_providers.md 16.1; release_engineering.md 10.8,
// RE-22): scripted answers keyed by connection, model, kind and turn; the echo transport
// that proposes each request's own fallback; seeded chaos for every problem code; cassette
// record and replay; the fake key store; and the mock model service, both as a pure handler
// the real adapters talk to and as a loopback server.

import { describe, expect, it } from 'vitest';
import type { LlmCallResult, LlmCallSpec, ProblemCode } from '../src/ai/contracts';
import { CassetteTransport, scrubSecrets, specHash } from '../src/ai/mocks/cassette';
import { ChaosTransport, faultResult } from '../src/ai/mocks/chaos';
import { EchoTransport, echoHost } from '../src/ai/mocks/echo';
import { FakeKeystore } from '../src/ai/mocks/fake_keystore';
import { createMockService, type MockServiceResponse } from '../src/ai/mocks/mock_service';
import { ScriptedTransport } from '../src/ai/mocks/scripted';
import { anthropicAdapter } from '../src/ai/providers/anthropic';
import { capabilityFor, profileFor } from '../src/ai/providers/capabilities';
import { openaiCompatAdapter } from '../src/ai/providers/openai_compat';
import { PROBLEM_CODES } from '../src/ai/providers/problems';
import { TransportProvider } from '../src/ai/providers/transport_provider';
import type { AdapterHttpRequest, ModelProfile, ProviderAdapter } from '../src/ai/providers/types';
import { AiRunner } from '../src/ai/runner';
import type { ContentMap } from '../src/core/contracts';
import { createRoleRegistry } from '../src/game/ai_roles';
import { createGame } from '../src/game/create';
import {
  anthropicConn,
  compatConn,
  done,
  fakeClock,
  preset,
  probeSystem,
  routedRunner,
} from './fixtures/llm_config/fixtures';
import { startMockLlmServer } from './fixtures/llm_mock/server';

function spec(extra: Partial<LlmCallSpec> = {}): LlmCallSpec {
  return {
    requestId: 'ai1#1',
    provider: 'anthropic',
    connectionId: 'conn_a',
    slot: 'low',
    bindingRole: 'core_npc',
    model: 'claude-haiku-5-5',
    segments: [
      { role: 'rules', text: '规则', cache: 'short' },
      { role: 'turn', text: '本轮' },
    ],
    output: {
      schemaId: 'npc.daily',
      schema: {
        type: 'object',
        properties: { commands: { type: 'array', items: { type: 'object' } } },
        required: ['commands'],
        additionalProperties: false,
      },
      maxTokens: 400,
    },
    timeoutMs: 5000,
    reserve: { usd: 0.001, tokens: 900 },
    purpose: 'npc.daily/probe',
    ...extra,
  };
}

describe('ScriptedTransport', () => {
  it('answers by connection, model, kind and turn, and records every spec', async () => {
    const t = new ScriptedTransport([
      { connectionId: 'conn_b', answer: { json: { who: 'b' } } },
      { kind: 'goddess.plan', answer: [{ json: { turn: 0 } }, { json: { turn: 1 } }] },
      { model: 'claude-opus-5-5', turn: 1, answer: { json: { second: true } } },
    ]);
    expect((await t.send(spec({ connectionId: 'conn_b' }))).json).toEqual({ who: 'b' });
    const plan = spec({ purpose: 'goddess.plan/daily' });
    expect((await t.send(plan)).json).toEqual({ turn: 0 });
    expect((await t.send(plan)).json).toEqual({ turn: 1 });
    expect((await t.send(plan)).json).toEqual({ turn: 1 });
    const opus = spec({ model: 'claude-opus-5-5' });
    expect(await t.send(opus)).toMatchObject({ ok: false, error: { message: 'script exhausted' } });
    expect((await t.send(opus)).json).toEqual({ second: true });
    expect(t.calls).toHaveLength(6);
    const deltas: string[] = [];
    await ScriptedTransport.always({ json: {}, deltas: ['a', 'b'] }).send(spec(), {
      onDelta: (d) => deltas.push(d),
    });
    expect(deltas).toEqual(['a', 'b']);
  });
});

describe('EchoTransport', () => {
  it('proposes each request its own fallback, so the model path runs at zero cost', async () => {
    const engine = createGame({
      seed: 1,
      aiMode: 'external',
      systems: [probeSystem([1, 3])],
      content: {} as ContentMap,
    });
    const { host, fallbackOf } = echoHost(engine);
    const echo = new EchoTransport(fallbackOf);
    const provider = new TransportProvider(echo);
    const runner = new AiRunner({
      engine: host,
      roles: createRoleRegistry(),
      clock: fakeClock(),
      settings: preset({ preset: 'tiered', connectionId: 'conn_a' }),
      providers: () => provider,
    });
    runner.attach();
    engine.step(1);
    await runner.whenIdle();
    engine.step(3);
    await runner.whenIdle();
    engine.step(1);
    expect(echo.calls).toHaveLength(2);
    expect(done(engine)).toEqual([
      { n: 0, by: 'ai', revision: 41 },
      { n: 0, by: 'ai', revision: 43 },
    ]);
    expect(runner.budget.totalUsd()).toBe(0);
  });
});

describe('ChaosTransport', () => {
  const ok = ScriptedTransport.always({ json: { commands: [] } });

  it('injects the same faults for the same seed, queue first', async () => {
    const run = async (seed: number) => {
      const c = new ChaosTransport(ok, {
        seed,
        queue: ['refusal'],
        rates: { timeout: 0.2, overloaded: 0.2, bad_json: 0.1 },
      });
      const out: (string | undefined)[] = [];
      for (let i = 0; i < 40; i++) {
        const r = await c.send(spec({ requestId: `ai${i}#1` }));
        out.push(r.ok ? (r.json === null ? 'bad_json' : undefined) : (r.problem ?? r.error?.cls));
      }
      return { out, injected: c.injected.map((x) => x.fault) };
    };
    const a = await run(7);
    expect(await run(7)).toEqual(a);
    expect(a.injected[0]).toBe('refusal');
    expect(a.injected.length).toBeGreaterThan(10);
    expect(new Set(a.injected)).toEqual(new Set(['refusal', 'timeout', 'overloaded', 'bad_json']));
    expect((await run(8)).out).not.toEqual(a.out);
    const only = new ChaosTransport(ok, {
      seed: 1,
      rates: { network: 1 },
      connections: ['conn_x'],
    });
    expect((await only.send(spec())).ok).toBe(true);
    expect((await only.send(spec({ connectionId: 'conn_x' }))).problem).toBe('network');
  });

  it('shapes every problem code the way the services raise it (10.1)', () => {
    for (const code of PROBLEM_CODES) {
      const r = faultResult(code, spec());
      if (code === 'bad_output') {
        expect(r).toMatchObject({ ok: true, json: null });
        continue;
      }
      expect(r.ok).toBe(false);
      if (code === 'unsupported_output') {
        expect(r.problem).toBeUndefined();
        expect(r.error?.param).toBe('response_format');
      } else expect([code, r.problem]).toEqual([code, code]);
    }
    expect(faultResult('rate_limited', spec()).error?.retryAfterMs).toBe(20_000);
    expect(faultResult('half_json', spec())).toMatchObject({
      ok: true,
      json: null,
      stopReason: 'max_tokens',
    });
  });

  it('cuts a stream after one delta and holds slow answers past the timeout', async () => {
    const deltas: string[] = [];
    const cut = new ChaosTransport(ok, { seed: 1, queue: ['stream_cut'] });
    expect(await cut.send(spec(), { onDelta: (d) => deltas.push(d) })).toMatchObject({
      ok: false,
      problem: 'network',
    });
    expect(deltas).toEqual(['{"commands":[']);
    const waits: number[] = [];
    const timers = {
      set: (fn: () => void, ms: number) => {
        waits.push(ms);
        fn();
        return 0;
      },
      clear: () => {},
    };
    const slow = new ChaosTransport(ok, { seed: 1, queue: ['slow'], timers, latencyMs: [10, 10] });
    expect((await slow.send(spec())).ok).toBe(true);
    expect(waits).toEqual([10, 5001]);
  });

  it('never makes the world wait: every injected failure ends in the fallback on time', async () => {
    const faults: ProblemCode[] = [
      'timeout',
      'overloaded',
      'refusal',
      'rate_limited',
      'server_error',
    ];
    const chaos = new ChaosTransport(ScriptedTransport.always({ json: { commands: [] } }), {
      seed: 3,
      queue: faults,
    });
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const ticks = [1, 3, 5, 7, 9];
    const { engine, runner } = routedRunner(probeSystem(ticks), s, chaos);
    for (let i = 0; i < 10; i++) {
      engine.step(1);
      await runner.whenIdle();
    }
    engine.step(1);
    expect(done(engine)).toHaveLength(5);
    expect(done(engine).every((d) => d.by === 'fallback')).toBe(true);
    expect(engine.tick).toBe(11);
    // The rate limit's retry hint keeps the connection closed: the last request never goes out.
    expect(runner.audit.list().map((r) => r.reason)).toEqual([
      'timeout',
      'overloaded',
      'refusal',
      'rate_limited',
      'connection_down',
    ]);
    expect(chaos.injected).toHaveLength(4);
  });
});

describe('CassetteTransport', () => {
  it('records scrubbed receipts and replays them by request hash, failing on a miss', async () => {
    const key = `sk-ant-${'x'.repeat(24)}`;
    const inner = new ScriptedTransport([
      {
        answer: {
          ok: true,
          json: { commands: [] },
          text: `{"commands":[]} ${key}`,
          providerRequestId: 'req_123',
          latencyMs: 9,
        } satisfies LlmCallResult,
      },
    ]);
    const rec = new CassetteTransport({ mode: 'record', inner });
    await rec.send(spec());
    const tape = rec.cassette;
    expect(tape.entries).toHaveLength(1);
    expect(JSON.stringify(tape)).not.toContain(key);
    expect(JSON.stringify(tape)).not.toContain('req_123');
    const play = new CassetteTransport({
      mode: 'replay',
      cassette: JSON.parse(JSON.stringify(tape)),
    });
    // Run-specific fields do not change the key.
    const again = spec({
      requestId: 'ai99#2',
      reserve: { usd: 9, tokens: 9 },
      timeoutMs: 1,
      connectionId: 'conn_z',
    });
    expect(specHash(again)).toBe(specHash(spec()));
    expect(await play.send(again)).toMatchObject({
      ok: true,
      json: { commands: [] },
      latencyMs: 9,
    });
    expect(inner.calls).toHaveLength(1);
    const other = spec({ segments: [{ role: 'turn', text: '别的' }] });
    expect(specHash(other)).not.toBe(specHash(spec()));
    await expect(play.send(other)).rejects.toThrow(/cassette miss/);
    expect(scrubSecrets({ a: ['Bearer abc.def', 'sk-1234567890abcdef'] })).toEqual({
      a: ['Bearer [redacted]', '[redacted]'],
    });
  });
});

describe('FakeKeystore', () => {
  it('saves in the keychain, keeps session-only keys for the run, or fails to write', () => {
    const ks = new FakeKeystore('available');
    expect(ks.put('conn_a', 'key', 'secret-abcd1234')).toMatchObject({
      ok: true,
      status: { state: 'saved', last4: '1234', backend: 'os_keychain' },
    });
    expect(ks.read('conn_a')).toBe('secret-abcd1234');
    expect(JSON.stringify(ks.has('conn_a'))).not.toContain('secret');
    ks.restart();
    expect(ks.has('conn_a').state).toBe('saved');
    expect(ks.problem()).toBeUndefined();
    const mem = new FakeKeystore('memory_only');
    expect(mem.put('conn_a', 'key', 'k-9999').ok).toBe(true);
    expect(mem.has('conn_a')).toMatchObject({ state: 'session_only', backend: 'memory_only' });
    expect(mem.problem()).toBe('keychain_unavailable');
    mem.restart();
    expect(mem.has('conn_a').state).toBe('none');
    const broken = new FakeKeystore('write_fail');
    expect(broken.put('conn_a', 'key', 'x')).toEqual({ ok: false, error: 'write_failed' });
    expect(broken.has('conn_a').state).toBe('none');
    expect(ks.clear('conn_a').state).toBe('none');
  });
});

describe('the mock model service', () => {
  const answer = { commands: [{ kind: 'llmtest.act', data: '{"n":1}' }] };

  function roundTrip(
    adapter: ProviderAdapter,
    req: AdapterHttpRequest,
    res: MockServiceResponse,
    prof: ModelProfile,
  ) {
    if (
      req.read === 'json' ||
      res.status !== 200 ||
      res.headers['content-type'] !== 'text/event-stream'
    ) {
      return adapter.parse(res.status, res.chunks.join(''), 1, prof, res.headers);
    }
    let state = adapter.startStream(prof, res.headers);
    const deltas: string[] = [];
    for (const c of res.chunks) {
      const step = adapter.parseStreamEvent(state, c);
      state = step.state;
      for (const e of step.events) if (e.t === 'text') deltas.push(e.text);
    }
    return { ...adapter.endStream(state, 1, prof), deltas };
  }

  const call = (svc: ReturnType<typeof createMockService>, req: AdapterHttpRequest) => {
    const u = new URL(req.url);
    return svc.handle({
      method: req.method,
      path: u.pathname + u.search,
      headers: req.headers,
      body: req.body ?? '',
    });
  };

  it('speaks the Anthropic Messages API, with and without streaming, and checks the key', () => {
    const svc = createMockService({ answer: () => answer, requireKey: 'k-1' });
    const conn = anthropicConn();
    const prof = profileFor('anthropic', 'claude-haiku-5-5');
    const req = anthropicAdapter.build(spec(), conn, prof);
    expect(roundTrip(anthropicAdapter, req, call(svc, req), prof)).toMatchObject({
      ok: false,
      problem: 'key_invalid',
    });
    req.headers['x-api-key'] = 'k-1';
    expect(roundTrip(anthropicAdapter, req, call(svc, req), prof)).toMatchObject({
      ok: true,
      json: answer,
    });
    const sreq = anthropicAdapter.build(spec({ stream: true }), conn, prof);
    sreq.headers['x-api-key'] = 'k-1';
    const streamed = roundTrip(anthropicAdapter, sreq, call(svc, sreq), prof) as LlmCallResult & {
      deltas: string[];
    };
    expect(streamed).toMatchObject({ ok: true, json: answer });
    expect(streamed.deltas.join('')).toBe(JSON.stringify(answer));
    const failing = createMockService({
      failures: [
        {
          status: 529,
          body: { type: 'error', error: { type: 'overloaded_error', message: 'busy' } },
        },
      ],
    });
    expect(roundTrip(anthropicAdapter, req, call(failing, req), prof)).toMatchObject({
      ok: false,
      problem: 'overloaded',
    });
  });

  it('speaks the OpenAI compatible chat API, with tools and streams', () => {
    const svc = createMockService({ answer: () => answer });
    const conn = compatConn('conn_compat', [{ model: 'mock-chat' }], 'https://mock.local/v1');
    const tool = {
      ...profileFor('openai_compat', 'mock-chat'),
      capability: {
        ...capabilityFor('openai_compat', 'mock-chat'),
        channels: ['tool_carrier' as const],
      },
    };
    const req = openaiCompatAdapter.build(
      spec({ provider: 'openai_compat', model: 'mock-chat' }),
      conn,
      tool,
    );
    expect(roundTrip(openaiCompatAdapter, req, call(svc, req), tool)).toMatchObject({
      ok: true,
      json: answer,
    });
    const plain = profileFor('openai_compat', 'mock-chat');
    const sreq = openaiCompatAdapter.build(
      spec({ provider: 'openai_compat', model: 'mock-chat', stream: true }),
      conn,
      plain,
    );
    const streamed = roundTrip(
      openaiCompatAdapter,
      sreq,
      call(svc, sreq),
      plain,
    ) as LlmCallResult & { deltas: string[] };
    expect(streamed).toMatchObject({ ok: true, json: answer });
    expect(streamed.deltas.join('')).toBe(JSON.stringify(answer));
    expect(streamed.usage?.outputTokens).toBeGreaterThan(0);
    const listing = svc.handle({ method: 'GET', path: '/v1/models', headers: {}, body: '' });
    expect(JSON.parse(listing.chunks[0] as string).data[0].id).toBe('mock-chat');
  });

  it('runs as a loopback HTTP server', async () => {
    const server = await startMockLlmServer({ answer: () => answer });
    try {
      const conn = anthropicConn('conn_a', { baseUrl: server.url });
      const prof = profileFor('anthropic', 'claude-haiku-5-5');
      const req = anthropicAdapter.build(spec(), conn, prof);
      const res = await fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      });
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => {
        headers[k] = v;
      });
      const r = anthropicAdapter.parse(res.status, await res.text(), 1, prof, headers);
      expect(r).toMatchObject({ ok: true, json: answer, providerRequestId: 'req_mock_1' });
      expect(server.service.calls).toHaveLength(1);
    } finally {
      await server.close();
    }
  });
});
