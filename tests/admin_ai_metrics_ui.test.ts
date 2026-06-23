import { describe, expect, it } from 'vitest';
import { renderAiAuditRecordDetail, renderAiLifeLayerMetrics } from '../src/admin/tables';
import { setAdminLanguage } from '../src/admin/i18n';
import type {
  AiActiveTriggerAdminSnapshot,
  AiAuditSnapshot,
  AiContentCoverageReport, AiContentReviewChecklist, AiLifeLayerDiagnosticsSnapshot, AiLifeLayerMetricsSnapshot,
  AiProfilePreviewReport,
} from '../src/admin/types';

function metrics(overrides: Partial<AiLifeLayerMetricsSnapshot> = {}): AiLifeLayerMetricsSnapshot {
  return {
    providerCalls: 0,
    providerSuccesses: 0,
    providerErrors: 0,
    providerFallbacks: 0,
    acceptedDecisions: 0,
    rejectedDecisions: 0,
    localReactions: 0,
    generatedEvents: 0,
    memoryWritesQueued: 0,
    memoryFlushFailures: 0,
    memoryPruneRuns: 0,
    memoryPruneDeleted: 0,
    memoryPruneFailures: 0,
    lastMemoryPruneDeleted: 0,
    memoryBudgetRuns: 0,
    memoryBudgetDeleted: 0,
    memoryBudgetFailures: 0,
    lastMemoryBudgetDeleted: 0,
    totalProviderLatencyMs: 0,
    averageProviderLatencyMs: 0,
    maxProviderLatencyMs: 0,
    lastProviderLatencyMs: 0,
    providerLatencySampleCount: 0,
    providerLatencyP50Ms: 0,
    providerLatencyP90Ms: 0,
    providerLatencyP95Ms: 0,
    lastPromptChars: 0,
    lastRawOutputChars: 0,
    speechPolish: {
      processed: 0,
      changed: 0,
      charsTrimmed: 0,
      lastChanged: false,
      lastFingerprintSource: 'none',
      lastBeforeChars: 0,
      lastAfterChars: 0,
    },
    ...overrides,
  };
}

type CoverageOverrides = {
  families?: Partial<AiContentCoverageReport['families']>;
  npcs?: Partial<AiContentCoverageReport['npcs']>;
  scenes?: Partial<AiContentCoverageReport['scenes']>;
  items?: Partial<AiContentCoverageReport['items']>;
  lineIds?: Partial<AiContentCoverageReport['lineIds']>;
};

function coverage(overrides: CoverageOverrides = {}): AiContentCoverageReport {
  const base: AiContentCoverageReport = {
    families: {
      expected: ['beast', 'undead'],
      inContent: ['beast', 'undead'],
      missingSemantics: [],
      semanticsWithoutContent: [],
      familiesMissingDepth: [],
      familiesWithInvalidMoodBias: [],
      templateCountByFamily: { beast: 4, undead: 2 },
    },
    npcs: {
      interactiveTotal: 3,
      authoredProfileTotal: 3,
      missingInteractiveProfiles: [],
      authoredNpcProfilesMissingSceneAffinities: [],
      authoredNpcProfilesMissingItemInterest: [],
      authoredNpcProfilesMissingTimeWeatherSensitivity: [],
      authoredNpcProfilesWithThinMemory: [],
    },
    scenes: {
      anchorTotal: 4,
      semanticObjectTotal: 9,
      anchorsMissingSemanticObjects: [],
      anchorsMissingTags: [],
      anchorsMissingTagDepth: [],
      semanticObjectsMissingTags: [],
      semanticObjectsMissingTagDepth: [],
      semanticObjectsMissingFeatureTags: [],
      semanticObjectsMissingAffordanceTags: [],
      semanticObjectsMissingAnchorOverlap: [],
    },
    items: {
      requiredTotal: 2,
      discardableTotal: 12,
      missingRequiredItems: [],
      requiredItemsMissingSignals: [],
      discardableItemsMissingSignals: [],
      importantItemsMissingSignals: [],
    },
    lineIds: {
      referenced: ['hudChrome.aiSpeech.genericNpcAwake'],
    },
  };
  return {
    ...base,
    ...overrides,
    families: { ...base.families, ...overrides.families },
    npcs: { ...base.npcs, ...overrides.npcs },
    scenes: { ...base.scenes, ...overrides.scenes },
    items: { ...base.items, ...overrides.items },
    lineIds: { ...base.lineIds, ...overrides.lineIds },
  };
}

