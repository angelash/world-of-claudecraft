import type { StreamerLinks } from './account_flair';
import type { AccountStatus } from './account_status';

// Shapes returned by the /admin/api endpoints (mirrors server/admin_db.ts
// and server/game.ts admin views).

export interface ServerStats {
  online: number;
  onlineAccounts: number;
  peakOnline: number;
  uptimeSeconds: number;
  tickMsAvg: number;
  simEntities: number;
  rssBytes: number;
  heapUsedBytes: number;
}

export type UsageWindowKey = 'm1' | 'm5' | 'h1' | 'h24';

export interface ProviderUsageWindow {
  key: UsageWindowKey;
  labelKey: string;
  milliseconds: number;
}

export interface ProviderUsageMetric {
  key: string;
  labelKey: string;
  counts: Record<UsageWindowKey, number>;
}

export interface ProviderUsageCache {
  key: string;
  labelKey: string;
  entries: number;
  maxEntries: number | null;
  hits: number;
  misses: number;
  staleRefreshes: number;
  stores: number;
  failures: number;
  evictions: number;
  updatedAt: string | null;
}

export interface ProviderUsageSnapshot {
  generatedAt: string;
  windows: ProviderUsageWindow[];
  metrics: ProviderUsageMetric[];
  caches: ProviderUsageCache[];
}

export interface AiAuditWindowSnapshot {
  key: UsageWindowKey;
  labelKey: string;
  milliseconds: number;
  providerJobs: number;
  accepted: number;
  rejected: number;
  providerErrors: number;
  fallbacks: number;
  localReactions: number;
  memoryWrites: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedTokens: boolean;
}

export interface AiAuditTokenTotals {
  providerJobs: number;
  localReactions: number;
  memoryWrites: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  averageProviderJobTokens: number;
  lastInputTokens: number;
  lastOutputTokens: number;
  lastTotalTokens: number;
  estimatedTokens: boolean;
}

export interface AiAuditSummary {
  generatedAt: string;
  windows: AiAuditWindowSnapshot[];
  totals: AiAuditTokenTotals;
}

export interface AiAuditPlayerAction {
  kind: string;
  topic: string;
  labelKey: string;
  locale: string;
  protocol: {
    jobId: string;
    trigger: string;
    playerEntityId: number | null;
    entityKind: string;
    entityId: number | null;
    templateId: string;
  };
}

export interface AiAuditEventSummary {
  type: string;
  pid: number | null;
  speakerId: number | null;
  speakerName: string;
  source: string;
  text: string;
  speechMode: string;
  lineId: string;
  language: string;
  speechText: string;
  targetEntityId: number | null;
  targetObjectId: number | null;
  targetItemId: string;
  reactionKind: string;
  raw: unknown;
  rawTruncated: boolean;
}

export interface AiProviderTimingStep {
  key: string;
  label: string;
  ms: number;
}

export interface AiProviderTimingSnapshot {
  provider: string;
  totalMs: number;
  steps: AiProviderTimingStep[];
}

export interface AiSpeechPolishSnapshot {
  processed: number;
  changed: number;
  charsTrimmed: number;
  lastChanged: boolean;
  lastLocale?: string;
  lastFingerprintSource: 'profile' | 'family' | 'none';
  lastBefore?: string;
  lastAfter?: string;
  lastBeforeChars: number;
  lastAfterChars: number;
}

export interface AiAuditChain {
  playerAction: AiAuditPlayerAction;
  requestContext: {
    context: unknown;
    promptText: string;
    promptChars: number;
    promptTruncated: boolean;
  };
  provider: {
    source: string;
    rawOutput: string;
    rawOutputChars: number;
    rawOutputTruncated: boolean;
    parsedDecision: unknown;
    timings?: AiProviderTimingSnapshot;
    error: string;
  };
  validation: {
    ok: boolean;
    reason: string;
    events: AiAuditEventSummary[];
  };
  delivered: {
    events: AiAuditEventSummary[];
    textSummary: string[];
  };
}

export interface AiAuditRecord {
  auditId: string;
  realm: string;
  jobId: string;
  trigger: string;
  entityKind: string;
  entityId: number | null;
  templateId: string;
  playerEntityId: number | null;
  sceneId: string;
  zoneId: string;
  providerSource: string;
  status: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  tokenEstimate: boolean;
  promptChars: number;
  rawOutputChars: number;
  outputMode: string;
  allowedIntentCount: number;
  allowedLineIdCount: number;
  memorySignalCount: number;
  directorProposalCount: number;
  sceneObjectCount: number;
  companionCount: number;
  lineIds: string[];
  intents: string[];
  memoryWriteRefs: string[];
  reason: string;
  error: string;
  providerTimings?: AiProviderTimingSnapshot;
  playerAction?: AiAuditPlayerAction;
  deliveredSummary?: string[];
  hasChain?: boolean;
  chain?: AiAuditChain;
  createdAt: string;
}

export interface AiAuditSnapshot {
  summary: AiAuditSummary;
  recent: AiAuditRecord[];
}

export interface AiAuditCleanupResult {
  deletedRecords: number;
  retainedRecords: number;
}

export interface AiLifeLayerMetricsSnapshot {
  providerCalls: number;
  providerSuccesses: number;
  providerErrors: number;
  providerFallbacks: number;
  acceptedDecisions: number;
  rejectedDecisions: number;
  localReactions: number;
  generatedEvents: number;
  memoryWritesQueued: number;
  memoryFlushFailures: number;
  memoryPruneRuns: number;
  memoryPruneDeleted: number;
  memoryPruneFailures: number;
  lastMemoryPruneDeleted: number;
  memoryBudgetRuns: number;
  memoryBudgetDeleted: number;
  memoryBudgetFailures: number;
  lastMemoryBudgetDeleted: number;
  totalProviderLatencyMs: number;
  averageProviderLatencyMs: number;
  maxProviderLatencyMs: number;
  lastProviderLatencyMs: number;
  providerLatencySampleCount: number;
  providerLatencyP50Ms: number;
  providerLatencyP90Ms: number;
  providerLatencyP95Ms: number;
  lastPromptChars: number;
  lastRawOutputChars: number;
  speechPolish: AiSpeechPolishSnapshot;
  lastProviderTimings?: AiProviderTimingSnapshot;
  lastProviderError?: string;
  lastMemoryPersistenceError?: string;
  lastMemoryPruneError?: string;
  lastMemoryBudgetError?: string;
}

