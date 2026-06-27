import type { AmbientPlayerBotPendingReply } from '../ambient_bots/social';
import type {
  AmbientPlayerBotLlmConfig,
  AmbientPlayerBotLlmDecisionStatus,
} from '../ambient_bots/types';
import type { AmbientBotPlanDecisionV1 } from '../ambient_bots/llm_types';

export interface HostedPlayLlmState {
  readonly enabled: boolean;
  plan: AmbientBotPlanDecisionV1 | null;
  planPending: boolean;
  planRequestedAtMs: number | null;
  lastPlanObjectiveKey: string | null;
  lastSocialAtByName: Record<string, number>;
  planStatus: AmbientPlayerBotLlmDecisionStatus | '';
  planReason: string;
  planProvider: string;
  planFocus: string;
  socialStatus: AmbientPlayerBotLlmDecisionStatus | '';
  socialReason: string;
  socialTarget: string;
  socialProvider: string;
}

export function createHostedPlayLlmState(
  config: AmbientPlayerBotLlmConfig | null | undefined,
): HostedPlayLlmState {
  return {
    enabled: config?.enabled === true,
    plan: null,
    planPending: false,
    planRequestedAtMs: null,
    lastPlanObjectiveKey: null,
    lastSocialAtByName: {},
    planStatus: '',
    planReason: '',
    planProvider: '',
    planFocus: '',
    socialStatus: '',
    socialReason: '',
    socialTarget: '',
    socialProvider: '',
  };
}

export function hostedPlayLlmConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AmbientPlayerBotLlmConfig {
  return {
    enabled: env.HOSTED_PLAY_LLM_ENABLED === '1',
    planCooldownMs: intEnv(env, 'HOSTED_PLAY_LLM_PLAN_COOLDOWN_MS', 240_000, 30_000),
    socialCooldownMs: intEnv(env, 'HOSTED_PLAY_LLM_SOCIAL_COOLDOWN_MS', 45_000, 5_000),
    maxCalls5h: intEnv(env, 'HOSTED_PLAY_LLM_MAX_CALLS_5H', 300, 1),
    maxCallsWeek: intEnv(env, 'HOSTED_PLAY_LLM_MAX_CALLS_WEEK', 2_500, 1),
    cacheMaxEntries: intEnv(env, 'HOSTED_PLAY_LLM_CACHE_MAX_ENTRIES', 256, 1),
    cacheMaxTtlMs: intEnv(env, 'HOSTED_PLAY_LLM_CACHE_MAX_TTL_MS', 15 * 60 * 1000, 1_000),
  };
}

export function cloneHostedPlayPlan(value: AmbientBotPlanDecisionV1): AmbientBotPlanDecisionV1 {
  return {
    ...value,
    botRef: { ...value.botRef },
    audit: {
      shortReason: value.audit.shortReason,
      safetyNotes: [...value.audit.safetyNotes],
    },
  };
}

export function cloneHostedPlayPendingReply(
  value: AmbientPlayerBotPendingReply,
): AmbientPlayerBotPendingReply {
  return {
    ...value,
    ...(value.llmMemoryTags ? { llmMemoryTags: [...value.llmMemoryTags] } : {}),
  };
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
