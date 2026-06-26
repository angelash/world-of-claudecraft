import { performance } from 'node:perf_hooks';
import { ambientBotProfileById } from './profiles';
import {
  AMBIENT_BOT_PLAN_OUTPUT_SCHEMA,
  AMBIENT_BOT_SOCIAL_OUTPUT_SCHEMA,
  buildAmbientBotPlanPrompt,
  buildAmbientBotSocialPrompt,
} from './llm_prompt';
import type {
  AmbientBotLlmAuditSnapshot,
  AmbientBotLlmContactSummary,
  AmbientBotLlmProvider,
  AmbientBotPlanContextV1,
  AmbientBotPlanDecisionV1,
  AmbientBotSocialContextV1,
  AmbientBotSocialDecisionV1,
} from './llm_types';
import { validateAmbientBotPlanDecision, validateAmbientBotSocialDecision } from './llm_validate';
import type { AmbientPlayerBotRecord } from './types';
import type { AmbientPlayerBotPendingReply } from './social';
import type { AmbientPlayerBotLiveState } from './ws_client';

const PLAN_PROMPT_MAX_CHARS = 1_200;
const SOCIAL_PROMPT_MAX_CHARS = 1_200;
const RAW_OUTPUT_MAX_CHARS = 1_200;

export interface AmbientPlayerBotLlmConfig {
  enabled: boolean;
  planCooldownMs: number;
  socialCooldownMs: number;
  maxCalls5h: number;
  maxCallsWeek: number;
  cacheMaxEntries: number;
  cacheMaxTtlMs: number;
}

export type AmbientPlayerBotLlmDecisionStatus =
  | 'accepted'
  | 'cache_hit'
  | 'rejected'
  | 'error'
  | 'budget_denied'
  | 'disabled';

export interface AmbientPlayerBotLlmPlanResult {
  status: AmbientPlayerBotLlmDecisionStatus;
  decision?: AmbientBotPlanDecisionV1;
  audit: AmbientBotLlmAuditSnapshot;
}

export interface AmbientPlayerBotLlmSocialResult {
  status: AmbientPlayerBotLlmDecisionStatus;
  decision?: AmbientBotSocialDecisionV1;
  audit: AmbientBotLlmAuditSnapshot;
}

interface CacheEntry<T> {
  decision: T;
  expiresAtMs: number;
}

export class AmbientPlayerBotLlmCoordinator {
  private readonly config: AmbientPlayerBotLlmConfig;
  private readonly provider: AmbientBotLlmProvider | null;
  private readonly recentCalls5hMs: number[] = [];
  private readonly recentCallsWeekMs: number[] = [];
  private readonly planCache = new Map<string, CacheEntry<AmbientBotPlanDecisionV1>>();
  private readonly socialCache = new Map<string, CacheEntry<AmbientBotSocialDecisionV1>>();

  constructor(input: {
    config: AmbientPlayerBotLlmConfig;
    provider: AmbientBotLlmProvider | null;
  }) {
    this.config = input.config;
    this.provider = input.provider;
  }

  warmup(): void {
    this.provider?.warmup?.();
  }

  close(): void {
    this.provider?.close?.();
  }

  async decidePlan(input: {
    bot: AmbientPlayerBotRecord;
    liveState: AmbientPlayerBotLiveState;
    objectiveId: string;
    objectiveLabel: string;
    priorPlan: AmbientBotPlanDecisionV1 | null;
    nowMs: number;
  }): Promise<AmbientPlayerBotLlmPlanResult> {
    const context = buildPlanContext(input);
    const promptText = buildAmbientBotPlanPrompt(context);
    const cacheKey = planCacheKey(context);
    return this.executePlan(context, promptText, cacheKey, input.nowMs);
  }

  async decideSocial(input: {
    bot: AmbientPlayerBotRecord;
    liveState: AmbientPlayerBotLiveState;
    pendingReply: AmbientPlayerBotPendingReply;
    plan: AmbientBotPlanDecisionV1 | null;
    nowMs: number;
  }): Promise<AmbientPlayerBotLlmSocialResult> {
    const context = buildSocialContext(input);
    const promptText = buildAmbientBotSocialPrompt(context);
    const cacheKey = socialCacheKey(context);
    return this.executeSocial(context, promptText, cacheKey, input.nowMs);
  }

