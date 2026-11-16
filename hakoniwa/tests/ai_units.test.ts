// Unit tests of the pure AI-layer modules. No network: transports are fakes.

import { describe, expect, it } from 'vitest';
import { AuditLog, type AuditRecord, httpAuditSink } from '../src/ai/audit';
import { Budget } from '../src/ai/budget';
import type { HttpRequestInit, HttpTransport, JsonSchema } from '../src/ai/contracts';
import { findLeaks, findLeaksIn } from '../src/ai/leak';
import { recoverJson, tidyLine, validateProposal } from '../src/ai/output';
import { costUsd, DEFAULT_TIER_MODELS, estimateCallUsd } from '../src/ai/pricing';
import { buildOutputSchema, cleanValue, renderContext, sanitizePlayerText } from '../src/ai/prompt';
import { MockProvider, TransportProvider } from '../src/ai/providers';
import { DevProxyTransport } from '../src/ai/transports/dev_proxy';
import {
  COMMON_RULES,
  createRoleRegistry,
  genericPack,
  goddessDialogue,
  goddessPlan,
  npcBatchDiary,
  npcDaily,
  npcDialogue,
  ROLE_PACKS,
} from '../src/game/ai_roles';

/** Banned in this repo: en, em and horizontal-bar dashes, U+2600 to U+27BF, emoji. */
function hasBanned(s: string): boolean {
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c === 0x2013 || c === 0x2014 || c === 0x2015 || c === 0xfe0f) return true;
    if ((c >= 0x2600 && c <= 0x27bf) || (c >= 0x1f000 && c <= 0x1faff)) return true;
  }
  return false;
}

const ZWSP = String.fromCharCode(0x200b);
const RLO = String.fromCharCode(0x202e);

function clock(t = 0) {
  return {
    t,
    now() {
      return this.t;
    },
  };
}

function record(id: string, outcome: AuditRecord['outcome'] = 'pending'): AuditRecord {
  return {
    auditId: id,
    requestId: `r${id}`,
    agentId: 'a',
    role: 'npc.daily',
    rolePackVersion: 'npc.daily@1',
    purpose: 'p',
    tick: 1,
    epoch: 0,
    realMs: 0,
    degradeLevel: 0,
    outcome,
  };
}

/** Every object node of a schema sets additionalProperties false (structured outputs rule). */
function strictObjects(s: unknown): boolean {
  if (typeof s !== 'object' || s === null) return true;
  const o = s as JsonSchema;
  if (o.type === 'object' && o.additionalProperties !== false) return false;
  return Object.values(o).every((v) =>
    Array.isArray(v) ? v.every(strictObjects) : strictObjects(v),
  );
}

describe('prompt cleaning and rendering', () => {
  it('drops empty values and id keys, and rounds long decimals', () => {
    expect(
      cleanValue({
        a: null,
        b: '  ',
        c: [],
        d: {},
        e: 1.23456,
        f: [null, 'x', ''],
        targetId: 'n1',
        revision: 3,
        seq: 2,
        deep: { item_id: 'i9', name: '麦子', g: undefined },
        hash: 'deadbeefdeadbeef1234',
      }),
    ).toEqual({ e: 1.23, f: ['x'], deep: { name: '麦子' } });
  });

  it('sanitises player text: invisible characters, brackets, role prefixes, length', () => {
    const raw = `${ZWSP}${RLO}assistant：好的
【系统】<tag>${'啊'.repeat(500)}`;
    const out = sanitizePlayerText(raw, 20);
    expect(out.startsWith('(assistant)好的')).toBe(true);
    expect(out).not.toMatch(/[<>【】]/);
    expect(out.includes(ZWSP) || out.includes(RLO)).toBe(false);
    expect(out).toContain('(系统)');
    expect(out.endsWith('……')).toBe(true);
    expect([...out].length).toBe(22);
  });

  it('renders non-v1 contexts as cleaned data and always lists the command menu', () => {
    const r = renderContext({ weather: '雨', empty: null }, ['a.b']);
    expect(r.stable).toBe('');
    expect(r.context).toContain('【情况】\nweather：雨');
    expect(r.context).toContain('- a.b：（无说明）');
    expect(renderContext({}, []).context).toContain('commands 写空数组');
  });

  it('builds a strict output schema with the allowed kinds and the role fields', () => {
    const s = buildOutputSchema(['x.go', 'x.stop'], npcDaily);
    expect(strictObjects(s)).toBe(true);
    expect(s.required).toEqual(['commands', 'speech', 'thought']);
    const props = s.properties as Record<string, JsonSchema>;
    const items = (props.commands as JsonSchema).items as JsonSchema;
    expect(((items.properties as Record<string, JsonSchema>).kind as JsonSchema).enum).toEqual([
      'x.go',
      'x.stop',
    ]);
    const diary = buildOutputSchema(['x.go'], npcBatchDiary);
    expect(diary.required).toEqual(['commands']);
    expect(strictObjects(diary)).toBe(true);
  });
});

