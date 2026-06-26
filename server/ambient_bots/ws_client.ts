import WebSocket from 'ws';

const DELTA_SELF_KEYS = ['inv', 'equip', 'qlog', 'qdone', 'cds', 'stats', 'weapon', 'party', 'trade', 'duel'];
const ENTITY_IDENTITY_KEYS = ['k', 'tid', 'nm', 'lv', 'sc', 'c', 'dgn'];

export interface AmbientPlayerBotWireSelf {
  id: number;
  x: number;
  z: number;
  lv?: number;
  [key: string]: unknown;
}

export interface AmbientPlayerBotLiveState {
  pid: number;
  self: AmbientPlayerBotWireSelf | null;
  entities: Map<number, Record<string, unknown>>;
}

export interface AmbientPlayerBotWsClientOptions {
  wsBaseUrl: string;
  webSocketFactory?: (url: string) => AmbientPlayerBotSocket;
  onSnapshot?: (state: AmbientPlayerBotLiveState) => void;
  onClose?: (error?: Error) => void;
}

export interface AmbientPlayerBotSocket {
  readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  on(event: 'open', listener: () => void): this;
  on(event: 'message', listener: (data: unknown) => void): this;
  on(event: 'error', listener: (error: Error) => void): this;
  on(event: 'close', listener: (code?: number, reason?: Buffer) => void): this;
}

export class AmbientPlayerBotWsClient {
  private readonly wsBaseUrl: string;
  private readonly webSocketFactory: (url: string) => AmbientPlayerBotSocket;
  private readonly onSnapshot?: (state: AmbientPlayerBotLiveState) => void;
  private readonly onClose?: (error?: Error) => void;
  private socket: AmbientPlayerBotSocket | null = null;
  private pid = -1;
  private self: AmbientPlayerBotWireSelf | null = null;
  private entities = new Map<number, Record<string, unknown>>();

  constructor(options: AmbientPlayerBotWsClientOptions) {
    this.wsBaseUrl = options.wsBaseUrl.replace(/\/+$/, '');
    this.webSocketFactory = options.webSocketFactory ?? ((url) => new WebSocket(url) as unknown as AmbientPlayerBotSocket);
    this.onSnapshot = options.onSnapshot;
    this.onClose = options.onClose;
  }

  async connect(input: {
    token: string;
    characterId: number;
    clientSeed?: string;
    timeoutMs?: number;
  }): Promise<void> {
    const timeoutMs = input.timeoutMs ?? 10_000;
    await new Promise<void>((resolve, reject) => {
      const ws = this.webSocketFactory(`${this.wsBaseUrl}/ws`);
      this.socket = ws;
      let done = false;
      const finish = (fn: () => void) => {
        if (done) return;
        done = true;
        clearTimeout(timeout);
        fn();
      };
      const timeout = setTimeout(() => finish(() => reject(new Error('ambient bot connect timed out'))), timeoutMs);

      ws.on('open', () => {
        this.sendJson({
          t: 'auth',
          token: input.token,
          character: input.characterId,
          ...(input.clientSeed ? { clientSeed: input.clientSeed } : {}),
        });
      });
      ws.on('message', (data) => {
        let msg: any;
        try {
          msg = JSON.parse(String(data));
        } catch {
          return;
        }
        if (msg.t === 'hello') {
          this.pid = Number(msg.pid ?? -1);
          finish(resolve);
          return;
        }
        if (msg.t === 'snap') {
          this.self = mergeSelf(this.self, msg.self as AmbientPlayerBotWireSelf);
          this.entities = mergeEntities(this.entities, msg);
          if (this.self?.id) this.entities.set(this.self.id, this.self as unknown as Record<string, unknown>);
          this.onSnapshot?.(this.state());
          return;
        }
        if (msg.t === 'error') {
          finish(() => reject(new Error(typeof msg.error === 'string' ? msg.error : 'ambient bot ws error')));
        }
      });
      ws.on('error', (error) => {
        finish(() => reject(error));
        this.onClose?.(error);
      });
      ws.on('close', () => {
        if (!done) finish(() => reject(new Error('ambient bot socket closed before hello')));
        else this.onClose?.();
      });
    });
  }

  state(): AmbientPlayerBotLiveState {
    return {
      pid: this.pid,
      self: this.self ? { ...this.self } : null,
      entities: new Map(this.entities),
    };
  }

  command(payload: Record<string, unknown>): void {
    this.sendJson({ t: 'cmd', ...payload });
  }

  input(mi: Record<string, unknown>, facing?: number): void {
    this.sendJson({ t: 'input', mi, ...(facing !== undefined ? { facing } : {}) });
  }

  close(): void {
    try {
      this.socket?.close();
    } catch {
      /* ignore */
    } finally {
      this.socket = null;
    }
  }

  private sendJson(payload: Record<string, unknown>): void {
    this.socket?.send(JSON.stringify(payload));
  }
}

export function mergeSelf(
  previous: AmbientPlayerBotWireSelf | null,
  next: AmbientPlayerBotWireSelf,
): AmbientPlayerBotWireSelf {
  if (previous) {
    for (const key of DELTA_SELF_KEYS) {
      if (!(key in next)) (next as Record<string, unknown>)[key] = previous[key];
    }
  }
  return next;
}

export function mergeEntities(
  previous: Map<number, Record<string, unknown>>,
  snap: { ents: Array<Record<string, unknown>>; keep?: number[] },
): Map<number, Record<string, unknown>> {
  const next = new Map<number, Record<string, unknown>>();
  for (const wire of snap.ents ?? []) {
    const id = Number(wire.id ?? NaN);
    if (!Number.isFinite(id)) continue;
    const prior = previous.get(id);
    if (prior && wire.k === undefined) {
      for (const key of ENTITY_IDENTITY_KEYS) {
        if (key in prior) wire[key] = prior[key];
      }
    }
    next.set(id, { ...wire });
  }
  for (const id of snap.keep ?? []) {
    const prior = previous.get(id);
    if (prior) next.set(id, { ...prior });
  }
  return next;
}
