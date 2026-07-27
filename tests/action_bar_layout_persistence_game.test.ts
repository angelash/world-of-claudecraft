import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mocked-db GameServer harness (see tests/character_lease_game.test.ts). Only the
// db exports game.ts touches on the join / dispatch / broadcast paths are stubbed;
// setCharacterHotbarLayout is the one this suite asserts on. The mock is hoisted
// above the game import.
vi.mock('../server/db', () => ({
  pool: { query: vi.fn(async () => ({ rows: [] })) },
  saveCharacterState: vi.fn(async () => {}),
  saveCharacterAndMarketState: vi.fn(async () => {}),
  saveMarketState: vi.fn(async () => {}),
  saveMailState: vi.fn(async () => {}),
  loadMarketState: vi.fn(async () => null),
  loadMailState: vi.fn(async () => null),
  openPlaySession: vi.fn(async () => 1),
  touchCharacterLogin: vi.fn(async () => {}),
  closePlaySession: vi.fn(async () => {}),
  insertChatLogs: vi.fn(async () => {}),
  walletForAccount: vi.fn(async () => null),
  loadAccountFlair: vi.fn(async () => ({ ai: false, streamer: false, links: {} })),
  markAccountQuestComplete: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  grantAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  revokeAccountMechChroma: vi.fn(async () => ({ completedQuestIds: [], mechChromaIds: [] })),
  insertBankLedgerRow: vi.fn(async () => {}),
  acquireCharacterLease: vi.fn(async () => true),
  releaseCharacterLease: vi.fn(async () => {}),
  heartbeatCharacterLeases: vi.fn(async () => {}),
  releaseAllCharacterLeases: vi.fn(async () => {}),
  setCharacterHotbarLayout: vi.fn(async () => true),
}));

import { releaseCharacterLease, setCharacterHotbarLayout } from '../server/db';
import { type ClientSession, GameServer } from '../server/game';
import type { ActionBarLayout } from '../src/world_api/action_bar';

interface FakeClient {
  sent: any[];
  ws: { readyState: number; send: (payload: string) => void };
}

function fakeWs(): FakeClient {
  const sent: any[] = [];
  return { sent, ws: { readyState: 1, send: (p: string) => sent.push(JSON.parse(p)) } };
}

function lastSnap(sent: any[]): any {
  for (let i = sent.length - 1; i >= 0; i--) {
    if (sent[i].t === 'snap') return sent[i];
  }
  return null;
}

function join(
  server: GameServer,
  fc: FakeClient,
  characterId: number,
  name: string,
  meta: Parameters<GameServer['join']>[7] = {},
): ClientSession {
  const s = server.join(fc.ws as any, characterId, characterId, name, 'warrior', null, false, meta);
  if ('error' in s) throw new Error(s.error);
  s.blockListLoaded = true;
  return s;
}

function broadcast(server: GameServer): void {
  (server as any).broadcastSnapshots();
}

const LAYOUT: ActionBarLayout = {
  v: 1,
  forms: {
    normal: {
      bar: [{ type: 'ability', id: 'heroic_strike' }, null],
      attack: { type: 'item', id: 'linen_bandage' },
    },
    stealth: { bar: [{ type: 'ability', id: 'ambush' }], attack: null },
  },
};

