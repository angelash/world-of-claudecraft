// Dev proxy contract (docs/50_tech/llm_providers.md 12, 16.2): the SDK path of the dev proxy
// (buildSpecMessageParams) and the release Anthropic adapter build the same request body
// field by field, and the official SDK puts exactly that body on the wire; the LlmCallSpec
// path of POST /api/llm answers LlmCallResult receipts with problem codes; compatible and
// local dev connections go through the shared adapters with auth added only in Node;
// POST /api/llm/test and GET /api/llm/models return ConnectionTestReport and ModelListing
// shapes. Offline: the SDK and fetch are in-memory fakes.

import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import type { LlmCallSpec } from '../src/ai/contracts';
import { buildOutputSchema } from '../src/ai/prompt';
import { anthropicAdapter } from '../src/ai/providers/anthropic';
import { callSpecFromRequest } from '../src/ai/providers/call_spec';
import { capabilityFor, profileFor, withCapability } from '../src/ai/providers/capabilities';
import type { ConnectionPublic, ModelProfile } from '../src/ai/providers/types';
import { ROLE_PACKS } from '../src/game/ai_roles';
import { createDevApiMiddleware } from '../tools/dev_api';
import {
  buildSpecMessageParams,
  DEV_PROXY_CONNECTION_ID,
  type DevConnectionConfig,
  type FetchLike,
  LlmService,
  netErrorKindOf,
  parseDevConnections,
  SERVER_FALLBACK_BETA,
} from '../tools/llm_proxy';
import { GOLDEN_CASES } from './fixtures/llm/golden_cases';
import { conn, HAIKU, OPUS, OPUS_PROMPT, OPUS_TOOL, simpleSpec, spec } from './fixtures/llm/specs';

const TEST_KEY = 'test-key-not-real-0001';
const COMPAT_KEY = 'compat-test-token-9876';

// --- field-by-field contract --------------------------------------------------------------

interface ContractCase {
  name: string;
  spec: LlmCallSpec;
  conn: ConnectionPublic;
  prof: ModelProfile;
}

const CASES: ContractCase[] = [
  ...GOLDEN_CASES.filter((c) => c.kind === 'anthropic').map((c) => ({
    name: c.name,
    spec: { ...c.spec, stream: false },
    conn: c.conn,
    prof: c.prof,
  })),
  { name: 'legacy-shaped spec', spec: simpleSpec(), conn: conn('anthropic'), prof: OPUS },
  {
    name: 'empty turn and blank persona',
    spec: simpleSpec({
      segments: [
        { role: 'rules', text: '规则', cache: 'long' },
        { role: 'persona', text: ' ', cache: 'long' },
        { role: 'turn', text: '' },
      ],
    }),
    conn: conn('anthropic'),
    prof: HAIKU,
  },
  {
    name: 'more breakpoints than allowed, long after short',
    spec: spec({
      segments: [
        { role: 'rules', text: 'a', cache: 'short' },
        { role: 'persona', text: 'b', cache: 'long' },
        { role: 'private', text: 'c', cache: 'long' },
        { role: 'history_user', text: 'd', cache: 'short' },
        { role: 'history_assistant', text: 'e', cache: 'short' },
        { role: 'turn', text: 'f', cache: 'short' },
      ],
    }),
    conn: conn('anthropic'),
    prof: OPUS,
  },
  {
    name: 'no turn segment, fallback switched off, no effort',
    spec: spec({ segments: [{ role: 'rules', text: '规则' }], effort: undefined }),
    conn: conn('anthropic', { serverFallback: false }),
    prof: OPUS,
  },
  {
    name: 'tool carrier with tool_choice any',
    spec: spec(),
    conn: conn('anthropic'),
    prof: withCapability(OPUS_TOOL, { forcedTool: true, toolChoice: 'required' }),
  },
  {
    name: 'tool carrier with tool_choice auto',
    spec: spec(),
    conn: conn('anthropic'),
    prof: withCapability(OPUS_TOOL, { forcedTool: false, toolChoice: 'auto' }),
  },
  {
    name: 'no forced tool: named falls back to auto with the submit guidance',
    spec: spec(),
    conn: conn('anthropic'),
    prof: withCapability(OPUS_TOOL, { forcedTool: false, toolChoice: 'named' }),
  },
  { name: 'prompt only', spec: spec(), conn: conn('anthropic'), prof: OPUS_PROMPT },
];

