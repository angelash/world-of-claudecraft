import { describe, expect, it } from 'vitest';
import {
  createAmbientPlayerBotGroupRuntimeState,
  tickAmbientPlayerBotGroupCoordinator,
} from '../server/ambient_bots/group';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import type { AmbientPlayerBotLiveState } from '../server/ambient_bots/ws_client';

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
    authTokenExpiresAtMs: 200_000,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 7 },
    preferredZoneIds: ['mirefen_marsh'],
    lastKnownZoneId: 'mirefen_marsh',
    lastKnownLevel: 12,
    lastKnownX: 0,
    lastKnownZ: 0,
    assignedClusterId: 'mirefen_marsh:1',
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
  self: Record<string, unknown>;
  entities?: Array<Record<string, unknown>>;
}): AmbientPlayerBotLiveState {
  const entities = new Map<number, Record<string, unknown>>();
  for (const entity of input.entities ?? []) {
    const id = Number(entity.id ?? NaN);
    if (Number.isFinite(id)) entities.set(id, entity);
  }
  return {
    pid: Number(input.self.id ?? 0),
    seed: 20_061,
    self: input.self as AmbientPlayerBotLiveState['self'],
    entities,
  };
}

describe('ambient player bot group coordinator', () => {
  it('has a trailing Bastion follower use the real /follow chat path and pause the brain drive', () => {
    const leader = bot();
    const follower = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 102,
          x: 1518,
          z: -1200,
          dgn: 'sunken_bastion',
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1518, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
      }),
      recentEvents: [],
      objectiveId: 'hunt_olen',
      objectiveQuestId: 'q_olen',
      objectiveDungeonId: 'sunken_bastion',
      objectiveSuggestedPartySize: 5,
      directory: [leader, follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([
      { cmd: 'chat', text: '/follow Branoraaa' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 18,
    }));
  });

  it('holds the Bastion leader in place while another ambient party member lags far behind', () => {
    const leader = bot();
    const follower = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: leader,
      liveState: liveState({
        self: {
          id: 101,
          x: 1500,
          z: -1200,
          dgn: 'sunken_bastion',
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1528, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
      }),
      recentEvents: [],
      objectiveId: 'hunt_olen',
      objectiveQuestId: 'q_olen',
      objectiveDungeonId: 'sunken_bastion',
      objectiveSuggestedPartySize: 5,
      directory: [leader, follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'hold_regroup',
      groupNeedsRegroup: true,
      groupLaggingMembers: 1,
    }));
  });

  it('waits for the outdoor q_crushers party to assemble before the leader moves on', () => {
    const leader = bot({
      lastKnownLevel: 18,
      lastKnownZoneId: 'thornpeak',
      runnerState: {
        objective: 'hunt_crushers',
        objectiveQuestId: 'q_crushers',
        objectiveSuggestedPartySize: 3,
      },
    });
    const follower = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
      lastKnownLevel: 18,
      lastKnownZoneId: 'thornpeak',
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: leader,
      liveState: liveState({
        self: {
          id: 101,
          x: -120,
          z: 738,
        },
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: -118, z: 739, lv: 18 },
        ],
      }),
      recentEvents: [],
      objectiveId: 'hunt_crushers',
      objectiveQuestId: 'q_crushers',
      objectiveSuggestedPartySize: 3,
      directory: [leader, follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([
      { cmd: 'pinvite', id: 102 },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'wait_party',
      groupAwaitingParty: true,
      groupObjectiveQuestId: 'q_crushers',
      groupObjectiveScope: 'outdoor',
    }));
  });

  it('has a trailing outdoor q_crushers follower use the real /follow chat path and pause the brain drive', () => {
    const leader = bot({
      lastKnownLevel: 18,
      lastKnownZoneId: 'thornpeak',
      runnerState: {
        objective: 'hunt_crushers',
        objectiveQuestId: 'q_crushers',
        objectiveSuggestedPartySize: 3,
      },
    });
    const follower = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
      lastKnownLevel: 18,
      lastKnownZoneId: 'thornpeak',
      runnerState: {
        objective: 'hunt_crushers',
        objectiveQuestId: 'q_crushers',
        objectiveSuggestedPartySize: 3,
      },
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 102,
          x: -107,
          z: 738,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: -125, z: 738, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 18, hp: 120, mhp: 120, res: 180, mres: 180, rtype: 'mana', x: -107, z: 738, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
      }),
      recentEvents: [],
      objectiveId: 'hunt_crushers',
      objectiveQuestId: 'q_crushers',
      objectiveSuggestedPartySize: 3,
      directory: [leader, follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([
      { cmd: 'chat', text: '/follow Branoraaa' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'follow_leader',
      groupObjectiveScope: 'outdoor',
      groupLeaderDistance: 18,
    }));
  });

  it('does not treat a same-cluster bot on a different grouped outdoor quest as a q_crushers party candidate', () => {
    const leader = bot({
      lastKnownLevel: 18,
      lastKnownZoneId: 'thornpeak',
      runnerState: {
        objective: 'hunt_crushers',
        objectiveQuestId: 'q_crushers',
        objectiveSuggestedPartySize: 3,
      },
    });
    const otherQuestPeer = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
      lastKnownLevel: 18,
      lastKnownZoneId: 'thornpeak',
      runnerState: {
        objective: 'hunt_drogmar',
        objectiveQuestId: 'q_drogmar',
        objectiveSuggestedPartySize: 3,
      },
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: leader,
      liveState: liveState({
        self: {
          id: 101,
          x: -120,
          z: 738,
        },
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: -118, z: 739, lv: 18 },
        ],
      }),
      recentEvents: [],
      objectiveId: 'hunt_crushers',
      objectiveQuestId: 'q_crushers',
      objectiveSuggestedPartySize: 3,
      directory: [leader, otherQuestPeer],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([]);
    expect(result.pauseBrainDrive).toBe(false);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'brain',
      groupObjectiveQuestId: 'q_crushers',
      groupObjectiveScope: 'outdoor',
      groupTargetSize: 1,
      groupPartySize: 1,
    }));
  });

  it('accepts a party invite from its assigned player even when the live pid differs from the assigned character id', () => {
    const follower = bot({
      assignedPlayerCharacterId: 1,
      plannerState: {
        assignedPlayerName: 'Realhero',
      },
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 101,
          x: 4,
          z: 6,
        },
      }),
      recentEvents: [{ type: 'partyInvite', fromPid: 201, fromName: 'Realhero' }],
      objectiveId: 'accept_wolves',
      objectiveQuestId: 'q_wolves',
      objectiveSuggestedPartySize: 1,
      directory: [follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([{ cmd: 'paccept' }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'accept_invite',
      groupLeaderName: 'Realhero',
      groupTargetSize: 1,
    }));
  });

  it('declines an unrelated party invite so trusted invites are not blocked', () => {
    const follower = bot();
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 101,
          x: 4,
          z: 6,
        },
      }),
      recentEvents: [{ type: 'partyInvite', fromPid: 900, fromName: 'Stranger' }],
      objectiveId: 'accept_wolves',
      objectiveQuestId: 'q_wolves',
      objectiveSuggestedPartySize: 1,
      directory: [follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([{ cmd: 'pdecline' }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: '',
      groupLeaderName: 'Branoraaa',
    }));
  });

  it('targets a mob attacking another party member before returning to the brain', () => {
    const follower = bot();
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 101,
          x: 0,
          z: 0,
          target: null,
          party: {
            leader: 1,
            raid: false,
            members: [
              { pid: 1, name: 'Realhero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 8, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 100, mhp: 100, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 1 },
        ],
      }),
      recentEvents: [],
      objectiveId: 'hunt_boars',
      objectiveQuestId: 'q_boars',
      objectiveSuggestedPartySize: 1,
      directory: [follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([{ cmd: 'target', id: 501 }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'assist_party',
      groupLeaderName: 'Realhero',
      groupLeaderDistance: 8,
    }));
  });

  it('keeps a nearby ambient follower from breaking the server follow state', () => {
    const leader = bot();
    const follower = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 102,
          x: -123,
          z: 738,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: -125, z: 738, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 18, hp: 120, mhp: 120, res: 180, mres: 180, rtype: 'mana', x: -123, z: 738, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
      }),
      recentEvents: [],
      objectiveId: 'hunt_crushers',
      objectiveQuestId: 'q_crushers',
      objectiveSuggestedPartySize: 3,
      directory: [leader, follower],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'follow_leader',
      groupObjectiveScope: 'outdoor',
      groupLeaderDistance: 2,
    }));
  });

  it('does not wait for more members when a real player is the party leader', () => {
    const follower = bot();
    const peerA = bot({
      botId: 'bot-2',
      accountId: 12,
      characterId: 102,
      characterName: 'Branorabb',
      accountUsername: 'bot_user_2',
      authToken: 'token-2',
      class: 'mage',
    });
    const peerB = bot({
      botId: 'bot-3',
      accountId: 13,
      characterId: 103,
      characterName: 'Branoracc',
      accountUsername: 'bot_user_3',
      authToken: 'token-3',
      class: 'priest',
    });
    const state = createAmbientPlayerBotGroupRuntimeState();
    const result = tickAmbientPlayerBotGroupCoordinator({
      bot: follower,
      liveState: liveState({
        self: {
          id: 101,
          x: 2,
          z: 0,
          party: {
            leader: 1,
            raid: false,
            members: [
              { pid: 1, name: 'Realhero', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 18, hp: 150, mhp: 150, res: 0, mres: 0, rtype: 'rage', x: 2, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        },
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: 3, z: 0, lv: 18 },
          { id: 103, k: 'player', nm: 'Branoracc', x: 4, z: 0, lv: 18 },
        ],
      }),
      recentEvents: [],
      objectiveId: 'hunt_crushers',
      objectiveQuestId: 'q_crushers',
      objectiveSuggestedPartySize: 3,
      directory: [follower, peerA, peerB],
      nowMs: 5_000,
    }, state);

    expect(result.commands).toEqual([]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.runnerStatePatch).toEqual(expect.objectContaining({
      groupMode: 'follow_leader',
      groupLeaderName: 'Realhero',
      groupAwaitingParty: false,
      groupLeaderDistance: 2,
    }));
  });
});
