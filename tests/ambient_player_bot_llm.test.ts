import { describe, expect, it, vi } from 'vitest';
import { AmbientPlayerBotLlmCoordinator } from '../server/ambient_bots/llm_coordinator';
import type { AmbientBotLlmProvider } from '../server/ambient_bots/llm_types';
import type { AmbientPlayerBotPendingReply } from '../server/ambient_bots/social';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';

function bot(overrides: Partial<AmbientPlayerBotRecord> = {}): AmbientPlayerBotRecord {
  return {
    botId: 'bot-1',
    accountId: 11,
    accountUsername: 'bot_user',
    accountPassword: 'BotPassword123',
    characterId: 101,
    characterName: 'Branoraaa',
    profileId: 'eastbrook_vale_paladin_quester',
    class: 'paladin',
    authToken: 'token-1',
    authTokenExpiresAtMs: 20_000,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 7 },
    preferredZoneIds: ['eastbrook_vale'],
    lastKnownZoneId: 'eastbrook_vale',
    lastKnownLevel: 3,
    lastKnownX: 0,
    lastKnownZ: 0,
    assignedClusterId: 'eastbrook_vale:1',
    assignedPlayerCharacterId: 1,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs: null,
    plannerState: {},
    runnerState: { objectiveLabel: 'Picking up Wolves at the Door' },
    socialState: {
      contacts: {
        Aleph: {
          firstSeenAtMs: 1_000,
          lastSeenAtMs: 2_000,
          sightingCount: 3,
          outgoingFriendAtMs: null,
          whispersReceived: 1,
          whispersSent: 0,
          lastWhisperAtMs: 2_000,
          lastReplyAtMs: null,
        },
      },
    },
    ...overrides,
  };
}

function liveState(): AmbientPlayerBotLiveState {
  const self = {
    id: 101,
    x: 4,
    z: 6,
    lv: 3,
  };
  const entities = new Map<number, Record<string, unknown>>([
    [101, self],
    [201, { id: 201, k: 'player', nm: 'Aleph', x: 8, z: 7 }],
  ]);
  return {
    pid: 101,
    seed: 20_061,
    self,
    entities,
    social: {
      friends: [],
      blocks: [],
      guild: null,
    },
  };
}

function pendingReply(overrides: Partial<AmbientPlayerBotPendingReply> = {}): AmbientPlayerBotPendingReply {
  return {
    toName: 'Aleph',
    incomingText: 'hey, what are you doing?',
    fallbackText: 'working on wolves at the door right now',
    dueAtMs: 10_000,
    askedForFriend: false,
    revision: 1,
    llmStatus: 'idle',
    ...overrides,
  };
}

