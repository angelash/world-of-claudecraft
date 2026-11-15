import { readFileSync } from 'node:fs';
import type * as http from 'node:http';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HOSTED_PLAY_CONTROL_MAX_PER_MINUTE,
  hostedPlayControlRateLimited,
  resetHostedPlayControlRateLimits,
} from '../server/ratelimit';
import { Api } from '../src/net/online';

const MAIN = readFileSync(join(__dirname, '..', 'server', 'main.ts'), 'utf8');

describe('hosted-play route auth', () => {
  it('routes hosted-play owner access through bearerActiveAccount', () => {
    const idx = MAIN.indexOf('if (hostedPlayMatch) {');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(MAIN.slice(idx, idx + 700)).toContain('bearerActiveAccount(req, res)');
  });

  it('routes hosted-play settings owner access through bearerActiveAccount', () => {
    const idx = MAIN.indexOf('if (hostedPlaySettingsMatch) {');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(MAIN.slice(idx, idx + 800)).toContain('bearerActiveAccount(req, res)');
  });

  it('rate-limits provider-backed enable and disable after owner authentication', () => {
    const idx = MAIN.indexOf('if (hostedPlayMatch) {');
    expect(idx).toBeGreaterThanOrEqual(0);
    const route = MAIN.slice(idx, idx + 1_900);
    const auth = route.indexOf('bearerActiveAccount(req, res)');
    const limiter = route.indexOf('hostedPlayControlRateLimited(req, accountId)');
    expect(auth).toBeGreaterThanOrEqual(0);
    expect(limiter).toBeGreaterThan(auth);
    expect(route.match(/hostedPlayControlRateLimited\(req, accountId\)/g)).toHaveLength(2);
  });
});

describe('hosted-play control rate limit', () => {
  const request = (remoteAddress: string) =>
    ({ socket: { remoteAddress }, headers: {} }) as http.IncomingMessage;

  afterEach(() => {
    resetHostedPlayControlRateLimits();
  });

  it('shares one fused account bucket across control requests and IPs', () => {
    for (let attempt = 0; attempt < HOSTED_PLAY_CONTROL_MAX_PER_MINUTE; attempt++) {
      expect(hostedPlayControlRateLimited(request(`198.51.100.${attempt + 1}`), 7).allowed).toBe(
        true,
      );
    }
    expect(hostedPlayControlRateLimited(request('203.0.113.1'), 7).allowed).toBe(false);
    expect(hostedPlayControlRateLimited(request('203.0.113.1'), 8).allowed).toBe(true);
  });
});

describe('Api hosted-play helpers', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(global, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it('fetches hosted-play status for the online character', async () => {
    const status = {
      characterId: 7,
      characterName: 'Hero',
      playerClass: 'warrior',
      online: true,
      enabled: false,
      active: false,
      paused: false,
      mode: 'disabled',
      objectiveId: '',
      objectiveLabel: '',
      pauseReason: '',
      pauseUntilMs: null,
      pauseSecondsRemaining: 0,
      lastError: '',
      lastAutomationAtMs: null,
      resumeOnLogin: false,
      partyMode: 'solo',
      actionLogEnabled: true,
      autoInviteNearbyPlayers: false,
      autoInviteNearbyTargetPartySize: 2,
      groupMode: '',
      groupLeaderName: '',
      groupLeaderDistance: 0,
      socialPendingReplies: 0,
      socialFriends: 0,
      socialBlocks: 0,
      lastWhisperFrom: '',
      lastSocialAction: '',
      llmEnabled: false,
      llmPlanPending: false,
      llmPlanMode: '',
      llmPlanFocus: '',
      llmPlanStatus: '',
      llmPlanReason: '',
      llmSocialStatus: '',
      llmSocialReason: '',
      llmSocialTarget: '',
    };
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => status,
    } as Response);

    const api = new Api();
    api.base = 'https://realm.example';
    api.token = 'tok-1';

    await expect(api.hostedPlayStatus(7)).resolves.toEqual(status);
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://realm.example/api/characters/7/hosted-play',
      expect.objectContaining({
        headers: { Authorization: 'Bearer tok-1' },
      }),
    );
  });

  it('enables hosted play through the owner route', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ enabled: true, online: true, mode: 'active' }),
    } as Response);

    const api = new Api();
    api.base = 'https://realm.example';
    api.token = 'tok-1';

    const result = await api.enableHostedPlay(7);
    expect(result).toMatchObject({ enabled: true, online: true, mode: 'active' });
  });

  it('disables hosted play with a DELETE request', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ enabled: false, online: true, mode: 'disabled' }),
    } as Response);

    const api = new Api();
    api.base = 'https://realm.example';
    api.token = 'tok-1';

    const result = await api.disableHostedPlay(7);
    expect(result).toMatchObject({ enabled: false, online: true, mode: 'disabled' });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://realm.example/api/characters/7/hosted-play',
      expect.objectContaining({
        method: 'DELETE',
      }),
    );
  });

  it('updates hosted-play settings with a PUT request', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        enabled: false,
        online: true,
        mode: 'disabled',
        resumeOnLogin: true,
        partyMode: 'follow_leader',
        actionLogEnabled: false,
        autoInviteNearbyPlayers: true,
        autoInviteNearbyTargetPartySize: 4,
      }),
    } as Response);

    const api = new Api();
    api.base = 'https://realm.example';
    api.token = 'tok-1';

    const result = await api.updateHostedPlaySettings(7, {
      resumeOnLogin: true,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 4,
    });
    expect(result).toMatchObject({
      resumeOnLogin: true,
      partyMode: 'follow_leader',
      actionLogEnabled: false,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 4,
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://realm.example/api/characters/7/hosted-play/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          resumeOnLogin: true,
          partyMode: 'follow_leader',
          actionLogEnabled: false,
          autoInviteNearbyPlayers: true,
          autoInviteNearbyTargetPartySize: 4,
        }),
      }),
    );
  });
});