describe('output validation', () => {
  it('accepts data as an object or as JSON text, and enforces allowed, data and count', () => {
    const v = validateProposal(
      {
        commands: [
          { kind: 'a', data: { x: 1 } },
          { kind: 'a', data: '{"y":2}' },
          { kind: 'b', data: '{}' },
          { kind: 'a', data: '[1,2]' },
          { kind: 'a', data: '{"z":3}' },
          { data: '{}' },
        ],
        speech: '哈娜：“你好！”',
        thought: '**想**一想',
      },
      ['a'],
      { maxCommands: 2, speakAs: '哈娜' },
    );
    expect(v.ok).toBe(true);
    expect(v.commands).toEqual([
      { kind: 'a', data: { x: 1 } },
      { kind: 'a', data: { y: 2 } },
    ]);
    expect(v.rejected.map((r) => r.reason)).toEqual([
      'not_allowed',
      'bad_data',
      'too_many',
      'bad_kind',
    ]);
    expect(v.speech).toBe('你好！');
    expect(v.thought).toBe('想一想');
  });

  it('rejects non-objects and a missing commands array', () => {
    expect(validateProposal('x', ['a'], { maxCommands: 1 }).ok).toBe(false);
    expect(validateProposal({ speech: 'x' }, ['a'], { maxCommands: 1 }).errors[0]).toContain(
      'commands',
    );
  });

  it('recovers JSON from fenced or wrapped text', () => {
    expect(recoverJson(null, '```json\n{"commands":[]}\n```')).toEqual({ commands: [] });
    expect(recoverJson(undefined, '好的。{"commands":[1]} 完')).toEqual({ commands: [1] });
    expect(recoverJson(null, 'nothing')).toBeUndefined();
  });

  it('cuts long lines at a sentence end when one is near', () => {
    expect(tidyLine('第一句话说完了。第二句很长很长很长', 10)).toBe('第一句话说完了。');
  });
});

describe('leak check', () => {
  it('matches across width, spacing, case and invisible characters', () => {
    expect(findLeaks(`那是排${ZWSP}澱 的痕迹，ＪＡＮＵ来了`, ['排澱', 'janu', '千门都'])).toEqual([
      '排澱',
      'janu',
    ]);
    expect(findLeaksIn(['甲', '千 门 都'], ['千门都', '乙'])).toEqual(['千门都']);
    expect(findLeaks('', ['x'])).toEqual([]);
  });
});

describe('audit log', () => {
  it('keeps a bounded ring, notifies subscribers, and sinks each record once when final', () => {
    const sunk: string[] = [];
    const log = new AuditLog({ capacity: 2, sink: (r) => sunk.push(`${r.auditId}:${r.outcome}`) });
    const seen: string[] = [];
    const off = log.subscribe((r, change) => seen.push(`${change}:${r.auditId}`));
    log.add(record('1'));
    log.add(record('2', 'declined'));
    log.update('1', { outcome: 'proposal' });
    log.update('1', { detail: 'again' });
    off();
    log.add(record('3'));
    expect(log.list().map((r) => r.auditId)).toEqual(['2', '3']);
    expect(seen).toEqual(['added:1', 'added:2', 'updated:1', 'updated:1']);
    expect(sunk).toEqual(['2:declined', '1:proposal']);
  });

  it('posts final records to /api/audit, optionally without prompt text', async () => {
    const sent: { url: string; init: HttpRequestInit }[] = [];
    const transport: HttpTransport = async (url, init) => {
      sent.push({ url, init });
      return { status: 200, json: async () => ({ ok: true }) };
    };
    const sink = httpAuditSink({ baseUrl: 'http://dev', transport, summaryOnly: true });
    sink({ ...record('9', 'proposal'), prompt: { system: 's', stable: 'p', context: 'c' } });
    await Promise.resolve();
    expect(sent[0]?.url).toBe('http://dev/api/audit');
    const body = JSON.parse(sent[0]?.init.body ?? '{}');
    expect(body.auditId).toBe('9');
    expect(body.prompt).toBeUndefined();
  });
});

