import type { AmbientPlayerBotConfig } from './types';

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

export function ambientPlayerBotConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): AmbientPlayerBotConfig {
  return {
    enabled: env.AMBIENT_PLAYER_BOTS_EXPERIMENT === '1',
    plannerIntervalMs: intEnv(env, 'AMBIENT_PLAYER_BOTS_INTERVAL_MS', 10_000, 1_000),
    clusterRadius: intEnv(env, 'AMBIENT_PLAYER_BOTS_CLUSTER_RADIUS', 70, 10),
    releaseRadius: intEnv(env, 'AMBIENT_PLAYER_BOTS_RELEASE_RADIUS', 220, 20),
    soloTargetBots: intEnv(env, 'AMBIENT_PLAYER_BOTS_SOLO_TARGET', 5, 0),
    extraBotsPerAdditionalPlayer: intEnv(env, 'AMBIENT_PLAYER_BOTS_EXTRA_PER_PLAYER', 1, 0),
    maxBotsPerCluster: intEnv(env, 'AMBIENT_PLAYER_BOTS_MAX_PER_CLUSTER', 8, 0),
    maxProvisionPerTick: intEnv(env, 'AMBIENT_PLAYER_BOTS_MAX_PROVISION_PER_TICK', 5, 0),
    cooldownMs: intEnv(env, 'AMBIENT_PLAYER_BOTS_COOLDOWN_MS', 120_000, 1_000),
    reservationMs: intEnv(env, 'AMBIENT_PLAYER_BOTS_RESERVATION_MS', 90_000, 1_000),
    recentActionLimit: intEnv(env, 'AMBIENT_PLAYER_BOTS_RECENT_ACTION_LIMIT', 60, 1),
  };
}
