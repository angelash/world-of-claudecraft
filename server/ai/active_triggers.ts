import { ITEMS, MOBS, NPCS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type {
  AiActiveMobActionIntent,
  AiActiveMobActionRequest,
  AiActiveMobActionResult,
  AiActiveNpcActionRequest,
  AiActiveNpcActionResult,
  Entity,
  MobFamily,
  SimEvent,
} from '../../src/sim/types';
import { dist2d } from '../../src/sim/types';
import type { AiJobContextV1, AiProvider, AiProviderDecisionResult, AiProviderOutput, AiProviderTimingSnapshot } from './ai_types';
import { classifyCanonSubject } from './canon_guard';
import { companionReactionEventsForScene } from './companion_reactions';
import { familySceneReactionEvent, nearbyFamilySceneCandidates, rankFamilySceneReactions } from './family_scene_reactions';
import type { FamilySceneReaction } from './family_scene_reactions';
import { validateAiDecision } from './intent_validator';
import { compactProfileSnapshot, profileFor } from './profiles';
import { sceneFrameFor } from './scene_frame';
import { sceneAwarenessEvent } from './scene_reactions';

export type AiActivePollCategory =
  | 'sceneAmbient'
  | 'time'
  | 'weather'
  | 'townLife'
  | 'livingRoutine'
  | 'creatureRoutine'
  | 'socialSequence';

export type AiActiveSkipReason =
  | 'disabled'
  | 'events_disabled'
  | 'polls_disabled'
  | 'no_online_players'
  | 'not_due'
  | 'player_missing'
  | 'player_busy_combat'
  | 'player_recent_ai_speech'
  | 'no_candidate'
  | 'entity_cooldown';

export type AiActiveQueuedEventKind =
  | 'quest_done'
  | 'item_discarded'
  | 'entity_death'
  | 'combat_damage';

export type AiActivePopulationBand =
  | 'solo'
  | 'small'
  | 'busy'
  | 'crowded'
  | 'protected';

export interface AiActivePollRuleV1 {
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

export interface AiActiveTriggerSessionLike {
  pid: number;
  left?: boolean;
  locale?: string;
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
  activeLastSkipReason: AiActiveSkipReason | '';
  activeLastRuleId: string;
}

export interface AiActivePollCursorSnapshot {
  ruleId: string;
  scopeKey: string;
  nextDueAtMs: number;
  lastCheckedAtMs: number;
  lastFiredAtMs: number;
  lastSkipReason: AiActiveSkipReason | '';
  fireCount: number;
}

export interface AiActiveTriggerDecisionSnapshot {
  ruleId: string;
  playerEntityId: number;
  speakerEntityId?: number;
  speakerTemplateId?: string;
  sceneId?: string;
  lineId?: string;
  skipReason?: AiActiveSkipReason;
  createdAtMs: number;
}

export interface AiActiveQueuedEventSnapshot {
  eventId: string;
  kind: AiActiveQueuedEventKind;
  playerEntityId: number;
  anchorEntityId?: number;
  anchorPos?: { x: number; z: number };
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

export interface AiActiveTriggerDiagnosticsSnapshot {
  enabled: boolean;
  eventsEnabled: boolean;
  pollsEnabled: boolean;
  realActionsEnabled: boolean;
  populationPolicy: AiActivePopulationPolicySnapshot | null;
  codexBudget: AiActiveCodexBudgetSnapshot;
  rules: AiActivePollRuleV1[];
  eventQueue: AiActiveQueuedEventSnapshot[];
  cursors: AiActivePollCursorSnapshot[];
  recentDecisions: AiActiveTriggerDecisionSnapshot[];
}

export interface AiActivePollRuleConfigUpdate {
  ruleId: string;
  enabled?: boolean;
  periodSeconds?: number;
  jitterSeconds?: number;
  priority?: number;
  providerPolicy?: AiActivePollRuleV1['providerPolicy'];
  outputMode?: AiActivePollRuleV1['outputMode'];
  cooldown?: {
    perPlayerSeconds?: number;
    perEntitySeconds?: number;
    perRuleSeconds?: number;
  };
}

export interface AiActiveTriggerConfigUpdate {
  enabled?: boolean;
  eventsEnabled?: boolean;
  pollsEnabled?: boolean;
  realActionsEnabled?: boolean;
  rules?: AiActivePollRuleConfigUpdate[];
}

export interface AiActiveTriggerServiceOptions {
  enabled?: boolean;
  eventsEnabled?: boolean;
  pollsEnabled?: boolean;
  realActionsEnabled?: boolean;
  rules?: readonly AiActivePollRuleV1[];
  thinkingDurationMs?: number;
  maxRecentDecisions?: number;
  eventTtlMs?: number;
  maxQueuedEvents?: number;
  codexMaxCalls5h?: number;
  codexMaxCallsWeek?: number;
  codexReserveRatio?: number;
  provider?: AiProvider;
}

export type AiActiveWorldActionBridge = (request: AiActiveMobActionRequest) => AiActiveMobActionResult;
export type AiActiveNpcActionBridge = (request: AiActiveNpcActionRequest) => AiActiveNpcActionResult;

interface AiActivePollCursorState {
  ruleId: string;
  scopeKey: string;
  nextDueAtMs: number;
  lastCheckedAtMs: number;
  lastFiredAtMs: number;
  lastSkipReason: AiActiveSkipReason | '';
  fireCount: number;
}

interface Candidate {
  entity: Entity;
  score: number;
  distance: number;
}

type AiSpeechEvent = Extract<SimEvent, { type: 'aiSpeech' }>;
type AiThinkingEvent = Extract<SimEvent, { type: 'aiThinking' }>;

interface CreatureRoutineResult {
  entity: Entity;
  event: AiSpeechEvent;
  routineKind: string;
}

interface SocialSequenceResult {
  kind: 'npc' | 'creature';
  family?: MobFamily;
  events: SimEvent[];
  speakers: Entity[];
  lineIds: string[];
}

interface AiActiveQueuedEventState {
  eventId: string;
  dedupeKey: string;
  kind: AiActiveQueuedEventKind;
  playerEntityId: number;
  anchorEntityId?: number;
  anchorPos?: { x: number; z: number };
  itemId?: string;
  questId?: string;
  subjectTemplateId?: string;
  outcome?: 'defeated' | 'wipe';
  phase?: 'bloodied' | 'desperate';
  priority: number;
  attempts: number;
  createdAtMs: number;
  expiresAtMs: number;
  nextAttemptAtMs: number;
  observations: string[];
}

const DEFAULT_THINKING_DURATION_MS = 1600;
const CANDIDATE_RADIUS = 28;
const DEFAULT_EVENT_TTL_MS = 90_000;
const DEFAULT_MAX_QUEUED_EVENTS = 64;
const EVENT_RETRY_DELAY_MS = 15_000;
const CODEX_WINDOW_5H_MS = 5 * 60 * 60 * 1000;
const CODEX_WINDOW_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_ACTIVE_POLL_RULES: readonly AiActivePollRuleV1[] = [
  {
    ruleId: 'scene_ambient_awareness',
    title: 'Scene ambient awareness',
    enabled: true,
    category: 'sceneAmbient',
    periodSeconds: envPositiveInt('AI_ACTIVE_POLL_BASE_SECONDS', 300),
    jitterSeconds: 60,
    priority: 50,
    scope: 'playerVicinity',
    providerPolicy: 'codexPreferred',
    outputMode: 'mixedLivingWorld',
    cooldown: {
      perPlayerSeconds: 90,
      perEntitySeconds: 180,
      perRuleSeconds: 30,
    },
  },
  {
    ruleId: 'npc_living_routine',
    title: 'NPC living routine',
    enabled: true,
    category: 'livingRoutine',
    periodSeconds: envPositiveInt('AI_ACTIVE_ROUTINE_SECONDS', 300),
    jitterSeconds: 75,
    priority: 45,
    scope: 'playerVicinity',
    providerPolicy: 'localOnly',
    outputMode: 'lineIdOnly',
    cooldown: {
      perPlayerSeconds: 120,
      perEntitySeconds: 240,
      perRuleSeconds: 45,
    },
  },
  {
    ruleId: 'creature_living_routine',
    title: 'Creature living routine',
    enabled: true,
    category: 'creatureRoutine',
    periodSeconds: envPositiveInt('AI_ACTIVE_CREATURE_ROUTINE_SECONDS', 300),
    jitterSeconds: 90,
    priority: 44,
    scope: 'playerVicinity',
    providerPolicy: 'localOnly',
    outputMode: 'lineIdOnly',
    cooldown: {
      perPlayerSeconds: 105,
      perEntitySeconds: 210,
      perRuleSeconds: 45,
    },
  },
  {
    ruleId: 'npc_social_sequence',
    title: 'NPC social sequence',
    enabled: true,
    category: 'socialSequence',
    periodSeconds: envPositiveInt('AI_ACTIVE_SOCIAL_SEQUENCE_SECONDS', 360),
    jitterSeconds: 90,
    priority: 43,
    scope: 'playerVicinity',
    providerPolicy: 'localOnly',
    outputMode: 'lineIdOnly',
    cooldown: {
      perPlayerSeconds: 150,
      perEntitySeconds: 240,
      perRuleSeconds: 60,
    },
  },
];

export class AiActiveTriggerService {
  private enabled: boolean;
  private eventsEnabled: boolean;
  private pollsEnabled: boolean;
  private realActionsEnabled: boolean;
  private rules: AiActivePollRuleV1[];
  private readonly thinkingDurationMs: number;
  private readonly maxRecentDecisions: number;
  private readonly eventTtlMs: number;
  private readonly maxQueuedEvents: number;
  private readonly codexMaxCalls5h: number;
  private readonly codexMaxCallsWeek: number;
  private readonly codexReserveRatio: number;
  private readonly provider: AiProvider | null;
  private readonly cursors = new Map<string, AiActivePollCursorState>();
  private readonly entityCooldownUntilMs = new Map<number, number>();
  private readonly playerCooldownUntilMs = new Map<number, number>();
  private readonly eventQueue: AiActiveQueuedEventState[] = [];
  private readonly recentDecisions: AiActiveTriggerDecisionSnapshot[] = [];
  private readonly codexProviderCallTimesMs: number[] = [];
  private readonly pendingProviderJobs = new Set<string>();
  private readonly sequenceTimers = new Set<ReturnType<typeof setTimeout>>();
  private populationPolicy: AiActivePopulationPolicySnapshot | null = null;
  private schedulerCursor = 0;
  private eventSequence = 0;
  private readonly metrics: AiActiveTriggerMetricsSnapshot = {
    activePollDue: 0,
    activePollSkipped: 0,
    activePollFired: 0,
    activeEventQueued: 0,
    activeEventSkipped: 0,
    activeEventFired: 0,
    activeEventExpired: 0,
    activeCandidatesScanned: 0,
    activeCandidatesSelected: 0,
    activeProviderCalls: 0,
    activeLocalReactions: 0,
    activeNoiseSuppressions: 0,
    activeSchedulerOnlineCount: 0,
    activeSchedulerSessionsConsidered: 0,
    activeSchedulerSessionsSuppressed: 0,
    activeSchedulerLastBand: '',
    activeCodexBudgetDenied: 0,
    activeCodexBudgetRemaining5h: 0,
    activeCodexBudgetRemainingWeek: 0,
    activeProviderJobs: 0,
    activeProviderSuccesses: 0,
    activeProviderErrors: 0,
    activeProviderRejected: 0,
    activeProviderFallbacks: 0,
    activeProviderPending: 0,
    activeLastProviderLatencyMs: 0,
    activeActionsAttempted: 0,
    activeActionsApplied: 0,
    activeActionsRejected: 0,
    activeMobActionsApplied: 0,
    activeNpcActionsApplied: 0,
    activeLastActionKind: '',
    activeLastActionResult: '',
    activeLastActionReason: '',
    activeRoutineFired: 0,
    activeRoutineLastKind: '',
    activeSequenceFired: 0,
    activeSequenceLastLength: 0,
    activeLastSkipReason: '',
    activeLastRuleId: '',
  };

  constructor(options: AiActiveTriggerServiceOptions = {}) {
    this.enabled = options.enabled ?? process.env.AI_LIVING_WORLD_EXPERIMENT !== '0';
    this.eventsEnabled = options.eventsEnabled ?? process.env.AI_ACTIVE_EVENTS_ENABLED !== '0';
    this.pollsEnabled = options.pollsEnabled ?? process.env.AI_ACTIVE_POLLS_ENABLED !== '0';
    this.realActionsEnabled = options.realActionsEnabled ?? process.env.AI_ACTIVE_REAL_ACTIONS_ENABLED !== '0';
    this.rules = normalizeActiveRules(options.rules ?? DEFAULT_ACTIVE_POLL_RULES);
    this.thinkingDurationMs = Math.max(0, Math.floor(options.thinkingDurationMs ?? DEFAULT_THINKING_DURATION_MS));
    this.maxRecentDecisions = Math.max(1, Math.floor(options.maxRecentDecisions ?? 40));
    this.eventTtlMs = Math.max(1_000, Math.floor(options.eventTtlMs ?? DEFAULT_EVENT_TTL_MS));
    this.maxQueuedEvents = Math.max(1, Math.floor(options.maxQueuedEvents ?? DEFAULT_MAX_QUEUED_EVENTS));
    this.codexMaxCalls5h = Math.max(0, Math.floor(options.codexMaxCalls5h ?? envNonNegativeInt('AI_CODEX_ACTIVE_MAX_CALLS_5H', 600)));
    this.codexMaxCallsWeek = Math.max(0, Math.floor(options.codexMaxCallsWeek ?? envNonNegativeInt('AI_CODEX_ACTIVE_MAX_CALLS_WEEK', 5_000)));
    this.codexReserveRatio = clamp01(options.codexReserveRatio ?? envRatio('AI_CODEX_ACTIVE_RESERVE_RATIO', 0.2));
    this.provider = options.provider ?? null;
    this.refreshCodexBudgetMetrics(Date.now());
  }

  noteSimEvents(input: { sim: Sim; events: readonly SimEvent[]; nowMs?: number }): void {
    if (!this.enabled) return;
    if (!this.eventsEnabled) {
      if (input.events.length > 0) this.recordSkip('', 'events_disabled', 'event');
      return;
    }
    const nowMs = input.nowMs ?? Date.now();
    for (const event of input.events) {
      const queued = this.queuedEventFromSimEvent(input.sim, event, nowMs);
      if (queued) this.enqueueEvent(queued);
    }
  }

  noteItemDiscarded(input: { sim: Sim; pid: number; itemId: string; count: number; nowMs?: number }): void {
    if (!this.enabled) return;
    if (!this.eventsEnabled) {
      this.recordSkip('', 'events_disabled', 'event');
      return;
    }
    const nowMs = input.nowMs ?? Date.now();
    const player = input.sim.entities.get(input.pid);
    if (!player) return;
    this.enqueueEvent({
      eventId: this.nextEventId('item'),
      dedupeKey: `item:${input.pid}:${input.itemId}`,
      kind: 'item_discarded',
      playerEntityId: input.pid,
      anchorEntityId: input.pid,
      anchorPos: { x: player.pos.x, z: player.pos.z },
      itemId: input.itemId,
      priority: itemEventPriority(input.itemId),
      attempts: 0,
      createdAtMs: nowMs,
      expiresAtMs: nowMs + this.eventTtlMs,
      nextAttemptAtMs: nowMs,
      observations: [
        'event:item_discarded',
        `item:${input.itemId}`,
        `count:${input.count}`,
      ],
    });
  }

  tick(input: {
    sim: Sim;
    sessions: Iterable<AiActiveTriggerSessionLike>;
    nowMs: number;
    deliver?: (pid: number, events: SimEvent[]) => void;
    applyAction?: AiActiveWorldActionBridge;
    applyNpcAction?: AiActiveNpcActionBridge;
  }): SimEvent[] {
    this.refreshCodexBudgetMetrics(input.nowMs);
    if (!this.enabled) {
      this.recordSkip('', 'disabled');
      return [];
    }

    const sessions = [...input.sessions].filter((session) => !session.left);
    if (sessions.length === 0) {
      this.recordSkip('', 'no_online_players');
      return [];
    }

    this.populationPolicy = populationPolicyForOnline(sessions.length);
    this.metrics.activeSchedulerOnlineCount = sessions.length;
    this.metrics.activeSchedulerLastBand = this.populationPolicy.band;

    const eventEvents = this.tryProcessQueuedEvents({
      sim: input.sim,
      sessions,
      nowMs: input.nowMs,
      applyNpcAction: input.applyNpcAction,
    });
    if (eventEvents.length > 0) return eventEvents;

    if (!this.pollsEnabled) {
      this.recordSkip('', 'polls_disabled');
      return [];
    }

    const events: SimEvent[] = [];
    const pollSessions = this.selectPollSessions(sessions, this.populationPolicy);
    this.metrics.activeSchedulerSessionsConsidered += pollSessions.length;
    this.metrics.activeSchedulerSessionsSuppressed += Math.max(0, sessions.length - pollSessions.length);
    for (const rule of this.rules) {
      if (!rule.enabled) continue;
      if (rule.priority < this.populationPolicy.minRulePriority) continue;
      if (!this.codexAllowedForRule(rule, input.nowMs)) continue;
      for (const session of pollSessions) {
        const cursor = this.cursorFor(rule, session.pid, input.nowMs);
        if (input.nowMs < cursor.nextDueAtMs) continue;
        cursor.lastCheckedAtMs = input.nowMs;
        this.metrics.activePollDue++;
        const result = this.tryFireRule({
          sim: input.sim,
          session,
          rule,
          nowMs: input.nowMs,
          deliver: input.deliver,
          applyAction: input.applyAction,
          applyNpcAction: input.applyNpcAction,
        });
        this.scheduleNext(rule, cursor, input.nowMs);
        if (result.events.length > 0) {
          events.push(...result.events);
          cursor.lastFiredAtMs = input.nowMs;
          cursor.lastSkipReason = '';
        } else {
          cursor.lastSkipReason = result.skipReason;
          this.recordSkip(rule.ruleId, result.skipReason);
        }
      }
    }
    return events;
  }

  runtimeMetrics(): AiActiveTriggerMetricsSnapshot {
    return { ...this.metrics };
  }

  diagnosticsSnapshot(): AiActiveTriggerDiagnosticsSnapshot {
    return {
      enabled: this.enabled,
      eventsEnabled: this.eventsEnabled,
      pollsEnabled: this.pollsEnabled,
      realActionsEnabled: this.realActionsEnabled,
      populationPolicy: this.populationPolicy ? { ...this.populationPolicy } : null,
      codexBudget: this.codexBudgetSnapshot(Date.now()),
      rules: this.rules.map((rule) => ({ ...rule, cooldown: { ...rule.cooldown } })),
      eventQueue: this.eventQueue.map((event) => eventSnapshot(event)),
      cursors: [...this.cursors.values()].map((cursor) => ({ ...cursor })),
      recentDecisions: [...this.recentDecisions],
    };
  }

  updateConfig(input: unknown): AiActiveTriggerDiagnosticsSnapshot {
    const patch = parseActiveTriggerConfigUpdate(input);
    if (patch.enabled !== undefined) this.enabled = patch.enabled;
    if (patch.eventsEnabled !== undefined) this.eventsEnabled = patch.eventsEnabled;
    if (patch.pollsEnabled !== undefined) this.pollsEnabled = patch.pollsEnabled;
    if (patch.realActionsEnabled !== undefined) this.realActionsEnabled = patch.realActionsEnabled;
    if (patch.rules) {
      const byId = new Map(this.rules.map((rule) => [rule.ruleId, rule]));
      for (const update of patch.rules) {
        const existing = byId.get(update.ruleId);
        if (!existing) throw new Error(`unknown active trigger rule: ${update.ruleId}`);
        byId.set(update.ruleId, mergeActiveRuleConfig(existing, update));
      }
      this.rules = normalizeActiveRules([...byId.values()]);
    }
    return this.diagnosticsSnapshot();
  }

  stop(): void {
    this.cursors.clear();
    this.entityCooldownUntilMs.clear();
    this.playerCooldownUntilMs.clear();
    this.eventQueue.splice(0);
    this.recentDecisions.splice(0);
    this.codexProviderCallTimesMs.splice(0);
    this.pendingProviderJobs.clear();
    for (const timer of this.sequenceTimers) clearTimeout(timer);
    this.sequenceTimers.clear();
    this.metrics.activeProviderPending = 0;
    this.populationPolicy = null;
  }

  private tryProcessQueuedEvents(input: {
    sim: Sim;
    sessions: readonly AiActiveTriggerSessionLike[];
    nowMs: number;
    applyNpcAction?: AiActiveNpcActionBridge;
  }): SimEvent[] {
    if (!this.eventsEnabled) {
      if (this.eventQueue.length > 0) this.recordSkip('active_event', 'events_disabled', 'event');
      return [];
    }
    this.pruneExpiredEvents(input.nowMs);
    if (this.eventQueue.length === 0) return [];

    const sessionsByPid = new Map(input.sessions.map((session) => [session.pid, session]));
    for (let i = 0; i < this.eventQueue.length; i++) {
      const queued = this.eventQueue[i];
      if (input.nowMs < queued.nextAttemptAtMs) continue;
      const session = sessionsByPid.get(queued.playerEntityId);
      if (!session || session.left) {
        this.eventQueue.splice(i, 1);
        i--;
        this.recordSkip(eventRuleId(queued), 'player_missing', 'event');
        continue;
      }
      const result = this.tryFireQueuedEvent({
        sim: input.sim,
        session,
        queued,
        nowMs: input.nowMs,
        applyNpcAction: input.applyNpcAction,
      });
      if (result.events.length > 0) {
        this.eventQueue.splice(i, 1);
        this.metrics.activeEventFired++;
        return result.events;
      }
      queued.attempts++;
      queued.nextAttemptAtMs = input.nowMs + EVENT_RETRY_DELAY_MS;
      this.recordSkip(eventRuleId(queued), result.skipReason, 'event');
    }
    return [];
  }

  private tryFireQueuedEvent(input: {
    sim: Sim;
    session: AiActiveTriggerSessionLike;
    queued: AiActiveQueuedEventState;
    nowMs: number;
    applyNpcAction?: AiActiveNpcActionBridge;
  }): { events: SimEvent[]; skipReason: AiActiveSkipReason } {
    const player = input.sim.entities.get(input.session.pid);
    if (!player) return { events: [], skipReason: 'player_missing' };
    if (player.dead || player.inCombat) return { events: [], skipReason: 'player_busy_combat' };

    const anchorEntity = input.queued.anchorEntityId !== undefined
      ? input.sim.entities.get(input.queued.anchorEntityId)
      : undefined;
    const anchor = anchorEntity?.pos
      ?? (input.queued.anchorPos ? { x: input.queued.anchorPos.x, y: player.pos.y, z: input.queued.anchorPos.z } : player.pos);
    const candidate = this.bestNpcCandidate(input.sim, anchor, input.nowMs);
    if (!candidate) return { events: [], skipReason: 'no_candidate' };
    if ((this.entityCooldownUntilMs.get(candidate.entity.id) ?? 0) > input.nowMs) {
      return { events: [], skipReason: 'entity_cooldown' };
    }

    const scene = sceneFrameFor(input.sim, player.pos, { excludeEntityIds: [player.id] });
    const context = this.contextFor(input.sim, player, candidate.entity, scene, {
      ...DEFAULT_ACTIVE_POLL_RULES[0],
      ruleId: eventRuleId(input.queued),
      category: 'sceneAmbient',
    }, input.queued, input.session.locale);
    const sceneEvent = sceneAwarenessEvent(context, candidate.entity);
    const localEvent: AiSpeechEvent = eventAwarenessEvent(context, candidate.entity, input.queued)
      ?? (sceneEvent?.type === 'aiSpeech' ? sceneEvent : null)
      ?? fallbackNpcAmbientEvent(context, candidate.entity, candidate.score);
    const lineId = localEvent.type === 'aiSpeech' && localEvent.speech.mode === 'lineId'
      ? localEvent.speech.lineId
      : undefined;
    const thinkingEvent: Extract<SimEvent, { type: 'aiThinking' }> = {
      type: 'aiThinking',
      speakerId: candidate.entity.id,
      speakerName: candidate.entity.name,
      durationMs: this.thinkingDurationMs,
      pid: player.id,
    };

    this.metrics.activeCandidatesSelected++;
    this.metrics.activeLocalReactions++;
    this.playerCooldownUntilMs.set(player.id, input.nowMs + 45_000);
    this.entityCooldownUntilMs.set(candidate.entity.id, input.nowMs + 90_000);
    this.pushDecision({
      ruleId: eventRuleId(input.queued),
      playerEntityId: player.id,
      speakerEntityId: candidate.entity.id,
      speakerTemplateId: candidate.entity.templateId,
      sceneId: scene.subsceneId ?? scene.zoneId,
      lineId,
      createdAtMs: input.nowMs,
    });
    this.tryApplyQueuedEventAction(input.queued, candidate.entity, player, input.applyNpcAction);
    return { events: [thinkingEvent, localEvent], skipReason: 'not_due' };
  }

  private tryApplyQueuedEventAction(
    queued: AiActiveQueuedEventState,
    npc: Entity,
    player: Entity,
    applyNpcAction?: AiActiveNpcActionBridge,
  ): void {
    if (!this.realActionsEnabled || !applyNpcAction) return;
    if (queued.kind !== 'item_discarded' || !queued.itemId) return;
    const traceKind = worldTraceKindForItemId(queued.itemId);
    const result = applyNpcAction({
      kind: 'shortMove',
      npcId: npc.id,
      playerId: player.id,
      relation: traceKind === 'cursed' ? 'awayFromPlayer' : 'towardPlayer',
      distance: traceKind === 'cursed' ? 1.8 : 1.2,
      durationSeconds: traceKind === 'cursed' ? 8 : 7,
      maxDistanceFromHome: npc.questIds.length > 0 || npc.vendorItems.length > 0 ? 3 : 6,
      maxPlayerDistance: CANDIDATE_RADIUS,
    });
    this.recordActionResult(`npc:${result.kind}`, result);
  }

  private tryFireRule(input: {
    sim: Sim;
    session: AiActiveTriggerSessionLike;
    rule: AiActivePollRuleV1;
    nowMs: number;
    deliver?: (pid: number, events: SimEvent[]) => void;
    applyAction?: AiActiveWorldActionBridge;
    applyNpcAction?: AiActiveNpcActionBridge;
  }): { events: SimEvent[]; skipReason: AiActiveSkipReason } {
    const player = input.sim.entities.get(input.session.pid);
    if (!player) return { events: [], skipReason: 'player_missing' };
    if (player.dead || player.inCombat) return { events: [], skipReason: 'player_busy_combat' };
    if ((this.playerCooldownUntilMs.get(player.id) ?? 0) > input.nowMs) {
      this.metrics.activeNoiseSuppressions++;
      return { events: [], skipReason: 'player_recent_ai_speech' };
    }
    if (input.rule.category === 'creatureRoutine') {
      return this.tryFireCreatureRoutine({
        sim: input.sim,
        player,
        rule: input.rule,
        nowMs: input.nowMs,
        applyAction: input.applyAction,
      });
    }
    if (input.rule.category === 'socialSequence') {
      return this.tryFireSocialSequence({
        sim: input.sim,
        player,
        rule: input.rule,
        nowMs: input.nowMs,
        deliver: input.deliver,
        applyAction: input.applyAction,
        applyNpcAction: input.applyNpcAction,
      });
    }

    const candidate = this.bestNpcCandidate(input.sim, player.pos, input.nowMs);
    if (!candidate) return { events: [], skipReason: 'no_candidate' };
    if ((this.entityCooldownUntilMs.get(candidate.entity.id) ?? 0) > input.nowMs) {
      return { events: [], skipReason: 'entity_cooldown' };
    }

    const scene = sceneFrameFor(input.sim, player.pos, { excludeEntityIds: [player.id] });
    const context = this.contextFor(input.sim, player, candidate.entity, scene, input.rule, undefined, input.session.locale);
    const routine = input.rule.category === 'livingRoutine'
      ? routineAwarenessEvent(context, candidate.entity)
      : null;
    const sceneEvent = sceneAwarenessEvent(context, candidate.entity);
    const localEvent: AiSpeechEvent = routine?.event
      ?? (sceneEvent?.type === 'aiSpeech' ? sceneEvent : null)
      ?? fallbackNpcAmbientEvent(context, candidate.entity, candidate.score);
    const lineId = localEvent.type === 'aiSpeech' && localEvent.speech.mode === 'lineId'
      ? localEvent.speech.lineId
      : undefined;
    const thinkingEvent: AiThinkingEvent = {
      type: 'aiThinking',
      speakerId: candidate.entity.id,
      speakerName: candidate.entity.name,
      durationMs: this.thinkingDurationMs,
      pid: player.id,
    };

    this.metrics.activePollFired++;
    this.metrics.activeCandidatesSelected++;
    this.metrics.activeLocalReactions++;
    if (routine) {
      this.metrics.activeRoutineFired++;
      this.metrics.activeRoutineLastKind = routine.kind;
    }
    this.playerCooldownUntilMs.set(player.id, input.nowMs + input.rule.cooldown.perPlayerSeconds * 1000);
    this.entityCooldownUntilMs.set(candidate.entity.id, input.nowMs + input.rule.cooldown.perEntitySeconds * 1000);
    this.pushDecision({
      ruleId: input.rule.ruleId,
      playerEntityId: player.id,
      speakerEntityId: candidate.entity.id,
      speakerTemplateId: candidate.entity.templateId,
      sceneId: scene.subsceneId ?? scene.zoneId,
      lineId,
      createdAtMs: input.nowMs,
    });
    if (routine) this.tryApplyNpcRoutineAction(candidate.entity, player, routine.kind, input.applyNpcAction);
    if (this.tryStartProviderNpcBeat({
      context,
      entity: candidate.entity,
      fallbackEvent: localEvent,
      rule: input.rule,
      nowMs: input.nowMs,
      deliver: input.deliver,
    })) {
      return { events: [thinkingEvent], skipReason: 'not_due' };
    }
    return { events: [thinkingEvent, localEvent], skipReason: 'not_due' };
  }

  private tryApplyNpcRoutineAction(
    npc: Entity,
    player: Entity,
    routineKind: NpcRoutineKind,
    applyNpcAction?: AiActiveNpcActionBridge,
  ): AiActiveNpcActionResult | null {
    if (!this.realActionsEnabled || !applyNpcAction) return null;
    const relation = routineKind === 'sleeping' ? 'awayFromPlayer' : 'sideStep';
    const distance = routineKind === 'shelter' ? 2.4 : routineKind === 'sleeping' ? 1.2 : routineKind === 'eating' ? 0.8 : 1.6;
    const durationSeconds = routineKind === 'sleeping' ? 14 : routineKind === 'shelter' ? 12 : routineKind === 'eating' ? 10 : 8;
    const result = applyNpcAction({
      kind: 'shortMove',
      npcId: npc.id,
      playerId: player.id,
      relation,
      distance,
      durationSeconds,
      maxDistanceFromHome: npc.questIds.length > 0 || npc.vendorItems.length > 0 ? 3 : 6,
      maxPlayerDistance: CANDIDATE_RADIUS,
    });
    this.recordActionResult(`npc:${result.kind}`, result);
    return result;
  }

  private tryStartProviderNpcBeat(input: {
    context: AiJobContextV1;
    entity: Entity;
    fallbackEvent: AiSpeechEvent;
    rule: AiActivePollRuleV1;
    nowMs: number;
    deliver?: (pid: number, events: SimEvent[]) => void;
  }): boolean {
    if (!this.provider || !input.deliver) return false;
    if (input.rule.providerPolicy === 'localOnly' || input.rule.outputMode === 'lineIdOnly') return false;
    const jobKey = `${input.rule.ruleId}:${input.context.player.entityId}:${input.entity.id}`;
    if (this.pendingProviderJobs.has(jobKey)) return false;
    this.pendingProviderJobs.add(jobKey);
    this.metrics.activeProviderPending = this.pendingProviderJobs.size;
    this.metrics.activeProviderJobs++;
    this.noteCodexProviderCall(input.nowMs);
    const startedAt = Date.now();
    void this.provider.decide(input.context)
      .then((providerOutput) => {
        const normalized = normalizeActiveProviderOutput(providerOutput);
        this.metrics.activeLastProviderLatencyMs = Math.max(0, Date.now() - startedAt);
        if (normalized.providerTimings) this.metrics.activeLastProviderTimings = normalized.providerTimings;
        const result = validateAiDecision({
          decision: normalized.decision,
          context: input.context,
          entity: input.entity,
          subject: classifyCanonSubject(input.entity),
          source: 'codex',
        });
        if (result.ok && result.events.length > 0) {
          this.metrics.activeProviderSuccesses++;
          input.deliver?.(input.context.player.entityId, result.events);
          return;
        }
        this.metrics.activeProviderRejected++;
        this.metrics.activeProviderFallbacks++;
        input.deliver?.(input.context.player.entityId, [input.fallbackEvent]);
      })
      .catch(() => {
        this.metrics.activeProviderErrors++;
        this.metrics.activeProviderFallbacks++;
        this.metrics.activeLastProviderLatencyMs = Math.max(0, Date.now() - startedAt);
        input.deliver?.(input.context.player.entityId, [input.fallbackEvent]);
      })
      .finally(() => {
        this.pendingProviderJobs.delete(jobKey);
        this.metrics.activeProviderPending = this.pendingProviderJobs.size;
      });
    return true;
  }

  private tryFireSocialSequence(input: {
    sim: Sim;
    player: Entity;
    rule: AiActivePollRuleV1;
    nowMs: number;
    deliver?: (pid: number, events: SimEvent[]) => void;
    applyAction?: AiActiveWorldActionBridge;
    applyNpcAction?: AiActiveNpcActionBridge;
  }): { events: SimEvent[]; skipReason: AiActiveSkipReason } {
    const scene = sceneFrameFor(input.sim, input.player.pos, { excludeEntityIds: [input.player.id] });
    const sequence = this.buildNpcSocialSequence(input.sim, input.player, scene, input.nowMs)
      ?? this.buildCreatureSocialSequence(input.sim, input.player, scene, input.nowMs);
    if (!sequence) return { events: [], skipReason: 'no_candidate' };

    this.metrics.activePollFired++;
    this.metrics.activeCandidatesSelected += sequence.speakers.length;
    this.metrics.activeLocalReactions += sequence.lineIds.length;
    this.metrics.activeSequenceFired++;
    this.metrics.activeSequenceLastLength = sequence.lineIds.length;
    this.playerCooldownUntilMs.set(input.player.id, input.nowMs + input.rule.cooldown.perPlayerSeconds * 1000);
    for (const speaker of sequence.speakers) {
      this.entityCooldownUntilMs.set(speaker.id, input.nowMs + input.rule.cooldown.perEntitySeconds * 1000);
    }
    this.pushDecision({
      ruleId: input.rule.ruleId,
      playerEntityId: input.player.id,
      speakerEntityId: sequence.speakers[0]?.id,
      speakerTemplateId: sequence.speakers[0]?.templateId,
      sceneId: scene.subsceneId ?? scene.zoneId,
      lineId: sequence.lineIds[0],
      createdAtMs: input.nowMs,
    });
    this.tryApplySocialSequenceActions(input.player, sequence, input.applyNpcAction, input.applyAction);
    if (input.deliver) {
      return {
        events: this.schedulePacedSequence({
          pid: input.player.id,
          events: sequence.events,
          deliver: input.deliver,
          canContinue: () => {
            const player = input.sim.entities.get(input.player.id);
            return Boolean(player && !player.dead && !player.inCombat);
          },
        }),
        skipReason: 'not_due',
      };
    }
    return { events: sequence.events, skipReason: 'not_due' };
  }

  private tryApplySocialSequenceActions(
    player: Entity,
    sequence: SocialSequenceResult,
    applyNpcAction?: AiActiveNpcActionBridge,
    applyAction?: AiActiveWorldActionBridge,
  ): void {
    if (!this.realActionsEnabled) return;
    if (sequence.kind === 'creature') {
      if (!applyAction) return;
      for (let i = 0; i < Math.min(2, sequence.speakers.length); i++) {
        const speaker = sequence.speakers[i];
        const event = sequence.events.find((candidate): candidate is AiSpeechEvent =>
          candidate.type === 'aiSpeech' && candidate.speakerId === speaker.id,
        );
        if (!event) continue;
        const intent = activeMobActionIntentForRoutine({
          entity: speaker,
          event,
          routineKind: `creature:${sequence.family ?? 'humanoid'}:sequence`,
        });
        if (!intent) continue;
        const result = applyAction({
          intent,
          mobId: speaker.id,
          playerId: player.id,
          maxDistance: CANDIDATE_RADIUS,
          social: true,
        });
        this.recordActionResult(`mob:${result.intent}`, result);
      }
      return;
    }
    if (!applyNpcAction) return;
    for (let i = 0; i < Math.min(2, sequence.speakers.length); i++) {
      const speaker = sequence.speakers[i];
      const result = applyNpcAction({
        kind: 'shortMove',
        npcId: speaker.id,
        playerId: player.id,
        relation: i === 0 ? 'sideStep' : 'towardPlayer',
        distance: i === 0 ? 1.2 : 0.8,
        durationSeconds: 6 + i * 2,
        maxDistanceFromHome: speaker.questIds.length > 0 || speaker.vendorItems.length > 0 ? 3 : 6,
        maxPlayerDistance: CANDIDATE_RADIUS,
      });
      this.recordActionResult(`npc:${result.kind}`, result);
    }
  }

  private schedulePacedSequence(input: {
    pid: number;
    events: SimEvent[];
    deliver: (pid: number, events: SimEvent[]) => void;
    canContinue: () => boolean;
  }): SimEvent[] {
    const [first, ...rest] = input.events;
    if (!first) return [];
    let delayMs = first.type === 'aiThinking' ? first.durationMs : this.thinkingDurationMs;
    for (const event of rest) {
      const timer = setTimeout(() => {
        this.sequenceTimers.delete(timer);
        if (input.canContinue()) input.deliver(input.pid, [event]);
      }, delayMs);
      this.sequenceTimers.add(timer);
      if (event.type === 'aiThinking') delayMs += event.durationMs;
      else delayMs += 900;
    }
    return [first];
  }

  private tryFireCreatureRoutine(input: {
    sim: Sim;
    player: Entity;
    rule: AiActivePollRuleV1;
    nowMs: number;
    applyAction?: AiActiveWorldActionBridge;
  }): { events: SimEvent[]; skipReason: AiActiveSkipReason } {
    const scene = sceneFrameFor(input.sim, input.player.pos, { excludeEntityIds: [input.player.id] });
    const result = this.bestCreatureRoutineEvent(input.sim, input.player, scene, input.nowMs);
    if (!result) return { events: [], skipReason: 'no_candidate' };
    if ((this.entityCooldownUntilMs.get(result.entity.id) ?? 0) > input.nowMs) {
      return { events: [], skipReason: 'entity_cooldown' };
    }

    const lineId = result.event.speech.mode === 'lineId' ? result.event.speech.lineId : undefined;
    const thinkingEvent: AiThinkingEvent = {
      type: 'aiThinking',
      speakerId: result.entity.id,
      speakerName: result.entity.name,
      durationMs: this.thinkingDurationMs,
      pid: input.player.id,
    };

    this.metrics.activePollFired++;
    this.metrics.activeCandidatesSelected++;
    this.metrics.activeLocalReactions++;
    this.metrics.activeRoutineFired++;
    this.metrics.activeRoutineLastKind = result.routineKind;
    this.playerCooldownUntilMs.set(input.player.id, input.nowMs + input.rule.cooldown.perPlayerSeconds * 1000);
    this.entityCooldownUntilMs.set(result.entity.id, input.nowMs + input.rule.cooldown.perEntitySeconds * 1000);
    this.pushDecision({
      ruleId: input.rule.ruleId,
      playerEntityId: input.player.id,
      speakerEntityId: result.entity.id,
      speakerTemplateId: result.entity.templateId,
      sceneId: scene.subsceneId ?? scene.zoneId,
      lineId,
      createdAtMs: input.nowMs,
    });
    this.tryApplyCreatureRoutineAction(result, input.player, input.applyAction);
    return { events: [thinkingEvent, result.event], skipReason: 'not_due' };
  }

  private tryApplyCreatureRoutineAction(
    result: CreatureRoutineResult,
    player: Entity,
    applyAction?: AiActiveWorldActionBridge,
  ): AiActiveMobActionResult | null {
    if (!this.realActionsEnabled || !applyAction) return null;
    const intent = activeMobActionIntentForRoutine(result);
    if (!intent) return null;
    const actionResult = applyAction({
      intent,
      mobId: result.entity.id,
      playerId: player.id,
      maxDistance: CANDIDATE_RADIUS,
      social: intent !== 'flee',
    });
    this.recordActionResult(`mob:${actionResult.intent}`, actionResult);
    return actionResult;
  }

  private recordActionResult(
    kind: string,
    result: AiActiveMobActionResult | AiActiveNpcActionResult,
  ): void {
    this.metrics.activeActionsAttempted++;
    this.metrics.activeLastActionKind = kind;
    this.metrics.activeLastActionResult = result.ok ? 'applied' : 'rejected';
    this.metrics.activeLastActionReason = result.ok ? '' : result.reason ?? 'unknown';
    if (result.ok) {
      this.metrics.activeActionsApplied++;
      if (kind.startsWith('mob:')) this.metrics.activeMobActionsApplied++;
      if (kind.startsWith('npc:')) this.metrics.activeNpcActionsApplied++;
    } else {
      this.metrics.activeActionsRejected++;
    }
  }

  private bestCreatureRoutineEvent(
    sim: Sim,
    player: Entity,
    scene: ReturnType<typeof sceneFrameFor>,
    nowMs: number,
  ): CreatureRoutineResult | null {
    const companion = this.bestCompanionRoutineEvent(sim, player, scene, nowMs);
    if (companion) return companion;

    const candidates = nearbyFamilySceneCandidates(scene, sim.entities.values(), player)
      .filter((entity) => (this.entityCooldownUntilMs.get(entity.id) ?? 0) <= nowMs);
    this.metrics.activeCandidatesScanned += candidates.length;
    const [reaction] = rankFamilySceneReactions(scene, candidates, { worldSeed: sim.cfg.seed });
    if (!reaction) return null;
    return {
      entity: reaction.entity,
      event: familySceneReactionEvent(reaction, scene, player.id) as AiSpeechEvent,
      routineKind: `creature:${reaction.family}:${reaction.reaction}`,
    };
  }

  private bestCompanionRoutineEvent(
    sim: Sim,
    player: Entity,
    scene: ReturnType<typeof sceneFrameFor>,
    nowMs: number,
  ): CreatureRoutineResult | null {
    const ownCompanion = scene.companions.find((companion) => {
      const entity = sim.entities.get(companion.entityId);
      return entity?.kind === 'mob'
        && entity.ownerId === player.id
        && (this.entityCooldownUntilMs.get(entity.id) ?? 0) <= nowMs;
    });
    if (!ownCompanion) return null;
    this.metrics.activeCandidatesScanned++;
    const entity = sim.entities.get(ownCompanion.entityId);
    if (!entity) return null;
    const [event] = companionReactionEventsForScene({ ...scene, companions: [ownCompanion] }, player.id);
    if (!event || event.type !== 'aiSpeech') return null;
    return {
      entity,
      event,
      routineKind: `companion:${ownCompanion.family ?? 'unknown'}:${event.reaction?.kind ?? 'inspect'}`,
    };
  }

  private bestNpcCandidate(sim: Sim, origin: Entity['pos'], nowMs: number): Candidate | null {
    const candidates = this.npcCandidates(sim, origin, nowMs);
    candidates.sort((a, b) => b.score - a.score || a.distance - b.distance || a.entity.id - b.entity.id);
    return candidates[0] ?? null;
  }

  private npcCandidates(sim: Sim, origin: Entity['pos'], nowMs: number): Candidate[] {
    const candidates: Candidate[] = [];
    for (const entity of sim.entities.values()) {
      if (entity.kind !== 'npc' || entity.dead) continue;
      const distance = dist2d(origin, entity.pos);
      if (distance > CANDIDATE_RADIUS) continue;
      this.metrics.activeCandidatesScanned++;
      if ((this.entityCooldownUntilMs.get(entity.id) ?? 0) > nowMs) continue;
      const score = candidateScore(entity, distance);
      candidates.push({ entity, score, distance });
    }
    return candidates;
  }

  private buildNpcSocialSequence(
    sim: Sim,
    player: Entity,
    scene: ReturnType<typeof sceneFrameFor>,
    nowMs: number,
  ): SocialSequenceResult | null {
    const speakers = this.npcCandidates(sim, player.pos, nowMs)
      .sort((a, b) => b.score - a.score || a.distance - b.distance || a.entity.id - b.entity.id)
      .slice(0, 3)
      .map((candidate) => candidate.entity);
    if (speakers.length < 2) return null;

    const lineIds = socialSequenceLineIds(scene, speakers.length);
    const usedLineIds = lineIds.slice(0, Math.min(speakers.length, lineIds.length));
    const events: SimEvent[] = [];
    for (let i = 0; i < usedLineIds.length; i++) {
      const speaker = speakers[i];
      const partner = speakers[(i + 1) % speakers.length];
      const durationMs = this.thinkingDurationMs + i * 1200;
      events.push({
        type: 'aiThinking',
        speakerId: speaker.id,
        speakerName: speaker.name,
        durationMs,
        pid: player.id,
      });
      events.push(socialSequenceLine({
        scene,
        speaker,
        partner,
        player,
        lineId: usedLineIds[i],
        step: i,
      }));
    }
    return {
      kind: 'npc',
      events,
      speakers: speakers.slice(0, usedLineIds.length),
      lineIds: usedLineIds,
    };
  }

  private buildCreatureSocialSequence(
    sim: Sim,
    player: Entity,
    scene: ReturnType<typeof sceneFrameFor>,
    nowMs: number,
  ): SocialSequenceResult | null {
    const candidates = nearbyFamilySceneCandidates(scene, sim.entities.values(), player)
      .filter((entity) => (this.entityCooldownUntilMs.get(entity.id) ?? 0) <= nowMs);
    this.metrics.activeCandidatesScanned += candidates.length;
    const reactions = rankFamilySceneReactions(scene, candidates, { worldSeed: sim.cfg.seed });
    const group = bestCreatureSequenceGroup(reactions);
    if (!group) return null;

    const events: SimEvent[] = [];
    const lineIds: string[] = [];
    for (let i = 0; i < group.reactions.length; i++) {
      const reaction = group.reactions[i];
      const partner = group.reactions[(i + 1) % group.reactions.length].entity;
      const durationMs = this.thinkingDurationMs + i * 1100;
      const speech = creatureSequenceLine({
        reaction,
        scene,
        player,
        partner,
        step: i,
      });
      events.push({
        type: 'aiThinking',
        speakerId: reaction.entity.id,
        speakerName: reaction.entity.name,
        durationMs,
        pid: player.id,
      });
      events.push(speech);
      if (speech.speech.mode === 'lineId') lineIds.push(speech.speech.lineId);
    }

    return {
      kind: 'creature',
      family: group.family,
      events,
      speakers: group.reactions.map((reaction) => reaction.entity),
      lineIds,
    };
  }

  private contextFor(
    sim: Sim,
    player: Entity,
    speaker: Entity,
    scene: ReturnType<typeof sceneFrameFor>,
    rule: AiActivePollRuleV1,
    queuedEvent?: AiActiveQueuedEventState,
    locale = 'en',
  ): AiJobContextV1 {
    const meta = sim.meta(player.id);
    const profile = profileFor('npc', speaker.templateId);
    return {
      schemaVersion: 1,
      jobId: `ai-active-${rule.ruleId}-${player.id}-${speaker.id}`,
      trigger: queuedEvent ? 'active_event' : 'active_poll',
      entity: {
        kind: 'npc',
        entityId: speaker.id,
        templateId: speaker.templateId,
        name: speaker.name,
        level: speaker.level,
        questIds: [...speaker.questIds],
        dead: speaker.dead,
      },
      player: {
        entityId: player.id,
        name: player.name,
        level: player.level,
        classId: player.templateId,
        activeQuestIds: meta ? [...meta.questLog.keys()] : [],
        completedQuestIds: meta ? [...meta.questsDone] : [],
      },
      locale: normalizeActiveLocale(locale),
      profile: compactProfileSnapshot(profile),
      scene,
      familySemantics: null,
      questFacts: [],
      recentObservations: [
        `rule:${rule.ruleId}`,
        `category:${rule.category}`,
        `time:${scene.time.phase}`,
        `weather:${scene.weather.kind}`,
        `scene:${scene.subsceneId ?? scene.zoneId}`,
        ...(queuedEvent?.observations ?? []),
      ],
      allowedIntents: profile.allowedIntentTypes,
      allowedLineIds: profile.allowedLineIds,
      outputMode: activeOutputModeForRule(rule),
    };
  }

  private cursorFor(rule: AiActivePollRuleV1, pid: number, nowMs: number): AiActivePollCursorState {
    const scopeKey = `player:${pid}`;
    const key = `${rule.ruleId}:${scopeKey}`;
    const existing = this.cursors.get(key);
    if (existing) return existing;
    const cursor: AiActivePollCursorState = {
      ruleId: rule.ruleId,
      scopeKey,
      nextDueAtMs: nowMs,
      lastCheckedAtMs: 0,
      lastFiredAtMs: 0,
      lastSkipReason: '',
      fireCount: 0,
    };
    this.cursors.set(key, cursor);
    return cursor;
  }

  private scheduleNext(rule: AiActivePollRuleV1, cursor: AiActivePollCursorState, nowMs: number): void {
    cursor.fireCount++;
    const jitterMs = stableJitterMs(rule.ruleId, cursor.scopeKey, cursor.fireCount, rule.jitterSeconds);
    cursor.nextDueAtMs = nowMs + rule.periodSeconds * 1000 + jitterMs;
  }

  private recordSkip(ruleId: string, reason: AiActiveSkipReason, source: 'poll' | 'event' = 'poll'): void {
    if (source === 'event') this.metrics.activeEventSkipped++;
    else this.metrics.activePollSkipped++;
    this.metrics.activeLastRuleId = ruleId;
    this.metrics.activeLastSkipReason = reason;
  }

  private pushDecision(decision: AiActiveTriggerDecisionSnapshot): void {
    this.recentDecisions.unshift(decision);
    if (this.recentDecisions.length > this.maxRecentDecisions) this.recentDecisions.length = this.maxRecentDecisions;
    this.metrics.activeLastRuleId = decision.ruleId;
    this.metrics.activeLastSkipReason = '';
  }

  private selectPollSessions(
    sessions: readonly AiActiveTriggerSessionLike[],
    policy: AiActivePopulationPolicySnapshot,
  ): AiActiveTriggerSessionLike[] {
    if (sessions.length <= policy.maxPollSessionsPerTick) return [...sessions];
    const ordered = [...sessions].sort((a, b) => a.pid - b.pid);
    const start = this.schedulerCursor % ordered.length;
    const selected: AiActiveTriggerSessionLike[] = [];
    for (let offset = 0; offset < ordered.length && selected.length < policy.maxPollSessionsPerTick; offset++) {
      selected.push(ordered[(start + offset) % ordered.length]);
    }
    this.schedulerCursor = (start + policy.maxPollSessionsPerTick) % ordered.length;
    return selected;
  }

  private codexAllowedForRule(rule: AiActivePollRuleV1, nowMs: number): boolean {
    if (rule.providerPolicy === 'localOnly') return true;
    const budget = this.codexBudgetSnapshot(nowMs);
    const allowed = budget.remainingCalls5h > 0
      && budget.remainingCallsWeek > 0
      && this.populationPolicy?.codexAdmission !== 'localOnly';
    if (!allowed) {
      this.metrics.activeCodexBudgetDenied++;
      return rule.providerPolicy === 'codexAllowed';
    }
    return true;
  }

  noteCodexProviderCall(nowMs: number): void {
    this.codexProviderCallTimesMs.push(nowMs);
    this.metrics.activeProviderCalls++;
    this.refreshCodexBudgetMetrics(nowMs);
  }

  private codexBudgetSnapshot(nowMs: number): AiActiveCodexBudgetSnapshot {
    this.pruneCodexProviderCalls(nowMs);
    const usedCalls5h = this.codexProviderCallTimesMs.filter((atMs) => nowMs - atMs <= CODEX_WINDOW_5H_MS).length;
    const usedCallsWeek = this.codexProviderCallTimesMs.length;
    const maxCalls5h = Math.floor(this.codexMaxCalls5h * (1 - this.codexReserveRatio));
    const maxCallsWeek = Math.floor(this.codexMaxCallsWeek * (1 - this.codexReserveRatio));
    return {
      maxCalls5h,
      usedCalls5h,
      remainingCalls5h: Math.max(0, maxCalls5h - usedCalls5h),
      maxCallsWeek,
      usedCallsWeek,
      remainingCallsWeek: Math.max(0, maxCallsWeek - usedCallsWeek),
      reserveRatio: this.codexReserveRatio,
    };
  }

  private refreshCodexBudgetMetrics(nowMs: number): void {
    const budget = this.codexBudgetSnapshot(nowMs);
    this.metrics.activeCodexBudgetRemaining5h = budget.remainingCalls5h;
    this.metrics.activeCodexBudgetRemainingWeek = budget.remainingCallsWeek;
  }

  private pruneCodexProviderCalls(nowMs: number): void {
    for (let i = this.codexProviderCallTimesMs.length - 1; i >= 0; i--) {
      if (nowMs - this.codexProviderCallTimesMs[i] <= CODEX_WINDOW_WEEK_MS) continue;
      this.codexProviderCallTimesMs.splice(i, 1);
    }
  }

  private queuedEventFromSimEvent(sim: Sim, event: SimEvent, nowMs: number): AiActiveQueuedEventState | null {
    if (event.type === 'questDone' && event.pid !== undefined) {
      return {
        eventId: this.nextEventId('quest'),
        dedupeKey: `quest:${event.pid}:${event.questId}`,
        kind: 'quest_done',
        playerEntityId: event.pid,
        anchorEntityId: event.pid,
        questId: event.questId,
        priority: 95,
        attempts: 0,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + this.eventTtlMs,
        nextAttemptAtMs: nowMs,
        observations: ['event:questDone', `quest:${event.questId}`],
      };
    }
    if (event.type === 'death') {
      const dead = sim.entities.get(event.entityId);
      const sourcePlayerId = this.sourcePlayerIdForEntity(sim, event.killerId)
        ?? (dead?.kind === 'mob' ? dead.tappedById : null);
      if (!dead || sourcePlayerId === null) return null;
      const mob = dead.kind === 'mob' ? MOBS[dead.templateId] : undefined;
      const killer = sim.entities.get(event.killerId);
      const killerMob = killer?.kind === 'mob' ? MOBS[killer.templateId] : undefined;
      const important = Boolean(mob?.boss || mob?.rare || mob?.elite || killerMob?.boss || killerMob?.rare || killerMob?.elite);
      if (!important) return null;
      const subject = dead.kind === 'player' && killer?.kind === 'mob' ? killer : dead;
      return {
        eventId: this.nextEventId('death'),
        dedupeKey: `death:${event.entityId}:${event.killerId}`,
        kind: 'entity_death',
        playerEntityId: sourcePlayerId,
        anchorEntityId: subject.id,
        subjectTemplateId: subject.templateId,
        outcome: dead.kind === 'player' ? 'wipe' : 'defeated',
        priority: 90,
        attempts: 0,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + this.eventTtlMs,
        nextAttemptAtMs: nowMs,
        observations: ['event:death', `subject:${subject.templateId}`, `outcome:${dead.kind === 'player' ? 'wipe' : 'defeated'}`],
      };
    }
    if (event.type === 'damage' && event.kind === 'hit' && event.amount > 0) {
      const target = sim.entities.get(event.targetId);
      if (!target || target.kind !== 'mob' || target.maxHp <= 0) return null;
      const mob = MOBS[target.templateId];
      if (!mob?.boss) return null;
      const sourcePlayerId = this.sourcePlayerIdForEntity(sim, event.sourceId) ?? target.tappedById;
      if (sourcePlayerId === null) return null;
      const hpFrac = target.hp / target.maxHp;
      const phase = hpFrac <= 0.2 ? 'desperate' : hpFrac <= 0.5 ? 'bloodied' : null;
      if (!phase) return null;
      return {
        eventId: this.nextEventId('damage'),
        dedupeKey: `damage:${target.id}:${phase}`,
        kind: 'combat_damage',
        playerEntityId: sourcePlayerId,
        anchorEntityId: target.id,
        subjectTemplateId: target.templateId,
        phase,
        priority: phase === 'desperate' ? 88 : 82,
        attempts: 0,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + this.eventTtlMs,
        nextAttemptAtMs: nowMs,
        observations: ['event:damage', `subject:${target.templateId}`, `phase:${phase}`, `amount:${event.amount}`],
      };
    }
    return null;
  }

  private sourcePlayerIdForEntity(sim: Sim, entityId: number): number | null {
    const entity = sim.entities.get(entityId);
    if (!entity) return null;
    if (entity.kind === 'player') return entity.id;
    if (entity.ownerId !== null) {
      const owner = sim.entities.get(entity.ownerId);
      if (owner?.kind === 'player') return owner.id;
    }
    if (entity.kind === 'mob' && entity.tappedById !== null) return entity.tappedById;
    return null;
  }

  private enqueueEvent(event: AiActiveQueuedEventState): void {
    const existing = this.eventQueue.find((queued) => queued.dedupeKey === event.dedupeKey);
    if (existing) {
      existing.priority = Math.max(existing.priority, event.priority);
      existing.expiresAtMs = Math.max(existing.expiresAtMs, event.expiresAtMs);
      existing.observations = [...new Set([...existing.observations, ...event.observations])].slice(0, 10);
      this.metrics.activeNoiseSuppressions++;
      return;
    }
    this.eventQueue.push(event);
    this.eventQueue.sort((a, b) => b.priority - a.priority || a.createdAtMs - b.createdAtMs || a.eventId.localeCompare(b.eventId));
    if (this.eventQueue.length > this.maxQueuedEvents) {
      this.eventQueue.length = this.maxQueuedEvents;
      this.metrics.activeEventExpired++;
    }
    this.metrics.activeEventQueued++;
  }

  private pruneExpiredEvents(nowMs: number): void {
    for (let i = this.eventQueue.length - 1; i >= 0; i--) {
      if (this.eventQueue[i].expiresAtMs > nowMs) continue;
      this.eventQueue.splice(i, 1);
      this.metrics.activeEventExpired++;
    }
  }

  private nextEventId(prefix: string): string {
    return `active-${prefix}-${++this.eventSequence}`;
  }
}

function candidateScore(entity: Entity, distance: number): number {
  let score = 1 - Math.min(1, distance / CANDIDATE_RADIUS);
  if (entity.questIds.length > 0) score += 0.35;
  if (entity.vendorItems.length > 0) score += 0.2;
  const npc = NPCS[entity.templateId];
  if (npc && /(marshal|captain|warden|tidewatcher|loremaster|quartermaster|master|keeper)/i.test(`${npc.name} ${npc.title}`)) {
    score += 0.25;
  }
  return score;
}

function eventSnapshot(event: AiActiveQueuedEventState): AiActiveQueuedEventSnapshot {
  return {
    eventId: event.eventId,
    kind: event.kind,
    playerEntityId: event.playerEntityId,
    ...(event.anchorEntityId === undefined ? {} : { anchorEntityId: event.anchorEntityId }),
    ...(event.anchorPos === undefined ? {} : { anchorPos: { ...event.anchorPos } }),
    ...(event.itemId === undefined ? {} : { itemId: event.itemId }),
    ...(event.questId === undefined ? {} : { questId: event.questId }),
    ...(event.subjectTemplateId === undefined ? {} : { subjectTemplateId: event.subjectTemplateId }),
    priority: event.priority,
    attempts: event.attempts,
    createdAtMs: event.createdAtMs,
    expiresAtMs: event.expiresAtMs,
    nextAttemptAtMs: event.nextAttemptAtMs,
    observations: [...event.observations],
  };
}

function eventAwarenessEvent(
  context: AiJobContextV1,
  speaker: Entity,
  event: AiActiveQueuedEventState,
): Extract<SimEvent, { type: 'aiSpeech' }> | null {
  const baseValues = {
    speakerName: speaker.name,
    playerName: context.player.name,
  };
  if (event.kind === 'quest_done' && event.questId) {
    const profile = profileFor('npc', speaker.templateId);
    return {
      type: 'aiSpeech',
      speakerId: speaker.id,
      speakerName: speaker.name,
      speech: {
        mode: 'lineId',
        lineId: profile.socialMemory?.questRumorLineId ?? 'hudChrome.aiSpeech.memoryQuestRumorEcho',
        values: { ...baseValues, questId: event.questId },
      },
      source: 'local',
      reaction: { kind: 'inspect', sceneTags: eventSceneTags(context, 'event:questDone') },
      pid: context.player.entityId,
    };
  }
  if (event.kind === 'item_discarded' && event.itemId) {
    const traceKind = worldTraceKindForItemId(event.itemId);
    return {
      type: 'aiSpeech',
      speakerId: speaker.id,
      speakerName: speaker.name,
      speech: {
        mode: 'lineId',
        lineId: npcWorldTraceLineId(traceKind),
        values: { ...baseValues, itemId: event.itemId, traceKind, traceStrength: 100 },
      },
      source: 'local',
      reaction: {
        kind: traceKind === 'cursed' ? 'avoid' : 'inspect',
        targetItemId: event.itemId,
        ...(event.anchorPos ? { targetPos: { ...event.anchorPos } } : {}),
        actionDurationMs: traceKind === 'cursed' ? 2800 : 1900,
        actionOffset: traceKind === 'cursed' ? 0.6 : 0.18,
        score: event.priority / 100,
        sceneTags: eventSceneTags(context, `trace:${traceKind}`),
      },
      pid: context.player.entityId,
    };
  }
  if (event.kind === 'entity_death' && event.subjectTemplateId) {
    const lineId = event.outcome === 'wipe'
      ? 'hudChrome.aiSpeech.bossMemoryWipe'
      : 'hudChrome.aiSpeech.bossMemoryDefeated';
    return {
      type: 'aiSpeech',
      speakerId: speaker.id,
      speakerName: speaker.name,
      speech: {
        mode: 'lineId',
        lineId,
        values: { ...baseValues, bossTemplateId: event.subjectTemplateId, encounterOutcome: event.outcome ?? 'defeated' },
      },
      source: 'local',
      reaction: {
        kind: event.outcome === 'wipe' ? 'avoid' : 'inspect',
        score: event.priority / 100,
        sceneTags: eventSceneTags(context, `event:${event.outcome ?? 'defeated'}`),
      },
      pid: context.player.entityId,
    };
  }
  if (event.kind === 'combat_damage' && event.subjectTemplateId && event.phase) {
    return {
      type: 'aiSpeech',
      speakerId: speaker.id,
      speakerName: speaker.name,
      speech: {
        mode: 'lineId',
        lineId: event.phase === 'desperate'
          ? 'hudChrome.aiSpeech.bossPhaseDesperate'
          : 'hudChrome.aiSpeech.bossPhaseBloodied',
        values: { ...baseValues, bossTemplateId: event.subjectTemplateId, encounterPhase: event.phase },
      },
      source: 'local',
      reaction: {
        kind: event.phase === 'desperate' ? 'avoid' : 'inspect',
        score: event.priority / 100,
        sceneTags: eventSceneTags(context, `phase:${event.phase}`),
      },
      pid: context.player.entityId,
    };
  }
  return null;
}

function eventSceneTags(context: AiJobContextV1, extra: string): string[] {
  return context.scene
    ? [...new Set([...context.scene.locationTags, ...context.scene.structureTags, ...context.scene.environmentalTags, extra])].slice(0, 8)
    : [extra];
}

type ActiveWorldTraceKind = 'singularity' | 'cursed' | 'food' | 'valuable' | 'generic';

function worldTraceKindForItemId(itemId: string): ActiveWorldTraceKind {
  const item = ITEMS[itemId];
  if (!item) return 'generic';
  if (item.kind === 'food' || item.kind === 'drink') return 'food';
  if (item.kind === 'weapon' || item.kind === 'armor' || item.kind === 'tool') return 'valuable';
  if (item.kind === 'quest') return 'generic';
  if (item.quality === 'rare' || item.quality === 'epic' || item.quality === 'uncommon') return 'valuable';
  return 'generic';
}

function npcWorldTraceLineId(kind: ActiveWorldTraceKind): string {
  switch (kind) {
    case 'singularity': return 'hudChrome.aiSpeech.worldTraceNpcSingularity';
    case 'cursed': return 'hudChrome.aiSpeech.worldTraceNpcCursed';
    case 'food': return 'hudChrome.aiSpeech.worldTraceNpcFood';
    case 'valuable': return 'hudChrome.aiSpeech.worldTraceNpcValuable';
    case 'generic': return 'hudChrome.aiSpeech.worldTraceNpcGeneric';
  }
}

function itemEventPriority(itemId: string): number {
  const kind = worldTraceKindForItemId(itemId);
  switch (kind) {
    case 'singularity': return 96;
    case 'cursed': return 92;
    case 'valuable': return 88;
    case 'food': return 84;
    case 'generic': return 72;
  }
}

function eventRuleId(event: AiActiveQueuedEventState): string {
  return `event:${event.kind}`;
}

type NpcRoutineKind = 'working' | 'sleeping' | 'shelter' | 'watching' | 'eating';

function routineAwarenessEvent(
  context: AiJobContextV1,
  speaker: Entity,
): { kind: NpcRoutineKind; event: Extract<SimEvent, { type: 'aiSpeech' }> } | null {
  const scene = context.scene;
  if (!scene) return null;
  const commonValues = {
    speakerName: speaker.name,
    subsceneId: scene.subsceneId ?? scene.zoneId,
  };
  if (scene.weather.kind === 'rain') {
    return {
      kind: 'shelter',
      event: routineLine(context, speaker, 'hudChrome.aiSpeech.sceneRainWeariness', commonValues, 'inspect', 'shelter'),
    };
  }
  if (scene.light.tags.includes('starrySky')) {
    return {
      kind: 'watching',
      event: routineLine(context, speaker, 'hudChrome.aiSpeech.sceneClearNightAwe', commonValues, 'inspect', 'watching'),
    };
  }
  if (scene.time.phase === 'night') {
    return {
      kind: 'sleeping',
      event: routineLine(context, speaker, 'hudChrome.aiSpeech.sceneNightFatigue', commonValues, 'avoid', 'sleeping'),
    };
  }
  if (isMealHour(scene.time.hour) && scene.danger.safeHavenScore >= 0.45) {
    return {
      kind: 'eating',
      event: routineLine(context, speaker, 'hudChrome.aiSpeech.sceneDayEnergy', commonValues, 'inspect', 'eating'),
    };
  }
  if (scene.time.phase === 'day' && scene.danger.safeHavenScore >= 0.55) {
    return {
      kind: 'working',
      event: routineLine(context, speaker, 'hudChrome.aiSpeech.sceneDayEnergy', commonValues, 'inspect', 'working'),
    };
  }
  return null;
}

function isMealHour(hour: number): boolean {
  return (hour >= 11.5 && hour < 13.5) || (hour >= 17.5 && hour < 19);
}

function routineLine(
  context: AiJobContextV1,
  speaker: Entity,
  lineId: string,
  values: Record<string, string | number>,
  reactionKind: 'avoid' | 'inspect',
  planKind: string,
): Extract<SimEvent, { type: 'aiSpeech' }> {
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: { mode: 'lineId', lineId, values },
    source: 'local',
    reaction: {
      kind: reactionKind,
      score: 0.72,
      planKind,
      planIntensity: 0.35,
      sceneTags: eventSceneTags(context, `routine:${planKind}`),
    },
    pid: context.player.entityId,
  };
}

function socialSequenceLineIds(scene: ReturnType<typeof sceneFrameFor>, speakerCount: number): string[] {
  const first = socialSequenceFirstLineId(scene);
  const second = scene.danger.undeadPressure >= 0.25 || scene.environmentalTags.includes('deathPressure')
    ? 'hudChrome.aiSpeech.sceneUndeadPressure'
    : scene.time.phase === 'night'
      ? 'hudChrome.aiSpeech.sceneNightFatigue'
      : 'hudChrome.aiSpeech.topicPlace';
  const third = scene.locationTags.includes('safeTown')
    ? 'hudChrome.aiSpeech.topicRecentKnown'
    : 'hudChrome.aiSpeech.genericNpcAwake';
  return [first, second, third].slice(0, Math.max(0, speakerCount));
}

function socialSequenceFirstLineId(scene: ReturnType<typeof sceneFrameFor>): string {
  if (scene.weather.kind === 'rain') return 'hudChrome.aiSpeech.sceneRainWeariness';
  if (scene.weather.kind === 'fog') return 'hudChrome.aiSpeech.sceneFogUnease';
  if (scene.light.tags.includes('starrySky')) return 'hudChrome.aiSpeech.sceneClearNightAwe';
  if (scene.danger.undeadPressure >= 0.25 || scene.environmentalTags.includes('deathPressure')) {
    return 'hudChrome.aiSpeech.sceneUndeadPressure';
  }
  if (scene.time.phase === 'day' && scene.danger.safeHavenScore >= 0.55) {
    return 'hudChrome.aiSpeech.sceneDayEnergy';
  }
  return 'hudChrome.aiSpeech.topicPlace';
}

function socialSequenceLine(input: {
  scene: ReturnType<typeof sceneFrameFor>;
  speaker: Entity;
  partner: Entity;
  player: Entity;
  lineId: string;
  step: number;
}): AiSpeechEvent {
  const planKind = input.step === 0
    ? 'conversationStart'
    : input.step === 1
      ? 'conversationReply'
      : 'conversationAside';
  return {
    type: 'aiSpeech',
    speakerId: input.speaker.id,
    speakerName: input.speaker.name,
    speech: {
      mode: 'lineId',
      lineId: input.lineId,
      values: {
        speakerName: input.speaker.name,
        playerName: input.partner.name,
        partnerName: input.partner.name,
        subsceneId: input.scene.subsceneId ?? input.scene.zoneId,
      },
    },
    source: 'local',
    reaction: {
      kind: 'inspect',
      targetEntityId: input.partner.id,
      score: 0.68,
      planKind,
      planIntensity: 0.45,
      sceneTags: sceneTagsWith(input.scene, `sequence:${planKind}`),
    },
    pid: input.player.id,
  };
}

interface CreatureSequenceGroup {
  family: MobFamily;
  reactions: FamilySceneReaction[];
}

function bestCreatureSequenceGroup(reactions: readonly FamilySceneReaction[]): CreatureSequenceGroup | null {
  const byFamily = new Map<MobFamily, FamilySceneReaction[]>();
  for (const reaction of reactions) {
    const bucket = byFamily.get(reaction.family);
    if (bucket) bucket.push(reaction);
    else byFamily.set(reaction.family, [reaction]);
  }
  return [...byFamily.entries()]
    .map(([family, familyReactions]) => ({
      family,
      reactions: familyReactions.slice(0, 3),
      score: familyReactions.slice(0, 3).reduce((sum, reaction) => sum + reaction.score, 0) / Math.min(3, familyReactions.length),
    }))
    .filter((group) => group.reactions.length >= 2)
    .sort((a, b) =>
      b.reactions.length - a.reactions.length
      || b.score - a.score
      || a.family.localeCompare(b.family),
    )[0] ?? null;
}

function creatureSequenceLine(input: {
  reaction: FamilySceneReaction;
  scene: ReturnType<typeof sceneFrameFor>;
  player: Entity;
  partner: Entity;
  step: number;
}): AiSpeechEvent {
  const event = familySceneReactionEvent(input.reaction, input.scene, input.player.id) as AiSpeechEvent;
  const planKind = creatureSequencePlanKind(input.reaction.family, input.step);
  if (event.speech.mode === 'lineId') {
    event.speech = {
      ...event.speech,
      values: {
        ...(event.speech.values ?? {}),
        partnerName: input.partner.name,
      },
    };
  }
  event.reaction = {
    kind: input.reaction.reaction,
    ...(event.reaction ?? {}),
    targetEntityId: input.partner.id,
    planKind,
    planIntensity: Math.max(0.35, Math.round(input.reaction.score * 100) / 100),
    sceneTags: [...new Set([
      `sequence:${planKind}`,
      `family:${input.reaction.family}`,
      ...(event.reaction?.sceneTags ?? []),
      ...sceneTagsWith(input.scene),
    ])].slice(0, 8),
  };
  return event;
}

function creatureSequencePlanKind(family: MobFamily, step: number): string {
  if (step === 0) {
    switch (family) {
      case 'beast': return 'packScentStart';
      case 'murloc': return 'murlocAlarmStart';
      case 'spider': return 'webStillnessStart';
      case 'kobold': return 'candleSquabbleStart';
      case 'humanoid': return 'campMutterStart';
      case 'undead': return 'deathEchoStart';
      case 'elemental': return 'resonanceStart';
      case 'dragonkin': return 'bloodlineWatchStart';
      case 'demon': return 'fearGameStart';
      case 'troll':
      case 'ogre':
        return 'bruteAppetiteStart';
    }
  }
  return step === 1 ? 'creatureSequenceReply' : 'creatureSequenceAside';
}

function sceneTagsWith(scene: ReturnType<typeof sceneFrameFor>, ...extra: string[]): string[] {
  return [...new Set([...scene.locationTags, ...scene.structureTags, ...scene.environmentalTags, ...extra])].slice(0, 8);
}

function activeMobActionIntentForRoutine(result: CreatureRoutineResult): AiActiveMobActionIntent | null {
  if (!result.routineKind.startsWith('creature:')) return null;
  if (result.entity.kind !== 'mob' || result.entity.ownerId !== null || !result.entity.hostile) return null;
  const family = MOBS[result.entity.templateId]?.family;
  if (!family) return null;
  const reaction = result.event.reaction;
  if (!reaction || reaction.kind === 'ignore') return null;
  const tags = new Set(reaction.sceneTags ?? []);
  if (tags.has('safeTown') || tags.has('town')) return null;
  if (reaction.kind === 'avoid') return 'flee';
  if (reaction.kind === 'approach') {
    return family === 'humanoid' || family === 'kobold' || family === 'murloc' || family === 'troll' || family === 'ogre' || family === 'demon'
      ? 'startCombat'
      : null;
  }
  if (reaction.kind === 'inspect') {
    return family === 'humanoid' || family === 'kobold' || family === 'murloc' || family === 'troll' || family === 'ogre'
      ? 'callForHelp'
      : null;
  }
  return null;
}

function activeOutputModeForRule(rule: AiActivePollRuleV1): AiJobContextV1['outputMode'] {
  switch (rule.outputMode) {
    case 'dynamicTextFirst': return 'dynamic_text_experiment';
    case 'mixedLivingWorld': return 'mixed_living_world';
    case 'lineIdOnly': return 'line_id_only';
  }
}

function normalizeActiveLocale(locale: string): string {
  const trimmed = locale.trim().replace(/-/g, '_');
  return /^[a-z]{2}(?:_[A-Z]{2})?$/.test(trimmed) ? trimmed : 'en';
}

function normalizeActiveProviderOutput(output: AiProviderOutput): AiProviderDecisionResult {
  if (isProviderDecisionResult(output)) return output;
  return { decision: output };
}

function isProviderDecisionResult(output: AiProviderOutput): output is AiProviderDecisionResult {
  return typeof output === 'object'
    && output !== null
    && 'decision' in output
    && typeof (output as { decision?: unknown }).decision === 'object';
}

function normalizeActiveRules(rules: readonly AiActivePollRuleV1[]): AiActivePollRuleV1[] {
  return rules
    .map((rule) => normalizeActiveRule(rule))
    .sort((a, b) => b.priority - a.priority || a.ruleId.localeCompare(b.ruleId));
}

function normalizeActiveRule(rule: AiActivePollRuleV1): AiActivePollRuleV1 {
  return {
    ...rule,
    enabled: Boolean(rule.enabled),
    periodSeconds: boundedInt(rule.periodSeconds, 1, 86_400),
    jitterSeconds: boundedInt(rule.jitterSeconds, 0, 3_600),
    priority: boundedInt(rule.priority, 0, 100),
    cooldown: {
      perPlayerSeconds: boundedInt(rule.cooldown.perPlayerSeconds, 0, 86_400),
      perEntitySeconds: boundedInt(rule.cooldown.perEntitySeconds, 0, 86_400),
      perRuleSeconds: boundedInt(rule.cooldown.perRuleSeconds, 0, 86_400),
    },
  };
}

function mergeActiveRuleConfig(rule: AiActivePollRuleV1, update: AiActivePollRuleConfigUpdate): AiActivePollRuleV1 {
  return normalizeActiveRule({
    ...rule,
    ...(update.enabled !== undefined ? { enabled: update.enabled } : {}),
    ...(update.periodSeconds !== undefined ? { periodSeconds: update.periodSeconds } : {}),
    ...(update.jitterSeconds !== undefined ? { jitterSeconds: update.jitterSeconds } : {}),
    ...(update.priority !== undefined ? { priority: update.priority } : {}),
    ...(update.providerPolicy !== undefined ? { providerPolicy: update.providerPolicy } : {}),
    ...(update.outputMode !== undefined ? { outputMode: update.outputMode } : {}),
    cooldown: {
      ...rule.cooldown,
      ...(update.cooldown?.perPlayerSeconds !== undefined ? { perPlayerSeconds: update.cooldown.perPlayerSeconds } : {}),
      ...(update.cooldown?.perEntitySeconds !== undefined ? { perEntitySeconds: update.cooldown.perEntitySeconds } : {}),
      ...(update.cooldown?.perRuleSeconds !== undefined ? { perRuleSeconds: update.cooldown.perRuleSeconds } : {}),
    },
  });
}

function parseActiveTriggerConfigUpdate(input: unknown): AiActiveTriggerConfigUpdate {
  const src = asRecord(input, 'active trigger config');
  const patch: AiActiveTriggerConfigUpdate = {};
  if (hasOwn(src, 'enabled')) patch.enabled = boolField(src.enabled, 'enabled');
  if (hasOwn(src, 'eventsEnabled')) patch.eventsEnabled = boolField(src.eventsEnabled, 'eventsEnabled');
  if (hasOwn(src, 'pollsEnabled')) patch.pollsEnabled = boolField(src.pollsEnabled, 'pollsEnabled');
  if (hasOwn(src, 'realActionsEnabled')) patch.realActionsEnabled = boolField(src.realActionsEnabled, 'realActionsEnabled');
  if (hasOwn(src, 'rules')) {
    if (!Array.isArray(src.rules)) throw new Error('rules must be an array');
    patch.rules = src.rules.map((rule) => parseActiveRuleUpdate(rule));
  }
  return patch;
}

function parseActiveRuleUpdate(input: unknown): AiActivePollRuleConfigUpdate {
  const src = asRecord(input, 'active trigger rule');
  const ruleId = stringField(src.ruleId, 'ruleId').slice(0, 96);
  const update: AiActivePollRuleConfigUpdate = { ruleId };
  if (hasOwn(src, 'enabled')) update.enabled = boolField(src.enabled, `${ruleId}.enabled`);
  if (hasOwn(src, 'periodSeconds')) update.periodSeconds = boundedInt(numberField(src.periodSeconds, `${ruleId}.periodSeconds`), 1, 86_400);
  if (hasOwn(src, 'jitterSeconds')) update.jitterSeconds = boundedInt(numberField(src.jitterSeconds, `${ruleId}.jitterSeconds`), 0, 3_600);
  if (hasOwn(src, 'priority')) update.priority = boundedInt(numberField(src.priority, `${ruleId}.priority`), 0, 100);
  if (hasOwn(src, 'providerPolicy')) update.providerPolicy = providerPolicyField(src.providerPolicy, `${ruleId}.providerPolicy`);
  if (hasOwn(src, 'outputMode')) update.outputMode = outputModeField(src.outputMode, `${ruleId}.outputMode`);
  if (hasOwn(src, 'cooldown')) {
    const cooldown = asRecord(src.cooldown, `${ruleId}.cooldown`);
    update.cooldown = {};
    if (hasOwn(cooldown, 'perPlayerSeconds')) update.cooldown.perPlayerSeconds = boundedInt(numberField(cooldown.perPlayerSeconds, `${ruleId}.cooldown.perPlayerSeconds`), 0, 86_400);
    if (hasOwn(cooldown, 'perEntitySeconds')) update.cooldown.perEntitySeconds = boundedInt(numberField(cooldown.perEntitySeconds, `${ruleId}.cooldown.perEntitySeconds`), 0, 86_400);
    if (hasOwn(cooldown, 'perRuleSeconds')) update.cooldown.perRuleSeconds = boundedInt(numberField(cooldown.perRuleSeconds, `${ruleId}.cooldown.perRuleSeconds`), 0, 86_400);
  }
  return update;
}

function hasOwn(src: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(src, key);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringField(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${label} must be a non-empty string`);
  return value.trim();
}

function boolField(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new Error(`${label} must be boolean`);
  return value;
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return value;
}

function boundedInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function providerPolicyField(value: unknown, label: string): AiActivePollRuleV1['providerPolicy'] {
  if (value === 'localOnly' || value === 'codexAllowed' || value === 'codexPreferred') return value;
  throw new Error(`${label} is not supported`);
}

function outputModeField(value: unknown, label: string): AiActivePollRuleV1['outputMode'] {
  if (value === 'lineIdOnly' || value === 'dynamicTextFirst' || value === 'mixedLivingWorld') return value;
  throw new Error(`${label} is not supported`);
}

function populationPolicyForOnline(onlineCount: number): AiActivePopulationPolicySnapshot {
  if (onlineCount <= 1) {
    return {
      band: 'solo',
      onlineCount,
      maxPollSessionsPerTick: Math.max(1, onlineCount),
      minRulePriority: 0,
      codexAdmission: 'aggressive',
    };
  }
  if (onlineCount <= 5) {
    return {
      band: 'small',
      onlineCount,
      maxPollSessionsPerTick: onlineCount,
      minRulePriority: 0,
      codexAdmission: 'aggressive',
    };
  }
  if (onlineCount <= 20) {
    return {
      band: 'busy',
      onlineCount,
      maxPollSessionsPerTick: Math.min(onlineCount, 6),
      minRulePriority: 25,
      codexAdmission: 'balanced',
    };
  }
  if (onlineCount <= 50) {
    return {
      band: 'crowded',
      onlineCount,
      maxPollSessionsPerTick: Math.min(onlineCount, 8),
      minRulePriority: 50,
      codexAdmission: 'scarce',
    };
  }
  return {
    band: 'protected',
    onlineCount,
    maxPollSessionsPerTick: Math.min(onlineCount, 4),
    minRulePriority: 80,
    codexAdmission: 'localOnly',
  };
}

function fallbackNpcAmbientEvent(
  context: AiJobContextV1,
  speaker: Entity,
  score: number,
): Extract<SimEvent, { type: 'aiSpeech' }> {
  const profile = profileFor('npc', speaker.templateId);
  const lineId = profile.fallbackLineId;
  return {
    type: 'aiSpeech',
    speakerId: speaker.id,
    speakerName: speaker.name,
    speech: {
      mode: 'lineId',
      lineId,
      values: {
        speakerName: speaker.name,
        playerName: context.player.name,
        subsceneId: context.scene?.subsceneId ?? context.scene?.zoneId ?? 'unknown',
      },
    },
    source: 'local',
    reaction: {
      kind: 'inspect',
      score: Math.round(score * 100) / 100,
      sceneTags: context.scene
        ? [...new Set([...context.scene.locationTags, ...context.scene.structureTags, ...context.scene.environmentalTags])].slice(0, 8)
        : [],
    },
    pid: context.player.entityId,
  };
}

function stableJitterMs(ruleId: string, scopeKey: string, fireCount: number, jitterSeconds: number): number {
  const bound = Math.max(0, Math.floor(jitterSeconds * 1000));
  if (bound === 0) return 0;
  const source = `${ruleId}:${scopeKey}:${fireCount}`;
  let hash = 2166136261;
  for (let i = 0; i < source.length; i++) {
    hash ^= source.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % (bound + 1);
}

function envPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

function envNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallback;
}

function envRatio(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? clamp01(value) : fallback;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
