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
  | 'brain'
  | 'follow_leader'
  | 'hold_regroup';

export type HostedPlayPauseReason =
  | ''
  | 'manual_input'
  | 'manual_command'
  | 'runtime_error';

export interface HostedPlayPreferences {
  resumeOnLogin: boolean;
  partyMode: HostedPlayPartyMode;
}

export interface HostedPlaySessionInfo {
  characterId: number;
  characterName: string;
  playerClass: PlayerClass;
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
}

export function defaultHostedPlayPreferences(): HostedPlayPreferences {
  return {
    resumeOnLogin: false,
    partyMode: 'solo',
  };
}
