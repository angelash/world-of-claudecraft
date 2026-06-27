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

const OLD_ENV = process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT;

afterEach(() => {
  if (OLD_ENV === undefined) delete process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT;
  else process.env.AMBIENT_PLAYER_BOTS_EXPERIMENT = OLD_ENV;
});

describe('GameServer hosted play seams', () => {
  it('builds a hosted-play live state from the current online session', () => {
    const server = new GameServer();
    const session = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));

    const state = server.buildHostedPlayLiveState(101);

    expect(state).toMatchObject({
      pid: session.pid,
      seed: 20061,
      self: expect.objectContaining({
        id: session.pid,
        lv: 1,
        qlog: expect.any(Array),
        qdone: expect.any(Array),
        cds: expect.any(Object),
        party: null,
      }),
    });
    expect(server.hostedPlaySessionInfo(101)).toEqual({
      characterId: 101,
      characterName: 'Hero',
      playerClass: 'warrior',
    });
  });

  it('notifies hosted-play observers only for real client input, not hosted input', () => {
    const server = new GameServer();
    const session = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));
    const observer = vi.fn();
    server.setHostedPlayInputObserver(observer);

    (server as any).dispatchMessage(
      session,
      { t: 'input', mi: { forward: 1 } },
      '',
      Date.now(),
      'client',
    );
    expect(observer).toHaveBeenCalledWith(101, 'input');

    observer.mockClear();
    server.applyHostedPlayMoveInput(101, { forward: 1 });
    expect(observer).not.toHaveBeenCalled();
  });
});
