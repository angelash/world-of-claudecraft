// AI audit desk: record filters, facets and summary; history page parsing; the degrade level
// line; provider choice for the inspector's AI mode (the dev proxy as TransportProvider over
// DevProxyTransport, its availability and recheck); and the runner built by the workbench,
// end to end with a scripted provider and with the dev proxy (including the reveal-ledger
// guard on answers).

import { describe, expect, it } from 'vitest';
import { AuditLog, type AuditRecord } from '../src/ai/audit';
import type { HttpTransport, LlmCallResult, ProblemCode } from '../src/ai/contracts';
import { DEV_PROXY_CONNECTION_ID } from '../src/ai/llm_config';
import { MockProvider, TransportProvider } from '../src/ai/providers';
import { parseCallSpec } from '../src/ai/providers/call_spec';
import { buildContent } from '../src/content';
import { ok } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import { Engine } from '../src/core/engine';
import type { GameSystem } from '../src/core/system';
import {
  chooseProvider,
  createRunner,
  devProxyProvider,
  lockedPhrases,
  PROXY_RECHECK_MS,
  parseMockScript,
} from '../src/editor/audit/ai_setup';
import {
  auditFacets,
  EMPTY_FILTER,
  filterAudit,
  formatUsd,
  parseHistoryPage,
  recordTexts,
  summarizeAudit,
} from '../src/editor/audit/audit_model';
import { GameSession } from '../src/editor/state/game_session';
import { degradeLevelText, T } from '../src/editor/text';
import { createGame } from '../src/game/create';
import { lockedTerms } from '../src/systems/quests';

function rec(p: Partial<AuditRecord> & { auditId: string }): AuditRecord {
  return {
    requestId: `r_${p.auditId}`,
    agentId: 'oola',
    role: 'npc.daily',
    rolePackVersion: '1',
    purpose: 'morning_plan',
    tick: 1,
    epoch: 0,
    realMs: 0,
    degradeLevel: 0,
    outcome: 'proposal',
    ...p,
  };
}

const RECORDS: AuditRecord[] = [
  rec({
    auditId: 'a1',
    costUsd: 0.01,
    latencyMs: 100,
    commands: [{ kind: 'x', data: {} }],
    usage: {
      inputTokens: 10,
      outputTokens: 5,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    },
  }),
  rec({
    auditId: 'a2',
    agentId: 'moss',
    role: 'npc.dialogue',
    outcome: 'declined',
    reason: 'leak',
    leaks: ['被禁之名'],
    latencyMs: 300,
  }),
  rec({
    auditId: 'a3',
    agentId: 'eluen',
    role: 'goddess.plan',
    outcome: 'declined',
    reason: 'budget_hour',
    speech: '今日无事',
    rejected: [{ index: 0, reason: 'not_allowed' }],
  }),
  rec({ auditId: 'a4', outcome: 'pending' }),
];