describe('action-bar layout persistence (wire round trip)', () => {
  beforeEach(() => {
    vi.mocked(setCharacterHotbarLayout).mockReset();
    vi.mocked(setCharacterHotbarLayout).mockResolvedValue(true);
    vi.mocked(releaseCharacterLease).mockReset();
    vi.mocked(releaseCharacterLease).mockResolvedValue();
  });

  it('sends the stored layout to the owning client once, as the self `hbl` field', () => {
    const server = new GameServer();
    const fc = fakeWs();
    join(server, fc, 1, 'Owner', { hotbarLayout: LAYOUT });
    broadcast(server);
    const snap = lastSnap(fc.sent);
    expect(snap.self.hbl).toEqual(LAYOUT);

    // Second broadcast: the frozen layout is diffed against lastSent, so it is
    // NOT re-echoed (a later save must never round-trip back and clobber edits).
    fc.sent.length = 0;
    broadcast(server);
    const snap2 = lastSnap(fc.sent);
    expect(snap2?.self).not.toHaveProperty('hbl');
  });

  it('sends an explicit null `hbl` (seed signal) when the character has no stored layout', () => {
    const server = new GameServer();
    const fc = fakeWs();
    join(server, fc, 5, 'Fresh');
    broadcast(server);
    const snap = lastSnap(fc.sent);
    expect(snap.self).toHaveProperty('hbl');
    expect(snap.self.hbl).toBeNull();
  });

  it("does NOT leak one player's layout to another client observing the same entity", () => {
    const server = new GameServer();
    const ownerFc = fakeWs();
    const observerFc = fakeWs();
    const owner = join(server, ownerFc, 1, 'Owner', { hotbarLayout: LAYOUT });
    join(server, observerFc, 2, 'Observer');
    broadcast(server);

    const observerSnap = lastSnap(observerFc.sent);
    // The observer sees the owner as an OTHER entity (snap.ents); no entity wire
    // carries a hotbar layout, and the observer's own self.hbl is its own (null).
    for (const ent of observerSnap.ents ?? []) {
      expect(ent).not.toHaveProperty('hbl');
    }
    expect(observerSnap.self.hbl).toBeNull();
    // Decisive: the owner's private layout appears nowhere in the observer's frame.
    expect(JSON.stringify(observerSnap)).not.toContain('linen_bandage');
    // The owner still receives its own layout.
    expect(lastSnap(ownerFc.sent).self.hbl).toEqual(LAYOUT);
    void owner;
  });

  it('resends the latest accepted layout after a linkdead resume', async () => {
    const server = new GameServer();
    const firstSocket = fakeWs();
    const initial: ActionBarLayout = {
      v: 1,
      forms: { normal: { bar: [{ type: 'ability', id: 'initial' }] } },
    };
    const latest: ActionBarLayout = {
      v: 1,
      forms: { normal: { bar: [{ type: 'ability', id: 'latest' }] } },
    };
    const session = join(server, firstSocket, 6, 'Resume', {
      hotbarLayout: initial,
      leaseNonce: 'nonce-6',
    });
    broadcast(server);
    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: latest }),
    );
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));

    expect(server.socketClosed(session, firstSocket.ws as any)).toBe(true);
    const resumedSocket = fakeWs();
    const resumed = server.join(
      resumedSocket.ws as any,
      6,
      6,
      'Resume',
      'warrior',
      null,
      false,
      { leaseNonce: 'nonce-6' },
    );
    expect(resumed).toBe(session);
    broadcast(server);
    expect(lastSnap(resumedSocket.sent).self.hbl).toEqual(latest);
  });

  it('bounds a burst to one in-flight write plus the latest pending snapshot', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 9, 'Ordered', { leaseNonce: 'nonce-9' });
    const first: ActionBarLayout = {
      v: 1,
      forms: { normal: { bar: [{ type: 'ability', id: 'first' }] } },
    };
    let releaseFirst!: (saved: boolean) => void;
    vi.mocked(setCharacterHotbarLayout).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseFirst = resolve;
        }),
    );
    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: first }),
    );
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));

    const burst = Array.from({ length: 20 }, (_, index): ActionBarLayout => ({
      v: 1,
      forms: { normal: { bar: [{ type: 'ability', id: `burst-${index}` }] } },
    }));
    for (const layout of burst) {
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout }),
      );
    }
    expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1);

    releaseFirst(true);
    await vi.waitFor(
      () => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(2),
      { timeout: 2500 },
    );
    const calls = vi.mocked(setCharacterHotbarLayout).mock.calls;
    expect(calls.map((c) => c[0])).toEqual([9, 9]);
    expect(calls[0][1]).toEqual(first);
    expect(calls[1][1]).toEqual(burst.at(-1));
    expect(calls.map((c) => c[2])).toEqual(['nonce-9', 'nonce-9']);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(2);
  });

  it('continues with the latest pending snapshot after an in-flight write rejects', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const server = new GameServer();
      const fc = fakeWs();
      const session = join(server, fc, 10, 'Retry', { leaseNonce: 'nonce-10' });
      let rejectFirst!: (error: Error) => void;
      vi.mocked(setCharacterHotbarLayout).mockImplementationOnce(
        () =>
          new Promise<boolean>((_resolve, reject) => {
            rejectFirst = reject;
          }),
      );
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
      );
      await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));
      const latest: ActionBarLayout = {
        v: 1,
        forms: { normal: { bar: [{ type: 'ability', id: 'latest' }] } },
      };
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: latest }),
      );

      rejectFirst(new Error('transient write failure'));
      await vi.waitFor(
        () => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(2),
        { timeout: 2500 },
      );
      expect(vi.mocked(setCharacterHotbarLayout).mock.calls[1]).toEqual([
        10,
        latest,
        'nonce-10',
      ]);
    } finally {
      log.mockRestore();
    }
  });

  it('limits cross-character layout writes to two active database transactions', async () => {
    const server = new GameServer();
    const sessions = [21, 22, 23].map((id) =>
      join(server, fakeWs(), id, `Concurrent${id}`, { leaseNonce: `nonce-${id}` }),
    );
    let active = 0;
    let peak = 0;
    const releases: Array<() => void> = [];
    vi.mocked(setCharacterHotbarLayout).mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          active++;
          peak = Math.max(peak, active);
          releases.push(() => {
            active--;
            resolve(true);
          });
        }),
    );

    for (const session of sessions) {
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
      );
    }
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(2));
    expect(active).toBe(2);
    expect(peak).toBe(2);

    releases.shift()?.();
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(3));
    expect(peak).toBe(2);
    releases.splice(0).forEach((release) => release());
  });

  it('retries a single transient layout failure before releasing the lease on leave', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const server = new GameServer();
      const session = join(server, fakeWs(), 24, 'LeaveRetry', { leaseNonce: 'nonce-24' });
      vi.mocked(setCharacterHotbarLayout)
        .mockRejectedValueOnce(new Error('transient write failure'))
        .mockResolvedValueOnce(true);
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
      );
      await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));

      await server.leave(session, 'test');

      expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(setCharacterHotbarLayout).mock.calls[1]).toEqual([
        24,
        LAYOUT,
        'nonce-24',
      ]);
      expect(vi.mocked(releaseCharacterLease)).toHaveBeenCalledWith(24, 'nonce-24');
    } finally {
      log.mockRestore();
    }
  }, 5_000);

  it('retries a single transient layout failure during shutdown drain', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const server = new GameServer();
      const session = join(server, fakeWs(), 25, 'ShutdownRetry', {
        leaseNonce: 'nonce-25',
      });
      vi.mocked(setCharacterHotbarLayout)
        .mockRejectedValueOnce(new Error('transient write failure'))
        .mockResolvedValueOnce(true);
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
      );
      await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));

      await server.saveAll('shutdown');

      expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(2);
      expect(vi.mocked(setCharacterHotbarLayout).mock.calls[1]).toEqual([
        25,
        LAYOUT,
        'nonce-25',
      ]);
    } finally {
      log.mockRestore();
    }
  }, 5_000);

  it('tears down a session when the lease fence rejects its layout write', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 26, 'Displaced', { leaseNonce: 'nonce-26' });
    vi.mocked(setCharacterHotbarLayout).mockResolvedValueOnce(false);

    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
    );

    await vi.waitFor(() =>
      expect(fc.sent).toContainEqual({ t: 'error', error: 'character taken over' }),
    );
    await vi.waitFor(() => expect(session.left).toBe(true));
    expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1);
  });

  it('drains an in-flight layout save before releasing the character lease', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 11, 'Leaver', { leaseNonce: 'nonce-11' });
    let releaseSave!: (saved: boolean) => void;
    vi.mocked(setCharacterHotbarLayout).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseSave = resolve;
        }),
    );
    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
    );
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));

    const leaving = server.leave(session, 'test');
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { releaseCharacterLease } = await import('../server/db');
    expect(vi.mocked(releaseCharacterLease)).not.toHaveBeenCalled();

    releaseSave(true);
    await leaving;
    expect(vi.mocked(releaseCharacterLease)).toHaveBeenCalledWith(11, 'nonce-11');
  });

  it('drains layout saves as part of a shutdown save-all', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 12, 'Shutdown', { leaseNonce: 'nonce-12' });
    let releaseSave!: (saved: boolean) => void;
    vi.mocked(setCharacterHotbarLayout).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          releaseSave = resolve;
        }),
    );
    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
    );
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));

    let finished = false;
    const saving = server.saveAll('shutdown').then(() => {
      finished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(finished).toBe(false);

    releaseSave(true);
    await saving;
    expect(finished).toBe(true);
  });

  it('rejects new layout commands after the server begins stopping', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 13, 'Stopping', { leaseNonce: 'nonce-13' });
    server.stop();

    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(vi.mocked(setCharacterHotbarLayout)).not.toHaveBeenCalled();
  });

  it('validates + enqueues a save with the exact sanitized payload on a save_hotbar_layout command', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 7, 'Saver');
    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
    );
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));
    const [characterId, saved] = vi.mocked(setCharacterHotbarLayout).mock.calls[0];
    expect(characterId).toBe(7);
    expect(saved).toEqual(LAYOUT);
  });

  it('drops a garbage / oversized payload server-side without crashing or persisting', async () => {
    const server = new GameServer();
    const fc = fakeWs();
    const session = join(server, fc, 8, 'Abuser');

    // Not an object.
    expect(() =>
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: 'nope' }),
      ),
    ).not.toThrow();
    // An oversized bar (past the slot cap) rejects the whole payload.
    const huge = { v: 1, forms: { normal: { bar: Array.from({ length: 500 }, () => null) } } };
    expect(() =>
      server.handleMessage(
        session,
        JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: huge }),
      ),
    ).not.toThrow();
    // Missing layout entirely.
    expect(() =>
      server.handleMessage(session, JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout' })),
    ).not.toThrow();

    await new Promise((r) => setTimeout(r, 10));
    expect(vi.mocked(setCharacterHotbarLayout)).not.toHaveBeenCalled();
    // The session survives: a subsequent valid command still processes.
    server.handleMessage(
      session,
      JSON.stringify({ t: 'cmd', cmd: 'save_hotbar_layout', layout: LAYOUT }),
    );
    await vi.waitFor(() => expect(vi.mocked(setCharacterHotbarLayout)).toHaveBeenCalledTimes(1));
  });
});
