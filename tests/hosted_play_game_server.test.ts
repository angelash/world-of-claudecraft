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
  touchCharacterLogin: vi.fn(async () => {}),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
}));

import { type ClientSession, GameServer } from '../server/game';
import { consumeMovementFramesV2 } from '../server/movement_input_timeline_v2';

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
    const party = state?.self?.party as
      | {
          members?: Array<{
            pid?: number;
            qlog?: Array<{ questId: string; counts: number[]; state: string }>;
            qdone?: string[];
          }>;
        }
      | null
      | undefined;
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

  it('keeps trusted hosted input outside client bot detection and inbound lanes', () => {
    const server = new GameServer();
    const session = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));
    const meta = server.sim.meta(session.pid);
    if (!meta) throw new Error('missing player meta');
    const detector = (server as any).botDetector;
    const inputObserved = vi.spyOn(detector, 'observeInput');
    const commandObserved = vi.spyOn(detector, 'observeCommand');
    const targetNearest = vi.spyOn(server.sim, 'targetNearestEnemy');

    session.msgLanes.movementTokens = 0;
    session.msgLanes.commandTokens = 0;

    expect(server.applyHostedPlayMoveInput(101, { f: 1 })).toBe(true);
    expect(server.applyHostedPlayCommand(101, { cmd: 'targetNearest' })).toBe(true);

    expect(meta.moveInput.forward).toBe(true);
    expect(targetNearest).toHaveBeenCalledWith(session.pid);
    expect(inputObserved).not.toHaveBeenCalled();
    expect(commandObserved).not.toHaveBeenCalled();
    expect(session.msgLanes.movementTokens).toBe(0);
    expect(session.msgLanes.commandTokens).toBe(0);
    expect(session.msgRate.dropsThisSecond).toBe(0);
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

  it('hands v2 movement to hosted control and back after a long observed session', () => {
    const server = new GameServer();
    const session = expectJoined(
      server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null, false, { movementWireVersion: 2 }),
    );
    const meta = server.sim.meta(session.pid)!;
    const entity = server.sim.entities.get(session.pid)!;
    const dispatch = (ct: number, mi: Record<string, number>) =>
      server.handleMessage(session, JSON.stringify({ t: 'input', ct, seq: ct, mi }));
    const tick = () => {
      consumeMovementFramesV2(server.sim, [session]);
      server.sim.tick();
    };

    // Queued manual movement must not replay when ownership changes.
    dispatch(0, { b: 1 });
    server.setHostedPlayObserved(101, true);
    server.applyHostedPlayMoveInput(101, { f: 1 }, 0);
    const before = { ...entity.pos };
    tick();
    expect(meta.moveInput.forward).toBe(true);
    expect(entity.pos.z).toBeGreaterThan(before.z);

    // The authenticated client's clock continues past the ordinary sanity bound.
    server.sim.time += 100;
    dispatch(2000, { f: 0 });
    tick();
    expect(meta.moveInput.forward).toBe(true);
    expect(session.lastInputSeq).toBe(2000);

    server.setHostedPlayObserved(101, false);
    tick();
    expect(meta.moveInput.forward).toBe(false);
    dispatch(2001, { b: 1 });
    tick();
    expect(meta.moveInput.back).toBe(true);
    expect(session.lastConsumedCt).toBe(2001);

    // Re-anchoring is one-time: normal v2 bounds still reject forged future ticks.
    dispatch(999999, { f: 1 });
    dispatch(2002, { b: 0 });
    tick();
    expect(meta.moveInput.forward).toBe(false);
    expect(meta.moveInput.back).toBe(false);
    expect(session.lastConsumedCt).toBe(2002);
    expect(session.movementTimeline?.rejectedSanityBound).toBe(1);
  });

  it('preserves v2 hosted ownership when a linkdead session resumes', () => {
    const server = new GameServer();
    const ws = fakeWs();
    const session = expectJoined(
      server.join(ws, 1, 101, 'Hero', 'warrior', null, false, { movementWireVersion: 2 }),
    );
    server.setHostedPlayObserved(101, true);
    expect(server.socketClosed(session, ws, { withMarket: false })).toBe(true);
    const resumed = expectJoined(
      server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null, false, { movementWireVersion: 2 }),
    );
    expect(resumed).toBe(session);
    server.setHostedPlayObserved(101, true);
    server.applyHostedPlayMoveInput(101, { f: 1 }, 0);
    consumeMovementFramesV2(server.sim, [resumed]);
    server.sim.tick();
    expect(server.sim.meta(session.pid)?.moveInput.forward).toBe(true);
  });

  it('captures hosted-play social state and recent events while observation is enabled', () => {
    const server = new GameServer();
    const session = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));

    server.setHostedPlayObserved(101, true);
    (server as any).send(session, {
      t: 'social',
      friends: [
        {
          id: 201,
          name: 'Aleph',
          cls: 'warrior',
          level: 5,
          realm: 'Test Realm',
          online: true,
          status: 'online',
          zone: 'Eastbrook Vale',
        },
      ],
      blocks: [{ id: 301, name: 'Blocked' }],
      ignores: [],
      guild: null,
      myPledge: null,
    });
    (server as any).send(session, {
      t: 'events',
      list: [
        {
          type: 'chat',
          fromPid: 201,
          from: 'Aleph',
          text: 'hey there',
          channel: 'whisper',
          pid: session.pid,
        },
      ],
    });

    expect(server.buildHostedPlayLiveState(101)?.social).toEqual({
      friends: [
        {
          id: 201,
          name: 'Aleph',
          cls: 'warrior',
          level: 5,
          realm: 'Test Realm',
          online: true,
          status: 'online',
          zone: 'Eastbrook Vale',
        },
      ],
      blocks: [{ id: 301, name: 'Blocked' }],
      ignores: [],
      guild: null,
      myPledge: null,
    });
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([
      {
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey there',
        channel: 'whisper',
        pid: session.pid,
      },
    ]);
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([]);

    server.setHostedPlayObserved(101, false);
    (server as any).send(session, {
      t: 'events',
      list: [
        {
          type: 'chat',
          fromPid: 202,
          from: 'Bran',
          text: 'ping',
          channel: 'whisper',
          pid: session.pid,
        },
      ],
    });
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([]);
  });
  it('observes exactly each raw recipient frame after private, block and server-only filtering', () => {
    const server = new GameServer();
    const a = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));
    const b = expectJoined(server.join(fakeWs(), 2, 102, 'Peer', 'warrior', null));
    a.blockListLoaded = b.blockListLoaded = true;
    server.setHostedPlayObserved(101, true);
    server.setHostedPlayObserved(102, true);
    vi.spyOn(server as any, 'isBlockedSender').mockImplementation(
      (viewer: unknown, fromPid: unknown) => viewer === a && fromPid === b.pid,
    );
    for (const owner of [a, b]) vi.mocked(owner.ws.send).mockClear();
    (server as any).routeEvents([
      { type: 'log', text: 'private-a', pid: a.pid },
      { type: 'log', text: 'private-b', pid: b.pid },
      {
        type: 'chat',
        channel: 'whisper',
        from: 'Peer',
        fromPid: b.pid,
        text: 'blocked',
        pid: a.pid,
      },
      { type: 'referralEvidence', pid: a.pid },
      { type: 'log', text: 'public' },
    ]);
    for (const owner of [a, b]) {
      const wire = vi
        .mocked(owner.ws.send)
        .mock.calls.map(([text]) => JSON.parse(String(text)))
        .filter((frame) => frame.t === 'events')
        .flatMap((frame) => frame.list);
      expect(
        wire.some((event) => event.type === 'referralEvidence' || event.text === 'blocked'),
      ).toBe(false);
      expect(wire.some((event) => event.text === (owner === a ? 'private-b' : 'private-a'))).toBe(
        false,
      );
      expect(wire.some((event) => event.text === (owner === a ? 'private-a' : 'private-b'))).toBe(
        true,
      );
      expect(server.drainHostedPlayRecentEvents(owner.characterId)).toEqual(wire);
      expect(server.drainHostedPlayRecentEvents(owner.characterId)).toEqual([]);
    }
    const overflow = Array.from({ length: 40 }, (_, i) => ({ type: 'log', text: `public-${i}` }));
    (server as any).routeEvents(overflow);
    for (const owner of [a, b]) {
      expect(server.drainHostedPlayRecentEvents(owner.characterId)).toEqual(overflow.slice(-32));
    }
    server.setHostedPlayObserved(101, false);
    (server as any).routeEvents([{ type: 'log', text: 'disabled', pid: a.pid }]);
    expect(server.drainHostedPlayRecentEvents(101)).toEqual([]);
  });

  it('preserves ignore and spectator privacy on the raw event capture path', () => {
    const server = new GameServer();
    const a = expectJoined(server.join(fakeWs(), 1, 101, 'Hero', 'warrior', null));
    const b = expectJoined(server.join(fakeWs(), 2, 102, 'Peer', 'warrior', null));
    const spectator = expectJoined(server.join(fakeWs(), 3, 103, 'Watcher', 'warrior', null));
    for (const owner of [a, b, spectator]) {
      owner.blockListLoaded = true;
      server.setHostedPlayObserved(owner.characterId, true);
      vi.mocked(owner.ws.send).mockClear();
    }
    a.ignoredIds.add(b.characterId);
    spectator.spectating = { characterId: b.characterId, name: b.name };
    const events = [
      { type: 'chat', channel: 'say', from: b.name, fromPid: b.pid, text: 'ignored-public' },
      {
        type: 'chat',
        channel: 'whisper',
        from: b.name,
        fromPid: b.pid,
        text: 'allowed-whisper',
        pid: a.pid,
      },
      {
        type: 'chat',
        channel: 'whisper',
        from: a.name,
        fromPid: a.pid,
        text: 'target-private',
        pid: b.pid,
      },
      {
        type: 'chat',
        channel: 'whisper',
        from: a.name,
        fromPid: a.pid,
        text: 'spectator-own',
        pid: spectator.pid,
      },
    ];
    (server as any).routeEvents(events);
    for (const owner of [a, b, spectator]) {
      const wire = vi
        .mocked(owner.ws.send)
        .mock.calls.map(([text]) => JSON.parse(String(text)))
        .filter((frame) => frame.t === 'events')
        .flatMap((frame) => frame.list);
      expect(server.drainHostedPlayRecentEvents(owner.characterId)).toEqual(wire);
    }
    const wireText = (owner: ClientSession) =>
      vi
        .mocked(owner.ws.send)
        .mock.calls.map(([text]) => JSON.parse(String(text)))
        .filter((frame) => frame.t === 'events')
        .flatMap((frame) => frame.list.map((event: { text: string }) => event.text));
    expect(wireText(a)).toEqual(['allowed-whisper']);
    expect(wireText(spectator)).toEqual(['ignored-public', 'spectator-own']);
  });
});
