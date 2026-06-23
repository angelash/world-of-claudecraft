import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { NPCS, QUESTS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type { AiNpcInteractionTopic } from '../../src/world_api';
import { INTERACT_RANGE, dist2d } from '../../src/sim/types';
import type { Entity, PetMode, SimEvent } from '../../src/sim/types';
import {
  createLocalAuditRecord,
  createProviderAuditRecord,
  type AiAuditEntityKind,
  type AiAuditProviderSource,
  type AiAuditSink,
} from '../ai_audit';
import { REALM } from '../realm';
import type {
  AiDecisionV1,
  AiJobContextV1,
  AiMemoryAuditKind,
  AiMemoryAuditRecord,
  AiOutputMode,
  AiProvider,
  AiProviderOutput,
  AiProviderTimingSnapshot,
  AiSpeechFingerprint,
  AiSpeechPolishSnapshot,
} from './ai_types';
import { aiEntityKind } from './ai_types';
import {
  AiBossEncounterMemoryStore,
  AiBossEncounterPhaseCueStore,
  bossEncounterMemoryEvent,
  bossEncounterPhaseEvent,
  bossEncounterScale,
} from './boss_memory';
import type { AiBossEncounterMemory, AiBossEncounterPhaseCue } from './boss_memory';
import { classifyCanonSubject } from './canon_guard';
import { CodexAppServerProvider } from './codex_app_server_provider';
import { CodexCliProvider } from './codex_worker';
import { companionReactionEvents, companionReactionEventsForScene } from './companion_reactions';
import { AiCreatureMemoryStore, creaturePlanReactionMetadata, singularityCreatureMemoryEvent, singularityCreatureSceneMemoryEvent } from './creature_memory';
import type { AiCreatureMemory, AiCreaturePlan } from './creature_memory';
import { AiDecisionJournal } from './decision_journal';
import type { AiDecisionJournalEntry } from './decision_journal';
import { familySceneReactionEvent, nearbyFamilySceneCandidates, rankFamilySceneReactions } from './family_scene_reactions';
import { compactFamilySemanticsForEntity } from './family_semantics';
import { nearbyReactionCandidates, rankItemReactions } from './item_interest';
import type { ItemInterestReaction } from './item_interest';
import { validateAiDecision } from './intent_validator';
import { memoryReactionEvent } from './memory_reactions';
import {
  bossMemoryAudit,
  cloneMemoryAudit,
  creatureMemoryAudit,
  npcInteractionMemoryAudit,
  rumorMemoryAudit,
  worldDirectorMemoryAudit,
  worldTraceMemoryAudit,
} from './memory_audit';
import { objectInspectionEvent, objectInspectionLineIds } from './object_reactions';
import { compactProfileSnapshot, profileFor } from './profiles';
import { buildCodexDecisionPrompt } from './prompt_builder';
import { topicReactionEvent } from './question_reactions';
import { droppedItemSemantic, sceneFrameFor } from './scene_frame';
import type { DroppedItemSemantic, SceneFrameV1 } from './scene_frame';
import { sceneInspectionEvent } from './scene_inspection';
import { sceneAwarenessEvent } from './scene_reactions';
import { individualProfileFor, individualSpeechValues } from './singularity';
import { AiSocialMemoryStore } from './social_memory';
import type { AiNpcMemory, AiRumorMemory } from './social_memory';
import { AiWorldDirectorStore, worldDirectorEvent, worldDirectorEventFromMemoryAudit, worldDirectorProposalFromMemoryAudit } from './world_director';
import type { AiWorldDirectorProposal, AiWorldDirectorProposalAuditEntry, AiWorldDirectorState } from './world_director';
import { AiWorldTraceStore } from './world_traces';
import type { AiWorldTrace } from './world_traces';
import { worldTraceReactionEvent } from './world_trace_reactions';

export interface AiLifeLayerOptions {
  enabled?: boolean;
  provider?: AiProvider;
  journalSize?: number;
  memoryDb?: AiMemoryPersistence;
  memoryPersistBatchSize?: number;
  memoryBudget?: Partial<AiMemoryBudgetPolicy>;
  auditSink?: AiAuditSink;
  auditProviderSource?: Exclude<AiAuditProviderSource, 'fallback' | 'local'>;
  providerCacheEnabled?: boolean;
  providerCacheMaxEntries?: number;
  providerCacheMaxTtlMs?: number;
}

export interface AiMemoryPersistenceQuery {
  sourcePlayerEntityId: number;
  nowSeconds: number;
  sceneId?: string | null;
  zoneId?: string | null;
  kinds?: readonly AiMemoryAuditRecord['kind'][];
  limit?: number;
}

export interface AiMemoryPersistence {
  saveRecords(records: readonly AiMemoryAuditRecord[]): Promise<void>;
  loadRecords?(query: AiMemoryPersistenceQuery): Promise<AiMemoryAuditRecord[]>;
  pruneExpired?(nowSeconds: number, batchSize?: number): Promise<number>;
  enforceBudget?(policy: AiMemoryBudgetPolicy): Promise<AiMemoryBudgetEnforcementResult>;
  clearRecords?(): Promise<number>;
}

export interface AiMemoryBudgetPolicy {
  maxTotalRecords: number;
  maxRecordsPerPlayer: number;
  maxRecordsPerKind: Partial<Record<AiMemoryAuditKind, number>>;
  batchSize: number;
}

export interface AiMemoryBudgetEnforcementResult {
  totalDeleted: number;
  deletedByTotal: number;
  deletedByPlayer: number;
  deletedByKind: Partial<Record<AiMemoryAuditKind, number>>;
  budget: AiMemoryBudgetPolicy;
}

export interface AiLifeLayerMetricsSnapshot {
  providerCalls: number;
  providerSuccesses: number;
  providerErrors: number;
  /** @deprecated Provider failures no longer generate local fallback decisions. */
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
  providerCacheHits: number;
  providerCacheMisses: number;
  providerCacheStores: number;
  providerCacheEntries: number;
  speechPolish: AiSpeechPolishSnapshot;
  lastProviderTimings?: AiProviderTimingSnapshot;
  lastProviderCacheKey?: string;
  lastProviderError?: string;
  lastMemoryPersistenceError?: string;
  lastMemoryPruneError?: string;
  lastMemoryBudgetError?: string;
}

export interface AiLifeLayerDiagnosticsSnapshot {
  recentDecisions: AiDecisionJournalEntry[];
  worldDirectorStates: AiWorldDirectorState[];
  worldDirectorProposalJournal: AiWorldDirectorProposalAuditEntry[];
  socialMemory: {
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
    budget: AiMemoryBudgetPolicy;
    errors: string[];
  };
}

interface AiLifeLayerMetricsState {
  providerCalls: number;
  providerSuccesses: number;
  providerErrors: number;
  /** @deprecated Provider failures no longer generate local fallback decisions. */
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
  maxProviderLatencyMs: number;
  lastProviderLatencyMs: number;
  lastPromptChars: number;
  lastRawOutputChars: number;
  providerCacheHits: number;
  providerCacheMisses: number;
  providerCacheStores: number;
  providerCacheEntries: number;
  speechPolish: AiSpeechPolishSnapshot;
  lastProviderTimings?: AiProviderTimingSnapshot;
  lastProviderCacheKey?: string;
  lastProviderError?: string;
  lastMemoryPersistenceError?: string;
  lastMemoryPruneError?: string;
  lastMemoryBudgetError?: string;
}

interface AiProviderDecisionCacheEntry {
  decision: AiDecisionV1;
  expiresAtMs: number;
}

type AiProviderDecisionAttempt =
  | {
    ok: true;
    fromCache: boolean;
    cacheKey: string | null;
    decision: AiDecisionV1;
    latencyMs: number;
    promptText?: string;
    rawOutput?: string;
    providerTimings?: AiProviderTimingSnapshot;
  }
  | {
    ok: false;
    fromCache: false;
    cacheKey: string | null;
    reason: string;
    latencyMs: number;
  };

interface AiLocalReactionAuditInput {
  jobId: string;
  trigger: AiDecisionJournalEntry['trigger'];
  entityKind?: AiAuditEntityKind;
  entityId: number;
  templateId: string;
  playerEntityId: number;
  reason?: string;
  lineIds: string[];
  intents: string[];
  sceneId?: string | null;
  zoneId?: string | null;
  memoryWrites?: readonly AiMemoryAuditRecord[];
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

export interface NpcAiInteractionRequest {
  sim: Sim;
  pid: number;
  npcId: number;
  locale: string;
  topic?: AiNpcInteractionTopic;
  deliver(events: SimEvent[]): void;
}

export interface ItemDiscardedAiRequest {
  sim: Sim;
  pid: number;
  itemId: string;
  count: number;
  deliver(events: SimEvent[]): void;
}

export interface ObjectAiInspectionRequest {
  sim: Sim;
  pid: number;
  objectId: number;
  locale: string;
  deliver(events: SimEvent[]): void;
}

export interface SceneAiInspectionRequest {
  sim: Sim;
  pid: number;
  locale: string;
  deliver(events: SimEvent[]): void;
}

export interface PetCommandAiRequest {
  sim: Sim;
  pid: number;
  text: string;
  locale: string;
  deliver?: (events: SimEvent[]) => void;
}

export type AiPetCommandAction =
  | { type: 'none'; intent: AiPetCommandIntent; source: Extract<SimEvent, { type: 'aiSpeech' }>['source']; reason: string }
  | { type: 'setMode'; mode: PetMode; intent: AiPetCommandIntent; source: Extract<SimEvent, { type: 'aiSpeech' }>['source']; reason: string }
  | { type: 'attack'; intent: AiPetCommandIntent; source: Extract<SimEvent, { type: 'aiSpeech' }>['source']; reason: string }
  | { type: 'taunt'; intent: AiPetCommandIntent; source: Extract<SimEvent, { type: 'aiSpeech' }>['source']; reason: string };

export type AiPetCommandIntent =
  | 'commandPetPassive'
  | 'commandPetDefensive'
  | 'commandPetAggressive'
  | 'commandPetAttack'
  | 'commandPetTaunt'
  | 'commandPetIgnore';

const PET_COMMAND_INTENTS: readonly AiPetCommandIntent[] = [
  'commandPetPassive',
  'commandPetDefensive',
  'commandPetAggressive',
  'commandPetAttack',
  'commandPetTaunt',
  'commandPetIgnore',
];
const DEFAULT_PROVIDER_CACHE_MAX_ENTRIES = 128;
const DEFAULT_PROVIDER_CACHE_MAX_TTL_MS = 12_000;
const PROVIDER_LATENCY_SAMPLE_LIMIT = 128;
const PROVIDER_CACHE_VERSION = 'ai-decision-cache-v1';
const DEFAULT_MEMORY_BUDGET_TOTAL_RECORDS = 250_000;
const DEFAULT_MEMORY_BUDGET_PER_PLAYER_RECORDS = 20_000;
const DEFAULT_MEMORY_BUDGET_BATCH_SIZE = 2_000;
const MEMORY_BUDGET_KIND_RATIOS: Record<AiMemoryAuditKind, number> = {
  npcInteraction: 0.14,
  rumor: 0.22,
  worldTrace: 0.18,
  creatureMemory: 0.18,
  bossMemory: 0.10,
  worldDirectorState: 0.18,
};

export class AiLifeLayer {
  private readonly enabled: boolean;
  private readonly provider: AiProvider;
  private readonly journal: AiDecisionJournal;
  private readonly socialMemory = new AiSocialMemoryStore();
  private readonly worldTraces = new AiWorldTraceStore();
  private readonly creatureMemory = new AiCreatureMemoryStore();
  private readonly bossMemory = new AiBossEncounterMemoryStore();
  private readonly bossPhaseCues = new AiBossEncounterPhaseCueStore();
  private readonly worldDirector = new AiWorldDirectorStore();
  private readonly memoryDb: AiMemoryPersistence | null;
  private readonly memoryPersistBatchSize: number;
  private readonly memoryBudget: AiMemoryBudgetPolicy;
  private readonly auditSink: AiAuditSink | null;
  private readonly auditProviderSource: Exclude<AiAuditProviderSource, 'fallback' | 'local'>;
  private readonly providerCacheEnabled: boolean;
  private readonly providerCacheMaxEntries: number;
  private readonly providerCacheMaxTtlMs: number;
  private readonly providerDecisionCache = new Map<string, AiProviderDecisionCacheEntry>();
  private readonly pendingMemoryWrites: AiMemoryAuditRecord[] = [];
  private readonly memoryPersistenceErrors: string[] = [];
  private readonly providerLatencySamplesMs: number[] = [];
  private readonly metrics: AiLifeLayerMetricsState = {
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
    maxProviderLatencyMs: 0,
    lastProviderLatencyMs: 0,
    lastPromptChars: 0,
    lastRawOutputChars: 0,
    providerCacheHits: 0,
    providerCacheMisses: 0,
    providerCacheStores: 0,
    providerCacheEntries: 0,
    speechPolish: emptySpeechPolishMetrics(),
  };
  private memoryFlushPromise: Promise<void> | null = null;
  private memoryPrunePromise: Promise<number> | null = null;
  private memoryBudgetPromise: Promise<AiMemoryBudgetEnforcementResult> | null = null;
  private sequence = 0;
  private auditSequence = 0;

  constructor(options: AiLifeLayerOptions = {}) {
    this.enabled = options.enabled ?? process.env.AI_LIVING_WORLD_EXPERIMENT !== '0';
    this.provider = options.provider ?? defaultAiProvider();
    this.journal = new AiDecisionJournal(options.journalSize);
    this.memoryDb = options.memoryDb ?? null;
    this.memoryPersistBatchSize = Math.max(1, Math.min(200, Math.floor(options.memoryPersistBatchSize ?? 32)));
    this.memoryBudget = normalizeMemoryBudgetPolicy(options.memoryBudget);
    this.auditSink = options.auditSink ?? null;
    this.auditProviderSource = options.auditProviderSource
      ?? (options.provider ? 'provider' : 'codex');
    this.providerCacheEnabled = options.providerCacheEnabled ?? process.env.AI_PROVIDER_DECISION_CACHE !== '0';
    this.providerCacheMaxEntries = Math.max(1, Math.floor(options.providerCacheMaxEntries ?? envPositiveIntLocal('AI_PROVIDER_CACHE_MAX_ENTRIES', DEFAULT_PROVIDER_CACHE_MAX_ENTRIES)));
    this.providerCacheMaxTtlMs = Math.max(250, Math.floor(options.providerCacheMaxTtlMs ?? envPositiveIntLocal('AI_PROVIDER_CACHE_MAX_TTL_MS', DEFAULT_PROVIDER_CACHE_MAX_TTL_MS)));
    if (this.enabled && !options.provider) this.provider.warmup?.();
  }

  diagnostics(): AiDecisionJournalEntry[] {
    return this.journal.snapshot();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  providerForActiveTriggers(): AiProvider {
    return this.provider;
  }

  memoryDiagnostics(): { npcMemories: AiNpcMemory[]; rumors: AiRumorMemory[] } {
    return this.socialMemory.snapshot();
  }

  worldTraceDiagnostics(): AiWorldTrace[] {
    return this.worldTraces.snapshot();
  }

  creatureMemoryDiagnostics(): AiCreatureMemory[] {
    return this.creatureMemory.snapshot();
  }

  creaturePlanDiagnostics(): AiCreaturePlan[] {
    return this.creatureMemory.planSnapshot();
  }

  bossMemoryDiagnostics(): AiBossEncounterMemory[] {
    return this.bossMemory.snapshot();
  }

  bossPhaseCueDiagnostics(): AiBossEncounterPhaseCue[] {
    return this.bossPhaseCues.snapshot();
  }

  worldDirectorDiagnostics(): AiWorldDirectorState[] {
    return this.worldDirector.snapshot();
  }

  worldDirectorProposalDiagnostics(): AiWorldDirectorProposalAuditEntry[] {
    return this.worldDirector.proposalAuditSnapshot();
  }

  diagnosticsSnapshot(): AiLifeLayerDiagnosticsSnapshot {
    return {
      recentDecisions: this.diagnostics(),
      worldDirectorStates: this.worldDirectorDiagnostics(),
      worldDirectorProposalJournal: this.worldDirectorProposalDiagnostics(),
      socialMemory: this.memoryDiagnostics(),
      memoryPersistence: this.memoryPersistenceDiagnostics(),
    };
  }

  clearVolatileMemory(nowSeconds = 0): AiVolatileMemoryClearResult {
    const social = this.socialMemory.clear();
    const creature = this.creatureMemory.clear();
    const result: Omit<AiVolatileMemoryClearResult, 'totalCleared'> = {
      npcMemories: social.npcMemories,
      rumors: social.rumors,
      worldTraces: this.worldTraces.clear(),
      creatureMemories: creature.memories,
      creaturePlans: creature.plans,
      bossMemories: this.bossMemory.clear(),
      bossPhaseCues: this.bossPhaseCues.clear(),
      worldDirectorStates: this.worldDirector.clearStates(nowSeconds),
      decisionJournalEntries: this.journal.clear(),
      pendingMemoryWrites: this.pendingMemoryWrites.length,
      persistedMemoryRecords: 0,
    };
    this.pendingMemoryWrites.splice(0);
    this.providerDecisionCache.clear();
    this.metrics.providerCacheEntries = 0;
    return {
      ...result,
      totalCleared: Object.values(result).reduce((sum, count) => sum + count, 0),
    };
  }

  async clearMemory(nowSeconds = 0): Promise<AiVolatileMemoryClearResult> {
    if (this.memoryFlushPromise) await this.memoryFlushPromise.catch(() => {});
    const volatileResult = this.clearVolatileMemory(nowSeconds);
    if (!this.memoryDb?.clearRecords) return volatileResult;
    try {
      const persistedMemoryRecords = normalizeDeletedCount(await this.memoryDb.clearRecords());
      return {
        ...volatileResult,
        persistedMemoryRecords,
        totalCleared: volatileResult.totalCleared + persistedMemoryRecords,
      };
    } catch (err) {
      this.recordMemoryPersistenceError(err, 'clear');
      throw err;
    }
  }

  runtimeMetrics(): AiLifeLayerMetricsSnapshot {
    const percentiles = providerLatencyPercentiles(this.providerLatencySamplesMs);
    return {
      ...this.metrics,
      providerCacheEntries: this.providerDecisionCache.size,
      speechPolish: cloneSpeechPolishSnapshot(this.metrics.speechPolish),
      averageProviderLatencyMs: this.metrics.providerCalls > 0
        ? this.metrics.totalProviderLatencyMs / this.metrics.providerCalls
        : 0,
      providerLatencySampleCount: this.providerLatencySamplesMs.length,
      providerLatencyP50Ms: percentiles.p50,
      providerLatencyP90Ms: percentiles.p90,
      providerLatencyP95Ms: percentiles.p95,
    };
  }

  memoryPersistenceDiagnostics(): AiLifeLayerDiagnosticsSnapshot['memoryPersistence'] {
    return {
      pending: this.pendingMemoryWrites.length,
      flushing: this.memoryFlushPromise !== null,
      pruning: this.memoryPrunePromise !== null,
      budgeting: this.memoryBudgetPromise !== null,
      lastPruneDeleted: this.metrics.lastMemoryPruneDeleted,
      lastBudgetDeleted: this.metrics.lastMemoryBudgetDeleted,
      budget: cloneMemoryBudgetPolicy(this.memoryBudget),
      errors: [...this.memoryPersistenceErrors],
    };
  }

  recordActiveTriggerEvents(input: {
    sim: Sim;
    pid: number;
    events: readonly SimEvent[];
    source: 'scheduler' | 'deliver';
  }): void {
    if (!this.enabled || !this.memoryDb || input.events.length === 0) return;
    const player = input.sim.entities.get(input.pid);
    if (!player) return;
    const scene = sceneFrameFor(input.sim, player.pos, { excludeEntityIds: [player.id] });
    const sceneId = scene.subsceneId ?? scene.zoneId;
    const records: AiMemoryAuditRecord[] = [];
    for (const event of input.events) {
      if (event.type !== 'aiSpeech') continue;
      const speaker = input.sim.entities.get(event.speakerId);
      if (!speaker || (speaker.kind !== 'npc' && speaker.kind !== 'mob')) continue;
      records.push(activeSpeechMemoryAudit({
        event,
        speaker,
        pid: input.pid,
        sceneId,
        zoneId: scene.zoneId,
        nowSeconds: input.sim.time,
        source: input.source,
      }));
    }
    this.enqueueMemoryWrites(records);
  }

  async flushMemoryWrites(): Promise<void> {
    if (!this.memoryDb) return;
    if (this.memoryFlushPromise) return this.memoryFlushPromise;
    if (this.pendingMemoryWrites.length === 0) return;
    this.memoryFlushPromise = this.flushMemoryWritesNow()
      .finally(() => {
        this.memoryFlushPromise = null;
      });
    return this.memoryFlushPromise;
  }

  async pruneExpiredMemory(nowSeconds: number, batchSize = 500): Promise<number> {
    if (!this.memoryDb?.pruneExpired) return 0;
    if (this.memoryPrunePromise) return this.memoryPrunePromise;
    const safeNowSeconds = Number.isFinite(nowSeconds) && nowSeconds >= 0 ? nowSeconds : 0;
    const safeBatchSize = Math.max(1, Math.min(5000, Math.floor(batchSize)));
    this.memoryPrunePromise = this.memoryDb.pruneExpired(safeNowSeconds, safeBatchSize)
      .then((deleted) => {
        const deletedCount = Number.isFinite(deleted) && deleted > 0 ? Math.floor(deleted) : 0;
        this.metrics.memoryPruneRuns++;
        this.metrics.memoryPruneDeleted += deletedCount;
        this.metrics.lastMemoryPruneDeleted = deletedCount;
        return deletedCount;
      })
      .catch((err) => {
        this.recordMemoryPersistenceError(err, 'prune');
        return 0;
      })
      .finally(() => {
        this.memoryPrunePromise = null;
      });
    return this.memoryPrunePromise;
  }

  async enforceMemoryBudget(): Promise<AiMemoryBudgetEnforcementResult> {
    if (!this.memoryDb?.enforceBudget) return zeroMemoryBudgetResult(this.memoryBudget);
    if (this.memoryBudgetPromise) return this.memoryBudgetPromise;
    const policy = cloneMemoryBudgetPolicy(this.memoryBudget);
    this.memoryBudgetPromise = this.memoryDb.enforceBudget(policy)
      .then((result) => {
        const normalized = normalizeMemoryBudgetResult(result, policy);
        this.metrics.memoryBudgetRuns++;
        this.metrics.memoryBudgetDeleted += normalized.totalDeleted;
        this.metrics.lastMemoryBudgetDeleted = normalized.totalDeleted;
        return normalized;
      })
      .catch((err) => {
        this.recordMemoryPersistenceError(err, 'budget');
        return zeroMemoryBudgetResult(policy);
      })
      .finally(() => {
        this.memoryBudgetPromise = null;
      });
    return this.memoryBudgetPromise;
  }

  handleSimEvents(request: { sim: Sim; events: SimEvent[] }): SimEvent[] {
    if (!this.enabled || request.events.length === 0) return [];
    const out: SimEvent[] = [];
    for (const event of request.events) {
      if (event.type === 'questDone') {
        const player = this.playerForPid(request.sim, event.pid);
        const quest = QUESTS[event.questId];
        if (!player || !quest) continue;
        const scene = sceneFrameFor(request.sim, player.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const lineId = 'hudChrome.aiSpeech.memoryQuestRumorEcho';
        const rumor = this.socialMemory.noteQuestRumor({
          sceneId,
          zoneId: scene.zoneId,
          questId: event.questId,
          sourcePlayerEntityId: player.id,
          lineIds: [lineId],
          nowSeconds: request.sim.time,
        });
        const directorState = this.worldDirector.noteQuestCompletion({
          sceneId,
          zoneId: scene.zoneId,
          questId: event.questId,
          sourcePlayerEntityId: player.id,
          nowSeconds: request.sim.time,
        });
        const memoryWrites = [
          rumorMemoryAudit(rumor, `questDone:${event.questId}`),
          worldDirectorMemoryAudit(directorState, `questDone:${event.questId}`),
        ];
        this.recordLocalReaction({
          jobId: `quest-rumor-${player.id}-${++this.sequence}`,
          trigger: 'quest_completed',
          entityId: player.id,
          templateId: player.templateId,
          playerEntityId: player.id,
          reason: `questDone:${event.questId}`,
          lineIds: [lineId],
          intents: ['rememberQuestFact', 'spreadRumor'],
          sceneId,
          memoryWrites,
        });
        this.metrics.localReactions++;
        this.enqueueMemoryWrites(memoryWrites);
        continue;
      }
      if (event.type === 'damage') {
        if (event.kind !== 'hit' || event.amount <= 0) continue;
        const target = request.sim.entities.get(event.targetId);
        if (!target || target.kind !== 'mob') continue;
        const scale = bossEncounterScale(target);
        if (!scale) continue;
        const source = request.sim.entities.get(event.sourceId);
        const sourcePlayer = this.playerForEncounterSource(request.sim, source) ?? this.playerForPid(request.sim, target.tappedById);
        if (!sourcePlayer) continue;
        const scene = sceneFrameFor(request.sim, target.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const cue = this.bossPhaseCues.noteDamagePhase({
          sceneId,
          entity: target,
          scale,
          sourcePlayerEntityId: sourcePlayer.id,
          nowSeconds: request.sim.time,
          evidence: [`simEvent:damage`, `source:${source?.templateId ?? 'unknown'}`, `amount:${event.amount}`],
        });
        if (!cue) continue;
        this.recordLocalReaction({
          jobId: `encounter-phase-${sourcePlayer.id}-${++this.sequence}`,
          trigger: 'encounter_memory',
          entityId: target.id,
          templateId: target.templateId,
          playerEntityId: sourcePlayer.id,
          reason: `bossPhase:${cue.phase}:${target.templateId}`,
          lineIds: [cue.lineId],
          intents: ['readEncounterPhase', 'commentOnScene'],
          sceneId,
        });
        this.metrics.localReactions++;
        out.push(bossEncounterPhaseEvent(cue, target, sourcePlayer.id));
        continue;
      }
      if (event.type !== 'death') continue;
      const dead = request.sim.entities.get(event.entityId);
      const killer = request.sim.entities.get(event.killerId);
      if (!dead) continue;

      if (dead.kind === 'mob') {
        const sourcePlayer = this.playerForEncounterSource(request.sim, killer) ?? this.playerForPid(request.sim, dead.tappedById);
        if (sourcePlayer) this.recordSingularityCreatureTrace(request.sim, dead, sourcePlayer, 'singularityDeath');
        const scale = bossEncounterScale(dead);
        if (!scale) continue;
        if (!sourcePlayer) continue;
        const scene = sceneFrameFor(request.sim, dead.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const memory = this.bossMemory.noteEncounter({
          sceneId,
          entity: dead,
          scale,
          outcome: 'defeated',
          sourcePlayerEntityId: sourcePlayer.id,
          nowSeconds: request.sim.time,
          evidence: [`simEvent:death`, `killer:${killer?.templateId ?? 'unknown'}`],
        });
        const directorState = this.worldDirector.noteBossMemory({ memory, nowSeconds: request.sim.time });
        const memoryWrites = [
          bossMemoryAudit(memory, `boss:${memory.outcome}:${dead.templateId}`),
          worldDirectorMemoryAudit(directorState, `boss:${memory.outcome}:${dead.templateId}`),
        ];
        this.recordLocalReaction({
          jobId: `encounter-${sourcePlayer.id}-${++this.sequence}`,
          trigger: 'encounter_memory',
          entityId: dead.id,
          templateId: dead.templateId,
          playerEntityId: sourcePlayer.id,
          reason: `boss:${memory.outcome}:${dead.templateId}`,
          lineIds: [memory.lineId],
          intents: ['rememberEncounter', 'readWorldDirectorState'],
          sceneId,
          memoryWrites,
        });
        this.metrics.localReactions++;
        this.enqueueMemoryWrites(memoryWrites);
        out.push(bossEncounterMemoryEvent(memory, dead, sourcePlayer.id));
      } else if (dead.kind === 'player' && killer?.kind === 'mob') {
        this.recordSingularityCreatureTrace(request.sim, killer, dead, 'singularityPlayerDefeat');
        const scale = bossEncounterScale(killer);
        if (!scale) continue;
        const scene = sceneFrameFor(request.sim, killer.pos);
        const sceneId = scene.subsceneId ?? scene.zoneId;
        const memory = this.bossMemory.noteEncounter({
          sceneId,
          entity: killer,
          scale,
          outcome: 'wipe',
          sourcePlayerEntityId: dead.id,
          nowSeconds: request.sim.time,
          evidence: [`simEvent:playerDeath`, `killer:${killer.templateId}`],
        });
        const directorState = this.worldDirector.noteBossMemory({ memory, nowSeconds: request.sim.time });
        const memoryWrites = [
          bossMemoryAudit(memory, `boss:${memory.outcome}:${killer.templateId}`),
          worldDirectorMemoryAudit(directorState, `boss:${memory.outcome}:${killer.templateId}`),
        ];
        this.recordLocalReaction({
          jobId: `encounter-${dead.id}-${++this.sequence}`,
          trigger: 'encounter_memory',
          entityId: killer.id,
          templateId: killer.templateId,
          playerEntityId: dead.id,
          reason: `boss:${memory.outcome}:${killer.templateId}`,
          lineIds: [memory.lineId],
          intents: ['rememberEncounter', 'readWorldDirectorState'],
          sceneId,
          memoryWrites,
        });
        this.metrics.localReactions++;
        this.enqueueMemoryWrites(memoryWrites);
        out.push(bossEncounterMemoryEvent(memory, killer, dead.id));
      }
    }
    this.metrics.generatedEvents += out.length;
    return out;
  }

  private recordSingularityCreatureTrace(sim: Sim, creature: Entity, sourcePlayer: Entity, reason: 'singularityDeath' | 'singularityPlayerDefeat'): void {
    const individual = individualProfileFor(creature, sim.cfg.seed);
    if (individual.tier !== 'singularity') return;
    const scene = sceneFrameFor(sim, creature.pos);
    const sceneId = scene.subsceneId ?? scene.zoneId;
    const reasonLineId = 'hudChrome.aiSpeech.singularityInspect';
    const trace = this.worldTraces.noteCreatureTrace({
      sceneId,
      zoneId: scene.zoneId,
      entity: creature,
      sourcePlayerEntityId: sourcePlayer.id,
      reasonLineIds: [reasonLineId, ...individual.traits.map((trait) => `trait:${trait}`)],
      nowSeconds: sim.time,
    });
    const directorState = this.worldDirector.noteTrace({ trace, nowSeconds: sim.time });
    const memoryWrites = [
      worldTraceMemoryAudit(trace, `${reason}:${creature.templateId}`),
      worldDirectorMemoryAudit(directorState, `${reason}:${creature.templateId}`),
    ];
    this.recordLocalReaction({
      jobId: `${reason}-${sourcePlayer.id}-${++this.sequence}`,
      trigger: 'encounter_memory',
      entityId: creature.id,
      templateId: creature.templateId,
      playerEntityId: sourcePlayer.id,
      reason: `${reason}:${creature.templateId}`,
      lineIds: [trace.lineId, reasonLineId],
      intents: [
        'leaveWorldTrace',
        'writeWorldDirectorState',
        reason === 'singularityDeath' ? 'rememberSingularityDeath' : 'rememberSingularityPlayerDefeat',
      ],
      sceneId,
      memoryWrites,
    });
    this.metrics.localReactions++;
    this.enqueueMemoryWrites(memoryWrites);
  }

  async handleNpcInteraction(request: NpcAiInteractionRequest): Promise<void> {
    if (!this.enabled) return;
    const context = this.buildNpcContext(request);
    if (!context) return;
    const npc = request.sim.entities.get(request.npcId);
    if (!npc) return;
    const subject = classifyCanonSubject(npc);
    const memory = this.socialMemory.noteNpcInteraction(context, request.sim.time);
    context.recentObservations.push(`npcMemory:${memory.interactionCount}`);
    const sceneId = context.scene?.subsceneId ?? context.scene?.zoneId;
    const zoneId = context.scene?.zoneId ?? sceneId;
    const npcMemoryWrite = npcInteractionMemoryAudit({
      playerEntityId: context.player.entityId,
      templateId: context.entity.templateId,
      interactionCount: memory.interactionCount,
      sceneId,
      lineIds: context.profile?.socialMemory?.recognitionLineId ? [context.profile.socialMemory.recognitionLineId] : [],
      reason: context.trigger,
      nowSeconds: request.sim.time,
    });
    const trace = this.worldTraces.traceForScene(sceneId, request.pid, request.sim.time);
    if (trace) context.recentObservations.push(`worldTrace:${trace.kind}:${trace.itemId}:${trace.strength.toFixed(2)}`);
    const directorState = this.worldDirector.stateForScene(sceneId, request.pid, request.sim.time)
      ?? this.worldDirector.stateForRegion({ zoneId, sceneId, playerEntityId: request.pid, nowSeconds: request.sim.time, includeAdjacentZones: true });
    if (directorState) context.recentObservations.push(`worldDirector:${directorState.mood}:${directorState.itemId}:${directorState.heat.toFixed(2)}`);
    const directorProposals = cloneDirectorProposals([directorState?.proposal]);
    if (directorProposals.length > 0) context.directorProposals = directorProposals;
    const encounterMemory = this.bossMemory.memoryForScene(sceneId, request.pid, request.sim.time);
    if (encounterMemory) context.recentObservations.push(`bossMemory:${encounterMemory.outcome}:${encounterMemory.templateId}:${encounterMemory.heat.toFixed(2)}`);
    const sceneRumor = this.socialMemory.rumorForScene(sceneId, request.pid, request.sim.time);
    const regionRumor = sceneRumor ? null : this.socialMemory.rumorForRegion({
      zoneId,
      sceneId,
      playerEntityId: request.pid,
      nowSeconds: request.sim.time,
    });
    const rumor = sceneRumor ?? regionRumor;
    if (sceneRumor) context.recentObservations.push(`${sceneRumor.subjectKind}SceneRumor:${sceneRumor.itemId}:${sceneRumor.strength.toFixed(2)}`);
    if (regionRumor) context.recentObservations.push(`${regionRumor.subjectKind}RegionRumor:${regionRumor.originSceneId}:${regionRumor.itemId}:${regionRumor.strength.toFixed(2)}`);
    const persistedSignals = await this.loadPersistedMemorySignals({
      sourcePlayerEntityId: request.pid,
      nowSeconds: request.sim.time,
      sceneId,
      zoneId,
      limit: 8,
    });
    const memoryWrites = [npcMemoryWrite];
    context.memorySignals = [
      npcMemoryWrite,
      ...(trace ? [worldTraceMemoryAudit(trace, 'readActiveWorldTrace')] : []),
      ...(directorState ? [worldDirectorMemoryAudit(directorState, 'readActiveWorldDirectorState')] : []),
      ...(encounterMemory ? [bossMemoryAudit(encounterMemory, 'readActiveBossMemory')] : []),
      ...(rumor ? [rumorMemoryAudit(rumor, rumor.scope === 'region' ? 'readRegionRumor' : 'readSceneRumor')] : []),
      ...persistedSignals,
    ];
    const replyCandidates = {
      sceneEvent: sceneAwarenessEvent(context, npc),
      traceEvent: worldTraceReactionEvent(context, npc, trace),
      directorEvent: shouldShareWorldDirector(request.topic, directorState, rumor)
        ? worldDirectorEvent(context.scene ?? null, npc, directorState, request.pid)
        : null,
      memoryEvent: memoryReactionEvent(context, npc, memory, rumor),
      topicEvent: topicReactionEvent(context, npc, memory, rumor),
    };
    let decision: AiDecisionV1;
    let promptText: string | undefined;
    let rawOutput: string | undefined;
    let providerTimings: AiProviderTimingSnapshot | undefined;
    let providerLatencyMs = 0;
    const providerAttempt = await this.decideWithProviderCache(context);
    if (!providerAttempt.ok) {
      const reason = providerAttempt.reason;
      providerLatencyMs = providerAttempt.latencyMs;
      this.journal.recordProviderError(context, reason, memoryWrites);
      const fallbackEvents = directNpcReplyEvents(context, npc, [], replyCandidates);
      const fallbackEvent = fallbackEvents[0] ?? npcLocalFallbackEvent(context, npc);
      const deliveredEvents = fallbackEvents.length > 0
        ? fallbackEvents
        : fallbackEvent
          ? [fallbackEvent]
          : [providerFailureErrorEvent(context, reason)];
      if (fallbackEvents.length > 0 || fallbackEvent) this.metrics.providerFallbacks++;
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision: null,
        result: null,
        memoryWrites,
        providerError: reason,
        deliveredEvents,
      });
      this.enqueueMemoryWrites(memoryWrites);
      this.metrics.generatedEvents += deliveredEvents.length;
      request.deliver(deliveredEvents);
      return;
    }
    ({ decision, promptText, rawOutput, providerTimings, latencyMs: providerLatencyMs } = providerAttempt);
    const result = validateAiDecision({ decision, context, entity: npc, subject, source: 'codex' });
    this.recordSpeechPolish(result.speechPolish);
    if (result.ok) {
      this.metrics.acceptedDecisions++;
      this.storeProviderDecisionInCache(context, providerAttempt, result);
    } else {
      this.metrics.rejectedDecisions++;
    }
    this.journal.recordDecision(context, decision, result, memoryWrites);
    this.enqueueMemoryWrites(memoryWrites);
    if (!result.ok) {
      const fallbackEvents = directNpcReplyEvents(context, npc, [], replyCandidates);
      const fallbackEvent = fallbackEvents[0] ?? npcLocalFallbackEvent(context, npc);
      const deliveredEvents = fallbackEvents.length > 0
        ? fallbackEvents
        : fallbackEvent
          ? [fallbackEvent]
          : [providerRejectedErrorEvent(context, result.reason ?? 'provider output rejected by validator')];
      if (fallbackEvents.length > 0 || fallbackEvent) this.metrics.providerFallbacks++;
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision,
        result,
        memoryWrites,
        promptText,
        rawOutput,
        providerTimings,
        deliveredEvents,
      });
      this.metrics.generatedEvents += deliveredEvents.length;
      request.deliver(deliveredEvents);
      return;
    }
    if (result.ok) {
      const events = directNpcReplyEvents(context, npc, result.events, {
        sceneEvent: replyCandidates.sceneEvent,
        traceEvent: replyCandidates.traceEvent,
        directorEvent: replyCandidates.directorEvent,
        memoryEvent: replyCandidates.memoryEvent,
        topicEvent: replyCandidates.topicEvent,
      });
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision,
        result,
        memoryWrites,
        promptText,
        rawOutput,
        providerTimings,
        deliveredEvents: events,
      });
      if (events.length > 0) {
        this.metrics.generatedEvents += events.length;
        request.deliver(events);
      }
    }
  }

  async handleItemDiscarded(request: ItemDiscardedAiRequest): Promise<void> {
    if (!this.enabled) return;
    const player = request.sim.entities.get(request.pid);
    if (!player || request.count <= 0) return;
    const dropped = droppedItemSemantic(request.itemId, 0, request.pid);
    if (!dropped) return;
    const scene = sceneFrameFor(request.sim, player.pos, {
      droppedItems: [dropped],
      recentSceneEvents: [`playerDiscarded:${request.itemId}`],
    });
    const itemTargetPos = { x: player.pos.x, z: player.pos.z };
    const candidates = nearbyReactionCandidates(scene, request.sim.entities.values(), player);
    const reactions = rankItemReactions(scene, dropped, candidates, { worldSeed: request.sim.cfg.seed }).slice(0, 2);
    const sceneId = scene.subsceneId ?? scene.zoneId;
    const reactionLineIds = reactions.map((reaction) => reaction.lineId);
    const memoryWrites: AiMemoryAuditRecord[] = [];
    const trace = this.worldTraces.noteItemTrace({
      sceneId,
      zoneId: scene.zoneId,
      item: dropped,
      sourcePlayerEntityId: request.pid,
      reasonLineIds: reactionLineIds,
      nowSeconds: request.sim.time,
    });
    if (trace) {
      const directorState = this.worldDirector.noteTrace({ trace, nowSeconds: request.sim.time });
      memoryWrites.push(
        worldTraceMemoryAudit(trace, `discarded:${request.itemId}`),
        worldDirectorMemoryAudit(directorState, `discarded:${request.itemId}`),
      );
    }
    if (reactions.length > 0) {
      const rumor = this.socialMemory.noteItemRumor({
        sceneId,
        zoneId: scene.zoneId,
        itemId: dropped.itemId,
        sourcePlayerEntityId: request.pid,
        lineIds: reactionLineIds,
        nowSeconds: request.sim.time,
      });
      memoryWrites.push(rumorMemoryAudit(rumor, `discarded:${request.itemId}`));
    }
    const events: SimEvent[] = [];
    for (const reaction of reactions) {
      let localEvent = itemInterestReactionEvent(reaction, dropped, scene, request.pid, itemTargetPos);
      let reactionEvents: SimEvent[] = [localEvent];
      if (reaction.individual?.tier === 'singularity') {
        const memory = this.creatureMemory.noteSingularityReaction({
          entity: reaction.entity,
          player,
          individual: reaction.individual,
          nowSeconds: request.sim.time,
        });
        const plan = this.creatureMemory.notePlan({
          memory,
          entity: reaction.entity,
          player,
          individual: reaction.individual,
          scene,
          item: dropped,
          trigger: 'item_discarded',
          nowSeconds: request.sim.time,
        });
        if (plan) {
          localEvent = withReactionMetadata(localEvent, creaturePlanReactionMetadata(plan));
          reactionEvents = [localEvent];
        }
        const memoryEvent = singularityCreatureMemoryEvent(player, reaction.entity, dropped, memory, plan);
        const creatureWrite = creatureMemoryAudit({
          memory,
          sceneId,
          itemId: dropped.itemId,
          reason: plan ? `singularityReaction:${dropped.itemId}:plan:${plan.kind}` : `singularityReaction:${dropped.itemId}`,
        });
        memoryWrites.push(creatureWrite);
        const directorState = this.worldDirector.noteCreatureMemory({
          sceneId,
          itemId: dropped.itemId,
          memory,
          plan,
          sourcePlayerEntityId: request.pid,
          nowSeconds: request.sim.time,
        });
        if (directorState) memoryWrites.push(worldDirectorMemoryAudit(directorState, `creatureMemory:${dropped.itemId}`));
        const context = this.buildSingularityContext({
          sim: request.sim,
          pid: request.pid,
          player,
          entity: reaction.entity,
          scene,
          locale: 'en',
          eventKind: 'item_discarded',
          reactionKind: reaction.reaction,
          suggestedLineId: reaction.lineId,
          item: dropped,
          score: reaction.score,
          fear: reaction.fear,
          curiosity: reaction.curiosity,
          reasonTags: reaction.reasonTags,
          individualTraits: reaction.individual.traits,
          plan,
          memorySignals: memoryWrites,
          directorProposals: [directorState?.proposal],
        });
        if (context) reactionEvents = await this.decideSingularityReactionEvents(context, reaction.entity, localEvent, memoryWrites);
        if (memoryEvent && !hasAiProviderErrorEvent(reactionEvents)) reactionEvents.push(memoryEvent);
      }
      events.push(...reactionEvents);
    }
    if (reactions.length > 0 || trace) {
      this.recordLocalReaction({
        jobId: `local-${request.pid}-${++this.sequence}`,
        trigger: 'item_discarded',
        entityId: player.id,
        templateId: player.templateId,
        playerEntityId: request.pid,
        reason: `discarded:${request.itemId}`,
        lineIds: trace ? [...reactionLineIds, trace.lineId] : reactionLineIds,
        intents: trace ? [...reactions.map((reaction) => reaction.reaction), 'leaveWorldTrace'] : reactions.map((reaction) => reaction.reaction),
        sceneId,
        memoryWrites,
      });
      this.metrics.localReactions++;
      this.enqueueMemoryWrites(memoryWrites);
    }
    if (events.length > 0) {
      this.metrics.generatedEvents += events.length;
      request.deliver(events);
    }
  }

  async handleObjectInspection(request: ObjectAiInspectionRequest): Promise<void> {
    if (!this.enabled) return;
    const context = this.buildObjectContext(request);
    if (!context) return;
    const object = request.sim.entities.get(request.objectId);
    if (!object || object.kind !== 'object') return;
    const localEvent = objectInspectionEvent(context, object);
    if (!localEvent || localEvent.type !== 'aiSpeech') return;
    const localLineIds = aiSpeechLineIds([localEvent]);
    if (localLineIds[0]) context.recentObservations.push(`suggestedLineId:${localLineIds[0]}`);
    const sceneId = context.scene?.subsceneId ?? context.scene?.zoneId;
    const zoneId = context.scene?.zoneId ?? sceneId;
    const directorState = this.worldDirector.stateForScene(sceneId, request.pid, request.sim.time)
      ?? this.worldDirector.stateForRegion({ zoneId, sceneId, playerEntityId: request.pid, nowSeconds: request.sim.time, includeAdjacentZones: true });
    if (directorState) {
      context.recentObservations.push(`worldDirector:${directorState.mood}:${directorState.itemId}:${directorState.heat.toFixed(2)}`);
      context.directorProposals = cloneDirectorProposals([directorState.proposal]);
      context.memorySignals = [
        ...(context.memorySignals ?? []),
        worldDirectorMemoryAudit(directorState, 'readObjectWorldDirectorState'),
      ];
    }
    const persistedSignals = await this.loadPersistedMemorySignals({
      sourcePlayerEntityId: request.pid,
      nowSeconds: request.sim.time,
      sceneId,
      zoneId,
      limit: 8,
    });
    appendMemorySignals(context, persistedSignals);
    if (!directorState) {
      const persistedProposal = worldDirectorProposalFromMemoryAudit(firstPersistedWorldDirectorSignal(persistedSignals));
      if (persistedProposal) context.directorProposals = cloneDirectorProposals([persistedProposal]);
    }
    const memoryWrites: AiMemoryAuditRecord[] = [];
    const sideEvents: SimEvent[] = [];
    sideEvents.push(...companionReactionEvents(context));
    const sideLineIds = aiSpeechLineIds(sideEvents);
    const inspectedItem = object.objectItemId ? droppedItemSemantic(object.objectItemId, 0, request.pid) : null;
    if (inspectedItem && context.scene) {
      const reactions = rankItemReactions(
        context.scene,
        inspectedItem,
        nearbyReactionCandidates(context.scene, request.sim.entities.values(), object),
        { worldSeed: request.sim.cfg.seed },
      ).slice(0, 2);
      sideLineIds.push(...reactions.map((reaction) => reaction.lineId));
      const rumor = this.socialMemory.noteItemRumor({
        sceneId: context.scene.subsceneId ?? context.scene.zoneId,
        zoneId: context.scene.zoneId,
        itemId: inspectedItem.itemId,
        sourcePlayerEntityId: request.pid,
        lineIds: [...localLineIds, ...sideLineIds],
        nowSeconds: request.sim.time,
      });
      memoryWrites.push(rumorMemoryAudit(rumor, `inspect:${object.objectItemId ?? object.templateId}`));
      sideEvents.push(...reactions.map((reaction) => ({
        type: 'aiSpeech' as const,
        speakerId: reaction.entity.id,
        speakerName: reaction.entity.name,
        speech: {
          mode: 'lineId' as const,
          lineId: reaction.lineId,
          values: {
            speakerName: reaction.entity.name,
            speakerTemplateId: reaction.entity.templateId,
            itemId: inspectedItem.itemId,
            reaction: reaction.reaction,
            score: Math.round(reaction.score * 100),
            ...individualSpeechValues(reaction.individual),
          },
        },
        source: 'local' as const,
        reaction: {
          kind: reaction.reaction,
          targetItemId: inspectedItem.itemId,
          targetObjectId: object.id,
          score: Math.round(reaction.score * 100) / 100,
          sceneTags: [...new Set([...context.scene!.locationTags, ...context.scene!.structureTags, ...context.scene!.environmentalTags])].slice(0, 8),
          individualTier: reaction.individual?.tier,
          individualTraits: reaction.individual?.traits,
        },
        pid: request.pid,
      })));
    }
    const objectEvents = await this.decideObjectInspectionEvents(context, object, localEvent, memoryWrites);
    const events: SimEvent[] = [...objectEvents, ...sideEvents];
    this.metrics.localReactions++;
    this.enqueueMemoryWrites(memoryWrites);
    this.metrics.generatedEvents += events.length;
    request.deliver(events);
  }

  async handlePetCommand(request: PetCommandAiRequest): Promise<AiPetCommandAction | null> {
    if (!this.enabled) return null;
    const context = this.buildPetCommandContext(request);
    if (!context) return null;
    const pet = request.sim.entities.get(context.entity.entityId);
    if (!pet || pet.kind !== 'mob' || pet.ownerId !== request.pid) return null;
    let decision: AiDecisionV1;
    let promptText: string | undefined;
    let rawOutput: string | undefined;
    let providerTimings: AiProviderTimingSnapshot | undefined;
    let providerLatencyMs = 0;
    const providerAttempt = await this.decideWithProviderCache(context);
    if (!providerAttempt.ok) {
      const reason = providerAttempt.reason;
      providerLatencyMs = providerAttempt.latencyMs;
      this.journal.recordProviderError(context, reason);
      const event = providerFailureErrorEvent(context, reason);
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision: null,
        result: null,
        providerError: reason,
        deliveredEvents: [event],
      });
      this.metrics.generatedEvents++;
      request.deliver?.([event]);
      return null;
    }
    ({ decision, promptText, rawOutput, providerTimings, latencyMs: providerLatencyMs } = providerAttempt);
    const result = validateAiDecision({ decision, context, entity: pet, subject: 'ordinary', source: 'codex' });
    this.recordSpeechPolish(result.speechPolish);
    if (result.ok) {
      this.metrics.acceptedDecisions++;
      this.storeProviderDecisionInCache(context, providerAttempt, result);
    } else {
      this.metrics.rejectedDecisions++;
    }
    this.journal.recordDecision(context, decision, result);
    if (!result.ok) {
      const event = providerRejectedErrorEvent(context, result.reason ?? 'provider output rejected by validator');
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision,
        result,
        promptText,
        rawOutput,
        providerTimings,
        deliveredEvents: [event],
      });
      this.metrics.generatedEvents++;
      request.deliver?.([event]);
      return null;
    }
    const intent = firstPetCommandIntent(decision);
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      promptText,
      rawOutput,
      providerTimings,
      deliveredEvents: [],
    });
    if (!intent) return petCommandActionFromIntent('commandPetIgnore', 'codex', `${decision.audit.shortReason}: no bounded pet intent`);
    return petCommandActionFromIntent(intent, 'codex', decision.audit.shortReason);
  }

  private async decideObjectInspectionEvents(
    context: AiJobContextV1,
    object: Entity,
    localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
    memoryWrites: AiMemoryAuditRecord[],
  ): Promise<SimEvent[]> {
    const subject = classifyCanonSubject(object);
    let decision: AiDecisionV1;
    let promptText: string | undefined;
    let rawOutput: string | undefined;
    let providerTimings: AiProviderTimingSnapshot | undefined;
    let providerLatencyMs = 0;
    const providerAttempt = await this.decideWithProviderCache(context);
    if (!providerAttempt.ok) {
      const reason = providerAttempt.reason;
      providerLatencyMs = providerAttempt.latencyMs;
      this.journal.recordProviderError(context, reason, memoryWrites);
      const event = providerFailureErrorEvent(context, reason);
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision: null,
        result: null,
        memoryWrites,
        providerError: reason,
        deliveredEvents: [event],
      });
      return [event];
    }
    ({ decision, promptText, rawOutput, providerTimings, latencyMs: providerLatencyMs } = providerAttempt);
    const result = validateAiDecision({ decision, context, entity: object, subject, source: 'codex' });
    this.recordSpeechPolish(result.speechPolish);
    if (result.ok) {
      this.metrics.acceptedDecisions++;
      this.storeProviderDecisionInCache(context, providerAttempt, result);
    } else {
      this.metrics.rejectedDecisions++;
    }
    this.journal.recordDecision(context, decision, result, memoryWrites);
    if (!result.ok) {
      const event = providerRejectedErrorEvent(context, result.reason ?? 'provider output rejected by validator');
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision,
        result,
        memoryWrites,
        promptText,
        rawOutput,
        providerTimings,
        deliveredEvents: [event],
      });
      return [event];
    }
    const events = mergeObjectInspectionShell(result.events, localEvent);
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      memoryWrites,
      promptText,
      rawOutput,
      providerTimings,
      deliveredEvents: events,
    });
    return events;
  }

  stop(): void {
    this.provider.close?.();
  }

  private buildSingularityContext(input: {
    sim: Sim;
    pid: number;
    player: Entity;
    entity: Entity;
    scene: SceneFrameV1;
    locale: string;
    eventKind: 'item_discarded' | 'scene_inspected';
    reactionKind: 'approach' | 'avoid' | 'inspect' | 'ignore';
    suggestedLineId: string;
    item?: DroppedItemSemantic;
    score: number;
    fear: number;
    curiosity: number;
    reasonTags: readonly string[];
    individualTraits: readonly string[];
    plan?: AiCreaturePlan | null;
    memorySignals: readonly AiMemoryAuditRecord[];
    directorProposals?: readonly (AiWorldDirectorProposal | null | undefined)[];
  }): AiJobContextV1 | null {
    const meta = input.sim.meta(input.pid);
    if (!meta || input.entity.kind !== 'mob') return null;
    const profile = profileFor('mob', input.entity.templateId);
    const item = input.item;
    return {
      schemaVersion: 1,
      jobId: `ai-singularity-${input.pid}-${input.entity.id}-${++this.sequence}`,
      trigger: 'singularity_candidate',
      entity: {
        kind: 'mob',
        entityId: input.entity.id,
        templateId: input.entity.templateId,
        name: input.entity.name,
        level: input.entity.level,
        questIds: [...input.entity.questIds],
        dead: input.entity.dead,
      },
      player: {
        entityId: input.player.id,
        name: input.player.name,
        level: input.player.level,
        classId: input.player.templateId,
        activeQuestIds: [...meta.questLog.keys()],
        completedQuestIds: [...meta.questsDone],
      },
      locale: normalizeLocale(input.locale),
      profile: compactProfileSnapshot(profile),
      scene: input.scene,
      familySemantics: compactFamilySemanticsForEntity(input.entity),
      questFacts: [],
      recentObservations: [
        `event:${input.eventKind}`,
        `scene:${input.scene.subsceneId ?? input.scene.zoneId}`,
        `reaction:${input.reactionKind}`,
        `score:${input.score.toFixed(2)}`,
        `fear:${input.fear.toFixed(2)}`,
        `curiosity:${input.curiosity.toFixed(2)}`,
        `individualTier:singularity`,
        `individualTraits:${input.individualTraits.join('|') || 'none'}`,
        ...(input.plan ? [
          `creaturePlan:${input.plan.kind}`,
          `planIntensity:${input.plan.intensity.toFixed(2)}`,
          ...input.plan.evidence.slice(0, 5).map((evidence) => `planEvidence:${evidence}`),
        ] : []),
        `suggestedLineId:${input.suggestedLineId}`,
        ...input.reasonTags.slice(0, 5).map((tag) => `reasonTag:${tag}`),
        ...(item ? [
          `item:${item.itemId}`,
          ...item.itemTags.slice(0, 4).map((tag) => `itemTag:${tag}`),
          ...item.dangerTags.slice(0, 3).map((tag) => `dangerTag:${tag}`),
          ...item.valueSignals.slice(0, 3).map((tag) => `valueSignal:${tag}`),
        ] : []),
        ...input.scene.environmentalTags.slice(0, 4).map((tag) => `sceneTag:${tag}`),
        `time:${input.scene.time.phase}`,
        `weather:${input.scene.weather.kind}`,
      ],
      memorySignals: input.memorySignals.map(cloneMemoryAudit),
      ...(input.directorProposals && input.directorProposals.length > 0
        ? { directorProposals: cloneDirectorProposals(input.directorProposals) }
        : {}),
      allowedIntents: profile.allowedIntentTypes,
      allowedLineIds: profile.allowedLineIds,
      outputMode: 'line_id_only',
    };
  }

  private async decideSingularityReactionEvents(
    context: AiJobContextV1,
    entity: Entity,
    localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
    memoryWrites: readonly AiMemoryAuditRecord[],
  ): Promise<SimEvent[]> {
    const subject = classifyCanonSubject(entity);
    let decision: AiDecisionV1;
    let promptText: string | undefined;
    let rawOutput: string | undefined;
    let providerTimings: AiProviderTimingSnapshot | undefined;
    let providerLatencyMs = 0;
    const providerAttempt = await this.decideWithProviderCache(context);
    if (!providerAttempt.ok) {
      const reason = providerAttempt.reason;
      providerLatencyMs = providerAttempt.latencyMs;
      this.journal.recordProviderError(context, reason, memoryWrites);
      const event = providerFailureErrorEvent(context, reason);
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision: null,
        result: null,
        memoryWrites,
        providerError: reason,
        deliveredEvents: [event],
      });
      return [event];
    }
    ({ decision, promptText, rawOutput, providerTimings, latencyMs: providerLatencyMs } = providerAttempt);
    const result = validateAiDecision({ decision, context, entity, subject, source: 'codex' });
    this.recordSpeechPolish(result.speechPolish);
    if (result.ok) {
      this.metrics.acceptedDecisions++;
      this.storeProviderDecisionInCache(context, providerAttempt, result);
    } else {
      this.metrics.rejectedDecisions++;
    }
    this.journal.recordDecision(context, decision, result, memoryWrites);
    if (!result.ok) {
      const event = providerRejectedErrorEvent(context, result.reason ?? 'provider output rejected by validator');
      this.recordProviderAudit({
        context,
        latencyMs: providerLatencyMs,
        decision,
        result,
        memoryWrites,
        promptText,
        rawOutput,
        providerTimings,
        deliveredEvents: [event],
      });
      return [event];
    }
    const events = mergeSingularityReactionShell(result.events, localEvent);
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      memoryWrites,
      promptText,
      rawOutput,
      providerTimings,
      deliveredEvents: events,
    });
    return events;
  }

  async handleSceneInspection(request: SceneAiInspectionRequest): Promise<void> {
    if (!this.enabled) return;
    const player = request.sim.entities.get(request.pid);
    if (!player) return;
    const scene = sceneFrameFor(request.sim, player.pos);
    const sceneId = scene.subsceneId ?? scene.zoneId;
    const trace = this.worldTraces.traceForScene(sceneId, request.pid, request.sim.time);
    const directorState = this.worldDirector.stateForScene(sceneId, request.pid, request.sim.time)
      ?? this.worldDirector.stateForRegion({ zoneId: scene.zoneId, sceneId, playerEntityId: request.pid, nowSeconds: request.sim.time, includeAdjacentZones: true });
    const encounterMemory = this.bossMemory.memoryForScene(sceneId, request.pid, request.sim.time);
    const persistedSignals = await this.loadPersistedMemorySignals({
      sourcePlayerEntityId: request.pid,
      nowSeconds: request.sim.time,
      sceneId,
      zoneId: scene.zoneId,
      limit: 8,
    });
    const persistedDirectorProposal = !directorState
      ? worldDirectorProposalFromMemoryAudit(firstPersistedWorldDirectorSignal(persistedSignals))
      : null;
    const sceneDirectorProposals = cloneDirectorProposals([
      directorState?.proposal,
      persistedDirectorProposal,
    ]);
    const event = sceneInspectionEvent(scene, player, trace);
    const events: SimEvent[] = [event];
    const lineIds = event.type === 'aiSpeech' && event.speech.mode === 'lineId' ? [event.speech.lineId] : [];
    const companionEvents = companionReactionEventsForScene(scene, request.pid, {
      directorProposals: sceneDirectorProposals,
    });
    events.push(...companionEvents);
    lineIds.push(...aiSpeechLineIds(companionEvents));
    const memoryWrites: AiMemoryAuditRecord[] = [];
    if (trace) {
      const tracedItem = droppedItemSemantic(trace.itemId, Math.max(0, request.sim.time - trace.createdAt), trace.sourcePlayerEntityId);
      if (tracedItem) {
        const reactions = rankItemReactions(
          scene,
          tracedItem,
          nearbyReactionCandidates(scene, request.sim.entities.values(), player),
          { worldSeed: request.sim.cfg.seed },
        ).slice(0, 2);
        lineIds.push(...reactions.map((reaction) => reaction.lineId));
        events.push(...reactions.map((reaction) => ({
          type: 'aiSpeech' as const,
          speakerId: reaction.entity.id,
          speakerName: reaction.entity.name,
          speech: {
            mode: 'lineId' as const,
            lineId: reaction.lineId,
            values: {
              speakerName: reaction.entity.name,
              speakerTemplateId: reaction.entity.templateId,
              itemId: tracedItem.itemId,
              traceKind: trace.kind,
              reaction: reaction.reaction,
              score: Math.round(reaction.score * 100),
              ...individualSpeechValues(reaction.individual),
            },
          },
          source: 'local' as const,
          reaction: {
            kind: reaction.reaction,
            targetItemId: tracedItem.itemId,
            score: Math.round(reaction.score * 100) / 100,
            sceneTags: [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags, `trace:${trace.kind}`])].slice(0, 8),
            individualTier: reaction.individual?.tier,
            individualTraits: reaction.individual?.traits,
          },
          pid: request.pid,
        })));
      }
    }
    if (!trace) {
      if (encounterMemory) {
        const memoryEvent = bossEncounterMemoryEvent(encounterMemory, player, request.pid);
        events.push(memoryEvent);
        lineIds.push(encounterMemory.lineId);
      }
      const directorEvent = worldDirectorEvent(scene, player, directorState, request.pid);
      if (directorEvent) {
        events.push(directorEvent);
        if (directorEvent.type === 'aiSpeech' && directorEvent.speech.mode === 'lineId') lineIds.push(directorEvent.speech.lineId);
      }
      if (!directorState) {
        const persistedDirectorEvent = worldDirectorEventFromMemoryAudit(
          scene,
          player,
          firstPersistedWorldDirectorSignal(persistedSignals),
          request.pid,
        );
        if (persistedDirectorEvent) {
          events.push(persistedDirectorEvent);
          if (persistedDirectorEvent.type === 'aiSpeech' && persistedDirectorEvent.speech.mode === 'lineId') {
            lineIds.push(persistedDirectorEvent.speech.lineId);
          }
        }
      }
      const familyReactions = rankFamilySceneReactions(
        scene,
        nearbyFamilySceneCandidates(scene, request.sim.entities.values(), player),
        { worldSeed: request.sim.cfg.seed, directorProposals: sceneDirectorProposals },
      ).slice(0, 2);
      for (const reaction of familyReactions) {
        let localEvent = familySceneReactionEvent(reaction, scene, request.pid) as Extract<SimEvent, { type: 'aiSpeech' }>;
        lineIds.push(reaction.lineId);
        let reactionEvents: SimEvent[] = [localEvent];
        if (reaction.individual.tier === 'singularity') {
          const memory = this.creatureMemory.noteSingularityReaction({
            entity: reaction.entity,
            player,
            individual: reaction.individual,
            nowSeconds: request.sim.time,
          });
          const plan = this.creatureMemory.notePlan({
            memory,
            entity: reaction.entity,
            player,
            individual: reaction.individual,
            scene,
            trigger: 'scene_inspected',
            nowSeconds: request.sim.time,
          });
          if (plan) {
            localEvent = withReactionMetadata(localEvent, creaturePlanReactionMetadata(plan));
            reactionEvents = [localEvent];
          }
          const memoryEvent = singularityCreatureSceneMemoryEvent(player, reaction.entity, scene, memory, plan);
          const creatureWrite = creatureMemoryAudit({
            memory,
            sceneId,
            reason: plan ? `singularityScene:${sceneId}:plan:${plan.kind}` : `singularityScene:${sceneId}`,
          });
          memoryWrites.push(creatureWrite);
          const directorMemory = this.worldDirector.noteCreatureSceneMemory({
            sceneId,
            zoneId: scene.zoneId,
            memory,
            plan,
            sourcePlayerEntityId: request.pid,
            nowSeconds: request.sim.time,
          });
          if (directorMemory) memoryWrites.push(worldDirectorMemoryAudit(directorMemory, `creatureSceneMemory:${sceneId}`));
          const context = this.buildSingularityContext({
            sim: request.sim,
            pid: request.pid,
            player,
            entity: reaction.entity,
            scene,
            locale: request.locale,
            eventKind: 'scene_inspected',
            reactionKind: reaction.reaction,
            suggestedLineId: reaction.lineId,
            score: reaction.score,
            fear: reaction.fear,
            curiosity: reaction.curiosity,
            reasonTags: reaction.reasonTags,
            individualTraits: reaction.individual.traits,
            plan,
            memorySignals: memoryWrites,
            directorProposals: [
              directorState?.proposal,
              persistedDirectorProposal,
              directorMemory?.proposal,
            ],
          });
          if (context) reactionEvents = await this.decideSingularityReactionEvents(context, reaction.entity, localEvent, memoryWrites);
          if (memoryEvent && !hasAiProviderErrorEvent(reactionEvents)) {
            reactionEvents.push(memoryEvent);
            if (memoryEvent.type === 'aiSpeech' && memoryEvent.speech.mode === 'lineId') lineIds.push(memoryEvent.speech.lineId);
          }
        }
        events.push(...reactionEvents);
      }
    }
    this.recordLocalReaction({
      jobId: `scene-${request.pid}-${++this.sequence}`,
      trigger: 'scene_inspected',
      entityId: player.id,
      templateId: player.templateId,
      playerEntityId: request.pid,
      reason: `inspectScene:${scene.subsceneId ?? scene.zoneId}`,
      lineIds,
      intents: [
        'inspectObject',
        'commentOnScene',
        ...(companionEvents.length > 0 ? ['reactToCompanion'] : []),
        ...(trace ? ['reactToWorldTrace'] : []),
        ...(encounterMemory ? ['readEncounterMemory'] : []),
        ...(!trace && directorState ? ['readWorldDirectorState'] : []),
        ...(!trace && !directorState && persistedSignals.some((record) => record.kind === 'worldDirectorState') ? ['readPersistedWorldDirectorState'] : []),
        ...(!trace && lineIds.some((lineId) => lineId.startsWith('hudChrome.aiSpeech.familyScene')) ? ['reactToFamilyScene'] : []),
        ...(memoryWrites.some((record) => record.kind === 'creatureMemory') ? ['rememberSingularityScene'] : []),
        ...(memoryWrites.some((record) => record.kind === 'worldDirectorState') ? ['writeWorldDirectorState'] : []),
      ],
      sceneId,
      memoryWrites,
    });
    this.metrics.localReactions++;
    this.enqueueMemoryWrites(memoryWrites);
    this.metrics.generatedEvents += events.length;
    request.deliver(events);
  }

  private enqueueMemoryWrites(records: readonly AiMemoryAuditRecord[]): void {
    if (!this.memoryDb || records.length === 0) return;
    this.pendingMemoryWrites.push(...records.map(cloneMemoryAudit));
    this.metrics.memoryWritesQueued += records.length;
    void this.flushMemoryWrites();
  }

  private async decideWithProviderCache(context: AiJobContextV1): Promise<AiProviderDecisionAttempt> {
    const cacheKey = this.providerCacheEnabled ? providerDecisionCacheKey(context) : null;
    if (cacheKey) {
      const lookupStartedAt = performance.now();
      const nowMs = performance.now();
      const cached = this.providerDecisionCache.get(cacheKey);
      if (cached && cached.expiresAtMs > nowMs) {
        const latencyMs = performance.now() - lookupStartedAt;
        const providerTimings = cacheHitProviderTimings(latencyMs);
        this.metrics.providerCacheHits++;
        this.metrics.lastProviderCacheKey = cacheKey;
        this.recordProviderCacheHitLatency(latencyMs, providerTimings);
        return {
          ok: true,
          fromCache: true,
          cacheKey,
          decision: cloneDecisionForContext(cached.decision, context),
          latencyMs,
          providerTimings,
        };
      }
      if (cached) {
        this.providerDecisionCache.delete(cacheKey);
        this.metrics.providerCacheEntries = this.providerDecisionCache.size;
      }
      this.metrics.providerCacheMisses++;
      this.metrics.lastProviderCacheKey = cacheKey;
    }

    const providerStartedAt = performance.now();
    this.metrics.providerCalls++;
    try {
      const providerOutput = normalizeProviderOutput(await this.provider.decide(context));
      const providerLatencyMs = performance.now() - providerStartedAt;
      this.recordProviderLatency(providerLatencyMs, providerOutput.providerTimings, providerOutput.promptText, providerOutput.rawOutput);
      this.metrics.providerSuccesses++;
      return {
        ok: true,
        fromCache: false,
        cacheKey,
        decision: providerOutput.decision,
        latencyMs: providerLatencyMs,
        promptText: providerOutput.promptText,
        rawOutput: providerOutput.rawOutput,
        providerTimings: providerOutput.providerTimings,
      };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const providerLatencyMs = performance.now() - providerStartedAt;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerErrors++;
      this.metrics.lastProviderError = reason;
      return {
        ok: false,
        fromCache: false,
        cacheKey,
        reason,
        latencyMs: providerLatencyMs,
      };
    }
  }

  private storeProviderDecisionInCache(
    context: AiJobContextV1,
    attempt: Extract<AiProviderDecisionAttempt, { ok: true }>,
    result: ReturnType<typeof validateAiDecision>,
  ): void {
    if (!this.providerCacheEnabled || attempt.fromCache || !attempt.cacheKey || !result.ok) return;
    const ttlMs = Math.min(this.providerCacheMaxTtlMs, Math.max(0, Math.floor(attempt.decision.ttlMs)));
    if (ttlMs < 250) return;
    const nowMs = performance.now();
    this.pruneProviderDecisionCache(nowMs);
    this.providerDecisionCache.set(attempt.cacheKey, {
      decision: cloneDecisionForContext(attempt.decision, context),
      expiresAtMs: nowMs + ttlMs,
    });
    this.metrics.providerCacheStores++;
    this.trimProviderDecisionCache();
    this.metrics.providerCacheEntries = this.providerDecisionCache.size;
  }

  private pruneProviderDecisionCache(nowMs = performance.now()): void {
    for (const [key, entry] of this.providerDecisionCache) {
      if (entry.expiresAtMs <= nowMs) this.providerDecisionCache.delete(key);
    }
    this.metrics.providerCacheEntries = this.providerDecisionCache.size;
  }

  private trimProviderDecisionCache(): void {
    while (this.providerDecisionCache.size > this.providerCacheMaxEntries) {
      const oldestKey = this.providerDecisionCache.keys().next().value;
      if (typeof oldestKey !== 'string') break;
      this.providerDecisionCache.delete(oldestKey);
    }
  }

  private recordProviderAudit(input: {
    context: AiJobContextV1;
    latencyMs: number;
    decision: AiDecisionV1 | null;
    result: ReturnType<typeof validateAiDecision> | null;
    memoryWrites?: readonly AiMemoryAuditRecord[];
    providerError?: string;
    promptText?: string;
    rawOutput?: string;
    providerTimings?: AiProviderTimingSnapshot;
    deliveredEvents?: readonly SimEvent[];
  }): void {
    const promptText = input.promptText
      ?? (this.auditProviderSource === 'codex' ? buildCodexDecisionPrompt(input.context) : undefined);
    this.recordAudit(createProviderAuditRecord({
      auditId: `${input.context.jobId}-${input.providerError ? 'provider-error' : input.result?.ok ? 'accepted' : 'rejected'}-${++this.auditSequence}`,
      realm: REALM,
      context: input.context,
      providerSource: this.auditProviderSource,
      latencyMs: input.latencyMs,
      decision: input.decision,
      result: input.result,
      memoryWrites: input.memoryWrites,
      providerError: input.providerError,
      promptText,
      rawOutput: input.rawOutput,
      providerTimings: input.providerTimings,
      deliveredEvents: input.deliveredEvents,
    }));
  }

  private recordLocalReaction(entry: AiLocalReactionAuditInput): void {
    const { entityKind, zoneId, ...journalEntry } = entry;
    this.journal.recordLocalReaction(journalEntry);
    this.recordAudit(createLocalAuditRecord({
      auditId: `${entry.jobId}-local-${++this.auditSequence}`,
      realm: REALM,
      jobId: entry.jobId,
      trigger: entry.trigger,
      entityKind,
      entityId: entry.entityId,
      templateId: entry.templateId,
      playerEntityId: entry.playerEntityId,
      sceneId: entry.sceneId,
      zoneId,
      lineIds: entry.lineIds,
      intents: entry.intents,
      memoryWrites: entry.memoryWrites,
      reason: entry.reason,
    }));
  }

  private recordAudit(record: Parameters<AiAuditSink['record']>[0]): void {
    if (!this.auditSink) return;
    try {
      const result = this.auditSink.record(record);
      if (result && typeof (result as PromiseLike<void>).then === 'function') {
        void Promise.resolve(result).catch((err) => {
          console.error('failed to persist AI audit record:', err);
        });
      }
    } catch (err) {
      console.error('failed to record AI audit:', err);
    }
  }

  private async flushMemoryWritesNow(): Promise<void> {
    if (!this.memoryDb) return;
    while (this.pendingMemoryWrites.length > 0) {
      const batch = this.pendingMemoryWrites.splice(0, this.memoryPersistBatchSize);
      try {
        await this.memoryDb.saveRecords(batch);
      } catch (err) {
        this.pendingMemoryWrites.unshift(...batch);
        this.recordMemoryPersistenceError(err, 'flush');
        return;
      }
    }
  }

  private async loadPersistedMemorySignals(input: AiMemoryPersistenceQuery): Promise<AiMemoryAuditRecord[]> {
    if (!this.memoryDb?.loadRecords) return [];
    try {
      return (await this.memoryDb.loadRecords(input)).map(cloneMemoryAudit);
    } catch (err) {
      this.recordMemoryPersistenceError(err, 'flush');
      return [];
    }
  }

  private recordMemoryPersistenceError(err: unknown, source: 'flush' | 'prune' | 'budget' | 'clear'): void {
    const message = err instanceof Error ? err.message : String(err);
    this.memoryPersistenceErrors.unshift(message);
    this.memoryPersistenceErrors.splice(5);
    if (source === 'flush') {
      this.metrics.memoryFlushFailures++;
    } else if (source === 'prune') {
      this.metrics.memoryPruneFailures++;
      this.metrics.lastMemoryPruneError = message;
    } else if (source === 'budget') {
      this.metrics.memoryBudgetFailures++;
      this.metrics.lastMemoryBudgetError = message;
    }
    this.metrics.lastMemoryPersistenceError = message;
  }

  private recordProviderLatency(
    durationMs: number,
    providerTimings?: AiProviderTimingSnapshot,
    promptText?: string,
    rawOutput?: string,
  ): void {
    const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.metrics.lastProviderLatencyMs = safeDuration;
    this.metrics.totalProviderLatencyMs += safeDuration;
    this.metrics.maxProviderLatencyMs = Math.max(this.metrics.maxProviderLatencyMs, safeDuration);
    this.providerLatencySamplesMs.push(safeDuration);
    if (this.providerLatencySamplesMs.length > PROVIDER_LATENCY_SAMPLE_LIMIT) {
      this.providerLatencySamplesMs.splice(0, this.providerLatencySamplesMs.length - PROVIDER_LATENCY_SAMPLE_LIMIT);
    }
    if (promptText !== undefined) this.metrics.lastPromptChars = promptText.length;
    if (rawOutput !== undefined) this.metrics.lastRawOutputChars = rawOutput.length;
    if (providerTimings) this.metrics.lastProviderTimings = providerTimings;
  }

  private recordProviderCacheHitLatency(durationMs: number, providerTimings: AiProviderTimingSnapshot): void {
    const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.metrics.lastProviderLatencyMs = safeDuration;
    this.metrics.lastProviderTimings = providerTimings;
  }

  private recordSpeechPolish(snapshot?: AiSpeechPolishSnapshot): void {
    if (!snapshot || snapshot.processed <= 0) return;
    this.metrics.speechPolish.processed += snapshot.processed;
    this.metrics.speechPolish.changed += snapshot.changed;
    this.metrics.speechPolish.charsTrimmed += snapshot.charsTrimmed;
    this.metrics.speechPolish.lastChanged = snapshot.lastChanged;
    this.metrics.speechPolish.lastLocale = snapshot.lastLocale;
    this.metrics.speechPolish.lastFingerprintSource = snapshot.lastFingerprintSource;
    this.metrics.speechPolish.lastBefore = snapshot.lastBefore;
    this.metrics.speechPolish.lastAfter = snapshot.lastAfter;
    this.metrics.speechPolish.lastBeforeChars = snapshot.lastBeforeChars;
    this.metrics.speechPolish.lastAfterChars = snapshot.lastAfterChars;
  }

  private playerForEncounterSource(sim: Sim, source: Entity | undefined): Entity | null {
    if (!source) return null;
    if (source.kind === 'player') return this.playerForPid(sim, source.id);
    if (source.kind === 'mob' && source.ownerId !== null) return this.playerForPid(sim, source.ownerId);
    return null;
  }

  private playerForPid(sim: Sim, pid: number | null | undefined): Entity | null {
    if (pid === null || pid === undefined) return null;
    const entity = sim.entities.get(pid);
    return entity?.kind === 'player' ? entity : null;
  }

  private buildPetCommandContext(request: PetCommandAiRequest): AiJobContextV1 | null {
    const player = request.sim.entities.get(request.pid);
    const meta = request.sim.meta(request.pid);
    const pet = request.sim.petOf(request.pid, true);
    if (!player || !meta || !pet || pet.kind !== 'mob') return null;
    const profile = profileFor('mob', pet.templateId);
    const scene = sceneFrameFor(request.sim, player.pos);
    const text = normalizePetCommandText(request.text);
    return {
      schemaVersion: 1,
      jobId: `ai-pet-${request.pid}-${pet.id}-${++this.sequence}`,
      trigger: 'pet_command',
      entity: {
        kind: 'mob',
        entityId: pet.id,
        templateId: pet.templateId,
        name: pet.name,
        level: pet.level,
        questIds: [...pet.questIds],
        dead: pet.dead,
      },
      player: {
        entityId: player.id,
        name: player.name,
        level: player.level,
        classId: player.templateId,
        activeQuestIds: [...meta.questLog.keys()],
        completedQuestIds: [...meta.questsDone],
      },
      locale: normalizeLocale(request.locale),
      profile: compactProfileSnapshot(profile),
      scene,
      familySemantics: compactFamilySemanticsForEntity(pet),
      questFacts: [],
      recentObservations: [
        `playerPetCommand:${text}`,
        `petMode:${pet.petMode}`,
        `petDead:${pet.dead ? 'yes' : 'no'}`,
        `playerTarget:${player.targetId ?? 'none'}`,
        `scene:${scene.subsceneId ?? scene.zoneId}`,
        ...scene.environmentalTags.slice(0, 4).map((tag) => `tag:${tag}`),
      ],
      allowedIntents: [...PET_COMMAND_INTENTS],
      allowedLineIds: [],
      outputMode: 'line_id_only',
    };
  }

  private buildNpcContext(request: NpcAiInteractionRequest): AiJobContextV1 | null {
    const player = request.sim.entities.get(request.pid);
    const npc = request.sim.entities.get(request.npcId);
    const meta = request.sim.meta(request.pid);
    if (!player || !npc || !meta || npc.kind !== 'npc') return null;
    if (dist2d(player.pos, npc.pos) > INTERACT_RANGE + 2) return null;
    const kind = aiEntityKind(npc);
    if (!kind) return null;
    const profile = profileFor(kind, npc.templateId);
    const scene = sceneFrameFor(request.sim, npc.pos, { excludeEntityIds: [npc.id] });
    const questFacts = npc.questIds
      .map((questId) => {
        const quest = QUESTS[questId];
        if (!quest) return null;
        const state = request.sim.questState(questId, request.pid);
        if (state === 'unavailable') return null;
        return {
          questId,
          visibility: state === 'active' ? 'currentObjective' as const : 'knownToPlayer' as const,
          summary: quest.name,
          source: 'quest-log',
        };
      })
      .filter((fact): fact is NonNullable<typeof fact> => fact !== null);
    const npcDef = NPCS[npc.templateId];
    return {
      schemaVersion: 1,
      jobId: `ai-${request.pid}-${request.npcId}-${++this.sequence}`,
      trigger: request.topic && request.topic !== 'greeting' ? 'npc_question' : 'npc_gossip_opened',
      entity: {
        kind,
        entityId: npc.id,
        templateId: npc.templateId,
        name: npcDef?.name ?? npc.name,
        level: npc.level,
        questIds: [...npc.questIds],
        dead: npc.dead,
      },
      player: {
        entityId: player.id,
        name: player.name,
        level: player.level,
        classId: player.templateId,
        activeQuestIds: [...meta.questLog.keys()],
        completedQuestIds: [...meta.questsDone],
      },
      locale: normalizeLocale(request.locale),
      topic: request.topic ?? 'greeting',
      profile: compactProfileSnapshot(profile),
      scene,
      familySemantics: compactFamilySemanticsForEntity(npc),
      questFacts,
      recentObservations: [
        `playerQuestion:${request.topic ?? 'greeting'}`,
        `scene:${scene.subsceneId ?? scene.zoneId}`,
        ...scene.environmentalTags.slice(0, 4).map((tag) => `tag:${tag}`),
      ],
      allowedIntents: profile.allowedIntentTypes,
      allowedLineIds: profile.allowedLineIds,
      outputMode: npcConversationOutputMode(request.topic ?? 'greeting'),
    };
  }

  private buildObjectContext(request: ObjectAiInspectionRequest): AiJobContextV1 | null {
    const player = request.sim.entities.get(request.pid);
    const object = request.sim.entities.get(request.objectId);
    const meta = request.sim.meta(request.pid);
    if (!player || !object || !meta || object.kind !== 'object' || !object.lootable) return null;
    if (dist2d(player.pos, object.pos) > INTERACT_RANGE + 2) return null;
    const kind = aiEntityKind(object);
    if (!kind) return null;
    const profile = profileFor(kind, object.templateId);
    const scene = sceneFrameFor(request.sim, object.pos);
    const questFacts = object.objectItemId
      ? Object.values(QUESTS)
        .map((quest) => {
          const relevant = quest.objectives.some((objective) =>
            (objective.type === 'collect' && objective.itemId === object.objectItemId)
            || (objective.type === 'interact' && objective.targetObjectItemId === object.objectItemId),
          );
          if (!relevant) return null;
          const state = request.sim.questState(quest.id, request.pid);
          if (state !== 'active' && state !== 'ready') return null;
          return {
            questId: quest.id,
            visibility: state === 'active' ? 'currentObjective' as const : 'knownToPlayer' as const,
            summary: quest.name,
            source: 'quest-log',
          };
        })
        .filter((fact): fact is NonNullable<typeof fact> => fact !== null)
      : [];
    return {
      schemaVersion: 1,
      jobId: `ai-${request.pid}-${request.objectId}-${++this.sequence}`,
      trigger: 'object_inspected',
      entity: {
        kind,
        entityId: object.id,
        templateId: object.templateId,
        name: object.name,
        level: object.level,
        questIds: [...object.questIds],
        dead: object.dead,
      },
      player: {
        entityId: player.id,
        name: player.name,
        level: player.level,
        classId: player.templateId,
        activeQuestIds: [...meta.questLog.keys()],
        completedQuestIds: [...meta.questsDone],
      },
      locale: normalizeLocale(request.locale),
      profile: compactProfileSnapshot(profile),
      scene,
      familySemantics: null,
      questFacts,
      recentObservations: [
        `object:${object.objectItemId ?? object.templateId}`,
        `scene:${scene.subsceneId ?? scene.zoneId}`,
        ...scene.environmentalTags.slice(0, 4).map((tag) => `tag:${tag}`),
      ],
      allowedIntents: profile.allowedIntentTypes,
      allowedLineIds: objectInspectionLineIds(),
      outputMode: 'line_id_only',
    };
  }
}