describe('audit model', () => {
  it('filters by agent, role, outcome, reason, leak and text, newest first', () => {
    expect(filterAudit(RECORDS, EMPTY_FILTER).map((r) => r.auditId)).toEqual([
      'a4',
      'a3',
      'a2',
      'a1',
    ]);
    expect(filterAudit(RECORDS, { ...EMPTY_FILTER, agent: 'oola' }).map((r) => r.auditId)).toEqual([
      'a4',
      'a1',
    ]);
    expect(
      filterAudit(RECORDS, { ...EMPTY_FILTER, role: 'goddess.plan' }).map((r) => r.auditId),
    ).toEqual(['a3']);
    expect(
      filterAudit(RECORDS, { ...EMPTY_FILTER, outcome: 'declined' }).map((r) => r.auditId),
    ).toEqual(['a3', 'a2']);
    expect(
      filterAudit(RECORDS, { ...EMPTY_FILTER, reason: 'budget_hour' }).map((r) => r.auditId),
    ).toEqual(['a3']);
    expect(filterAudit(RECORDS, { ...EMPTY_FILTER, leak: 'leak' }).map((r) => r.auditId)).toEqual([
      'a2',
    ]);
    expect(filterAudit(RECORDS, { ...EMPTY_FILTER, leak: 'clean' }).map((r) => r.auditId)).toEqual([
      'a4',
      'a3',
      'a1',
    ]);
    expect(filterAudit(RECORDS, { ...EMPTY_FILTER, text: '今日' }).map((r) => r.auditId)).toEqual([
      'a3',
    ]);
  });

  it('lists facets and summarises cost, latency, leaks and commands', () => {
    expect(auditFacets(RECORDS)).toEqual({
      agents: ['eluen', 'moss', 'oola'],
      roles: ['goddess.plan', 'npc.daily', 'npc.dialogue'],
      outcomes: ['declined', 'pending', 'proposal'],
      reasons: ['budget_hour', 'leak'],
    });
    const s = summarizeAudit(RECORDS);
    expect(s.total).toBe(4);
    expect(s.byOutcome).toEqual({ proposal: 1, declined: 2, pending: 1 });
    expect(s.costUsd).toBeCloseTo(0.01);
    expect(s.meanLatencyMs).toBe(200);
    expect(s.p90LatencyMs).toBe(300);
    expect(s.leaks).toBe(1);
    expect(s.acceptedCommands).toBe(1);
    expect(s.rejectedCommands).toBe(1);
    expect(s.inputTokens).toBe(10);
  });

  it('formats dollars without a negative zero', () => {
    expect(formatUsd(-1e-12)).toBe('0.0000');
    expect(formatUsd(0.00123)).toBe('0.0012');
    expect(formatUsd(-0.5)).toBe('-0.5000');
    expect(formatUsd(1.234, 2)).toBe('1.23');
  });

  it('parses history pages and drops malformed records', () => {
    const page = parseHistoryPage({
      ok: true,
      total: 3,
      offset: 0,
      limit: 2,
      skipped: 1,
      records: [{ auditId: 'h1' }, { nope: 1 }],
    });
    expect(page?.records.map((r) => r.auditId)).toEqual(['h1']);
    expect(page?.total).toBe(3);
    expect(parseHistoryPage({ ok: true })).toBeNull();
    expect(parseHistoryPage('x')).toBeNull();
  });

  it('collects reviewable texts of a record by field', () => {
    const texts = recordTexts(
      rec({
        auditId: 'x',
        prompt: { system: 's', stable: 'st', context: 'c' },
        rawOutput: 'raw',
        speech: 'sp',
      }),
    );
    expect(texts.map((t) => t.field)).toEqual([
      'prompt.system',
      'prompt.stable',
      'prompt.context',
      'rawOutput',
      'speech',
    ]);
  });
});

describe('degrade level line', () => {
  it('names every level of the 0 to 9 ladder and shows anything else as a bare number', () => {
    expect(T.audit.levelNames).toHaveLength(10);
    const lines = Array.from({ length: 10 }, (_, level) => degradeLevelText(level));
    expect(new Set(lines).size).toBe(10);
    lines.forEach((line, level) => {
      expect(line.startsWith(`${level}（`)).toBe(true);
      expect(line).toContain(T.audit.levelNames[level]);
    });
    expect(degradeLevelText(0)).toContain(T.audit.levelNames[0]);
    expect(degradeLevelText(9)).toContain('AI');
    expect([degradeLevelText(10), degradeLevelText(-1), degradeLevelText(2.5)]).toEqual([
      '10',
      '-1',
      '2.5',
    ]);
  });
});