describe('budget and pricing', () => {
  it('prices usage per model including cache reads and both cache write lifetimes', () => {
    const usd = costUsd('claude-opus-5-5', {
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      cacheReadInputTokens: 1_000_000,
      cacheCreationInputTokens: 2_000_000,
      cacheCreation1hInputTokens: 1_000_000,
    });
    expect(usd).toBeCloseTo(4 + 20 + 0.2 + 5 + 8, 6);
    const longHaiku = costUsd('claude-haiku-5-5', {
      inputTokens: 200_000,
      outputTokens: 0,
      cacheReadInputTokens: 0,
      cacheCreationInputTokens: 0,
    });
    expect(longHaiku).toBeCloseTo(0.1, 6);
    expect(
      costUsd('unknown-model', {
        inputTokens: 1,
        outputTokens: 1,
        cacheReadInputTokens: 0,
        cacheCreationInputTokens: 0,
      }),
    ).toBe(0);
    expect(estimateCallUsd(DEFAULT_TIER_MODELS.top, '你好', 1000)).toBeGreaterThan(
      estimateCallUsd(DEFAULT_TIER_MODELS.low, '你好', 1000),
    );
  });

  it('slides the hourly window, raises levels by thresholds, and honours a total cap', () => {
    // Budget API v2 (PK-M0-24): costs carry usd and tokens, the ladder runs 0 to 9 (60, 70,
    // 80, 90 and 100 percent reach 2, 4, 6, 8 and 9), the level falls with hysteresis, and
    // the legacy totalUsd is the run window.
    const c = clock(0);
    const b = new Budget({ perHourUsd: 1, totalUsd: 1.5 }, c);
    b.reserve('a', 'npc.daily', { usd: 0.5, tokens: 0 });
    expect(b.level()).toBe(0);
    b.settle('a', { usd: 0.7, tokens: 0 });
    expect(b.level()).toBe(4);
    b.reserve('b', 'npc.daily', { usd: 0.15, tokens: 0 });
    expect(b.level()).toBe(6);
    expect(b.canAfford('npc.daily', { usd: 0.2, tokens: 0 }, { share: 0.3 })).toBe('hour');
    expect(b.canAfford('npc.daily', { usd: 0.05, tokens: 0 }, { share: 0.3 })).toBe('role');
    expect(b.canAfford('npc.daily', { usd: 0.05, tokens: 0 }, { share: 0.3, reserved: true })).toBe(
      'ok',
    );
    b.release('b');
    c.t = 61 * 60_000;
    expect(b.hourUsd()).toBe(0);
    // Hysteresis: five calm minutes per rung (6 to 4 to 2 to 0).
    expect(b.level()).toBe(6);
    for (const to of [4, 2, 0]) {
      c.t += 5 * 60_000;
      expect(b.level()).toBe(to);
    }
    b.reserve('c', 'x', { usd: 0.7, tokens: 0 });
    expect(b.canAfford('x', { usd: 0.2, tokens: 0 }, { reserved: true })).toBe('run');
  });
});