export function normalizeLocale(locale: string): string {
  const trimmed = locale.trim();
  return /^[a-z]{2}([_-][A-Z]{2})?$/.test(trimmed) ? trimmed : 'en';
}

function normalizeDeletedCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function clamp01Local(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function cloneDirectorProposals(
  proposals: readonly (AiWorldDirectorProposal | null | undefined)[],
): AiWorldDirectorProposal[] {
  const seen = new Set<string>();
  const cloned: AiWorldDirectorProposal[] = [];
  for (const proposal of proposals) {
    if (!proposal || seen.has(proposal.proposalId)) continue;
    seen.add(proposal.proposalId);
    cloned.push({
      ...proposal,
      reasonTags: [...proposal.reasonTags],
      safetyNotes: [...proposal.safetyNotes],
    });
  }
  return cloned;
}

function appendMemorySignals(context: AiJobContextV1, signals: readonly AiMemoryAuditRecord[]): void {
  if (signals.length === 0) return;
  const existing = context.memorySignals ?? [];
  const seen = new Set(existing.map(memorySignalKey));
  const merged = [...existing.map(cloneMemoryAudit)];
  for (const signal of signals) {
    const key = memorySignalKey(signal);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(cloneMemoryAudit(signal));
  }
  context.memorySignals = merged;
  for (const signal of signals.slice(0, 4)) {
    context.recentObservations.push(`persistedMemory:${signal.kind}:${signal.scope}:${signal.itemId || signal.questId || signal.templateId || signal.sceneId || 'none'}`);
  }
}

function firstPersistedWorldDirectorSignal(signals: readonly AiMemoryAuditRecord[]): AiMemoryAuditRecord | null {
  return signals.find((signal) => signal.kind === 'worldDirectorState') ?? null;
}

function activeSpeechMemoryAudit(input: {
  event: Extract<SimEvent, { type: 'aiSpeech' }>;
  speaker: Entity;
  pid: number;
  sceneId: string;
  zoneId: string;
  nowSeconds: number;
  source: 'scheduler' | 'deliver';
}): AiMemoryAuditRecord {
  const lineId = input.event.speech.mode === 'lineId' ? input.event.speech.lineId : null;
  const planKind = input.event.reaction?.planKind ?? input.event.reaction?.kind ?? 'speech';
  const minuteBucket = Math.floor(input.nowSeconds / 60);
  const targetItemId = input.event.reaction?.targetItemId;
  return {
    kind: input.speaker.kind === 'mob' ? 'creatureMemory' : 'npcInteraction',
    refId: `active:${input.source}:${input.pid}:${input.speaker.id}:${planKind}:${lineId ?? 'dynamic'}:${minuteBucket}`,
    scope: 'entity',
    sceneId: input.sceneId,
    zoneId: input.zoneId,
    sourcePlayerEntityId: input.pid,
    entityId: input.speaker.id,
    templateId: input.speaker.templateId,
    ...(targetItemId ? { itemId: targetItemId, subjectKind: 'item' as const } : {}),
    lineIds: lineId ? [lineId] : [],
    salience: activeSpeechMemorySalience(input.event, input.speaker),
    createdAt: input.nowSeconds,
    expiresAt: input.nowSeconds + activeSpeechMemoryTtlSeconds(input.event, input.speaker),
    reason: `active:${input.source}:${input.speaker.kind}:${planKind}`,
  };
}

function activeSpeechMemorySalience(event: Extract<SimEvent, { type: 'aiSpeech' }>, speaker: Entity): number {
  const reactionScore = event.reaction?.score ?? 0;
  const planIntensity = event.reaction?.planIntensity ?? 0;
  const singularityBoost = event.reaction?.individualTier === 'singularity' ? 0.24 : 0;
  const directorBoost = event.speech.mode === 'lineId' && event.speech.lineId.includes('worldDirector') ? 0.16 : 0;
  const sequenceBoost = event.reaction?.planKind?.includes('Sequence') || event.reaction?.planKind?.includes('conversation') ? 0.08 : 0;
  const creatureBoost = speaker.kind === 'mob' ? 0.04 : 0;
  return clamp01Local(0.24 + reactionScore * 0.24 + planIntensity * 0.22 + singularityBoost + directorBoost + sequenceBoost + creatureBoost);
}

function activeSpeechMemoryTtlSeconds(event: Extract<SimEvent, { type: 'aiSpeech' }>, speaker: Entity): number {
  const day = 24 * 60 * 60;
  if (event.reaction?.individualTier === 'singularity') return 21 * day;
  if (event.speech.mode === 'lineId' && event.speech.lineId.includes('worldDirector')) return 14 * day;
  if (speaker.kind === 'mob') return 10 * day;
  return 7 * day;
}

function memorySignalKey(signal: AiMemoryAuditRecord): string {
  return `${signal.kind}:${signal.refId}:${signal.sourcePlayerEntityId}`;
}

function shouldShareWorldDirector(
  topic: AiNpcInteractionTopic | undefined,
  state: AiWorldDirectorState | null,
  rumor: AiRumorMemory | null,
): boolean {
  if (!state) return false;
  if (!topic || topic === 'greeting') {
    return state.proposal.intent === 'nudgeNpcRumor' || state.proposal.intent === 'raiseCampCaution';
  }
  if (topic === 'place' || topic === 'recent') return true;
  if (topic === 'rumor') return rumor === null;
  return false;
}

function directNpcReplyEvents(
  context: AiJobContextV1,
  npc: Entity,
  providerEvents: readonly SimEvent[],
  candidates: {
    sceneEvent: SimEvent | null;
    traceEvent: SimEvent | null;
    directorEvent: SimEvent | null;
    memoryEvent: SimEvent | null;
    topicEvent: SimEvent | null;
  },
): SimEvent[] {
  const topic = context.topic ?? 'greeting';
  const { sceneEvent, traceEvent, directorEvent, memoryEvent, topicEvent } = candidates;
  const directSpeech = directProviderSpeech(context, npc, providerEvents);
  const directDynamicSpeech = directSpeech?.speech.mode === 'dynamicText' ? directSpeech : null;
  if (topic === 'rumor') {
    const event = directDynamicSpeech ?? memoryEvent ?? directorEvent ?? traceEvent ?? topicEvent ?? directSpeech;
    return event ? [event] : [];
  }
  if (topic === 'place' || topic === 'recent') {
    const event = directDynamicSpeech ?? directorEvent ?? traceEvent ?? topicEvent ?? highPrioritySceneEvent(sceneEvent) ?? directSpeech;
    return event ? [event] : [];
  }
  if (topic === 'quest_hint') {
    const event = topicEvent ?? memoryEvent ?? directorEvent ?? traceEvent ?? sceneEvent;
    return event ? [event] : [];
  }
  const contextualEvent = directDynamicSpeech ?? memoryEvent ?? traceEvent ?? directorEvent ?? highPrioritySceneEvent(sceneEvent) ?? directSpeech;
  if (contextualEvent) return [contextualEvent];
  return [];
}

function directProviderSpeech(
  context: AiJobContextV1,
  npc: Entity,
  providerEvents: readonly SimEvent[],
): Extract<SimEvent, { type: 'aiSpeech' }> | null {
  const directSpeech = providerEvents.find((event): event is Extract<SimEvent, { type: 'aiSpeech' }> =>
    event.type === 'aiSpeech'
    && event.speakerId === npc.id
    && event.pid === context.player.entityId);
  return directSpeech ?? null;
}

function npcLocalFallbackEvent(
  context: AiJobContextV1,
  npc: Entity,
): Extract<SimEvent, { type: 'aiSpeech' }> | null {
  const profile = profileFor('npc', npc.templateId);
  if (!profile.fallbackLineId) return null;
  return {
    type: 'aiSpeech',
    speakerId: npc.id,
    speakerName: npc.name,
    speech: {
      mode: 'lineId',
      lineId: profile.fallbackLineId,
      values: {
        speakerName: npc.name,
        playerName: context.player.name,
        subsceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? 'unknown',
      },
    },
    source: 'local',
    reaction: {
      kind: 'inspect',
      score: 0.25,
      sceneTags: context.scene
        ? [...new Set([
          ...context.scene.locationTags,
          ...context.scene.structureTags,
          ...context.scene.environmentalTags,
        ])].slice(0, 8)
        : [],
    },
    pid: context.player.entityId,
  };
}

function npcConversationOutputMode(topic: AiNpcInteractionTopic): AiOutputMode {
  return topic === 'quest_hint' ? 'line_id_only' : 'mixed_living_world';
}

function normalizeProviderOutput(output: AiProviderOutput): {
  decision: AiDecisionV1;
  promptText?: string;
  rawOutput?: string;
  providerTimings?: AiProviderTimingSnapshot;
} {
  if ('decision' in output) {
    return {
      decision: output.decision,
      promptText: output.promptText,
      rawOutput: output.rawOutput,
      providerTimings: output.providerTimings,
    };
  }
  return { decision: output };
}

function providerDecisionCacheKey(context: AiJobContextV1): string {
  const hash = createHash('sha256')
    .update(stableStringify(providerDecisionCachePayload(context)))
    .digest('hex')
    .slice(0, 24);
  return `${PROVIDER_CACHE_VERSION}:${hash}`;
}

function providerDecisionCachePayload(context: AiJobContextV1): Record<string, unknown> {
  return omitCacheUndefined({
    schemaVersion: context.schemaVersion,
    trigger: context.trigger,
    locale: context.locale,
    topic: context.topic,
    outputMode: context.outputMode,
    entity: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
      name: context.entity.name,
      level: context.entity.level,
      questIds: sortedStrings(context.entity.questIds),
      dead: context.entity.dead,
    },
    player: {
      entityId: context.player.entityId,
      name: context.player.name,
      level: context.player.level,
      classId: context.player.classId,
      activeQuestIds: sortedStrings(context.player.activeQuestIds),
      completedQuestIds: sortedStrings(context.player.completedQuestIds),
    },
    profile: context.profile ? {
      profileId: context.profile.profileId,
      persona: context.profile.persona,
      knowledgeScope: sortedStrings(context.profile.knowledgeScope),
      tabooTopics: sortedStrings(context.profile.tabooTopics),
      socialMemoryStyle: context.profile.socialMemory?.style,
      speechFingerprint: cacheSpeechFingerprint(context.profile.speechFingerprint),
    } : undefined,
    scene: context.scene ? providerCacheScenePayload(context.scene) : undefined,
    familySemantics: context.familySemantics ? {
      family: context.familySemantics.family,
      familyName: context.familySemantics.familyName,
      instincts: sortedStrings(context.familySemantics.baseInstincts),
      attractedItemTags: sortedStrings(context.familySemantics.attractedItemTags),
      avoidedItemTags: sortedStrings(context.familySemantics.avoidedItemTags),
      likelyIntents: sortedStrings(context.familySemantics.likelyIntents),
      speechStyle: context.familySemantics.speechStyle,
      speechFingerprint: cacheSpeechFingerprint(context.familySemantics.speechFingerprint),
    } : undefined,
    questFacts: context.questFacts.map((fact) => ({
      questId: fact.questId,
      visibility: fact.visibility,
      stageId: fact.stageId,
      source: fact.source,
      summary: fact.summary,
    })),
    recentObservations: [...context.recentObservations],
    memorySignals: cacheRelevantMemorySignals(context.memorySignals).map((signal) => ({
      kind: signal.kind,
      refId: signal.refId,
      scope: signal.scope,
      sceneId: signal.sceneId,
      zoneId: signal.zoneId,
      templateId: signal.templateId,
      itemId: signal.itemId,
      questId: signal.questId,
      subjectKind: signal.subjectKind,
      lineIds: sortedStrings(signal.lineIds),
      salience: roundCacheNumber(signal.salience, 0.05),
      reason: signal.reason,
    })),
    directorProposals: context.directorProposals?.map((proposal) => ({
      intent: proposal.intent,
      status: proposal.status,
      risk: proposal.risk,
      intensity: roundCacheNumber(proposal.intensity, 0.05),
      targetRef: proposal.targetRef,
      sceneId: proposal.sceneId,
      zoneId: proposal.zoneId,
      suggestedLineId: proposal.suggestedLineId,
      reasonTags: sortedStrings(proposal.reasonTags),
      safetyNotes: sortedStrings(proposal.safetyNotes),
    })),
    allowedIntents: sortedStrings(context.allowedIntents),
    allowedLineIds: sortedStrings(context.allowedLineIds ?? []),
  });
}

