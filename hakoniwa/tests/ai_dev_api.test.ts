// Dev service: data path guard, proxy request building, response reading, error mapping,
// and the middleware routes. Offline: the SDK client is a fake, requests are in-memory.

import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import { formatJsonFile, resolveDataPath } from '../tools/data_paths';
import { createDevApiMiddleware, isLoopback } from '../tools/dev_api';
import {
  buildMessageParams,
  classifyError,
  LlmService,
  type NeutralLlmBody,
  parseLlmBody,
  readMessage,
  redact,
  resolveTierModels,
  SERVER_FALLBACK_BETA,
} from '../tools/llm_proxy';

const ROOT = resolve('/srv/hakoniwa/data');

describe('resolveDataPath', () => {
  it('accepts JSON files under the data root', () => {
    const r = resolveDataPath(ROOT, 'npc/shiya.json');
    expect(r).toEqual({ ok: true, path: join(ROOT, 'npc', 'shiya.json'), rel: 'npc/shiya.json' });
  });

  it.each([
    ['../secret.json', 'traversal'],
    ['npc/../../secret.json', 'traversal'],
    ['./a.json', 'traversal'],
    ['a//b.json', 'traversal'],
    ['/etc/passwd.json', 'absolute'],
    ['C:/Windows/x.json', 'absolute'],
    ['npc\\..\\..\\x.json', 'bad_character'],
    ['npc/a\0.json', 'bad_character'],
    ['.hidden.json', 'bad_segment'],
    ['npc/有名.json', 'bad_segment'],
    ['npc/x.txt', 'not_json'],
    ['', 'missing_file'],
  ])('rejects %j (%s)', (file, reason) => {
    expect(resolveDataPath(ROOT, file)).toEqual({ ok: false, reason });
  });

  it('rejects a missing parameter and formats files with two spaces and a newline', () => {
    expect(resolveDataPath(ROOT, null)).toEqual({ ok: false, reason: 'missing_file' });
    expect(formatJsonFile({ a: [1] })).toBe('{\n  "a": [\n    1\n  ]\n}\n');
  });
});

function body(extra: Partial<NeutralLlmBody> = {}): NeutralLlmBody {
  return {
    tier: 'mid',
    system: '规则',
    stable: '人设',
    context: '本轮',
    schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
    maxTokens: 1000,
    effort: 'low',
    cacheTtl: '5m',
    purpose: 'npc.dialogue/turn',
    requestId: 'ai1',
    ...extra,
  };
}

describe('proxy request building', () => {
  it('validates and normalises the neutral body', () => {
    const ok = parseLlmBody({
      ...body(),
      maxTokens: 999_999,
      effort: undefined,
      cacheTtl: undefined,
    });
    expect(ok).toMatchObject({
      ok: true,
      value: { maxTokens: 16_000, effort: 'medium', cacheTtl: '5m' },
    });
    expect(parseLlmBody({ ...body(), tier: 'ultra' })).toEqual({ ok: false, error: 'bad tier' });
    expect(parseLlmBody({ ...body(), schema: 'x' }).ok).toBe(false);
    expect(parseLlmBody({ ...body(), effort: 'max' }).ok).toBe(false);
    expect(parseLlmBody({ ...body(), maxTokens: 0 }).ok).toBe(false);
    expect(parseLlmBody([]).ok).toBe(false);
  });

  it('maps tiers through a model whitelist', () => {
    const warnings: string[] = [];
    const tiers = resolveTierModels(
      { HAKONIWA_MODEL_TOP: 'claude-sonnet-5-5', HAKONIWA_MODEL_LOW: 'gpt-x' },
      { mid: 'claude-haiku-5-5' },
      (m) => warnings.push(m),
    );
    expect(tiers).toEqual({
      top: 'claude-sonnet-5-5',
      mid: 'claude-haiku-5-5',
      low: 'claude-haiku-5-5',
    });
    expect(warnings).toHaveLength(1);
  });

  it('builds a Messages request with structured output, explicit effort, cache breakpoints and fallback', () => {
    const p = buildMessageParams(body({ cacheTtl: '1h' }), 'claude-opus-5-5');
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.max_tokens).toBe(1000);
    expect(p.system).toEqual([
      { type: 'text', text: '规则', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: '人设', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    expect(p.messages).toEqual([{ role: 'user', content: '本轮' }]);
    expect(p.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: body().schema },
    });
    expect(p.betas).toEqual([SERVER_FALLBACK_BETA]);
    expect(p.fallbacks).toBe('default');
    for (const banned of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice']) {
      expect(banned in p).toBe(false);
    }
    expect(buildMessageParams(body(), 'claude-sonnet-5-5').fallbacks).toBe('default');
  });

  it('never requests the server fallback for Haiku 5.5, and drops an empty persona block', () => {
    const p = buildMessageParams(body({ stable: '  ', context: '' }), 'claude-haiku-5-5');
    expect('fallbacks' in p).toBe(false);
    expect('betas' in p).toBe(false);
    expect(p.system).toEqual([
      { type: 'text', text: '规则', cache_control: { type: 'ephemeral' } },
    ]);
    expect(p.messages).toEqual([{ role: 'user', content: '（无）' }]);
  });
});