describe('the SDK body equals the adapter body for role pack requests', () => {
  it.each(ROLE_PACKS.map((p) => [p.role, p] as const))('%s', (_r, pack) => {
    const allowed = ['npc.say', 'npc.move'];
    for (const cacheTtl of ['5m', '1h'] as const) {
      const request = {
        tier: pack.tier,
        system: pack.system,
        stable: '人设段',
        context: '本轮',
        schema: buildOutputSchema(allowed, pack),
        maxTokens: pack.maxTokens,
        effort: pack.effort,
        cacheTtl,
        purpose: `${pack.role}/turn`,
        requestId: 'ai1',
      };
      for (const model of ['claude-opus-5-5', 'claude-haiku-5-5']) {
        // What TransportProvider sends for a runner request (the game and the editor).
        const s = callSpecFromRequest(request, {
          provider: 'anthropic',
          connectionId: DEV_PROXY_CONNECTION_ID,
          bindingRole: 'core_npc',
          model,
          timeoutMs: pack.timeoutMs,
        });
        const prof = profileFor('anthropic', model);
        const params = buildSpecMessageParams({ ...s, stream: false }, conn('anthropic'), prof);
        const { betas, ...sdkBody } = params as typeof params & { betas?: string[] };
        const req = anthropicAdapter.build({ ...s, stream: false }, conn('anthropic'), prof);
        expect(sdkBody).toEqual(JSON.parse(req.body ?? '{}'));
        expect(req.headers['anthropic-beta']).toBe(betas?.join(','));
      }
    }
  });
});

describe('SDK path and Anthropic adapter build the same body', () => {
  it.each(CASES.map((c) => [c.name, c] as const))('%s', (_n, c) => {
    const params = buildSpecMessageParams(c.spec, c.conn, c.prof);
    const { betas, ...sdkBody } = params as typeof params & { betas?: string[] };
    const req = anthropicAdapter.build(c.spec, c.conn, c.prof);
    const adapterBody = JSON.parse(req.body ?? '{}');
    for (const field of [
      'model',
      'max_tokens',
      'system',
      'messages',
      'output_config',
      'tools',
      'tool_choice',
      'fallbacks',
      'stream',
    ]) {
      expect({ field, value: (sdkBody as Record<string, unknown>)[field] }).toEqual({
        field,
        value: adapterBody[field],
      });
    }
    expect(Object.keys(sdkBody).sort()).toEqual(Object.keys(adapterBody).sort());
    expect(req.headers['anthropic-beta']).toBe(betas?.join(','));
  });
});

// --- the SDK on the wire --------------------------------------------------------------

interface Seen {
  url: string;
  headers: Headers;
  body: Record<string, unknown>;
}

function sdkWire(
  reply: (url: string) => { status: number; body: unknown; headers?: Record<string, string> },
) {
  const seen: Seen[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: init?.body ? JSON.parse(String(init.body)) : {},
    });
    const r = reply(String(url));
    return new Response(JSON.stringify(r.body), {
      status: r.status,
      headers: { 'content-type': 'application/json', ...r.headers },
    });
  };
  const client = new Anthropic({
    apiKey: TEST_KEY,
    authToken: null,
    baseURL: 'https://api.anthropic.com',
    fetch: fakeFetch,
    maxRetries: 0,
  });
  return { client, seen };
}

const MESSAGE = {
  id: 'msg_wire_1',
  type: 'message',
  role: 'assistant',
  model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text: '{"commands":[],"speech":"请进。"}' }],
  stop_reason: 'end_turn',
  stop_sequence: null,
  usage: {
    input_tokens: 20,
    output_tokens: 30,
    cache_read_input_tokens: 2000,
    cache_creation_input_tokens: 0,
  },
};