export interface AiMemoryAuditRecord {
  kind: string;
  refId: string;
  scope: string;
  sceneId?: string;
  zoneId?: string;
  sourcePlayerEntityId: number;
  entityId?: number;
  templateId?: string;
  itemId?: string;
  questId?: string;
  subjectKind?: string;
  lineIds: string[];
  salience: number;
  createdAt?: number;
  expiresAt?: number;
  reason: string;
}

export interface AiDecisionJournalEntry {
  sequence: number;
  jobId: string;
  trigger: string;
  entityId: number;
  templateId: string;
  playerEntityId: number;
  status: string;
  reason?: string;
  lineIds: string[];
  intents: string[];
  sceneId?: string | null;
  memoryWrites: AiMemoryAuditRecord[];
}

export interface AiNpcMemory {
  playerEntityId: number;
  playerName: string;
  templateId: string;
  interactionCount: number;
  affinity: number;
  lastInteractionAt: number;
  sceneIds: string[];
}

export interface AiRumorMemory {
  rumorId: string;
  sceneId: string;
  originSceneId: string;
  zoneId: string;
  itemId: string;
  subjectKind: string;
  questId?: string;
  sourcePlayerEntityId: number;
  lineIds: string[];
  strength: number;
  scope: string;
  createdAt: number;
  expiresAt: number;
}

export interface AiWorldDirectorState {
  stateId: string;
  sceneId: string;
  zoneId: string;
  mood: string;
  proposalType: string;
  sourcePlayerEntityId: number;
  sourceRef: string;
  itemId: string;
  subjectKind: string;
  subjectTemplateId?: string;
  subjectName?: string;
  lineId: string;
  heat: number;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  evidence: string[];
}

export interface AiWorldDirectorProposalAuditEntry {
  auditId: string;
  lifecycle: string;
  observedAt: number;
  stateId: string;
  proposalId: string;
  sourcePlayerEntityId: number;
  sourceRef: string;
  mood: string;
  proposalType: string;
  subjectKind: string;
  targetRef: string;
  sceneId: string;
  zoneId: string;
  intent: string;
  status: string;
  risk: string;
  intensity: number;
  suggestedLineId: string;
  expiresAt: number;
  reasonTags: string[];
  safetyNotes: string[];
}

export interface AiLifeLayerDiagnosticsSnapshot {
  recentDecisions: AiDecisionJournalEntry[];
  worldDirectorStates: AiWorldDirectorState[];
  worldDirectorProposalJournal?: AiWorldDirectorProposalAuditEntry[];
  socialMemory?: {
    npcMemories: AiNpcMemory[];
    rumors: AiRumorMemory[];
  };
  memoryPersistence: {
    pending: number;
    flushing: boolean;
    pruning: boolean;
    budgeting: boolean;
    lastPruneDeleted: number;
    lastBudgetDeleted: number;
    budget: {
      maxTotalRecords: number;
      maxRecordsPerPlayer: number;
      maxRecordsPerKind: Record<string, number>;
      batchSize: number;
    };
    errors: string[];
  };
}

export type AiActivePollCategory =
  | 'sceneAmbient'
  | 'time'
  | 'weather'
  | 'townLife'
  | 'livingRoutine'
  | 'creatureRoutine'
  | 'socialSequence';

export type AiActivePopulationBand = 'solo' | 'small' | 'busy' | 'crowded' | 'protected';

export interface AiActivePollRule {
  ruleId: string;
  title: string;
  enabled: boolean;
  category: AiActivePollCategory;
  periodSeconds: number;
  jitterSeconds: number;
  priority: number;
  scope: 'playerVicinity';
  providerPolicy: 'localOnly' | 'codexAllowed' | 'codexPreferred';
  outputMode: 'lineIdOnly' | 'dynamicTextFirst' | 'mixedLivingWorld';
  cooldown: {
    perPlayerSeconds: number;
    perEntitySeconds: number;
    perRuleSeconds: number;
  };
}

export interface AiActiveTriggerMetricsSnapshot {
  activePollDue: number;
  activePollSkipped: number;
  activePollFired: number;
  activeEventQueued: number;
  activeEventSkipped: number;
  activeEventFired: number;
  activeEventExpired: number;
  activeCandidatesScanned: number;
  activeCandidatesSelected: number;
  activeProviderCalls: number;
  activeLocalReactions: number;
  activeNoiseSuppressions: number;
  activeSchedulerOnlineCount: number;
  activeSchedulerSessionsConsidered: number;
  activeSchedulerSessionsSuppressed: number;
  activeSchedulerLastBand: AiActivePopulationBand | '';
  activeCodexBudgetDenied: number;
  activeCodexBudgetRemaining5h: number;
  activeCodexBudgetRemainingWeek: number;
  activeProviderJobs: number;
  activeProviderSuccesses: number;
  activeProviderErrors: number;
  activeProviderRejected: number;
  activeProviderFallbacks: number;
  activeProviderPending: number;
  activeProviderDeferredForActivity: number;
  activeLastProviderLatencyMs: number;
  activeLastProviderTimings?: AiProviderTimingSnapshot;
  activeLastProviderResult: '' | 'success' | 'rejected' | 'error';
  activeLastProviderReason: string;
  activeActionsAttempted: number;
  activeActionsApplied: number;
  activeActionsRejected: number;
  activeMobActionsApplied: number;
  activeNpcActionsApplied: number;
  activeLastActionKind: string;
  activeLastActionResult: '' | 'applied' | 'rejected';
  activeLastActionReason: string;
  activeRoutineFired: number;
  activeRoutineLastKind: string;
  activeSequenceFired: number;
  activeSequenceLastLength: number;
  activeLastSkipReason: string;
  activeLastRuleId: string;
}

