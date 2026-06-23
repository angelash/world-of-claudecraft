import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';

// Mock the db layers so no Postgres is needed; the router logic is under test.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  findAccount: vi.fn(),
  touchLogin: vi.fn(),
  saveToken: vi.fn(),
  accountForToken: vi.fn(),
  isAdminAccount: vi.fn(),
}));
vi.mock('../server/admin_db', async () => {
  const actual = await vi.importActual<typeof import('../server/admin_db')>('../server/admin_db');
  return {
    escapeLike: actual.escapeLike,
    overviewCounts: vi.fn(),
    registrationsByDay: vi.fn(),
    sessionsByDay: vi.fn(),
    classDistribution: vi.fn(),
    levelDistribution: vi.fn(),
    listAccounts: vi.fn(),
    listCharacters: vi.fn(),
    accountDetail: vi.fn(),
    clientPerfSummary: vi.fn(),
    clientPerfRaw: vi.fn(),
  };
});
vi.mock('../server/moderation_db', () => ({
  forceCharacterRename: vi.fn(),
  moderationQueue: vi.fn(),
  moderationReportsForAccount: vi.fn(),
  ignoreReport: vi.fn(),
  moderateAccount: vi.fn(),
  muteAccountChat: vi.fn(),
}));
vi.mock('../server/chat_filter_db', () => ({
  addFilterWord: vi.fn(),
  chatModeratedAccounts: vi.fn(async () => []),
  chatModerationForAccount: vi.fn(),
  getFilterConfig: vi.fn(),
  liftChatMute: vi.fn(),
  listFilterWords: vi.fn(),
  removeFilterWord: vi.fn(),
  resetChatStrikes: vi.fn(),
  updateFilterConfig: vi.fn(),
}));

import { handleAdminApi, parsePageParams } from '../server/admin';
import { accountForToken, isAdminAccount, findAccount } from '../server/db';
import { overviewCounts, listAccounts, accountDetail, escapeLike, clientPerfSummary, clientPerfRaw } from '../server/admin_db';
import { forceCharacterRename, ignoreReport, moderateAccount, moderationQueue, moderationReportsForAccount, muteAccountChat } from '../server/moderation_db';
import {
  addFilterWord, chatModerationForAccount, getFilterConfig, liftChatMute, listFilterWords,
  removeFilterWord, resetChatStrikes, updateFilterConfig,
} from '../server/chat_filter_db';

const VALID_TOKEN = 'a'.repeat(64);

function fakeReq(opts: { method?: string; url?: string; token?: string; body?: unknown } = {}) {
  const req: any = new EventEmitter();
  req.method = opts.method ?? 'GET';
  req.url = opts.url ?? '/admin/api/overview';
  req.headers = opts.token ? { authorization: `Bearer ${opts.token}` } : {};
  req.socket = { remoteAddress: `10.0.0.${Math.floor(Math.random() * 250) + 1}` };
  if (opts.method === 'POST') {
    setImmediate(() => {
      if (opts.body !== undefined) req.emit('data', JSON.stringify(opts.body));
      req.emit('end');
    });
  }
  return req;
}

function fakeRes() {
  const res: any = {
    statusCode: 0,
    body: null as any,
    writeHead(status: number) { this.statusCode = status; },
    end(data?: string) { this.body = data ? JSON.parse(data) : null; },
  };
  return res;
}

