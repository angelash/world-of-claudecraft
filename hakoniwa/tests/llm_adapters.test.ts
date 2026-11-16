// Provider adapters (docs/50_tech/llm_providers.md 3, 10, 16.2): request bodies match the
// golden files byte for byte for every adapter and output channel; recorded answers parse
// into the expected text, stop reason and usage; every problem code that an adapter can
// recognise has a sample per applicable provider and is classified correctly; streaming,
// tool calls and thinking blocks; the no-model adapter; the spec check; the problem
// metadata and presentation rules; and the purity of src/ai/providers. Offline.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { LlmCallResult, ProblemCode } from '../src/ai/contracts';
import { BINDING_ROLES } from '../src/ai/contracts';
import { ADAPTERS, adapterFor } from '../src/ai/providers/adapters';
import { checkBaseUrl } from '../src/ai/providers/address';
import { callSpecFromRequest, parseCallSpec } from '../src/ai/providers/call_spec';
import { noteChannelResult, withCapability } from '../src/ai/providers/capabilities';
import { noneAdapter, noneResult } from '../src/ai/providers/none';
import {
  BAD_OUTPUT_LIMIT,
  capProblem,
  configProblem,
  isOutputUnsupported,
  keychainProblem,
  mergeProblems,
  nextBadOutput,
  OUTPUT_PARAMS,
  PROBLEM_CODES,
  PROBLEMS,
  problemForLegacyError,
  scrubMessage,
  toastDecision,
} from '../src/ai/providers/problems';
import { fillEstimatedInput, visibleStreamText } from '../src/ai/providers/shared';
import type {
  ModelProfile,
  NetErrorKind,
  ProviderKind,
  StreamEvent,
} from '../src/ai/providers/types';
import { GOLDEN_CASES } from './fixtures/llm/golden_cases';
import {
  COMPAT_JSON,
  COMPAT_PROMPT,
  COMPAT_SCHEMA,
  COMPAT_TOOL,
  conn,
  LLAMACPP_JSON,
  LMSTUDIO,
  OLLAMA,
  OLLAMA_JSON,
  OLLAMA_PROMPT,
  OPUS,
  OPUS_PROMPT,
  OPUS_TOOL,
  simpleSpec,
  spec,
} from './fixtures/llm/specs';

const FIXTURES = join(__dirname, 'fixtures');
const GOLDEN = join(FIXTURES, 'llm_golden');
const CASSETTES = join(FIXTURES, 'llm_cassettes');

// --- golden request bodies ------------------------------------------------------------