export interface AiActivePollCursorSnapshot {
  ruleId: string;
  scopeKey: string;
  nextDueAtMs: number;
  lastCheckedAtMs: number;
  lastFiredAtMs: number;
  lastSkipReason: string;
  fireCount: number;
}

export interface AiActiveTriggerDecisionSnapshot {
  ruleId: string;
  playerEntityId: number;
  speakerEntityId?: number;
  speakerTemplateId?: string;
  sceneId?: string;
  lineId?: string;
  skipReason?: string;
  createdAtMs: number;
}

export interface AiActiveQueuedEventSnapshot {
  eventId: string;
  kind: string;
  playerEntityId: number;
  anchorEntityId?: number;
  itemId?: string;
  questId?: string;
  subjectTemplateId?: string;
  priority: number;
  attempts: number;
  createdAtMs: number;
  expiresAtMs: number;
  nextAttemptAtMs: number;
  observations: string[];
}

export interface AiActiveSequenceSnapshot {
  sequenceId: string;
  kind: 'npc' | 'creature';
  family?: string;
  ruleId: string;
  playerEntityId: number;
  speakerEntityIds: number[];
  speakerNames: string[];
  speakerTemplateIds: string[];
  sceneId?: string;
  focusObjectId?: string;
  focusObjectTemplateId?: string;
  focusDisplayName?: string;
  lineIds: string[];
  startedAtMs: number;
  nextBeatAtMs: number;
  remainingBeats: number;
}

export interface AiActivePopulationPolicySnapshot {
  band: AiActivePopulationBand;
  onlineCount: number;
  maxPollSessionsPerTick: number;
  minRulePriority: number;
  codexAdmission: 'aggressive' | 'balanced' | 'scarce' | 'localOnly';
}

export interface AiActiveCodexBudgetSnapshot {
  maxCalls5h: number;
  usedCalls5h: number;
  remainingCalls5h: number;
  maxCallsWeek: number;
  usedCallsWeek: number;
  remainingCallsWeek: number;
  reserveRatio: number;
}

export interface AiActiveRuntimeSnapshot {
  schedulerIntervalMs: number;
  lastTickStartedAtMs: number;
  lastTickCompletedAtMs: number;
  lastTickDurationMs: number;
  lastTickSessionCount: number;
  lastTickProducedEvents: number;
  lastTickState: 'disabled' | 'idle' | 'event' | 'poll';
  lastTickSkipReason: string;
  nextDueAtMs: number;
  queuedEventCount: number;
  nextQueuedEventAtMs: number;
  oldestQueuedEventAgeMs: number;
}

export interface AiActiveTriggerDiagnosticsSnapshot {
  enabled: boolean;
  eventsEnabled: boolean;
  pollsEnabled: boolean;
  realActionsEnabled: boolean;
  populationPolicy: AiActivePopulationPolicySnapshot | null;
  codexBudget: AiActiveCodexBudgetSnapshot;
  runtime: AiActiveRuntimeSnapshot;
  rules: AiActivePollRule[];
  eventQueue: AiActiveQueuedEventSnapshot[];
  activeSequences: AiActiveSequenceSnapshot[];
  cursors: AiActivePollCursorSnapshot[];
  recentDecisions: AiActiveTriggerDecisionSnapshot[];
}

export interface AiActiveTriggerAdminSnapshot {
  metrics: AiActiveTriggerMetricsSnapshot;
  diagnostics: AiActiveTriggerDiagnosticsSnapshot;
}

export interface AiActiveSequenceCancelResult {
  canceledSequences: number;
  canceledBeats: number;
}

export interface AiVolatileMemoryClearResult {
  npcMemories: number;
  rumors: number;
  worldTraces: number;
  creatureMemories: number;
  creaturePlans: number;
  bossMemories: number;
  bossPhaseCues: number;
  worldDirectorStates: number;
  decisionJournalEntries: number;
  pendingMemoryWrites: number;
  persistedMemoryRecords: number;
  totalCleared: number;
}

export interface AiContentCoverageReport {
  families: {
    expected: string[];
    inContent: string[];
    missingSemantics: string[];
    semanticsWithoutContent: string[];
    familiesMissingDepth: string[];
    familiesWithInvalidMoodBias: string[];
    templateCountByFamily: Record<string, number>;
  };
  npcs: {
    interactiveTotal: number;
    authoredProfileTotal: number;
    missingInteractiveProfiles: string[];
    authoredNpcProfilesMissingSceneAffinities: string[];
    authoredNpcProfilesMissingItemInterest: string[];
    authoredNpcProfilesMissingTimeWeatherSensitivity: string[];
    authoredNpcProfilesWithThinMemory: string[];
  };
  scenes: {
    anchorTotal: number;
    semanticObjectTotal: number;
    anchorsMissingSemanticObjects: string[];
    anchorsMissingTags: string[];
    anchorsMissingTagDepth: string[];
    semanticObjectsMissingTags: string[];
    semanticObjectsMissingTagDepth: string[];
    semanticObjectsMissingFeatureTags: string[];
    semanticObjectsMissingAffordanceTags: string[];
    semanticObjectsMissingAnchorOverlap: string[];
  };
  items: {
    requiredTotal: number;
    discardableTotal: number;
    missingRequiredItems: string[];
    requiredItemsMissingSignals: string[];
    discardableItemsMissingSignals: string[];
    importantItemsMissingSignals: string[];
  };
  lineIds: {
    referenced: string[];
  };
}

export type AiContentReviewChecklistStatus = 'pass' | 'needs_attention';

