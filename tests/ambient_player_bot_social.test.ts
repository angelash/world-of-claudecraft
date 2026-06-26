import { describe, expect, it } from 'vitest';
import {
  createAmbientPlayerBotSocialRuntimeState,
  tickAmbientPlayerBotSocialShell,
} from '../server/ambient_bots/social';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import type { SimEvent } from '../src/sim/types';

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
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 7 },
    preferredZoneIds: ['eastbrook_vale'],
    lastKnownZoneId: 'eastbrook_vale',
    lastKnownLevel: 3,
    lastKnownX: 0,
    lastKnownZ: 0,
    assignedClusterId: 'eastbrook_vale:1',
    assignedPlayerCharacterId: 1,
    cooldownUntilMs: null,
    reservationUntilMs: null,
    lastRunnerError: '',
    lastRunnerAtMs: null,
    plannerState: {},
    runnerState: { objectiveLabel: 'Wolves at the Door' },
    socialState: {},
    ...overrides,
  };
}

function liveState(input: {
  selfX?: number;
  selfZ?: number;
  entities?: Array<Record<string, unknown>>;
  social?: AmbientPlayerBotLiveState['social'];
} = {}): AmbientPlayerBotLiveState {
  const self = {
    id: 101,
    x: input.selfX ?? 0,
    z: input.selfZ ?? 0,
    lv: 3,
  };
  const entities = new Map<number, Record<string, unknown>>([
    [101, self],
    ...((input.entities ?? []).map((entity) => [Number(entity.id), entity] as const)),
  ]);
  return {
    pid: 101,
    seed: 20_061,
    self,
    entities,
    social: input.social ?? null,
  };
}

describe('ambient player bot social shell', () => {
  it('greets nearby humans with a presence emote on cooldown', () => {
    const state = createAmbientPlayerBotSocialRuntimeState();
    const first = tickAmbientPlayerBotSocialShell({
      bot: bot(),
      liveState: liveState({
        entities: [{ id: 201, k: 'player', nm: 'Aleph', x: 8, z: 6 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa']),
      nowMs: 1_000,
    }, state);

    expect(first.commands).toEqual([{ type: 'chat', text: '/cheer Aleph' }]);

    const second = tickAmbientPlayerBotSocialShell({
      bot: bot({ socialState: first.socialState }),
      liveState: liveState({
        entities: [{ id: 201, k: 'player', nm: 'Aleph', x: 8, z: 6 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa']),
      nowMs: 20_000,
    }, state);

    expect(second.commands).toEqual([]);
  });

  it('sends a friend add first, then a delayed whisper reply, and records relationship memory', () => {
    const state = createAmbientPlayerBotSocialRuntimeState();
    const incoming: SimEvent = {
      type: 'chat',
      fromPid: 201,
      from: 'Aleph',
      text: 'hey, what are you doing?',
      channel: 'whisper',
      pid: 101,
    };

    const first = tickAmbientPlayerBotSocialShell({
      bot: bot(),
      liveState: liveState(),
      recentEvents: [incoming],
      ambientBotNames: new Set(['Branoraaa']),
      nowMs: 5_000,
    }, state);

    expect(first.commands).toContainEqual({ type: 'friendAdd', name: 'Aleph' });
    expect(state.pendingReplies).toHaveLength(1);
    expect(first.socialState).toEqual(expect.objectContaining({
      contacts: expect.objectContaining({
        Aleph: expect.objectContaining({
          whispersReceived: 1,
          outgoingFriendAtMs: 5_000,
        }),
      }),
    }));

    const second = tickAmbientPlayerBotSocialShell({
      bot: bot({ socialState: first.socialState }),
      liveState: liveState(),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa']),
      nowMs: 12_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/w Aleph /),
      }),
    ]);
    expect(state.pendingReplies).toHaveLength(0);
    expect(second.socialState).toEqual(expect.objectContaining({
      contacts: expect.objectContaining({
        Aleph: expect.objectContaining({
          whispersReceived: 1,
          whispersSent: 1,
          lastReplyAtMs: 12_000,
        }),
      }),
    }));
  });

  it('does not respond to blocked whisper senders', () => {
    const state = createAmbientPlayerBotSocialRuntimeState();
    const result = tickAmbientPlayerBotSocialShell({
      bot: bot(),
      liveState: liveState({
        social: {
          friends: [],
          blocks: [{ id: 201, name: 'Aleph' }],
          guild: null,
        },
      }),
      recentEvents: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'hey there',
        channel: 'whisper',
        pid: 101,
      }],
      ambientBotNames: new Set(['Branoraaa']),
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([]);
    expect(state.pendingReplies).toHaveLength(0);
    expect(result.socialState).toEqual(expect.objectContaining({
      blockNames: ['Aleph'],
      contacts: expect.objectContaining({
        Aleph: expect.objectContaining({
          whispersReceived: 1,
          whispersSent: 0,
        }),
      }),
    }));
  });
});
