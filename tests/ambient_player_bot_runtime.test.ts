import { describe, expect, it, vi } from 'vitest';
import { AmbientPlayerBotRuntime } from '../server/ambient_bots/runtime';
import type { AmbientBotPlanAction, AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotSocket } from '../server/ambient_bots/ws_client';

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
    authTokenExpiresAtMs: 20_000,
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

class FakeGame {
  private readonly directory = new Map<string, AmbientPlayerBotRecord>();
  actionHandler: ((actions: readonly AmbientBotPlanAction[]) => void) | null = null;
  lastFulfilledRequestId: string | null = null;

  replaceAmbientPlayerBotDirectory(records: readonly AmbientPlayerBotRecord[]): void {
    this.directory.clear();
    for (const record of records) this.directory.set(record.botId, cloneRecord(record));
  }

  ambientPlayerBotDirectory(): AmbientPlayerBotRecord[] {
    return [...this.directory.values()].map(cloneRecord);
  }

  ambientPlayerBotRecord(botId: string): AmbientPlayerBotRecord | null {
    const record = this.directory.get(botId);
    return record ? cloneRecord(record) : null;
  }

  upsertAmbientPlayerBotRecord(record: AmbientPlayerBotRecord): void {
    this.directory.set(record.botId, cloneRecord(record));
  }

  fulfillAmbientPlayerBotProvision(requestId: string, record: AmbientPlayerBotRecord): void {
    this.lastFulfilledRequestId = requestId;
    this.upsertAmbientPlayerBotRecord(record);
  }

  setAmbientPlayerBotActionHandler(handler: ((actions: readonly AmbientBotPlanAction[]) => void) | null): void {
    this.actionHandler = handler;
  }
}

class FakeSocket implements AmbientPlayerBotSocket {
  readyState = 1;
  readonly sent: string[] = [];
  private readonly openListeners: Array<() => void> = [];
  private readonly messageListeners: Array<(data: unknown) => void> = [];
  private readonly errorListeners: Array<(error: Error) => void> = [];
  private readonly closeListeners: Array<(code?: number, reason?: Buffer) => void> = [];

  constructor(
    private readonly helloPid: number,
    private readonly snap: {
      self: Record<string, unknown>;
      ents?: Record<string, unknown>[];
      keep?: number[];
      seed?: number;
    },
  ) {
    queueMicrotask(() => this.emitOpen());
  }

  send(data: string): void {
    this.sent.push(data);
    const payload = JSON.parse(data) as { t?: string };
    if (payload.t !== 'auth') return;
    queueMicrotask(() => {
      this.emitMessage(JSON.stringify({ t: 'hello', pid: this.helloPid, seed: this.snap.seed ?? 20_061 }));
      queueMicrotask(() => {
        this.emitMessage(JSON.stringify({
          t: 'snap',
          self: this.snap.self,
          ents: this.snap.ents ?? [],
          keep: this.snap.keep ?? [],
        }));
      });
    });
  }

  close(code?: number, reason?: string): void {
    this.readyState = 3;
    this.emitClose(code, Buffer.from(reason ?? ''));
  }

  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: unknown) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: (code?: number, reason?: Buffer) => void): this;
  on(
    event: 'open' | 'message' | 'error' | 'close',
    listener: (() => void) | ((data: unknown) => void) | ((error: Error) => void) | ((code?: number, reason?: Buffer) => void),
  ): this {
    switch (event) {
      case 'open':
        this.openListeners.push(listener as () => void);
        break;
      case 'message':
        this.messageListeners.push(listener as (data: unknown) => void);
        break;
      case 'error':
        this.errorListeners.push(listener as (error: Error) => void);
        break;
      case 'close':
        this.closeListeners.push(listener as (code?: number, reason?: Buffer) => void);
        break;
    }
    return this;
  }

  triggerUnexpectedClose(): void {
    this.readyState = 3;
    this.emitClose(1006, Buffer.alloc(0));
  }

  private emitOpen(): void {
    for (const listener of this.openListeners) listener();
  }

  private emitMessage(data: string): void {
    for (const listener of this.messageListeners) listener(data);
  }

  private emitClose(code?: number, reason?: Buffer): void {
    for (const listener of this.closeListeners) listener(code, reason);
  }
}

