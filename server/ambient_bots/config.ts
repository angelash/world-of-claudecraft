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

export function applyAmbientPlayerBotConfigPatch(
  current: AmbientPlayerBotConfig,
  input: unknown,
): AmbientPlayerBotConfig {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('ambient bot config patch must be an object');
  }
  const patch = input as Record<string, unknown>;
  const next: AmbientPlayerBotConfig = { ...current };
  const unknownKeys: string[] = [];
  let applied = 0;
  for (const [key, value] of Object.entries(patch)) {
    switch (key) {
      case 'enabled':
        if (typeof value !== 'boolean') throw new Error('ambient bot config enabled must be a boolean');
        next.enabled = value;
        applied++;
        break;
      case 'plannerIntervalMs':
        next.plannerIntervalMs = intPatch(key, value, 1_000);
        applied++;
        break;
      case 'clusterRadius':
        next.clusterRadius = intPatch(key, value, 10);
        applied++;
        break;
      case 'releaseRadius':
        next.releaseRadius = intPatch(key, value, 20);
        applied++;
        break;
      case 'soloTargetBots':
        next.soloTargetBots = intPatch(key, value, 0);
        applied++;
        break;
      case 'extraBotsPerAdditionalPlayer':
        next.extraBotsPerAdditionalPlayer = intPatch(key, value, 0);
        applied++;
        break;
      case 'maxBotsPerCluster':
        next.maxBotsPerCluster = intPatch(key, value, 0);
        applied++;
        break;
      case 'maxProvisionPerTick':
        next.maxProvisionPerTick = intPatch(key, value, 0);
        applied++;
        break;
      case 'cooldownMs':
        next.cooldownMs = intPatch(key, value, 1_000);
        applied++;
        break;
      case 'reservationMs':
        next.reservationMs = intPatch(key, value, 1_000);
        applied++;
        break;
      case 'recentActionLimit':
        next.recentActionLimit = intPatch(key, value, 1);
        applied++;
        break;
      default:
        unknownKeys.push(key);
        break;
    }
  }
  if (unknownKeys.length > 0) {
    throw new Error(`unsupported ambient bot config keys: ${unknownKeys.join(', ')}`);
  }
  if (applied === 0) {
    throw new Error('ambient bot config patch must include at least one supported key');
  }
  if (next.releaseRadius <= next.clusterRadius) {
    throw new Error('ambient bot config releaseRadius must be greater than clusterRadius');
  }
  return next;
}

function intPatch(key: string, value: unknown, min: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`ambient bot config ${key} must be a finite number`);
  }
  return Math.max(min, Math.floor(value));
}
