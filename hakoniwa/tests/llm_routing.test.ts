// Route resolution (docs/50_tech/llm_providers.md 4.2, 4.3, 13, 16.2): every decision kind
// resolves to its binding role and the slot of 4.2 under each tilt; the anchors take the
// highest configured slot; empty slots fall to the nearest usable one; ladder level 2 lowers
// non-reserved requests; a connection whose circuit is open is routed around on another
// connection; a built-in binding declines at once and the fallback runs on the next tick.

import { describe, expect, it } from 'vitest';
import type { BindingRole, Slot } from '../src/ai/contracts';
import { BINDING_ROLES } from '../src/ai/contracts';
import {
  bindingOf,
  DECISION_KINDS,
  HIGHEST_KINDS,
  ladderDecline,
  type RouteHints,
  type Tilt,
} from '../src/ai/llm_config/kinds';
import {
  fallbackChain,
  nearestConfigured,
  type RouteContext,
  resolveRoute,
  routeDrivers,
} from '../src/ai/llm_config/routing';
import type { LlmSettings } from '../src/ai/llm_config/settings';
import { ScriptedTransport } from '../src/ai/mocks/scripted';
import {
  anthropicConn,
  done,
  preset,
  probeSystem,
  routedRunner,
  withConns,
} from './fixtures/llm_config/fixtures';

const BINDING: Record<BindingRole, string[]> = {
  goddess: [
    'goddess.plan',
    'goddess.wake',
    'goddess.talk',
    'goddess.interpret',
    'goddess.tidy',
    'goddess.trial',
    'goddess.season_summary',
    'director.pick',
    'janu.night',
    'janu.dream',
    'prologue.turn',
    'prologue.extract',
    'court.stance',
    'epilogue.records',
    'goddess.dialogue',
    'scene.improv',
  ],
  core_npc: [
    'npc.life',
    'npc.recover',
    'npc.chat',
    'npc.tidy',
    'npc.decision_point',
    'companion.tactics',
    'npc.daily',
    'npc.dialogue',
  ],
  present_npc: ['npc.dayplan', 'npc.event', '*', 'some.unknown_kind'],
  offstage_batch: ['npc.diary_batch', 'npc.batch_diary'],
  ruler_general: [
    'leader.council',
    'general.plan',
    'ruler.policy',
    'official.decide',
    'general.order',
  ],
  court_reviewer: ['court.eloquence', 'court.review'],
};