describe('request bodies (golden)', () => {
  if (process.env.HK_WRITE_LLM_GOLDEN === '1') {
    mkdirSync(GOLDEN, { recursive: true });
    for (const c of GOLDEN_CASES) {
      const req = adapterFor(c.kind).build(c.spec, c.conn, c.prof);
      const golden = {
        name: c.name,
        method: req.method,
        url: req.url,
        read: req.read,
        headers: req.headers,
        body: JSON.parse(req.body ?? 'null'),
      };
      writeFileSync(join(GOLDEN, `${c.name}.json`), `${JSON.stringify(golden, null, 2)}\n`);
    }
  }

  it.each(GOLDEN_CASES.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const file = join(GOLDEN, `${c.name}.json`);
    expect(existsSync(file)).toBe(true);
    const golden = JSON.parse(readFileSync(file, 'utf8'));
    const req = adapterFor(c.kind).build(c.spec, c.conn, c.prof);
    expect(req.method).toBe(golden.method);
    expect(req.url).toBe(golden.url);
    expect(req.read).toBe(golden.read);
    expect(req.headers).toEqual(golden.headers);
    // Byte for byte: same keys, same order, same values.
    expect(req.body).toBe(JSON.stringify(golden.body));
    // Deterministic: the same spec and capability give the same bytes again.
    expect(adapterFor(c.kind).build(c.spec, c.conn, c.prof).body).toBe(req.body);
  });

  it('covers every output channel of every adapter', () => {
    const seen = new Set(GOLDEN_CASES.map((c) => `${c.kind}/${c.prof.capability.channels[0]}`));
    for (const ch of ['json_schema', 'tool_carrier', 'prompt_only']) {
      expect(seen.has(`anthropic/${ch}`)).toBe(true);
    }
    for (const ch of ['json_schema', 'tool_carrier', 'json_mode', 'prompt_only']) {
      expect(seen.has(`openai_compat/${ch}`)).toBe(true);
    }
    for (const ch of ['json_schema', 'json_mode', 'prompt_only']) {
      expect(seen.has(`local/${ch}`)).toBe(true);
    }
  });

  it('never puts a key, an auth header or a sampling parameter into an Anthropic request', () => {
    for (const c of GOLDEN_CASES.filter((x) => x.kind === 'anthropic')) {
      const req = adapterFor(c.kind).build(c.spec, c.conn, c.prof);
      const body = JSON.parse(req.body ?? '{}');
      for (const banned of ['thinking', 'temperature', 'top_p', 'top_k']) {
        expect(banned in body).toBe(false);
      }
      expect(Object.keys(req.headers)).not.toContain('x-api-key');
      expect(Object.keys(req.headers)).not.toContain('authorization');
    }
  });

  it('keeps cache breakpoints within four and one-hour entries before five-minute ones', () => {
    const many = spec({
      segments: [
        { role: 'rules', text: 'a', cache: 'short' },
        { role: 'persona', text: 'b', cache: 'long' },
        { role: 'private', text: 'c', cache: 'short' },
        { role: 'history_user', text: 'd', cache: 'short' },
        { role: 'history_assistant', text: 'e', cache: 'short' },
        { role: 'turn', text: 'f', cache: 'short' },
      ],
    });
    const body = JSON.parse(
      adapterFor('anthropic').build(many, conn('anthropic'), OPUS).body ?? '',
    );
    const text = JSON.stringify(body);
    expect(text.match(/cache_control/g)).toHaveLength(4);
    expect(text).not.toContain('"ttl":"1h"');
    expect(body.messages.at(-1)).toEqual({ role: 'user', content: 'f' });
  });

  it('replaces an empty turn and drops a blank persona, as the legacy proxy did', () => {
    const s = simpleSpec({
      segments: [
        { role: 'rules', text: '规则', cache: 'short' },
        { role: 'persona', text: '  ', cache: 'short' },
        { role: 'turn', text: '' },
      ],
    });
    const body = JSON.parse(adapterFor('anthropic').build(s, conn('anthropic'), OPUS).body ?? '');
    expect(body.system).toEqual([
      { type: 'text', text: '规则', cache_control: { type: 'ephemeral' } },
    ]);
    expect(body.messages).toEqual([{ role: 'user', content: '（无）' }]);
  });

  it('honours the connection switch for the server-side fallback and never asks for Haiku', () => {
    const off = adapterFor('anthropic').build(
      spec(),
      conn('anthropic', { serverFallback: false }),
      OPUS,
    );
    expect(off.headers['anthropic-beta']).toBeUndefined();
    expect('fallbacks' in JSON.parse(off.body ?? '')).toBe(false);
    const haiku = GOLDEN_CASES.find((c) => c.name === 'anthropic_haiku_stream');
    expect(haiku?.prof.capability.serverFallback).toBe(false);
  });

  it('sizes num_ctx by the role and the model (Ollama)', () => {
    const goddess = adapterFor('local').build(
      spec({ provider: 'local', model: 'qwen3:14b', bindingRole: 'goddess' }),
      conn('local', {}, 'ollama'),
      { ...OLLAMA, capability: { ...OLLAMA.capability, contextTokens: 32768 } },
    );
    expect(JSON.parse(goddess.body ?? '').options.num_ctx).toBe(32768);
    const present = adapterFor('local').build(
      spec({ provider: 'local', model: 'qwen3:14b', bindingRole: 'present_npc' }),
      conn('local', {}, 'ollama'),
      { ...OLLAMA, capability: { ...OLLAMA.capability, contextTokens: 32768 } },
    );
    expect(JSON.parse(present.body ?? '').options.num_ctx).toBe(16384);
  });
});

// --- recorded answers -----------------------------------------------------------------

