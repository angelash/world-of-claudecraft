// Shapes returned by the /admin/api endpoints (mirrors server/admin_db.ts
// and server/game.ts admin views).

export interface ServerStats {
  online: number;
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

export type AiActivePopulationBand =
  | 'solo'
  | 'small'
  | 'busy'
  | 'crowded'
  | 'protected';

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
  sessionsToday: number;
  activeAccountsToday: number;
  server: ServerStats;
  usage: ProviderUsageSnapshot;
  ai: AiLifeLayerMetricsSnapshot;
  aiDiagnostics: AiLifeLayerDiagnosticsSnapshot;
  aiActive: AiActiveTriggerAdminSnapshot;
  aiAudit: AiAuditSnapshot;
  aiCoverage: AiContentCoverageReport;
  aiCoverageChecklist: AiContentReviewChecklist;
  aiProfiles: AiProfilePreviewReport;
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
  sessionSeconds: number;
  lastSaveSecondsAgo: number;
}

export interface Activity {
  days: number;
  registrations: { day: string; count: number }[];
  sessions: { day: string; sessions: number; uniqueAccounts: number; playtimeSeconds: number }[];
  classes: { key: string; count: number }[];
  levels: { key: string; count: number }[];
}

export interface AccountRow {
  id: number;
  username: string;
  createdAt: string;
  lastLogin: string | null;
  isAdmin: boolean;
  bannedAt: string | null;
  suspendedUntil: string | null;
  characterCount: number;
  maxLevel: number;
  playtimeSeconds: number;
}

export interface CharacterRow {
  id: number;
  name: string;
  class: string;
  level: number;
  accountId: number;
  username: string;
  copper: number;
  xp: number;
  createdAt: string;
  updatedAt: string;
}

export interface Paginated<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

export interface AccountDetail {
  id: number;
  username: string;
  createdAt: string;
  lastLogin: string | null;
  isAdmin: boolean;
  bannedAt: string | null;
  suspendedUntil: string | null;
  moderationReason: string;
  chatMutedUntil: string | null;
  chatMuteReason: string;
  chatStrikes: number;
  playtimeSeconds: number;
  characters: {
    id: number;
    name: string;
    class: string;
    level: number;
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
  }[];
}

export interface ModerationQueueRow {
  accountId: number;
  username: string;
  status: 'active' | 'suspended' | 'banned';
  suspendedUntil: string | null;
  openReports: number;
  latestReportAt: string;
  latestReason: string;
  characterNames: string[];
  online: boolean;
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