describe('AmbientPlayerBotRuntime', () => {
  it('normalizes stale reserved and online records during startup', async () => {
    const game = new FakeGame();
    const saved: AmbientPlayerBotRecord[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          lifecycleStatus: 'reserved',
          assignedClusterId: 'eastbrook_vale:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 5_000,
          runnerState: { connected: true },
        }),
      ]),
      saveBot: vi.fn(async (record: AmbientPlayerBotRecord) => {
        saved.push(cloneRecord(record));
      }),
    };
    const runtime = new AmbientPlayerBotRuntime({
      game,
      db,
      apiClient: {
        register: vi.fn(),
        login: vi.fn(),
        createCharacter: vi.fn(),
      },
      wsBaseUrl: 'ws://ambient.test',
      nowMs: () => 1_000,
    });

    await runtime.start();

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        lifecycleStatus: 'ready',
        assignedClusterId: null,
        assignedPlayerCharacterId: null,
        reservationUntilMs: null,
        runnerState: {},
      }),
    ]);
    expect(saved).toEqual([
      expect.objectContaining({
        lifecycleStatus: 'ready',
        assignedClusterId: null,
      }),
    ]);

    await runtime.stop();
  });

  it('provisions a bot account, connects over ws, and resets cleanly on disconnect', async () => {
    const game = new FakeGame();
    const saved: AmbientPlayerBotRecord[] = [];
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => []),
      saveBot: vi.fn(async (record: AmbientPlayerBotRecord) => {
        saved.push(cloneRecord(record));
      }),
    };
    const apiClient = {
      register: vi.fn(async () => ({ token: 'token-2', username: 'bot_mage_1' })),
      login: vi.fn(async () => ({ token: 'unused', username: 'unused' })),
      createCharacter: vi.fn(async (_token: string, name: string) => ({
        id: 202,
        name,
        class: 'mage' as const,
        level: 1,
        forceRename: false,
      })),
    };
    const runtime = new AmbientPlayerBotRuntime({
      game,
      db,
      apiClient,
      wsBaseUrl: 'ws://ambient.test',
      webSocketFactory: () => {
        const socket = new FakeSocket(77, { self: { id: 202, x: 12, z: 34, lv: 2 } });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
      resolveAccountIdForToken: async () => 22,
    });

    await runtime.start();
    game.actionHandler?.([{
      type: 'provisionBot',
      requestId: 'req-1',
      profileId: 'eastbrook_vale_mage_newcomer',
      class: 'mage',
      clusterId: 'eastbrook_vale:1',
      zoneId: 'eastbrook_vale',
      targetCharacterId: 1,
      reason: 'test provision',
    }]);

    await vi.waitFor(() => {
      const records = game.ambientPlayerBotDirectory();
      expect(records).toHaveLength(1);
      expect(records[0]).toEqual(expect.objectContaining({
        accountId: 22,
        characterId: 202,
        lifecycleStatus: 'online',
        provisionState: 'ready',
        authToken: 'token-2',
        lastKnownX: 12,
        lastKnownZ: 34,
        lastKnownLevel: 2,
        runnerState: { pid: 77, connected: true },
      }));
    });

    const authPayload = JSON.parse(sockets[0]?.sent[0] ?? '{}') as { t?: string; token?: string; character?: number };
    expect(authPayload).toEqual({
      t: 'auth',
      token: 'token-2',
      character: 202,
    });
    expect(game.lastFulfilledRequestId).toBe('req-1');
    expect(saved.some((record) => record.lifecycleStatus === 'reserved')).toBe(true);
    expect(saved.some((record) => record.lifecycleStatus === 'online')).toBe(true);

    sockets[0]?.triggerUnexpectedClose();
    await vi.waitFor(() => {
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          lifecycleStatus: 'ready',
          assignedClusterId: null,
          assignedPlayerCharacterId: null,
          reservationUntilMs: null,
          runnerState: {},
        }),
      ]);
    });

    await runtime.stop();
  });

  it('drives connected bots through the progression brain loop', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'eastbrook_vale:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const runtime = new AmbientPlayerBotRuntime({
      game,
      db,
      apiClient: {
        register: vi.fn(),
        login: vi.fn(),
        createCharacter: vi.fn(),
      },
      wsBaseUrl: 'ws://ambient.test',
      brainIntervalMs: 5,
      webSocketFactory: () => {
        const socket = new FakeSocket(91, {
          self: {
            id: 101,
            x: 4,
            z: 6,
            lv: 1,
            hp: 40,
            mhp: 40,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qlog: [],
            qdone: [],
            cds: {},
          },
          ents: [
            { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([{
      type: 'loginBot',
      botId: 'bot-1',
      clusterId: 'eastbrook_vale:1',
      zoneId: 'eastbrook_vale',
      targetCharacterId: 1,
      reason: 'test login',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string });
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'interact')).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'accept_wolves',
          objectiveLabel: 'Picking up Wolves at the Door',
        }),
      }),
    ]);

    await runtime.stop();
  });
});

function cloneRecord(record: AmbientPlayerBotRecord): AmbientPlayerBotRecord {
  return {
    ...record,
    levelBand: { ...record.levelBand },
    preferredZoneIds: [...record.preferredZoneIds],
    plannerState: { ...record.plannerState },
    runnerState: { ...record.runnerState },
    socialState: { ...record.socialState },
  };
}
