// Capability detection (docs/50_tech/llm_providers.md 3.5, 3.7, 4.5, 4.6, 5.6, 16.2): the
// known model table and generic records per provider; feature detection (tool calls,
// structured output, streaming, prompt cache, thinking blocks) by provider and model;
// probe outcomes read into a capability record; the channel fallback order; the runtime
// downgrade after three unsupported_output failures; static role labels; the price book;
// and the quick connection test over a fake service. Offline.

import { describe, expect, it } from 'vitest';
import type { LlmCallSpec } from '../src/ai/contracts';
import {
  costUsd,
  costWithCard,
  FX_CNY_PER_USD,
  MODEL_PRICES,
  PROVIDER_LINKS,
  priceCardOf,
} from '../src/ai/pricing';
import { adapterFor } from '../src/ai/providers/adapters';
import {
  capabilityFor,
  capabilityFromProbes,
  defaultBaseUrl,
  defaultCapability,
  featuresOf,
  knownModel,
  knownModelIds,
  lowContextRoles,
  noteChannelResult,
  PROBE_MAX_TOKENS,
  type ProbeOutcome,
  parseParamSize,
  probeProfile,
  profileFor,
  ROLE_REQUIREMENTS,
  sizeClassOf,
  staticRoleLabel,
  UNSUPPORTED_OUTPUT_LIMIT,
  withCapability,
} from '../src/ai/providers/capabilities';
import { fetchModelListing, runConnectionTest } from '../src/ai/providers/connection_test';
import type {
  AdapterHttpRequest,
  AdapterSend,
  AdapterSendResult,
  Capability,
  ConnectionPublic,
  ProbeKind,
} from '../src/ai/providers/types';
import { conn } from './fixtures/llm/specs';

describe('known model table', () => {
  it('lists the three Anthropic models with their tiers and labels', () => {
    expect(knownModelIds('anthropic')).toEqual([
      'claude-opus-5-5',
      'claude-sonnet-5-5',
      'claude-haiku-5-5',
    ]);
    expect(knownModel('anthropic', 'claude-opus-5-5')?.tier).toBe('top');
    expect(knownModel('anthropic', 'claude-sonnet-5-5')?.tier).toBe('mid');
    expect(knownModel('anthropic', 'claude-haiku-5-5')?.tier).toBe('low');
    expect(knownModel('anthropic', 'claude-haiku-5-5')?.labels.goddess).toBe('marginal');
    expect(knownModel('anthropic', 'claude-haiku-5-5')?.labels.core_npc).toBe('ok');
    expect(knownModel('anthropic', 'claude-sonnet-5-5')?.labels.goddess).toBe('ok');
    expect(knownModel('openai_compat', 'claude-opus-5-5')).toBeUndefined();
    expect(knownModel('anthropic', 'claude-unknown')).toBeUndefined();
  });

  it('records json_schema first, adaptive thinking, effort, no sampling, fallback on top and mid', () => {
    for (const id of knownModelIds('anthropic')) {
      const cap = capabilityFor('anthropic', id);
      expect(cap.channels[0]).toBe('json_schema');
      expect(cap.thinking).toBe('adaptive');
      expect(cap.effort).toBe(true);
      expect(cap.samplingParams).toBe(false);
      expect(cap.forcedTool).toBe(false);
      expect(cap.source).toBe('known_table');
      expect(cap.contextSource).toBe('known_table');
    }
    expect(capabilityFor('anthropic', 'claude-opus-5-5').serverFallback).toBe(true);
    expect(capabilityFor('anthropic', 'claude-sonnet-5-5').serverFallback).toBe(true);
    expect(capabilityFor('anthropic', 'claude-haiku-5-5').serverFallback).toBe(false);
  });

  it('has a requirement row for each binding role (4.5)', () => {
    expect(ROLE_REQUIREMENTS.goddess).toEqual({
      minContext: 49152,
      minSizeClass: '30b',
      minChannel: 'json_mode',
      cloudAdvised: true,
    });
    expect(ROLE_REQUIREMENTS.court_reviewer.minChannel).toBe('tool_carrier');
    expect(ROLE_REQUIREMENTS.present_npc.minSizeClass).toBe('7b');
    expect(Object.keys(ROLE_REQUIREMENTS)).toHaveLength(6);
  });
});

