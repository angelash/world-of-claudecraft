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
  totalProviderLatencyMs: number;
  averageProviderLatencyMs: number;
  maxProviderLatencyMs: number;
  lastProviderLatencyMs: number;
  lastProviderError?: string;
  lastMemoryPersistenceError?: string;
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

export interface AiLifeLayerDiagnosticsSnapshot {
  recentDecisions: AiDecisionJournalEntry[];
  worldDirectorStates: AiWorldDirectorState[];
  memoryPersistence: {
    pending: number;
    flushing: boolean;
    errors: string[];
  };
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

export interface AiProfilePreviewReport {
  authoredTotal: number;
  genericTotal: number;
  limit: number;
  truncated: boolean;
  rows: AiProfilePreviewRow[];
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
  aiCoverage: AiContentCoverageReport;
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