function providerCacheScenePayload(scene: SceneFrameV1): Record<string, unknown> {
  return {
    zoneId: scene.zoneId,
    subsceneId: scene.subsceneId,
    biomeTags: sortedStrings(scene.biomeTags),
    locationTags: sortedStrings(scene.locationTags),
    structureTags: sortedStrings(scene.structureTags),
    environmentalTags: sortedStrings(scene.environmentalTags),
    nearbySemanticObjects: scene.nearbySemanticObjects.map((object) => ({
      source: object.source,
      objectId: object.objectId,
      entityId: object.entityId,
      templateId: object.templateId,
      displayName: object.displayName,
      tags: sortedStrings(object.tags),
      featureTags: sortedStrings(object.featureTags),
      affordanceTags: sortedStrings(object.affordanceTags),
      distanceBucket: roundCacheNumber(object.distance, 5),
    })),
    droppedItems: scene.droppedItems.map((item) => ({
      itemId: item.itemId,
      displayName: item.displayName,
      rarity: item.rarity,
      ownerEntityId: item.ownerEntityId,
      itemTags: sortedStrings(item.itemTags),
      smellTags: sortedStrings(item.smellTags),
      dangerTags: sortedStrings(item.dangerTags),
      valueSignals: sortedStrings(item.valueSignals),
    })),
    companions: scene.companions.map((companion) => ({
      entityId: companion.entityId,
      templateId: companion.templateId,
      family: companion.family,
      tags: sortedStrings(companion.tags),
    })),
    time: {
      phase: scene.time.phase,
      isNight: scene.time.isNight,
      tags: sortedStrings(scene.time.tags),
    },
    weather: {
      kind: scene.weather.kind,
      intensityBucket: roundCacheNumber(scene.weather.intensity, 0.25),
      tags: sortedStrings(scene.weather.tags),
    },
    light: {
      level: scene.light.level,
      tags: sortedStrings(scene.light.tags),
    },
    mood: {
      dayEnergy: roundCacheNumber(scene.mood.dayEnergy, 0.25),
      nightFatigue: roundCacheNumber(scene.mood.nightFatigue, 0.25),
      clearNightAwe: roundCacheNumber(scene.mood.clearNightAwe, 0.25),
      rainIrritation: roundCacheNumber(scene.mood.rainIrritation, 0.25),
      fogFear: roundCacheNumber(scene.mood.fogFear, 0.25),
    },
    recentSceneEvents: [...scene.recentSceneEvents],
    danger: {
      undeadPressure: roundCacheNumber(scene.danger.undeadPressure, 0.25),
      hostileDensity: roundCacheNumber(scene.danger.hostileDensity, 0.25),
      corpseDensity: roundCacheNumber(scene.danger.corpseDensity, 0.25),
      safeHavenScore: roundCacheNumber(scene.danger.safeHavenScore, 0.25),
    },
  };
}

