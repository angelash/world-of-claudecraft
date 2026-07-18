import { describe, expect, it } from 'vitest';
import { AmbientPlayerBotApiClient } from '../server/ambient_bots/api_client';

describe('AmbientPlayerBotApiClient', () => {
  it('includes a deterministic internal email when registering a bot account', async () => {
    let requestedUrl: string | URL | Request | undefined;
    let requestedInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = input;
      requestedInit = init;
      return new Response(JSON.stringify({ token: 'bot-token', username: 'ambient_tank' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const client = new AmbientPlayerBotApiClient({
      baseUrl: 'http://127.0.0.1:8787/',
      fetchImpl,
    });

    await expect(client.register('ambient_tank', 'hunter22')).resolves.toEqual({
      token: 'bot-token',
      username: 'ambient_tank',
    });
    expect(requestedUrl).toBe('http://127.0.0.1:8787/api/register');
    expect(JSON.parse(String(requestedInit?.body))).toEqual({
      username: 'ambient_tank',
      password: 'hunter22',
      email: 'ambient_tank@ambient.invalid',
    });
  });
});
