import { describe, expect, it } from 'vitest';
import { ambientPlayerBotConfigFromEnv } from '../server/ambient_bots/config';
import { AmbientPlayerBotService } from '../server/ambient_bots/service';
import type { AmbientHumanPresence, AmbientPlayerBotRecord } from '../server/ambient_bots/types';

function cfg(overrides: Partial<ReturnType<typeof ambientPlayerBotConfigFromEnv>> = {}) {
  return {
    ...ambientPlayerBotConfigFromEnv({ AMBIENT_PLAYER_BOTS_EXPERIMENT: '1' } as NodeJS.ProcessEnv),
    maxProvisionPerTick: 10,
    ...overrides,
  };
}

function human(
  characterId: number,
  zoneId: string,
  level: number,
  x: number,
  z: number,
): AmbientHumanPresence {
  return {
    characterId,
    pid: characterId,
    name: `P${characterId}`,
    class: 'warrior',
    level,
    zoneId,
    x,
    z,
  };
}

function bot(overrides: Partial<AmbientPlayerBotRecord> = {}): AmbientPlayerBotRecord {
  return {
    botId: 'bot-1',
    accountId: 11,
    accountUsername: 'bot_user',
    accountPassword: 'BotPassword123',
    characterId: 101,
    characterName: 'Branoraaa',
    profileId: 'eastbrook_vale_warrior_newcomer',
    class: 'warrior',
    authToken: 'token-1',
    authTokenExpiresAtMs: null,
    lifecycleStatus: 'ready',
    provisionState: 'ready',
    levelBand: { min: 1, max: 7 },
    preferredZoneIds: ['eastbrook_vale'],
    lastKnownZoneId: 'eastbrook_vale',
    lastKnownLevel: 3,
    lastKnownX: 0,
    lastKnownZ: 0,
    assignedClusterId: null,
    assignedPlayerCharacterId: null,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs: null,
    plannerState: {},
    runnerState: {},
    socialState: {},
    ...overrides,
  };
}

describe('AmbientPlayerBotService', () => {
  it('requests a five-bot ambient pod for a solo human cluster', () => {
    const service = new AmbientPlayerBotService({ config: cfg({ maxProvisionPerTick: 5 }) });
    const actions = service.plan({
      humans: [human(1, 'eastbrook_vale', 2, 0, 0)],
      nowMs: 1_000,
    });

    expect(actions).toHaveLength(5);
    expect(actions.every((action) => action.type === 'provisionBot')).toBe(true);
    expect(service.diagnosticsSnapshot().clusters).toEqual([
      expect.objectContaining({
        clusterId: 'eastbrook_vale:1',
        desiredBots: 5,
        memberCharacterIds: [1],
      }),
    ]);
  });

  it('shares one ambient cluster for nearby humans instead of doubling the target', () => {
    const service = new AmbientPlayerBotService({ config: cfg({ maxProvisionPerTick: 10 }) });
    const actions = service.plan({
      humans: [
        human(1, 'eastbrook_vale', 2, 0, 0),
        human(2, 'eastbrook_vale', 3, 10, 8),
      ],
      nowMs: 1_000,
    });

    expect(actions).toHaveLength(6);
    expect(service.diagnosticsSnapshot().clusters).toHaveLength(1);
    expect(service.diagnosticsSnapshot().clusters[0]?.desiredBots).toBe(6);
  });

  it('prefers ready bots before provisioning new ones', () => {
    const service = new AmbientPlayerBotService({ config: cfg() });
    service.replaceDirectory([bot()]);

    const actions = service.plan({
      humans: [human(1, 'eastbrook_vale', 2, 0, 0)],
      nowMs: 1_000,
    });

    expect(actions).toContainEqual(expect.objectContaining({
      type: 'loginBot',
      botId: 'bot-1',
      clusterId: 'eastbrook_vale:1',
    }));
    expect(actions.filter((action) => action.type === 'provisionBot')).toHaveLength(4);
  });

  it('releases an assigned bot that drifted beyond the release radius', () => {
    const service = new AmbientPlayerBotService({ config: cfg() });
    service.replaceDirectory([
      bot({
        lifecycleStatus: 'online',
        assignedClusterId: 'eastbrook_vale:1',
        assignedPlayerCharacterId: 1,
        lastKnownX: 500,
        lastKnownZ: 500,
      }),
    ]);

    const actions = service.plan({
      humans: [human(1, 'eastbrook_vale', 2, 0, 0)],
      nowMs: 1_000,
    });

    expect(actions).toContainEqual(expect.objectContaining({
      type: 'logoutBot',
      botId: 'bot-1',
    }));
    expect(service.directoryRecords()[0]?.lifecycleStatus).toBe('cooldown');
  });

  it('holds pending provision slots long enough to avoid immediate reprovision spam', () => {
    const service = new AmbientPlayerBotService({ config: cfg({ maxProvisionPerTick: 5 }) });
    const first = service.plan({
      humans: [human(1, 'eastbrook_vale', 2, 0, 0)],
      nowMs: 1_000,
    });
    const second = service.plan({
      humans: [human(1, 'eastbrook_vale', 2, 0, 0)],
      nowMs: 2_000,
    });

    expect(first).toHaveLength(5);
    expect(second).toHaveLength(0);
    expect(service.diagnosticsSnapshot().directory.provisionPending).toBe(5);
  });
});