  private async executePlan(
    context: AmbientBotPlanContextV1,
    promptText: string,
    cacheKey: string,
    nowMs: number,
  ): Promise<AmbientPlayerBotLlmPlanResult> {
    const cached = this.lookupCache(this.planCache, cacheKey, nowMs);
    if (cached) {
      const decision = clonePlanDecisionForJob(cached, context.jobId);
      return {
        status: 'cache_hit',
        decision,
        audit: auditSnapshot({
          kind: 'plan',
          status: 'cache_hit',
          jobId: context.jobId,
          nowMs,
          latencyMs: 0,
          reason: 'cache hit',
          provider: 'cache',
          promptText,
          rawOutput: JSON.stringify(decision),
          cacheHit: true,
        }),
      };
    }
    if (!this.config.enabled || !this.provider) {
      return {
        status: 'disabled',
        audit: auditSnapshot({
          kind: 'plan',
          status: 'disabled',
          jobId: context.jobId,
          nowMs,
          latencyMs: 0,
          reason: 'ambient bot llm disabled',
          provider: 'disabled',
          promptText,
          rawOutput: '',
          cacheHit: false,
        }),
      };
    }
    if (!this.consumeBudget(nowMs)) {
      return {
        status: 'budget_denied',
        audit: auditSnapshot({
          kind: 'plan',
          status: 'budget_denied',
          jobId: context.jobId,
          nowMs,
          latencyMs: 0,
          reason: 'ambient bot llm budget denied',
          provider: 'budget',
          promptText,
          rawOutput: '',
          cacheHit: false,
        }),
      };
    }

    const startedAt = performance.now();
    try {
      const providerResult = await this.provider.decide({
        promptText,
        outputSchema: AMBIENT_BOT_PLAN_OUTPUT_SCHEMA,
      });
      const decision = validateAmbientBotPlanDecision(providerResult.value, context);
      const latencyMs = performance.now() - startedAt;
      this.storeCache(this.planCache, cacheKey, decision, nowMs, decision.ttlMs);
      return {
        status: 'accepted',
        decision,
        audit: auditSnapshot({
          kind: 'plan',
          status: 'accepted',
          jobId: context.jobId,
          nowMs,
          latencyMs,
          reason: decision.audit.shortReason,
          provider: providerResult.providerTimings?.provider ?? 'ambient-bot-codex-exec',
          promptText: providerResult.promptText,
          rawOutput: providerResult.rawOutput,
          cacheHit: false,
          providerTimings: providerResult.providerTimings,
        }),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const status = /must be|mismatch|invalid|cannot|too long|disclosure/i.test(reason)
        ? 'rejected'
        : 'error';
      return {
        status,
        audit: auditSnapshot({
          kind: 'plan',
          status,
          jobId: context.jobId,
          nowMs,
          latencyMs: performance.now() - startedAt,
          reason,
          provider: 'ambient-bot-codex-exec',
          promptText,
          rawOutput: '',
          cacheHit: false,
        }),
      };
    }
  }

  private async executeSocial(
    context: AmbientBotSocialContextV1,
    promptText: string,
    cacheKey: string,
    nowMs: number,
  ): Promise<AmbientPlayerBotLlmSocialResult> {
    const cached = this.lookupCache(this.socialCache, cacheKey, nowMs);
    if (cached) {
      const decision = cloneSocialDecisionForJob(cached, context.jobId);
      return {
        status: 'cache_hit',
        decision,
        audit: auditSnapshot({
          kind: 'social',
          status: 'cache_hit',
          jobId: context.jobId,
          nowMs,
          latencyMs: 0,
          reason: 'cache hit',
          provider: 'cache',
          promptText,
          rawOutput: JSON.stringify(decision),
          cacheHit: true,
        }),
      };
    }
    if (!this.config.enabled || !this.provider) {
      return {
        status: 'disabled',
        audit: auditSnapshot({
          kind: 'social',
          status: 'disabled',
          jobId: context.jobId,
          nowMs,
          latencyMs: 0,
          reason: 'ambient bot llm disabled',
          provider: 'disabled',
          promptText,
          rawOutput: '',
          cacheHit: false,
        }),
      };
    }
    if (!this.consumeBudget(nowMs)) {
      return {
        status: 'budget_denied',
        audit: auditSnapshot({
          kind: 'social',
          status: 'budget_denied',
          jobId: context.jobId,
          nowMs,
          latencyMs: 0,
          reason: 'ambient bot llm budget denied',
          provider: 'budget',
          promptText,
          rawOutput: '',
          cacheHit: false,
        }),
      };
    }

    const startedAt = performance.now();
    try {
      const providerResult = await this.provider.decide({
        promptText,
        outputSchema: AMBIENT_BOT_SOCIAL_OUTPUT_SCHEMA,
      });
      const decision = validateAmbientBotSocialDecision(providerResult.value, context);
      const latencyMs = performance.now() - startedAt;
      this.storeCache(this.socialCache, cacheKey, decision, nowMs, decision.ttlMs);
      return {
        status: 'accepted',
        decision,
        audit: auditSnapshot({
          kind: 'social',
          status: 'accepted',
          jobId: context.jobId,
          nowMs,
          latencyMs,
          reason: decision.audit.shortReason,
          provider: providerResult.providerTimings?.provider ?? 'ambient-bot-codex-exec',
          promptText: providerResult.promptText,
          rawOutput: providerResult.rawOutput,
          cacheHit: false,
          providerTimings: providerResult.providerTimings,
        }),
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      const status = /must be|mismatch|invalid|cannot|too long|disclosure/i.test(reason)
        ? 'rejected'
        : 'error';
      return {
        status,
        audit: auditSnapshot({
          kind: 'social',
          status,
          jobId: context.jobId,
          nowMs,
          latencyMs: performance.now() - startedAt,
          reason,
          provider: 'ambient-bot-codex-exec',
          promptText,
          rawOutput: '',
          cacheHit: false,
        }),
      };
    }
  }

  private consumeBudget(nowMs: number): boolean {
    pruneTimes(this.recentCalls5hMs, nowMs, 5 * 60 * 60 * 1000);
    pruneTimes(this.recentCallsWeekMs, nowMs, 7 * 24 * 60 * 60 * 1000);
    if (this.recentCalls5hMs.length >= this.config.maxCalls5h) return false;
    if (this.recentCallsWeekMs.length >= this.config.maxCallsWeek) return false;
    this.recentCalls5hMs.push(nowMs);
    this.recentCallsWeekMs.push(nowMs);
    return true;
  }

  private lookupCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    nowMs: number,
  ): T | null {
    this.pruneCache(cache, nowMs);
    const entry = cache.get(key);
    if (!entry || entry.expiresAtMs <= nowMs) return null;
    return entry.decision;
  }

  private storeCache<T>(
    cache: Map<string, CacheEntry<T>>,
    key: string,
    decision: T,
    nowMs: number,
    ttlMs: number,
  ): void {
    const clampedTtlMs = Math.max(1_000, Math.min(this.config.cacheMaxTtlMs, ttlMs));
    cache.set(key, { decision, expiresAtMs: nowMs + clampedTtlMs });
    while (cache.size > this.config.cacheMaxEntries) {
      const oldest = cache.keys().next().value;
      if (typeof oldest !== 'string') break;
      cache.delete(oldest);
    }
  }

  private pruneCache<T>(cache: Map<string, CacheEntry<T>>, nowMs: number): void {
    for (const [key, entry] of cache) {
      if (entry.expiresAtMs <= nowMs) cache.delete(key);
    }
  }
}

export function ambientPlayerBotLlmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AmbientPlayerBotLlmConfig {
  return {
    enabled: env.AMBIENT_PLAYER_BOTS_LLM_ENABLED === '1',
    planCooldownMs: intEnv(env, 'AMBIENT_PLAYER_BOTS_LLM_PLAN_COOLDOWN_MS', 240_000, 30_000),
    socialCooldownMs: intEnv(env, 'AMBIENT_PLAYER_BOTS_LLM_SOCIAL_COOLDOWN_MS', 45_000, 5_000),
    maxCalls5h: intEnv(env, 'AMBIENT_PLAYER_BOTS_LLM_MAX_CALLS_5H', 300, 1),
    maxCallsWeek: intEnv(env, 'AMBIENT_PLAYER_BOTS_LLM_MAX_CALLS_WEEK', 2_500, 1),
    cacheMaxEntries: intEnv(env, 'AMBIENT_PLAYER_BOTS_LLM_CACHE_MAX_ENTRIES', 256, 1),
    cacheMaxTtlMs: intEnv(env, 'AMBIENT_PLAYER_BOTS_LLM_CACHE_MAX_TTL_MS', 15 * 60 * 1000, 1_000),
  };
}

function buildPlanContext(input: {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  objectiveId: string;
  objectiveLabel: string;
  priorPlan: AmbientBotPlanDecisionV1 | null;
  nowMs: number;
}): AmbientBotPlanContextV1 {
  const profile = ambientBotProfileById(input.bot.profileId);
  return {
    schemaVersion: 1,
    jobId: `ambient-plan:${input.bot.botId}:${input.nowMs}`,
    botRef: {
      botId: input.bot.botId,
      characterName: input.bot.characterName,
      profileId: input.bot.profileId,
      classId: input.bot.class,
      archetype: profile?.archetype ?? 'quester',
    },
    progression: {
      level: input.bot.lastKnownLevel,
      zoneId: input.bot.lastKnownZoneId,
      objectiveId: input.objectiveId,
      objectiveLabel: input.objectiveLabel,
    },
    social: {
      friendCount: arrayLength(input.liveState.social?.friends),
      blockCount: arrayLength(input.liveState.social?.blocks),
      recentContacts: contactSummaries(input.bot.socialState),
    },
    nearbyPlayers: nearbyPlayers(input.liveState),
    ...(input.priorPlan
      ? {
        priorPlan: {
          socialMode: input.priorPlan.socialMode,
          focusLabel: input.priorPlan.focusLabel,
          selfSummary: input.priorPlan.selfSummary,
          friendPolicy: input.priorPlan.friendPolicy,
          allowPresenceEmote: input.priorPlan.allowPresenceEmote,
        },
      }
      : {}),
  };
}

function buildSocialContext(input: {
  bot: AmbientPlayerBotRecord;
  liveState: AmbientPlayerBotLiveState;
  pendingReply: AmbientPlayerBotPendingReply;
  plan: AmbientBotPlanDecisionV1 | null;
  nowMs: number;
}): AmbientBotSocialContextV1 {
  const profile = ambientBotProfileById(input.bot.profileId);
  const friendNames = new Set(input.liveState.social?.friends.map((friend) => friend.name) ?? []);
  const blockNames = new Set(input.liveState.social?.blocks.map((block) => block.name) ?? []);
  const contact = contactSummaryByName(input.bot.socialState, input.pendingReply.toName);
  const plan = input.plan;
  const allowFriendAdd = !friendNames.has(input.pendingReply.toName)
    && !blockNames.has(input.pendingReply.toName)
    && (plan?.friendPolicy ?? 'afterWhisper') !== 'never';
  const allowPresenceEmote = plan?.allowPresenceEmote ?? true;

  return {
    schemaVersion: 1,
    jobId: `ambient-social:${input.bot.botId}:${input.pendingReply.toName}:${input.pendingReply.revision}:${input.nowMs}`,
    botRef: {
      botId: input.bot.botId,
      characterName: input.bot.characterName,
      profileId: input.bot.profileId,
      classId: input.bot.class,
      archetype: profile?.archetype ?? 'quester',
    },
    progression: {
      level: input.bot.lastKnownLevel,
      zoneId: input.bot.lastKnownZoneId,
      objectiveLabel: typeof input.bot.runnerState.objectiveLabel === 'string'
        ? input.bot.runnerState.objectiveLabel
        : '',
    },
    plan: plan
      ? {
        socialMode: plan.socialMode,
        focusLabel: plan.focusLabel,
        selfSummary: plan.selfSummary,
        friendPolicy: plan.friendPolicy,
        allowPresenceEmote: plan.allowPresenceEmote,
      }
      : null,
    whisper: {
      fromName: input.pendingReply.toName,
      text: input.pendingReply.incomingText,
      fallbackReplyText: input.pendingReply.fallbackText,
      askedForFriend: input.pendingReply.askedForFriend,
    },
    contact: {
      friend: friendNames.has(input.pendingReply.toName),
      blocked: blockNames.has(input.pendingReply.toName),
      sightings: contact?.sightings ?? 0,
      whispersReceived: contact?.whispersReceived ?? 0,
      whispersSent: contact?.whispersSent ?? 0,
    },
    nearbyPlayers: nearbyPlayers(input.liveState),
    constraints: {
      allowFriendAdd,
      allowPresenceEmote,
      maxReplyChars: 120,
    },
  };
}

function contactSummaries(socialState: Record<string, unknown>): AmbientBotLlmContactSummary[] {
  const contacts = contactMap(socialState);
  return Object.entries(contacts)
    .map(([name, value]) => ({
      name,
      sightings: readNonNegativeInt(value.sightingCount),
      whispersReceived: readNonNegativeInt(value.whispersReceived),
      whispersSent: readNonNegativeInt(value.whispersSent),
    }))
    .sort((a, b) =>
      b.whispersReceived - a.whispersReceived
      || b.sightings - a.sightings
      || a.name.localeCompare(b.name),
    )
    .slice(0, 4);
}

function contactSummaryByName(
  socialState: Record<string, unknown>,
  name: string,
): AmbientBotLlmContactSummary | null {
  const contacts = contactMap(socialState);
  const value = contacts[name];
  if (!value || typeof value !== 'object') return null;
  return {
    name,
    sightings: readNonNegativeInt((value as Record<string, unknown>).sightingCount),
    whispersReceived: readNonNegativeInt((value as Record<string, unknown>).whispersReceived),
    whispersSent: readNonNegativeInt((value as Record<string, unknown>).whispersSent),
  };
}

function contactMap(socialState: Record<string, unknown>): Record<string, Record<string, unknown>> {
  const raw = socialState.contacts;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => value && typeof value === 'object' && !Array.isArray(value))
      .map(([key, value]) => [key, value as Record<string, unknown>]),
  );
}