function cacheHitProviderTimings(totalMs: number): AiProviderTimingSnapshot {
  const safeTotalMs = Number.isFinite(totalMs) && totalMs >= 0 ? totalMs : 0;
  return {
    provider: 'decision-cache',
    totalMs: safeTotalMs,
    steps: [{ key: 'cacheHitMs', label: 'decision cache hit', ms: safeTotalMs }],
  };
}

function cloneDecisionForContext(decision: AiDecisionV1, context: AiJobContextV1): AiDecisionV1 {
  return {
    schemaVersion: decision.schemaVersion,
    jobId: context.jobId,
    entityRef: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
    ttlMs: decision.ttlMs,
    confidence: decision.confidence,
    speech: decision.speech.map((speech) => {
      if (speech.mode === 'lineId') {
        return {
          mode: 'lineId',
          lineId: speech.lineId,
          ...(speech.values ? { values: { ...speech.values } } : {}),
        };
      }
      return {
        mode: 'dynamicText',
        language: speech.language,
        text: speech.text,
      };
    }),
    intents: decision.intents.map((intent) => ({ ...intent })),
    audit: {
      shortReason: decision.audit.shortReason,
      usedPlayerInput: decision.audit.usedPlayerInput,
      safetyNotes: [...decision.audit.safetyNotes],
    },
  };
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`).join(',')}}`;
}