type Msg = Parameters<typeof readMessage>[0];

function message(extra: Partial<Msg> = {}): Msg {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-sonnet-5-5',
    content: [
      { type: 'thinking', thinking: '', signature: 'sig' },
      { type: 'text', text: '{"commands":[]', citations: null },
      { type: 'text', text: ',"speech":"嗯"}', citations: null },
    ],
    stop_reason: 'end_turn',
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      iterations: null,
    },
    ...extra,
  } as unknown as Msg;
}

describe('proxy response reading', () => {
  it('joins text blocks, parses JSON and prices the served model', () => {
    const p = readMessage(message(), 'claude-sonnet-5-5', 12);
    expect(p).toMatchObject({
      ok: true,
      json: { commands: [], speech: '嗯' },
      model: 'claude-sonnet-5-5',
      stopReason: 'end_turn',
      latencyMs: 12,
      fallbackUsed: false,
    });
    expect(p.costUsd).toBeCloseTo((100 * 2 + 50 * 10 + 1000 * 0.1) / 1e6, 9);
  });

  it('checks refusal before reading content', () => {
    const p = readMessage(
      message({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: null },
      } as Partial<Msg>),
      'claude-opus-5-5',
      5,
    );
    expect(p).toMatchObject({ ok: false, error: 'refusal', stopReason: 'refusal' });
    expect('json' in p).toBe(false);
  });

  it('keeps raw text when the output is not JSON', () => {
    const p = readMessage(
      message({ content: [{ type: 'text', text: '不是 JSON', citations: null }] } as Partial<Msg>),
      'claude-haiku-5-5',
      1,
    );
    expect(p).toMatchObject({ ok: true, json: null, text: '不是 JSON' });
  });
});