function nearbyPlayers(liveState: AmbientPlayerBotLiveState) {
  const self = liveState.self;
  if (!self) return [];
  return [...liveState.entities.values()]
    .filter((entity) => entity.k === 'player' && entity.id !== self.id && typeof entity.nm === 'string')
    .map((entity) => ({
      name: String(entity.nm),
      distance: Math.round(distance(self.x, self.z, readNumber(entity.x), readNumber(entity.z)) * 10) / 10,
    }))
    .filter((entry) => Number.isFinite(entry.distance))
    .sort((a, b) => a.distance - b.distance || a.name.localeCompare(b.name))
    .slice(0, 4);
}

function auditSnapshot(input: {
  kind: 'plan' | 'social';
  status: AmbientBotLlmAuditSnapshot['status'];
  jobId: string;
  nowMs: number;
  latencyMs: number;
  reason: string;
  provider: string;
  promptText: string;
  rawOutput: string;
  cacheHit: boolean;
  providerTimings?: AmbientBotLlmAuditSnapshot['providerTimings'];
}): AmbientBotLlmAuditSnapshot {
  const prompt = truncateText(
    input.promptText,
    input.kind === 'plan' ? PLAN_PROMPT_MAX_CHARS : SOCIAL_PROMPT_MAX_CHARS,
  );
  const rawOutput = truncateText(input.rawOutput, RAW_OUTPUT_MAX_CHARS);
  return {
    kind: input.kind,
    status: input.status,
    jobId: input.jobId,
    atMs: input.nowMs,
    latencyMs: Math.max(0, Math.round(input.latencyMs)),
    reason: input.reason.slice(0, 240),
    provider: input.provider,
    promptText: prompt,
    rawOutput,
    promptChars: input.promptText.length,
    rawOutputChars: input.rawOutput.length,
    cacheHit: input.cacheHit,
    ...(input.providerTimings ? { providerTimings: input.providerTimings } : {}),
  };
}

