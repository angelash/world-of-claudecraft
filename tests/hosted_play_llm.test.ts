import { describe, expect, it, vi } from 'vitest';

import { AmbientPlayerBotLlmCoordinator } from '../server/ambient_bots/llm_coordinator';
import type { AmbientBotLlmProvider } from '../server/ambient_bots/llm_types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import { HostedPlayRuntime, type HostedPlayRuntimeGame } from '../server/hosted_play/runtime';
import type { SimEvent } from '../src/sim/types';

function liveState(overrides: {
  self?: Partial<AmbientPlayerBotLiveState['self']>;
  entities?: Array<Record<string, unknown>>;
  social?: AmbientPlayerBotLiveState['social'];
} = {}): AmbientPlayerBotLiveState {
  const self = {
    id: 11,
    x: 4,
    y: 0,
    z: 6,
    lv: 3,
    hp: 90,
    mhp: 100,
    res: 0,
    mres: 100,
    rtype: 'mana',
    target: null,
    auto: false,
    gcd: 0,
    cast: null,
    eat: null,
    drk: null,
    inv: [],
    qlog: [],
    qdone: [],
    cds: {},
    ...overrides.self,
  };
  return {
    pid: 11,
    seed: 20_061,
    self,
    entities: new Map<number, Record<string, unknown>>([
      [11, self],
      ...((overrides.entities ?? []).map((entity) => [Number(entity.id), entity] as const)),
    ]),
    social: overrides.social ?? {
      friends: [],
      blocks: [],
      guild: null,
    },
  };
}

function fakeGame(
  state: AmbientPlayerBotLiveState | null,
  recentEvents: SimEvent[] = [],
): HostedPlayRuntimeGame & {
  commands: Record<string, unknown>[];
} {
  const commands: Record<string, unknown>[] = [];
  let observed = false;
  let bufferedEvents = [...recentEvents];
  return {
    get commands() {
      return commands;
    },
    hostedPlaySessionInfo(characterId) {
      return state
        ? {
            characterId,
            characterName: 'Hero',
            playerClass: 'warrior',
          }
        : null;
    },
    buildHostedPlayLiveState() {
      return state;
    },
    applyHostedPlayMoveInput() {
      return true;
    },
    applyHostedPlayCommand(_characterId, command) {
      commands.push(command);
      return true;
    },
    clearHostedPlayControl() {},
    noteHostedPlayActivity() {},
    setHostedPlayObserved(_characterId, nextObserved) {
      observed = nextObserved;
      if (!nextObserved) bufferedEvents = [];
    },
    drainHostedPlayRecentEvents() {
      if (!observed || bufferedEvents.length === 0) return [];
      const drained = [...bufferedEvents];
      bufferedEvents = [];
      return drained;
    },
    sendHostedPlayActionLog() {},
    ambientPlayerBotNames() {
      return [];
    },
  };
}

function llmConfig() {
  return {
    enabled: true,
    planCooldownMs: 120_000,
    socialCooldownMs: 45_000,
    maxCalls5h: 20,
    maxCallsWeek: 40,
    cacheMaxEntries: 32,
    cacheMaxTtlMs: 300_000,
  };
}