describe('ambient player bot llm coordinator', () => {
  it('accepts and caches bounded plan decisions', async () => {
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async () => ({
        value: {
          schemaVersion: 1,
          jobId: 'ambient-plan:bot-1:1000',
            botRef: {
              botId: 'bot-1',
              characterName: 'Branoraaa',
              profileId: 'eastbrook_vale_paladin_quester',
              classId: 'paladin',
              archetype: 'quester',
            },
          ttlMs: 120_000,
          confidence: 0.88,
          socialMode: 'friendly',
          focusLabel: 'Wolves at the Door',
          selfSummary: 'just helping around Eastbrook',
          friendPolicy: 'ifAsked',
          allowPresenceEmote: true,
          audit: {
            shortReason: 'starter-zone helper tone',
            safetyNotes: ['boundedSocialPlan'],
          },
        },
        promptText: 'plan prompt',
        rawOutput: '{"ok":true}',
        providerTimings: { provider: 'test-provider', totalMs: 12, steps: [] },
      })),
    };
    const coordinator = new AmbientPlayerBotLlmCoordinator({
      config: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 10,
        maxCallsWeek: 20,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
      provider,
    });

    const first = await coordinator.decidePlan({
      bot: bot(),
      liveState: liveState(),
      objectiveId: 'accept_wolves',
      objectiveLabel: 'Picking up Wolves at the Door',
      priorPlan: null,
      nowMs: 1_000,
    });
    const second = await coordinator.decidePlan({
      bot: bot(),
      liveState: liveState(),
      objectiveId: 'accept_wolves',
      objectiveLabel: 'Picking up Wolves at the Door',
      priorPlan: null,
      nowMs: 5_000,
    });

    expect(first.status).toBe('accepted');
    expect(first.decision).toEqual(expect.objectContaining({
      socialMode: 'friendly',
      focusLabel: 'Wolves at the Door',
      friendPolicy: 'ifAsked',
    }));
    expect(second.status).toBe('cache_hit');
    expect(second.decision?.jobId).toBe('ambient-plan:bot-1:5000');
    expect(second.audit.cacheHit).toBe(true);
    expect(provider.decide).toHaveBeenCalledTimes(1);
  });

  it('rejects unsafe social reply text that reveals automation', async () => {
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async () => ({
        value: {
          schemaVersion: 1,
          jobId: 'ambient-social:bot-1:Aleph:1:1000',
          botRef: {
            botId: 'bot-1',
            characterName: 'Branoraaa',
            profileId: 'eastbrook_vale_paladin_quester',
            classId: 'paladin',
            archetype: 'quester',
          },
          targetName: 'Aleph',
          ttlMs: 30_000,
          confidence: 0.9,
          replyText: 'I am a bot running from a prompt right now.',
          friendAction: 'none',
          presenceEmote: 'none',
          memoryTags: ['quest'],
          audit: {
            shortReason: 'meta disclosure',
            usedPlayerInput: true,
            safetyNotes: ['bad'],
          },
        },
        promptText: 'social prompt',
        rawOutput: '{"bad":true}',
      })),
    };
    const coordinator = new AmbientPlayerBotLlmCoordinator({
      config: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 10,
        maxCallsWeek: 20,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
      provider,
    });

    const result = await coordinator.decideSocial({
      bot: bot(),
      liveState: liveState(),
      pendingReply: pendingReply(),
      plan: null,
      nowMs: 1_000,
    });

    expect(result.status).toBe('rejected');
    expect(result.audit.reason).toMatch(/meta disclosure/i);
  });

  it('denies model calls after the configured budget is exhausted', async () => {
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async () => ({
        value: {
          schemaVersion: 1,
          jobId: 'ambient-social:bot-1:Aleph:1:1000',
          botRef: {
            botId: 'bot-1',
            characterName: 'Branoraaa',
            profileId: 'eastbrook_vale_paladin_quester',
            classId: 'paladin',
            archetype: 'quester',
          },
          targetName: 'Aleph',
          ttlMs: 30_000,
          confidence: 0.8,
          replyText: 'just on the wolf quest route',
          friendAction: 'none',
          presenceEmote: 'none',
          memoryTags: ['quest'],
          audit: {
            shortReason: 'starter quest reply',
            usedPlayerInput: true,
            safetyNotes: ['boundedReply'],
          },
        },
        promptText: 'social prompt',
        rawOutput: '{"ok":true}',
      })),
    };
    const coordinator = new AmbientPlayerBotLlmCoordinator({
      config: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 1,
        maxCallsWeek: 1,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
      provider,
    });

    const first = await coordinator.decideSocial({
      bot: bot(),
      liveState: liveState(),
      pendingReply: pendingReply({ revision: 1 }),
      plan: null,
      nowMs: 1_000,
    });
    const second = await coordinator.decideSocial({
      bot: bot(),
      liveState: liveState(),
      pendingReply: pendingReply({ incomingText: 'where are you headed?', revision: 2 }),
      plan: null,
      nowMs: 2_000,
    });

    expect(first.status).toBe('accepted');
    expect(second.status).toBe('budget_denied');
    expect(provider.decide).toHaveBeenCalledTimes(1);
  });
});