function devSpec(extra: Partial<LlmCallSpec> = {}): LlmCallSpec {
  return spec({ connectionId: DEV_PROXY_CONNECTION_ID, model: 'claude-sonnet-5-5', ...extra });
}

function service(
  client: InstanceType<typeof Anthropic>,
  extra: Partial<ConstructorParameters<typeof LlmService>[0]> = {},
): LlmService {
  return new LlmService({
    env: { ANTHROPIC_API_KEY: TEST_KEY },
    log: () => {},
    loadSdk: async () => ({ client, errors: Anthropic }),
    connectionsFile: null,
    nowIso: () => '2026-11-16T00:00:00.000Z',
    ...extra,
  });
}

describe('the SDK sends the adapter body unchanged', () => {
  it.each([
    ['sonnet with fallback', devSpec()],
    ['haiku without fallback', devSpec({ model: 'claude-haiku-5-5', effort: 'low' })],
    [
      'legacy-shaped',
      simpleSpec({ connectionId: DEV_PROXY_CONNECTION_ID, model: 'claude-opus-5-5' }),
    ],
  ])('%s', async (_n, s) => {
    const { client, seen } = sdkWire(() => ({ status: 200, body: { ...MESSAGE, model: s.model } }));
    const svc = service(client);
    const result = await svc.completeSpec(s);
    expect(result).toMatchObject({
      ok: true,
      json: { commands: [], speech: '请进。' },
      servedModel: s.model,
    });
    const wire = seen[0];
    if (!wire) throw new Error('nothing sent');
    expect(wire.url).toBe('https://api.anthropic.com/v1/messages');
    const prof = profileFor('anthropic', s.model);
    const dev = svc.devProxyConnection();
    const req = anthropicAdapter.build({ ...s, stream: false }, dev, prof);
    expect(wire.body).toEqual(JSON.parse(req.body ?? '{}'));
    expect(wire.headers.get('anthropic-beta')).toBe(req.headers['anthropic-beta'] ?? null);
    expect(wire.headers.get('anthropic-version')).toBe(req.headers['anthropic-version']);
    // The key is added by the SDK on the wire (SDK 1.8 sends it as a bearer token), never
    // by the adapter.
    const auth = `${wire.headers.get('x-api-key') ?? ''} ${wire.headers.get('authorization') ?? ''}`;
    expect(auth).toContain(TEST_KEY);
    expect(Object.keys(req.headers)).not.toContain('authorization');
    expect(Object.keys(req.headers)).not.toContain('x-api-key');
    expect(JSON.stringify(req)).not.toContain(TEST_KEY);
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);
  });

  it('prices the served model and keeps the fallback beta on top and mid', async () => {
    const { client, seen } = sdkWire(() => ({
      status: 200,
      body: MESSAGE,
      headers: { 'request-id': 'req_wire_0001' },
    }));
    const result = await service(client).completeSpec(devSpec());
    expect(result.providerRequestId).toBe('req_wire_0001');
    expect(result.costUsd).toBeCloseTo((20 * 2 + 30 * 10 + 2000 * 0.1) / 1e6, 12);
    expect(seen[0]?.headers.get('anthropic-beta')).toContain(SERVER_FALLBACK_BETA);
    expect(seen[0]?.body.fallbacks).toBe('default');
  });

  it('classifies SDK errors through the adapter with problem codes', async () => {
    const cases: [number, unknown, Record<string, string>, string][] = [
      [
        401,
        { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } },
        {},
        'key_invalid',
      ],
      [
        429,
        { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
        { 'retry-after': '4' },
        'rate_limited',
      ],
      [
        529,
        { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
        {},
        'overloaded',
      ],
      [
        400,
        {
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'prompt is too long: 300000 tokens > 200000 maximum',
          },
        },
        {},
        'context_too_long',
      ],
    ];
    for (const [status, body, headers, problem] of cases) {
      const { client, seen } = sdkWire(() => ({ status, body, headers }));
      const r = await service(client).completeSpec(devSpec());
      expect(r).toMatchObject({ ok: false, problem, error: { httpStatus: status } });
      if (status === 429) expect(r.error?.retryAfterMs).toBe(4000);
      // No SDK retries: retrying is the runner's decision, as on the release path.
      expect(seen).toHaveLength(1);
    }
  });

  it('refuses unknown connections and models that are not enabled', async () => {
    const { client, seen } = sdkWire(() => ({ status: 200, body: MESSAGE }));
    const svc = service(client);
    expect(await svc.completeSpec(devSpec({ connectionId: 'conn_nowhere' }))).toMatchObject({
      ok: false,
      problem: 'not_configured',
    });
    expect(await svc.completeSpec(devSpec({ model: 'claude-opus-9' }))).toMatchObject({
      ok: false,
      problem: 'not_configured',
    });
    expect(await svc.completeSpec(devSpec({ provider: 'openai_compat' }))).toMatchObject({
      problem: 'not_configured',
    });
    expect(seen).toHaveLength(0);
  });
});

