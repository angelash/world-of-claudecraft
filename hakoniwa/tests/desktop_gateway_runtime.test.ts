import { describe, expect, it } from 'vitest';
import { createGatewayRuntime } from '../desktop/llm_gateway/runtime';
import { defaultSettings } from '../src/ai/llm_config/settings';
import { profileFor } from '../src/ai/providers/capabilities';
import type { AdapterHttpResponse, ConnectionPublic } from '../src/ai/providers/types';
import { simpleSpec } from './fixtures/llm/specs';

function settings() {
  const s = defaultSettings();
  s.preset = 'custom';
  const c: ConnectionPublic = {
    id: 'conn_fixture',
    kind: 'openai_compat',
    name: 'Fixture',
    baseUrl: 'https://provider.example.invalid/v1',
    auth: { scheme: 'bearer' },
    keyState: 'session_only',
    extraHeaderNames: [],
    currency: 'USD',
    maxInFlight: 1,
    models: [profileFor('openai_compat', 'fixture-model')],
  };
  s.connections = [c];
  s.consentedConnectionIds = [c.id];
  s.caps.hour = { tokens: 100000 };
  s.caps.day = { tokens: 100000 };
  return s;
}

const spec = (id = 'fixture#1') =>
  simpleSpec({
    requestId: id,
    provider: 'openai_compat',
    connectionId: 'conn_fixture',
    model: 'fixture-model',
    stream: false,
    reserve: { usd: 0, tokens: 0 },
  });
const success = (text = '{"commands":[]}'): AdapterHttpResponse => ({
  status: 200,
  headers: {},
  latencyMs: 3,
  body: JSON.stringify({
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 10, completion_tokens: 4 },
  }),
});

