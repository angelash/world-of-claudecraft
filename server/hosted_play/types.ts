import type { PlayerClass } from '../../src/sim/types';
import type { AmbientPlayerBotLlmDecisionStatus } from '../ambient_bots/types';

export type HostedPlayMode =
  | 'offline'
  | 'disabled'
  | 'active'
  | 'paused';

export type HostedPlayPartyMode =
  | 'solo'
  | 'follow_leader';

export type HostedPlayGroupMode =
  | ''
  | 'accept_invite'
  | 'assist_party'
  | 'brain'
  | 'follow_leader'
  | 'hold_regroup'
  | 'invite_nearby'
  | 'prepare_party';

export type HostedPlayPauseReason =
  | ''
  | 'runtime_error';

export interface HostedPlayPreferences {
  resumeOnLogin: boolean;
  partyMode: HostedPlayPartyMode;
  actionLogEnabled: boolean;
  autoInviteNearbyPlayers: boolean;
}

export interface HostedPlaySessionInfo {
  characterId: number;
  characterName: string;
  playerClass: PlayerClass;
}

export interface HostedPlayDebugPoint {
  x: number;
  z: number;
}

export interface HostedPlayDebugTravelGoal {
  target: HostedPlayDebugPoint;
  arrivalRange: number;
  goalKey: string;
}

export interface HostedPlayDebugCommand {
  summary: string;
  payloadJson: string;
}

export interface HostedPlayDebugCommandAge {
  key: string;
  atMs: number;
  ageMs: number;
}

export interface HostedPlayDebugBrainState {
  objectiveSinceMs: number | null;
  lastProgressAtMs: number | null;
  pathGoalKey: string;
  pathLength: number;
  nextPathPoint: HostedPlayDebugPoint | null;
  campIndex: number;
  noTargetSinceMs: number | null;
  stuckResets: number;
  lastCommandAtMs: HostedPlayDebugCommandAge[];
}

export interface HostedPlayDebugParty {
  groupMode: HostedPlayGroupMode;
  groupLeaderName: string;
  groupLeaderDistance: number;
  brainDrivePaused: boolean;
}

export interface HostedPlayDebugPendingReply {
  toName: string;
  incomingText: string;
  fallbackText: string;
  dueInMs: number;
  askedForFriend: boolean;
  revision: number;
  llmStatus: string;
  llmReplyText: string;
  llmFriendAction: string;
  llmPresenceEmote: string;
  llmRequestedAgoMs: number | null;
}

export interface HostedPlayDebugSocial {
  pendingReplies: HostedPlayDebugPendingReply[];
}

export interface HostedPlayDebugLlm {
  enabled: boolean;
  planPending: boolean;
  planStatus: AmbientPlayerBotLlmDecisionStatus | '';
  planReason: string;
  planProvider: string;
  planLatencyMs: number | null;
  planPrompt: string;
  planRawOutput: string;
  planPromptChars: number;
  planRawOutputChars: number;
  planCacheHit: boolean;
  planMode: string;
  planFocus: string;
  socialStatus: AmbientPlayerBotLlmDecisionStatus | '';
  socialReason: string;
  socialTarget: string;
  socialProvider: string;
  socialLatencyMs: number | null;
  socialPrompt: string;
  socialRawOutput: string;
  socialPromptChars: number;
  socialRawOutputChars: number;
  socialCacheHit: boolean;
}

export interface HostedPlayDebugSnapshot {
  lastBrainAtMs: number | null;
  lastBrainAgeMs: number | null;
  lastAutomationAtMs: number | null;
  lastAutomationAgeMs: number | null;
  brainDrivePaused: boolean;
  objectiveId: string;
  objectiveLabel: string;
  objectiveQuestId: string;
  objectiveDungeonId: string;
  objectiveSuggestedPartySize: number;
  moveInput: Record<string, unknown>;
  facing: number | null;
  commands: HostedPlayDebugCommand[];
  travelGoal: HostedPlayDebugTravelGoal | null;
  brainState: HostedPlayDebugBrainState;
  party: HostedPlayDebugParty;
  social: HostedPlayDebugSocial;
  llm: HostedPlayDebugLlm;
  lastError: string;
}

export interface HostedPlayStatusSnapshot {
  characterId: number;
  characterName: string;
  playerClass: PlayerClass | null;
  online: boolean;
  enabled: boolean;
  active: boolean;
  paused: boolean;
  mode: HostedPlayMode;
  objectiveId: string;
  objectiveLabel: string;
  pauseReason: HostedPlayPauseReason;
  pauseUntilMs: number | null;
  pauseSecondsRemaining: number;
  lastError: string;
  lastAutomationAtMs: number | null;
  resumeOnLogin: boolean;
  partyMode: HostedPlayPartyMode;
  actionLogEnabled: boolean;
  autoInviteNearbyPlayers: boolean;
  groupMode: HostedPlayGroupMode;
  groupLeaderName: string;
  groupLeaderDistance: number;
  socialPendingReplies: number;
  socialFriends: number;
  socialBlocks: number;
  lastWhisperFrom: string;
  lastSocialAction: string;
  llmEnabled: boolean;
  llmPlanPending: boolean;
  llmPlanMode: string;
  llmPlanFocus: string;
  llmPlanStatus: AmbientPlayerBotLlmDecisionStatus | '';
  llmPlanReason: string;
  llmSocialStatus: AmbientPlayerBotLlmDecisionStatus | '';
  llmSocialReason: string;
  llmSocialTarget: string;
  debug: HostedPlayDebugSnapshot;
}

export function defaultHostedPlayPreferences(): HostedPlayPreferences {
  return {
  resumeOnLogin: false,
  partyMode: 'solo',
  actionLogEnabled: true,
  autoInviteNearbyPlayers: false,
  };
}
