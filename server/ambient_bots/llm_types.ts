import type { PlayerClass } from '../../src/sim/types';
import type { AiProviderTimingSnapshot } from '../ai/ai_types';
import type {
  AmbientPartyCoordinationBehavior,
  AmbientPartyCoordinationIntentKind,
} from './party_intent';
import type { AmbientBotArchetype } from './types';

export type AmbientBotLlmSocialMode =
  | 'quiet'
  | 'brief'
  | 'friendly'
  | 'helpful';

export type AmbientBotLlmFriendPolicy =
  | 'never'
  | 'ifAsked'
  | 'afterWhisper';

export type AmbientBotLlmPresenceEmote =
  | 'none'
  | 'wave'
  | 'cheer';

export type AmbientBotLlmMemoryTag =
  | 'greeting'
  | 'thanks'
  | 'quest'
  | 'friend'
  | 'solo'
  | 'helpful';

export type AmbientBotPartyChatMode =
  | 'leader_brief'
  | 'member_ack';

export interface AmbientBotLlmBotRef {
  botId: string;
  characterName: string;
  profileId: string;
  classId: PlayerClass;
  archetype: AmbientBotArchetype;
}

export interface AmbientBotLlmContactSummary {
  name: string;
  sightings: number;
  whispersReceived: number;
  whispersSent: number;
}

export interface AmbientBotLlmNearbyPlayerSummary {
  name: string;
  distance: number;
}

export interface AmbientBotPlanContextV1 {
  schemaVersion: 1;
  jobId: string;
  botRef: AmbientBotLlmBotRef;
  progression: {
    level: number;
    zoneId: string;
    objectiveId: string;
    objectiveLabel: string;
  };
  social: {
    friendCount: number;
    blockCount: number;
    recentContacts: AmbientBotLlmContactSummary[];
  };
  nearbyPlayers: AmbientBotLlmNearbyPlayerSummary[];
  priorPlan?: {
    socialMode: AmbientBotLlmSocialMode;
    focusLabel: string;
    selfSummary: string;
    friendPolicy: AmbientBotLlmFriendPolicy;
    allowPresenceEmote: boolean;
  };
}

export interface AmbientBotPlanDecisionV1 {
  schemaVersion: 1;
  jobId: string;
  botRef: AmbientBotLlmBotRef;
  ttlMs: number;
  confidence: number;
  socialMode: AmbientBotLlmSocialMode;
  focusLabel: string;
  selfSummary: string;
  friendPolicy: AmbientBotLlmFriendPolicy;
  allowPresenceEmote: boolean;
  audit: {
    shortReason: string;
    safetyNotes: string[];
  };
}

export interface AmbientBotSocialContextV1 {
  schemaVersion: 1;
  jobId: string;
  botRef: AmbientBotLlmBotRef;
  progression: {
    level: number;
    zoneId: string;
    objectiveLabel: string;
  };
  plan: {
    socialMode: AmbientBotLlmSocialMode;
    focusLabel: string;
    selfSummary: string;
    friendPolicy: AmbientBotLlmFriendPolicy;
    allowPresenceEmote: boolean;
  } | null;
  whisper: {
    fromName: string;
    text: string;
    fallbackReplyText: string;
    askedForFriend: boolean;
  };
  contact: {
    friend: boolean;
    blocked: boolean;
    sightings: number;
    whispersReceived: number;
    whispersSent: number;
  };
  nearbyPlayers: AmbientBotLlmNearbyPlayerSummary[];
  constraints: {
    allowFriendAdd: boolean;
    allowPresenceEmote: boolean;
    maxReplyChars: number;
  };
}

export interface AmbientBotSocialDecisionV1 {
  schemaVersion: 1;
  jobId: string;
  botRef: AmbientBotLlmBotRef;
  targetName: string;
  ttlMs: number;
  confidence: number;
  replyText: string;
  friendAction: 'none' | 'send';
  presenceEmote: AmbientBotLlmPresenceEmote;
  memoryTags: AmbientBotLlmMemoryTag[];
  audit: {
    shortReason: string;
    usedPlayerInput: boolean;
    safetyNotes: string[];
  };
}

export interface AmbientBotPartyChatMemberSummary {
  name: string;
  classId: PlayerClass;
  combatRole: 'tank' | 'healer' | 'dps';
  dutyLabel: string;
  isLeader: boolean;
}

export interface AmbientBotPartyChatContextV1 {
  schemaVersion: 1;
  jobId: string;
  botRef: AmbientBotLlmBotRef;
  mode: AmbientBotPartyChatMode;
  progression: {
    level: number;
    zoneId: string;
    objectiveLabel: string;
    groupMode: string;
  };
  intent: {
    kind: AmbientPartyCoordinationIntentKind;
    behavior: AmbientPartyCoordinationBehavior;
    summary: string;
    targetName: string;
    holdAdvance: boolean;
    preferAssist: boolean;
  };
  party: {
    leaderName: string;
    tankName: string;
    healerName: string;
    focusCallerName: string;
    compositionSummary: string;
    leaderPromptText: string;
    fallbackText: string;
    members: AmbientBotPartyChatMemberSummary[];
  };
  selfRole: {
    combatRole: 'tank' | 'healer' | 'dps';
    dutyLabel: string;
  };
  constraints: {
    maxReplyChars: number;
  };
}

export interface AmbientBotPartyChatDecisionV1 {
  schemaVersion: 1;
  jobId: string;
  botRef: AmbientBotLlmBotRef;
  mode: AmbientBotPartyChatMode;
  ttlMs: number;
  confidence: number;
  lineText: string;
  audit: {
    shortReason: string;
    safetyNotes: string[];
  };
}

export interface AmbientBotLlmProviderResult {
  value: unknown;
  promptText: string;
  rawOutput: string;
  providerTimings?: AiProviderTimingSnapshot;
}

export interface AmbientBotLlmProvider {
  decide(input: {
    promptText: string;
    outputSchema: Record<string, unknown>;
  }): Promise<AmbientBotLlmProviderResult>;
  warmup?(): void;
  close?(): void;
}

export type AmbientBotLlmAuditStatus =
  | 'accepted'
  | 'cache_hit'
  | 'rejected'
  | 'error'
  | 'budget_denied'
  | 'disabled';

export interface AmbientBotLlmAuditSnapshot {
  kind: 'plan' | 'social' | 'party';
  status: AmbientBotLlmAuditStatus;
  jobId: string;
  atMs: number;
  latencyMs: number;
  reason: string;
  provider: string;
  promptText: string;
  rawOutput: string;
  promptChars: number;
  rawOutputChars: number;
  cacheHit: boolean;
  providerTimings?: AiProviderTimingSnapshot;
}