function omitCacheUndefined(record: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function sortedStrings(values: readonly string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b));
}

function cacheSpeechFingerprint(fingerprint: AiSpeechFingerprint | undefined): Record<string, unknown> | undefined {
  if (!fingerprint) return undefined;
  return {
    sentenceRhythm: fingerprint.sentenceRhythm,
    addressStyle: fingerprint.addressStyle,
    favoriteStarts: sortedStrings(fingerprint.favoriteStarts),
    sensoryBias: sortedStrings(fingerprint.sensoryBias),
    avoidedPhrases: sortedStrings(fingerprint.avoidedPhrases),
  };
}

function emptySpeechPolishMetrics(): AiSpeechPolishSnapshot {
  return {
    processed: 0,
    changed: 0,
    charsTrimmed: 0,
    lastChanged: false,
    lastFingerprintSource: 'none',
    lastBeforeChars: 0,
    lastAfterChars: 0,
  };
}

function cloneSpeechPolishSnapshot(snapshot: AiSpeechPolishSnapshot): AiSpeechPolishSnapshot {
  return {
    processed: snapshot.processed,
    changed: snapshot.changed,
    charsTrimmed: snapshot.charsTrimmed,
    lastChanged: snapshot.lastChanged,
    lastFingerprintSource: snapshot.lastFingerprintSource,
    lastBeforeChars: snapshot.lastBeforeChars,
    lastAfterChars: snapshot.lastAfterChars,
    ...(snapshot.lastLocale ? { lastLocale: snapshot.lastLocale } : {}),
    ...(snapshot.lastBefore ? { lastBefore: snapshot.lastBefore } : {}),
    ...(snapshot.lastAfter ? { lastAfter: snapshot.lastAfter } : {}),
  };
}