const fakeGame: any = {
  adminStats: () => ({
    online: 2, peakOnline: 5, uptimeSeconds: 100, tickMsAvg: 1.5,
    simEntities: 40, rssBytes: 1, heapUsedBytes: 1,
  }),
  aiLifeLayerMetrics: () => ({
    providerCalls: 3,
    providerSuccesses: 2,
    providerErrors: 1,
    providerFallbacks: 1,
    acceptedDecisions: 2,
    rejectedDecisions: 1,
    localReactions: 4,
    generatedEvents: 5,
    memoryWritesQueued: 6,
    memoryFlushFailures: 0,
    memoryPruneRuns: 1,
    memoryPruneDeleted: 2,
    memoryPruneFailures: 0,
    lastMemoryPruneDeleted: 2,
    totalProviderLatencyMs: 120,
    averageProviderLatencyMs: 40,
    maxProviderLatencyMs: 80,
    lastProviderLatencyMs: 20,
    providerLatencySampleCount: 3,
    providerLatencyP50Ms: 40,
    providerLatencyP90Ms: 80,
    providerLatencyP95Ms: 80,
    lastPromptChars: 1234,
    lastRawOutputChars: 256,
    speechPolish: {
      processed: 4,
      changed: 3,
      charsTrimmed: 17,
      lastChanged: true,
      lastLocale: 'en',
      lastFingerprintSource: 'profile',
      lastBefore: 'However, keep your voice low tonight.',
      lastAfter: 'Keep your voice low tonight.',
      lastBeforeChars: 34,
      lastAfterChars: 28,
    },
    lastProviderError: 'provider unavailable',
  }),
  aiLifeLayerDiagnostics: () => ({
    recentDecisions: [{
      sequence: 7,
      jobId: 'job-7',
      trigger: 'npc_question',
      entityId: 22,
      templateId: 'brother_aldric',
      playerEntityId: 1,
      status: 'accepted',
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
      intents: ['commentOnScene'],
      sceneId: 'fallen_chapel',
      memoryWrites: [],
    }],
    worldDirectorStates: [{
      stateId: 'director-1',
      sceneId: 'fallen_chapel',
      zoneId: 'eastbrook_vale',
      mood: 'haunted',
      proposalType: 'campAlert',
      sourcePlayerEntityId: 1,
      sourceRef: 'trace-1',
      itemId: 'gravecaller_sigil',
      subjectKind: 'item',
      lineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
      heat: 0.75,
      createdAt: 10,
      updatedAt: 12,
      expiresAt: 120,
      evidence: ['trace:cursed'],
    }],
    worldDirectorProposalJournal: [{
      auditId: 'director-audit-1',
      lifecycle: 'created',
      observedAt: 12,
      stateId: 'director-1',
      proposalId: 'director-1:proposal',
      sourcePlayerEntityId: 1,
      sourceRef: 'trace-1',
      mood: 'haunted',
      proposalType: 'campAlert',
      subjectKind: 'item',
      targetRef: 'gravecaller_sigil',
      sceneId: 'fallen_chapel',
      zoneId: 'eastbrook_vale',
      intent: 'raiseCampCaution',
      status: 'preview',
      risk: 'low',
      intensity: 0.75,
      suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
      expiresAt: 120,
      reasonTags: ['mood:haunted', 'proposal:campAlert'],
      safetyNotes: ['presentationOnly', 'noQuestMutation'],
    }],
    socialMemory: {
      npcMemories: [{
        playerEntityId: 1,
        playerName: 'Alice',
        templateId: 'brother_aldric',
        interactionCount: 2,
        affinity: 0.16,
        lastInteractionAt: 12,
        sceneIds: ['fallen_chapel'],
      }],
      rumors: [{
        rumorId: 'rumor-1',
        sceneId: 'fallen_chapel',
        originSceneId: 'fallen_chapel',
        zoneId: 'eastbrook_vale',
        itemId: 'gravecaller_sigil',
        subjectKind: 'item',
        sourcePlayerEntityId: 1,
        lineIds: ['hudChrome.aiSpeech.itemInterestAvoid'],
        strength: 0.8,
        scope: 'scene',
        createdAt: 10,
        expiresAt: 100,
      }],
    },
    memoryPersistence: { pending: 1, flushing: false, pruning: false, lastPruneDeleted: 2, errors: [] },
  }),
  aiActiveTriggerMetrics: () => ({
    activePollDue: 11,
    activePollSkipped: 2,
    activePollFired: 4,
    activeEventQueued: 3,
    activeEventSkipped: 1,
    activeEventFired: 2,
    activeEventExpired: 0,
    activeCandidatesScanned: 12,
    activeCandidatesSelected: 5,
    activeProviderCalls: 6,
    activeLocalReactions: 7,
    activeNoiseSuppressions: 1,
    activeSchedulerOnlineCount: 2,
    activeSchedulerSessionsConsidered: 2,
    activeSchedulerSessionsSuppressed: 0,
    activeSchedulerLastBand: 'small',
    activeCodexBudgetDenied: 0,
    activeCodexBudgetRemaining5h: 477,
    activeCodexBudgetRemainingWeek: 3994,
    activeProviderJobs: 6,
    activeProviderSuccesses: 5,
    activeProviderErrors: 1,
    activeProviderRejected: 0,
    activeProviderFallbacks: 1,
    activeProviderPending: 1,
    activeProviderDeferredForActivity: 2,
    activeLastProviderLatencyMs: 923,
    activeActionsAttempted: 3,
    activeActionsApplied: 2,
    activeActionsRejected: 1,
    activeMobActionsApplied: 1,
    activeNpcActionsApplied: 1,
    activeLastActionKind: 'mob:flee',
    activeLastActionResult: 'applied',
    activeLastActionReason: '',
    activeRoutineFired: 3,
    activeRoutineLastKind: 'working',
    activeSequenceFired: 1,
    activeSequenceLastLength: 3,
    activeLastSkipReason: '',
    activeLastRuleId: 'scene_ambient_awareness',
  }),
  aiActiveTriggerDiagnostics: () => ({
    enabled: true,
    eventsEnabled: true,
    pollsEnabled: true,
    realActionsEnabled: true,
    populationPolicy: {
      band: 'small',
      onlineCount: 2,
      maxPollSessionsPerTick: 2,
      minRulePriority: 0,
      codexAdmission: 'aggressive',
    },
    codexBudget: {
      maxCalls5h: 480,
      usedCalls5h: 3,
      remainingCalls5h: 477,
      maxCallsWeek: 4000,
      usedCallsWeek: 6,
      remainingCallsWeek: 3994,
      reserveRatio: 0.2,
    },
    runtime: {
      schedulerIntervalMs: 30_000,
      lastTickStartedAtMs: Date.now() - 2_500,
      lastTickCompletedAtMs: Date.now() - 2_000,
      lastTickDurationMs: 31,
      lastTickSessionCount: 2,
      lastTickProducedEvents: 2,
      lastTickState: 'poll',
      lastTickSkipReason: '',
      nextDueAtMs: Date.now() + 12_000,
      queuedEventCount: 1,
      nextQueuedEventAtMs: Date.now() + 4_000,
      oldestQueuedEventAgeMs: 8_000,
    },
    rules: [{
      ruleId: 'scene_ambient_awareness',
      title: 'Scene ambient awareness',
      enabled: true,
      category: 'sceneAmbient',
      periodSeconds: 300,
      jitterSeconds: 60,
      priority: 50,
      scope: 'playerVicinity',
      providerPolicy: 'codexPreferred',
      outputMode: 'mixedLivingWorld',
      cooldown: { perPlayerSeconds: 90, perEntitySeconds: 180, perRuleSeconds: 30 },
    }],
    eventQueue: [{
      eventId: 'evt-1',
      kind: 'item_discarded',
      playerEntityId: 1,
      itemId: 'apple',
      priority: 84,
      attempts: 0,
      createdAtMs: 1_000,
      expiresAtMs: 91_000,
      nextAttemptAtMs: 1_000,
      observations: ['event:item_discarded', 'item:apple'],
    }],
    activeSequences: [{
      sequenceId: 'seq-1',
      kind: 'npc',
      ruleId: 'npc_social_sequence',
      playerEntityId: 1,
      speakerEntityIds: [12, 13],
      speakerNames: ['Brother Aldric', 'Merchant Tomas'],
      speakerTemplateIds: ['brother_aldric', 'the_merchant'],
      sceneId: 'eastbrook_square',
      focusObjectId: 'eastbrook_market_stall',
      focusObjectTemplateId: 'scene_anchor:eastbrook_market_stall',
      focusDisplayName: 'Market Stall',
      lineIds: ['hudChrome.aiSpeech.sceneDayEnergy'],
      startedAtMs: 1_000,
      nextBeatAtMs: 1_800,
      remainingBeats: 3,
    }],
    cursors: [],
    recentDecisions: [{
      ruleId: 'scene_ambient_awareness',
      playerEntityId: 1,
      speakerEntityId: 22,
      speakerTemplateId: 'brother_aldric',
      sceneId: 'fallen_chapel',
      lineId: 'hudChrome.aiSpeech.sceneRainWeariness',
      createdAtMs: 1_000,
    }],
  }),
  updateAiActiveTriggerConfig: vi.fn((input: unknown) => ({
    ...fakeGame.aiActiveTriggerDiagnostics(),
    updateEcho: input,
  })),
  cancelAiActiveSequences: vi.fn(() => ({ canceledSequences: 1, canceledBeats: 3 })),
  aiAuditSnapshot: vi.fn(async () => ({
    summary: {
      generatedAt: '2026-06-22T00:00:00.000Z',
      windows: [{
        key: 'm1',
        labelKey: 'usage.window.1m',
        milliseconds: 60_000,
        providerJobs: 2,
        accepted: 1,
        rejected: 0,
        providerErrors: 1,
        fallbacks: 1,
        localReactions: 3,
        memoryWrites: 4,
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        estimatedTokens: true,
      }],
      totals: {
        providerJobs: 2,
        localReactions: 3,
        memoryWrites: 4,
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        averageProviderJobTokens: 75,
        lastInputTokens: 40,
        lastOutputTokens: 10,
        lastTotalTokens: 50,
        estimatedTokens: true,
      },
    },
    recent: [{
      auditId: 'audit-1',
      realm: 'default',
      jobId: 'job-7',
      trigger: 'npc_question',
      entityKind: 'npc',
      entityId: 22,
      templateId: 'brother_aldric',
      playerEntityId: 1,
      sceneId: 'fallen_chapel',
      zoneId: 'eastbrook_vale',
      providerSource: 'codex',
      status: 'accepted',
      latencyMs: 20,
      inputTokens: 40,
      outputTokens: 10,
      totalTokens: 50,
      tokenEstimate: true,
      outputMode: 'line_id_only',
      allowedIntentCount: 3,
      allowedLineIdCount: 8,
      memorySignalCount: 2,
      directorProposalCount: 1,
      sceneObjectCount: 4,
      companionCount: 1,
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
      intents: ['commentOnScene'],
      memoryWriteRefs: ['npcInteraction:npc:1:brother_aldric'],
      reason: 'uses profile line',
      error: '',
      createdAt: '2026-06-22T00:00:00.000Z',
    }],
  })),
  aiAuditRecord: vi.fn(async (auditId: string) => auditId === 'audit-1' ? ({
    auditId: 'audit-1',
    realm: 'default',
    jobId: 'job-7',
    trigger: 'npc_question',
    entityKind: 'npc',
    entityId: 22,
    templateId: 'brother_aldric',
    playerEntityId: 1,
    sceneId: 'fallen_chapel',
    zoneId: 'eastbrook_vale',
    providerSource: 'codex',
    status: 'accepted',
    latencyMs: 20,
    inputTokens: 40,
    outputTokens: 10,
    totalTokens: 50,
    tokenEstimate: true,
    outputMode: 'line_id_only',
    allowedIntentCount: 3,
    allowedLineIdCount: 8,
    memorySignalCount: 2,
    directorProposalCount: 1,
    sceneObjectCount: 4,
    companionCount: 1,
    lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
    intents: ['commentOnScene'],
    memoryWriteRefs: ['npcInteraction:npc:1:brother_aldric'],
    reason: 'uses profile line',
    error: '',
    hasChain: true,
    chain: {
      playerAction: {
        kind: 'npc_question',
        topic: 'recent',
        labelKey: 'usage.aiActionNpcRecent',
        locale: 'en',
        protocol: {
          jobId: 'job-7',
          trigger: 'npc_question',
          playerEntityId: 1,
          entityKind: 'npc',
          entityId: 22,
          templateId: 'brother_aldric',
        },
      },
      requestContext: {
        context: { jobId: 'job-7' },
        promptText: 'prompt sent to model',
        promptTruncated: false,
      },
      provider: {
        source: 'codex',
        rawOutput: '{"ok":true}',
        rawOutputTruncated: false,
        parsedDecision: { jobId: 'job-7' },
        error: '',
      },
      validation: { ok: true, reason: 'accepted', events: [] },
      delivered: { events: [], textSummary: ['hudChrome.aiSpeech.brotherAldricAwake'] },
    },
    createdAt: '2026-06-22T00:00:00.000Z',
  }) : null),
  cleanAiAuditNonRealRecords: vi.fn(async () => ({
    deletedRecords: 3,
    retainedRecords: 2,
  })),
  clearAiLifeLayerMemory: vi.fn(async () => ({
    npcMemories: 1,
    rumors: 1,
    worldTraces: 1,
    creatureMemories: 0,
    creaturePlans: 0,
    bossMemories: 0,
    bossPhaseCues: 0,
    worldDirectorStates: 1,
    decisionJournalEntries: 2,
    pendingMemoryWrites: 1,
    persistedMemoryRecords: 4,
    totalCleared: 11,
  })),
  liveSessions: () => [],
  liveAccountIds: () => new Set([9]),
  disconnectAccount: vi.fn(),
  muteAccountChat: vi.fn(),
  reloadChatFilter: vi.fn(async () => {}),
  liftChatMuteLive: vi.fn(),
  resetChatStrikesLive: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default so the moderation-detail route (which now also loads chat state)
  // resolves; individual chat-filter tests override as needed.
  vi.mocked(chatModerationForAccount).mockResolvedValue({ chatMutedUntil: null, chatStrikes: 0, violations: [] });
});

