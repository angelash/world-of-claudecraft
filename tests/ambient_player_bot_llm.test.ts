import { describe, expect, it, vi } from 'vitest';
import { AmbientPlayerBotLlmCoordinator } from '../server/ambient_bots/llm_coordinator';
import type { AmbientBotLlmProvider } from '../server/ambient_bots/llm_types';
import type { AmbientPlayerBotPendingPartyUtterance } from '../server/ambient_bots/party_chat';
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

function pendingPartyUtterance(
  overrides: Partial<AmbientPlayerBotPendingPartyUtterance> = {},
): AmbientPlayerBotPendingPartyUtterance {
  return {
    mode: 'leader_brief',
    briefKey: 'party-plan|wolf-run',
    dueAtMs: 10_000,
    revision: 1,
    fallbackText: 'Buff up first, then collapse on one target.',
    leaderPromptText: '',
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

  it('reports operator diagnostics for budget, cache, and recent decision metrics', async () => {
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

    await coordinator.decidePlan({
      bot: bot(),
      liveState: liveState(),
      objectiveId: 'accept_wolves',
      objectiveLabel: 'Picking up Wolves at the Door',
      priorPlan: null,
      nowMs: 1_000,
    });
    await coordinator.decidePlan({
      bot: bot(),
      liveState: liveState(),
      objectiveId: 'accept_wolves',
      objectiveLabel: 'Picking up Wolves at the Door',
      priorPlan: null,
      nowMs: 2_000,
    });

    expect(coordinator.diagnosticsSnapshot(2_000)).toEqual(expect.objectContaining({
      enabled: true,
      providerAvailable: true,
      budget: expect.objectContaining({
        usedCalls5h: 1,
        remainingCalls5h: 9,
      }),
      cache: expect.objectContaining({
        planEntries: 1,
        socialEntries: 0,
        partyEntries: 0,
      }),
      metrics: expect.objectContaining({
        plan: expect.objectContaining({
          requests: 2,
          accepted: 1,
          cacheHit: 1,
        }),
        lastDecisionKind: 'plan',
        lastDecisionStatus: 'cache_hit',
        lastDecisionProvider: 'cache',
      }),
    }));
  });

  it('accepts and caches bounded party chat decisions', async () => {
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async () => ({
        value: {
          schemaVersion: 1,
          jobId: 'ambient-party:bot-1:leader_brief:1:1000',
          botRef: {
            botId: 'bot-1',
            characterName: 'Branoraaa',
            profileId: 'eastbrook_vale_paladin_quester',
            classId: 'paladin',
            archetype: 'quester',
          },
          mode: 'leader_brief',
          ttlMs: 45_000,
          confidence: 0.87,
          lineText: 'Buff up, stay tight, then burn my target.',
          audit: {
            shortReason: 'short pull call',
            safetyNotes: ['boundedPartyLine'],
          },
        },
        promptText: 'party prompt',
        rawOutput: '{"ok":true}',
        providerTimings: { provider: 'test-provider', totalMs: 16, steps: [] },
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

    const party = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'paladin', level: 3, hp: 40, mhp: 40, res: 30, mres: 30, rtype: 'mana', x: 4, z: 6, dead: 0, inCombat: 0, group: 1 },
        { pid: 201, name: 'Aleph', cls: 'priest', level: 3, hp: 30, mhp: 30, res: 30, mres: 30, rtype: 'mana', x: 6, z: 6, dead: 0, inCombat: 0, group: 1 },
      ],
    };
    const baseLiveState = liveState();
    const first = await coordinator.decidePartyChat({
      bot: bot({
        runnerState: {
          objectiveLabel: 'Wolves at the Door',
          groupMode: 'brain',
          partyLeaderName: 'Branoraaa',
          partyTankName: 'Branoraaa',
          partyHealerName: 'Aleph',
          partyFocusCaller: 'Branoraaa',
          partyComposition: 'Branoraaa tanks, Aleph heals',
          partyRole: 'tank',
          partyDuty: 'take point, set the pace, and keep threat stable',
        },
      }),
      liveState: {
        ...baseLiveState,
        self: {
          ...baseLiveState.self!,
          party,
        },
      },
      pendingUtterance: pendingPartyUtterance({ revision: 1 }),
      nowMs: 1_000,
    });
    const second = await coordinator.decidePartyChat({
      bot: bot({
        runnerState: {
          objectiveLabel: 'Wolves at the Door',
          groupMode: 'brain',
          partyLeaderName: 'Branoraaa',
          partyTankName: 'Branoraaa',
          partyHealerName: 'Aleph',
          partyFocusCaller: 'Branoraaa',
          partyComposition: 'Branoraaa tanks, Aleph heals',
          partyRole: 'tank',
          partyDuty: 'take point, set the pace, and keep threat stable',
        },
      }),
      liveState: {
        ...baseLiveState,
        self: {
          ...baseLiveState.self!,
          party,
        },
      },
      pendingUtterance: pendingPartyUtterance({ revision: 1 }),
      nowMs: 5_000,
    });

    expect(first.status).toBe('accepted');
    expect(first.decision?.lineText).toBe('Buff up, stay tight, then burn my target.');
    expect(second.status).toBe('cache_hit');
    expect(second.decision?.jobId).toBe('ambient-party:bot-1:leader_brief:1:5000');
    expect(provider.decide).toHaveBeenCalledTimes(1);
  });
});