function cacheRelevantMemorySignals(signals: readonly AiMemoryAuditRecord[] | undefined): AiMemoryAuditRecord[] {
  return (signals ?? []).filter((signal) => signal.kind !== 'npcInteraction');
}

function roundCacheNumber(value: number, step: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / step) * step;
}

function providerLatencyPercentiles(samples: readonly number[]): { p50: number; p90: number; p95: number } {
  if (samples.length === 0) return { p50: 0, p90: 0, p95: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  return {
    p50: percentileFromSorted(sorted, 0.5),
    p90: percentileFromSorted(sorted, 0.9),
    p95: percentileFromSorted(sorted, 0.95),
  };
}

function percentileFromSorted(sorted: readonly number[], percentile: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentile) - 1));
  return sorted[index];
}

function envPositiveIntLocal(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function normalizeMemoryBudgetPolicy(overrides: Partial<AiMemoryBudgetPolicy> | undefined): AiMemoryBudgetPolicy {
  const maxTotalRecords = Math.max(
    1_000,
    Math.min(5_000_000, Math.floor(overrides?.maxTotalRecords
      ?? envPositiveIntLocal('AI_MEMORY_MAX_RECORDS', DEFAULT_MEMORY_BUDGET_TOTAL_RECORDS))),
  );
  const maxRecordsPerPlayer = Math.max(
    500,
    Math.min(maxTotalRecords, Math.floor(overrides?.maxRecordsPerPlayer
      ?? envPositiveIntLocal('AI_MEMORY_MAX_RECORDS_PER_PLAYER', DEFAULT_MEMORY_BUDGET_PER_PLAYER_RECORDS))),
  );
  const batchSize = Math.max(
    100,
    Math.min(20_000, Math.floor(overrides?.batchSize
      ?? envPositiveIntLocal('AI_MEMORY_BUDGET_BATCH_SIZE', DEFAULT_MEMORY_BUDGET_BATCH_SIZE))),
  );
  const maxRecordsPerKind: Partial<Record<AiMemoryAuditKind, number>> = {};
  for (const kind of memoryAuditKinds()) {
    const override = overrides?.maxRecordsPerKind?.[kind];
    const derived = Math.floor(maxTotalRecords * MEMORY_BUDGET_KIND_RATIOS[kind]);
    maxRecordsPerKind[kind] = Math.max(100, Math.min(maxTotalRecords, Math.floor(override ?? derived)));
  }
  return { maxTotalRecords, maxRecordsPerPlayer, maxRecordsPerKind, batchSize };
}

function cloneMemoryBudgetPolicy(policy: AiMemoryBudgetPolicy): AiMemoryBudgetPolicy {
  return {
    maxTotalRecords: policy.maxTotalRecords,
    maxRecordsPerPlayer: policy.maxRecordsPerPlayer,
    maxRecordsPerKind: { ...policy.maxRecordsPerKind },
    batchSize: policy.batchSize,
  };
}

function normalizeMemoryBudgetResult(
  result: AiMemoryBudgetEnforcementResult,
  fallbackPolicy: AiMemoryBudgetPolicy,
): AiMemoryBudgetEnforcementResult {
  const deletedByKind: Partial<Record<AiMemoryAuditKind, number>> = {};
  for (const kind of memoryAuditKinds()) {
    const deleted = result.deletedByKind[kind] ?? 0;
    if (Number.isFinite(deleted) && deleted > 0) deletedByKind[kind] = Math.floor(deleted);
  }
  const deletedByTotal = safeDeletedCount(result.deletedByTotal);
  const deletedByPlayer = safeDeletedCount(result.deletedByPlayer);
  const totalDeleted = safeDeletedCount(result.totalDeleted)
    || deletedByTotal + deletedByPlayer + Object.values(deletedByKind).reduce((sum, count) => sum + (count ?? 0), 0);
  return {
    totalDeleted,
    deletedByTotal,
    deletedByPlayer,
    deletedByKind,
    budget: cloneMemoryBudgetPolicy(result.budget ?? fallbackPolicy),
  };
}

function zeroMemoryBudgetResult(policy: AiMemoryBudgetPolicy): AiMemoryBudgetEnforcementResult {
  return {
    totalDeleted: 0,
    deletedByTotal: 0,
    deletedByPlayer: 0,
    deletedByKind: {},
    budget: cloneMemoryBudgetPolicy(policy),
  };
}

function safeDeletedCount(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function memoryAuditKinds(): readonly AiMemoryAuditKind[] {
  return ['npcInteraction', 'rumor', 'worldTrace', 'creatureMemory', 'bossMemory', 'worldDirectorState'];
}

function defaultAiProvider(): AiProvider {
  const mode = (process.env.AI_CODEX_PROVIDER ?? 'exec').trim().toLowerCase();
  if (mode === 'app-server' || mode === 'app_server' || mode === 'appserver') {
    return new CodexAppServerProvider();
  }
  return new CodexCliProvider();
}

function highPrioritySceneEvent(event: SimEvent | null): SimEvent | null {
  if (!event || event.type !== 'aiSpeech' || event.speech.mode !== 'lineId') return event;
  switch (event.speech.lineId) {
    case 'hudChrome.aiSpeech.sceneDemonCompanionUnease':
    case 'hudChrome.aiSpeech.sceneUndeadCompanionUnease':
    case 'hudChrome.aiSpeech.companionUndeadFear':
    case 'hudChrome.aiSpeech.sceneUndeadPressure':
      return event;
    default:
      return null;
  }
}

function providerFailureErrorEvent(context: AiJobContextV1, reason: string): Extract<SimEvent, { type: 'error' }> {
  return {
    type: 'error',
    text: `AI response failed: ${publicAiReason(reason)}`,
    pid: context.player.entityId,
  };
}

function providerRejectedErrorEvent(context: AiJobContextV1, reason: string): Extract<SimEvent, { type: 'error' }> {
  return {
    type: 'error',
    text: `AI response rejected: ${publicAiReason(reason)}`,
    pid: context.player.entityId,
  };
}

function hasAiProviderErrorEvent(events: readonly SimEvent[]): boolean {
  return events.some((event) =>
    event.type === 'error'
    && (/^AI response failed: /.test(event.text) || /^AI response rejected: /.test(event.text)));
}

function publicAiReason(reason: string): string {
  const cleaned = reason
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/[^\x20-\x7E]/g, '?')
    .trim();
  return (cleaned || 'unknown Codex CLI error').slice(0, 240);
}

export function normalizePetCommandText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, 160);
}