describe('provider choice', () => {
  const clock = { now: () => 0 };
  const statusTransport =
    (body: unknown, status = 200): HttpTransport =>
    async () => ({
      status,
      json: async () => body,
    });

  it('parses mock scripts in both shorthand and full form', () => {
    const r = parseMockScript(
      '[{"json": {"commands": []}}, {"ok": false, "error": "timeout", "message": "t"}, {"commands": []}]',
    );
    expect(r.ok).toBe(true);
    if (r.ok)
      expect(r.steps).toEqual([
        { json: { commands: [] } },
        { ok: false, error: 'timeout', message: 't' },
        { json: { commands: [] } },
      ]);
    expect(parseMockScript('[1]').ok).toBe(false);
    expect(parseMockScript('{oops').ok).toBe(false);
  });

  it('uses the proxy when GET /api/llm/status says a model is reachable', async () => {
    const pick = await chooseProvider('auto', {
      clock,
      transport: statusTransport({ available: true, tiers: { top: 'm1' } }),
      offline: 'mock',
      mockScript: [],
      repeatLast: false,
    });
    expect(pick.kind).toBe('proxy');
    expect(pick.note).toContain('m1');
  });

  it('falls back to the mock or to no model when the proxy is unavailable', async () => {
    const deps = {
      clock,
      transport: statusTransport({ available: false, reason: 'no_credentials' }),
      mockScript: [],
      repeatLast: false,
    };
    const mock = await chooseProvider('auto', { ...deps, offline: 'mock' });
    expect(mock.kind).toBe('mock');
    expect(mock.note).toContain('no_credentials');
    expect((await chooseProvider('auto', { ...deps, offline: 'null' })).kind).toBe('null');
    expect((await chooseProvider('proxy', { ...deps, offline: 'null' })).kind).toBe('proxy');
    expect((await chooseProvider('null', { ...deps, offline: 'mock' })).kind).toBe('null');
    const down = await chooseProvider('auto', {
      ...deps,
      transport: async () => {
        throw new Error('ECONNREFUSED');
      },
      offline: 'mock',
    });
    expect(down.kind).toBe('mock');
  });

  /** A dev proxy: the status for GET .../status, the receipt for POST /api/llm. */
  function devProxy(status: unknown, receipt: unknown) {
    const posted: { url: string; body: unknown }[] = [];
    const transport: HttpTransport = async (url, init) => {
      if (url.endsWith('/api/llm/status')) return { status: 200, json: async () => status };
      posted.push({ url, body: JSON.parse(init.body ?? 'null') });
      return { status: 200, json: async () => receipt };
    };
    return { transport, posted };
  }

  const TIERS = { top: 'claude-opus-5-5', mid: 'claude-sonnet-5-5', low: 'claude-haiku-5-5' };

  it('sends the runner requests as LlmCallSpecs on the dev proxy connection', async () => {
    const { transport, posted } = devProxy(
      { available: true, tiers: TIERS },
      { ok: true, json: { commands: [] }, text: '{"commands":[]}', latencyMs: 4 },
    );
    const pick = await chooseProvider('proxy', {
      clock,
      transport,
      offline: 'null',
      mockScript: [],
      repeatLast: false,
    });
    expect(pick.provider).toBeInstanceOf(TransportProvider);
    expect(pick.provider.tierModels?.()).toEqual(TIERS);
    const out = await pick.provider.complete({
      tier: 'mid',
      system: 's',
      stable: 'p',
      context: 'c',
      schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
      maxTokens: 100,
      purpose: 'npc.daily/probe',
    });
    expect(out).toMatchObject({ ok: true, json: { commands: [] }, model: TIERS.mid });
    expect(posted.map((p) => p.url)).toEqual(['/api/llm']);
    // The body is what the dev proxy accepts now: the LlmCallSpec contract.
    const spec = parseCallSpec(posted[0]?.body);
    expect(spec.ok).toBe(true);
    if (spec.ok) {
      expect(spec.value).toMatchObject({
        provider: 'anthropic',
        connectionId: DEV_PROXY_CONNECTION_ID,
        model: TIERS.mid,
        slot: 'mid',
      });
      expect(spec.value.segments.map((s) => s.role)).toEqual(['rules', 'persona', 'turn']);
    }
  });

  it('goes unavailable when the dev proxy cannot answer, and rechecks later', async () => {
    const t = { now: 0 };
    const c = { now: () => t.now };
    let problem: ProblemCode = 'not_configured';
    const dev = {
      send: async (): Promise<LlmCallResult> => ({
        ok: false,
        error: { cls: 'auth', message: 'x' },
        problem,
        latencyMs: 0,
      }),
    };
    const req = {
      tier: 'low' as const,
      system: 's',
      context: 'c',
      schema: {},
      maxTokens: 10,
      purpose: 'p',
    };
    const up = devProxyProvider(dev, { available: true, tiers: TIERS }, c, 1000);
    expect(up.available()).toBe(true);
    expect(await up.complete(req)).toMatchObject({ ok: false, problem: 'not_configured' });
    expect(up.available()).toBe(false);
    t.now = 1000;
    expect(up.available()).toBe(true);
    problem = 'key_invalid';
    await up.complete(req);
    expect(up.available()).toBe(false);
    t.now = 2000;
    // A failure that says nothing about the proxy keeps it available.
    problem = 'rate_limited';
    await up.complete(req);
    expect(up.available()).toBe(true);
    // A status that says the proxy cannot answer starts it unavailable.
    const down = devProxyProvider(dev, { available: false, reason: 'no_credentials' }, c, 1000);
    expect(down.available()).toBe(false);
    t.now = 3000;
    expect(down.available()).toBe(true);
    expect(PROXY_RECHECK_MS).toBe(60_000);
  });
});

/** Files one AI request every 20 ticks that may set flags. */
const asker: GameSystem = {
  id: 'zz_asker',
  order: 999,
  tick(ctx) {
    if (ctx.tick % 20 !== 1) return;
    ctx.ai.request({
      agentId: 'probe_npc',
      role: 'npc.daily',
      purpose: 'probe',
      revision: ctx.tick,
      context: { v: 1, persona: 'p', situation: 's', commands: { 'flag.set': 'set a flag' } },
      allowed: ['flag.set'],
      fallback: [],
      deadlineTicks: 40,
    });
  },
  commands: {},
};