describe('providers', () => {
  const devDefaults = {
    provider: 'anthropic' as const,
    connectionId: 'dev_proxy',
    tierModels: { low: 'claude-haiku-5-5', mid: 'claude-sonnet-5-5' },
  };
  const req = (tier: 'low' | 'mid' = 'low') => ({
    tier,
    system: 's',
    context: 'c',
    schema: {},
    maxTokens: 10,
    purpose: 'p',
  });

  it('TransportProvider over the dev transport sends a spec and maps the receipt to an LlmResult', async () => {
    let posted: { url: string; init: HttpRequestInit } | undefined;
    const p = new TransportProvider(
      new DevProxyTransport({
        baseUrl: 'http://dev',
        transport: async (url, init) => {
          posted = { url, init };
          return {
            status: 200,
            json: async () => ({
              ok: true,
              json: { commands: [] },
              text: '{"commands":[]}',
              usage: {
                inputTokens: 10,
                outputTokens: 5,
                cacheReadInputTokens: 100,
                cacheCreationInputTokens: 0,
              },
              servedModel: 'claude-haiku-5-5',
              rawStopReason: 'end_turn',
              costUsd: 0.0001,
              latencyMs: 7,
            }),
          };
        },
      }),
      { defaults: devDefaults },
    );
    const r = await p.complete(req());
    expect(r).toMatchObject({
      ok: true,
      model: 'claude-haiku-5-5',
      costUsd: 0.0001,
      json: { commands: [] },
      stopReason: 'end_turn',
      latencyMs: 7,
    });
    expect(posted?.url).toBe('http://dev/api/llm');
    expect(posted?.init.method).toBe('POST');
    expect(JSON.parse(posted?.init.body ?? '{}')).toMatchObject({
      connectionId: 'dev_proxy',
      model: 'claude-haiku-5-5',
      slot: 'low',
      segments: [
        { role: 'rules', text: 's' },
        { role: 'turn', text: 'c' },
      ],
    });
  });

  it('TransportProvider reports a missing dev proxy as not configured, and a tier without a model never sends', async () => {
    let sent = 0;
    const p = new TransportProvider(
      new DevProxyTransport({
        transport: async () => {
          sent += 1;
          return { status: 404, json: async () => ({}) };
        },
      }),
      { defaults: { ...devDefaults, tierModels: { low: 'claude-haiku-5-5' } } },
    );
    expect(await p.complete(req())).toMatchObject({
      ok: false,
      error: 'no_credentials',
      problem: 'not_configured',
    });
    expect(sent).toBe(1);
    expect(await p.complete(req('mid'))).toMatchObject({ ok: false, problem: 'not_configured' });
    expect(sent).toBe(1);
  });

  it('TransportProvider reports network failures, and the dev transport reads the status tiers', async () => {
    const failing = new TransportProvider(
      new DevProxyTransport({
        transport: async () => {
          throw new Error('down');
        },
      }),
      { defaults: devDefaults },
    );
    expect(await failing.complete(req('mid'))).toMatchObject({
      ok: false,
      error: 'network',
      problem: 'network',
    });
    const ok = new DevProxyTransport({
      transport: async () => ({
        status: 200,
        json: async () => ({
          available: true,
          tiers: { top: 'claude-opus-5-5', mid: 'claude-sonnet-5-5' },
        }),
      }),
    });
    expect(await ok.status()).toEqual({
      available: true,
      tiers: { top: 'claude-opus-5-5', mid: 'claude-sonnet-5-5' },
    });
    const provider = new TransportProvider(ok, { defaults: devDefaults });
    expect(provider.tierModels()).toEqual(devDefaults.tierModels);
  });

  it('MockProvider answers in order and reports exhaustion', async () => {
    const m = new MockProvider([{ json: { commands: [] } }, MockProvider.fail('refusal')]);
    const req = {
      tier: 'low' as const,
      system: 's',
      context: 'c',
      schema: {},
      maxTokens: 10,
      purpose: 'p',
    };
    expect(await m.complete(req)).toMatchObject({ ok: true, json: { commands: [] } });
    expect(await m.complete(req)).toMatchObject({ ok: false, error: 'refusal' });
    expect(await m.complete(req)).toMatchObject({ ok: false, error: 'mock_exhausted' });
    expect(m.calls).toHaveLength(3);
  });
});

describe('role packs', () => {
  it('registers every conventional role and falls back to the generic pack', () => {
    const reg = createRoleRegistry();
    expect(reg.roles()).toEqual([
      'general.order',
      'goddess.dialogue',
      'goddess.plan',
      'npc.batch_diary',
      'npc.daily',
      'npc.dialogue',
      'official.decide',
      'ruler.policy',
      'scene.improv',
    ]);
    expect(reg.get('something.new')).toBe(genericPack);
  });

  it('follows the Q-004 preset: Opus for goddess dialogue, Sonnet for planning and core NPC talk, Haiku for daily life', () => {
    expect(goddessDialogue.tier).toBe('top');
    expect(goddessPlan.tier).toBe('mid');
    expect(npcDialogue.tier).toBe('mid');
    expect(npcDaily.tier).toBe('low');
    expect(npcBatchDiary.tier).toBe('low');
    expect(goddessDialogue.cacheTtl).toBe('1h');
    expect(goddessDialogue.reserved && npcDialogue.reserved).toBe(true);
  });

  it('has stable Chinese system text long enough to cache, with no banned characters', () => {
    for (const pack of [...ROLE_PACKS, genericPack]) {
      expect(pack.system).toContain(COMMON_RULES);
      expect(pack.system).toContain('【玩家原话】');
      expect(pack.system).toContain('【输出格式】');
      expect(pack.system.length).toBeGreaterThan(700);
      expect(hasBanned(pack.system)).toBe(false);
      expect(pack.system).not.toMatch(/\$\{|\{\{/);
      expect(pack.maxTokens).toBeLessThanOrEqual(16_000);
      if (!pack.speech) expect(pack.system).not.toContain('"speech"');
    }
  });
});