export interface AiContentReviewChecklistItem {
  id: string;
  label: string;
  status: AiContentReviewChecklistStatus;
  issueCount: number;
  examples: string[];
  reviewPrompt: string;
  validationCommand: string;
}

export interface AiContentReviewChecklist {
  status: AiContentReviewChecklistStatus;
  generatedFrom: 'aiContentCoverageReport';
  items: AiContentReviewChecklistItem[];
  validationCommands: string[];
}

export interface AiProfilePreviewTarget {
  kind: string;
  templateId: string;
}

export interface AiProfilePreviewRow {
  id: string;
  appliesTo: AiProfilePreviewTarget[];
  personaExcerpt: string;
  canonSensitive: boolean;
  fallbackLineId: string;
  allowedIntentTypes: string[];
  allowedLineIdCount: number;
  knowledgeScopeCount: number;
  tabooTopicCount: number;
  socialMemoryLineIds: string[];
  sceneAffinities: {
    likes: number;
    avoids: number;
    comments: number;
  };
  itemInterest: {
    attracted: number;
    avoids: number;
  };
  hasTimeWeatherSensitivity: boolean;
  companionReactionCount: number;
  missingAuthoringFields: string[];
}

export interface AiProfileAuthoringIssue {
  severity: string;
  code: string;
  profileId: string;
  detail: string;
  targetKind?: string;
  targetTemplateId?: string;
}

export interface AiProfileAuthoringValidationReport {
  totalIssues: number;
  errorCount: number;
  warningCount: number;
  limit: number;
  truncated: boolean;
  issues: AiProfileAuthoringIssue[];
}

export interface AiProfilePreviewReport {
  authoredTotal: number;
  genericTotal: number;
  limit: number;
  truncated: boolean;
  rows: AiProfilePreviewRow[];
  validation: AiProfileAuthoringValidationReport;
}

export interface Overview {
  accounts: number;
  characters: number;
  accountsToday: number;
  accountsWeek: number;
  accountsMonth: number;
  sessionsToday: number;
  activeAccountsToday: number;
  activeAccountsWeek: number;
  activeAccountsMonth: number;
  returningAccountsToday: number;
  avgPlaytimeSeconds: number;
  peakOnlineToday: number;
  peakOnlineAllTime: number;
  playersCap: number;
  siteUsersNow: number;
  server: ServerStats;
}

// Provider usage is served on its own ops_usage.read-gated route, not inside
// the overview payload.
export interface ProviderUsageResponse {
  usage: ProviderUsageSnapshot;
}

export interface AiDiagnosticsResponse {
  ai: AiLifeLayerMetricsSnapshot;
  aiDiagnostics: AiLifeLayerDiagnosticsSnapshot;
  aiActive: AiActiveTriggerAdminSnapshot;
  aiAudit: AiAuditSnapshot;
  aiCoverage: AiContentCoverageReport;
  aiCoverageChecklist: AiContentReviewChecklist;
  aiProfiles: AiProfilePreviewReport;
}

export interface AmbientBotPlannerConfig {
  enabled: boolean;
  plannerIntervalMs: number;
  clusterRadius: number;
  releaseRadius: number;
  soloTargetBots: number;
  extraBotsPerAdditionalPlayer: number;
  maxBotsPerCluster: number;
  maxProvisionPerTick: number;
  cooldownMs: number;
  reservationMs: number;
  recentActionLimit: number;
}

export interface AmbientBotPlannerDiagnostics {
  enabled: boolean;
  config: AmbientBotPlannerConfig;
  metrics: {
    cycles: number;
    humansObserved: number;
    clustersObserved: number;
    desiredBots: number;
    assignedBots: number;
    loginPlans: number;
    provisionPlans: number;
    logoutPlans: number;
    lastRunAtMs: number | null;
    lastRunReason: string;
  };
  directory: {
    total: number;
    ready: number;
    reserved: number;
    online: number;
    cooldown: number;
    retired: number;
    provisionPending: number;
    assigned: number;
  };
  clusters: readonly unknown[];
  recentActions: readonly unknown[];
}

export interface AmbientBotRuntimeControls {
  acceptProvisionActions: boolean;
  acceptLoginActions: boolean;
  allowLlmDecisions: boolean;
}

export interface AmbientBotRuntimeDiagnostics {
  started: boolean;
  startedAtMs: number | null;
  controls: AmbientBotRuntimeControls;
  metrics: {
    starts: number;
    stops: number;
    actionBatches: number;
    actionsReceived: number;
    provisionAttempts: number;
    provisionSuccesses: number;
    provisionFailures: number;
    provisionSkipped: number;
    loginAttempts: number;
    loginSuccesses: number;
    loginFailures: number;
    loginSkipped: number;
    logoutRequests: number;
    logoutAllRequests: number;
    unexpectedClosures: number;
    brainLoops: number;
    brainBotTicks: number;
    brainFailures: number;
    llmAuditWrites: number;
    lastActionAtMs: number | null;
    lastBrainAtMs: number | null;
    lastBrainDurationMs: number | null;
    lastFailureAtMs: number | null;
    lastFailureStage: string;
    lastFailureBotId: string;
    lastFailureReason: string;
  };
  activeRunners: number;
  connectedRunners: number;
  sessions: readonly {
    botId: string;
    characterId: number | null;
    characterName: string;
    clusterId: string | null;
    targetCharacterId: number | null;
    connected: boolean;
    intentionalClose: boolean;
    zoneId: string;
    level: number;
    objectiveId: string;
    objectiveLabel: string;
    socialPendingReplies: number;
    partyChatPending: number;
    llmPlanPending: boolean;
    llmPlanMode: string;
    llmPlanFocus: string;
    lastRunnerAtMs: number | null;
    lastRunnerError: string;
  }[];
}