function diagnostics(overrides: Partial<AiLifeLayerDiagnosticsSnapshot> = {}): AiLifeLayerDiagnosticsSnapshot {
  return {
    recentDecisions: [{
      sequence: 3,
      jobId: 'job-3',
      trigger: 'npc_question',
      entityId: 12,
      templateId: 'brother_aldric',
      playerEntityId: 1,
      status: 'provider_error',
      reason: 'codex <offline>',
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
      intents: ['commentOnScene'],
      sceneId: 'fallen_chapel',
      memoryWrites: [{
        kind: 'npcInteraction',
        refId: 'npc:12:brother_aldric',
        scope: 'entity',
        sourcePlayerEntityId: 1,
        lineIds: ['hudChrome.aiSpeech.brotherAldricAwake'],
        salience: 0.7,
        reason: 'opened gossip',
      }],
    }],
    worldDirectorStates: [{
      stateId: 'director-1',
      sceneId: 'fallen_chapel',
      zoneId: 'eastbrook_vale',
      mood: 'haunted',
      proposalType: 'campAlert',
      sourcePlayerEntityId: 1,
      sourceRef: 'trace-1',
      itemId: 'gravecaller_sigil<script>',
      subjectKind: 'item',
      lineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
      heat: 0.75,
      createdAt: 10,
      updatedAt: 12,
      expiresAt: 120,
      evidence: ['trace:cursed<script>'],
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
      targetRef: 'gravecaller_sigil<script>',
      sceneId: 'fallen_chapel<script>',
      zoneId: 'eastbrook_vale<script>',
      intent: 'raiseCampCaution<script>',
      status: 'preview',
      risk: 'low',
      intensity: 0.75,
      suggestedLineId: 'hudChrome.aiSpeech.worldDirectorHaunted',
      expiresAt: 120,
      reasonTags: ['mood:haunted<script>'],
      safetyNotes: ['presentationOnly<script>'],
    }],
    socialMemory: {
      npcMemories: [{
        playerEntityId: 1,
        playerName: 'Alice<script>',
        templateId: 'brother_aldric<script>',
        interactionCount: 3,
        affinity: 0.24,
        lastInteractionAt: 12,
        sceneIds: ['fallen_chapel<script>'],
      }],
      rumors: [{
        rumorId: 'rumor-1',
        sceneId: 'fallen_chapel<script>',
        originSceneId: 'fallen_chapel<script>',
        zoneId: 'eastbrook_vale<script>',
        itemId: 'gravecaller_sigil<script>',
        subjectKind: 'item',
        sourcePlayerEntityId: 1,
        lineIds: ['hudChrome.aiSpeech.itemInterestAvoid<script>'],
        strength: 0.8,
        scope: 'scene<script>',
        createdAt: 10,
        expiresAt: 100,
      }],
    },
    memoryPersistence: {
      pending: 2,
      flushing: true,
      pruning: false,
      budgeting: false,
      lastPruneDeleted: 0,
      lastBudgetDeleted: 0,
      budget: {
        maxTotalRecords: 250_000,
        maxRecordsPerPlayer: 20_000,
        maxRecordsPerKind: { rumor: 55_000 },
        batchSize: 2_000,
      },
      errors: ['db <offline>'],
    },
    ...overrides,
  };
}

function coverageChecklist(overrides: Partial<AiContentReviewChecklist> = {}): AiContentReviewChecklist {
  const base: AiContentReviewChecklist = {
    status: 'needs_attention',
    generatedFrom: 'aiContentCoverageReport',
    items: [{
      id: 'scene-semantic-anchors',
      label: 'Scene semantic anchors',
      status: 'needs_attention',
      issueCount: 2,
      examples: ['thinFeatureTags:fallen_chapel:grave_brazier', 'thinAffordanceTags:fallen_chapel:grave_brazier'],
      reviewPrompt: 'Verify tags, featureTags, affordanceTags, anchor overlap, danger cues, and time or weather readability.',
      validationCommand: 'npx vitest run tests/ai_content_coverage.test.ts',
    }],
    validationCommands: ['npx vitest run tests/ai_content_coverage.test.ts'],
  };
  return {
    ...base,
    ...overrides,
    items: overrides.items ?? base.items,
    validationCommands: overrides.validationCommands ?? base.validationCommands,
  };
}