interface Sample {
  name: string;
  profile: string;
  flavor?: 'ollama' | 'lmstudio' | 'llamacpp' | 'generic';
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
  netError?: NetErrorKind;
  chunks?: string[];
  expect: Record<string, unknown>;
  expectText?: string;
}

interface Cassette {
  provider: ProviderKind;
  note: string;
  samples: Sample[];
}

const PROFILES: Record<string, ModelProfile> = {
  opus: OPUS,
  opus_tool: OPUS_TOOL,
  opus_prompt: OPUS_PROMPT,
  compat_schema: COMPAT_SCHEMA,
  compat_tool: COMPAT_TOOL,
  compat_json: COMPAT_JSON,
  compat_prompt: COMPAT_PROMPT,
  ollama: OLLAMA,
  ollama_json: OLLAMA_JSON,
  ollama_prompt: OLLAMA_PROMPT,
  lmstudio: LMSTUDIO,
  llamacpp_json: LLAMACPP_JSON,
};

function loadCassettes(): Cassette[] {
  return readdirSync(CASSETTES)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(CASSETTES, f), 'utf8')) as Cassette);
}

function bodyText(b: unknown): string {
  return typeof b === 'string' ? b : JSON.stringify(b ?? null);
}

interface Replayed {
  result?: LlmCallResult;
  verdict?: ReturnType<(typeof ADAPTERS)['anthropic']['classify']>;
  events?: StreamEvent[];
}

function replay(kind: ProviderKind, s: Sample): Replayed {
  const adapter = adapterFor(kind);
  const prof = PROFILES[s.profile];
  if (!prof) throw new Error(`unknown profile ${s.profile}`);
  if (s.netError) return { verdict: adapter.classify(0, '', {}, s.netError) };
  if (s.chunks) {
    let state = adapter.startStream(prof);
    const events: StreamEvent[] = [];
    for (const chunk of s.chunks) {
      const step = adapter.parseStreamEvent(state, chunk);
      state = step.state;
      events.push(...step.events);
    }
    return { result: adapter.endStream(state, 50, prof), events };
  }
  const status = s.status ?? 200;
  const body = bodyText(s.body);
  const headers = s.headers ?? {};
  const out: Replayed = { result: adapter.parse(status, body, 50, prof, headers) };
  if (status < 200 || status >= 300) out.verdict = adapter.classify(status, body, headers);
  return out;
}

const cassettes = loadCassettes();

