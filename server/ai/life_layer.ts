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
import type { AiDecisionV1, AiIntentType, AiJobContextV1, AiMemoryAuditRecord, AiProvider } from './ai_types';
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
import { CodexCliProvider } from './codex_worker';
import { companionReactionEvents, companionReactionEventsForScene } from './companion_reactions';
import { AiCreatureMemoryStore, creaturePlanReactionMetadata, singularityCreatureMemoryEvent, singularityCreatureSceneMemoryEvent } from './creature_memory';
import type { AiCreatureMemory, AiCreaturePlan } from './creature_memory';
import { AiDecisionJournal } from './decision_journal';
import type { AiDecisionJournalEntry } from './decision_journal';
import { familySceneReactionEvent, nearbyFamilySceneCandidates, rankFamilySceneReactions } from './family_scene_reactions';
import { compactFamilySemanticsForEntity } from './family_semantics';
import { FakeAiProvider } from './fake_ai_provider';
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
  useCodex?: boolean;
  journalSize?: number;
  memoryDb?: AiMemoryPersistence;
  memoryPersistBatchSize?: number;
  auditSink?: AiAuditSink;
  auditProviderSource?: Exclude<AiAuditProviderSource, 'fallback' | 'local'>;
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
  clearRecords?(): Promise<number>;
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
  totalProviderLatencyMs: number;
  averageProviderLatencyMs: number;
  maxProviderLatencyMs: number;
  lastProviderLatencyMs: number;
  lastProviderError?: string;
  lastMemoryPersistenceError?: string;
  lastMemoryPruneError?: string;
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
    lastPruneDeleted: number;
    errors: string[];
  };
}

