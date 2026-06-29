import { describe, expect, it } from 'vitest';
import {
  createAmbientPlayerBotPartyChatRuntimeState,
  tickAmbientPlayerBotPartyChatShell,
} from '../server/ambient_bots/party_chat';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';
import type { PartyInfo } from '../src/world_api';

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
    runnerState: {},
    socialState: {},
    ...overrides,
  };
}

function liveState(input: {
  selfId?: number;
  selfName?: string;
  party: PartyInfo;
  entities?: Array<Record<string, unknown>>;
}): AmbientPlayerBotLiveState {
  const self = {
    id: input.selfId ?? 101,
    nm: input.selfName ?? 'Branoraaa',
    x: 0,
    z: 0,
    lv: 3,
    party: input.party,
  };
  const entities = new Map<number, Record<string, unknown>>([
    [self.id, self],
    ...((input.entities ?? []).map((entity) => [Number(entity.id), entity] as const)),
  ]);
  return {
    pid: self.id,
    seed: 20_061,
    self,
    entities,
    social: null,
  };
}

describe('ambient player bot party chat shell', () => {
  it('queues and sends one leader briefing for an ambient-led party', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 1, z: 1, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const first = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 5_000,
    }, state);

    expect(first.commands).toEqual([]);
    expect(state.pendingUtterances).toHaveLength(1);
    expect(first.runnerStatePatch).toEqual(expect.objectContaining({
      partyRole: 'tank',
      partyTankName: 'Branoraaa',
      partyHealerName: 'Branorabb',
    }));

    const second = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 7_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/p /),
      }),
    ]);
    expect(state.pendingUtterances).toHaveLength(0);

    const third = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 9_000,
    }, state);

    expect(third.commands).toEqual([]);
  });

  it('turns a spread group into correction intent and a direct regroup call', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 42, z: 0, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const first = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 42, z: 0 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'hold_regroup',
      nowMs: 5_000,
    }, state);

    expect(first.runnerStatePatch).toEqual(expect.objectContaining({
      partyIntentKind: 'correction',
      partyIntentBehavior: 'regroup',
      partyIntentHoldAdvance: true,
    }));
    expect(first.commands).toEqual([]);

    const second = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 42, z: 0 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'hold_regroup',
      nowMs: 7_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/p (Too spread|Tighten up|Slow down)/),
      }),
    ]);
  });

  it('turns recent quest progress into praise intent and a quick morale call', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 1, z: 1, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const first = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [{ type: 'questReady', questId: 'q_wolves' }],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 5_000,
    }, state);

    expect(first.runnerStatePatch).toEqual(expect.objectContaining({
      partyIntentKind: 'praise',
      partyIntentBehavior: 'celebrate',
      partyIntentPreferAssist: false,
    }));

    const second = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        party,
        entities: [{ id: 102, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [{ type: 'questReady', questId: 'q_wolves' }],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 7_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/p (Nice work|Good pull|That was clean)/),
      }),
    ]);
  });

  it('queues and sends one member acknowledgement after the ambient leader speaks in party chat', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 101,
      raid: false,
      members: [
        { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 102, name: 'Branorabb', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 1, z: 1, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const first = tickAmbientPlayerBotPartyChatShell({
      bot: bot({
        botId: 'bot-2',
        characterId: 102,
        characterName: 'Branorabb',
        profileId: 'eastbrook_vale_priest_newcomer',
        class: 'priest',
      }),
      liveState: liveState({
        selfId: 102,
        selfName: 'Branorabb',
        party,
        entities: [{ id: 101, nm: 'Branoraaa', k: 'player', x: 0, z: 0 }],
      }),
      recentEvents: [{
        type: 'chat',
        fromPid: 101,
        from: 'Branoraaa',
        text: 'Buff up first, then collapse on one target.',
        channel: 'party',
      }],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 5_000,
    }, state);

    expect(first.commands).toEqual([]);
    expect(state.pendingUtterances).toHaveLength(1);
    expect(first.runnerStatePatch).toEqual(expect.objectContaining({
      partyRole: 'healer',
      partyHealerName: 'Branorabb',
    }));

    const second = tickAmbientPlayerBotPartyChatShell({
      bot: bot({
        botId: 'bot-2',
        characterId: 102,
        characterName: 'Branorabb',
        profileId: 'eastbrook_vale_priest_newcomer',
        class: 'priest',
      }),
      liveState: liveState({
        selfId: 102,
        selfName: 'Branorabb',
        party,
        entities: [{ id: 101, nm: 'Branoraaa', k: 'player', x: 0, z: 0 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 8_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/p /),
      }),
    ]);
    expect(state.pendingUtterances).toHaveLength(0);
  });

  it('uses the live pid when the ambient leader briefs the party before a pull', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 401,
      raid: false,
      members: [
        { pid: 401, name: 'Branoraaa', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 402, name: 'Branorabb', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 1, z: 1, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const first = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        selfId: 401,
        party,
        entities: [{ id: 402, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'prepare_party',
      nowMs: 5_000,
    }, state);

    expect(first.commands).toEqual([]);
    expect(state.pendingUtterances).toHaveLength(1);
    expect(state.pendingUtterances[0]?.briefKey).toContain('|prepare_party');

    const second = tickAmbientPlayerBotPartyChatShell({
      bot: bot(),
      liveState: liveState({
        selfId: 401,
        party,
        entities: [{ id: 402, nm: 'Branorabb', k: 'player', x: 1, z: 1 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa', 'Branorabb']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'prepare_party',
      nowMs: 7_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/p /),
      }),
    ]);
  });

  it('acknowledges a tactical line from a real player leader without taking over party leadership', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 201,
      raid: false,
      members: [
        { pid: 201, name: 'Aleph', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 101, name: 'Branoraaa', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 1, z: 1, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const first = tickAmbientPlayerBotPartyChatShell({
      bot: bot({
        class: 'priest',
        profileId: 'eastbrook_vale_priest_newcomer',
      }),
      liveState: liveState({
        party,
        entities: [{ id: 201, nm: 'Aleph', k: 'player', x: 0, z: 0 }],
      }),
      recentEvents: [{
        type: 'chat',
        fromPid: 201,
        from: 'Aleph',
        text: 'Buff up, stay tight, then burn my target.',
        channel: 'party',
      }],
      ambientBotNames: new Set(['Branoraaa']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 5_000,
    }, state);

    expect(first.commands).toEqual([]);
    expect(state.pendingUtterances).toHaveLength(1);

    const second = tickAmbientPlayerBotPartyChatShell({
      bot: bot({
        class: 'priest',
        profileId: 'eastbrook_vale_priest_newcomer',
      }),
      liveState: liveState({
        party,
        entities: [{ id: 201, nm: 'Aleph', k: 'player', x: 0, z: 0 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 8_000,
    }, state);

    expect(second.commands).toEqual([
      expect.objectContaining({
        type: 'chat',
        text: expect.stringMatching(/^\/p /),
      }),
    ]);
  });

  it('does not auto-brief when a real player leads the party', () => {
    const state = createAmbientPlayerBotPartyChatRuntimeState();
    const party: PartyInfo = {
      leader: 201,
      raid: false,
      members: [
        { pid: 201, name: 'Aleph', cls: 'warrior', level: 3, hp: 40, mhp: 40, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
        { pid: 101, name: 'Branoraaa', cls: 'priest', level: 3, hp: 32, mhp: 32, res: 20, mres: 20, rtype: 'mana', x: 1, z: 1, dead: 0, inCombat: 0, group: 1 },
      ],
    };

    const result = tickAmbientPlayerBotPartyChatShell({
      bot: bot({
        class: 'priest',
        profileId: 'eastbrook_vale_priest_newcomer',
      }),
      liveState: liveState({
        party,
        entities: [{ id: 201, nm: 'Aleph', k: 'player', x: 0, z: 0 }],
      }),
      recentEvents: [],
      ambientBotNames: new Set(['Branoraaa']),
      objectiveId: 'q_wolves',
      objectiveLabel: 'Wolves at the Door',
      groupMode: 'brain',
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([]);
    expect(state.pendingUtterances).toHaveLength(0);
  });
});
