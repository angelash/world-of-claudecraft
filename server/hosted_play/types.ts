import type { PlayerClass } from '../../src/sim/types';

export type HostedPlayMode =
  | 'offline'
  | 'disabled'
  | 'active'
  | 'paused';

export type HostedPlayPauseReason =
  | ''
  | 'manual_input'
  | 'manual_command'
  | 'runtime_error';

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
}
