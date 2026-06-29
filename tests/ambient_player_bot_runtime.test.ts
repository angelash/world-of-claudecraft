import { describe, expect, it, vi } from 'vitest';
import { AmbientPlayerBotLlmCoordinator } from '../server/ambient_bots/llm_coordinator';
import { AmbientPlayerBotRuntime } from '../server/ambient_bots/runtime';
import type { AmbientBotLlmProvider } from '../server/ambient_bots/llm_types';
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

const mirefenThroughBastionDoor = [
  'q_wolves',
  'q_boars',
  'q_spiders',
  'q_murlocs',
  'q_supplies',
  'q_mine',
  'q_greyjaw',
  'q_bandits',
  'q_ringleader',
  'q_bones',
  'q_whispers',
  'q_names_of_the_dead',
  'q_silence_the_call',
  'q_rite',
  'q_fenbridge_muster',
  'q_prowlers',
  'q_prowler_pelts',
  'q_fen_supplies',
  'q_deepfen',
  'q_idols',
  'q_deepfen_purge',
  'q_widows',
  'q_broodmother',
  'q_drowned',
  'q_drowned_censers',
  'q_no_rest',
  'q_trolls',
  'q_troll_fetishes',
  'q_grubjaw',
  'q_cult_camp',
  'q_summoners',
  'q_deacon',
  'q_bastion_door',
] as const;
const mirefenThroughMistcaller = [...mirefenThroughBastionDoor, 'q_olen', 'q_mistcaller'] as const;
const thornpeakThroughStarters = [
  ...mirefenThroughMistcaller,
  'q_highwatch_summons',
  'q_stalkers',
  'q_stalker_pelts',
  'q_kobold_tunnels',
  'q_glowing_wax',
] as const;
const thornpeakThroughWarfront = [
  ...thornpeakThroughStarters,
  'q_ogre_edges',
  'q_ogre_totems',
  'q_ogre_bounty',
  'q_elementals',
  'q_shard_cores',
  'q_kazzix',
] as const;
const thornpeakThroughLateOutdoors = [
  ...thornpeakThroughWarfront,
  'q_zealots',
  'q_cult_orders',
  'q_necromancers',
  'q_revenants',
  'q_revenant_vanguard',
] as const;
const thornpeakThroughSanctumGate = [
  ...thornpeakThroughLateOutdoors,
  'q_wyrm_sigils',
  'q_breaking_the_seal',
  'q_voice_below',
  'q_sanctum_gate',
] as const;
const thornpeakThroughWarCampGroups = [
  ...thornpeakThroughSanctumGate,
  'q_crushers',
  'q_drogmar',
] as const;
const thornpeakThroughKorgath = [...thornpeakThroughWarCampGroups, 'q_korgath'] as const;
const thornpeakThroughVelkhar = [...thornpeakThroughKorgath, 'q_velkhar'] as const;

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

  emitJson(payload: unknown): void {
    this.emitMessage(JSON.stringify(payload));
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
        runnerState: expect.objectContaining({ pid: 77, connected: true }),
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

  it('drives connected bots through object-interaction quest routes', async () => {
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
            x: 58,
            z: -58,
            lv: 6,
            hp: 40,
            mhp: 40,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qlog: [{ questId: 'q_supplies', counts: [1], state: 'active' }],
            qdone: ['q_wolves', 'q_boars', 'q_spiders', 'q_murlocs'],
            cds: {},
          },
          ents: [
            { id: 9401, k: 'object', obj: 'supply_crate', x: 59, z: -58, loot: 1 },
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
      reason: 'test object route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; id?: number });
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'target' && message.id === 9401)).toBe(true);
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'interact')).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'collect_supplies',
          objectiveLabel: 'Recovering Stolen Supplies',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('records the Fenbridge muster travel objective and emits movement input for the cross-zone handoff', async () => {
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
          lastKnownLevel: 6,
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
            x: 0,
            z: 0,
            lv: 6,
            hp: 40,
            mhp: 40,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qlog: [{ questId: 'q_fenbridge_muster', counts: [0], state: 'active' }],
            qdone: [
              'q_wolves',
              'q_boars',
              'q_spiders',
              'q_murlocs',
              'q_supplies',
              'q_mine',
              'q_greyjaw',
              'q_bandits',
              'q_ringleader',
              'q_bones',
              'q_whispers',
              'q_names_of_the_dead',
              'q_silence_the_call',
              'q_rite',
            ],
            cds: {},
          },
          ents: [],
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
      reason: 'test Fenbridge handoff',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'collect_fenbridge_muster',
          objectiveLabel: 'Carrying the Fenbridge muster order north',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('drives connected bots through town resupply over the real vendor buy command', async () => {
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
          lastKnownLevel: 2,
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
            x: -7,
            z: 3,
            lv: 2,
            hp: 40,
            mhp: 40,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            copper: 150,
            inv: [],
            qlog: [{ questId: 'q_boars', counts: [0], state: 'active' }],
            qdone: ['q_wolves'],
            cds: {},
          },
          ents: [
            { id: 7100, k: 'npc', tid: 'trader_wilkes', x: -7, z: 3 },
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
      reason: 'test resupply route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; item?: string; npc?: number });
      expect(sent?.some((message) =>
        message.t === 'cmd'
        && message.cmd === 'buy'
        && message.item === 'baked_bread'
        && message.npc === 7100,
      )).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'restock_food_and_drink',
          objectiveLabel: 'Restocking Freshly Baked Bread and Minor Healing Potion',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('drives connected Mirefen bots through Fenbridge resupply over the real vendor buy command', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 8,
          lastKnownZoneId: 'mirefen_marsh',
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
            x: -4,
            z: 308,
            lv: 8,
            hp: 40,
            mhp: 40,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            copper: 900,
            inv: [],
            qlog: [{ questId: 'q_widows', counts: [0, 0], state: 'active' }],
            qdone: [
              'q_wolves',
              'q_boars',
              'q_spiders',
              'q_murlocs',
              'q_supplies',
              'q_mine',
              'q_greyjaw',
              'q_bandits',
              'q_ringleader',
              'q_bones',
              'q_whispers',
              'q_names_of_the_dead',
              'q_silence_the_call',
              'q_rite',
              'q_fenbridge_muster',
              'q_prowlers',
              'q_prowler_pelts',
              'q_fen_supplies',
              'q_deepfen',
              'q_idols',
              'q_deepfen_purge',
            ],
            cds: {},
          },
          ents: [
            { id: 7201, k: 'npc', tid: 'provisioner_hale', x: -4, z: 308 },
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
      clusterId: 'mirefen_marsh:1',
      zoneId: 'mirefen_marsh',
      targetCharacterId: 1,
      reason: 'test Fenbridge resupply route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; item?: string; npc?: number });
      expect(sent?.some((message) =>
        message.t === 'cmd'
        && message.cmd === 'buy'
        && message.item === 'fenbridge_rye'
        && message.npc === 7201,
      )).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'restock_food_and_drink',
          objectiveLabel: 'Restocking Fenbridge Rye Loaf and Lesser Healing Potion',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('processes social snapshots and whisper replies through the runtime loop', async () => {
    let nowMs = 5_000;
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const saved: AmbientPlayerBotRecord[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'eastbrook_vale:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          profileId: 'eastbrook_vale_paladin_quester',
          class: 'paladin',
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
          ents: [],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => nowMs,
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
      expect(sockets).toHaveLength(1);
    });

    sockets[0]?.emitJson({
      t: 'social',
      friends: [],
      blocks: [],
      guild: null,
    });
    sockets[0]?.emitJson({
      t: 'events',
      list: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey, what are you doing?',
        channel: 'whisper',
        pid: 101,
      }],
    });

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; name?: string });
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'friend_add' && message.name === 'Aleph')).toBe(true);
    });

    nowMs = 12_000;
    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; text?: string });
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'chat' && message.text?.startsWith('/w Aleph '))).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        socialState: expect.objectContaining({
          contacts: expect.objectContaining({
            Aleph: expect.objectContaining({
              whispersReceived: 1,
              whispersSent: 1,
            }),
          }),
        }),
        runnerState: expect.objectContaining({
          socialPendingReplies: 0,
          socialFriends: 0,
          socialBlocks: 0,
          lastWhisperFrom: 'Aleph',
        }),
      }),
    ]);
    expect(saved.some((record) => Object.keys(record.socialState).length > 0)).toBe(true);

    await runtime.stop();
  });

  it('forms an ambient Bastion party by inviting nearby cluster bots and accepting ambient party invites', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: 45 + (isLeader ? 0 : 1),
            z: 511,
            lv: 12,
            hp: 120,
            mhp: 120,
            res: isLeader ? 0 : 120,
            mres: isLeader ? 0 : 120,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...mirefenThroughBastionDoor],
            qlog: [
              { questId: 'q_olen', counts: [0], state: 'active' },
              { questId: 'q_mistcaller', counts: [0], state: 'active' },
            ],
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: 46,
              z: 511,
              lv: 12,
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'mirefen_marsh:1',
        zoneId: 'mirefen_marsh',
        targetCharacterId: 1,
        reason: 'ambient Bastion party leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'mirefen_marsh:1',
        zoneId: 'mirefen_marsh',
        targetCharacterId: 1,
        reason: 'ambient Bastion party follower',
      },
    ]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; id?: number });
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'pinvite' && message.id === 102)).toBe(true);
    });

    sockets[1]?.emitJson({
      t: 'events',
      list: [{
        type: 'partyInvite',
        fromPid: 101,
        fromName: 'Branoraaa',
        pid: 102,
      }],
    });

    await vi.waitFor(() => {
      const sent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string });
      expect(sent?.some((message) => message.t === 'cmd' && message.cmd === 'paccept')).toBe(true);
    });

    await runtime.stop();
  });

  it('forms an outdoor q_crushers party before pushing the grouped war-camp objective', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: isLeader ? -120 : -118,
            z: 738,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: isLeader ? 0 : 180,
            mres: isLeader ? 0 : 180,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughSanctumGate],
            qlog: [{ questId: 'q_crushers', counts: [0], state: 'active' }],
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: isLeader ? -118 : -120,
              z: 738,
              lv: 18,
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_crushers leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_crushers follower',
      },
    ]);

    await vi.waitFor(() => {
      const leaderSent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; id?: number; mi?: Record<string, number> });
      expect(leaderSent?.some((message) => message.t === 'cmd' && message.cmd === 'pinvite' && message.id === 102)).toBe(true);
      expect(leaderSent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(false);
    });

    sockets[1]?.emitJson({
      t: 'events',
      list: [{
        type: 'partyInvite',
        fromPid: 101,
        fromName: 'Branoraaa',
        pid: 102,
      }],
    });

    await vi.waitFor(() => {
      const followerSent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string });
      expect(followerSent?.some((message) => message.t === 'cmd' && message.cmd === 'paccept')).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        botId: 'bot-1',
        runnerState: expect.objectContaining({
          objectiveQuestId: 'q_crushers',
          groupMode: 'wait_party',
          groupObjectiveScope: 'outdoor',
          groupAwaitingParty: true,
        }),
      }),
    ]));

    await runtime.stop();
  });

  it('enters Gravewyrm Sanctum once the ambient q_korgath party is assembled at the door', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const partyWire = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: 0, z: 880, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'mage', level: 18, hp: 120, mhp: 120, res: 180, mres: 180, rtype: 'mana', x: 1, z: 880, dead: 0, inCombat: 0, group: 1 },
      ],
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: isLeader ? 0 : 1,
            z: 880,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: isLeader ? 0 : 180,
            mres: isLeader ? 0 : 180,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughWarCampGroups],
            qlog: [{ questId: 'q_korgath', counts: [0], state: 'active' }],
            party: partyWire,
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: 1,
              z: 880,
              lv: 18,
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_korgath leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_korgath follower',
      },
    ]);

    await vi.waitFor(() => {
      const leaderSent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      const followerSent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      expect(leaderSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'gravewyrm_sanctum',
      )).toBe(true);
      expect(followerSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'gravewyrm_sanctum',
      )).toBe(true);
    });

    await runtime.stop();
  });

  it('enters Gravewyrm Sanctum once the ambient q_velkhar party is assembled at the door', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const partyWire = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: 0, z: 880, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'mage', level: 18, hp: 120, mhp: 120, res: 180, mres: 180, rtype: 'mana', x: 1, z: 880, dead: 0, inCombat: 0, group: 1 },
      ],
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: isLeader ? 0 : 1,
            z: 880,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: isLeader ? 0 : 180,
            mres: isLeader ? 0 : 180,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughKorgath],
            qlog: [{ questId: 'q_velkhar', counts: [0], state: 'active' }],
            party: partyWire,
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: 1,
              z: 880,
              lv: 18,
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_velkhar leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_velkhar follower',
      },
    ]);

    await vi.waitFor(() => {
      const leaderSent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      const followerSent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      expect(leaderSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'gravewyrm_sanctum',
      )).toBe(true);
      expect(followerSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'gravewyrm_sanctum',
      )).toBe(true);
    });

    await runtime.stop();
  });

  it('enters Gravewyrm Sanctum once the ambient q_gravewyrm party is assembled at the door', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const partyWire = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: 0, z: 880, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'mage', level: 18, hp: 120, mhp: 120, res: 180, mres: 180, rtype: 'mana', x: 1, z: 880, dead: 0, inCombat: 0, group: 1 },
      ],
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: isLeader ? 0 : 1,
            z: 880,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: isLeader ? 0 : 180,
            mres: isLeader ? 0 : 180,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughVelkhar],
            qlog: [{ questId: 'q_gravewyrm', counts: [0], state: 'active' }],
            party: partyWire,
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: 1,
              z: 880,
              lv: 18,
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_gravewyrm leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'thornpeak:1',
        zoneId: 'thornpeak',
        targetCharacterId: 1,
        reason: 'ambient q_gravewyrm follower',
      },
    ]);

    await vi.waitFor(() => {
      const leaderSent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      const followerSent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      expect(leaderSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'gravewyrm_sanctum',
      )).toBe(true);
      expect(followerSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'gravewyrm_sanctum',
      )).toBe(true);
    });

    await runtime.stop();
  });

  it('enters the Sunken Bastion once the ambient Bastion party is assembled at the door', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const partyWire = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 45, z: 511, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 46, z: 511, dead: 0, inCombat: 0, group: 1 },
      ],
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: 45 + (isLeader ? 0 : 1),
            z: 511,
            lv: 12,
            hp: 120,
            mhp: 120,
            res: isLeader ? 0 : 120,
            mres: isLeader ? 0 : 120,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...mirefenThroughBastionDoor],
            qlog: [
              { questId: 'q_olen', counts: [0], state: 'active' },
              { questId: 'q_mistcaller', counts: [0], state: 'active' },
            ],
            party: partyWire,
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: 46,
              z: 511,
              lv: 12,
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'mirefen_marsh:1',
        zoneId: 'mirefen_marsh',
        targetCharacterId: 1,
        reason: 'ambient Bastion party leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'mirefen_marsh:1',
        zoneId: 'mirefen_marsh',
        targetCharacterId: 1,
        reason: 'ambient Bastion party follower',
      },
    ]);

    await vi.waitFor(() => {
      const leaderSent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      const followerSent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; dungeon?: string });
      expect(leaderSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'sunken_bastion',
      )).toBe(true);
      expect(followerSent?.some((message) =>
        message.t === 'cmd' && message.cmd === 'enter_dungeon' && message.dungeon === 'sunken_bastion',
      )).toBe(true);
    });

    await runtime.stop();
  });

  it('holds the Bastion leader for regroup and has the trailing follower use /follow inside the dungeon', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    let socketIndex = 0;
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          accountUsername: 'bot_user_2',
          accountPassword: 'BotPassword123',
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          authToken: 'token-2',
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const partyWire = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1532, z: -1200, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1506, z: -1200, dead: 0, inCombat: 0, group: 1 },
      ],
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
        const isLeader = socketIndex++ === 0;
        const socket = new FakeSocket(isLeader ? 101 : 102, {
          self: {
            id: isLeader ? 101 : 102,
            x: isLeader ? 1532 : 1506,
            z: -1200,
            dgn: 'sunken_bastion',
            lv: 12,
            hp: 120,
            mhp: 120,
            res: isLeader ? 0 : 120,
            mres: isLeader ? 0 : 120,
            rtype: isLeader ? 'rage' : 'mana',
            gcd: 0,
            inv: [],
            qdone: [...mirefenThroughBastionDoor],
            qlog: [
              { questId: 'q_olen', counts: [0], state: 'active' },
              { questId: 'q_mistcaller', counts: [0], state: 'active' },
            ],
            party: partyWire,
            cds: {},
          },
          ents: [
            {
              id: isLeader ? 102 : 101,
              k: 'player',
              nm: isLeader ? 'Branorabb' : 'Branoraaa',
              x: isLeader ? 1506 : 1532,
              z: -1200,
              lv: 12,
              dgn: 'sunken_bastion',
            },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    game.actionHandler?.([
      {
        type: 'loginBot',
        botId: 'bot-1',
        clusterId: 'mirefen_marsh:1',
        zoneId: 'mirefen_marsh',
        targetCharacterId: 1,
        reason: 'ambient Bastion regroup leader',
      },
      {
        type: 'loginBot',
        botId: 'bot-2',
        clusterId: 'mirefen_marsh:1',
        zoneId: 'mirefen_marsh',
        targetCharacterId: 1,
        reason: 'ambient Bastion regroup follower',
      },
    ]);

    await vi.waitFor(() => {
      const leaderSent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; mi?: Record<string, number> });
      const followerSent = sockets[1]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; text?: string; mi?: Record<string, number> });
      expect(leaderSent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(false);
      expect(followerSent?.some((message) =>
        message.t === 'cmd'
        && message.cmd === 'chat'
        && message.text === '/follow Branoraaa',
      )).toBe(true);
      expect(followerSent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(false);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        botId: 'bot-1',
        runnerState: expect.objectContaining({
          groupMode: 'hold_regroup',
          groupNeedsRegroup: true,
          groupLaggingMembers: 1,
        }),
      }),
      expect.objectContaining({
        botId: 'bot-2',
        runnerState: expect.objectContaining({
          groupMode: 'follow_leader',
          groupLeaderName: 'Branoraaa',
        }),
      }),
    ]));

    await runtime.stop();
  });

  it('records the Highwatch summons travel objective and emits movement input for the Thornpeak handoff', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'mirefen_marsh:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 12,
          lastKnownZoneId: 'mirefen_marsh',
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
            x: 0,
            z: 300,
            lv: 12,
            hp: 120,
            mhp: 120,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...mirefenThroughMistcaller],
            qlog: [{ questId: 'q_highwatch_summons', counts: [0], state: 'active' }],
            cds: {},
          },
          ents: [],
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
      clusterId: 'mirefen_marsh:1',
      zoneId: 'mirefen_marsh',
      targetCharacterId: 1,
      reason: 'test Highwatch handoff',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'collect_highwatch_summons',
          objectiveLabel: 'Carrying Aldric\'s summons to Highwatch',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('drives connected Thornpeak bots through Highwatch resupply over the real vendor buy command', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 13,
          lastKnownZoneId: 'thornpeak_heights',
          class: 'mage',
          profileId: 'eastbrook_vale_mage_newcomer',
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
            x: -5,
            z: 668,
            lv: 13,
            hp: 90,
            mhp: 90,
            res: 120,
            mres: 120,
            rtype: 'mana',
            gcd: 0,
            copper: 2500,
            inv: [],
            qdone: [...mirefenThroughMistcaller, 'q_highwatch_summons', 'q_stalkers', 'q_stalker_pelts'],
            qlog: [],
            cds: {},
          },
          ents: [
            { id: 9824, k: 'npc', tid: 'quartermaster_bree', x: -5, z: 668 },
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test Highwatch resupply',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; item?: string; npc?: number });
      expect(sent?.some((message) =>
        message.t === 'cmd'
        && message.cmd === 'buy'
        && message.item === 'trail_hardtack'
        && message.npc === 9824,
      )).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'restock_food_and_drink',
          objectiveLabel: 'Restocking Highwatch Trail Hardtack and Meltwater Flask and Healing Potion',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('records the ogre totem collection objective and emits movement input for the Thornpeak war-camp approach', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 15,
          lastKnownZoneId: 'thornpeak_heights',
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
            x: -90,
            z: 700,
            lv: 15,
            hp: 130,
            mhp: 130,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughStarters, 'q_ogre_edges'],
            qlog: [{ questId: 'q_ogre_totems', counts: [0], state: 'active' }],
            cds: {},
          },
          ents: [],
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test ogre totem route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'collect_ogre_totems',
          objectiveLabel: 'Recovering Ogre War Totems',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('keeps connected Thornpeak bots on a local Stormcrag grind route when Kazzix is still level-gated', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 16,
          lastKnownZoneId: 'thornpeak_heights',
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
            x: 0,
            z: 660,
            lv: 16,
            hp: 130,
            mhp: 130,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughStarters, 'q_ogre_edges', 'q_ogre_totems', 'q_ogre_bounty', 'q_elementals', 'q_shard_cores'],
            qlog: [],
            cds: {},
          },
          ents: [],
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test Stormcrag fallback grind',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'grind',
          objectiveLabel: 'Grinding Stormcrag Elemental',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('records the Wyrmcult orders objective and emits movement input for the Sanctum camp approach', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 17,
          lastKnownZoneId: 'thornpeak_heights',
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
            x: 30,
            z: 820,
            lv: 17,
            hp: 140,
            mhp: 140,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughWarfront, 'q_zealots'],
            qlog: [{ questId: 'q_cult_orders', counts: [2, 1], state: 'active' }],
            cds: {},
          },
          ents: [],
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test cult orders route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'hunt_cult_orders',
          objectiveLabel: 'Recovering Wyrmcult Orders',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('records the revenant vanguard objective and emits movement input for the eastern fields', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak_heights',
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
            x: -20,
            z: 830,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughWarfront, 'q_zealots', 'q_cult_orders', 'q_necromancers', 'q_revenants'],
            qlog: [{ questId: 'q_revenant_vanguard', counts: [5], state: 'active' }],
            cds: {},
          },
          ents: [],
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test revenant vanguard route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'hunt_revenant_vanguard',
          objectiveLabel: 'Breaking the revenant vanguard',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('records the Gravewyrm sigil collection objective and emits movement input for the Sanctum approach', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak_heights',
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
            x: 0,
            z: 860,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughLateOutdoors],
            qlog: [{ questId: 'q_wyrm_sigils', counts: [0], state: 'active' }],
            cds: {},
          },
          ents: [],
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test sanctum sigil route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'collect_wyrm_sigils',
          objectiveLabel: 'Recovering Gravewyrm Sigils',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('records the q_voice_below necromancer cleanup objective after the zealot count is complete', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'reserved',
          assignedClusterId: 'thornpeak_heights:1',
          assignedPlayerCharacterId: 1,
          reservationUntilMs: 6_000,
          lastKnownLevel: 18,
          lastKnownZoneId: 'thornpeak_heights',
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
            x: 50,
            z: 850,
            lv: 18,
            hp: 150,
            mhp: 150,
            res: 0,
            mres: 0,
            rtype: 'rage',
            gcd: 0,
            inv: [],
            qdone: [...thornpeakThroughLateOutdoors, 'q_wyrm_sigils', 'q_breaking_the_seal'],
            qlog: [{ questId: 'q_voice_below', counts: [10, 0], state: 'active' }],
            cds: {},
          },
          ents: [],
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
      clusterId: 'thornpeak_heights:1',
      zoneId: 'thornpeak_heights',
      targetCharacterId: 1,
      reason: 'test voice below necromancer route',
    }]);

    await vi.waitFor(() => {
      const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as {
        t?: string;
        mi?: Record<string, number>;
      });
      expect(sent?.some((message) => message.t === 'input' && message.mi?.f === 1)).toBe(true);
    });

    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        runnerState: expect.objectContaining({
          connected: true,
          objective: 'hunt_voice_below_necromancers',
          objectiveLabel: 'Silencing the kneeling necromancers',
        }),
      }),
    ]);

    await runtime.stop();
  });

  it('respects operator controls that pause login actions', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'ready',
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
      webSocketFactory: () => {
        const socket = new FakeSocket(91, { self: { id: 101, x: 4, z: 6, lv: 1 } });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => 5_000,
    });

    await runtime.start();
    runtime.updateControls({ acceptLoginActions: false });
    game.actionHandler?.([{
      type: 'loginBot',
      botId: 'bot-1',
      clusterId: 'eastbrook_vale:1',
      zoneId: 'eastbrook_vale',
      targetCharacterId: 1,
      reason: 'paused login test',
    }]);

    await vi.waitFor(() => {
      expect(runtime.diagnosticsSnapshot()).toEqual(expect.objectContaining({
        controls: expect.objectContaining({
          acceptLoginActions: false,
        }),
        metrics: expect.objectContaining({
          loginSkipped: 1,
        }),
        activeRunners: 0,
      }));
    });
    expect(sockets).toHaveLength(0);

    await runtime.stop();
  });

  it('logs out all active runners for operator incident controls', async () => {
    const game = new FakeGame();
    const sockets: FakeSocket[] = [];
    const saved: AmbientPlayerBotRecord[] = [];
    const db = {
      listBots: vi.fn(async () => [
        bot({
          authTokenExpiresAtMs: 200_000,
          lifecycleStatus: 'ready',
          assignedClusterId: 'eastbrook_vale:1',
          assignedPlayerCharacterId: 1,
        }),
        bot({
          botId: 'bot-2',
          accountId: 12,
          characterId: 102,
          characterName: 'Branorabb',
          profileId: 'eastbrook_vale_mage_newcomer',
          class: 'mage',
          lifecycleStatus: 'ready',
          assignedClusterId: null,
          assignedPlayerCharacterId: null,
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
      webSocketFactory: () => {
        const socket = new FakeSocket(91, { self: { id: 101, x: 4, z: 6, lv: 1 } });
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
      reason: 'operator logout drill',
    }]);

    await vi.waitFor(() => {
      expect(runtime.diagnosticsSnapshot().activeRunners).toBe(1);
      expect(game.ambientPlayerBotDirectory()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          botId: 'bot-1',
          lifecycleStatus: 'online',
        }),
      ]));
    });

    const result = await runtime.logoutAll('operator drill');

    expect(result).toEqual({
      disconnectedRunners: 1,
      resetRecords: 1,
      atMs: 5_000,
    });
    expect(runtime.diagnosticsSnapshot()).toEqual(expect.objectContaining({
      activeRunners: 0,
      metrics: expect.objectContaining({
        logoutAllRequests: 1,
      }),
    }));
    expect(game.ambientPlayerBotDirectory()).toEqual([
      expect.objectContaining({
        lifecycleStatus: 'ready',
        assignedClusterId: null,
        assignedPlayerCharacterId: null,
        lastRunnerError: 'operator drill',
      }),
      expect.objectContaining({
        botId: 'bot-2',
        lifecycleStatus: 'ready',
        assignedClusterId: null,
        assignedPlayerCharacterId: null,
        lastRunnerError: '',
      }),
    ]);
    expect(saved.filter((record) => record.lastRunnerError === 'operator drill')).toHaveLength(1);
    expect(sockets).toHaveLength(1);

    await runtime.stop();
  });

  it('applies llm plan summaries and llm whisper replies without breaking the runtime fallback path', async () => {
    let nowMs = 5_000;
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
          profileId: 'eastbrook_vale_paladin_quester',
          class: 'paladin',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async ({ promptText }) => {
        const context = extractPromptContext(promptText);
        const botRef = readRecord(context, 'botRef');
        if (promptText.includes('AmbientBotPlanDecisionV1')) {
          return {
            value: {
              schemaVersion: 1,
              jobId: readString(context, 'jobId'),
              botRef,
              ttlMs: 120_000,
              confidence: 0.9,
              socialMode: 'friendly',
              focusLabel: 'Wolves at the Door',
              selfSummary: 'helping with the wolf quest route',
              friendPolicy: 'ifAsked',
              allowPresenceEmote: true,
              audit: {
                shortReason: 'starter helper plan',
                safetyNotes: ['boundedPlan'],
              },
            },
            promptText,
            rawOutput: '{"kind":"plan"}',
            providerTimings: { provider: 'test-provider', totalMs: 12, steps: [] },
          };
        }
        return {
          value: {
            schemaVersion: 1,
            jobId: readString(context, 'jobId'),
            botRef,
            targetName: readString(readRecord(context, 'whisper'), 'fromName'),
            ttlMs: 30_000,
            confidence: 0.88,
            replyText: 'running the wolf quest route right now',
            friendAction: 'none',
            presenceEmote: 'none',
            memoryTags: ['quest'],
            audit: {
              shortReason: 'quest reply',
              usedPlayerInput: true,
              safetyNotes: ['boundedReply'],
            },
          },
          promptText,
          rawOutput: '{"kind":"social"}',
          providerTimings: { provider: 'test-provider', totalMs: 18, steps: [] },
        };
      }),
    };
    const llmCoordinator = new AmbientPlayerBotLlmCoordinator({
      config: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 20,
        maxCallsWeek: 40,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
      provider,
    });
    const runtime = new AmbientPlayerBotRuntime({
      game,
      db,
      apiClient: {
        register: vi.fn(),
        login: vi.fn(),
        createCharacter: vi.fn(),
      },
      wsBaseUrl: 'ws://ambient.test',
      llmCoordinator,
      llmConfig: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 20,
        maxCallsWeek: 40,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
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
            rtype: 'mana',
            gcd: 0,
            inv: [],
            qlog: [],
            qdone: [],
            cds: {},
          },
          ents: [
            { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
            { id: 201, k: 'player', nm: 'Aleph', x: 8, z: 6 },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => nowMs,
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
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          runnerState: expect.objectContaining({
            llmPlanMode: 'friendly',
            llmPlanFocus: 'Wolves at the Door',
          }),
        }),
      ]);
    });

    sockets[0]?.emitJson({
      t: 'social',
      friends: [],
      blocks: [],
      guild: null,
    });
    sockets[0]?.emitJson({
      t: 'events',
      list: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey, what are you doing?',
        channel: 'whisper',
        pid: 101,
      }],
    });
    await vi.waitFor(() => {
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          socialState: expect.objectContaining({
            contacts: expect.objectContaining({
              Aleph: expect.objectContaining({
                whispersReceived: 1,
                whispersSent: 0,
              }),
            }),
          }),
          runnerState: expect.objectContaining({
            socialPendingReplies: 1,
            lastWhisperFrom: 'Aleph',
            llmSocialStatus: 'accepted',
          }),
        }),
      ]);
    });

    nowMs = 12_000;
    await vi.waitFor(() => {
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          socialState: expect.objectContaining({
            contacts: expect.objectContaining({
              Aleph: expect.objectContaining({
                whispersSent: 1,
              }),
            }),
          }),
          runnerState: expect.objectContaining({
            socialPendingReplies: 0,
            lastSocialAction: 'reply:Aleph',
          }),
        }),
      ]);
    });
    const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; text?: string });
    expect(sent?.some((message) =>
      message.t === 'cmd'
      && message.cmd === 'chat'
      && message.text === '/w Aleph running the wolf quest route right now',
    )).toBe(true);

    await runtime.stop();
  });

  it('falls back to the heuristic whisper reply when llm social output is rejected', async () => {
    let nowMs = 5_000;
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
          profileId: 'eastbrook_vale_paladin_quester',
          class: 'paladin',
        }),
      ]),
      saveBot: vi.fn(async () => {}),
    };
    const provider: AmbientBotLlmProvider = {
      decide: vi.fn(async ({ promptText }) => {
        const context = extractPromptContext(promptText);
        const botRef = readRecord(context, 'botRef');
        if (promptText.includes('AmbientBotPlanDecisionV1')) {
          return {
            value: {
              schemaVersion: 1,
              jobId: readString(context, 'jobId'),
              botRef,
              ttlMs: 120_000,
              confidence: 0.9,
              socialMode: 'friendly',
              focusLabel: 'Wolves at the Door',
              selfSummary: 'helping with the wolf quest route',
              friendPolicy: 'ifAsked',
              allowPresenceEmote: true,
              audit: {
                shortReason: 'starter helper plan',
                safetyNotes: ['boundedPlan'],
              },
            },
            promptText,
            rawOutput: '{"kind":"plan"}',
            providerTimings: { provider: 'test-provider', totalMs: 12, steps: [] },
          };
        }
        return {
          value: {
            schemaVersion: 1,
            jobId: readString(context, 'jobId'),
            botRef,
            targetName: readString(readRecord(context, 'whisper'), 'fromName'),
            ttlMs: 30_000,
            confidence: 0.88,
            replyText: 'I am a bot running from a prompt right now.',
            friendAction: 'none',
            presenceEmote: 'none',
            memoryTags: ['quest'],
            audit: {
              shortReason: 'bad meta reply',
              usedPlayerInput: true,
              safetyNotes: ['badReply'],
            },
          },
          promptText,
          rawOutput: '{"kind":"social"}',
          providerTimings: { provider: 'test-provider', totalMs: 18, steps: [] },
        };
      }),
    };
    const llmCoordinator = new AmbientPlayerBotLlmCoordinator({
      config: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 20,
        maxCallsWeek: 40,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
      provider,
    });
    const runtime = new AmbientPlayerBotRuntime({
      game,
      db,
      apiClient: {
        register: vi.fn(),
        login: vi.fn(),
        createCharacter: vi.fn(),
      },
      wsBaseUrl: 'ws://ambient.test',
      llmCoordinator,
      llmConfig: {
        enabled: true,
        planCooldownMs: 120_000,
        socialCooldownMs: 45_000,
        maxCalls5h: 20,
        maxCallsWeek: 40,
        cacheMaxEntries: 32,
        cacheMaxTtlMs: 300_000,
      },
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
            rtype: 'mana',
            gcd: 0,
            inv: [],
            qlog: [],
            qdone: [],
            cds: {},
          },
          ents: [
            { id: 7001, k: 'npc', tid: 'marshal_redbrook', x: 4, z: 6 },
            { id: 201, k: 'player', nm: 'Aleph', x: 8, z: 6 },
          ],
        });
        sockets.push(socket);
        return socket;
      },
      nowMs: () => nowMs,
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
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          runnerState: expect.objectContaining({
            llmPlanMode: 'friendly',
            llmPlanFocus: 'Wolves at the Door',
          }),
        }),
      ]);
    });

    sockets[0]?.emitJson({
      t: 'social',
      friends: [],
      blocks: [],
      guild: null,
    });
    sockets[0]?.emitJson({
      t: 'events',
      list: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey, what are you doing?',
        channel: 'whisper',
        pid: 101,
      }],
    });
    await vi.waitFor(() => {
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          socialState: expect.objectContaining({
            contacts: expect.objectContaining({
              Aleph: expect.objectContaining({
                whispersReceived: 1,
                whispersSent: 0,
              }),
            }),
          }),
          runnerState: expect.objectContaining({
            socialPendingReplies: 1,
            lastWhisperFrom: 'Aleph',
            llmSocialStatus: 'rejected',
          }),
        }),
      ]);
    });

    nowMs = 12_000;
    await vi.waitFor(() => {
      expect(game.ambientPlayerBotDirectory()).toEqual([
        expect.objectContaining({
          socialState: expect.objectContaining({
            contacts: expect.objectContaining({
              Aleph: expect.objectContaining({
                whispersSent: 1,
              }),
            }),
          }),
          runnerState: expect.objectContaining({
            socialPendingReplies: 0,
            lastSocialAction: 'reply:Aleph',
            llmSocialStatus: 'rejected',
          }),
        }),
      ]);
    });
    const sent = sockets[0]?.sent.map((message) => JSON.parse(message) as { t?: string; cmd?: string; text?: string });
    expect(sent?.some((message) =>
      message.t === 'cmd'
      && message.cmd === 'chat'
      && message.text === '/w Aleph hey there',
    )).toBe(true);

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

function extractPromptContext(promptText: string): Record<string, unknown> {
  const marker = 'Compact job JSON:\n';
  const start = promptText.indexOf(marker);
  if (start < 0) throw new Error('missing prompt context marker');
  const after = promptText.slice(start + marker.length);
  const end = after.indexOf('\n\nReturn only JSON.');
  const jsonText = end >= 0 ? after.slice(0, end) : after;
  return JSON.parse(jsonText) as Record<string, unknown>;
}

function readRecord(source: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = source[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`missing record ${key}`);
  }
  return value as Record<string, unknown>;
}

function readString(source: Record<string, unknown>, key: string): string {
  const value = source[key];
  if (typeof value !== 'string') throw new Error(`missing string ${key}`);
  return value;
}
