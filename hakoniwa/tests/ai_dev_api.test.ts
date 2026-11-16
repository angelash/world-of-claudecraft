// Dev service: data path guard, the proxy's SDK request building for the LlmCallSpec
// contract, response reading, error mapping, and the middleware routes. Offline: the SDK
// client is a fake, requests are in-memory. The field-by-field equality of the SDK path and
// the release Anthropic adapter is tests/llm_dev_proxy_contract.test.ts.

import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import Anthropic from '@anthropic-ai/sdk';
import { afterEach, describe, expect, it } from 'vitest';
import type { LlmCallSpec, LlmRequest } from '../src/ai/contracts';
import { EMPTY_TURN } from '../src/ai/providers';
import { callSpecFromRequest } from '../src/ai/providers/call_spec';
import { profileFor } from '../src/ai/providers/capabilities';
import { formatJsonFile, resolveDataPath } from '../tools/data_paths';
import { createDevApiMiddleware, isLoopback } from '../tools/dev_api';
import {
  buildSpecMessageParams,
  DEV_PROXY_CONNECTION_ID,
  LlmService,
  MAX_TOKENS_CAP,
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

/** A legacy-shaped request as the runner sends it (rules, persona, turn). */
function request(extra: Partial<LlmRequest> = {}): LlmRequest {
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

/** The request as a spec on the dev proxy connection (what TransportProvider sends). */
function devSpec(model: string, extra: Partial<LlmRequest> = {}): LlmCallSpec {
  return callSpecFromRequest(request(extra), {
    provider: 'anthropic',
    connectionId: DEV_PROXY_CONNECTION_ID,
    bindingRole: 'core_npc',
    model,
    timeoutMs: 60_000,
  });
}

describe('proxy request building', () => {
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
    const dev = new LlmService({ env: {}, log: () => {}, connectionsFile: null });
    const opus = 'claude-opus-5-5';
    const p = buildSpecMessageParams(
      devSpec(opus, { cacheTtl: '1h' }),
      dev.devProxyConnection(),
      profileFor('anthropic', opus),
    );
    expect(p.model).toBe(opus);
    expect(p.max_tokens).toBe(1000);
    expect(p.system).toEqual([
      { type: 'text', text: '规则', cache_control: { type: 'ephemeral', ttl: '1h' } },
      { type: 'text', text: '人设', cache_control: { type: 'ephemeral', ttl: '1h' } },
    ]);
    expect(p.messages).toEqual([{ role: 'user', content: '本轮' }]);
    expect(p.output_config).toEqual({
      effort: 'low',
      format: { type: 'json_schema', schema: request().schema },
    });
    expect(p.betas).toEqual([SERVER_FALLBACK_BETA]);
    expect(p.fallbacks).toBe('default');
    for (const banned of ['thinking', 'temperature', 'top_p', 'top_k', 'tool_choice']) {
      expect(banned in p).toBe(false);
    }
    const sonnet = 'claude-sonnet-5-5';
    const mid = buildSpecMessageParams(
      devSpec(sonnet),
      dev.devProxyConnection(),
      profileFor('anthropic', sonnet),
    );
    expect(mid.fallbacks).toBe('default');
  });

  it('never requests the server fallback for Haiku 5.5, and drops an empty persona block', () => {
    const dev = new LlmService({ env: {}, log: () => {}, connectionsFile: null });
    const haiku = 'claude-haiku-5-5';
    const p = buildSpecMessageParams(
      devSpec(haiku, { stable: '  ', context: '' }),
      dev.devProxyConnection(),
      profileFor('anthropic', haiku),
    );
    expect('fallbacks' in p).toBe(false);
    expect('betas' in p).toBe(false);
    expect(p.system).toEqual([
      { type: 'text', text: '规则', cache_control: { type: 'ephemeral' } },
    ]);
    expect(p.messages).toEqual([{ role: 'user', content: EMPTY_TURN }]);
  });
});

type Msg = Anthropic.Beta.Messages.BetaMessage;

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
    connectionsFile: null,
    loadSdk: async () => ({
      client: client as unknown as InstanceType<typeof Anthropic>,
      errors: Anthropic,
    }),
  });
  return { svc, calls, listed: () => listed };
}