// --- compatible and local dev connections -------------------------------------------------

interface FetchSeen {
  url: string;
  init: Parameters<FetchLike>[1];
}

function compatFetch(reply: (url: string, body: Record<string, unknown>) => Response) {
  const seen: FetchSeen[] = [];
  const f: FetchLike = async (url, init) => {
    seen.push({ url, init });
    return reply(url, init.body ? JSON.parse(init.body) : {});
  };
  return { f, seen };
}

const DEV_CONNECTIONS: DevConnectionConfig[] = parseDevConnections({
  connections: [
    {
      id: 'conn_compat',
      kind: 'openai_compat',
      name: 'Example',
      baseUrl: 'https://api.example-llm.com/v1/',
      apiKey: COMPAT_KEY,
      models: [
        { model: 'example-chat', price: { currency: 'USD', input: 1, cacheRead: 0.1, output: 2 } },
        'example-unpriced',
      ],
    },
    { id: 'conn_ollama', kind: 'local', flavor: 'ollama', models: ['qwen3:14b'] },
    { id: 'dev_proxy', kind: 'local', models: ['shadow'] },
    { id: 'bad id', kind: 'local', models: [] },
  ],
});

const ANSWER = '{"ok":true,"word":"好"}';

function chatResponse(content: string | null, extra: Record<string, unknown> = {}): Response {
  return Response.json({
    id: 'chatcmpl-dev',
    model: 'example-chat',
    choices: [
      { index: 0, message: { role: 'assistant', content, ...extra }, finish_reason: 'stop' },
    ],
    usage: {
      prompt_tokens: 1000,
      completion_tokens: 100,
      prompt_tokens_details: { cached_tokens: 400 },
    },
  });
}

