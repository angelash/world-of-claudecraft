import { describe, expect, it } from 'vitest';
import {
  AmbientPlayerBotWsClient,
  mergeEntities,
  mergeSelf,
  type AmbientPlayerBotSocket,
} from '../server/ambient_bots/ws_client';

class FakeSocket implements AmbientPlayerBotSocket {
  readyState = 1;
  readonly sent: string[] = [];
  private readonly openListeners: Array<() => void> = [];
  private readonly messageListeners: Array<(data: unknown) => void> = [];
  private readonly errorListeners: Array<(error: Error) => void> = [];
  private readonly closeListeners: Array<(code?: number, reason?: Buffer) => void> = [];

  constructor() {
    queueMicrotask(() => this.emitOpen());
  }

  send(data: string): void {
    this.sent.push(data);
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

  emitJson(payload: unknown): void {
    const text = JSON.stringify(payload);
    for (const listener of this.messageListeners) listener(text);
  }

  private emitOpen(): void {
    for (const listener of this.openListeners) listener();
  }

  private emitClose(code?: number, reason?: Buffer): void {
    for (const listener of this.closeListeners) listener(code, reason);
  }
}

describe('ambient player bot ws client helpers', () => {
  it('preserves delta self fields that the server omits from later snapshots', () => {
    const merged = mergeSelf(
      {
        id: 1,
        x: 0,
        z: 0,
        inv: ['axe'],
        qlog: [{ questId: 'q_wolves', counts: [2], state: 'active' }],
        tal: { alloc: { spec: null, ranks: {}, choices: {} } },
        stats: { hp: 10 },
      },
      { id: 1, x: 5, z: 7 },
    );

    expect(merged).toEqual({
      id: 1,
      x: 5,
      z: 7,
      inv: ['axe'],
      qlog: [{ questId: 'q_wolves', counts: [2], state: 'active' }],
      tal: { alloc: { spec: null, ranks: {}, choices: {} } },
      stats: { hp: 10 },
    });
  });

  it('preserves entity identity fields and keep-list entries across delta snapshots', () => {
    const previous = new Map<number, Record<string, unknown>>([
      [5, { id: 5, k: 'player', nm: 'Alice', lv: 2, c: 'warrior' }],
      [8, { id: 8, nm: 'QuestGiver', k: 'npc' }],
    ]);

    const next = mergeEntities(previous, {
      ents: [{ id: 5, x: 10, z: 12 }],
      keep: [8],
    });

    expect(next.get(5)).toEqual({
      id: 5,
      k: 'player',
      nm: 'Alice',
      lv: 2,
      c: 'warrior',
      x: 10,
      z: 12,
    });
    expect(next.get(8)).toEqual({ id: 8, nm: 'QuestGiver', k: 'npc' });
  });

  it('tracks social snapshots, social position deltas, and queued events from the live ws stream', async () => {
    let socket: FakeSocket | null = null;
    const client = new AmbientPlayerBotWsClient({
      wsBaseUrl: 'ws://ambient.test',
      webSocketFactory: () => {
        socket = new FakeSocket();
        return socket;
      },
    });

    const connectPromise = client.connect({ token: 'token-1', characterId: 101, timeoutMs: 1_000 });
    await Promise.resolve();
    socket?.emitJson({ t: 'hello', pid: 91, seed: 20_061 });
    socket?.emitJson({
      t: 'snap',
      self: { id: 101, x: 4, z: 6, lv: 2 },
      ents: [{ id: 201, k: 'player', nm: 'Aleph', x: 7, z: 8 }],
      keep: [],
    });
    socket?.emitJson({
      t: 'social',
      friends: [{ id: 11, name: 'Aleph', cls: 'warrior', level: 2, realm: 'eastbrook', online: false }],
      blocks: [{ id: 12, name: 'Bet' }],
      guild: null,
    });
    socket?.emitJson({
      t: 'socialpos',
      list: [{ id: 11, x: 44, z: 55, zone: 'Eastbrook Vale', status: 'combat' }],
    });
    socket?.emitJson({
      t: 'events',
      list: [{ type: 'chat', fromPid: 201, from: 'Aleph', text: 'hello there', channel: 'whisper', pid: 101 }],
    });
    await connectPromise;

    expect(client.state()).toEqual(expect.objectContaining({
      pid: 91,
      seed: 20_061,
      social: expect.objectContaining({
        friends: [expect.objectContaining({
          name: 'Aleph',
          online: true,
          x: 44,
          z: 55,
          zone: 'Eastbrook Vale',
          status: 'combat',
        })],
        blocks: [{ id: 12, name: 'Bet' }],
      }),
    }));
    expect(client.drainEvents()).toEqual([
      expect.objectContaining({
        type: 'chat',
        from: 'Aleph',
        text: 'hello there',
        channel: 'whisper',
      }),
    ]);
    expect(client.drainEvents()).toEqual([]);
  });
});