function firstPetCommandIntent(decision: AiDecisionV1): AiPetCommandIntent | null {
  const intent = decision.intents.find((entry): entry is { type: AiPetCommandIntent; lineId?: string } =>
    PET_COMMAND_INTENTS.includes(entry.type as AiPetCommandIntent),
  );
  return intent?.type ?? null;
}

function petCommandActionFromIntent(
  intent: AiPetCommandIntent,
  source: Extract<SimEvent, { type: 'aiSpeech' }>['source'],
  reason: string,
): AiPetCommandAction {
  switch (intent) {
    case 'commandPetPassive': return { type: 'setMode', mode: 'passive', intent, source, reason };
    case 'commandPetDefensive': return { type: 'setMode', mode: 'defensive', intent, source, reason };
    case 'commandPetAggressive': return { type: 'setMode', mode: 'aggressive', intent, source, reason };
    case 'commandPetAttack': return { type: 'attack', intent, source, reason };
    case 'commandPetTaunt': return { type: 'taunt', intent, source, reason };
    case 'commandPetIgnore': return { type: 'none', intent, source, reason };
  }
}

function mergeObjectInspectionShell(
  events: SimEvent[],
  localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
): SimEvent[] {
  const localValues = localEvent.speech.mode === 'lineId' ? localEvent.speech.values ?? {} : {};
  return events.map((event) => {
    if (event.type !== 'aiSpeech') return event;
    const speech = event.speech.mode === 'lineId'
      ? { ...event.speech, values: { ...localValues, ...(event.speech.values ?? {}) } }
      : event.speech;
    return {
      ...event,
      speech,
      reaction: mergeAiSpeechReaction(event.reaction, localEvent.reaction),
    };
  });
}