describe('recorded answers', () => {
  it('has one cassette per provider', () => {
    expect(cassettes.map((c) => c.provider).sort()).toEqual([
      'anthropic',
      'local',
      'openai_compat',
    ]);
  });

  for (const c of cassettes) {
    describe(c.provider, () => {
      it.each(c.samples.map((s) => [s.name, s] as const))('%s', (_n, s) => {
        const r = replay(c.provider, s);
        const e = s.expect;
        if (r.result) {
          const res = r.result;
          const got: Record<string, unknown> = {};
          for (const k of Object.keys(e)) {
            let v: unknown;
            if (k === 'cls') v = res.error?.cls;
            else if (k === 'retryAfterMs') v = res.error?.retryAfterMs;
            else if (k === 'httpStatus') v = res.error?.httpStatus;
            else if (k === 'unsupportedParam') v = r.verdict?.unsupportedParam;
            else if (k === 'opaqueBlocks') v = res.opaque?.blocks.length ?? 0;
            else v = (res as unknown as Record<string, unknown>)[k];
            got[k] = v ?? null;
          }
          expect(got).toEqual(e);
          expect(res.ok).toBe(!(typeof e.problem === 'string' || typeof e.cls === 'string'));
          // A failure always says why; a success never carries a problem.
          if (res.ok) expect(res.problem).toBeUndefined();
          else expect(res.error).toBeDefined();
          if (r.result.ok === false && r.verdict) {
            // parse and classify agree on the problem
            expect(r.verdict.problem).toBe(r.result.problem);
          }
        } else if (r.verdict) {
          const got: Record<string, unknown> = {};
          for (const k of Object.keys(e)) {
            got[k] = (r.verdict as unknown as Record<string, unknown>)[k] ?? null;
          }
          expect(got).toEqual(e);
        }
        if (s.expectText !== undefined && r.events) {
          // The text deltas a stream emitted add up to the visible answer.
          const streamed = r.events
            .filter((x): x is { t: 'text'; text: string } => x.t === 'text')
            .map((x) => x.text)
            .join('');
          expect(streamed).toBe(s.expectText);
        }
      });
    });
  }

  it('recognises every adapter-side problem code on every provider it applies to', () => {
    const notAdapter: ReadonlySet<ProblemCode> = new Set([
      'unsupported_output',
      'bad_output',
      'keychain_unavailable',
      'not_configured',
      'cap_reached',
    ]);
    const missing: string[] = [];
    for (const code of PROBLEM_CODES) {
      if (notAdapter.has(code)) continue;
      for (const kind of PROBLEMS[code].applies) {
        if (code === 'rate_limited' && kind === 'local') continue; // the local guard raises it
        const c = cassettes.find((x) => x.provider === kind);
        const hit = c?.samples.some((s) => s.expect.problem === code);
        if (!hit) missing.push(`${kind}:${code}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('marks output-channel rejections on every provider, and the third in a row raises unsupported_output', () => {
    for (const c of cassettes) {
      const hit = c.samples.find(
        (s) =>
          typeof s.expect.unsupportedParam === 'string' &&
          OUTPUT_PARAMS.has(s.expect.unsupportedParam),
      );
      expect(hit, c.provider).toBeDefined();
      if (!hit) continue;
      const r = replay(c.provider, hit).result;
      if (!r) throw new Error('no result');
      expect(r.problem).toBeUndefined();
      expect(isOutputUnsupported(r)).toBe(true);
      const prof = PROFILES[hit.profile] as ModelProfile;
      let cap = withCapability(prof, {
        channels: ['json_schema', 'json_mode', 'prompt_only'],
      }).capability;
      let run = 0;
      const problems: (string | undefined)[] = [];
      for (let i = 0; i < 3; i++) {
        const step = noteChannelResult(cap, run, isOutputUnsupported(r));
        cap = step.capability;
        run = step.run;
        problems.push(step.problem);
      }
      expect(problems).toEqual([undefined, undefined, 'unsupported_output']);
      expect(cap.channels[0]).toBe('json_mode');
    }
    const sampling = cassettes
      .find((c) => c.provider === 'anthropic')
      ?.samples.find((s) => s.expect.unsupportedParam === 'temperature');
    if (!sampling) throw new Error('no sampling sample');
    const res = replay('anthropic', sampling).result;
    expect(res && isOutputUnsupported(res)).toBe(false);
  });

  it('holds back thinking tags while streaming', () => {
    expect(visibleStreamText('<think>先想')).toBe('');
    expect(visibleStreamText('<think>先想</think>{"a"')).toBe('{"a"');
    expect(visibleStreamText('{"a":1}<thi')).toBe('{"a":1}');
  });

  it('fills the input estimate of a usage-less stream from the spec', () => {
    const r: LlmCallResult = {
      ok: true,
      usage: {
        inputTokens: 0,
        outputTokens: 5,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      },
      usageEstimated: true,
      latencyMs: 1,
    };
    expect(fillEstimatedInput(r, simpleSpec()).usage?.inputTokens).toBeGreaterThan(0);
  });
});

// --- none adapter, spec check, address rules ------------------------------------------

describe('the none adapter', () => {
  it('never builds a request and answers not_configured', () => {
    expect(() => noneAdapter.build(spec({ provider: 'none' }), conn('none'), OPUS)).toThrow();
    expect(() => noneAdapter.listModels(conn('none'))).toThrow();
    expect(noneAdapter.parse(0, '', 0, OPUS)).toEqual(noneResult());
    // The model is off by choice: a silent decline, never a player problem (D-010).
    expect(noneResult()).toEqual({
      ok: false,
      error: { cls: 'model_unavailable', message: 'model_off' },
      latencyMs: 0,
    });
    expect(noneAdapter.classify(500, '', {}).problem).toBeUndefined();
    const st = noneAdapter.startStream(OPUS);
    expect(noneAdapter.parseStreamEvent(st, 'x').events).toEqual([{ t: 'done' }]);
    expect(adapterFor('none')).toBe(noneAdapter);
    expect(Object.keys(ADAPTERS).sort()).toEqual(['anthropic', 'local', 'none', 'openai_compat']);
  });
});

describe('the call spec check', () => {
  it('accepts a full spec, clamps maxTokens and timeout, and refuses extra fields', () => {
    const ok = parseCallSpec({
      ...spec(),
      output: { ...spec().output, maxTokens: 99_999 },
      timeoutMs: 999_999,
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.value.output.maxTokens).toBe(16_000);
      expect(ok.value.timeoutMs).toBe(300_000);
      expect(ok.value.segments[4]?.opaque?.blocks).toHaveLength(1);
    }
    expect(parseCallSpec({ ...spec(), baseUrl: 'https://evil.example' })).toEqual({
      ok: false,
      error: 'unexpected field baseUrl',
    });
    expect(parseCallSpec({ ...spec(), headers: { a: 'b' } }).ok).toBe(false);
    expect(
      parseCallSpec({ ...spec(), segments: [{ role: 'rules', text: 'x', url: 'y' }] }).ok,
    ).toBe(false);
    expect(parseCallSpec({ ...spec(), bindingRole: 'boss' }).ok).toBe(false);
    expect(parseCallSpec({ ...spec(), connectionId: 'a/b' }).ok).toBe(false);
    const many = Array.from({ length: 65 }, () => ({ role: 'turn', text: 'x' }));
    expect(parseCallSpec({ ...spec(), segments: many })).toEqual({
      ok: false,
      error: 'too many segments',
    });
    expect(parseCallSpec(spec(), 300 * 1024)).toEqual({ ok: false, error: 'spec too large' });
    expect(
      parseCallSpec({
        ...spec(),
        segments: [{ role: 'turn', text: 'x', opaque: { provider: 'anthropic', blocks: [] } }],
      }).ok,
    ).toBe(false);
  });

  it('accepts only thinking blocks as opaque provider data (no address can ride along)', () => {
    const withBlocks = (blocks: unknown[]) =>
      parseCallSpec({
        ...spec(),
        segments: [
          { role: 'history_assistant', text: 'x', opaque: { provider: 'anthropic', blocks } },
          { role: 'turn', text: 'y' },
        ],
      }).ok;
    expect(withBlocks([{ type: 'thinking', thinking: '', signature: 'c2ln' }])).toBe(true);
    expect(withBlocks([{ type: 'redacted_thinking', data: 'ZGF0YQ==' }])).toBe(true);
    expect(
      withBlocks([{ type: 'image', source: { type: 'url', url: 'https://evil.example/x.png' } }]),
    ).toBe(false);
    expect(
      withBlocks([{ type: 'thinking', thinking: '', signature: 'c2ln', url: 'https://x' }]),
    ).toBe(false);
    const constants = parseCallSpec({
      ...spec(),
      output: { ...spec().output, constants: { a: 1 } },
    });
    expect(constants.ok && constants.value.output.constants).toEqual({ a: 1 });
    expect(
      parseCallSpec({ ...spec(), output: { ...spec().output, constants: { a: { b: 1 } } } }).ok,
    ).toBe(false);
  });

  it('bridges the runner request: rules and persona cached, context as the turn', () => {
    const s = callSpecFromRequest(
      {
        requestId: 'ai7',
        tier: 'low',
        system: '规则',
        stable: '人设',
        context: '本轮',
        schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
        maxTokens: 500,
        purpose: 'npc.daily/plan',
        effort: 'low',
        cacheTtl: '1h',
      },
      {
        provider: 'anthropic',
        connectionId: 'dev_proxy',
        bindingRole: 'core_npc',
        model: 'claude-haiku-5-5',
        timeoutMs: 60_000,
      },
    );
    expect(s.segments).toEqual([
      { role: 'rules', text: '规则', cache: 'long' },
      { role: 'persona', text: '人设', cache: 'long' },
      { role: 'turn', text: '本轮' },
    ]);
    expect(s).toMatchObject({
      requestId: 'ai7#1',
      slot: 'low',
      effort: 'low',
      output: { schemaId: 'npc.daily' },
    });
    expect(parseCallSpec(s).ok).toBe(true);
  });
});

describe('address rules', () => {
  it('checks scheme, credentials, https and local ranges', () => {
    expect(checkBaseUrl('https://api.anthropic.com/', 'anthropic')).toEqual({
      ok: true,
      url: 'https://api.anthropic.com',
    });
    expect(checkBaseUrl('http://api.example.com/v1', 'openai_compat').issue).toBe('https_required');
    expect(checkBaseUrl('http://192.168.1.20:8000/v1', 'openai_compat').ok).toBe(true);
    expect(checkBaseUrl('https://u:p@api.example.com', 'openai_compat').issue).toBe('credentials');
    expect(checkBaseUrl('ftp://127.0.0.1', 'local').issue).toBe('scheme');
    expect(checkBaseUrl('not a url', 'local').issue).toBe('invalid');
    expect(checkBaseUrl('http://8.8.8.8:11434', 'local', { flavor: 'ollama' }).issue).toBe(
      'not_local',
    );
    expect(checkBaseUrl('http://10.0.0.5:11434', 'local', { flavor: 'ollama' }).ok).toBe(true);
    expect(checkBaseUrl('http://172.20.0.5:1234', 'local').hintV1).toBe(true);
    expect(checkBaseUrl('http://172.32.0.5:1234', 'local').issue).toBe('not_local');
    expect(checkBaseUrl('http://10.0.0.5:11434', 'local', { web: true }).issue).toBe(
      'web_loopback_only',
    );
    expect(
      checkBaseUrl('http://localhost:11434', 'local', { web: true, flavor: 'ollama' }).ok,
    ).toBe(true);
    expect(checkBaseUrl('https://api.example.com', 'openai_compat').hintV1).toBe(true);
  });
});

// --- problem codes ------------------------------------------------------------------------

describe('problem codes', () => {
  it('are the twenty of the design table, each with keys, source text and fixes', () => {
    expect(PROBLEM_CODES).toHaveLength(20);
    expect(new Set(PROBLEM_CODES).size).toBe(20);
    for (const code of PROBLEM_CODES) {
      const p = PROBLEMS[code];
      expect(p.code).toBe(code);
      expect(p.titleKey).toBe(`llm.problem.${code}.title`);
      expect(p.bodyKey).toBe(`llm.problem.${code}.body`);
      expect(p.source.title.length).toBeGreaterThan(0);
      expect(p.source.body.length).toBeGreaterThan(0);
      expect(p.applies.length).toBeGreaterThan(0);
    }
    expect(PROBLEMS.cors_blocked.applies).toEqual(['local']);
    expect(PROBLEMS.model_not_loaded.applies).toEqual(['local']);
    expect(PROBLEMS.insufficient_balance.applies).toEqual(['anthropic', 'openai_compat']);
    expect(PROBLEMS.network.source.localBody).toBe('本机服务没有启动。');
    const selfHealing = PROBLEM_CODES.filter((c) => PROBLEMS[c].selfHealing).sort();
    expect(selfHealing).toEqual(['overloaded', 'rate_limited', 'server_error', 'timeout']);
  });

  it('raise bad_output on the fifth failure in a row and reset on success', () => {
    let run = 0;
    for (let i = 1; i < BAD_OUTPUT_LIMIT; i++) {
      const r = nextBadOutput(run, false);
      expect(r.problem).toBeUndefined();
      run = r.run;
    }
    expect(nextBadOutput(run, false)).toEqual({ run: 0, problem: 'bad_output' });
    expect(nextBadOutput(3, true)).toEqual({ run: 0 });
  });

  it('cover the non-adapter cases with pure rules', () => {
    expect(keychainProblem('memory_only')).toBe('keychain_unavailable');
    expect(keychainProblem('os_keychain')).toBeUndefined();
    expect(configProblem({ slotEmpty: true, keyMissing: false })).toBe('not_configured');
    expect(configProblem({ slotEmpty: false, keyMissing: true })).toBe('not_configured');
    expect(configProblem({ slotEmpty: false, keyMissing: false })).toBeUndefined();
    expect(capProblem('day')).toBe('cap_reached');
    expect(capProblem('ok')).toBeUndefined();
  });

  it('map the legacy proxy errors (no_proxy and no_credentials to not_configured)', () => {
    expect(problemForLegacyError('no_proxy')).toBe('not_configured');
    expect(problemForLegacyError('no_credentials')).toBe('not_configured');
    expect(problemForLegacyError('model_off')).toBeUndefined();
    expect(problemForLegacyError('auth_failed')).toBe('key_invalid');
    expect(problemForLegacyError('overloaded')).toBe('overloaded');
    expect(problemForLegacyError('bad_request')).toBeUndefined();
  });

  it('merge by code with the affected roles, and toast only when the rules say so', () => {
    const merged = mergeProblems([
      { code: 'timeout', role: 'core_npc', connectionId: 'c1' },
      { code: 'key_invalid', role: 'core_npc', connectionId: 'c1' },
      { code: 'key_invalid', role: 'goddess', connectionId: 'c1' },
      { code: 'key_invalid', role: 'goddess', connectionId: 'c2' },
    ]);
    expect(merged).toEqual([
      {
        code: 'key_invalid',
        connectionIds: ['c1', 'c2'],
        models: [],
        roles: ['goddess', 'core_npc'],
        count: 3,
      },
      { code: 'timeout', connectionIds: ['c1'], models: [], roles: ['core_npc'], count: 1 },
    ]);
    const base = { firstSeenMs: 0, toastedThisSession: false, inReservedScene: false };
    expect(toastDecision({ ...base, code: 'key_invalid', nowMs: 1 })).toBe('toast');
    expect(toastDecision({ ...base, code: 'rate_limited', nowMs: 60_000 })).toBe('panel_only');
    expect(toastDecision({ ...base, code: 'rate_limited', nowMs: 11 * 60_000 })).toBe('toast');
    expect(toastDecision({ ...base, code: 'key_invalid', nowMs: 1, inReservedScene: true })).toBe(
      'defer',
    );
    expect(
      toastDecision({ ...base, code: 'key_invalid', nowMs: 1, toastedThisSession: true }),
    ).toBe('panel_only');
    expect(BINDING_ROLES[0]).toBe('goddess');
  });

  it('scrub key-like strings and auth values from developer text', () => {
    const fake = ['sk', 'ant', 'api03', 'ABCDEFGHIJKLMNOP'].join('-');
    const out = scrubMessage(`bad key ${fake} and Bearer abcdefghijklmnop`);
    expect(out).not.toContain('ABCDEFGHIJ');
    expect(out).not.toContain('abcdefghijklmnop');
    expect(scrubMessage('x'.repeat(500))).toHaveLength(300);
  });
});

// --- purity guard -------------------------------------------------------------------------

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory()
      ? tsFiles(join(dir, d.name))
      : d.name.endsWith('.ts')
        ? [join(dir, d.name)]
        : [],
  );
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('purity of src/ai/providers', () => {
  const files = tsFiles(join(__dirname, '..', 'src', 'ai', 'providers'));
  const adapterFiles = files.filter((f) => !/[\\/](mock|null)\.ts$/.test(f));

  it('has no network, DOM, Electron, clock or randomness', () => {
    const BANNED =
      /\b(fetch\s*\(|XMLHttpRequest|WebSocket|EventSource|(?:document|window)\s*\.|localStorage|Math\.random|Date\.now|performance\.now|new Date\(|setTimeout|setInterval|process\.|crypto\.)|from ['"](node:|electron|http|https|net)['"/]/;
    const bad = adapterFiles.filter((f) => BANNED.test(stripComments(readFileSync(f, 'utf8'))));
    expect(bad).toEqual([]);
  });

  it('has no key-shaped strings in source or fixtures', () => {
    const KEY = /sk-ant-[A-Za-z0-9_-]{6,}|\bsk-[A-Za-z0-9]{20,}/;
    const fixtureFiles = [
      ...readdirSync(CASSETTES).map((f) => join(CASSETTES, f)),
      ...readdirSync(GOLDEN).map((f) => join(GOLDEN, f)),
      ...tsFiles(join(FIXTURES, 'llm')),
    ];
    const bad = [...files, ...fixtureFiles].filter((f) => KEY.test(readFileSync(f, 'utf8')));
    expect(bad).toEqual([]);
  });
});
