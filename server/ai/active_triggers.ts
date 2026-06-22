import { ITEMS, MOBS, NPCS } from '../../src/sim/data';
import type { Sim } from '../../src/sim/sim';
import type { Entity, SimEvent } from '../../src/sim/types';
import { dist2d } from '../../src/sim/types';
import type { AiJobContextV1 } from './ai_types';
import { compactProfileSnapshot, profileFor } from './profiles';
import { sceneFrameFor } from './scene_frame';
import { sceneAwarenessEvent } from './scene_reactions';

export type AiActivePollCategory =
  | 'sceneAmbient'
  | 'time'
  | 'weather'
  | 'townLife'
  | 'livingRoutine';

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

export interface AiActiveTriggerDiagnosticsSnapshot {
  enabled: boolean;
  eventsEnabled: boolean;
  pollsEnabled: boolean;
  rules: AiActivePollRuleV1[];
  eventQueue: AiActiveQueuedEventSnapshot[];
  cursors: AiActivePollCursorSnapshot[];
  recentDecisions: AiActiveTriggerDecisionSnapshot[];
}

export interface AiActiveTriggerServiceOptions {
  enabled?: boolean;
  eventsEnabled?: boolean;
  pollsEnabled?: boolean;
  rules?: readonly AiActivePollRuleV1[];
  thinkingDurationMs?: number;
  maxRecentDecisions?: number;
  eventTtlMs?: number;
  maxQueuedEvents?: number;
}

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

interface AiActiveQueuedEventState {
  eventId: string;
  dedupeKey: string;
  kind: AiActiveQueuedEventKind;
  playerEntityId: number;
  anchorEntityId?: number;
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
    providerPolicy: 'localOnly',
    outputMode: 'lineIdOnly',
    cooldown: {
      perPlayerSeconds: 90,
      perEntitySeconds: 180,
      perRuleSeconds: 30,
    },
  },
];

