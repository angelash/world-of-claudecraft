import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
      }),
    } as Response);

    const api = new Api();
    api.base = 'https://realm.example';
    api.token = 'tok-1';

    const result = await api.updateHostedPlaySettings(7, {
      resumeOnLogin: true,
      partyMode: 'follow_leader',
    });
    expect(result).toMatchObject({
      resumeOnLogin: true,
      partyMode: 'follow_leader',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://realm.example/api/characters/7/hosted-play/settings',
      expect.objectContaining({
        method: 'PUT',
        body: JSON.stringify({
          resumeOnLogin: true,
          partyMode: 'follow_leader',
        }),
      }),
    );
  });
});