function clonePlanDecision(value: AmbientBotPlanDecisionV1): AmbientBotPlanDecisionV1 {
  return {
    ...value,
    botRef: { ...value.botRef },
    audit: {
      shortReason: value.audit.shortReason,
      safetyNotes: [...value.audit.safetyNotes],
    },
  };
}

function clonePlanDecisionForJob(
  value: AmbientBotPlanDecisionV1,
  jobId: string,
): AmbientBotPlanDecisionV1 {
  return {
    ...clonePlanDecision(value),
    jobId,
  };
}

function cloneSocialDecision(value: AmbientBotSocialDecisionV1): AmbientBotSocialDecisionV1 {
  return {
    ...value,
    botRef: { ...value.botRef },
    memoryTags: [...value.memoryTags],
    audit: {
      shortReason: value.audit.shortReason,
      usedPlayerInput: value.audit.usedPlayerInput,
      safetyNotes: [...value.audit.safetyNotes],
    },
  };
}

function cloneSocialDecisionForJob(
  value: AmbientBotSocialDecisionV1,
  jobId: string,
): AmbientBotSocialDecisionV1 {
  return {
    ...cloneSocialDecision(value),
    jobId,
  };
}

function planCacheKey(context: AmbientBotPlanContextV1): string {
  return `plan|${JSON.stringify({
    ...context,
    jobId: '',
  })}`;
}

function socialCacheKey(context: AmbientBotSocialContextV1): string {
  return `social|${JSON.stringify({
    ...context,
    jobId: '',
  })}`;
}

function pruneTimes(values: number[], nowMs: number, windowMs: number): void {
  while (values.length > 0 && values[0] <= nowMs - windowMs) {
    values.shift();
  }
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return value.slice(0, maxLength);
}

function intEnv(
  env: NodeJS.ProcessEnv,
  key: string,
  fallback: number,
  min: number,
): number {
  const raw = Number(env[key] ?? fallback);
  if (!Number.isFinite(raw)) return fallback;
  return Math.max(min, Math.floor(raw));
}

function arrayLength<T>(value: readonly T[] | null | undefined): number {
  return Array.isArray(value) ? value.length : 0;
}

function readNonNegativeInt(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : Number.NaN;
}

function distance(ax: number, az: number, bx: number, bz: number): number {
  const dx = ax - bx;
  const dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}