function activeTriggers(overrides: Partial<AiActiveTriggerAdminSnapshot> = {}): AiActiveTriggerAdminSnapshot {
  const base: AiActiveTriggerAdminSnapshot = {
    metrics: {
      activePollDue: 4,
      activePollSkipped: 1,
      activePollFired: 2,
      activeEventQueued: 3,
      activeEventSkipped: 0,
      activeEventFired: 1,
      activeEventExpired: 0,
      activeCandidatesScanned: 9,
      activeCandidatesSelected: 3,
      activeProviderCalls: 2,
      activeLocalReactions: 5,
      activeNoiseSuppressions: 1,
      activeSchedulerOnlineCount: 2,
      activeSchedulerSessionsConsidered: 2,
      activeSchedulerSessionsSuppressed: 0,
      activeSchedulerLastBand: 'small',
      activeCodexBudgetDenied: 0,
      activeCodexBudgetRemaining5h: 477,
      activeCodexBudgetRemainingWeek: 3994,
      activeProviderJobs: 2,
      activeProviderSuccesses: 1,
      activeProviderErrors: 1,
      activeProviderRejected: 0,
      activeProviderFallbacks: 1,
      activeProviderPending: 1,
      activeLastProviderLatencyMs: 923,
      activeLastProviderTimings: {
        provider: 'codex-app-server',
        totalMs: 923,
        steps: [
          { key: 'queueWaitMs', label: 'queue', ms: 123 },
          { key: 'turnCompleteMs', label: 'turn', ms: 700 },
          { key: 'parseOutputMs', label: 'parse', ms: 100 },
        ],
      },
      activeActionsAttempted: 3,
      activeActionsApplied: 2,
      activeActionsRejected: 1,
      activeMobActionsApplied: 1,
      activeNpcActionsApplied: 1,
      activeLastActionKind: 'mob:flee',
      activeLastActionResult: 'applied',
      activeLastActionReason: '',
      activeRoutineFired: 1,
      activeRoutineLastKind: 'working',
      activeSequenceFired: 1,
      activeSequenceLastLength: 3,
      activeLastSkipReason: '',
      activeLastRuleId: 'scene_ambient_awareness',
    },
    diagnostics: {
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
        lastTickDurationMs: 28,
        lastTickSessionCount: 2,
        lastTickProducedEvents: 2,
        lastTickState: 'poll',
        lastTickSkipReason: '',
        nextDueAtMs: Date.now() + 15_000,
        queuedEventCount: 1,
        nextQueuedEventAtMs: Date.now() + 5_000,
        oldestQueuedEventAgeMs: 9_000,
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
        sequenceId: 'seq-1<script>',
        kind: 'creature',
        family: 'murloc',
        ruleId: 'npc_social_sequence',
        playerEntityId: 1,
        speakerEntityIds: [22, 23],
        speakerNames: ['Mudfin Oracle<script>', 'Mudfin Scout'],
        speakerTemplateIds: ['mudfin_murloc<script>', 'mudfin_murloc'],
        sceneId: 'mirror_lake',
        focusObjectId: 'eastbrook_market_stall<script>',
        focusObjectTemplateId: 'scene_anchor:eastbrook_market_stall',
        focusDisplayName: 'Market stall <danger>',
        lineIds: ['hudChrome.aiSpeech.familySceneBeastUneasy<script>'],
        startedAtMs: 1_000,
        nextBeatAtMs: 1_800,
        remainingBeats: 3,
      }],
      cursors: [],
      recentDecisions: [{
        ruleId: 'scene_ambient_awareness',
        playerEntityId: 1,
        speakerEntityId: 12,
        speakerTemplateId: 'brother_aldric',
        sceneId: 'fallen_chapel',
        lineId: 'hudChrome.aiSpeech.sceneRainWeariness',
        createdAtMs: 1_000,
      }],
    },
  };
  return {
    ...base,
    ...overrides,
    metrics: { ...base.metrics, ...overrides.metrics },
    diagnostics: { ...base.diagnostics, ...overrides.diagnostics },
  };
}

function profiles(overrides: Partial<AiProfilePreviewReport> = {}): AiProfilePreviewReport {
  const base: AiProfilePreviewReport = {
    authoredTotal: 1,
    genericTotal: 2,
    limit: 64,
    truncated: false,
    validation: {
      totalIssues: 0,
      errorCount: 0,
      warningCount: 0,
      limit: 48,
      truncated: false,
      issues: [],
    },
    rows: [{
      id: 'npc.brother_aldric.living_world',
      appliesTo: [{ kind: 'npc', templateId: 'brother_aldric' }],
      personaExcerpt: 'A worried priest who reads weather, graves, and player choices as omens.',
      canonSensitive: true,
      fallbackLineId: 'hudChrome.aiSpeech.brotherAldricAwake',
      allowedIntentTypes: ['commentOnScene', 'questHint'],
      allowedLineIdCount: 1,
      knowledgeScopeCount: 5,
      tabooTopicCount: 3,
      socialMemoryLineIds: ['hudChrome.aiSpeech.memoryPriestRecognizesPlayer'],
      sceneAffinities: { likes: 4, avoids: 2, comments: 4 },
      itemInterest: { attracted: 5, avoids: 2 },
      hasTimeWeatherSensitivity: true,
      companionReactionCount: 1,
      missingAuthoringFields: [],
    }],
  };
  return { ...base, ...overrides };
}