describe('dev connections from .local/llm_dev.json', () => {
  it('parses only well-formed entries and never exposes keys', () => {
    expect(DEV_CONNECTIONS.map((c) => c.id)).toEqual(['conn_compat', 'conn_ollama']);
  });

  it('sends compatible calls through the shared adapter with auth added in Node', async () => {
    const { client } = sdkWire(() => ({ status: 200, body: MESSAGE }));
    const { f, seen } = compatFetch(() => chatResponse('{"commands":[],"speech":"好"}'));
    const svc = service(client, { connections: DEV_CONNECTIONS, fetch: f });
    const r = await svc.completeSpec(
      spec({ provider: 'openai_compat', connectionId: 'conn_compat', model: 'example-chat' }),
    );
    expect(r).toMatchObject({
      ok: true,
      json: { commands: [], speech: '好' },
      usage: { inputTokens: 600, cacheReadInputTokens: 400 },
    });
    expect(r.costUsd).toBeCloseTo((600 * 1 + 400 * 0.1 + 100 * 2) / 1e6, 12);
    const sent = seen[0];
    expect(sent?.url).toBe('https://api.example-llm.com/v1/chat/completions');
    expect(sent?.init.redirect).toBe('manual');
    expect(sent?.init.headers.authorization).toBe(`Bearer ${COMPAT_KEY}`);
    expect(JSON.stringify(r)).not.toContain(COMPAT_KEY);
    // A model without a price stays unpriced: money caps cannot count it as free.
    const unpriced = await svc.completeSpec(
      spec({ provider: 'openai_compat', connectionId: 'conn_compat', model: 'example-unpriced' }),
    );
    expect(unpriced.ok).toBe(true);
    expect(unpriced.costUsd).toBeUndefined();
    const status = await svc.status();
    expect(status.connections?.map((c) => c.id)).toEqual([
      'dev_proxy',
      'conn_compat',
      'conn_ollama',
    ]);
    expect(JSON.stringify(status)).not.toContain(COMPAT_KEY);
    expect(status.connections?.[1]).toMatchObject({
      keyState: 'saved',
      keyLast4: '9876',
      baseUrl: 'https://api.example-llm.com/v1',
    });
  });

  it('does not follow redirects and reports transport failures with problem codes', async () => {
    const { client } = sdkWire(() => ({ status: 200, body: MESSAGE }));
    const redirect = compatFetch(
      () => new Response('', { status: 302, headers: { location: 'https://elsewhere.example/' } }),
    );
    const svc = service(client, { connections: DEV_CONNECTIONS, fetch: redirect.f });
    const s = spec({
      provider: 'openai_compat',
      connectionId: 'conn_compat',
      model: 'example-chat',
    });
    expect(await svc.completeSpec(s)).toMatchObject({ ok: false, problem: 'endpoint_wrong' });
    const refused: FetchLike = async () => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    };
    const local = service(client, { connections: DEV_CONNECTIONS, fetch: refused });
    const r = await local.completeSpec(
      spec({ provider: 'local', connectionId: 'conn_ollama', model: 'qwen3:14b' }),
    );
    expect(r).toMatchObject({
      ok: false,
      problem: 'network',
      error: { message: 'local service not running' },
    });
    expect(netErrorKindOf({ name: 'TimeoutError' })).toBe('timeout');
    expect(netErrorKindOf({ cause: { code: 'ENOTFOUND' } })).toBe('dns');
    expect(netErrorKindOf({ cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } })).toBe('tls');
  });
});

// --- middleware routes --------------------------------------------------------------------

interface Captured {
  status: number;
  body: Record<string, unknown>;
}

