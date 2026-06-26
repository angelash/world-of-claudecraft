import type { PlayerClass } from '../../src/sim/types';

export interface AmbientPlayerBotApiClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

export interface AmbientRegisterResult {
  token: string;
  username: string;
}

export interface AmbientLoginResult {
  token: string;
  username: string;
}

export interface AmbientCreateCharacterResult {
  id: number;
  name: string;
  class: PlayerClass;
  level: number;
  forceRename: boolean;
}

export interface AmbientPlayerBotApi {
  register(username: string, password: string): Promise<AmbientRegisterResult>;
  login(username: string, password: string): Promise<AmbientLoginResult>;
  createCharacter(
    token: string,
    name: string,
    cls: PlayerClass,
  ): Promise<AmbientCreateCharacterResult>;
}

export class AmbientPlayerBotApiClient implements AmbientPlayerBotApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: AmbientPlayerBotApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async register(username: string, password: string): Promise<AmbientRegisterResult> {
    return this.postJson('/api/register', { username, password });
  }

  async login(username: string, password: string): Promise<AmbientLoginResult> {
    return this.postJson('/api/login', { username, password });
  }

  async createCharacter(
    token: string,
    name: string,
    cls: PlayerClass,
  ): Promise<AmbientCreateCharacterResult> {
    return this.postJson(
      '/api/characters',
      { name, class: cls },
      token,
    );
  }

  private async postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const message = typeof payload?.error === 'string' ? payload.error : `${path} failed with ${res.status}`;
      throw new Error(message);
    }
    return payload as T;
  }
}