describe('proxy response reading', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-x' };

  it('joins text blocks, parses JSON and prices the served model', async () => {
    const { svc } = fakeService(env, message());
    const r = await svc.completeSpec(devSpec('claude-sonnet-5-5'));
    expect(r).toMatchObject({
      ok: true,
      json: { commands: [], speech: '嗯' },
      servedModel: 'claude-sonnet-5-5',
      stopReason: 'end',
      rawStopReason: 'end_turn',
      fallbackUsed: false,
    });
    expect(r.costUsd).toBeCloseTo((100 * 2 + 50 * 10 + 1000 * 0.1) / 1e6, 9);
  });

  it('checks refusal before reading content', async () => {
    const { svc } = fakeService(
      env,
      message({
        stop_reason: 'refusal',
        stop_details: { type: 'refusal', category: 'cyber', explanation: null },
      } as Partial<Msg>),
    );
    const r = await svc.completeSpec(devSpec('claude-opus-5-5'));
    expect(r).toMatchObject({ ok: false, problem: 'refusal', stopReason: 'refusal' });
    expect('json' in r).toBe(false);
  });

  it('keeps raw text when the output is not JSON', async () => {
    const { svc } = fakeService(
      env,
      message({
        model: 'claude-haiku-5-5',
        content: [{ type: 'text', text: '不是 JSON', citations: null }],
      } as Partial<Msg>),
    );
    const r = await svc.completeSpec(devSpec('claude-haiku-5-5'));
    expect(r).toMatchObject({ ok: true, json: null, text: '不是 JSON' });
  });
});

describe('error mapping', () => {
  const env = { ANTHROPIC_API_KEY: 'sk-ant-api03-SECRETSECRET' };

  it('maps SDK exceptions to problem codes and scrubs credentials', async () => {
    const cases: [Error, string, string][] = [
      [new Anthropic.APIConnectionTimeoutError(), 'timeout', 'timeout'],
      [new Anthropic.APIConnectionError({ message: 'down' }), 'network', 'network'],
      [
        new Anthropic.AuthenticationError(401, undefined, 'bad key', new Headers()),
        'auth',
        'key_invalid',
      ],
      [
        new Anthropic.InternalServerError(529, undefined, 'busy', new Headers()),
        'overloaded',
        'overloaded',
      ],
    ];
    for (const [err, cls, problem] of cases) {
      const { svc } = fakeService(env, err);
      expect(await svc.completeSpec(devSpec('claude-sonnet-5-5'))).toMatchObject({
        ok: false,
        error: { cls },
        problem,
      });
    }
    const bug = fakeService(env, new Error(`oops ${env.ANTHROPIC_API_KEY}`));
    const r = await bug.svc.completeSpec(devSpec('claude-sonnet-5-5'));
    expect(r).toMatchObject({ ok: false, problem: 'server_error' });
    expect(JSON.stringify(r)).not.toContain('SECRET');
  });

  it('reports not_configured when the SDK cannot resolve any authentication', async () => {
    const { svc } = fakeService({}, new Error('no auth'));
    expect(await svc.completeSpec(devSpec('claude-sonnet-5-5'))).toMatchObject({
      ok: false,
      problem: 'not_configured',
    });
  });

  it('redacts credentials from messages', () => {
    expect(
      redact('key sk-ant-abc_DEF-123 and tok123456789', { ANTHROPIC_AUTH_TOKEN: 'tok123456789' }),
    ).toBe('key [redacted] and [redacted]');
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

  it('calls the beta Messages API for the tier model, without SDK retries, and caps the output', async () => {
    const { svc, calls } = fakeService({ ANTHROPIC_API_KEY: 'sk-ant-x' }, message());
    const out = await svc.completeSpec(devSpec(svc.tiers.mid, { maxTokens: 999_999 }));
    expect(out).toMatchObject({ ok: true, json: { commands: [], speech: '嗯' } });
    expect(calls[0]?.params).toMatchObject({
      model: 'claude-sonnet-5-5',
      fallbacks: 'default',
      max_tokens: MAX_TOKENS_CAP,
    });
    expect(calls[0]?.opts).toMatchObject({ timeout: 60_000, maxRetries: 0 });
  });

  it('turns an auth failure into an unavailable status', async () => {
    const auth = new Anthropic.AuthenticationError(401, undefined, 'bad', new Headers());
    const { svc } = fakeService({ ANTHROPIC_API_KEY: 'sk-ant-x' }, auth);
    expect(await svc.completeSpec(devSpec('claude-sonnet-5-5'))).toMatchObject({
      ok: false,
      problem: 'key_invalid',
    });
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
    const spec = JSON.stringify(devSpec('claude-sonnet-5-5'));
    expect(await call(mw, 'POST', '/api/llm', spec)).toMatchObject({
      status: 200,
      body: { ok: true, json: { commands: [], speech: '嗯' }, servedModel: 'claude-sonnet-5-5' },
    });
    // The retired legacy body (no segments) is a malformed spec now.
    const legacy = JSON.stringify(request());
    expect(await call(mw, 'POST', '/api/llm', legacy)).toMatchObject({
      status: 400,
      body: { ok: false, error: { cls: 'bad_request' }, latencyMs: 0 },
    });
    expect(await call(mw, 'POST', '/api/llm', '{"tier":"mid"}')).toMatchObject({
      status: 400,
      body: { ok: false, error: { cls: 'bad_request' } },
    });
    expect(await call(mw, 'GET', '/api/llm/status')).toMatchObject({
      status: 200,
      body: { available: true, source: 'api_key' },
    });
  });
});