export class AiActiveTriggerService {
  private readonly enabled: boolean;
  private readonly eventsEnabled: boolean;
  private readonly pollsEnabled: boolean;
  private readonly rules: AiActivePollRuleV1[];
  private readonly thinkingDurationMs: number;
  private readonly maxRecentDecisions: number;
  private readonly eventTtlMs: number;
  private readonly maxQueuedEvents: number;
  private readonly cursors = new Map<string, AiActivePollCursorState>();
  private readonly entityCooldownUntilMs = new Map<number, number>();
  private readonly playerCooldownUntilMs = new Map<number, number>();
  private readonly eventQueue: AiActiveQueuedEventState[] = [];
  private readonly recentDecisions: AiActiveTriggerDecisionSnapshot[] = [];
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
    activeLastSkipReason: '',
    activeLastRuleId: '',
  };

  constructor(options: AiActiveTriggerServiceOptions = {}) {
    this.enabled = options.enabled ?? process.env.AI_LIVING_WORLD_EXPERIMENT !== '0';
    this.eventsEnabled = options.eventsEnabled ?? process.env.AI_ACTIVE_EVENTS_ENABLED !== '0';
    this.pollsEnabled = options.pollsEnabled ?? process.env.AI_ACTIVE_POLLS_ENABLED !== '0';
    this.rules = [...(options.rules ?? DEFAULT_ACTIVE_POLL_RULES)]
      .filter((rule) => rule.enabled)
      .sort((a, b) => b.priority - a.priority || a.ruleId.localeCompare(b.ruleId));
    this.thinkingDurationMs = Math.max(0, Math.floor(options.thinkingDurationMs ?? DEFAULT_THINKING_DURATION_MS));
    this.maxRecentDecisions = Math.max(1, Math.floor(options.maxRecentDecisions ?? 40));
    this.eventTtlMs = Math.max(1_000, Math.floor(options.eventTtlMs ?? DEFAULT_EVENT_TTL_MS));
    this.maxQueuedEvents = Math.max(1, Math.floor(options.maxQueuedEvents ?? DEFAULT_MAX_QUEUED_EVENTS));
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
    if (!input.sim.entities.has(input.pid)) return;
    this.enqueueEvent({
      eventId: this.nextEventId('item'),
      dedupeKey: `item:${input.pid}:${input.itemId}`,
      kind: 'item_discarded',
      playerEntityId: input.pid,
      anchorEntityId: input.pid,
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

  tick(input: { sim: Sim; sessions: Iterable<AiActiveTriggerSessionLike>; nowMs: number }): SimEvent[] {
    if (!this.enabled) {
      this.recordSkip('', 'disabled');
      return [];
    }

    const sessions = [...input.sessions].filter((session) => !session.left);
    if (sessions.length === 0) {
      this.recordSkip('', 'no_online_players');
      return [];
    }

    const eventEvents = this.tryProcessQueuedEvents({ sim: input.sim, sessions, nowMs: input.nowMs });
    if (eventEvents.length > 0) return eventEvents;

    if (!this.pollsEnabled) {
      this.recordSkip('', 'polls_disabled');
      return [];
    }

    const events: SimEvent[] = [];
    for (const rule of this.rules) {
      for (const session of sessions) {
        const cursor = this.cursorFor(rule, session.pid, input.nowMs);
        if (input.nowMs < cursor.nextDueAtMs) continue;
        cursor.lastCheckedAtMs = input.nowMs;
        this.metrics.activePollDue++;
        const result = this.tryFireRule({ sim: input.sim, session, rule, nowMs: input.nowMs });
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
      rules: this.rules.map((rule) => ({ ...rule, cooldown: { ...rule.cooldown } })),
      eventQueue: this.eventQueue.map((event) => eventSnapshot(event)),
      cursors: [...this.cursors.values()].map((cursor) => ({ ...cursor })),
      recentDecisions: [...this.recentDecisions],
    };
  }

  stop(): void {
    this.cursors.clear();
    this.entityCooldownUntilMs.clear();
    this.playerCooldownUntilMs.clear();
    this.eventQueue.splice(0);
    this.recentDecisions.splice(0);
  }

  private tryProcessQueuedEvents(input: {
    sim: Sim;
    sessions: readonly AiActiveTriggerSessionLike[];
    nowMs: number;
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
  }): { events: SimEvent[]; skipReason: AiActiveSkipReason } {
    const player = input.sim.entities.get(input.session.pid);
    if (!player) return { events: [], skipReason: 'player_missing' };
    if (player.dead || player.inCombat) return { events: [], skipReason: 'player_busy_combat' };

    const anchor = input.queued.anchorEntityId !== undefined
      ? input.sim.entities.get(input.queued.anchorEntityId)?.pos ?? player.pos
      : player.pos;
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
    }, input.queued);
    const localEvent = eventAwarenessEvent(context, candidate.entity, input.queued)
      ?? sceneAwarenessEvent(context, candidate.entity)
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
    return { events: [thinkingEvent, localEvent], skipReason: 'not_due' };
  }

  private tryFireRule(input: {
    sim: Sim;
    session: AiActiveTriggerSessionLike;
    rule: AiActivePollRuleV1;
    nowMs: number;
  }): { events: SimEvent[]; skipReason: AiActiveSkipReason } {
    const player = input.sim.entities.get(input.session.pid);
    if (!player) return { events: [], skipReason: 'player_missing' };
    if (player.dead || player.inCombat) return { events: [], skipReason: 'player_busy_combat' };
    if ((this.playerCooldownUntilMs.get(player.id) ?? 0) > input.nowMs) {
      this.metrics.activeNoiseSuppressions++;
      return { events: [], skipReason: 'player_recent_ai_speech' };
    }

    const candidate = this.bestNpcCandidate(input.sim, player.pos, input.nowMs);
    if (!candidate) return { events: [], skipReason: 'no_candidate' };
    if ((this.entityCooldownUntilMs.get(candidate.entity.id) ?? 0) > input.nowMs) {
      return { events: [], skipReason: 'entity_cooldown' };
    }

    const scene = sceneFrameFor(input.sim, player.pos, { excludeEntityIds: [player.id] });
    const context = this.contextFor(input.sim, player, candidate.entity, scene, input.rule);
    const localEvent = sceneAwarenessEvent(context, candidate.entity) ?? fallbackNpcAmbientEvent(context, candidate.entity, candidate.score);
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

    this.metrics.activePollFired++;
    this.metrics.activeCandidatesSelected++;
    this.metrics.activeLocalReactions++;
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
    return { events: [thinkingEvent, localEvent], skipReason: 'not_due' };
  }

  private bestNpcCandidate(sim: Sim, origin: Entity['pos'], nowMs: number): Candidate | null {
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
    candidates.sort((a, b) => b.score - a.score || a.distance - b.distance || a.entity.id - b.entity.id);
    return candidates[0] ?? null;
  }

  private contextFor(
    sim: Sim,
    player: Entity,
    speaker: Entity,
    scene: ReturnType<typeof sceneFrameFor>,
    rule: AiActivePollRuleV1,
    queuedEvent?: AiActiveQueuedEventState,
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
      locale: 'en',
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
      outputMode: 'line_id_only',
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