/** Slot per kind under each tilt with all three slots configured (4.2 and its tilt table). */
const SLOTS: [string, RouteHints, Record<Tilt, Slot>][] = [
  ['goddess.plan', {}, { standard: 'mid', generous: 'top', frugal: 'low' }],
  ['goddess.wake', {}, { standard: 'mid', generous: 'top', frugal: 'low' }],
  ['goddess.tidy', {}, { standard: 'mid', generous: 'top', frugal: 'low' }],
  ['goddess.trial', {}, { standard: 'mid', generous: 'top', frugal: 'low' }],
  ['janu.night', {}, { standard: 'mid', generous: 'top', frugal: 'low' }],
  ['goddess.talk', {}, { standard: 'top', generous: 'top', frugal: 'mid' }],
  ['janu.dream', {}, { standard: 'top', generous: 'top', frugal: 'mid' }],
  ['goddess.interpret', {}, { standard: 'top', generous: 'top', frugal: 'low' }],
  ['goddess.season_summary', {}, { standard: 'low', generous: 'top', frugal: 'low' }],
  ['director.pick', {}, { standard: 'low', generous: 'top', frugal: 'low' }],
  ['npc.chat', { withPlayer: true }, { standard: 'mid', generous: 'mid', frugal: 'low' }],
  ['npc.chat', { withPlayer: false }, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.life', {}, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.recover', {}, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.tidy', { npcLevel: 1 }, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.tidy', { npcLevel: 2 }, { standard: 'low', generous: 'low', frugal: 'low' }],
  ['npc.decision_point', {}, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.decision_point', { keyFigure: true }, { standard: 'mid', generous: 'mid', frugal: 'low' }],
  ['companion.tactics', {}, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.dayplan', {}, { standard: 'low', generous: 'low', frugal: 'low' }],
  ['npc.event', {}, { standard: 'low', generous: 'low', frugal: 'low' }],
  ['npc.diary_batch', {}, { standard: 'low', generous: 'low', frugal: 'low' }],
  ['leader.council', {}, { standard: 'mid', generous: 'mid', frugal: 'low' }],
  ['leader.council', { weight: 'routine' }, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['leader.council', { weight: 'major' }, { standard: 'top', generous: 'top', frugal: 'low' }],
  ['general.plan', {}, { standard: 'mid', generous: 'mid', frugal: 'low' }],
  ['npc.daily', {}, { standard: 'low', generous: 'mid', frugal: 'low' }],
  ['npc.dialogue', {}, { standard: 'mid', generous: 'mid', frugal: 'low' }],
  ['goddess.dialogue', {}, { standard: 'top', generous: 'top', frugal: 'mid' }],
];

/** All three slots filled, every role routed, under this tilt (custom: frugal keeps a top). */
function allSlots(tilt: Tilt): LlmSettings {
  const s = preset({ preset: 'tiered', connectionId: 'conn_a', tilt: 'standard' });
  return { ...s, tilt, preset: 'custom' };
}

const ctx = (extra: Partial<RouteContext> = {}): RouteContext => ({ degradeLevel: 0, ...extra });

function slotOf(kind: string, s: LlmSettings, c: Partial<RouteContext> = {}): Slot | string {
  const r = resolveRoute(kind, ctx(c), s);
  return r.driver === 'model' ? r.slot : r.reason;
}

describe('decision kinds to binding roles and slots (4.2)', () => {
  it('maps every kind to its binding role', () => {
    for (const [role, kinds] of Object.entries(BINDING)) {
      for (const k of kinds) expect([k, bindingOf(k)]).toEqual([k, role]);
    }
    expect(bindingOf('npc.tidy', { npcLevel: 2 })).toBe('present_npc');
    // every kind in the table is covered above
    const listed = new Set(Object.values(BINDING).flat());
    expect(Object.keys(DECISION_KINDS).filter((k) => !listed.has(k))).toEqual([]);
  });

  it.each(['standard', 'generous', 'frugal'] as const)(
    'routes each kind under the %s tilt',
    (tilt) => {
      const s = allSlots(tilt);
      for (const [kind, hints, want] of SLOTS) {
        expect([kind, hints, slotOf(kind, s, { hints })]).toEqual([kind, hints, want[tilt]]);
      }
    },
  );

  it('sends the anchors to the highest configured slot (AQ-18), frugal to mid', () => {
    expect([...HIGHEST_KINDS].sort()).toEqual([
      'court.eloquence',
      'court.review',
      'court.stance',
      'epilogue.records',
      'prologue.extract',
      'prologue.turn',
      'scene.improv',
    ]);
    const std = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const fru = preset({ preset: 'tiered', connectionId: 'conn_a', tilt: 'frugal' });
    const single = preset({ preset: 'single', connectionId: 'conn_a' });
    for (const k of HIGHEST_KINDS) {
      expect(slotOf(k, std)).toBe('top');
      expect(slotOf(k, fru)).toBe('mid');
      const r = resolveRoute(k, ctx(), single);
      expect(r.driver === 'model' && r.model).toBe('claude-haiku-5-5');
    }
    // With the switch off the anchors follow the tilt table (top) and the nearest slot.
    const off = { ...std, advanced: { ...std.advanced, highestForAnchors: false } };
    const noTop = { ...off, slots: { mid: off.slots.mid, low: off.slots.low } };
    expect(slotOf('prologue.turn', noTop)).toBe('mid');
  });
});

describe('nearest slot, ladder lowering and built-in decisions (4.3)', () => {
  const base = preset({ preset: 'tiered', connectionId: 'conn_a' });

  it('looks in the wanted slot, then lower, then higher', () => {
    const midLow = { ...base, slots: { mid: base.slots.mid, low: base.slots.low } };
    expect(slotOf('goddess.talk', midLow)).toBe('mid');
    const onlyTop = { ...base, slots: { top: base.slots.top } };
    expect(slotOf('npc.life', onlyTop)).toBe('top');
    const topLow = { ...base, slots: { top: base.slots.top, low: base.slots.low } };
    expect(slotOf('goddess.plan', topLow)).toBe('low');
    expect(nearestConfigured(topLow, 'mid')).toBe('low');
    const onlyLow = { ...base, slots: { low: base.slots.low } };
    expect(slotOf('goddess.talk', onlyLow)).toBe('low');
    // A slot is unusable without a key, without first-use consent, or when its model is disabled.
    const noKey = { ...base, connections: [anthropicConn('conn_a', { keyState: 'none' })] };
    expect(slotOf('npc.life', noKey)).toBe('not_configured');
    expect(slotOf('npc.life', { ...base, consentedConnectionIds: [] })).toBe('not_configured');
    // A cloud slot is not called before the hour and day caps exist (8.3); estimates still see it.
    const noCaps = { ...base, caps: { ...base.caps, day: {} } };
    expect(slotOf('npc.life', noCaps)).toBe('not_configured');
    expect(slotOf('npc.life', noCaps, { readiness: 'config' })).toBe('low');
    expect(
      slotOf('npc.life', { ...noKey, consentedConnectionIds: [] }, { readiness: 'config' }),
    ).toBe('low');
    const disabled = {
      isOpen: () => false,
      isModelDisabled: (_c: string, m: string) => m === 'claude-opus-5-5',
    };
    expect(slotOf('goddess.talk', base, { health: disabled })).toBe('mid');
  });

  it('drops non-reserved requests one slot from ladder level 2, never below the lowest', () => {
    expect(slotOf('goddess.plan', base, { degradeLevel: 1 })).toBe('mid');
    const r = resolveRoute('goddess.plan', ctx({ degradeLevel: 2 }), base);
    expect(r.driver === 'model' && [r.slot, r.wanted, r.lowered]).toEqual(['low', 'mid', true]);
    expect(slotOf('goddess.talk', base, { degradeLevel: 4 })).toBe('top');
    expect(slotOf('npc.life', base, { degradeLevel: 6 })).toBe('low');
  });

  it('declines at once for the off preset, a built-in binding, or no usable slot', () => {
    expect(slotOf('npc.life', { ...base, preset: 'off' })).toBe('model_off');
    const goddessBuiltin = {
      ...base,
      bindings: { ...base.bindings, goddess: { mode: 'builtin' as const } },
    };
    expect(slotOf('goddess.plan', goddessBuiltin)).toBe('role_builtin');
    expect(slotOf('npc.life', goddessBuiltin)).toBe('low');
    expect(slotOf('npc.life', { ...base, slots: {} })).toBe('not_configured');
    const fixed = {
      ...base,
      bindings: { ...base.bindings, goddess: { mode: 'fixed' as const, slot: 'low' as const } },
    };
    expect(slotOf('goddess.talk', fixed)).toBe('low');
    const drivers = routeDrivers(goddessBuiltin, ctx());
    expect(BINDING_ROLES.map((role) => drivers[role].driver)).toEqual([
      'builtin',
      'model',
      'model',
      'model',
      'model',
      'model',
    ]);
  });
});

describe('reroute past an open circuit (4.3)', () => {
  const s: LlmSettings = {
    ...withConns(anthropicConn('conn_a'), anthropicConn('conn_b')),
    preset: 'custom',
    slots: {
      top: { connectionId: 'conn_a', model: 'claude-opus-5-5' },
      mid: { connectionId: 'conn_b', model: 'claude-sonnet-5-5' },
      low: { connectionId: 'conn_b', model: 'claude-haiku-5-5' },
    },
    bindings: Object.fromEntries(
      BINDING_ROLES.map((r) => [r, { mode: 'route' }]),
    ) as LlmSettings['bindings'],
  };
  const open = (...ids: string[]) => ({ isOpen: (id: string) => ids.includes(id) });

  it('tries other connections lower first, then higher; same-connection slots are never in the chain', () => {
    expect(fallbackChain(s, 'top')).toEqual(['mid', 'low']);
    expect(fallbackChain(s, 'mid')).toEqual(['top']);
    const top = resolveRoute('goddess.talk', ctx({ health: open('conn_a') }), s);
    expect(top.driver === 'model' && [top.slot, top.connectionId, top.rerouted]).toEqual([
      'mid',
      'conn_b',
      true,
    ]);
    const mid = resolveRoute('goddess.plan', ctx({ health: open('conn_b') }), s);
    expect(mid.driver === 'model' && [mid.slot, mid.connectionId, mid.rerouted]).toEqual([
      'top',
      'conn_a',
      true,
    ]);
    expect(slotOf('goddess.plan', s, { health: open('conn_a', 'conn_b') })).toBe('connection_down');
    const one = preset({ preset: 'tiered', connectionId: 'conn_a' });
    expect(slotOf('goddess.talk', one, { health: open('conn_a') })).toBe('connection_down');
  });

  it('reroutes in the runner after a key failure and records the problem', async () => {
    const transport = new ScriptedTransport([
      {
        connectionId: 'conn_b',
        answer: {
          ok: false,
          error: { cls: 'auth', httpStatus: 401, message: 'bad key' },
          problem: 'key_invalid',
          latencyMs: 0,
        },
      },
      {
        connectionId: 'conn_a',
        answer: { json: { commands: [{ kind: 'llmtest.act', data: '{"n":2}' }] } },
      },
    ]);
    const { engine, runner } = routedRunner(probeSystem([1, 3]), s, transport);
    engine.step(1);
    await runner.whenIdle();
    engine.step(2);
    await runner.whenIdle();
    engine.step(1);
    expect(transport.calls.map((c) => [c.connectionId, c.model, c.slot])).toEqual([
      ['conn_b', 'claude-haiku-5-5', 'low'],
      ['conn_a', 'claude-opus-5-5', 'top'],
    ]);
    expect(runner.audit.list().map((r) => r.reason ?? r.outcome)).toEqual([
      'key_invalid',
      'proposal',
    ]);
    expect(runner.audit.list()[1]?.route).toEqual({
      bindingRole: 'core_npc',
      slot: 'top',
      connectionId: 'conn_a',
      rerouted: true,
    });
    expect(runner.problems().map((p) => [p.code, p.connectionIds, p.roles])).toEqual([
      ['key_invalid', ['conn_b'], ['core_npc']],
    ]);
    expect(runner.drivers()?.core_npc).toEqual({
      driver: 'model',
      slot: 'top',
      connectionId: 'conn_a',
      model: 'claude-opus-5-5',
      rerouted: true,
    });
    expect(done(engine)).toEqual([
      { n: 0, by: 'fallback', revision: undefined },
      { n: 2, by: 'ai', revision: 43 },
    ]);
    runner.resetConnection('conn_b');
    expect(runner.problems()).toEqual([]);
  });
});

describe('routing in the runner (13)', () => {
  it('sends the routed spec: connection, model, slot, binding role and reservation', async () => {
    const transport = new ScriptedTransport([
      {
        answer: { json: { commands: [{ kind: 'llmtest.act', data: '{"n":5}' }] }, costUsd: 0.0002 },
      },
    ]);
    const s = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const { engine, runner } = routedRunner(probeSystem([1]), s, transport);
    engine.step(1);
    await runner.whenIdle();
    engine.step(1);
    const spec = transport.calls[0];
    expect(spec).toMatchObject({
      provider: 'anthropic',
      connectionId: 'conn_a',
      model: 'claude-haiku-5-5',
      slot: 'low',
      bindingRole: 'core_npc',
      purpose: 'npc.daily/probe',
    });
    expect(spec?.segments.map((g) => g.role)).toEqual(['rules', 'persona', 'turn']);
    expect(spec?.reserve.usd).toBeGreaterThan(0);
    expect(spec?.reserve.tokens).toBeGreaterThan(1500);
    expect(done(engine)).toEqual([{ n: 5, by: 'ai', revision: 41 }]);
    expect(runner.budget.totalUsd()).toBeCloseTo(0.0002, 9);
  });

  it('declines a built-in binding at once; the fallback runs on the next tick without a call', async () => {
    const transport = ScriptedTransport.always({
      json: { commands: [{ kind: 'llmtest.act', data: '{"n":9}' }] },
    });
    const base = preset({ preset: 'tiered', connectionId: 'conn_a' });
    const s = { ...base, bindings: { ...base.bindings, core_npc: { mode: 'builtin' as const } } };
    const { engine, runner } = routedRunner(probeSystem([1]), s, transport);
    engine.step(1);
    expect(done(engine)).toEqual([]);
    engine.step(1);
    expect(done(engine)).toEqual([{ n: 0, by: 'fallback', revision: undefined }]);
    expect(transport.calls).toHaveLength(0);
    expect(runner.audit.list()[0]?.reason).toBe('role_builtin');
    await runner.whenIdle();
  });

  it('applies a settings change from the next request on', async () => {
    const transport = ScriptedTransport.always({
      json: { commands: [{ kind: 'llmtest.act', data: '{"n":1}' }] },
    });
    const base = preset({ preset: 'tiered', connectionId: 'conn_a' });
    let current: LlmSettings = base;
    const { engine, runner } = routedRunner(probeSystem([1, 3]), () => current, transport);
    engine.step(1);
    await runner.whenIdle();
    current = { ...base, bindings: { ...base.bindings, core_npc: { mode: 'builtin' } } };
    engine.step(3);
    await runner.whenIdle();
    expect(transport.calls).toHaveLength(1);
    expect(runner.audit.list().map((r) => r.reason ?? r.outcome)).toEqual([
      'proposal',
      'role_builtin',
    ]);
  });
});

describe('the degrade ladder per binding role (ai_architecture.md 9.4)', () => {
  it('hands roles to the built-in AI rung by rung; reserved requests last until 9', () => {
    const at = (level: number, kind: string, hints: RouteHints = {}) =>
      ladderDecline(level, kind, hints);
    expect(at(0, 'npc.diary_batch')).toBeUndefined();
    expect(at(1, 'npc.diary_batch')).toBe('degraded_offstage');
    expect(at(1, 'npc.event')).toBeUndefined();
    expect(at(2, 'npc.event')).toBe('degraded_present_event');
    expect(at(2, 'npc.dayplan')).toBeUndefined();
    expect(at(3, 'goddess.tidy')).toBe('degraded_tidy');
    expect(at(3, 'npc.tidy')).toBe('degraded_tidy');
    expect(at(4, 'npc.dayplan')).toBe('degraded_present');
    expect(at(4, 'npc.life')).toBeUndefined();
    expect(at(5, 'npc.chat', { withPlayer: false })).toBe('degraded_npc_chat');
    expect(at(5, 'npc.chat', { withPlayer: true })).toBeUndefined();
    expect(at(6, 'leader.council')).toBe('degraded_ruler');
    expect(at(6, 'goddess.plan')).toBeUndefined();
    expect(at(7, 'goddess.plan', { gameDay: 3 })).toBe('degraded_goddess_plan');
    expect(at(7, 'goddess.plan', { gameDay: 4 })).toBeUndefined();
    expect(at(8, 'npc.life')).toBe('degraded_reserved_only');
    for (const k of [
      'goddess.talk',
      'npc.dialogue',
      'court.eloquence',
      'prologue.turn',
      'scene.improv',
    ]) {
      expect(at(8, k)).toBeUndefined();
      expect(at(9, k)).toBe('degraded_all');
    }
    expect(at(8, 'goddess.wake', { important: true })).toBeUndefined();
    expect(at(8, 'goddess.wake')).toBe('degraded_reserved_only');
  });
});