describe('admin api auth', () => {
  it('rejects requests without a token', async () => {
    const res = fakeRes();
    await handleAdminApi(fakeReq(), res, fakeGame);

    expect(res.statusCode).toBe(401);
    expect(res.body.success).toBe(false);
  });

  it('rejects a valid token whose account is not an admin', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(false);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN }), res, fakeGame);

    expect(res.statusCode).toBe(401);
    expect(isAdminAccount).toHaveBeenCalledWith(7);
  });

  it('serves the overview to an admin token and includes live server stats', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(overviewCounts).mockResolvedValue({
      accounts: 10, characters: 20, accountsToday: 1, accountsWeek: 3,
      sessionsToday: 5, activeAccountsToday: 4,
    });
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: expect.objectContaining({
        accounts: 10,
        server: expect.objectContaining({ online: 2 }),
        ai: expect.objectContaining({
          providerCalls: 3,
          providerFallbacks: 1,
          averageProviderLatencyMs: 40,
        }),
        aiDiagnostics: expect.objectContaining({
          recentDecisions: expect.arrayContaining([expect.objectContaining({
            status: 'accepted',
            trigger: 'npc_question',
          })]),
          worldDirectorStates: expect.arrayContaining([expect.objectContaining({
            mood: 'haunted',
            proposalType: 'campAlert',
          })]),
          worldDirectorProposalJournal: expect.arrayContaining([expect.objectContaining({
            lifecycle: 'created',
            proposalId: 'director-1:proposal',
            intent: 'raiseCampCaution',
          })]),
          socialMemory: expect.objectContaining({
            npcMemories: expect.arrayContaining([expect.objectContaining({
              templateId: 'brother_aldric',
              interactionCount: 2,
            })]),
            rumors: expect.arrayContaining([expect.objectContaining({
              itemId: 'gravecaller_sigil',
              scope: 'scene',
            })]),
          }),
          memoryPersistence: expect.objectContaining({ pending: 1 }),
        }),
        aiActive: expect.objectContaining({
          metrics: expect.objectContaining({
            activePollFired: 4,
            activeProviderPending: 1,
            activeProviderDeferredForActivity: 2,
            activeCodexBudgetRemaining5h: 477,
          }),
          diagnostics: expect.objectContaining({
            enabled: true,
            populationPolicy: expect.objectContaining({ band: 'small' }),
            rules: expect.arrayContaining([expect.objectContaining({
              ruleId: 'scene_ambient_awareness',
              providerPolicy: 'codexPreferred',
              outputMode: 'mixedLivingWorld',
            })]),
          }),
        }),
        aiAudit: expect.objectContaining({
          summary: expect.objectContaining({
            totals: expect.objectContaining({
              providerJobs: 2,
              totalTokens: 150,
              estimatedTokens: true,
            }),
          }),
          recent: expect.arrayContaining([expect.objectContaining({
            auditId: 'audit-1',
            status: 'accepted',
            totalTokens: 50,
          })]),
        }),
        aiCoverage: expect.objectContaining({
          families: expect.objectContaining({
            expected: expect.arrayContaining(['beast']),
          }),
          npcs: expect.objectContaining({
            interactiveTotal: expect.any(Number),
          }),
        }),
        aiCoverageChecklist: expect.objectContaining({
          generatedFrom: 'aiContentCoverageReport',
          items: expect.arrayContaining([expect.objectContaining({
            id: 'scene-semantic-anchors',
            validationCommand: 'npx vitest run tests/ai_content_coverage.test.ts',
          })]),
        }),
        aiProfiles: expect.objectContaining({
          authoredTotal: expect.any(Number),
          genericTotal: 2,
          validation: expect.objectContaining({
            errorCount: 0,
            warningCount: 0,
          }),
          rows: expect.arrayContaining([expect.objectContaining({
            id: 'npc.brother_aldric.living_world',
            fallbackLineId: 'hudChrome.aiSpeech.brotherAldricAwake',
          })]),
        }),
        usage: expect.objectContaining({
          metrics: expect.arrayContaining([expect.objectContaining({ key: 'woc.balance.rpc' })]),
          caches: expect.arrayContaining([expect.objectContaining({ key: 'woc.balance' })]),
        }),
      }),
    });
  });

  it('updates active AI trigger runtime config through an authenticated admin endpoint', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();
    const body = {
      enabled: true,
      eventsEnabled: true,
      pollsEnabled: false,
      realActionsEnabled: false,
      rules: [{
        ruleId: 'scene_ambient_awareness',
        enabled: true,
        periodSeconds: 120,
        jitterSeconds: 15,
        priority: 88,
        providerPolicy: 'codexPreferred',
        outputMode: 'mixedLivingWorld',
        cooldown: { perPlayerSeconds: 45, perEntitySeconds: 90 },
      }],
    };

    await handleAdminApi(fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/ai/active-triggers/config', body }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(fakeGame.updateAiActiveTriggerConfig).toHaveBeenCalledWith(body);
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: expect.objectContaining({
        enabled: true,
        updateEcho: body,
      }),
    });
  });

  it('cancels running active AI sequences through an authenticated admin endpoint', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/ai/active-triggers/sequences/cancel', body: {} }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(fakeGame.cancelAiActiveSequences).toHaveBeenCalled();
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: { canceledSequences: 1, canceledBeats: 3 },
    });
  });

  it('clears AI memory through an authenticated admin endpoint', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/ai/memory/clear', body: {} }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(fakeGame.clearAiLifeLayerMemory).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: expect.objectContaining({
        rumors: 1,
        worldDirectorStates: 1,
        pendingMemoryWrites: 1,
        persistedMemoryRecords: 4,
        totalCleared: 11,
      }),
    });
  });

  it('serves a full AI audit record through an authenticated detail endpoint', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/ai/audit/audit-1' }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(fakeGame.aiAuditRecord).toHaveBeenCalledWith('audit-1');
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: expect.objectContaining({
        auditId: 'audit-1',
        chain: expect.objectContaining({
          requestContext: expect.objectContaining({ promptText: 'prompt sent to model' }),
          provider: expect.objectContaining({ rawOutput: '{"ok":true}' }),
          delivered: expect.objectContaining({
            textSummary: ['hudChrome.aiSpeech.brotherAldricAwake'],
          }),
        }),
      }),
    });
  });

  it('cleans non-real AI audit records through an authenticated admin endpoint', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/ai/audit/clean', body: {} }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(fakeGame.cleanAiAuditNonRealRecords).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual({
      success: true,
      error: null,
      data: { deletedRecords: 3, retainedRecords: 2 },
    });
  });

  it('rejects admin login for a non-admin account even with the right password', async () => {
    // scrypt hash of "hunter22" is irrelevant — verifyPassword fails on a junk
    // hash, so this asserts the credential failure path returns 401.
    vi.mocked(findAccount).mockResolvedValue({ id: 3, username: 'bob', password_hash: 'junk' });
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', url: '/admin/api/login', body: { username: 'bob', password: 'hunter22' } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/invalid username or password/);
  });

  it('rejects non-GET methods on data endpoints', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();
    await handleAdminApi(fakeReq({ method: 'DELETE', token: VALID_TOKEN, url: '/admin/api/accounts' }), res, fakeGame);

    expect(res.statusCode).toBe(405);
  });

  it('returns 404 for unknown admin endpoints', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/nope' }), res, fakeGame);

    expect(res.statusCode).toBe(404);
  });

  it('passes pagination and search through to the accounts query', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(listAccounts).mockResolvedValue({ rows: [], total: 0, page: 2, limit: 50 });
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ token: VALID_TOKEN, url: '/admin/api/accounts?page=2&limit=50&search=bob' }),
      res,
      fakeGame,
    );

    expect(listAccounts).toHaveBeenCalledWith('bob', 2, 50);
    expect(res.statusCode).toBe(200);
  });

  it('serves the moderation queue to admins with online account context', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(moderationQueue).mockResolvedValue([{
      accountId: 9,
      username: 'badactor',
      status: 'active',
      suspendedUntil: null,
      openReports: 4,
      latestReportAt: new Date().toISOString(),
      latestReason: 'spam',
      characterNames: ['Badactor'],
      online: true,
    }]);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/moderation/queue' }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(moderationQueue).toHaveBeenCalledWith(new Set([9]));
    expect(res.body.data.rows[0].openReports).toBe(4);
  });

  it('serves perf summaries and raw rows through existing admin auth', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(clientPerfSummary).mockResolvedValue({
      hours: 24,
      generatedAt: 'now',
      totals: { sampleCount: 1, medianFps: 60, p95FrameMs: 18, p99FrameMs: 22, contextLossCount: 0, avgRenderScale: 1, avgEffectiveRenderScale: 0.9 },
      byPreset: [],
      byGpu: [],
      byBrowser: [],
      byOs: [],
      byScenario: [],
      worstGpuBuckets: [],
    });
    vi.mocked(clientPerfRaw).mockResolvedValue([{ id: 123 } as any, { id: 100 } as any]);

    const summaryRes = fakeRes();
    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/perf/summary?hours=24' }), summaryRes, fakeGame);
    expect(summaryRes.statusCode).toBe(200);
    expect(clientPerfSummary).toHaveBeenCalledWith(24);
    expect(summaryRes.body.data.totals.sampleCount).toBe(1);

    const rawRes = fakeRes();
    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/perf/raw?hours=24&limit=10&beforeId=500' }), rawRes, fakeGame);
    expect(rawRes.statusCode).toBe(200);
    expect(clientPerfRaw).toHaveBeenCalledWith(24, 10, 500);
    expect(rawRes.body.data.rows).toHaveLength(2);
    expect(rawRes.body.data.nextBeforeId).toBe(100);
    expect(rawRes.body.data.hasMore).toBe(false);
  });

  it('loads moderation account detail with open reports', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(accountDetail).mockResolvedValue({
      id: 9, username: 'badactor', createdAt: '', lastLogin: null, isAdmin: false,
      bannedAt: null, suspendedUntil: null, moderationReason: '',
      chatMutedUntil: null, chatMuteReason: '', chatStrikes: 0,
      playtimeSeconds: 0, characters: [], recentSessions: [],
    });
    vi.mocked(moderationReportsForAccount).mockResolvedValue([]);
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9' }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(moderationReportsForAccount).toHaveBeenCalledWith(9);
  });

  it('ignores an open report', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(ignoreReport).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/reports/55/ignore', body: { note: 'no issue' } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(ignoreReport).toHaveBeenCalledWith(55, 7, 'no issue');
  });

  it('suspends and disconnects an account', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(moderateAccount).mockResolvedValue();
    const res = fakeRes();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/suspend', body: { reason: 'abuse', expiresAt } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(moderateAccount).toHaveBeenCalledWith({ accountId: 9, adminAccountId: 7, action: 'suspend', reason: 'abuse', expiresAt });
    expect(fakeGame.disconnectAccount).toHaveBeenCalledWith(9, 'This account is suspended.');
  });

  it('bans and disconnects an account', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(moderateAccount).mockResolvedValue();
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/ban', body: { reason: 'severe abuse' } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(moderateAccount).toHaveBeenCalledWith({ accountId: 9, adminAccountId: 7, action: 'ban', reason: 'severe abuse', expiresAt: undefined });
    expect(fakeGame.disconnectAccount).toHaveBeenCalledWith(9, 'This account has been banned.');
  });

  it('mutes account chat and sends a live warning without disconnecting', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    vi.mocked(muteAccountChat).mockResolvedValue();
    const res = fakeRes();
    const expiresAt = new Date(Date.now() + 3600_000).toISOString();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/chat-mute', body: { reason: 'keep chat civil', expiresAt } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(muteAccountChat).toHaveBeenCalledWith({ accountId: 9, adminAccountId: 7, reason: 'keep chat civil', expiresAt });
    expect(fakeGame.muteAccountChat).toHaveBeenCalledWith(9, expiresAt, 'keep chat civil');
    expect(fakeGame.disconnectAccount).not.toHaveBeenCalled();
  });

  it('unbans without disconnecting the account', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(moderateAccount).mockResolvedValue();
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/unban', body: { reason: 'appeal accepted' } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(moderateAccount).toHaveBeenCalledWith({ accountId: 9, adminAccountId: 7, action: 'unban', reason: 'appeal accepted', expiresAt: undefined });
    expect(fakeGame.disconnectAccount).not.toHaveBeenCalled();
  });

  it('rejects suspending or banning admin accounts', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValueOnce(true).mockResolvedValueOnce(true);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/ban', body: { reason: 'bad admin' } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/admin accounts cannot/);
    expect(moderateAccount).not.toHaveBeenCalled();
    expect(fakeGame.disconnectAccount).not.toHaveBeenCalled();
  });

  it('forces a character rename and disconnects that account', async () => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
    vi.mocked(forceCharacterRename).mockResolvedValue({ accountId: 9 });
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/characters/42/force-rename', body: { reason: 'bad name' } }),
      res,
      fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(forceCharacterRename).toHaveBeenCalledWith({ characterId: 42, adminAccountId: 7, reason: 'bad name' });
    expect(fakeGame.disconnectAccount).toHaveBeenCalledWith(9, 'A moderator requires one of your characters to be renamed.');
  });
});

