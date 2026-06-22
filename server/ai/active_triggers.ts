import { NPCS } from '../../src/sim/data';
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

export interface AiActiveTriggerDiagnosticsSnapshot {
  enabled: boolean;
  eventsEnabled: boolean;
  pollsEnabled: boolean;
  rules: AiActivePollRuleV1[];
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

const DEFAULT_THINKING_DURATION_MS = 1600;
const CANDIDATE_RADIUS = 28;

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
  private readonly cursors = new Map<string, AiActivePollCursorState>();
  private readonly entityCooldownUntilMs = new Map<number, number>();
  private readonly playerCooldownUntilMs = new Map<number, number>();
  private readonly recentDecisions: AiActiveTriggerDecisionSnapshot[] = [];
  private readonly metrics: AiActiveTriggerMetricsSnapshot = {
    activePollDue: 0,
    activePollSkipped: 0,
    activePollFired: 0,
    activeEventQueued: 0,
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
  }

  noteSimEvents(input: { sim: Sim; events: readonly SimEvent[] }): void {
    if (!this.enabled) return;
    if (!this.eventsEnabled) {
      if (input.events.length > 0) this.recordSkip('', 'events_disabled');
      return;
    }
    for (const event of input.events) {
      if (event.type === 'questDone' || event.type === 'death' || event.type === 'damage') {
        this.metrics.activeEventQueued++;
      }
    }
  }

  tick(input: { sim: Sim; sessions: Iterable<AiActiveTriggerSessionLike>; nowMs: number }): SimEvent[] {
    if (!this.enabled) {
      this.recordSkip('', 'disabled');
      return [];
    }
    if (!this.pollsEnabled) {
      this.recordSkip('', 'polls_disabled');
      return [];
    }

    const sessions = [...input.sessions].filter((session) => !session.left);
    if (sessions.length === 0) {
      this.recordSkip('', 'no_online_players');
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
      cursors: [...this.cursors.values()].map((cursor) => ({ ...cursor })),
      recentDecisions: [...this.recentDecisions],
    };
  }

  stop(): void {
    this.cursors.clear();
    this.entityCooldownUntilMs.clear();
    this.playerCooldownUntilMs.clear();
    this.recentDecisions.splice(0);
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

    const candidate = this.bestNpcCandidate(input.sim, player, input.nowMs);
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

  private bestNpcCandidate(sim: Sim, player: Entity, nowMs: number): Candidate | null {
    const candidates: Candidate[] = [];
    for (const entity of sim.entities.values()) {
      if (entity.kind !== 'npc' || entity.dead) continue;
      const distance = dist2d(player.pos, entity.pos);
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
  ): AiJobContextV1 {
    const meta = sim.meta(player.id);
    const profile = profileFor('npc', speaker.templateId);
    return {
      schemaVersion: 1,
      jobId: `ai-active-${rule.ruleId}-${player.id}-${speaker.id}`,
      trigger: 'active_poll',
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

  private recordSkip(ruleId: string, reason: AiActiveSkipReason): void {
    this.metrics.activePollSkipped++;
    this.metrics.activeLastRuleId = ruleId;
    this.metrics.activeLastSkipReason = reason;
  }

  private pushDecision(decision: AiActiveTriggerDecisionSnapshot): void {
    this.recentDecisions.unshift(decision);
    if (this.recentDecisions.length > this.maxRecentDecisions) this.recentDecisions.length = this.maxRecentDecisions;
    this.metrics.activeLastRuleId = decision.ruleId;
    this.metrics.activeLastSkipReason = '';
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
