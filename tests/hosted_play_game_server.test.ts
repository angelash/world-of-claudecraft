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

  it('includes party member quest state in hosted-play live state', () => {
    const server = new GameServer();
    const leader = expectJoined(server.join(fakeWs(), 1, 101, 'Leader', 'warrior', null));
    const member = expectJoined(server.join(fakeWs(), 2, 102, 'Member', 'mage', null));
    const leaderMeta = server.sim.meta(leader.pid);
    const memberMeta = server.sim.meta(member.pid);
    if (!leaderMeta || !memberMeta) throw new Error('missing player meta');
    leaderMeta.questsDone.add('q_wolves');
    leaderMeta.questsDone.add('q_boars');
    memberMeta.questsDone.add('q_wolves');
    memberMeta.questLog.set('q_boars', { questId: 'q_boars', counts: [2], state: 'active' });

    server.sim.partyInvite(member.pid, leader.pid);
    server.sim.partyAccept(member.pid);
    const state = server.buildHostedPlayLiveState(101);
    const party = state?.self?.party as {
      members?: Array<{
        pid?: number;
        qlog?: Array<{ questId: string; counts: number[]; state: string }>;
        qdone?: string[];
      }>;
    } | null | undefined;
    const memberWire = party?.members?.find((entry) => entry.pid === member.pid);

    expect(memberWire).toMatchObject({
      qlog: [{ questId: 'q_boars', counts: [2], state: 'active' }],
      qdone: ['q_wolves'],
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

  it('keeps hosted movement control when the observing client sends idle input', () => {
    const server = new GameServer();
    const session = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));
    const meta = server.sim.meta(session.pid);
    if (!meta) throw new Error('missing player meta');

    server.setHostedPlayObserved(101, true);
    server.applyHostedPlayMoveInput(101, { f: 1 });
    expect(meta.moveInput.forward).toBe(true);

    (server as any).dispatchMessage(
      session,
      { t: 'input', seq: 7, mi: { f: 0, b: 0, tl: 0, tr: 0, sl: 0, sr: 0, j: 0 } },
      '',
      Date.now(),
      'client',
    );

    expect(meta.moveInput.forward).toBe(true);
    expect(session.lastInputSeq).toBe(7);

    server.setHostedPlayObserved(101, false);
    (server as any).dispatchMessage(
      session,
      { t: 'input', seq: 8, mi: { f: 0, b: 0, tl: 0, tr: 0, sl: 0, sr: 0, j: 0 } },
      '',
      Date.now(),
      'client',
    );
    expect(meta.moveInput.forward).toBe(false);
    expect(session.lastInputSeq).toBe(8);
  });

  it('captures hosted-play social state and recent events while observation is enabled', () => {
    const server = new GameServer();
    const session = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));

    server.setHostedPlayObserved(101, true);
    (server as any).send(session, {
      t: 'social',
      friends: [{
        id: 201,
        name: 'Aleph',
        cls: 'warrior',
        level: 5,
        realm: 'Test Realm',
        online: true,
        status: 'online',
        zone: 'Eastbrook Vale',
      }],
      blocks: [{ id: 301, name: 'Blocked' }],
      guild: null,
    });
    (server as any).send(session, {
      t: 'events',
      list: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey there',
        channel: 'whisper',
        pid: session.pid,
      }],
    });

    expect(server.buildHostedPlayLiveState(101)?.social).toEqual({
      friends: [{
        id: 201,
        name: 'Aleph',
        cls: 'warrior',
        level: 5,
        realm: 'Test Realm',
        online: true,
        status: 'online',
        zone: 'Eastbrook Vale',
      }],
      blocks: [{ id: 301, name: 'Blocked' }],
      guild: null,
    });
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([{
      type: 'chat',
      fromPid: 201,
      from: 'Aleph',
      text: 'hey there',
      channel: 'whisper',
      pid: session.pid,
    }]);
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([]);

    server.setHostedPlayObserved(101, false);
    (server as any).send(session, {
      t: 'events',
      list: [{
        type: 'chat',
        fromPid: 202,
        from: 'Bran',
        text: 'ping',
        channel: 'whisper',
        pid: session.pid,
      }],
    });
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([]);
  });
});
