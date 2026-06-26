import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  openPlaySession: vi.fn(async () => 1),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => ({ listings: [], collections: new Map() })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  walletForAccount: vi.fn(async () => null),
}));

import { GameServer, type ClientSession } from '../server/game';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';

function fakeWs() {
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
  } as any;
}

function expectJoined(result: ClientSession | { error: string }): ClientSession {
  if ('error' in result) throw new Error(result.error);
  return result;
}

function bot(overrides: Partial<AmbientPlayerBotRecord> = {}): AmbientPlayerBotRecord {
  return {
    botId: 'bot-1',
    accountId: 11,
    characterId: 101,
    profileId: 'eastbrook_vale_warrior_newcomer',
    class: 'warrior',
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
    plannerState: {},
    socialState: {},
    ...overrides,
  };
}

const OLD_ENV = process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT;

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT;
  else process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT = OLD_ENV;
});

describe('GameServer ambient player bot integration', () => {
  it('counts only human sessions when planning nearby ambient population', () => {
    process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT = '1';
    const server = new GameServer();
    const human = expectJoined(server.join(fakeWs(), 1, 101, 'Human', 'warrior', null));
    expectJoined(server.join(fakeWs(), 2, 102, 'Bot', 'warrior', null, false, {
      ambientBotId: 'bot-1',
    }));

    const actions = server.runAmbientPlayerBotPlanner(1_000);
    const diagnostics = server.ambientPlayerBotDiagnostics();

    expect(actions).toHaveLength(5);
    expect(diagnostics.metrics.humansObserved).toBe(1);
    expect(diagnostics.clusters).toEqual([
      expect.objectContaining({
        clusterId: expect.stringContaining('eastbrook_vale'),
        memberCharacterIds: [human.characterId],
        desiredBots: 5,
      }),
    ]);
  });

  it('surfaces login plans through the GameServer diagnostics seam', () => {
    process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT = '1';
    const server = new GameServer();
    expectJoined(server.join(fakeWs(), 1, 101, 'Human', 'warrior', null));
    server.replaceAmbientPlayerBotDirectory([bot()]);

    const actions = server.runAmbientPlayerBotPlanner(1_000);
    const diagnostics = server.ambientPlayerBotDiagnostics();

    expect(actions).toContainEqual(expect.objectContaining({
      type: 'loginBot',
      botId: 'bot-1',
    }));
    expect(diagnostics.directory.total).toBe(1);
    expect(diagnostics.recentActions).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'loginBot', botId: 'bot-1' })]),
    );
  });
});