function audit(overrides: Partial<AiAuditSnapshot> = {}): AiAuditSnapshot {
  const base: AiAuditSnapshot = {
    summary: {
      generatedAt: '2026-06-22T00:00:00.000Z',
      windows: [
        {
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
        },
        {
          key: 'm5',
          labelKey: 'usage.window.5m',
          milliseconds: 300_000,
          providerJobs: 3,
          accepted: 2,
          rejected: 1,
          providerErrors: 1,
          fallbacks: 1,
          localReactions: 5,
          memoryWrites: 7,
          inputTokens: 240,
          outputTokens: 60,
          totalTokens: 300,
          estimatedTokens: true,
        },
      ],
      totals: {
        providerJobs: 3,
        localReactions: 5,
        memoryWrites: 7,
        inputTokens: 240,
        outputTokens: 60,
        totalTokens: 300,
        averageProviderJobTokens: 100,
        lastInputTokens: 80,
        lastOutputTokens: 20,
        lastTotalTokens: 100,
        estimatedTokens: true,
      },
    },
    recent: [{
      auditId: 'audit-1',
      realm: 'default',
      jobId: 'job-1',
      trigger: 'npc_question',
      entityKind: 'npc',
      entityId: 22,
      templateId: 'brother_aldric<script>',
      playerEntityId: 1,
      sceneId: 'fallen_chapel<script>',
      zoneId: 'eastbrook_vale<script>',
      providerSource: 'codex<script>',
      status: 'provider_error',
      latencyMs: 42,
      inputTokens: 80,
      outputTokens: 20,
      totalTokens: 100,
      tokenEstimate: true,
      promptChars: 0,
      rawOutputChars: 0,
      outputMode: 'line_id_only',
      allowedIntentCount: 3,
      allowedLineIdCount: 8,
      memorySignalCount: 2,
      directorProposalCount: 1,
      sceneObjectCount: 4,
      companionCount: 1,
      lineIds: ['hudChrome.aiSpeech.brotherAldricAwake<script>'],
      intents: ['commentOnScene<script>'],
      memoryWriteRefs: ['npcInteraction:npc:1:brother_aldric<script>'],
      reason: 'fallback reason <script>',
      error: 'provider <offline>',
      createdAt: '2026-06-22T00:00:00.000Z',
    }],
  };
  return {
    ...base,
    ...overrides,
    summary: { ...base.summary, ...overrides.summary },
    recent: overrides.recent ?? base.recent,
  };
}