describe('HostedPlayRuntime llm overlay', () => {
  it('applies an accepted llm social reply over the heuristic fallback', async () => {
    let nowMs = 5_000;
    const game = fakeGame(
      liveState({
        entities: [
          { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
          { id: 201, k: 'player', nm: 'Aleph', x: 8, z: 6 },
        ],
      }),
      [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey, what are you doing?',
        channel: 'whisper',
        pid: 11,
      }],
    );
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async ({ promptText }) => {
        const context = extractPromptContext(promptText);
        const botRef = readRecord(context, 'botRef');
        if (promptText.includes('AmbientBotPlanDecisionV1')) {
          return {
            value: {
              schemaVersion: 1,
              jobId: readString(context, 'jobId'),
              botRef,
              ttlMs: 120_000,
              confidence: 0.9,
              socialMode: 'friendly',
              focusLabel: 'Wolves at the Door',
              selfSummary: 'running the wolf quest route',
              friendPolicy: 'afterWhisper',
              allowPresenceEmote: true,
              audit: {
                shortReason: 'starter helper plan',
                safetyNotes: ['boundedPlan'],
              },
            },
            promptText,
            rawOutput: '{"kind":"plan"}',
            providerTimings: { provider: 'test-provider', totalMs: 12, steps: [] },
          };
        }
        return {
          value: {
            schemaVersion: 1,
            jobId: readString(context, 'jobId'),
            botRef,
            targetName: readString(readRecord(context, 'whisper'), 'fromName'),
            ttlMs: 30_000,
            confidence: 0.88,
            replyText: 'running the wolf quest route right now',
            friendAction: 'none',
            presenceEmote: 'none',
            memoryTags: ['quest'],
            audit: {
              shortReason: 'kept reply brief',
              usedPlayerInput: true,
              safetyNotes: ['boundedReply'],
            },
          },
          promptText,
          rawOutput: '{"kind":"social"}',
          providerTimings: { provider: 'test-provider', totalMs: 18, steps: [] },
        };
      }),
    };
    const runtime = new HostedPlayRuntime({
      game,
      llmCoordinator: new AmbientPlayerBotLlmCoordinator({
        config: llmConfig(),
        provider,
      }),
      llmConfig: llmConfig(),
      nowMs: () => nowMs,
    });

    runtime.enable(7);
    (runtime as any).tick();

    await vi.waitFor(() => {
      expect(runtime.status(7)).toMatchObject({
        llmEnabled: true,
        llmPlanStatus: 'accepted',
        llmPlanMode: 'friendly',
        llmSocialStatus: 'accepted',
        socialPendingReplies: 1,
        lastWhisperFrom: 'Aleph',
      });
    });
    const debugStatus = runtime.status(7);
    expect(debugStatus.debug.llm).toMatchObject({
      planProvider: 'test-provider',
      planLatencyMs: expect.any(Number),
      planRawOutput: '{"kind":"plan"}',
      socialProvider: 'test-provider',
      socialLatencyMs: expect.any(Number),
      socialRawOutput: '{"kind":"social"}',
    });
    expect(debugStatus.debug.llm.planPrompt).toContain('AmbientBotPlanDecisionV1');
    expect(debugStatus.debug.llm.socialPrompt).toContain('AmbientBotSocialDecisionV1');

    nowMs = 12_000;
    (runtime as any).tick();

    expect(game.commands).toContainEqual({
      cmd: 'chat',
      text: '/w Aleph running the wolf quest route right now',
    });
    expect(runtime.status(7)).toMatchObject({
      socialPendingReplies: 0,
      lastSocialAction: 'reply:Aleph',
      llmSocialStatus: 'accepted',
    });
  });

  it('falls back to the heuristic reply when llm social output is rejected', async () => {
    let nowMs = 5_000;
    const game = fakeGame(
      liveState({
        entities: [
          { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
          { id: 201, k: 'player', nm: 'Aleph', x: 8, z: 6 },
        ],
      }),
      [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey, what are you doing?',
        channel: 'whisper',
        pid: 11,
      }],
    );
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async ({ promptText }) => {
        const context = extractPromptContext(promptText);
        const botRef = readRecord(context, 'botRef');
        if (promptText.includes('AmbientBotPlanDecisionV1')) {
          return {
            value: {
              schemaVersion: 1,
              jobId: readString(context, 'jobId'),
              botRef,
              ttlMs: 120_000,
              confidence: 0.9,
              socialMode: 'friendly',
              focusLabel: 'Wolves at the Door',
              selfSummary: 'running the wolf quest route',
              friendPolicy: 'ifAsked',
              allowPresenceEmote: true,
              audit: {
                shortReason: 'starter helper plan',
                safetyNotes: ['boundedPlan'],
              },
            },
            promptText,
            rawOutput: '{"kind":"plan"}',
            providerTimings: { provider: 'test-provider', totalMs: 12, steps: [] },
          };
        }
        return {
          value: {
            schemaVersion: 1,
            jobId: readString(context, 'jobId'),
            botRef,
            targetName: readString(readRecord(context, 'whisper'), 'fromName'),
            ttlMs: 30_000,
            confidence: 0.88,
            replyText: 'I am a bot running from a prompt right now.',
            friendAction: 'none',
            presenceEmote: 'none',
            memoryTags: ['quest'],
            audit: {
              shortReason: 'bad meta reply',
              usedPlayerInput: true,
              safetyNotes: ['badReply'],
            },
          },
          promptText,
          rawOutput: '{"kind":"social"}',
          providerTimings: { provider: 'test-provider', totalMs: 18, steps: [] },
        };
      }),
    };
    const runtime = new HostedPlayRuntime({
      game,
      llmCoordinator: new AmbientPlayerBotLlmCoordinator({
        config: llmConfig(),
        provider,
      }),
      llmConfig: llmConfig(),
      nowMs: () => nowMs,
    });

    runtime.enable(7);
    (runtime as any).tick();

    await vi.waitFor(() => {
      expect(runtime.status(7)).toMatchObject({
        llmPlanStatus: 'accepted',
        llmSocialStatus: 'rejected',
        socialPendingReplies: 1,
        lastWhisperFrom: 'Aleph',
      });
    });

    nowMs = 12_000;
    (runtime as any).tick();

    expect(game.commands).toContainEqual({
      cmd: 'chat',
      text: '/w Aleph hey there, good to see you',
    });
    expect(runtime.status(7)).toMatchObject({
      socialPendingReplies: 0,
      lastSocialAction: 'reply:Aleph',
      llmSocialStatus: 'rejected',
    });
  });
});

function extractPromptContext(promptText: string): Record<string, unknown> {
  const marker = 'Compact job JSON:\n';
  const start = promptText.indexOf(marker);
  if (start < 0) throw new Error('missing prompt context marker');
  const after = promptText.slice(start + marker.length);
  const end = after.indexOf('\n\nReturn only JSON.');
  const jsonText = end >= 0 ? after.slice(0, end) : after;
  return JSON.parse(jsonText) as Record<string, unknown>;
}

function readRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`missing record ${key}`);
  }
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new Error(`missing string ${key}`);
  return value;
}