describe('feature detection by provider and model', () => {
  it('Anthropic known models', () => {
    expect(featuresOf(capabilityFor('anthropic', 'claude-sonnet-5-5'))).toEqual({
      toolCalls: false,
      structuredOutput: 'schema',
      streaming: true,
      promptCache: true,
      thinkingBlocks: true,
      effort: true,
    });
  });

  it('generic records before probing', () => {
    expect(featuresOf(defaultCapability('anthropic'))).toMatchObject({
      structuredOutput: 'prompt',
      thinkingBlocks: false,
    });
    const compat = defaultCapability('openai_compat');
    expect(featuresOf(compat)).toEqual({
      toolCalls: false,
      structuredOutput: 'prompt',
      streaming: true,
      promptCache: true,
      thinkingBlocks: false,
      effort: false,
    });
    expect(compat).toMatchObject({
      contextTokens: 32768,
      cacheUsageField: 'cached_tokens',
      samplingParams: true,
      source: 'default',
    });
    const ollama = defaultCapability('local', 'ollama');
    expect(ollama).toMatchObject({
      maxTokensParam: 'num_predict',
      thinking: 'think_flag',
      promptCache: 'server_slot',
      contextTokens: 8192,
    });
    expect(featuresOf(ollama).structuredOutput).toBe('schema');
    expect(defaultCapability('local', 'lmstudio').thinking).toBe('tag_strip');
    expect(defaultCapability('local', 'llamacpp').channels).toEqual([
      'json_schema',
      'json_mode',
      'prompt_only',
    ]);
    expect(defaultCapability('local', 'generic').channels).toEqual(['prompt_only']);
    expect(featuresOf(defaultCapability('none'))).toMatchObject({
      structuredOutput: 'none',
      streaming: false,
    });
  });

  it('default addresses per kind and flavor', () => {
    expect(defaultBaseUrl('anthropic')).toBe('https://api.anthropic.com');
    expect(defaultBaseUrl('local', 'ollama')).toBe('http://127.0.0.1:11434');
    expect(defaultBaseUrl('local', 'lmstudio')).toBe('http://127.0.0.1:1234/v1');
    expect(defaultBaseUrl('local', 'llamacpp')).toBe('http://127.0.0.1:8080/v1');
  });

  it('profiles carry the price book: Anthropic rows, zero for local, none for compatible', () => {
    expect(profileFor('anthropic', 'claude-haiku-5-5').price).toMatchObject({
      input: 0.1,
      output: 0.5,
      longPromptThreshold: 100_000,
    });
    expect(profileFor('local', 'qwen3:14b', 'ollama').price).toEqual({
      currency: 'USD',
      input: 0,
      cacheRead: 0,
      output: 0,
    });
    expect(profileFor('openai_compat', 'x').price).toBeUndefined();
    expect(profileFor('anthropic', 'claude-opus-5-5').sizeClass).toBe('cloud');
  });
});