export interface AmbientBotLlmDiagnostics {
  enabled: boolean;
  providerAvailable: boolean;
  config: {
    enabled: boolean;
    planCooldownMs: number;
    socialCooldownMs: number;
    maxCalls5h: number;
    maxCallsWeek: number;
    cacheMaxEntries: number;
    cacheMaxTtlMs: number;
  };
  budget: {
    maxCalls5h: number;
    usedCalls5h: number;
    remainingCalls5h: number;
    maxCallsWeek: number;
    usedCallsWeek: number;
    remainingCallsWeek: number;
  };
  cache: {
    planEntries: number;
    socialEntries: number;
    partyEntries: number;
  };
  metrics: unknown;
}

export interface AmbientBotDiagnostics {
  planner: AmbientBotPlannerDiagnostics;
  runtime: AmbientBotRuntimeDiagnostics | null;
  llm: AmbientBotLlmDiagnostics | null;
}

export interface AmbientBotLogoutAllResponse {
  result: {
    disconnectedRunners: number;
    resetRecords: number;
    atMs: number;
  };
  diagnostics: AmbientBotDiagnostics;
}

export interface LivePlayer {
  pid: number;
  accountId: number;
  characterId: number;
  name: string;
  class: string;
  level: number;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  zone: string;
  location?: LivePlayerLocation;
  sessionSeconds: number;
  lastSaveSecondsAgo: number;
  moveSpeedMultiplier: number;
  runSpeed: number;
  swimming: boolean;
  auras: {
    id: string;
    name: string;
    kind: string;
    value: number;
    remaining: number;
    duration: number;
  }[];
}

export interface SuspiciousEvidence {
  kind: string;
  weight: number;
  detail: string;
  expiresAt: number;
  // Recurrence history, present only on kinds where re-triggering carries
  // information: distinct episodes this session, first and latest (epoch ms),
  // and the opening timestamps of the most recent episodes (bounded ring).
  occurrences?: number;
  firstAt?: number;
  lastAt?: number;
  episodesAt?: number[];
}

export interface SuspiciousPlayer {
  ref: {
    accountId: number;
    characterId: number;
    name: string;
    ip: string;
  };
  // CONFIRMED = an automated case (a suspicion flag, or a moderator report on a
  // host without the flag store) went out for this session.
  state: 'SUSPICIOUS' | 'CONFIRMED';
  snapshot: {
    capturedAt: number;
  } | null;
  score: number;
  evidence: SuspiciousEvidence[];
}

export interface SuspiciousPlayersData {
  players: SuspiciousPlayer[];
}

// Raw-value calibration histograms published by the bot detector. Histogram ids and
// the measured quantities are decided server-side at runtime; the shape is generic.
export interface CalibrationHistogramBucket {
  le: number;
  count: number;
}

export interface CalibrationHistogram {
  id: string;
  count: number;
  min: number;
  max: number;
  sum: number;
  buckets: CalibrationHistogramBucket[];
  overflowCount: number;
}

export interface DetectionCalibrationData {
  schemaVersion: 1;
  capturedAt: string;
  serverStartedAt: string;
  uptimeSeconds: number;
  histograms: CalibrationHistogram[];
}

export interface LivePlayerLocation {
  kind: 'overworld' | 'dungeon' | 'delve';
  zoneId: string | null;
  zone: string;
  instanceId: string | null;
  instance: string | null;
  instanceSlot: number | null;
  poiIndex: number | null;
  poi: string | null;
  poiDistance: number | null;
}

export interface Activity {
  days: number;
  registrations: { day: string; count: number }[];
  sessions: { day: string; sessions: number; uniqueAccounts: number; playtimeSeconds: number }[];
  classes: { key: string; count: number }[];
  levels: { key: string; count: number }[];
}

export type OnlineHistoryRange = '24h' | '7d' | '30d';

export interface OnlineHistory {
  range: OnlineHistoryRange;
  bucket: 'hour' | 'day';
  points: {
    bucketStart: string;
    avgPlayers: number;
    peakPlayers: number;
    avgAccounts: number;
    peakAccounts: number;
    avgSiteUsers: number;
    peakSiteUsers: number;
  }[];
}

export interface AccountRow {
  id: number;
  username: string;
  createdAt: string;
  lastLogin: string | null;
  isAdmin: boolean;
  isAi: boolean;
  isStreamer: boolean;
  bannedAt: string | null;
  suspendedUntil: string | null;
  characterCount: number;
  maxLevel: number;
  playtimeSeconds: number;
  // Materialised total gold (purse + mail/market escrow); 0 until the server's
  // wealth sweep first runs.
  totalCopper: number;
  // Present only when the operator holds moderation.read (the server strips it
  // otherwise); count of active suspicion flags on the account.
  activeFlagCount?: number;
}

// ---------------------------------------------------------------------------
// Economy oversight: wealth breakdown + the suspicion-flag workflow. Shapes
// mirror server/account_wealth_db.ts and server/suspicion_flags_db.ts exactly.
// ---------------------------------------------------------------------------

export interface TopWealthHolderRow {
  accountId: number;
  username: string;
  purseCopper: number;
  mailCopper: number;
  marketCopper: number;
  totalCopper: number;
  maxLevel: number;
  lastLogin: string | null;
  bannedAt: string | null;
  suspendedUntil: string | null;
  // Present only when the operator holds moderation.read (the server strips
  // it otherwise, the same rule as the accounts list).
  activeFlagCount?: number;
  updatedAt: string;
}

// Live World Market listing metrics; mirrors server/admin_market_metrics.ts
// exactly. All six buckets are always present, in the server's fixed order.
export type MarketMetricsBucketId =
  | 'cores'
  | 'essence'
  | 'patterns'
  | 'produce'
  | 'seeds'
  | 'compost';

export interface AdminMarketMetricsItemRow {
  itemId: string;
  // Server-resolved English item name, rendered as data.
  name: string;
  listingCount: number;
  totalQuantity: number;
  lowestPerUnit: number;
  medianPerUnit: number;
}