interface AiLifeLayerMetricsState {
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
  totalProviderLatencyMs: number;
  maxProviderLatencyMs: number;
  lastProviderLatencyMs: number;
  lastProviderError?: string;
  lastMemoryPersistenceError?: string;
  lastMemoryPruneError?: string;
}

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
  private readonly auditSink: AiAuditSink | null;
  private readonly auditProviderSource: Exclude<AiAuditProviderSource, 'fallback' | 'local'>;
  private readonly pendingMemoryWrites: AiMemoryAuditRecord[] = [];
  private readonly memoryPersistenceErrors: string[] = [];
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
    totalProviderLatencyMs: 0,
    maxProviderLatencyMs: 0,
    lastProviderLatencyMs: 0,
  };
  private memoryFlushPromise: Promise<void> | null = null;
  private memoryPrunePromise: Promise<number> | null = null;
  private sequence = 0;
  private auditSequence = 0;

  constructor(options: AiLifeLayerOptions = {}) {
    this.enabled = options.enabled ?? process.env.AI_LIVING_WORLD_EXPERIMENT === '1';
    this.provider = options.provider ?? (options.useCodex || process.env.AI_CODEX_CLI === '1'
      ? new CodexCliProvider()
      : new FakeAiProvider());
    this.journal = new AiDecisionJournal(options.journalSize);
    this.memoryDb = options.memoryDb ?? null;
    this.memoryPersistBatchSize = Math.max(1, Math.min(200, Math.floor(options.memoryPersistBatchSize ?? 32)));
    this.auditSink = options.auditSink ?? null;
    this.auditProviderSource = options.auditProviderSource
      ?? (options.useCodex || process.env.AI_CODEX_CLI === '1'
        ? 'codex'
        : options.provider
          ? 'provider'
          : 'fake');
  }

  diagnostics(): AiDecisionJournalEntry[] {
    return this.journal.snapshot();
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
    return {
      ...this.metrics,
      averageProviderLatencyMs: this.metrics.providerCalls > 0
        ? this.metrics.totalProviderLatencyMs / this.metrics.providerCalls
        : 0,
    };
  }

  memoryPersistenceDiagnostics(): AiLifeLayerDiagnosticsSnapshot['memoryPersistence'] {
    return {
      pending: this.pendingMemoryWrites.length,
      flushing: this.memoryFlushPromise !== null,
      pruning: this.memoryPrunePromise !== null,
      lastPruneDeleted: this.metrics.lastMemoryPruneDeleted,
      errors: [...this.memoryPersistenceErrors],
    };
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
    let decision: AiDecisionV1;
    let decisionSource: Extract<SimEvent, { type: 'aiSpeech' }>['source'] = 'codex';
    let providerLatencyMs = 0;
    let providerErrorReason = '';
    const providerStartedAt = performance.now();
    this.metrics.providerCalls++;
    try {
      decision = await this.provider.decide(context);
      providerLatencyMs = performance.now() - providerStartedAt;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerSuccesses++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      providerLatencyMs = performance.now() - providerStartedAt;
      providerErrorReason = reason;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerErrors++;
      this.metrics.providerFallbacks++;
      this.metrics.lastProviderError = reason;
      this.journal.recordProviderError(context, reason, memoryWrites);
      decision = fallbackDecisionForProviderError(context, reason);
      decisionSource = 'fallback';
    }
    const result = validateAiDecision({ decision, context, entity: npc, subject, source: decisionSource });
    if (result.ok) this.metrics.acceptedDecisions++;
    else this.metrics.rejectedDecisions++;
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      memoryWrites,
      providerError: providerErrorReason || undefined,
    });
    this.journal.recordDecision(context, decision, result, memoryWrites);
    this.enqueueMemoryWrites(memoryWrites);
    if (result.ok) {
      const events = [...result.events];
      const sceneEvent = sceneAwarenessEvent(context, npc);
      if (sceneEvent) events.push(sceneEvent);
      const traceEvent = worldTraceReactionEvent(context, npc, trace);
      if (traceEvent) events.push(traceEvent);
      const directorEvent = shouldShareWorldDirector(request.topic, directorState, rumor)
        ? worldDirectorEvent(context.scene ?? null, npc, directorState, request.pid)
        : null;
      if (directorEvent) events.push(directorEvent);
      events.push(...companionReactionEvents(context));
      const memoryEvent = memoryReactionEvent(context, npc, memory, rumor);
      if (memoryEvent) events.push(memoryEvent);
      const topicEvent = topicReactionEvent(context, npc, memory, rumor);
      if (topicEvent && !(directorEvent && request.topic === 'rumor')) events.push(topicEvent);
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
      let localEvent = itemInterestReactionEvent(reaction, dropped, scene, request.pid);
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
        if (memoryEvent) reactionEvents.push(memoryEvent);
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
        source: 'fallback' as const,
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
    let decisionSource: Extract<SimEvent, { type: 'aiSpeech' }>['source'] = 'codex';
    const localIntent = localPetCommandIntent(request.text);
    let providerLatencyMs = 0;
    let providerErrorReason = '';
    const providerStartedAt = performance.now();
    this.metrics.providerCalls++;
    try {
      decision = await this.provider.decide(context);
      providerLatencyMs = performance.now() - providerStartedAt;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerSuccesses++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      providerLatencyMs = performance.now() - providerStartedAt;
      providerErrorReason = reason;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerErrors++;
      this.metrics.providerFallbacks++;
      this.metrics.lastProviderError = reason;
      this.journal.recordProviderError(context, reason);
      decision = fallbackDecisionForPetCommand(context, localIntent, reason);
      decisionSource = 'fallback';
    }
    const result = validateAiDecision({ decision, context, entity: pet, subject: 'ordinary', source: decisionSource });
    if (result.ok) this.metrics.acceptedDecisions++;
    else this.metrics.rejectedDecisions++;
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      providerError: providerErrorReason || undefined,
    });
    this.journal.recordDecision(context, decision, result);
    if (!result.ok) {
      const fallback = fallbackDecisionForPetCommand(context, localIntent, `petCommandRejected:${result.reason ?? 'unknown'}`);
      this.recordLocalReaction({
        jobId: `${context.jobId}-local-fallback`,
        trigger: 'pet_command',
        entityId: pet.id,
        templateId: pet.templateId,
        playerEntityId: request.pid,
        reason: fallback.audit.shortReason,
        lineIds: [],
        intents: fallback.intents.map((intent) => intent.type),
        sceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? null,
      });
      this.metrics.localReactions++;
      return petCommandActionFromIntent(localIntent, 'fallback', fallback.audit.shortReason);
    }
    const intent = firstPetCommandIntent(decision);
    if (!intent) return petCommandActionFromIntent('commandPetIgnore', decisionSource, `${decision.audit.shortReason}: no bounded pet intent`);
    return petCommandActionFromIntent(intent, decisionSource, decision.audit.shortReason);
  }

  private async decideObjectInspectionEvents(
    context: AiJobContextV1,
    object: Entity,
    localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
    memoryWrites: AiMemoryAuditRecord[],
  ): Promise<SimEvent[]> {
    const subject = classifyCanonSubject(object);
    let decision: AiDecisionV1;
    let decisionSource: Extract<SimEvent, { type: 'aiSpeech' }>['source'] = 'codex';
    let providerLatencyMs = 0;
    let providerErrorReason = '';
    const providerStartedAt = performance.now();
    this.metrics.providerCalls++;
    try {
      decision = await this.provider.decide(context);
      providerLatencyMs = performance.now() - providerStartedAt;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerSuccesses++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      providerLatencyMs = performance.now() - providerStartedAt;
      providerErrorReason = reason;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerErrors++;
      this.metrics.providerFallbacks++;
      this.metrics.lastProviderError = reason;
      this.journal.recordProviderError(context, reason, memoryWrites);
      decision = fallbackDecisionForObjectInspection(context, localEvent, reason);
      decisionSource = 'fallback';
    }
    const result = validateAiDecision({ decision, context, entity: object, subject, source: decisionSource });
    if (result.ok) this.metrics.acceptedDecisions++;
    else this.metrics.rejectedDecisions++;
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      memoryWrites,
      providerError: providerErrorReason || undefined,
    });
    this.journal.recordDecision(context, decision, result, memoryWrites);
    if (!result.ok) {
      this.recordLocalReaction({
        jobId: `${context.jobId}-local-fallback`,
        trigger: 'object_inspected',
        entityId: object.id,
        templateId: object.templateId,
        playerEntityId: context.player.entityId,
        reason: `objectProviderRejected:${result.reason ?? 'unknown'}`,
        lineIds: aiSpeechLineIds([localEvent]),
        intents: ['inspectObject', 'commentOnScene'],
        sceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? null,
        memoryWrites,
      });
      return [localEvent];
    }
    return mergeObjectInspectionShell(result.events, localEvent);
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
    let decisionSource: Extract<SimEvent, { type: 'aiSpeech' }>['source'] = 'codex';
    let providerLatencyMs = 0;
    let providerErrorReason = '';
    const providerStartedAt = performance.now();
    this.metrics.providerCalls++;
    try {
      decision = await this.provider.decide(context);
      providerLatencyMs = performance.now() - providerStartedAt;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerSuccesses++;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      providerLatencyMs = performance.now() - providerStartedAt;
      providerErrorReason = reason;
      this.recordProviderLatency(providerLatencyMs);
      this.metrics.providerErrors++;
      this.metrics.providerFallbacks++;
      this.metrics.lastProviderError = reason;
      this.journal.recordProviderError(context, reason, memoryWrites);
      decision = fallbackDecisionForSingularityReaction(context, localEvent, reason);
      decisionSource = 'fallback';
    }
    const result = validateAiDecision({ decision, context, entity, subject, source: decisionSource });
    if (result.ok) this.metrics.acceptedDecisions++;
    else this.metrics.rejectedDecisions++;
    this.recordProviderAudit({
      context,
      latencyMs: providerLatencyMs,
      decision,
      result,
      memoryWrites,
      providerError: providerErrorReason || undefined,
    });
    this.journal.recordDecision(context, decision, result, memoryWrites);
    if (!result.ok) {
      this.recordLocalReaction({
        jobId: `${context.jobId}-local-fallback`,
        trigger: context.trigger,
        entityId: entity.id,
        templateId: entity.templateId,
        playerEntityId: context.player.entityId,
        reason: `singularityProviderRejected:${result.reason ?? 'unknown'}`,
        lineIds: aiSpeechLineIds([localEvent]),
        intents: [reactionIntentType(localEvent.reaction?.kind ?? 'inspect'), 'commentOnScene'],
        sceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? null,
        memoryWrites,
      });
      return [localEvent];
    }
    return mergeSingularityReactionShell(result.events, localEvent);
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
          source: 'fallback' as const,
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
          if (memoryEvent) {
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

  private recordProviderAudit(input: {
    context: AiJobContextV1;
    latencyMs: number;
    decision: AiDecisionV1 | null;
    result: ReturnType<typeof validateAiDecision> | null;
    memoryWrites?: readonly AiMemoryAuditRecord[];
    providerError?: string;
  }): void {
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

  private recordMemoryPersistenceError(err: unknown, source: 'flush' | 'prune' | 'clear'): void {
    const message = err instanceof Error ? err.message : String(err);
    this.memoryPersistenceErrors.unshift(message);
    this.memoryPersistenceErrors.splice(5);
    if (source === 'flush') {
      this.metrics.memoryFlushFailures++;
    } else {
      this.metrics.memoryPruneFailures++;
      this.metrics.lastMemoryPruneError = message;
    }
    this.metrics.lastMemoryPersistenceError = message;
  }

  private recordProviderLatency(durationMs: number): void {
    const safeDuration = Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0;
    this.metrics.lastProviderLatencyMs = safeDuration;
    this.metrics.totalProviderLatencyMs += safeDuration;
    this.metrics.maxProviderLatencyMs = Math.max(this.metrics.maxProviderLatencyMs, safeDuration);
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
      outputMode: 'line_id_only',
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

function fallbackDecisionForProviderError(context: AiJobContextV1, reason: string): AiDecisionV1 {
  const profile = profileFor(context.entity.kind, context.entity.templateId);
  const lineId = profile.fallbackLineId;
  return {
    schemaVersion: 1,
    jobId: context.jobId,
    entityRef: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
    ttlMs: 5_000,
    confidence: 0.15,
    speech: [{
      mode: 'lineId',
      lineId,
      values: {
        playerName: context.player.name,
        speakerName: context.entity.name,
      },
    }],
    intents: [{ type: 'commentOnScene', lineId }],
    audit: {
      shortReason: `provider error fallback: ${reason.slice(0, 120)}`,
      usedPlayerInput: false,
      safetyNotes: ['Codex provider failed; local profile fallback preserved quest, combat, reward, and economy state.'],
    },
  };
}

function fallbackDecisionForObjectInspection(
  context: AiJobContextV1,
  localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
  reason: string,
): AiDecisionV1 {
  const lineId = localEvent.speech.mode === 'lineId'
    ? localEvent.speech.lineId
    : profileFor(context.entity.kind, context.entity.templateId).fallbackLineId;
  const values = localEvent.speech.mode === 'lineId' ? localEvent.speech.values : undefined;
  return {
    schemaVersion: 1,
    jobId: context.jobId,
    entityRef: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
    ttlMs: 5_000,
    confidence: 0.15,
    speech: [{ mode: 'lineId', lineId, ...(values ? { values } : {}) }],
    intents: [{ type: 'inspectObject', lineId }],
    audit: {
      shortReason: `object provider fallback: ${reason.slice(0, 120)}`,
      usedPlayerInput: false,
      safetyNotes: ['Object inspection used local scene semantics after provider failure; quest, combat, reward, and economy state were unchanged.'],
    },
  };
}

function fallbackDecisionForSingularityReaction(
  context: AiJobContextV1,
  localEvent: Extract<SimEvent, { type: 'aiSpeech' }>,
  reason: string,
): AiDecisionV1 {
  const lineId = localEvent.speech.mode === 'lineId'
    ? localEvent.speech.lineId
    : profileFor(context.entity.kind, context.entity.templateId).fallbackLineId;
  const values = localEvent.speech.mode === 'lineId' ? localEvent.speech.values : undefined;
  return {
    schemaVersion: 1,
    jobId: context.jobId,
    entityRef: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
    ttlMs: 5_000,
    confidence: 0.15,
    speech: [{ mode: 'lineId', lineId, ...(values ? { values } : {}) }],
    intents: [{ type: reactionIntentType(localEvent.reaction?.kind ?? 'inspect'), lineId }],
    audit: {
      shortReason: `singularity provider fallback: ${reason.slice(0, 120)}`,
      usedPlayerInput: false,
      safetyNotes: ['Singularity reaction used local creature semantics after provider failure; quest, combat, reward, and economy state were unchanged.'],
    },
  };
}

function fallbackDecisionForPetCommand(
  context: AiJobContextV1,
  intent: AiPetCommandIntent,
  reason: string,
): AiDecisionV1 {
  return {
    schemaVersion: 1,
    jobId: context.jobId,
    entityRef: {
      kind: context.entity.kind,
      entityId: context.entity.entityId,
      templateId: context.entity.templateId,
    },
    ttlMs: 5_000,
    confidence: intent === 'commandPetIgnore' ? 0.1 : 0.45,
    speech: [],
    intents: [{ type: intent }],
    audit: {
      shortReason: `pet command fallback: ${reason.slice(0, 120)}`,
      usedPlayerInput: true,
      safetyNotes: ['Natural-language pet command was mapped only to an existing bounded pet command.'],
    },
  };
}

export function normalizePetCommandText(text: string): string {
  return text.trim().replace(/\s+/g, ' ').slice(0, 160);
}

export function localPetCommandIntent(text: string): AiPetCommandIntent {
  const normalized = normalizePetCommandText(text).toLowerCase();
  if (normalized.length === 0) return 'commandPetIgnore';
  if (/(taunt|growl|hold threat|pull threat|keep it on you|嘲讽|嘲諷|拉住|拉仇恨|吸引仇恨)/i.test(normalized)) {
    return 'commandPetTaunt';
  }
  if (/(aggressive|hunt freely|attack anything|主动|主動|自由攻击|自由攻擊|见敌就打|見敵就打)/i.test(normalized)) {
    return 'commandPetAggressive';
  }
  if (/(attack|sic|bite|kill|go get|tear into|进攻|攻擊|攻击|咬|上去打|打它|打他|打她)/i.test(normalized)) {
    return 'commandPetAttack';
  }
  if (/(defensive|defend|guard|protect|watch me|保护|保護|防御|防禦|守着|守著)/i.test(normalized)) {
    return 'commandPetDefensive';
  }
  if (/(passive|stay|heel|back|hold back|stop|calm|leave it|回来|回來|跟紧|跟緊|停下|别打|別打|别追|別追|冷静|冷靜)/i.test(normalized)) {
    return 'commandPetPassive';
  }
  return 'commandPetIgnore';
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
    score: eventReaction.score ?? shellReaction.score,
    sceneTags: eventReaction.sceneTags ?? shellReaction.sceneTags,
    individualTier: eventReaction.individualTier ?? shellReaction.individualTier,
    individualTraits: eventReaction.individualTraits ?? shellReaction.individualTraits,
    planId: eventReaction.planId ?? shellReaction.planId,
    planKind: eventReaction.planKind ?? shellReaction.planKind,
    planIntensity: eventReaction.planIntensity ?? shellReaction.planIntensity,
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
    source: 'fallback',
    reaction: {
      kind: reaction.reaction,
      targetItemId: dropped.itemId,
      score: Math.round(reaction.score * 100) / 100,
      sceneTags: [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags])].slice(0, 8),
      individualTier: reaction.individual?.tier,
      individualTraits: reaction.individual?.traits,
    },
    pid,
  };
}

function reactionIntentType(reaction: 'approach' | 'avoid' | 'inspect' | 'ignore'): AiIntentType {
  switch (reaction) {
    case 'approach': return 'approachObject';
    case 'avoid': return 'avoidObject';
    case 'inspect': return 'inspectObject';
    case 'ignore': return 'commentOnScene';
  }
}

function aiSpeechLineIds(events: readonly SimEvent[]): string[] {
  const lineIds: string[] = [];
  for (const event of events) {
    if (event.type === 'aiSpeech' && event.speech.mode === 'lineId') lineIds.push(event.speech.lineId);
  }
  return lineIds;
}