describe('error mapping', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-api03-SECRETSECRET' };

  it('maps typed SDK errors to statuses without string matching', () => {
    const rate = new Anthropic.RateLimitError(
      429,
      undefined,
      'slow down',
      new Headers({ 'retry-after': '3' }),
    );
    expect(classifyError(rate, Anthropic, env, true)).toEqual({
      status: 503,
      payload: { ok: false, error: 'rate_limited', message: '模型限流', retryAfterMs: 3000 },
    });
    const overloaded = new Anthropic.InternalServerError(529, undefined, 'busy', new Headers());
    expect(classifyError(overloaded, Anthropic, env, true).payload.error).toBe('overloaded');
    const auth = new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers());
    expect(classifyError(auth, Anthropic, env, true)).toMatchObject({
      status: 503,
      payload: { error: 'auth_failed' },
    });
    const timeout = new Anthropic.APIConnectionTimeoutError();
    expect(classifyError(timeout, Anthropic, env, true).payload.error).toBe('timeout');
    const net = new Anthropic.APIConnectionError({ message: 'down' });
    expect(classifyError(net, Anthropic, env, true).payload.error).toBe('network');
    const bad = new Anthropic.BadRequestError(
      400,
      undefined,
      `oops ${env.ANTHROPIC_API_KEY}`,
      new Headers(),
    );
    const mapped = classifyError(bad, Anthropic, env, true);
    expect(mapped.status).toBe(400);
    expect(JSON.stringify(mapped)).not.toContain('SECRET');
  });

  it('reports no_credentials when the SDK cannot resolve any authentication', () => {
    expect(classifyError(new Error('no auth'), Anthropic, {}, false)).toMatchObject({
      status: 503,
      payload: { error: 'no_credentials' },
    });
    expect(classifyError(new Error('bug'), Anthropic, env, true).status).toBe(500);
  });

  it('redacts credentials from messages', () => {
    expect(
      redact('key sk-ant-abc_DEF-123 and tok123456789', { ANTHROPIC_AUTH_TOKEN: 'tok123456789' }),
    ).toBe('key [redacted] and [redacted]');
  });
});

interface FakeCall {
  params: unknown;
  opts: unknown;
}

function fakeService(env: Record<string, string | undefined>, answer: Msg | Error) {
  const calls: FakeCall[] = [];
  let listed = 0;
  const client = {
    beta: {
      messages: {
        create: async (params: unknown, opts: unknown) => {
          calls.push({ params, opts });
          if (answer instanceof Error) throw answer;
          return answer;
        },
      },
    },
    models: {
      list: async () => {
        listed += 1;
        throw new Error('no auth');
      },
    },
  };
  const svc = new LlmService({
    env,
    log: () => {},
    loadSdk: async () => ({
      client: client as unknown as InstanceType<typeof Anthropic>,
      errors: Anthropic,
    }),
  });
  return { svc, calls, listed: () => listed };
}

/** A real SDK client whose transport is an in-memory fetch (no network). */
function sdkWithFakeFetch(reply: {
  status: number;
  body: unknown;
  headers?: Record<string, string>;
}) {
  const seen: { url: string; headers: Headers; body: Record<string, unknown> }[] = [];
  const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    seen.push({
      url: String(url),
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body ?? '{}')),
    });
    return new Response(JSON.stringify(reply.body), {
      status: reply.status,
      headers: { 'content-type': 'application/json', ...reply.headers },
    });
  };
  const client = new Anthropic({ apiKey: 'sk-ant-test-key', fetch: fakeFetch, maxRetries: 0 });
  const svc = new LlmService({
    env: { ANTHROPIC_API_KEY: 'sk-ant-test-key' },
    log: () => {},
    loadSdk: async () => ({ client, errors: Anthropic }),
  });
  return { svc, seen };
}