describe('probe outcomes to capability records', () => {
  const base = defaultCapability('openai_compat');
  const o = (kind: ProbeKind, ok: boolean, extra: Partial<ProbeOutcome> = {}): ProbeOutcome => ({
    kind,
    ok,
    ...extra,
  });

  it('keeps every working channel in fallback order with prompt_only as the floor', () => {
    const cap = capabilityFromProbes(
      base,
      [
        o('structured_prompt_only', true),
        o('structured_json_mode', true),
        o('structured_tool_named', false),
        o('structured_tool_required', true),
        o('structured_json_schema', true),
      ],
      '2026-11-16T00:00:00.000Z',
    );
    expect(cap.channels).toEqual(['json_schema', 'tool_carrier', 'json_mode', 'prompt_only']);
    expect(cap.toolChoice).toBe('required');
    expect(cap.forcedTool).toBe(true);
    expect(cap.source).toBe('probe');
    expect(cap.probedAt).toBe('2026-11-16T00:00:00.000Z');
  });

  it('prefers the named tool choice and falls to prompt_only when nothing structured works', () => {
    expect(capabilityFromProbes(base, [o('structured_tool_named', true)], 't')).toMatchObject({
      channels: ['tool_carrier', 'prompt_only'],
      toolChoice: 'named',
      forcedTool: true,
    });
    expect(
      capabilityFromProbes(
        base,
        [o('structured_json_schema', false), o('structured_prompt_only', false)],
        't',
      ).channels,
    ).toEqual(['prompt_only']);
  });

  it('reads stream, output cap name, reasoning effort and sampling probes', () => {
    const cap = capabilityFromProbes(
      base,
      [
        o('stream', true, { streamUsage: true }),
        o('max_completion_tokens', true),
        o('reasoning_effort', true),
        o('sampling', false, { unsupportedParam: 'temperature' }),
      ],
      't',
    );
    expect(cap).toMatchObject({
      streaming: 'yes',
      streamUsage: 'yes',
      maxTokensParam: 'max_completion_tokens',
      thinking: 'reasoning_effort',
      effort: true,
      samplingParams: false,
    });
    expect(
      capabilityFromProbes(base, [o('stream', true, { streamUsage: false })], 't').streamUsage,
    ).toBe('no');
    expect(capabilityFromProbes(base, [o('stream', false)], 't').streaming).toBe('no');
    const rejected = capabilityFromProbes(
      { ...base, thinking: 'reasoning_effort', effort: true },
      [o('reasoning_effort', false)],
      't',
    );
    expect(rejected).toMatchObject({ thinking: 'none', effort: false });
    // Kinds not probed keep the base values.
    expect(capabilityFromProbes(base, [], 't').channels).toEqual(base.channels);
  });

  it('builds probes that force exactly the feature under test, within 64 tokens', () => {
    const prof = profileFor('openai_compat', 'example-chat');
    const c = conn('openai_compat');
    const body = (kind: ProbeKind) =>
      JSON.parse(adapterFor('openai_compat').probe(kind, c, prof).body ?? '{}');
    expect(body('structured_json_schema').response_format.type).toBe('json_schema');
    expect(body('structured_json_schema').max_tokens).toBe(PROBE_MAX_TOKENS);
    expect(body('structured_tool_named').tool_choice).toEqual({
      type: 'function',
      function: { name: 'submit' },
    });
    expect(body('structured_tool_required').tool_choice).toBe('required');
    expect(body('structured_json_mode').response_format).toEqual({ type: 'json_object' });
    expect('response_format' in body('structured_prompt_only')).toBe(false);
    expect(body('stream')).toMatchObject({ stream: true, stream_options: { include_usage: true } });
    expect(body('max_completion_tokens').max_completion_tokens).toBe(PROBE_MAX_TOKENS);
    expect(body('reasoning_effort').reasoning_effort).toBe('low');
    expect(body('sampling').temperature).toBe(0.6);
    expect(probeProfile('structured_json_mode', prof).capability.channels).toEqual(['json_mode']);
    const ant = JSON.parse(
      adapterFor('anthropic').probe(
        'structured_json_schema',
        conn('anthropic'),
        profileFor('anthropic', 'claude-haiku-5-5'),
      ).body ?? '{}',
    );
    expect(ant).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 64,
      output_config: { effort: 'low', format: { type: 'json_schema' } },
    });
  });
});

describe('runtime channel downgrade', () => {
  it('moves down one channel on the third unsupported failure in a row', () => {
    let cap: Capability = withCapability(profileFor('openai_compat', 'x'), {
      channels: ['json_schema', 'json_mode', 'prompt_only'],
    }).capability;
    let run = 0;
    for (let i = 1; i < UNSUPPORTED_OUTPUT_LIMIT; i++) {
      const r = noteChannelResult(cap, run, true);
      expect(r.problem).toBeUndefined();
      expect(r.capability.channels[0]).toBe('json_schema');
      run = r.run;
    }
    const third = noteChannelResult(cap, run, true);
    expect(third.problem).toBe('unsupported_output');
    expect(third.capability.channels).toEqual(['json_mode', 'prompt_only']);
    expect(third.run).toBe(0);
    cap = third.capability;
    // A success resets the run.
    expect(noteChannelResult(cap, 2, false)).toEqual({ capability: cap, run: 0 });
    // The last channel is never dropped.
    const last = noteChannelResult({ ...cap, channels: ['prompt_only'] }, 2, true);
    expect(last.capability.channels).toEqual(['prompt_only']);
  });
});

