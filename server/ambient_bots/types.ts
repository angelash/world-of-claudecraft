import type { PlayerClass } from '../../src/sim/types';

export type AmbientBotLifecycleStatus =
  | 'ready'
  | 'reserved'
  | 'online'
  | 'cooldown'
  | 'retired';

export type AmbientBotProvisionState =
  | 'needsAccount'
  | 'needsCharacter'
  | 'ready'
  | 'retired';

export type AmbientBotArchetype =
  | 'newcomer'
  | 'quester'
  | 'traveler'
  | 'helper'
  | 'grinder';

export interface AmbientBotLevelBand {
  min: number;
  max: number;
}

export interface AmbientBotProfile {
  profileId: string;
  class: PlayerClass;
  archetype: AmbientBotArchetype;
  levelBand: AmbientBotLevelBand;
  preferredZoneIds: readonly string[];
  tags: readonly string[];
}

export interface AmbientPlayerBotRecord {
  botId: string;
  accountId: number | null;
  accountUsername: string;
  accountPassword: string;
  characterId: number | null;
  characterName: string;
  profileId: string;
  class: PlayerClass;
  authToken: string;
  authTokenExpiresAtMs: number | null;
  lifecycleStatus: AmbientBotLifecycleStatus;
  provisionState: AmbientBotProvisionState;
  levelBand: AmbientBotLevelBand;
  preferredZoneIds: readonly string[];
  lastKnownZoneId: string;
  lastKnownLevel: number;
  lastKnownX: number | null;
  lastKnownZ: number | null;
  assignedClusterId: string | null;
  assignedPlayerCharacterId: number | null;
  cooldownUntilMs: number | null;
  reservationUntilMs: number | null;
  lastRunnerError: string;
  lastRunnerAtMs: number | null;
  plannerState: Record<string, unknown>;
  runnerState: Record<string, unknown>;
  socialState: Record<string, unknown>;
}

export interface AmbientHumanPresence {
  characterId: number;
  pid: number;
  name: string;
  class: PlayerClass;
  level: number;
  zoneId: string;
  x: number;
  z: number;
}

export interface AmbientPlayerBotConfig {
  enabled: boolean;
  plannerIntervalMs: number;
  clusterRadius: number;
  releaseRadius: number;
  soloTargetBots: number;
  extraBotsPerAdditionalPlayer: number;
  maxBotsPerCluster: number;
  maxProvisionPerTick: number;
  cooldownMs: number;
  reservationMs: number;
  recentActionLimit: number;
}

export type AmbientBotPlanAction =
  | {
    type: 'loginBot';
    botId: string;
    clusterId: string;
    zoneId: string;
    targetCharacterId: number;
    reason: string;
  }
  | {
    type: 'logoutBot';
    botId: string;
    reason: string;
  }
  | {
    type: 'provisionBot';
    requestId: string;
    profileId: string;
    class: PlayerClass;
    clusterId: string;
    zoneId: string;
    targetCharacterId: number;
    reason: string;
  };

export interface AmbientPlayerClusterSnapshot {
  clusterId: string;
  zoneId: string;
  centerX: number;
  centerZ: number;
  avgLevel: number;
  memberCharacterIds: readonly number[];
  desiredBots: number;
  assignedBotIds: readonly string[];
}

export interface AmbientPlayerBotMetricsSnapshot {
  cycles: number;
  humansObserved: number;
  clustersObserved: number;
  desiredBots: number;
  assignedBots: number;
  loginPlans: number;
  provisionPlans: number;
  logoutPlans: number;
  lastRunAtMs: number | null;
  lastRunReason: string;
}

export type AmbientPlayerBotActionSnapshot = AmbientBotPlanAction & {
  atMs: number;
};

export interface AmbientPlayerBotDirectorySnapshot {
  total: number;
  ready: number;
  reserved: number;
  online: number;
  cooldown: number;
  retired: number;
  provisionPending: number;
  assigned: number;
}

export interface AmbientPlayerBotDiagnosticsSnapshot {
  enabled: boolean;
  config: AmbientPlayerBotConfig;
  metrics: AmbientPlayerBotMetricsSnapshot;
  clusters: readonly AmbientPlayerClusterSnapshot[];
  recentActions: readonly AmbientPlayerBotActionSnapshot[];
  directory: AmbientPlayerBotDirectorySnapshot;
}