function fakeReq(method: string, url: string, text?: string): IncomingMessage {
  const r = Readable.from(text === undefined ? [] : [Buffer.from(text, 'utf8')]);
  return Object.assign(r, {
    method,
    url,
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;
}

function call(
  mw: ReturnType<typeof createDevApiMiddleware>,
  method: string,
  url: string,
  body?: unknown,
): Promise<Captured> {
  return new Promise((resolve, reject) => {
    const res = Object.assign(new EventEmitter(), {
      statusCode: 200,
      writableEnded: false,
      writableFinished: false,
      destroyed: false,
      setHeader() {},
      end(text: string) {
        res.writableEnded = true;
        res.writableFinished = true;
        resolve({ status: res.statusCode, body: JSON.parse(text) });
      },
    });
    mw(
      fakeReq(method, url, body === undefined ? undefined : JSON.stringify(body)),
      res as unknown as ServerResponse,
      () => reject(new Error('route not found')),
    );
  });
}

/** A compatible service for the test route: max_tokens and named tools only. */
function compatService() {
  return compatFetch((url, b) => {
    if (url.endsWith('/models')) {
      return Response.json({
        data: [{ id: 'example-chat', context_length: 65536 }, { id: 'example-unpriced' }],
      });
    }
    const rf = b.response_format as { type?: string } | undefined;
    if (
      rf?.type === 'json_schema' ||
      rf?.type === 'json_object' ||
      b.stream === true ||
      'reasoning_effort' in b
    ) {
      return Response.json(
        {
          error: {
            message: 'Unsupported parameter',
            code: 'unsupported_parameter',
            param: 'response_format',
          },
        },
        { status: 400 },
      );
    }
    if (Array.isArray(b.tools)) {
      return chatResponse(null, {
        tool_calls: [
          { id: 'c1', type: 'function', function: { name: 'submit', arguments: ANSWER } },
        ],
      });
    }
    return chatResponse(`答：${ANSWER}`);
  });
}

describe('dev api routes of the contract', () => {
  it('POST /api/llm takes an LlmCallSpec and answers an LlmCallResult', async () => {
    const { client } = sdkWire(() => ({ status: 200, body: MESSAGE }));
    const mw = createDevApiMiddleware({ root: tmpdir(), llmService: service(client) });
    const ok = await call(mw, 'POST', '/api/llm', devSpec());
    expect(ok.status).toBe(200);
    expect(ok.body).toMatchObject({
      ok: true,
      json: { speech: '请进。' },
      servedModel: 'claude-sonnet-5-5',
      channel: 'json_schema',
    });
    const bad = await call(mw, 'POST', '/api/llm', {
      ...devSpec(),
      baseUrl: 'https://evil.example',
    });
    expect(bad).toEqual({
      status: 400,
      body: {
        ok: false,
        error: { cls: 'bad_request', message: 'unexpected field baseUrl' },
        latencyMs: 0,
      },
    });
    const unknown = await call(mw, 'POST', '/api/llm', devSpec({ connectionId: 'conn_nowhere' }));
    expect(unknown.body).toMatchObject({ ok: false, problem: 'not_configured' });
    // The retired legacy body (tier, system, context; no segments) is refused as malformed.
    const legacy = await call(mw, 'POST', '/api/llm', {
      tier: 'mid',
      system: '规则',
      context: '本轮',
      schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      maxTokens: 100,
    });
    expect(legacy).toMatchObject({
      status: 400,
      body: { ok: false, error: { cls: 'bad_request' }, latencyMs: 0 },
    });
  });

  it('GET /api/llm/models lists the dev proxy models through the SDK and compatible models through fetch', async () => {
    const { client, seen } = sdkWire((url) =>
      url.includes('/v1/models')
        ? {
            status: 200,
            body: {
              data: [
                {
                  type: 'model',
                  id: 'claude-sonnet-5-5',
                  display_name: 'Claude Sonnet 5.5',
                  created_at: '2026-01-01T00:00:00Z',
                },
                {
                  type: 'model',
                  id: 'claude-mythos-5-2',
                  display_name: 'Claude Mythos 5.2',
                  created_at: '2026-01-01T00:00:00Z',
                },
              ],
              has_more: false,
              first_id: 'claude-sonnet-5-5',
              last_id: 'claude-mythos-5-2',
            },
          }
        : { status: 200, body: MESSAGE },
    );
    const compat = compatService();
    const mw = createDevApiMiddleware({
      root: tmpdir(),
      llmService: service(client, { connections: DEV_CONNECTIONS, fetch: compat.f }),
    });
    const dev = await call(mw, 'GET', '/api/llm/models');
    expect(dev).toEqual({
      status: 200,
      body: {
        connectionId: 'dev_proxy',
        ok: true,
        models: [
          {
            model: 'claude-sonnet-5-5',
            displayName: 'Claude Sonnet 5.5',
            known: true,
            sizeClass: 'cloud',
          },
        ],
        otherIds: ['claude-mythos-5-2'],
      },
    });
    expect(seen[0]?.url).toContain('/v1/models?limit=100');
    const listed = await call(mw, 'GET', '/api/llm/models?connectionId=conn_compat');
    expect(listed.body).toEqual({
      connectionId: 'conn_compat',
      ok: true,
      models: [
        { model: 'example-chat', known: false, contextTokens: 65536 },
        { model: 'example-unpriced', known: false },
      ],
    });
    expect(await call(mw, 'GET', '/api/llm/models?connectionId=conn_nowhere')).toMatchObject({
      status: 404,
      body: { problem: 'not_configured' },
    });
  });

  it('POST /api/llm/test returns a ConnectionTestReport and later calls use the probed channel', async () => {
    const { client } = sdkWire(() => ({ status: 200, body: MESSAGE }));
    const compat = compatService();
    const svc = service(client, { connections: DEV_CONNECTIONS, fetch: compat.f });
    const mw = createDevApiMiddleware({ root: tmpdir(), llmService: svc });
    const report = await call(mw, 'POST', '/api/llm/test', {
      connectionId: 'conn_compat',
      depth: 'quick',
    });
    expect(report.status).toBe(200);
    expect(Object.keys(report.body).sort()).toEqual([
      'checks',
      'connectionId',
      'depth',
      'models',
      'ok',
      'problems',
      'requests',
      'testedAt',
    ]);
    expect(report.body).toMatchObject({
      connectionId: 'conn_compat',
      depth: 'quick',
      ok: true,
      testedAt: '2026-11-16T00:00:00.000Z',
    });
    const models = report.body.models as { model: string; capability: { channels: string[] } }[];
    expect(models[0]?.capability.channels).toEqual(['tool_carrier', 'prompt_only']);
    for (const s of compat.seen) expect(s.init.headers.authorization).toBe(`Bearer ${COMPAT_KEY}`);
    expect(JSON.stringify(report.body)).not.toContain(COMPAT_KEY);
    compat.seen.length = 0;
    const r = await call(
      mw,
      'POST',
      '/api/llm',
      spec({ provider: 'openai_compat', connectionId: 'conn_compat', model: 'example-chat' }),
    );
    expect(r.body).toMatchObject({ ok: true, channel: 'tool_carrier' });
    expect(JSON.parse(compat.seen[0]?.init.body ?? '{}').tool_choice).toEqual({
      type: 'function',
      function: { name: 'submit' },
    });
    expect(await call(mw, 'POST', '/api/llm/test', { connectionId: 'a b' })).toMatchObject({
      status: 400,
    });
    expect(await call(mw, 'POST', '/api/llm/test', { connectionId: 'conn_nowhere' })).toMatchObject(
      { status: 404 },
    );
  });

  it('tests the dev proxy connection through the SDK, trusting the known table', async () => {
    const { client, seen } = sdkWire((url) =>
      url.includes('/v1/models')
        ? {
            status: 200,
            body: {
              data: [{ type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }],
              has_more: false,
            },
          }
        : {
            status: 200,
            body: {
              ...MESSAGE,
              model: 'claude-haiku-5-5',
              content: [{ type: 'text', text: ANSWER }],
            },
          },
    );
    const svc = service(client, {
      env: {
        ANTHROPIC_API_KEY: TEST_KEY,
        HAKONIWA_MODEL_TOP: 'claude-haiku-5-5',
        HAKONIWA_MODEL_MID: 'claude-haiku-5-5',
      },
    });
    const report = await svc.testConnection({
      connectionId: DEV_PROXY_CONNECTION_ID,
      depth: 'quick',
    });
    expect(report?.ok).toBe(true);
    expect(report?.models.map((m) => m.model)).toEqual(['claude-haiku-5-5']);
    expect(report?.models[0]?.capability).toEqual(capabilityFor('anthropic', 'claude-haiku-5-5'));
    const probe = seen.find((s) => s.url.endsWith('/v1/messages'));
    expect(probe?.body).toMatchObject({
      max_tokens: 64,
      output_config: { format: { type: 'json_schema' } },
    });
  });

  it('limits test and listing calls to ten a minute', async () => {
    const { client } = sdkWire(() => ({ status: 200, body: { data: [], has_more: false } }));
    let t = 1_000;
    const svc = service(client, { now: () => t });
    const mw = createDevApiMiddleware({ root: tmpdir(), llmService: svc });
    for (let i = 0; i < 10; i++)
      expect((await call(mw, 'GET', '/api/llm/models')).status).toBe(200);
    expect(await call(mw, 'GET', '/api/llm/models')).toMatchObject({
      status: 429,
      body: { problem: 'rate_limited' },
    });
    t += 60_001;
    expect((await call(mw, 'GET', '/api/llm/models')).status).toBe(200);
  });
});