// What changed hands in a bucket over the readout window. Every other figure
// here describes the LIVE BOOK (what is on offer now); these come from the
// server's accumulating sold-volume store.
export interface AdminMarketSoldVolume {
  saleCount: number;
  quantity: number;
  /** Gross buyout copper, before the Merchant's cut. */
  copper: number;
}

export interface AdminMarketMetricsBucket {
  bucket: MarketMetricsBucketId;
  listingCount: number;
  totalQuantity: number;
  trackedItemCount: number;
  listedItemCount: number;
  items: AdminMarketMetricsItemRow[];
  sold: AdminMarketSoldVolume;
}

export interface AdminMarketMetrics {
  realm: string;
  buckets: AdminMarketMetricsBucket[];
  /** The trailing UTC-day window the `sold` figures cover. */
  soldWindowDays: number;
  /** False when the server could not read the store; the sold figures are then meaningless. */
  soldAvailable: boolean;
}

export interface AccountWealthCharacterRow {
  characterId: number;
  name: string;
  realm: string;
  level: number;
  copper: number;
  guildId: number | null;
  guildName: string | null;
  guildTreasuryCopper: number | null;
  guildMemberCount: number | null;
}

export interface LargeGoldMovementRow {
  id: number;
  characterId: number;
  characterName: string | null;
  op: string;
  container: string;
  copperDelta: number;
  createdAt: string;
}

export interface AccountWealthData {
  accountId: number;
  purseCopper: number;
  mailCopper: number;
  marketCopper: number;
  totalCopper: number;
  updatedAt: string | null;
  characters: AccountWealthCharacterRow[];
  largeMovements: LargeGoldMovementRow[];
  /** The ledger read failed (timed out) after the breakdown was computed:
   *  largeMovements is empty because it is unknown, not because it is none. */
  largeMovementsUnavailable?: boolean;
}

export interface RelatedAccountRef {
  accountId: number;
  username: string | null;
}

export interface SuspicionFlagRow {
  id: number;
  accountId: number;
  username: string;
  bannedAt: string | null;
  suspendedUntil: string | null;
  source: string;
  kind: string;
  severity: 'low' | 'medium' | 'high';
  details: string;
  relatedAccounts: RelatedAccountRef[];
  status: 'new' | 'under_review' | 'cleared' | 'actioned';
  copperAtFlag: number | null;
  copperNow: number | null;
  occurrences: number;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
}

export interface SuspicionFlagEventRow {
  id: number;
  flagId: number;
  adminAccountId: number | null;
  adminUsername: string | null;
  fromStatus: SuspicionFlagRow['status'] | null;
  toStatus: SuspicionFlagRow['status'] | null;
  note: string;
  createdAt: string;
}

export interface FlagListData {
  rows: SuspicionFlagRow[];
  total: number;
  page: number;
  limit: number;
  counts: Record<SuspicionFlagRow['status'], number>;
  truncated: boolean;
}

export interface AccountFlagsData {
  flags: SuspicionFlagRow[];
  events: SuspicionFlagEventRow[];
}

export interface CharacterRow {
  id: number;
  name: string;
  class: string;
  level: number;
  accountId: number;
  username: string;
  guildId: number | null;
  guildName: string | null;
  guildRank: string | null;
  copper: number;
  xp: number;
  createdAt: string;
  updatedAt: string;
}