describe('desktop gateway real adapter path', () => {
  it('adds credentials only at the sender and returns redacted receipts and metadata-only ledger', async () => {
    const s = settings();
    const credential = 'fixture-private-value-7788';
    let sentHeader = '';
    const runtime = createGatewayRuntime({
      settings: () => s,
      secret: () => credential,
      now: () => 100,
      send: async (req) => {
        sentHeader = req.headers.Authorization ?? req.headers.authorization ?? '';
        return success(`{"speech":"${credential}"}`);
      },
    });
    const answer = await runtime.call(spec());
    expect(sentHeader).toBe(`Bearer ${credential}`);
    expect(answer.ok).toBe(false);
    expect(answer.problem).toBe('bad_output');
    expect(JSON.stringify(answer)).not.toContain(credential);
    expect(runtime.ledger('hour').entries).toHaveLength(1);
    expect(JSON.stringify(runtime.ledger('hour'))).not.toMatch(/fixture-private|规则|本轮/);
  });

  it('rejects unknown models and missing consent before any sender runs, and recomputes fake zero reservations', async () => {
    const s = settings();
    let sends = 0;
    const runtime = createGatewayRuntime({
      settings: () => s,
      secret: () => 'fixture-key',
      send: async () => {
        sends++;
        return success();
      },
    });
    expect((await runtime.call({ ...spec(), model: 'other' })).problem).toBe('not_configured');
    s.consentedConnectionIds = [];
    expect((await runtime.call(spec('consent'))).problem).toBe('not_configured');
    s.consentedConnectionIds = ['conn_fixture'];
    s.caps.hour = { tokens: 1 };
    expect((await runtime.call(spec('oversized'))).problem).toBe('cap_reached');
    expect(sends).toBe(0);
  });

  it('bounds concurrency and rejects duplicate requests, cancels promptly, and ignores late answers', async () => {
    let release: ((value: AdapterHttpResponse) => void) | undefined;
    const runtime = createGatewayRuntime({
      settings,
      secret: () => 'fixture-key',
      send: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = runtime.call(spec());
    expect((await runtime.call(spec())).error?.message).toMatch(/duplicate/);
    expect((await runtime.call(spec('second'))).problem).toBe('rate_limited');
    runtime.abort('fixture#1');
    expect((await pending).error?.message).toBe('aborted');
    release?.(success());
    await Promise.resolve();
    expect(runtime.ledger('run').entries).toHaveLength(1);
    expect(runtime.ledger('run').entries[0]?.status).toBe('aborted');
  });

  it('restores authoritative spend across gateway restarts without retaining prompt or credentials', async () => {
    let persisted: unknown;
    const s = settings();
    const options = {
      settings: () => s,
      secret: () => 'fixture-key',
      now: () => 100,
      send: async () => success(),
      persist: (state: unknown) => {
        persisted = state;
      },
    };
    const first = createGatewayRuntime(options);
    await first.call(spec());
    expect(JSON.stringify(persisted)).not.toMatch(/fixture-key|规则|本轮/);
    const next = createGatewayRuntime({ ...options, restored: persisted });
    expect(next.ledger('hour').snapshot.windows.hour.tokens).toBeGreaterThan(0);
  });

  it('accepts a new lineage hint without resetting authoritative spending', async () => {
    const runtime = createGatewayRuntime({
      settings,
      secret: () => 'opaque-token-554433',
      send: async () => success(),
    });
    await runtime.call(spec());
    const before = runtime.ledger('run').snapshot.windows.run.tokens;
    expect(runtime.setScope('../escape')).toBe(false);
    expect(runtime.setScope('another_save')).toBe(true);
    expect(runtime.ledger('run').snapshot.windows.run.tokens).toBe(before);
    expect((await runtime.call(spec())).ok).toBe(true);
    expect(runtime.ledger('run').snapshot.windows.run.tokens).toBeGreaterThan(before);
  });

  it('books explicit connection probes even when gameplay is capped', async () => {
    const s = settings();
    s.caps.hour = { tokens: 0 };
    const runtime = createGatewayRuntime({
      settings: () => s,
      secret: () => 'fixture-key',
      send: async (req) =>
        req.method === 'GET'
          ? { status: 200, body: '{"data":[{"id":"fixture-model"}]}', headers: {}, latencyMs: 1 }
          : success('{"ok":true}'),
    });
    await runtime.test('conn_fixture', 'quick');
    const ledger = runtime.ledger('hour');
    expect(ledger.entries.some((e) => e.source === 'test')).toBe(true);
    expect(ledger.snapshot.windows.hour.tokens).toBeGreaterThan(0);
    expect((await runtime.call(spec())).problem).toBe('cap_reached');
  });

  it('still detects an old key echoed by a request after that key was replaced', async () => {
    let credential = 'AAAAAAAAAAAA1111';
    let release: ((value: AdapterHttpResponse) => void) | undefined;
    const runtime = createGatewayRuntime({
      settings,
      secret: () => credential,
      send: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    });
    const pending = runtime.call(spec());
    const old = credential;
    credential = 'BBBBBBBBBBBB2222';
    release?.(success(`{"speech":"${old}"}`));
    const answer = await pending;
    expect(answer.problem).toBe('bad_output');
    expect(JSON.stringify(answer)).not.toContain(old);
  });

  it('tracks the key injected into a request when it rotates between credential reads', async () => {
    const credentials = ['AAAAAAAAAAAA1111', 'BBBBBBBBBBBB2222', 'CCCCCCCCCCCC3333'];
    let lookups = 0;
    let sentHeader = '';
    const runtime = createGatewayRuntime({
      settings,
      secret: () => credentials[Math.min(lookups++, credentials.length - 1)],
      send: async (request) => {
        sentHeader = request.headers.Authorization ?? '';
        return success(JSON.stringify({ speech: credentials[1] }));
      },
    });
    const answer = await runtime.call(spec());
    expect(sentHeader).toBe(`Bearer ${credentials[1]}`);
    expect(answer).toMatchObject({ ok: false, problem: 'bad_output' });
  });

  for (const [name, credential] of [
    ['quotes', '"'.repeat(16)],
    ['quotes and backslashes', '"\\'.repeat(8)],
  ] as const) {
    it.each(['call', 'models', 'test'] as const)(
      `rejects decoded credential strings containing ${name} in %s replies`,
      async (operation) => {
        const s = settings();
        if (operation === 'test') {
          for (const c of s.connections) c.models = [profileFor('openai_compat', credential)];
        }
        const runtime = createGatewayRuntime({
          settings: () => s,
          secret: () => credential,
          send: async (request) =>
            request.method === 'GET'
              ? {
                  status: 200,
                  headers: {},
                  latencyMs: 1,
                  body: JSON.stringify({ data: [{ id: credential }] }),
                }
              : success(JSON.stringify({ speech: credential })),
        });
        if (operation === 'test') {
          expect(await runtime.test('conn_fixture', 'quick')).toBeNull();
        } else {
          const result =
            operation === 'call'
              ? await runtime.call(spec())
              : await runtime.models('conn_fixture');
          expect(result).toMatchObject({ ok: false, problem: 'bad_output' });
        }
      },
    );
  }

  it('rejects nearly complete credentials reflected by a model listing', async () => {
    const credential = 'opaque-listing-value-2211';
    const runtime = createGatewayRuntime({
      settings,
      secret: () => credential,
      send: async () => ({
        status: 200,
        headers: {},
        latencyMs: 1,
        body: JSON.stringify({ data: [{ id: credential.slice(0, -1) }] }),
      }),
    });
    const listing = await runtime.models('conn_fixture');
    expect(listing).toMatchObject({ ok: false, problem: 'bad_output', models: [] });
    expect(JSON.stringify(listing)).not.toContain(credential.slice(0, -1));
  });

  it.each(['call', 'models'] as const)(
    'rejects numeric credential reflections in %s replies',
    async (operation) => {
      const credential = '123456789012';
      const runtime = createGatewayRuntime({
        settings,
        secret: () => credential,
        send: async (request) =>
          request.method === 'GET'
            ? {
                status: 200,
                headers: {},
                latencyMs: 1,
                body: JSON.stringify({
                  data: [{ id: 'fixture-model', context_length: Number(credential) }],
                }),
              }
            : success(JSON.stringify({ reflected: Number(credential) })),
      });
      const result =
        operation === 'call' ? await runtime.call(spec()) : await runtime.models('conn_fixture');
      expect(result).toMatchObject({ ok: false, problem: 'bad_output' });
      expect(JSON.stringify(result)).not.toContain(credential);
    },
  );

  it('rejects credentials reflected only by numeric receipt metadata', async () => {
    const credential = '123456789012';
    const runtime = createGatewayRuntime({
      settings,
      secret: () => credential,
      send: async () => ({
        status: 200,
        headers: {},
        latencyMs: 1,
        body: JSON.stringify({
          choices: [{ message: { content: '{"commands":[]}' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: Number(credential), completion_tokens: 1 },
        }),
      }),
    });
    const result = await runtime.call(spec());
    expect(result).toMatchObject({ ok: false, problem: 'bad_output' });
    expect(JSON.stringify(result)).not.toContain(credential);
  });

  it('fails a stuck sender at the host timeout without waiting for network cooperation', async () => {
    const runtime = createGatewayRuntime({
      settings,
      secret: () => 'opaque-credential-414141',
      send: () => new Promise(() => {}),
    });
    const answer = await runtime.call({ ...spec(), timeoutMs: 5 });
    expect(answer.problem).toBe('timeout');
    expect(runtime.ledger('hour').entries[0]?.status).toBe('timeout');
  });
});