describe('static role labels and sizes', () => {
  it('uses the known table for known models', () => {
    expect(
      staticRoleLabel('anthropic', profileFor('anthropic', 'claude-haiku-5-5'), 'goddess'),
    ).toEqual({
      label: 'marginal',
      reasons: ['known_table'],
    });
  });

  it('marks short context, weak channels and small local models, and waits for the quiz otherwise', () => {
    const local7 = { ...profileFor('local', 'm', 'ollama'), sizeClass: '7b' as const };
    const big = withCapability(local7, { contextTokens: 65536 });
    expect(staticRoleLabel('local', big, 'core_npc')).toEqual({
      label: 'not_recommended',
      reasons: ['size_small'],
    });
    expect(staticRoleLabel('local', big, 'present_npc')).toEqual({
      label: null,
      reasons: ['needs_quiz'],
    });
    expect(staticRoleLabel('local', local7, 'present_npc').reasons).toContain('context_short');
    const local30 = { ...big, sizeClass: '30b' as const };
    expect(staticRoleLabel('local', local30, 'goddess')).toEqual({
      label: 'marginal',
      reasons: ['cloud_advised'],
    });
    const prompt = withCapability(profileFor('openai_compat', 'x'), { contextTokens: 131072 });
    expect(staticRoleLabel('openai_compat', prompt, 'present_npc')).toEqual({
      label: 'marginal',
      reasons: ['channel_weak', 'prompt_only_ceiling'],
    });
    const jsonMode = withCapability(prompt, { channels: ['json_mode', 'prompt_only'] });
    expect(staticRoleLabel('openai_compat', jsonMode, 'court_reviewer')).toEqual({
      label: 'marginal',
      reasons: ['channel_weak'],
    });
    const short = withCapability(jsonMode, { contextTokens: 8192 });
    expect(staticRoleLabel('openai_compat', short, 'court_reviewer')).toEqual({
      label: 'not_recommended',
      reasons: ['context_short', 'channel_weak'],
    });
    expect(staticRoleLabel('openai_compat', jsonMode, 'goddess').label).toBeNull();
  });

  it('sizes from parameter counts and lists roles above the context', () => {
    expect(parseParamSize('14.8B')).toBe(14.8);
    expect(parseParamSize('600M')).toBe(0.6);
    expect(parseParamSize(undefined)).toBeUndefined();
    expect([
      sizeClassOf(0.6),
      sizeClassOf(7.6),
      sizeClassOf(14.8),
      sizeClassOf(32),
      sizeClassOf(undefined),
    ]).toEqual(['small', '7b', '14b', '30b', 'unknown']);
    expect(lowContextRoles(defaultCapability('local', 'ollama'))).toEqual([
      'goddess',
      'core_npc',
      'present_npc',
      'offstage_batch',
      'ruler_general',
      'court_reviewer',
    ]);
    expect(
      lowContextRoles({ ...defaultCapability('openai_compat'), contextTokens: 32768 }),
    ).toEqual(['goddess']);
  });
});