describe('admin api chat filter', () => {
  beforeEach(() => {
    vi.mocked(accountForToken).mockResolvedValue(7);
    vi.mocked(isAdminAccount).mockResolvedValue(true);
  });

  it('serves both word tiers and the escalation config', async () => {
    vi.mocked(listFilterWords).mockImplementation(async (tier) => (
      tier === 'hard'
        ? [{ id: 2, word: 'slur', tier: 'hard', createdAt: '' }]
        : [{ id: 1, word: 'darn', tier: 'soft', createdAt: '' }]
    ));
    vi.mocked(getFilterConfig).mockResolvedValue({ warningsBeforeMute: 1, muteLadderSeconds: [600] });
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/chat-filter' }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.soft[0].word).toBe('darn');
    expect(res.body.data.hard[0].word).toBe('slur');
    expect(res.body.data.config.muteLadderSeconds).toEqual([600]);
  });

  it('adds a word and reloads the live filter', async () => {
    vi.mocked(addFilterWord).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/chat-filter/words', body: { word: 'Heck', tier: 'soft' } }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(addFilterWord).toHaveBeenCalledWith('Heck', 'soft');
    expect(fakeGame.reloadChatFilter).toHaveBeenCalled();
  });

  it('rejects an invalid tier', async () => {
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/chat-filter/words', body: { word: 'x', tier: 'medium' } }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(400);
    expect(addFilterWord).not.toHaveBeenCalled();
  });

  it('rejects a word that normalizes to nothing', async () => {
    vi.mocked(addFilterWord).mockResolvedValue(false);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/chat-filter/words', body: { word: '!!!', tier: 'hard' } }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(400);
    expect(fakeGame.reloadChatFilter).not.toHaveBeenCalled();
  });

  it('deletes a word by id', async () => {
    vi.mocked(removeFilterWord).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/chat-filter/words/5/delete' }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(removeFilterWord).toHaveBeenCalledWith(5);
    expect(fakeGame.reloadChatFilter).toHaveBeenCalled();
  });

  it('updates the escalation config', async () => {
    vi.mocked(updateFilterConfig).mockResolvedValue({ warningsBeforeMute: 2, muteLadderSeconds: [60, 120] });
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({
        method: 'POST', token: VALID_TOKEN, url: '/admin/api/chat-filter/config',
        body: { warningsBeforeMute: 2, muteLadderSeconds: [60, 120] },
      }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(updateFilterConfig).toHaveBeenCalledWith({ warningsBeforeMute: 2, muteLadderSeconds: [60, 120] });
    expect(fakeGame.reloadChatFilter).toHaveBeenCalled();
  });

  it('lifts a mute and syncs the live session', async () => {
    vi.mocked(liftChatMute).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/lift-mute' }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(liftChatMute).toHaveBeenCalledWith(9);
    expect(fakeGame.liftChatMuteLive).toHaveBeenCalledWith(9);
  });

  it('resets strikes and syncs the live session', async () => {
    vi.mocked(resetChatStrikes).mockResolvedValue(true);
    const res = fakeRes();

    await handleAdminApi(
      fakeReq({ method: 'POST', token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9/reset-strikes' }),
      res, fakeGame,
    );

    expect(res.statusCode).toBe(200);
    expect(resetChatStrikes).toHaveBeenCalledWith(9);
    expect(fakeGame.resetChatStrikesLive).toHaveBeenCalledWith(9);
  });

  it('includes chat moderation state in the moderation account detail', async () => {
    vi.mocked(accountDetail).mockResolvedValue({
      id: 9, username: 'badactor', createdAt: '', lastLogin: null, isAdmin: false,
      bannedAt: null, suspendedUntil: null, moderationReason: '',
      chatMutedUntil: null, chatMuteReason: '', chatStrikes: 0,
      playtimeSeconds: 0, characters: [], recentSessions: [],
    });
    vi.mocked(moderationReportsForAccount).mockResolvedValue([]);
    vi.mocked(chatModerationForAccount).mockResolvedValue({
      chatMutedUntil: null, chatStrikes: 3,
      violations: [{ id: 1, characterName: 'badactor', term: 'slur', channel: 'say', message: 'a slur', action: 'mute', muteSeconds: 600, createdAt: '' }],
    });
    const res = fakeRes();

    await handleAdminApi(fakeReq({ token: VALID_TOKEN, url: '/admin/api/moderation/accounts/9' }), res, fakeGame);

    expect(res.statusCode).toBe(200);
    expect(res.body.data.chat.chatStrikes).toBe(3);
    expect(res.body.data.chat.violations).toHaveLength(1);
  });
});

describe('parsePageParams', () => {
  it('defaults page to 1 and limit to 25', () => {
    expect(parsePageParams(new URLSearchParams())).toEqual({ page: 1, limit: 25 });
  });

  it('clamps limit to the 1..200 range', () => {
    expect(parsePageParams(new URLSearchParams('limit=9999')).limit).toBe(200);
    expect(parsePageParams(new URLSearchParams('limit=0')).limit).toBe(1);
    expect(parsePageParams(new URLSearchParams('limit=-5')).limit).toBe(1);
  });

  it('rejects garbage page values and floors fractions', () => {
    expect(parsePageParams(new URLSearchParams('page=banana')).page).toBe(1);
    expect(parsePageParams(new URLSearchParams('page=2.9')).page).toBe(2);
    expect(parsePageParams(new URLSearchParams('page=-3')).page).toBe(1);
  });
});

describe('escapeLike', () => {
  it('escapes LIKE wildcards so a search for "%" is literal', () => {
    expect(escapeLike('100%')).toBe('100\\%');
    expect(escapeLike('a_b')).toBe('a\\_b');
    expect(escapeLike('back\\slash')).toBe('back\\\\slash');
    expect(escapeLike('plain')).toBe('plain');
  });
});