describe('LlmService through the real SDK (in-memory fetch)', () => {
  it('sends structured output, effort, cache breakpoints and the fallback beta on the wire', async () => {
    const { svc, seen } = sdkWithFakeFetch({
      status: 200,
      body: {
        id: 'msg_1',
        type: 'message',
        role: 'assistant',
        model: 'claude-opus-5-5',
        content: [{ type: 'text', text: '{"commands":[],"speech":"客人。"}' }],
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: {
          input_tokens: 20,
          output_tokens: 30,
          cache_read_input_tokens: 2000,
          cache_creation_input_tokens: 0,
        },
      },
    });
    const out = await svc.complete(body({ tier: 'top', cacheTtl: '1h', effort: 'medium' }));
    expect(out.status).toBe(200);
    expect(out.payload).toMatchObject({
      ok: true,
      json: { speech: '客人。' },
      model: 'claude-opus-5-5',
    });
    const req = seen[0];
    if (!req) throw new Error('no request');
    expect(req.url).toContain('/v1/messages');
    expect(req.headers.get('anthropic-beta')).toContain(SERVER_FALLBACK_BETA);
    expect(req.body).toMatchObject({
      model: 'claude-opus-5-5',
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema' } },
      system: [
        { type: 'text', text: '规则', cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: '人设', cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
    });
    expect('thinking' in req.body).toBe(false);
    expect('betas' in req.body).toBe(false);
  });

  it('maps an upstream 429 to rate_limited with retryAfter and no key in the payload', async () => {
    const { svc, seen } = sdkWithFakeFetch({
      status: 429,
      body: { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } },
      headers: { 'retry-after': '7' },
    });
    const out = await svc.complete(body({ tier: 'low' }));
    expect(out).toEqual({
      status: 503,
      payload: { ok: false, error: 'rate_limited', message: '模型限流', retryAfterMs: 7000 },
    });
    expect(seen[0]?.headers.get('anthropic-beta')).toBeNull();
    expect('fallbacks' in (seen[0]?.body ?? {})).toBe(false);
  });
});

describe('LlmService', () => {
  it('reports status from environment credentials without touching the SDK', async () => {
    const { svc, listed } = fakeService({ ANTHROPIC_API_KEY: 'sk-ant-x' }, message());
    expect(await svc.status()).toMatchObject({
      available: true,
      source: 'api_key',
      tiers: { top: 'claude-opus-5-5', mid: 'claude-sonnet-5-5', low: 'claude-haiku-5-5' },
      serverFallback: { top: true, mid: true, low: false },
    });
    expect(listed()).toBe(0);
  });

  it('probes a profile when the environment has no credential', async () => {
    const { svc, listed } = fakeService({}, message());
    expect(await svc.status()).toMatchObject({ available: false, reason: 'no_credentials' });
    await svc.status();
    expect(listed()).toBe(1);
  });

  it('calls the beta Messages API for the tier model and returns the payload', async () => {
    const { svc, calls } = fakeService({ ANTHROPIC_API_KEY: 'sk-ant-x' }, message());
    const out = await svc.complete(body({ tier: 'mid' }));
    expect(out.status).toBe(200);
    expect(out.payload).toMatchObject({ ok: true, json: { commands: [], speech: '嗯' } });
    expect(calls[0]?.params).toMatchObject({ model: 'claude-sonnet-5-5', fallbacks: 'default' });
    expect(calls[0]?.opts).toMatchObject({ timeout: 120_000 });
  });

  it('turns an auth failure into an unavailable status', async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, 'bad', new Headers());
    const { svc } = fakeService({ ANTHROPIC_API_KEY: 'sk-ant-x' }, auth);
    expect((await svc.complete(body())).payload.error).toBe('auth_failed');
    expect(await svc.status()).toMatchObject({ available: false, reason: 'auth_failed' });
  });
});

// --- middleware --------------------------------------------------------------

interface Captured {
  status: number;
  body: unknown;
}

function fakeReq(
  method: string,
  url: string,
  text?: string,
  remote = '127.0.0.1',
): IncomingMessage {
  const r = Readable.from(text === undefined ? [] : [Buffer.from(text, 'utf8')]);
  return Object.assign(r, {
    method,
    url,
    socket: { remoteAddress: remote },
  }) as unknown as IncomingMessage;
}

function fakeRes(): { res: ServerResponse; done: Promise<Captured> } {
  let finish: (c: Captured) => void = () => {};
  const done = new Promise<Captured>((r) => {
    finish = r;
  });
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableEnded: false,
    writableFinished: false,
    destroyed: false,
    setHeader() {},
    end(text: string) {
      res.writableEnded = true;
      res.writableFinished = true;
      finish({ status: res.statusCode, body: JSON.parse(text) });
    },
  });
  return { res: res as unknown as ServerResponse, done };
}