// R35 professions inspector (GET /admin/api/characters/:id/professions);
// matches server/character_professions.ts CharacterProfessionsSheet exactly.
export interface CharacterProfessionsSheet {
  characterId: number;
  name: string;
  class: string;
  level: number;
  accountId: number;
  username: string;
  live: boolean;
  updatedAt: string | null;
  preMigration: boolean;
  archetype: {
    activeArchetype: string | null;
    pairedMajor: string | null;
    hobbyCraft: string | null;
  };
  gathering: { professionId: string; proficiency: number }[];
  crafting: { craftId: string; skill: number; tier: number }[];
  knownRecipes: number;
  slots: {
    professionId: string;
    effectId: string;
    durability: number;
    maxDurability: number;
    craftedBy: string | null;
    confirmMode: string;
  }[];
  nodeTimers: {
    nodeId: string;
    zoneId: string | null;
    nodeType: string | null;
    remainingSeconds: number;
  }[];
  toolEffectIds: string[];
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

export interface GuildSummary {
  id: number;
  name: string;
  realm: string;
  createdAt: string;
  memberCount: number;
  leaderName: string | null;
}

export interface GuildDetailData {
  guild: {
    id: number;
    name: string;
    realm: string;
    createdAt: string;
    memberCount: number;
  };
  members: {
    characterId: number;
    characterName: string;
    accountId: number;
    username: string;
    class: string;
    level: number;
    rank: string;
    joinedAt: string;
    lastLogin: string | null;
    online: boolean;
  }[];
}

export interface GuildRenameHistoryRow {
  id: number;
  oldName: string;
  newName: string;
  reason: string;
  createdAt: string;
  adminAccountId: number | null;
  adminUsername: string | null;
}

export interface GuildRenameHistoryData {
  rows: GuildRenameHistoryRow[];
}

/** One slot of a guild's live bank as GET /admin/api/guilds/:id/bank answers
 *  it. `index` is the exact `slot` argument the purge takes and `itemId` is its
 *  confirmation token; `dormant` means the anonymous-pipe policy refuses the
 *  copy in both directions, so the guild can neither withdraw it nor disband
 *  while it sits there, and it is the ONLY thing the purge will remove.
 *  Deliberately carries no per-copy instance payload (see
 *  server/admin_guild_bank_view.ts). */
export interface GuildBankSlot {
  index: number;
  itemId: string;
  count: number;
  dormant: boolean;
}

export interface GuildBankStateData {
  guildId: number;
  treasury: number;
  capacity: number;
  purchasedSlots: number;
  usedSlots: number;
  dormantSlots: number;
  slots: GuildBankSlot[];
}

export interface IpAssociationsData {
  ip: string;
  blocked: boolean;
  blockable: boolean;
  accounts: {
    accountId: number;
    username: string;
    isAdmin: boolean;
    online: boolean;
    status: AccountStatus;
    suspendedUntil: string | null;
    createdAt: string;
    createdWithIp: boolean;
    lastLoginWithIp: boolean;
    hasSession: boolean;
    lastSeenAt: string;
    characters: {
      characterId: number | null;
      characterName: string;
      realm: string | null;
      lastSeenAt: string;
      sessionCount: number;
    }[];
  }[];
  total: number;
  page: number;
  limit: number;
}

export interface SharedIpRow {
  ip: string;
  accountCount: number;
  lastSeenAt: string;
  blocked: boolean;
}

export type SharedIpsData = Paginated<SharedIpRow>;

export interface GeneralChatRateLimit {
  messages: number;
  windowMinutes: number;
}

export interface AccountDetail {
  id: number;
  username: string;
  createdAt: string;
  lastLogin: string | null;
  isAdmin: boolean;
  isAi: boolean;
  isStreamer: boolean;
  streamerLinks: StreamerLinks;
  online: boolean;
  bannedAt: string | null;
  suspendedUntil: string | null;
  // Set when the player deactivated the account themselves; the moderation
  // actions offer the audited reactivate while it is non-null.
  deactivatedAt: string | null;
  moderationReason: string;
  chatMutedUntil: string | null;
  chatMuteReason: string;
  chatStrikes: number;
  generalChatRateLimit: GeneralChatRateLimit | null;
  dailyRewardsBan?: { reason: string; createdAt: string; expiresAt: string | null } | null;
  dailyRewardsIpBans?: { ip: string; reason: string; createdAt: string }[];
  // The operator-applied Cheater mark: remaining played-second budget, audited
  // reason, and when it was applied. Null when the account is not marked.
  cheaterMark?: { secondsRemaining: number; reason: string; setAt: string | null } | null;
  // The operator world quest block: audited reason and when it was applied. Null
  // when the account is not blocked.
  worldQuestBlock?: { reason: string; blockedAt: string } | null;
  lastLoginIp: string | null;
  playtimeSeconds: number;
  characters: {
    id: number;
    name: string;
    class: string;
    level: number;
    guildId: number | null;
    guildName: string | null;
    guildRank: string | null;
    copper: number;
    xp: number;
    pos: { x: number; z: number } | null;
    createdAt: string;
    updatedAt: string;
  }[];
  recentSessions: {
    id: number;
    characterName: string;
    startedAt: string;
    endedAt: string | null;
    seconds: number;
    ip: string | null;
  }[];
  moderationHistory: ModerationHistoryEntry[];
}

export interface DailyRewardPointEventRow {
  id: number;
  createdAt: string;
  kind: string;
  points: number;
  totalPoints: number;
  meta: Record<string, unknown>;
}

export interface DailyRewardPointEventLog {
  day: string;
  rows: DailyRewardPointEventRow[];
  total: number;
  truncated: boolean;
}

export interface ModerationHistoryEntry {
  id: number;
  action: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  adminAccountId: number | null;
  adminUsername: string | null;
}

export interface ModerationActionHistoryRow extends ModerationHistoryEntry {
  source: 'account' | 'ip' | 'guild';
  accountId: number | null;
  username: string | null;
  ip: string | null;
  // Guild renames are audited realm-wide, not per account. guildId is the snapshot
  // id the audit row carries, so it stays set even after the guild is deleted;
  // guildName is the guild's current name, falling back to the recorded new name.
  guildId: number | null;
  guildName: string | null;
}

export interface ModerationQueueRow {
  accountId: number;
  username: string;
  isAdmin: boolean;
  status: AccountStatus;
  suspendedUntil: string | null;
  openReports: number;
  latestReportAt: string;
  latestReason: string;
  characterNames: string[];
  online: boolean;
}

// Mirrors server/bug_report_db.ts BugReportRow (snake_case from the SQL row). The
// list row exposes only whether a screenshot exists; the bytes are fetched per
// report via GET /admin/api/bug-reports/:id/screenshot.
export interface BugReportRow {
  id: number;
  account_id: number | null;
  character_id: number | null;
  character_name: string;
  realm: string;
  pos_x: number;
  pos_y: number;
  pos_z: number;
  description: string;
  has_screenshot: boolean;
  meta: unknown;
  status: string;
  created_at: string;
}

export interface UnstuckArea {
  kind: string;
  id: string;
  instanceId: string | null;
  slot: number | null;
}

export interface UnstuckPosition {
  x: number;
  y: number;
  z: number;
  localX: number;
  localY: number;
  localZ: number;
}

export type UnstuckOutcome = 'completed' | 'cancelled' | 'failed';

export interface UnstuckReportRow {
  id: number;
  characterId: number | null;
  characterName: string | null;
  area: UnstuckArea;
  origin: UnstuckPosition;
  destination: UnstuckPosition | null;
  outcome: UnstuckOutcome;
  reason: string;
  invokedAt: string;
  resolvedAt: string | null;
}

export interface UnstuckHotspot {
  area: UnstuckArea;
  bucket: { x: number; y: number; z: number };
  count: number;
  completed: number;
  cancelled: number;
  failed: number;
  lastUsedAt: string;
}

/** One item_ledger row (server/item_ledger_db.ts). */
export interface ItemLedgerEvent {
  id: number;
  guid: string;
  itemId: string;
  quality: string;
  kind: 'mint' | 'transfer' | 'modify' | 'consume' | 'derive';
  characterId: number | null;
  accountId: number | null;
  characterName: string;
  source: string;
  zone: string | null;
  /** The step's short note (a rank, an enchant id, what the copy became). */
  detail: string | null;
  /** The other copy a swap or derivation names. */
  relatedGuid: string | null;
  occurredAt: string;
  createdAt: string;
}

export interface ItemLedgerPage {
  events: ItemLedgerEvent[];
  limit: number;
  hasMore: boolean;
  nextBeforeId: number | null;
}

export interface ItemLedgerHistory {
  guid: string;
  events: ItemLedgerEvent[];
}

export interface UnstuckReportsData {
  reports: UnstuckReportRow[];
  hotspots: UnstuckHotspot[];
  days: number;
  limit: number;
  hasMore: boolean;
  nextBeforeId: number | null;
}

export interface ReportDetail {
  id: number;
  reason: string;
  details: string;
  status: string;
  createdAt: string;
  reporterAccountId: number | null;
  reporterUsername: string | null;
  reporterCharacterId: number | null;
  reporterCharacterName: string;
  reportedAccountId: number;
  reportedUsername: string;
  reportedCharacterId: number | null;
  reportedCharacterName: string;
  chatContext: {
    id: number;
    characterName: string;
    channel: string;
    message: string;
    createdAt: string;
  }[];
}

export interface ChatViolationRow {
  id: number;
  characterName: string;
  term: string;
  channel: string;
  message: string;
  action: string;
  muteSeconds: number;
  createdAt: string;
}

export interface ChatModerationDetail {
  chatMutedUntil: string | null;
  chatStrikes: number;
  violations: ChatViolationRow[];
}

export interface ModerationAccountDetail {
  account: AccountDetail;
  reports: ReportDetail[];
  chat: ChatModerationDetail;
  blockedIps: string[];
}

export interface BlockedIpRow {
  id: number;
  ip: string;
  reason: string;
  createdAt: string;
  expiresAt: string | null;
  createdByUsername: string | null;
}

export interface BlockedIpsData {
  rows: BlockedIpRow[];
}

export interface FilterWord {
  id: number;
  word: string;
  tier: 'soft' | 'hard';
  createdAt: string;
}

export interface EscalationConfig {
  warningsBeforeMute: number;
  muteLadderSeconds: number[];
}

export interface ChatModeratedAccount {
  id: number;
  username: string;
  isAdmin: boolean;
  chatStrikes: number;
  chatMutedUntil: string | null;
}

export interface ChatFilterData {
  soft: FilterWord[];
  hard: FilterWord[];
  config: EscalationConfig;
  accounts: ChatModeratedAccount[];
}

// One bar in the overview activity charts (BarChart.svelte). `title` overrides the
// default "<label>: <value><suffix>" hover tooltip.
export interface BarPoint {
  label: string;
  value: number;
  title?: string;
}

export interface LinePoint {
  label: string;
  value: number;
  secondaryValue?: number;
  title?: string;
}

// Bot Detector > Configuration. Field ids, groups, labels, and help arrive as
// server data (the detector decides them at runtime; the evidence-detail
// precedent), so they render as-is rather than through t().
export type AntibotConfigValue = string | number | boolean | string[];

export interface AntibotConfigField {
  id: string;
  group: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multi_select';
  defaultValue: AntibotConfigValue;
  value: AntibotConfigValue;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  options?: { value: string; label: string }[];
  help?: string;
}

export interface AntibotConfigCatalog {
  fields: AntibotConfigField[];
  updatedAt: string | null;
}

export interface AntibotConfigHistoryEntry {
  id: number;
  beforeData: Record<string, AntibotConfigValue>;
  afterData: Record<string, AntibotConfigValue>;
  note: string;
  createdAt: string;
  adminAccountId: number | null;
  adminUsername: string | null;
}

export interface AntibotConfigHistory {
  entries: AntibotConfigHistoryEntry[];
}

// Staff page (role management). assignableRoles never contains superadmin:
// it is grantable only via the grant script, and superadmin rows render
// read-only.
export interface StaffRow {
  accountId: number;
  username: string;
  roles: string[];
  lastLogin: string | null;
}

export interface StaffData {
  rows: StaffRow[];
  assignableRoles: string[];
}

export interface RoleChangeRow {
  id: number;
  accountId: number;
  username: string | null;
  adminUsername: string | null;
  rolesBefore: string[];
  rolesAfter: string[];
  createdAt: string;
}

export interface StaffHistoryData {
  rows: RoleChangeRow[];
}

// Server tick-loop profiling (GET /admin/api/perf/tick, POST .../capture). Mirrors
// server/game.ts PerfCaptureResult/PerfCaptureStatus and the TickProfiler shape.
export interface PerfPhaseStats {
  mean: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export interface PerfCaptureResult {
  captureId: string;
  capturedAt: number; // epoch ms the window closed
  durationMs: number;
  loopCallbacks: number;
  simTicks: number;
  catchUpCallbacks: number;
  maxTicksPerCallback: number;
  online: number;
  simEntities: number;
  aggroVisitsTotal: number;
  aggroVisitsMaxPerTick: number;
  threatVisitsTotal: number;
  threatVisitsMaxPerTick: number;
  routePlansTotal: number;
  routePlansMaxPerTick: number;
  routeNodesTotal: number;
  routeNodesMaxPerTick: number;
  routeFailedTotal: number;
  routeFailedMaxPerTick: number;
  routeDeferredTotal: number;
  routeDeferredMaxPerTick: number;
  sightQueriesTotal: number;
  sightQueriesMaxPerTick: number;
  movementConsumedTotal: number;
  movementStarvedTotal: number;
  movementExtrapolatedTotal: number;
  movementDiscardedLateTotal: number;
  movementDroppedOldestTotal: number;
  movementRejectedAnchoredWindowTotal: number;
  movementRejectedSanityBoundTotal: number;
  movementResyncsTotal: number;
  movementPlayoutGrowthsTotal: number;
  movementPlayoutShrinksTotal: number;
  profile: {
    samples: number;
    windowTicks: number;
    phases: Record<string, PerfPhaseStats>;
  };
}

export interface PerfCaptureStatus {
  captureId: string | null;
  capturing: boolean;
  endsAt: number | null; // epoch ms the in-flight capture closes
  last: PerfCaptureResult | null;
}