type AiSpeechReaction = NonNullable<Extract<SimEvent, { type: 'aiSpeech' }>['reaction']>;

function withReactionMetadata(
  event: Extract<SimEvent, { type: 'aiSpeech' }>,
  metadata: Partial<AiSpeechReaction>,
): Extract<SimEvent, { type: 'aiSpeech' }> {
  return {
    ...event,
    reaction: mergeAiSpeechReaction(event.reaction, metadata),
  };
}

function mergeAiSpeechReaction(
  eventReaction: AiSpeechReaction | undefined,
  shellReaction: Partial<AiSpeechReaction> | undefined,
): AiSpeechReaction | undefined {
  if (!shellReaction) return eventReaction;
  if (!eventReaction) {
    return shellReaction.kind ? { ...shellReaction, kind: shellReaction.kind } : undefined;
  }
  return {
    ...shellReaction,
    ...eventReaction,
    targetEntityId: eventReaction.targetEntityId ?? shellReaction.targetEntityId,
    targetItemId: eventReaction.targetItemId ?? shellReaction.targetItemId,
    targetObjectId: eventReaction.targetObjectId ?? shellReaction.targetObjectId,
    targetPos: eventReaction.targetPos ?? shellReaction.targetPos,
    score: eventReaction.score ?? shellReaction.score,
    sceneTags: eventReaction.sceneTags ?? shellReaction.sceneTags,
    individualTier: eventReaction.individualTier ?? shellReaction.individualTier,
    individualTraits: eventReaction.individualTraits ?? shellReaction.individualTraits,
    planId: eventReaction.planId ?? shellReaction.planId,
    planKind: eventReaction.planKind ?? shellReaction.planKind,
    planIntensity: eventReaction.planIntensity ?? shellReaction.planIntensity,
    actionDurationMs: eventReaction.actionDurationMs ?? shellReaction.actionDurationMs,
    actionOffset: eventReaction.actionOffset ?? shellReaction.actionOffset,
    planExpiresAt: eventReaction.planExpiresAt ?? shellReaction.planExpiresAt,
  };
}

function mergeSingularityReactionShell(
  events: SimEvent[],
  localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
): SimEvent[] {
  const localValues = localEvent.speech.mode === 'lineId' ? localEvent.speech.values ?? {} : {};
  return events.map((event) => {
    if (event.type !== 'aiSpeech') return event;
    const speech = event.speech.mode === 'lineId'
      ? { ...event.speech, values: { ...localValues, ...(event.speech.values ?? {}) } }
      : event.speech;
    return {
      ...event,
      speech,
      reaction: mergeAiSpeechReaction(event.reaction, localEvent.reaction),
    };
  });
}

function itemInterestReactionEvent(
  reaction: ItemInterestReaction,
  dropped: DroppedItemSemantic,
  scene: SceneFrameV1,
  pid: number,
  targetPos?: { x: number; z: number },
): Extract<SimEvent, { type: 'aiSpeech' }> {
  return {
    type: 'aiSpeech',
    speakerId: reaction.entity.id,
    speakerName: reaction.entity.name,
    speech: {
      mode: 'lineId',
      lineId: reaction.lineId,
      values: {
        speakerName: reaction.entity.name,
        speakerTemplateId: reaction.entity.templateId,
        itemId: dropped.itemId,
        reaction: reaction.reaction,
        score: Math.round(reaction.score * 100),
        ...individualSpeechValues(reaction.individual),
      },
    },
    source: 'local',
    reaction: {
      kind: reaction.reaction,
      targetItemId: dropped.itemId,
      ...(targetPos ? { targetPos } : {}),
      actionDurationMs: reaction.reaction === 'inspect' ? 1800 : 2600,
      actionOffset: reaction.reaction === 'inspect' ? 0.18 : reaction.reaction === 'avoid' ? 0.62 : 0.58,
      score: Math.round(reaction.score * 100) / 100,
      sceneTags: [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags])].slice(0, 8),
      individualTier: reaction.individual?.tier,
      individualTraits: reaction.individual?.traits,
    },
    pid,
  };
}

function aiSpeechLineIds(events: readonly SimEvent[]): string[] {
  const lineIds: string[] = [];
  for (const event of events) {
    if (event.type === 'aiSpeech' && event.speech.mode === 'lineId') lineIds.push(event.speech.lineId);
  }
  return lineIds;
}