describe('dev api middleware', () => {
  let root = '';
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = '';
  });

  async function call(
    mw: ReturnType<typeof createDevApiMiddleware>,
    method: string,
    url: string,
    text?: string,
    remote?: string,
  ): Promise<Captured | 'next'> {
    const { res, done } = fakeRes();
    let nexted = false;
    mw(fakeReq(method, url, text, remote), res, () => {
      nexted = true;
    });
    if (nexted) return 'next';
    return done;
  }

  it('writes and reads data files and rejects traversal', async () => {
    root = await mkdtemp(join(tmpdir(), 'hakoniwa-devapi-'));
    const mw = createDevApiMiddleware({ root, allowRemote: false });
    expect(await call(mw, 'PUT', '/api/data?file=npc/test.json', '{"b":1,"a":[1]}')).toEqual({
      status: 200,
      body: { ok: true, file: 'npc/test.json' },
    });
    expect(await readFile(join(root, 'data', 'npc', 'test.json'), 'utf8')).toBe(
      '{\n  "b": 1,\n  "a": [\n    1\n  ]\n}\n',
    );
    expect(await call(mw, 'GET', '/api/data?file=npc/test.json')).toEqual({
      status: 200,
      body: { b: 1, a: [1] },
    });
    expect(await call(mw, 'GET', '/api/data?file=..%2Fpackage.json')).toEqual({
      status: 400,
      body: { ok: false, error: 'traversal' },
    });
    expect(await call(mw, 'PUT', '/api/data?file=npc/x.json', '{oops')).toEqual({
      status: 400,
      body: { ok: false, error: 'invalid_json' },
    });
    expect(await call(mw, 'GET', '/api/data?file=npc/none.json')).toMatchObject({ status: 404 });
  });

  it('appends audit records as JSON lines under .local/', async () => {
    root = await mkdtemp(join(tmpdir(), 'hakoniwa-devapi-'));
    const mw = createDevApiMiddleware({ root });
    expect(await call(mw, 'POST', '/api/audit', '{"auditId":"audit1"}')).toEqual({
      status: 200,
      body: { ok: true },
    });
    await call(mw, 'POST', '/api/audit', '{"auditId":"audit2"}');
    const lines = (await readFile(join(root, '.local', 'audit.jsonl'), 'utf8')).trim().split('\n');
    expect(lines.map((l) => JSON.parse(l).auditId)).toEqual(['audit1', 'audit2']);
    expect(await call(mw, 'POST', '/api/audit', '[1]')).toMatchObject({ status: 400 });
  });

  it('serves loopback only by default and passes other paths on', async () => {
    const mw = createDevApiMiddleware({ root: tmpdir(), allowRemote: false });
    expect(await call(mw, 'GET', '/api/llm/status', undefined, '192.168.1.20')).toMatchObject({
      status: 403,
    });
    expect(await call(mw, 'GET', '/index.html')).toBe('next');
    expect(await call(mw, 'PATCH', '/api/data?file=a.json')).toBe('next');
    // DELETE /api/data is routed, and only removes staged batch files
    expect(await call(mw, 'DELETE', '/api/data?file=a.json')).toMatchObject({
      status: 400,
      body: { ok: false, error: 'not_staging' },
    });
    expect(isLoopback('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopback('10.0.0.2')).toBe(false);
  });

  it('proxies POST /api/llm through the service and validates the body', async () => {
    const { svc } = fakeService({ ANTHROPIC_API_KEY: 'sk-ant-x' }, message());
    const mw = createDevApiMiddleware({ root: tmpdir(), llmService: svc });
    expect(await call(mw, 'POST', '/api/llm', JSON.stringify(body()))).toMatchObject({
      status: 200,
      body: { ok: true, json: { commands: [], speech: '嗯' }, model: 'claude-sonnet-5-5' },
    });
    expect(await call(mw, 'POST', '/api/llm', '{"tier":"mid"}')).toMatchObject({
      status: 400,
      body: { ok: false, error: 'bad_request' },
    });
    expect(await call(mw, 'GET', '/api/llm/status')).toMatchObject({
      status: 200,
      body: { available: true, source: 'api_key' },
    });
  });
});