describe('admin AI life layer metrics renderer', () => {
  it('shows a healthy status when provider and memory errors are clear', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics({
      providerCalls: 4,
      providerSuccesses: 4,
      acceptedDecisions: 3,
      generatedEvents: 6,
      averageProviderLatencyMs: 12.4,
      providerLatencySampleCount: 7,
      providerLatencyP50Ms: 10,
      providerLatencyP90Ms: 25,
      providerLatencyP95Ms: 31,
      lastPromptChars: 4321,
      lastRawOutputChars: 678,
      speechPolish: {
        processed: 5,
        changed: 3,
        charsTrimmed: 29,
        lastChanged: true,
        lastLocale: 'zh_CN',
        lastFingerprintSource: 'profile',
        lastBefore: '不过，码头那边刚转了风，而且水面碎得不太自然。',
        lastAfter: '码头那边刚转了风，水面碎得不太自然。',
        lastBeforeChars: 24,
        lastAfterChars: 20,
      },
      lastProviderTimings: {
        provider: 'codex-app-server',
        totalMs: 1456,
        steps: [
          { key: 'startupWaitMs', label: 'wait <unsafe>', ms: 8 },
          { key: 'turnCompleteMs', label: 'model turn', ms: 1410 },
        ],
      },
    }));

    expect(html).toContain('healthy');
    expect(html).toContain('Provider calls');
    expect(html).toContain('Average provider latency');
    expect(html).toContain('12 ms');
    expect(html).toContain('Provider latency P50');
    expect(html).toContain('Provider latency P90');
    expect(html).toContain('Provider latency P95');
    expect(html).toContain('31 ms');
    expect(html).toContain('Last prompt length');
    expect(html).toContain('4,321 chars');
    expect(html).toContain('Last raw output length');
    expect(html).toContain('678 chars');
    expect(html).toContain('Speech polish changed / checked');
    expect(html).toContain('3 / 5');
    expect(html).toContain('Dynamic speech polish');
    expect(html).toContain('Fingerprint source');
    expect(html).toContain('NPC profile');
    expect(html).toContain('Before polish');
    expect(html).toContain('Delivered text');
    expect(html).toContain('不过，码头那边刚转了风，而且水面碎得不太自然。');
    expect(html).toContain('码头那边刚转了风，水面碎得不太自然。');
    expect(html).toContain('Last provider timing');
    expect(html).toContain('Codex app-server');
    expect(html).toContain('1,456 ms');
    expect(html).toContain('Slowest: Model turn completion / 1,410 ms');
    expect(html).not.toContain('wait <unsafe>');
  });

  it('surfaces provider and memory failures without exposing raw HTML', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics({
      providerCalls: 3,
      providerErrors: 1,
      providerFallbacks: 1,
      memoryFlushFailures: 1,
      memoryPruneFailures: 1,
      memoryBudgetFailures: 1,
      lastProviderError: '<script>alert(1)</script>',
      lastMemoryPersistenceError: 'db <offline>',
      lastMemoryPruneError: 'prune <offline>',
      lastMemoryBudgetError: 'budget <offline>',
    }));

    expect(html).toContain('needs attention');
    expect(html).toContain('Legacy fallback decisions');
    expect(html).toContain('Memory prune failures');
    expect(html).toContain('Memory budget failures');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('db &lt;offline&gt;');
    expect(html).toContain('prune &lt;offline&gt;');
    expect(html).toContain('budget &lt;offline&gt;');
    expect(html).not.toContain('<script>alert(1)</script>');
  });

  it('shows AI content coverage gaps and escapes authored ids', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage({
      families: { missingSemantics: ['void<script>'], semanticsWithoutContent: ['astral<orphan>'] },
      npcs: { missingInteractiveProfiles: ['aldric<bad>'] },
      scenes: {
        semanticObjectsMissingFeatureTags: ['fallen_chapel:grave_brazier<script>'],
        semanticObjectsMissingAffordanceTags: ['fallen_chapel:grave_brazier<move>'],
      },
      items: { importantItemsMissingSignals: ['gravecaller_sigil'] },
    }), undefined, undefined, undefined, undefined, 'coverage', null, coverageChecklist());

    expect(html).toContain('AI content coverage');
    expect(html).toContain('gaps');
    expect(html).toContain('Interactive NPCs missing profiles');
    expect(html).toContain('Semantic objects missing feature tags');
    expect(html).toContain('Semantic objects missing affordance tags');
    expect(html).toContain('Content review checklist');
    expect(html).toContain('Scene semantic anchors');
    expect(html).toContain('needs attention');
    expect(html).toContain('Review prompt');
    expect(html).toContain('thinFeatureTags:fallen_chapel:grave_brazier');
    expect(html).toContain('npx vitest run tests/ai_content_coverage.test.ts');
    expect(html).toContain('void&lt;script&gt;');
    expect(html).toContain('Family semantics without mob templates');
    expect(html).toContain('astral&lt;orphan&gt;');
    expect(html).toContain('aldric&lt;bad&gt;');
    expect(html).toContain('fallen_chapel:grave_brazier&lt;script&gt;');
    expect(html).toContain('fallen_chapel:grave_brazier&lt;move&gt;');
    expect(html).not.toContain('aldric<bad>');
  });

  it('localizes the coverage checklist in Simplified Chinese', () => {
    setAdminLanguage('zh_CN');
    const html = renderAiLifeLayerMetrics(metrics(), coverage({
      scenes: {
        semanticObjectsMissingFeatureTags: ['fallen_chapel:grave_brazier'],
        semanticObjectsMissingAffordanceTags: ['fallen_chapel:grave_brazier'],
      },
    }), undefined, undefined, undefined, undefined, 'coverage', null, coverageChecklist());

    expect(html).toContain('AI 内容覆盖');
    expect(html).toContain('缺少特征标签的语义物件');
    expect(html).toContain('缺少可交互倾向标签的语义物件');
    expect(html).toContain('内容审查清单');
    expect(html).toContain('场景语义锚点');
    expect(html).toContain('需关注');
    expect(html).toContain('审查提示');
    expect(html).toContain('核对 tags、featureTags、affordanceTags');
    expect(html).not.toContain('Content review checklist');
  });

  it('shows AI decision diagnostics and escapes audit values', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics({
      recentDecisions: [{
        ...diagnostics().recentDecisions[0],
        templateId: 'npc<script>',
        lineIds: ['hudChrome.aiSpeech.line<script>'],
      }],
    }));

    expect(html).toContain('AI decision diagnostics');
    expect(html).toContain('Memory prune');
    expect(html).toContain('Memory budget');
    expect(html).toContain('Last pruned');
    expect(html).toContain('Last budget trim');
    expect(html).toContain('Total memory cap');
    expect(html).toContain('250,000');
    expect(html).toContain('Per-player cap');
    expect(html).toContain('20,000');
    expect(html).toContain('provider error');
    expect(html).toContain('NPC question');
    expect(html).toContain('camp alert');
    expect(html).toContain('Proposal journal');
    expect(html).toContain('created');
    expect(html).toContain('raiseCampCaution&lt;script&gt;');
    expect(html).toContain('mood:haunted&lt;script&gt;');
    expect(html).toContain('presentationOnly&lt;script&gt;');
    expect(html).toContain('Clear AI memory');
    expect(html).toContain('Clears volatile AI overlay and persisted AI memory audit for this realm only.');
    expect(html).toContain('NPC memories');
    expect(html).toContain('Rumors');
    expect(html).toContain('Alice&lt;script&gt;');
    expect(html).toContain('fallen_chapel&lt;script&gt;');
    expect(html).toContain('hudChrome.aiSpeech.itemInterestAvoid&lt;script&gt;');
    expect(html).toContain('db &lt;offline&gt;');
    expect(html).toContain('npc&lt;script&gt;');
    expect(html).toContain('hudChrome.aiSpeech.line&lt;script&gt;');
    expect(html).toContain('gravecaller_sigil&lt;script&gt;');
    expect(html).toContain('trace:cursed&lt;script&gt;');
    expect(html).not.toContain('npc<script>');
    expect(html).not.toContain('db <offline>');
    expect(html).not.toContain('Alice<script>');
    expect(html).not.toContain('raiseCampCaution<script>');
  });

  it('shows editable active AI trigger controls and escapes rule values', () => {
    setAdminLanguage('en');
    const active = activeTriggers();
    active.diagnostics.rules = [{
      ...active.diagnostics.rules[0],
      title: 'Scene <ambient>',
      ruleId: 'scene_ambient_awareness<script>',
    }];
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics(), profiles(), audit(), active, 'active');

    expect(html).toContain('Active AI');
    expect(html).toContain('Runtime switches');
    expect(html).toContain('Real actions');
    expect(html).toContain('Actions applied / rejected');
    expect(html).toContain('Last real action');
    expect(html).toContain('mob:flee / applied');
    expect(html).toContain('Runtime health');
    expect(html).toContain('Scheduler state');
    expect(html).toContain('Scheduler interval');
    expect(html).toContain('Last idle reason');
    expect(html).toContain('The last scheduler pass produced 2 player-visible AI events.');
    expect(html).toContain('Provider timing breakdown');
    expect(html).toContain('Last active latency: 923 ms');
    expect(html).toContain('scene_ambient_awareness');
    expect(html).toContain('Share');
    expect(html).toContain('75.8%');
    expect(html).toContain('Polling rules');
    expect(html).toContain('Codex preferred');
    expect(html).toContain('Mixed living world');
    expect(html).toContain('Recent active decisions');
    expect(html).toContain('Queued active events');
    expect(html).toContain('Running active sequences');
    expect(html).toContain('Cancel running sequences');
    expect(html).toContain('data-cancel-ai-active-sequences');
    expect(html).toContain('data-save-ai-active-global');
    expect(html).toContain('data-ai-active-global-field="realActionsEnabled"');
    expect(html).toContain('data-save-ai-active-rule');
    expect(html).toContain('Scene &lt;ambient&gt;');
    expect(html).toContain('scene_ambient_awareness&lt;script&gt;');
    expect(html).toContain('seq-1&lt;script&gt;');
    expect(html).toContain('Mudfin Oracle&lt;script&gt;');
    expect(html).toContain('mudfin_murloc&lt;script&gt;');
    expect(html).toContain('Market stall &lt;danger&gt;');
    expect(html).toContain('scene_anchor:eastbrook_market_stall');
    expect(html).toContain('eastbrook_market_stall&lt;script&gt;');
    expect(html).toContain('hudChrome.aiSpeech.familySceneBeastUneasy&lt;script&gt;');
    expect(html).not.toContain('Scene <ambient>');
    expect(html).not.toContain('scene_ambient_awareness<script>');
    expect(html).not.toContain('seq-1<script>');
    expect(html).not.toContain('Mudfin Oracle<script>');
    expect(html).not.toContain('mudfin_murloc<script>');
    expect(html).not.toContain('Market stall <danger>');
    expect(html).not.toContain('scene_anchor:eastbrook_market_stall<script>');
    expect(html).not.toContain('eastbrook_market_stall<script>');
  });

  it('localizes active AI trigger controls in Simplified Chinese', () => {
    setAdminLanguage('zh_CN');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics(), profiles(), audit(), activeTriggers(), 'active');

    expect(html).toContain('主动 AI');
    expect(html).toContain('运行时开关');
    expect(html).toContain('真实动作');
    expect(html).toContain('真实动作应用 / 拒绝');
    expect(html).toContain('最近真实动作');
    expect(html).toContain('mob:flee / 已应用');
    expect(html).toContain('运行态健康');
    expect(html).toContain('调度器状态');
    expect(html).toContain('调度周期');
    expect(html).toContain('最近空转原因');
    expect(html).toContain('最近一次调度产生了 2 个对玩家可见的 AI 事件。');
    expect(html).toContain('提供商耗时拆解');
    expect(html).toContain('最近主动延迟: 923 毫秒');
    expect(html).toContain('占比');
    expect(html).toContain('75.8%');
    expect(html).toContain('轮询规则');
    expect(html).toContain('优先 Codex');
    expect(html).toContain('混合生活世界');
    expect(html).toContain('近期主动决策');
    expect(html).toContain('排队中的主动事件');
    expect(html).toContain('进行中的主动序列');
    expect(html).toContain('取消进行中序列');
    expect(html).toContain('关注点');
    expect(html).toContain('剩余节拍');
    expect(html).toContain('少量在线');
    expect(html).toContain('文本润色改动 / 检查次数');
    expect(html).toContain('动态文本润色');
    expect(html).not.toContain('Active AI');
  });

  it('shows AI profile previews and escapes authored profile values', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics(), profiles({
      rows: [{
        ...profiles().rows[0],
        id: 'npc.<script>.living_world',
        appliesTo: [{ kind: 'npc', templateId: 'aldric<script>' }],
        personaExcerpt: 'Persona with <danger>',
        fallbackLineId: 'hudChrome.aiSpeech.bad<script>',
        missingAuthoringFields: ['sceneAffinities<script>'],
      }],
    }));

    expect(html).toContain('AI profile preview');
    expect(html).toContain('Profile authoring validation passed.');
    expect(html).toContain('canon sensitive');
    expect(html).toContain('NPC: aldric&lt;script&gt;');
    expect(html).toContain('npc.&lt;script&gt;.living_world');
    expect(html).toContain('Persona with &lt;danger&gt;');
    expect(html).toContain('hudChrome.aiSpeech.bad&lt;script&gt;');
    expect(html).toContain('sceneAffinities&lt;script&gt;');
    expect(html).not.toContain('aldric<script>');
    expect(html).not.toContain('Persona with <danger>');
  });

  it('localizes known AI profile preview names, targets, and personas in Simplified Chinese', () => {
    setAdminLanguage('zh_CN');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics(), profiles());

    expect(html).toContain('奥德里克修士活世界画像');
    expect(html).toContain('ID: npc.brother_aldric.living_world');
    expect(html).toContain('NPC: 奥德里克修士 (brother_aldric)');
    expect(html).toContain('忧心的牧师，会把天气、坟墓和玩家的选择都读作征兆。');
    expect(html).toContain('记忆预算');
    expect(html).toContain('总记忆上限');
    expect(html).not.toContain('A worried priest who reads weather');
  });

  it('localizes known AI audit card ids, topics, triggers, and summaries in Simplified Chinese', () => {
    setAdminLanguage('zh_CN');
    const cleanAudit = audit({
      recent: [
        {
          ...audit().recent[0],
          auditId: 'audit-clean-1',
          jobId: 'job-clean-1',
          trigger: 'npc_question',
          entityId: 8,
          templateId: 'foreman_odell',
          sceneId: 'eastbrook_vale',
          zoneId: 'eastbrook_vale',
          providerSource: 'codex',
          status: 'accepted',
          latencyMs: 27_765,
          deliveredSummary: ['Line-id-only response using the single allowed Foreman Odell line; acknowledges the mine rumor.'],
          playerAction: {
            kind: 'npc_question',
            topic: 'rumor',
            labelKey: 'usage.aiActionNpcRumor',
            locale: 'zh_CN',
            protocol: {
              jobId: 'job-clean-1',
              trigger: 'npc_question',
              playerEntityId: 1,
              entityKind: 'npc',
              entityId: 8,
              templateId: 'foreman_odell',
            },
          },
        },
        {
          ...audit().recent[0],
          auditId: 'audit-clean-2',
          jobId: 'job-clean-2',
          trigger: 'npc_question',
          entityId: 4,
          templateId: 'apothecary_lin',
          sceneId: 'eastbrook_vale',
          zoneId: 'eastbrook_vale',
          providerSource: 'codex',
          status: 'accepted',
          latencyMs: 21_782,
          deliveredSummary: ['thinking:Apothecary Lin:1475'],
          playerAction: undefined,
        },
      ],
    });
    const html = renderAiLifeLayerMetrics(metrics(), undefined, undefined, undefined, cleanAudit);

    expect(html).toContain('询问传闻');
    expect(html).toContain('话题：传闻');
    expect(html).toContain('NPC: 奥德尔工头 #8');
    expect(html).toContain('东溪谷 / 东溪谷');
    expect(html).toContain('Codex CLI 推理');
    expect(html).toContain('使用允许的台词模板返回，并记录了最终发送摘要。');
    expect(html).toContain('NPC 提问');
    expect(html).toContain('触发：NPC 提问');
    expect(html).toContain('NPC: 林药剂师 #4');
    expect(html).toContain('林药剂师 思考了 1,475 毫秒后回复。');
    expect(html).not.toContain('foreman_odell');
    expect(html).not.toContain('apothecary_lin');
    expect(html).not.toContain('Apothecary Lin');
    expect(html).not.toContain('eastbrook_vale');
    expect(html).not.toContain('topic: rumor');
    expect(html).not.toContain('触发：npc_question');
    expect(html).not.toContain('Line-id-only response');
    expect(html).not.toContain('thinking:Apothecary Lin:1475');
  });

  it('shows AI profile validation issues and escapes issue values', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics(), profiles({
      validation: {
        totalIssues: 1,
        errorCount: 1,
        warningCount: 0,
        limit: 48,
        truncated: false,
        issues: [{
          severity: 'error',
          code: 'fallback<script>',
          profileId: 'npc.bad<script>',
          detail: 'bad detail <script>',
          targetKind: 'npc',
          targetTemplateId: 'target<script>',
        }],
      },
    }));

    expect(html).toContain('errors');
    expect(html).toContain('fallback&lt;script&gt;');
    expect(html).toContain('npc.bad&lt;script&gt;');
    expect(html).toContain('NPC: target&lt;script&gt;');
    expect(html).toContain('unknown (fallback&lt;script&gt;)');
    expect(html).not.toContain('target<script>');
    expect(html).not.toContain('bad detail <script>');
  });

  it('shows AI audit token windows and escapes recent audit records', () => {
    setAdminLanguage('en');
    const html = renderAiLifeLayerMetrics(metrics(), coverage(), diagnostics(), profiles(), audit());

    expect(html).toContain('AI usage and tokens');
    expect(html).toContain('Token values are estimated');
    expect(html).toContain('Last 1m');
    expect(html).toContain('Avg job tokens');
    expect(html).toContain('estimated');
    expect(html).toContain('Recent AI audit records');
    expect(html).toContain('provider error');
    expect(html).toContain('role="tab" data-ai-tab="audit" aria-selected="true"');
    expect(html).toContain('role="tab" data-ai-tab="usage" aria-selected="false"');
    expect(html).toContain('class="ai-audit-card" data-ai-audit-id="audit-1"');
    expect(html).toContain('class="ai-audit-detail-slot"');
    expect(html).toContain('Clean failed and non-real records');
    expect(html).toContain('codex&lt;script&gt;');
    expect(html).toContain('brother_aldric&lt;script&gt;');
    expect(html).toContain('fallen_chapel&lt;script&gt;');
    expect(html).toContain('provider &lt;offline&gt;');
    expect(html).not.toContain('codex<script>');
    expect(html).not.toContain('provider <offline>');
    expect(html).not.toContain('commentOnScene<script>');
  });

  it('renders the full AI audit interaction chain and escapes raw content', () => {
    setAdminLanguage('en');
    const record = {
      ...audit().recent[0],
      status: 'accepted',
      hasChain: true,
      playerAction: {
        kind: 'npc_question',
        topic: 'recent',
        labelKey: 'usage.aiActionNpcRecent',
        locale: 'en',
        protocol: {
          jobId: 'job-1',
          trigger: 'npc_question',
          playerEntityId: 1,
          entityKind: 'npc',
          entityId: 22,
          templateId: 'brother_aldric<script>',
        },
      },
      chain: {
        playerAction: {
          kind: 'npc_question',
          topic: 'recent',
          labelKey: 'usage.aiActionNpcRecent',
          locale: 'en',
          protocol: {
            jobId: 'job-1',
            trigger: 'npc_question',
            playerEntityId: 1,
            entityKind: 'npc',
            entityId: 22,
            templateId: 'brother_aldric<script>',
          },
        },
        requestContext: {
          context: { jobId: 'job-1', recentObservations: ['scene<script>'] },
          promptText: 'Prompt <script> sent to model',
          promptChars: 29,
          promptTruncated: false,
        },
        provider: {
          source: 'codex',
          rawOutput: '{"speech":"raw <script>"}',
          rawOutputChars: 25,
          rawOutputTruncated: false,
          parsedDecision: { speech: [{ mode: 'dynamicText', text: 'parsed <script>' }] },
          timings: {
            provider: 'codex-app-server',
            totalMs: 2345,
            steps: [
              { key: 'startupWaitMs', label: 'wait <script>', ms: 7 },
              { key: 'turnCompleteMs', label: 'model <script>', ms: 2200 },
              { key: 'parseOutputMs', label: 'parse <script>', ms: 4 },
            ],
          },
          error: '',
        },
        validation: {
          ok: true,
          reason: 'validator <ok>',
          events: [{
            type: 'aiSpeech',
            pid: 1,
            speakerId: 22,
            speakerName: 'Aldric<script>',
            source: 'codex',
            text: '',
            speechMode: 'dynamicText',
            lineId: '',
            language: 'en',
            speechText: 'Validated <script>',
            targetEntityId: null,
            targetObjectId: null,
            targetItemId: '',
            reactionKind: '',
            raw: { type: 'aiSpeech', speech: { text: 'Validated <script>' } },
            rawTruncated: false,
          }],
        },
        delivered: {
          textSummary: ['Delivered <script>'],
          events: [{
            type: 'aiSpeech',
            pid: 1,
            speakerId: 22,
            speakerName: 'Aldric<script>',
            source: 'codex',
            text: '',
            speechMode: 'dynamicText',
            lineId: '',
            language: 'en',
            speechText: 'Delivered <script>',
            targetEntityId: null,
            targetObjectId: null,
            targetItemId: '',
            reactionKind: '',
            raw: { type: 'aiSpeech', speech: { text: 'Delivered <script>' } },
            rawTruncated: false,
          }],
        },
      },
    };

    const html = renderAiAuditRecordDetail(record);

    expect(html).toContain('AI interaction chain');
    expect(html).toContain('Ask about recent events');
    expect(html).toContain('Provider timing breakdown');
    expect(html).toContain('Prompt length');
    expect(html).toContain('29 chars');
    expect(html).toContain('Raw output length');
    expect(html).toContain('25 chars');
    expect(html).toContain('Share');
    expect(html).toContain('93.8%');
    expect(html).toContain('Codex app-server');
    expect(html).toContain('Model turn completion');
    expect(html).toContain('2,200 ms');
    expect(html).toContain('Prompt &lt;script&gt; sent to model');
    expect(html).toContain('raw &lt;script&gt;');
    expect(html).toContain('parsed &lt;script&gt;');
    expect(html).toContain('validator &lt;ok&gt;');
    expect(html).toContain('Validated &lt;script&gt;');
    expect(html).toContain('Delivered &lt;script&gt;');
    expect(html).not.toContain('Prompt <script>');
    expect(html).not.toContain('Delivered <script>');
    expect(html).not.toContain('model <script>');
  });
});
