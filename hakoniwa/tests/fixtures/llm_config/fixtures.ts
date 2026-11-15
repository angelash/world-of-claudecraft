// Shared fixtures of the llm_* suites (PK-M0-24): connections of each kind, settings built
// from presets, a kernel probe system that files AI requests, and a runner set up over the
// real kernel with routed settings. No network, no real model.

import type { LlmTransport } from '../../../src/ai/contracts';
import { applyPreset, type PresetChoice } from '../../../src/ai/llm_config/presets';
import { defaultSettings, type LlmSettings } from '../../../src/ai/llm_config/settings';
import { knownModelIds, profileFor } from '../../../src/ai/providers/capabilities';
import { TransportProvider } from '../../../src/ai/providers/transport_provider';
import type { ConnectionPublic, PriceCard } from '../../../src/ai/providers/types';
import { AiRunner, type AiRunnerOptions } from '../../../src/ai/runner';
import type { AiRequestSpec } from '../../../src/core/ai_port';
import { type ContentMap, ok } from '../../../src/core/contracts';
import type { Engine } from '../../../src/core/engine';
import type { GameSystem } from '../../../src/core/system';
import { createRoleRegistry } from '../../../src/game/ai_roles';
import { createGame } from '../../../src/game/create';

declare module '../../../src/core/contracts' {
  interface CommandMap {
    'llmtest.act': { n: number; revision?: number };
  }
  interface EventMap {
    'llmtest.done': { n: number; by: string; revision?: number };
  }
}

export function anthropicConn(
  id = 'conn_a',
  extra: Partial<ConnectionPublic> = {},
): ConnectionPublic {
  return {
    id,
    kind: 'anthropic',
    name: id,
    baseUrl: 'https://api.anthropic.com',
    auth: { scheme: 'x_api_key' },
    keyState: 'saved',
    keyLast4: 'abcd',
    extraHeaderNames: [],
    currency: 'USD',
    maxInFlight: 8,
    models: knownModelIds('anthropic').map((m) => profileFor('anthropic', m)),
    ...extra,
  };
}

export function localConn(
  id = 'conn_local',
  models: string[] = ['qwen3:14b', 'qwen3:8b'],
  baseUrl = 'http://127.0.0.1:11434',
): ConnectionPublic {
  return {
    id,
    kind: 'local',
    flavor: 'ollama',
    name: id,
    baseUrl,
    auth: { scheme: 'none' },
    keyState: 'none',
    extraHeaderNames: [],
    currency: 'USD',
    maxInFlight: 2,
    models: models.map((m) => profileFor('local', m, 'ollama')),
  };
}

export function compatConn(
  id = 'conn_compat',
  models: { model: string; price?: PriceCard }[] = [
    { model: 'chat-large' },
    { model: 'chat-small' },
  ],
  baseUrl = 'https://api.example.com/v1',
): ConnectionPublic {
  return {
    id,
    kind: 'openai_compat',
    name: id,
    baseUrl,
    auth: { scheme: 'bearer' },
    keyState: 'saved',
    extraHeaderNames: [],
    currency: 'USD',
    maxInFlight: 8,
    models: models.map((m) => ({
      ...profileFor('openai_compat', m.model),
      ...(m.price ? { price: m.price } : {}),
    })),
  };
}

/** Settings holding these connections, all consented, with generous money caps. */
export function withConns(...conns: ConnectionPublic[]): LlmSettings {
  return {
    ...defaultSettings(),
    connections: conns,
    consentedConnectionIds: conns.map((c) => c.id),
    caps: { hour: { usd: 10 }, day: { usd: 30 }, displayCurrency: 'USD' },
  };
}

export function preset(choice: PresetChoice, ...conns: ConnectionPublic[]): LlmSettings {
  return applyPreset(withConns(...(conns.length ? conns : [anthropicConn()])), choice);
}

export const PERSONA = '你是边石镇的面包师傅哈娜，四十岁，嗓门大，心肠软。';

/** Files one AI request at each listed tick. */
export function probeSystem(
  ticks: number[],
  spec: Partial<AiRequestSpec> = {},
  agentFor: (tick: number) => string = (t) => `npc${t}`,
): GameSystem {
  return {
    id: 'zz_llm_probe',
    order: 999,
    tick(ctx) {
      if (!ticks.includes(ctx.tick)) return;
      ctx.ai.request({
        agentId: agentFor(ctx.tick),
        role: 'npc.daily',
        purpose: 'probe',
        revision: 40 + ctx.tick,
        context: {
          v: 1,
          persona: PERSONA,
          situation: '清晨，铺子刚开门。',
          commands: { 'llmtest.act': 'data: { n: 数量 }' },
        },
        allowed: ['llmtest.act'],
        fallback: [
          {
            kind: 'llmtest.act',
            data: { n: 0 },
            source: { type: 'system', system: 'zz_llm_probe' },
          },
        ],
        deadlineTicks: 200,
        ...spec,
      });
    },
    commands: {
      'llmtest.act'(ctx, d, source) {
        ctx.emit('llmtest.done', { n: d.n, by: source.type, revision: d.revision });
        return ok();
      },
    },
  };
}

export function fakeClock(t = 1000) {
  return {
    t,
    now() {
      return this.t;
    },
  };
}

export function done(engine: Engine): { n: number; by: string; revision?: number }[] {
  return engine.world.recent.flatMap((e) => (e.kind === 'llmtest.done' ? [e.data] : []));
}

/** A routed runner over the real kernel: every connection is served by `transport`. */
export function routedRunner(
  system: GameSystem,
  settings: LlmSettings | (() => LlmSettings),
  transport: LlmTransport,
  extra: Partial<AiRunnerOptions> = {},
) {
  const engine = createGame({
    seed: 1,
    aiMode: 'external',
    systems: [system],
    content: {} as ContentMap,
  });
  const clock = fakeClock();
  const provider = new TransportProvider(transport, { id: 'test' });
  const runner = new AiRunner({
    engine,
    roles: createRoleRegistry(),
    clock,
    settings,
    providers: () => provider,
    ...extra,
  });
  runner.attach();
  return { engine, runner, clock, provider };
}