describe('workbench runner', () => {
  it('runs a scripted provider through the kernel and records the decision', async () => {
    const content = buildContent();
    const base = createGame({ seed: 3, aiMode: 'external', content });
    const engine = Engine.create(
      3,
      content,
      [...base.systems.filter((s) => s.id === 'world' || s.id === 'modifiers'), asker],
      {
        aiMode: 'external',
      },
    );
    const audit = new AuditLog();
    const provider = new MockProvider([
      {
        json: {
          commands: [{ kind: 'flag.set', data: '{"key":"probe_flag","value":7}' }],
          speech: '早',
        },
        costUsd: 0.002,
      },
    ]);
    const { runner, setMsPerTick } = createRunner({
      engine,
      content,
      provider,
      clock: { now: () => 0 },
      audit,
      msPerTick: 50,
    });
    const session = new GameSession();
    session.set({ engine, content, imported: false, runner, provider: 'mock', providerNote: '' });
    // At 100x a 40-tick deadline is 200 real ms, under the runner's minimum call time.
    setMsPerTick(0.5);
    engine.step(1);
    await runner.whenIdle();
    expect(audit.list()[0]?.reason).toBe('deadline');
    expect(provider.calls).toHaveLength(0);
    setMsPerTick(50);
    engine.step(20);
    await runner.whenIdle();
    engine.step(1);
    expect(engine.world.meta.flags.probe_flag).toBe(7);
    const r = audit.list()[1];
    expect(r?.outcome).toBe('proposal');
    expect(r?.commands?.[0]?.kind).toBe('flag.set');
    expect(r?.prompt?.context).toBeTruthy();
    expect(summarizeAudit(audit.list()).costUsd).toBeCloseTo(0.002);
    // Replacing the game detaches the runner: new requests are no longer taken.
    session.set(null);
    engine.step(20);
    expect(provider.calls).toHaveLength(1);
  });

  it('drives the dev proxy through TransportProvider end to end', async () => {
    const content = buildContent();
    const engine = Engine.create(5, content, [asker], { aiMode: 'external' });
    const posted: unknown[] = [];
    const transport: HttpTransport = async (url, init) => {
      if (url.endsWith('/status')) {
        return {
          status: 200,
          json: async () => ({
            available: true,
            tiers: { top: 'claude-opus-5-5', mid: 'claude-sonnet-5-5', low: 'claude-haiku-5-5' },
          }),
        };
      }
      posted.push(JSON.parse(init.body ?? 'null'));
      return {
        status: 200,
        json: async () => ({
          ok: true,
          json: { commands: [{ kind: 'flag.set', data: '{"key":"proxy_flag","value":3}' }] },
          text: '',
          usage: {
            inputTokens: 10,
            outputTokens: 5,
            cacheReadInputTokens: 0,
            cacheCreationInputTokens: 0,
          },
          servedModel: 'claude-haiku-5-5',
          costUsd: 0.001,
          latencyMs: 3,
        }),
      };
    };
    const clock = { now: () => 0 };
    const pick = await chooseProvider('auto', {
      clock,
      transport,
      offline: 'null',
      mockScript: [],
      repeatLast: false,
    });
    expect(pick.kind).toBe('proxy');
    const audit = new AuditLog();
    const { runner } = createRunner({
      engine,
      content,
      provider: pick.provider,
      clock,
      audit,
      msPerTick: 50,
    });
    runner.attach();
    engine.step(1);
    await runner.whenIdle();
    engine.step(1);
    expect(engine.world.meta.flags.proxy_flag).toBe(3);
    expect(posted).toHaveLength(1);
    expect(parseCallSpec(posted[0]).ok).toBe(true);
    expect(audit.list()[0]).toMatchObject({ outcome: 'proposal' });
    expect(summarizeAudit(audit.list()).costUsd).toBeCloseTo(0.001);
  });

  it('declines an answer that names a locked reveal-ledger term', async () => {
    const content = buildContent();
    const engine = Engine.create(4, content, [asker], { aiMode: 'external' });
    const locked = lockedTerms(engine.world, content);
    expect(locked.length).toBeGreaterThan(0);
    const term = (locked[0] as { term: string }).term;
    expect(lockedPhrases(engine.world, content)).toContain(term);
    const audit = new AuditLog();
    const provider = new MockProvider([{ json: { commands: [], speech: `我听说过${term}` } }]);
    const { runner } = createRunner({
      engine,
      content,
      provider,
      clock: { now: () => 0 },
      audit,
      msPerTick: 50,
    });
    runner.attach();
    engine.step(1);
    await runner.whenIdle();
    const r = audit.list()[0];
    expect(r?.outcome).toBe('declined');
    expect(r?.reason).toBe('leak');
  });

  it('reports no locked phrases for content without a reveal ledger', () => {
    const engine = Engine.create(1, {} as ContentMap, [], { aiMode: 'off' });
    expect(lockedPhrases(engine.world, {} as ContentMap)).toEqual([]);
    expect(ok().ok).toBe(true);
  });
});
