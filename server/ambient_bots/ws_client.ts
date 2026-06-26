import type { SimEvent } from '../../src/sim/types';
import WebSocket from 'ws';

const DELTA_SELF_KEYS = [
  'inv',
  'buyback',
  'equip',
  'cosmetics',
  'qlog',
  'qdone',
  'lockouts',
  'milestones',
  'cds',
  'stats',
  'weapon',
  'party',
  'marks',
  'trade',
  'duel',
  'arena',
  'market',
  'lroll',
  'drun',
  'dcompanion',
  'dmarks',
  'dcomp',
  'dclears',
  'delveDaily',
  'tal',
];
const ENTITY_IDENTITY_KEYS = ['k', 'tid', 'nm', 'lv', 'sc', 'c', 'dgn'];

export interface AmbientPlayerBotWireSelf {
  id: number;
  x: number;
  z: number;
  lv?: number;
  [key: string]: unknown;
}

export type AmbientPlayerBotPresenceStatus = 'online' | 'combat' | 'dungeon' | 'dead';

export interface AmbientPlayerBotFriendInfo {
  id: number;
  name: string;
  cls: string;
  level: number;
  realm: string;
  online: boolean;
  zone?: string;
  status?: AmbientPlayerBotPresenceStatus;
  x?: number;
  z?: number;
}

export interface AmbientPlayerBotBlockInfo {
  id: number;
  name: string;
}

export interface AmbientPlayerBotGuildInfo {
  id: number;
  name: string;
  rank: string;
  members: AmbientPlayerBotFriendInfo[];
}

export interface AmbientPlayerBotSocialInfo {
  friends: AmbientPlayerBotFriendInfo[];
  blocks: AmbientPlayerBotBlockInfo[];
  guild: AmbientPlayerBotGuildInfo | null;
}

export interface AmbientPlayerBotLiveState {
  pid: number;
  seed: number | null;
  self: AmbientPlayerBotWireSelf | null;
  entities: Map<number, Record<string, unknown>>;
  social?: AmbientPlayerBotSocialInfo | null;
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
  private seed: number | null = null;
  private self: AmbientPlayerBotWireSelf | null = null;
  private entities = new Map<number, Record<string, unknown>>();
  private social: AmbientPlayerBotSocialInfo | null = null;
  private eventQueue: SimEvent[] = [];

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
          this.seed = typeof msg.seed === 'number' && Number.isFinite(msg.seed) ? msg.seed : null;
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
        if (msg.t === 'events') {
          this.eventQueue.push(...normalizeEventList(msg.list));
          return;
        }
        if (msg.t === 'social') {
          this.social = normalizeSocialInfo(msg);
          return;
        }
        if (msg.t === 'socialpos') {
          this.social = mergeSocialPositions(this.social, msg.list);
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
      seed: this.seed,
      self: this.self ? { ...this.self } : null,
      entities: new Map(this.entities),
      social: cloneSocialInfo(this.social),
    };
  }

  drainEvents(): SimEvent[] {
    const drained = this.eventQueue;
    this.eventQueue = [];
    return drained.map((event) => ({ ...event }));
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

function normalizeEventList(value: unknown): SimEvent[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is SimEvent => !!entry && typeof entry === 'object');
}

function normalizeSocialInfo(value: Record<string, unknown>): AmbientPlayerBotSocialInfo {
  return {
    friends: normalizeFriendList(value.friends),
    blocks: normalizeBlockList(value.blocks),
    guild: normalizeGuild(value.guild),
  };
}

function normalizeFriendList(value: unknown): AmbientPlayerBotFriendInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeFriend(entry))
    .filter((entry): entry is AmbientPlayerBotFriendInfo => entry !== null);
}

function normalizeFriend(value: unknown): AmbientPlayerBotFriendInfo | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = finiteNumber(row.id);
  const name = typeof row.name === 'string' ? row.name : '';
  const cls = typeof row.cls === 'string' ? row.cls : '';
  const level = finiteNumber(row.level);
  const realm = typeof row.realm === 'string' ? row.realm : '';
  const online = typeof row.online === 'boolean' ? row.online : false;
  if (id === null || !name || !cls || level === null || !realm) return null;
  return {
    id,
    name,
    cls,
    level,
    realm,
    online,
    ...(typeof row.zone === 'string' ? { zone: row.zone } : {}),
    ...(presenceStatusValue(row.status) ? { status: row.status as AmbientPlayerBotPresenceStatus } : {}),
    ...(finiteNumber(row.x) !== null ? { x: finiteNumber(row.x) as number } : {}),
    ...(finiteNumber(row.z) !== null ? { z: finiteNumber(row.z) as number } : {}),
  };
}

function normalizeBlockList(value: unknown): AmbientPlayerBotBlockInfo[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => normalizeBlock(entry))
    .filter((entry): entry is AmbientPlayerBotBlockInfo => entry !== null);
}

function normalizeBlock(value: unknown): AmbientPlayerBotBlockInfo | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = finiteNumber(row.id);
  const name = typeof row.name === 'string' ? row.name : '';
  if (id === null || !name) return null;
  return { id, name };
}

function normalizeGuild(value: unknown): AmbientPlayerBotGuildInfo | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const id = finiteNumber(row.id);
  const name = typeof row.name === 'string' ? row.name : '';
  const rank = typeof row.rank === 'string' ? row.rank : '';
  const members = normalizeFriendList(row.members);
  if (id === null || !name || !rank) return null;
  return { id, name, rank, members };
}

function mergeSocialPositions(
  current: AmbientPlayerBotSocialInfo | null,
  value: unknown,
): AmbientPlayerBotSocialInfo | null {
  if (!current || !Array.isArray(value)) return current;
  const byId = new Map<number, {
    x?: number;
    z?: number;
    zone?: string;
    status?: AmbientPlayerBotPresenceStatus;
  }>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') continue;
    const row = entry as Record<string, unknown>;
    const id = finiteNumber(row.id);
    if (id === null) continue;
    byId.set(id, {
      ...(finiteNumber(row.x) !== null ? { x: finiteNumber(row.x) as number } : {}),
      ...(finiteNumber(row.z) !== null ? { z: finiteNumber(row.z) as number } : {}),
      ...(typeof row.zone === 'string' ? { zone: row.zone } : {}),
      ...(presenceStatusValue(row.status) ? { status: row.status as AmbientPlayerBotPresenceStatus } : {}),
    });
  }
  const apply = (friends: AmbientPlayerBotFriendInfo[]) => friends.map((friend) => {
    const update = byId.get(friend.id);
    if (!update) return friend;
    return {
      ...friend,
      ...update,
      online: true,
    };
  });
  return {
    friends: apply(current.friends),
    blocks: current.blocks.map((block) => ({ ...block })),
    guild: current.guild
      ? {
        ...current.guild,
        members: apply(current.guild.members),
      }
      : null,
  };
}

function cloneSocialInfo(value: AmbientPlayerBotSocialInfo | null): AmbientPlayerBotSocialInfo | null {
  if (!value) return null;
  return {
    friends: value.friends.map((friend) => ({ ...friend })),
    blocks: value.blocks.map((block) => ({ ...block })),
    guild: value.guild
      ? {
        ...value.guild,
        members: value.guild.members.map((member) => ({ ...member })),
      }
      : null,
  };
}

function presenceStatusValue(value: unknown): value is AmbientPlayerBotPresenceStatus {
  return value === 'online' || value === 'combat' || value === 'dungeon' || value === 'dead';
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