describe('price book', () => {
  it('matches the 2026-11 price table and keeps the legacy settlement', () => {
    expect(MODEL_PRICES['claude-opus-5-5']).toEqual({
      input: 4,
      output: 20,
      cacheRead: 0.2,
      cacheWrite5m: 5,
      cacheWrite1h: 8,
      serverFallback: true,
    });
    expect(MODEL_PRICES['claude-sonnet-5-5']).toEqual({
      input: 2,
      output: 10,
      cacheRead: 0.1,
      cacheWrite5m: 2.5,
      cacheWrite1h: 4,
      serverFallback: true,
    });
    expect(MODEL_PRICES['claude-haiku-5-5']).toEqual({
      input: 0.1,
      output: 0.5,
      cacheRead: 0.01,
      cacheWrite5m: 0.125,
      cacheWrite1h: 0.2,
      longPromptThreshold: 100_000,
      longPrompt: {
        input: 0.5,
        output: 2.5,
        cacheRead: 0.05,
        cacheWrite5m: 0.625,
        cacheWrite1h: 1,
      },
      serverFallback: false,
    });
    expect(MODEL_PRICES['claude-opus-5']?.serverFallback).toBe(false);
    expect(priceCardOf('anthropic', 'claude-opus-5')).toBeUndefined();
    expect(FX_CNY_PER_USD).toBeGreaterThan(0);
    expect(PROVIDER_LINKS.anthropic?.console).toMatch(/^https:\/\//);
  });

  it('prices by card the same as by model, with CNY converted', () => {
    const u = {
      inputTokens: 1000,
      outputTokens: 500,
      cacheReadInputTokens: 2000,
      cacheCreationInputTokens: 300,
      cacheCreation1hInputTokens: 100,
    };
    const card = priceCardOf('anthropic', 'claude-sonnet-5-5');
    if (!card) throw new Error('no card');
    expect(costWithCard(card, u)).toBeCloseTo(costUsd('claude-sonnet-5-5', u), 12);
    const cny = { currency: 'CNY' as const, input: 2, cacheRead: 0.5, output: 8 };
    expect(costWithCard(cny, u, 8)).toBeCloseTo(
      (1000 * 2 + 500 * 8 + 2000 * 0.5 + 300 * 2) / 1e6 / 8,
      12,
    );
  });
});

// --- connection test over fake services ---------------------------------------------------

type Handler = (req: AdapterHttpRequest, body: Record<string, unknown>) => AdapterSendResult;

function fake(handler: Handler): { send: AdapterSend; seen: AdapterHttpRequest[] } {
  const seen: AdapterHttpRequest[] = [];
  return {
    seen,
    send: async (req) => {
      seen.push(req);
      return handler(req, req.body ? (JSON.parse(req.body) as Record<string, unknown>) : {});
    },
  };
}

function json(status: number, body: unknown, latencyMs = 20): AdapterSendResult {
  return {
    ok: true,
    res: { status, body: JSON.stringify(body), headers: {}, latencyMs, firstByteMs: 5 },
  };
}

const ANSWER = '{"ok":true,"word":"好"}';

function chat(content: string | null, extra: Record<string, unknown> = {}) {
  return {
    id: 'chatcmpl-probe',
    model: 'example-chat',
    choices: [
      { index: 0, message: { role: 'assistant', content, ...extra }, finish_reason: 'stop' },
    ],
    usage: { prompt_tokens: 30, completion_tokens: 8 },
  };
}

function unsupported(param: string) {
  return json(400, {
    error: {
      message: `Unsupported parameter: '${param}' is not supported with this model.`,
      param,
      code: 'unsupported_parameter',
    },
  });
}

/** A compatible service: no max_tokens (wants max_completion_tokens), no json_schema, named tools, JSON mode, no reasoning_effort. */
const compatService: Handler = (req, b) => {
  if (req.method === 'GET')
    return json(200, {
      data: [
        { id: 'example-chat', context_length: 65536 },
        { id: 'embed-1', type: 'embeddings' },
      ],
    });
  if ('max_tokens' in b) return unsupported('max_tokens');
  if ('reasoning_effort' in b) return unsupported('reasoning_effort');
  const rf = b.response_format as { type?: string } | undefined;
  if (rf?.type === 'json_schema') return unsupported('response_format');
  if (b.stream === true) {
    const delta = Array.isArray(b.tools)
      ? {
          tool_calls: [
            {
              index: 0,
              id: 'c',
              type: 'function',
              function: { name: 'submit', arguments: ANSWER },
            },
          ],
        }
      : { content: ANSWER };
    const body =
      `data: ${JSON.stringify({ choices: [{ index: 0, delta, finish_reason: 'stop' }] })}\n\n` +
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 8 } })}\n\ndata: [DONE]\n\n`;
    return { ok: true, res: { status: 200, body, headers: {}, latencyMs: 30, firstByteMs: 7 } };
  }
  if (Array.isArray(b.tools)) {
    if (b.tool_choice === 'required')
      return json(
        200,
        chat(null, {
          tool_calls: [
            { id: 'c', type: 'function', function: { name: 'submit', arguments: ANSWER } },
          ],
        }),
      );
    return json(
      200,
      chat(null, {
        tool_calls: [
          { id: 'c', type: 'function', function: { name: 'submit', arguments: ANSWER } },
        ],
      }),
    );
  }
  return json(200, chat(rf?.type === 'json_object' ? ANSWER : `好的：${ANSWER}`));
};

function compatConn(extra: Partial<ConnectionPublic> = {}): ConnectionPublic {
  return conn('openai_compat', { models: [profileFor('openai_compat', 'example-chat')], ...extra });
}

const T = '2026-11-16T00:00:00.000Z';

describe('quick connection test (5.6) over a fake compatible service', () => {
  it('probes every channel and parameter and records the capability', async () => {
    const { send, seen } = fake(compatService);
    const report = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      send,
    );
    expect(report.ok).toBe(true);
    expect(report.checks.map((c) => `${c.id}:${c.verdict}`)).toEqual([
      'address:pass',
      'reachable:pass',
      'auth:pass',
      'model:pass',
      'structured:pass',
      'stream:pass',
      'params:pass',
      'context:pass',
    ]);
    const row = report.models[0];
    expect(row?.capability).toMatchObject({
      channels: ['tool_carrier', 'json_mode', 'prompt_only'],
      toolChoice: 'named',
      maxTokensParam: 'max_completion_tokens',
      thinking: 'none',
      effort: false,
      samplingParams: true,
      streaming: 'yes',
      streamUsage: 'yes',
      contextTokens: 65536,
      contextSource: 'service_meta',
      source: 'probe',
      probedAt: T,
    });
    expect(row?.lowContextRoles).toEqual([]);
    expect(report.checks.find((c) => c.id === 'structured')?.detail).toEqual({
      channels: 'tool_named,json_mode,prompt_only',
    });
    expect(report.requests).toBe(seen.length);
    expect(report.problems).toEqual([]);
    // No probe carries a key: the sender adds auth.
    for (const r of seen)
      expect(Object.keys(r.headers).map((h) => h.toLowerCase())).not.toContain('authorization');
  });

  it('stops at the address, reachability and auth checks', async () => {
    const never = fake(() => {
      throw new Error('must not send');
    });
    const bad = await runConnectionTest(
      {
        conn: compatConn({ baseUrl: 'http://api.example.com/v1' }),
        depth: 'quick',
        hasKey: true,
        testedAt: T,
      },
      never.send,
    );
    expect(bad.ok).toBe(false);
    expect(bad.checks[0]).toEqual({
      id: 'address',
      verdict: 'fail',
      problem: 'endpoint_wrong',
      detail: { issue: 'https_required' },
    });
    expect(bad.checks.slice(1).every((c) => c.verdict === 'skipped')).toBe(true);
    expect(bad.requests).toBe(0);

    const refused = fake(() => ({ ok: false, netError: 'refused', latencyMs: 3 }));
    const down = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      refused.send,
    );
    expect(down.checks[1]).toMatchObject({ id: 'reachable', verdict: 'fail', problem: 'network' });
    expect(down.problems).toEqual(['network']);

    const deny = fake(() => json(401, { error: { message: 'Incorrect API key provided.' } }));
    const withKey = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      deny.send,
    );
    expect(withKey.checks.find((c) => c.id === 'auth')).toMatchObject({
      verdict: 'fail',
      problem: 'key_invalid',
    });
    const noKey = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: false, testedAt: T },
      deny.send,
    );
    expect(noKey.checks.find((c) => c.id === 'auth')).toMatchObject({
      verdict: 'fail',
      problem: 'not_configured',
    });

    const wrong = fake(() => ({
      ok: true,
      res: { status: 404, body: '404 page not found', headers: {}, latencyMs: 2 },
    }));
    const notFound = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      wrong.send,
    );
    expect(notFound.checks[1]).toMatchObject({
      id: 'reachable',
      verdict: 'fail',
      problem: 'endpoint_wrong',
    });
  });

  it('reports a model the service does not list', async () => {
    const { send } = fake(() => json(200, { data: [{ id: 'other-model' }] }));
    const report = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      send,
    );
    expect(report.checks.find((c) => c.id === 'model')).toMatchObject({
      verdict: 'fail',
      problem: 'model_not_found',
      model: 'example-chat',
    });
    expect(report.models).toEqual([]);
  });
});

/** Ollama: tags, show, native chat with format, JSON lines when streaming. */
const ollamaService: Handler = (req, b) => {
  if (req.url.endsWith('/api/tags')) {
    return json(200, {
      models: [{ name: 'qwen3:14b', model: 'qwen3:14b', details: { parameter_size: '14.8B' } }],
    });
  }
  if (req.url.endsWith('/api/show'))
    return json(200, {
      details: { parameter_size: '14.8B' },
      model_info: { 'qwen3.context_length': 40960 },
    });
  const content = b.format === undefined ? `答：${ANSWER}` : ANSWER;
  if (b.stream === true) {
    const lines = [
      { model: 'qwen3:14b', message: { role: 'assistant', content }, done: false },
      {
        model: 'qwen3:14b',
        message: { role: 'assistant', content: '' },
        done: true,
        done_reason: 'stop',
        prompt_eval_count: 30,
        eval_count: 8,
      },
    ];
    return {
      ok: true,
      res: {
        status: 200,
        body: lines.map((l) => JSON.stringify(l)).join('\n'),
        headers: {},
        latencyMs: 40,
      },
    };
  }
  return json(200, {
    model: 'qwen3:14b',
    message: { role: 'assistant', content },
    done: true,
    done_reason: 'stop',
    prompt_eval_count: 30,
    eval_count: 8,
  });
};

describe('quick connection test over a fake Ollama', () => {
  it('reads context and size from the service and probes the native API', async () => {
    const c = conn('local', { models: [profileFor('local', 'qwen3:14b', 'ollama')] }, 'ollama');
    const { send, seen } = fake(ollamaService);
    const report = await runConnectionTest(
      { conn: c, depth: 'quick', hasKey: false, testedAt: T },
      send,
    );
    expect(report.ok).toBe(true);
    expect(report.checks.find((x) => x.id === 'auth')?.verdict).toBe('not_needed');
    expect(report.models[0]?.capability).toMatchObject({
      channels: ['json_schema', 'json_mode', 'prompt_only'],
      contextTokens: 40960,
      contextSource: 'service_meta',
      streaming: 'yes',
      streamUsage: 'yes',
      maxTokensParam: 'num_predict',
    });
    expect(report.models[0]?.lowContextRoles).toEqual(['goddess']);
    expect(seen.some((r) => r.url === 'http://127.0.0.1:11434/api/show')).toBe(true);
    const chats = seen.filter((r) => r.url.endsWith('/api/chat'));
    expect(chats.length).toBeGreaterThan(0);
    for (const r of chats)
      expect(JSON.parse(r.body ?? '{}').options.num_predict).toBe(PROBE_MAX_TOKENS);
  });

  it('lists models with parameter classes', async () => {
    const c = conn('local', {}, 'ollama');
    const listing = await fetchModelListing(c, fake(ollamaService).send);
    expect(listing).toEqual({
      connectionId: c.id,
      ok: true,
      models: [{ model: 'qwen3:14b', sizeClass: '14b', known: false }],
    });
    const down = await fetchModelListing(c, async () => ({
      ok: false,
      netError: 'refused',
      latencyMs: 1,
    }));
    expect(down).toMatchObject({ ok: false, problem: 'network' });
  });
});

describe('Anthropic model listing', () => {
  it('lists known chat models with their limits and pages through the listing', async () => {
    const pages: Record<string, unknown> = {
      first: {
        data: [
          {
            type: 'model',
            id: 'claude-opus-5-5',
            display_name: 'Claude Opus 5.5',
            max_input_tokens: 1_000_000,
            max_tokens: 128_000,
          },
          { type: 'model', id: 'claude-fable-5-2', display_name: 'Claude Fable 5.2' },
        ],
        has_more: true,
        last_id: 'claude-fable-5-2',
      },
      second: {
        data: [{ type: 'model', id: 'claude-haiku-5-5', display_name: 'Claude Haiku 5.5' }],
        has_more: false,
        last_id: 'claude-haiku-5-5',
      },
    };
    const { send, seen } = fake((req) =>
      json(200, req.url.includes('after_id=') ? pages.second : pages.first),
    );
    const listing = await fetchModelListing(conn('anthropic'), send);
    expect(seen.map((r) => r.url)).toEqual([
      'https://api.anthropic.com/v1/models?limit=100',
      'https://api.anthropic.com/v1/models?limit=100&after_id=claude-fable-5-2',
    ]);
    expect(listing.models).toEqual([
      {
        model: 'claude-opus-5-5',
        displayName: 'Claude Opus 5.5',
        known: true,
        contextTokens: 1_000_000,
        maxOutputTokens: 128_000,
        sizeClass: 'cloud',
      },
      {
        model: 'claude-haiku-5-5',
        displayName: 'Claude Haiku 5.5',
        known: true,
        sizeClass: 'cloud',
      },
    ]);
    expect(listing.otherIds).toEqual(['claude-fable-5-2']);
    expect(listing.nextCursor).toBeUndefined();
  });

  it('the quick test of a known model trusts the table for streaming and sends one probe', async () => {
    const msg = {
      id: 'msg_probe',
      type: 'message',
      role: 'assistant',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: ANSWER }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 8 },
    };
    const { send, seen } = fake((req) =>
      req.method === 'GET'
        ? json(200, { data: [{ id: 'claude-haiku-5-5' }], has_more: false })
        : json(200, msg),
    );
    const c = conn('anthropic', { models: [profileFor('anthropic', 'claude-haiku-5-5')] });
    const report = await runConnectionTest(
      { conn: c, depth: 'quick', hasKey: true, testedAt: T },
      send,
    );
    expect(report.ok).toBe(true);
    expect(seen.filter((r) => r.method === 'POST')).toHaveLength(1);
    expect(report.models[0]?.capability.source).toBe('known_table');
    expect(report.checks.find((x) => x.id === 'stream')).toMatchObject({
      verdict: 'pass',
      detail: { source: 'known_table' },
    });
    const spec = JSON.parse(seen[1]?.body ?? '{}') as LlmCallSpec & { max_tokens: number };
    expect(spec.max_tokens).toBe(64);
  });
});

describe('connection test edge cases from review', () => {
  it('probes a hand-entered Anthropic model the known table does not have yet', async () => {
    const msg = (text: string) => ({
      id: 'msg_probe',
      type: 'message',
      role: 'assistant',
      model: 'claude-new-6',
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 8 },
    });
    const { send } = fake((req, b) => {
      if (req.method === 'GET')
        return json(200, { data: [{ id: 'claude-new-6' }], has_more: false });
      const fmt = (b.output_config as { format?: unknown } | undefined)?.format;
      if (fmt) return json(200, msg(ANSWER));
      const choice = (b.tool_choice as { type?: string } | undefined)?.type;
      if (choice === 'tool') {
        return json(200, {
          ...msg(''),
          content: [{ type: 'tool_use', id: 'toolu_1', name: 'submit', input: JSON.parse(ANSWER) }],
          stop_reason: 'tool_use',
        });
      }
      // Other tool choices answer in text: no submit call, so the carrier does not count.
      return json(200, msg(`好：${ANSWER}`));
    });
    const c = conn('anthropic', { models: [profileFor('anthropic', 'claude-new-6')] });
    const report = await runConnectionTest(
      { conn: c, depth: 'quick', hasKey: true, testedAt: T },
      send,
    );
    expect(report.checks.find((x) => x.id === 'model')).toMatchObject({
      verdict: 'pass',
      model: 'claude-new-6',
    });
    expect(report.models[0]?.capability).toMatchObject({
      source: 'probe',
      channels: ['json_schema', 'tool_carrier', 'prompt_only'],
      toolChoice: 'named',
      forcedTool: true,
    });
  });

  it('does not record a rate-limited probe as an unsupported channel', async () => {
    let limited = true;
    const { send } = fake((req, b) => {
      const rf = b.response_format as { type?: string } | undefined;
      if (rf?.type === 'json_schema' && limited) {
        limited = false;
        return json(429, { error: { message: 'Rate limit reached', code: 'rate_limit_exceeded' } });
      }
      return compatService(req, b);
    });
    const report = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      send,
    );
    const structured = report.checks.find((x) => x.id === 'structured');
    expect(structured).toMatchObject({ verdict: 'fail', problem: 'rate_limited' });
    expect(report.ok).toBe(false);
    // The untested channel is neither added nor ruled out; the decided ones are kept.
    expect(report.models[0]?.capability.channels).toEqual([
      'tool_carrier',
      'json_mode',
      'prompt_only',
    ]);
    const direct = capabilityFromProbes(
      withCapability(profileFor('openai_compat', 'x'), { channels: ['json_schema', 'prompt_only'] })
        .capability,
      [{ kind: 'structured_json_schema', ok: false, problem: 'timeout', transient: true }],
      T,
    );
    expect(direct.channels).toEqual(['json_schema', 'prompt_only']);
  });

  it('falls back to tool_choice auto when neither named nor required works', async () => {
    const { send } = fake((req, b) => {
      if (req.method === 'GET') return json(200, { data: [{ id: 'example-chat' }] });
      if (Array.isArray(b.tools) && b.tool_choice !== 'auto') {
        return json(400, {
          error: {
            message: 'tool_choice value is not supported',
            param: 'tool_choice',
            code: 'unsupported_value',
          },
        });
      }
      if (Array.isArray(b.tools)) {
        return json(
          200,
          chat(null, {
            tool_calls: [
              { id: 'c', type: 'function', function: { name: 'submit', arguments: ANSWER } },
            ],
          }),
        );
      }
      return json(400, {
        error: {
          message: 'response_format is not supported',
          param: 'response_format',
          code: 'unsupported_parameter',
        },
      });
    });
    const report = await runConnectionTest(
      { conn: compatConn(), depth: 'quick', hasKey: true, testedAt: T },
      send,
    );
    expect(report.models[0]?.capability).toMatchObject({
      channels: ['tool_carrier', 'prompt_only'],
      toolChoice: 'auto',
      forcedTool: false,
    });
  });
});
