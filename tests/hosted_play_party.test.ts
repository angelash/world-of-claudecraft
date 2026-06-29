import { describe, expect, it } from 'vitest';

import {
  createHostedPlayPartyState,
  tickHostedPlayPartyCoordinator,
} from '../server/hosted_play/party';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';

function liveSelf(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 101,
    nm: 'Hero',
    x: 0,
    z: 0,
    lv: 12,
    hp: 100,
    mhp: 100,
    res: 120,
    mres: 120,
    rtype: 'mana',
    target: null,
    gcd: 0,
    cast: null,
    eat: null,
    drk: null,
    inv: [],
    cds: {},
    auras: [],
    party: null,
    ...input,
  };
}

function ambientBot(overrides: Partial<AmbientPlayerBotRecord> = {}): AmbientPlayerBotRecord {
  return {
    botId: 'bot-1',
    accountId: 11,
    accountUsername: 'bot_user',
    accountPassword: 'BotPassword123',
    characterId: 101,
    characterName: 'Branorabb',
    profileId: 'eastbrook_vale_mage_newcomer',
    class: 'mage',
    authToken: 'token-1',
    authTokenExpiresAtMs: 200_000,
    lifecycleStatus: 'online',
    provisionState: 'ready',
    levelBand: { min: 1, max: 60 },
    preferredZoneIds: ['eastbrook_vale'],
    lastKnownZoneId: 'eastbrook_vale',
    lastKnownLevel: 12,
    lastKnownX: 0,
    lastKnownZ: 0,
    assignedClusterId: 'cluster-1',
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

describe('hosted-play party coordinator', () => {
  it('uses the real /follow path when a hosted follower trails the party leader', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 1518,
          z: -1200,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1518, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'chat', text: '/follow Branoraaa' }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 1500, z: -1200 },
        arrivalRange: 4,
        goalKey: 'hosted-follow-leader:101:1500:-1200',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 18,
    });
  });

  it('keeps moving a trailing hosted follower toward the leader while /follow is on cooldown', () => {
    const state = createHostedPlayPartyState();
    state.lastFollowCommandAtMs = 5_000;

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 1538,
          z: -1200,
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
            { id: 'ice_barrier', kind: 'absorb', rem: 50, dur: 60 },
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1538, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 6_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 1500, z: -1200 },
        arrivalRange: 4,
        goalKey: 'hosted-follow-leader:101:1500:-1200',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 38,
    });
  });

  it('has the hosted leader hold position while the party regroups', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 1500,
          z: -1200,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1529, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'hold_regroup',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 0,
    });
  });

  it('does not make the hosted leader hold regroup from stale party roster coordinates when live entities are nearby', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 1500,
          z: -1200,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1529, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: 1502, z: -1200, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', dead: 0, cmb: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 0,
    });
  });

  it('still makes the hosted leader hold regroup when live entity coordinates show a member is lagging', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 1500,
          z: -1200,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1502, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: 1535, z: -1200, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', dead: 0, cmb: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'hold_regroup',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 0,
    });
  });

  it('accepts an incoming party invite while follow-leader mode is enabled', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({ party: null }),
        entities: [],
        recentEvents: [{ type: 'partyInvite', fromPid: 201, fromName: 'Aleph' }],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'paccept' }],
      pauseBrainDrive: true,
      groupMode: 'accept_invite',
      groupLeaderName: 'Aleph',
      groupLeaderDistance: 0,
    });
  });

  it('leaves party invites alone while solo mode is selected', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({ party: null }),
        entities: [],
        recentEvents: [{ type: 'partyInvite', fromPid: 201, fromName: 'Aleph' }],
        playerClass: 'mage',
        partyMode: 'solo',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: '',
      groupLeaderName: '',
      groupLeaderDistance: 0,
    });
  });

  it('targets a hostile mob attacking another party member before resuming the brain', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 8, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'rogue', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'energy', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 101 },
        ],
        recentEvents: [],
        playerClass: 'rogue',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'target', id: 501 }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 7, z: 0 },
        arrivalRange: 4.5,
        goalKey: 'party-target:501:7:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 8,
    });
  });

  it('starts attacking the party focus target instead of only stutter-following when out of mana', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          res: 0,
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 6, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 0, mres: 120, rtype: 'mana', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 20, z: 0, aggro: 101 },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [
        { cmd: 'target', id: 501 },
        { cmd: 'attack' },
      ],
      pauseBrainDrive: true,
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 6,
    });
  });

  it('has a hosted warrior taunt off the healer before switching stance', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          res: 20,
          mres: 100,
          rtype: 'rage',
          target: null,
          auras: [],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 20, mres: 100, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 88, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 3, z: 0, dead: 0, inCombat: 1, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: 3, z: 0, auras: [] },
          { id: 501, k: 'mob', h: 80, x: 3, z: 1, aggro: 102, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [
        { cmd: 'target', id: 501 },
        { cmd: 'cast', ability: 'taunt' },
      ],
      pauseBrainDrive: true,
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('keeps a nearby hosted follower from breaking the server follow state', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 1502,
          z: -1200,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1502, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 2,
    });
  });

  it('has the hosted leader hold position while an ambient teammate is still preparing', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 1500,
          z: -1200,
          rtype: 'rage',
          res: 0,
          mres: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'warlock', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 1502, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [
          ambientBot({
            characterId: 102,
            characterName: 'Branorabb',
            class: 'warlock',
            runnerState: { groupMode: 'prepare_party' },
          }),
        ],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'prepare_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('lets party recovery intent hold the hosted leader before advancing', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 1500,
          z: -1200,
          rtype: 'rage',
          res: 0,
          mres: 0,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 36, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 1502, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'recovery',
          behavior: 'recover',
          key: 'party-intent|recovery|recover',
          summary: 'Stabilize health before the next pull',
          targetName: 'Hero',
          focusCallerName: 'Hero',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'prepare_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('releases stale regroup intent once the hosted party is already assembled', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 0,
          z: 0,
          rtype: 'rage',
          res: 0,
          mres: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 2, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'mage', level: 12, hp: 84, mhp: 84, res: 120, mres: 120, rtype: 'mana', x: -1, z: 1, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: 2, z: 0, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', dead: 0, cmb: 0 },
          { id: 103, k: 'player', nm: 'Branoracc', x: -1, z: 1, hp: 84, mhp: 84, res: 120, mres: 120, rtype: 'mana', dead: 0, cmb: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'correction',
          behavior: 'regroup',
          key: 'party-intent|correction|regroup',
          summary: 'Hold the group together before moving',
          targetName: 'Hero',
          focusCallerName: 'Hero',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('releases stale recovery intent once party health is stable', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 0,
          z: 0,
          rtype: 'rage',
          res: 0,
          mres: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 2, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 102, k: 'player', nm: 'Branorabb', x: 2, z: 0, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', dead: 0, cmb: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'recovery',
          behavior: 'recover',
          key: 'party-intent|recovery|recover',
          summary: 'Stabilize health before the next pull',
          targetName: 'Hero',
          focusCallerName: 'Hero',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('has a hosted warlock summon before the party advances into combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 1500,
          z: -1200,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warlock', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1502, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 102, k: 'player', nm: 'Branoraaa', x: 1502, z: -1200, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'warlock',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'cast', ability: 'summon_succubus' }],
      pauseBrainDrive: true,
      groupMode: 'prepare_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('invites the nearest nearby player when auto-invite is enabled for group content', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 100,
          z: 100,
          party: null,
        }),
        entities: [
          { id: 201, k: 'player', nm: 'Faraway', x: 130, z: 100, dead: 0 },
          { id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'solo',
        autoInviteNearbyPlayers: true,
        autoInviteNearbyTargetPartySize: 5,
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'pinvite', id: 202 }],
      pauseBrainDrive: false,
      groupMode: 'invite_nearby',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('invites a nearby player even when the current objective does not require a full group', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 100,
          z: 100,
          party: null,
        }),
        entities: [
          { id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'solo',
        autoInviteNearbyPlayers: true,
        autoInviteNearbyTargetPartySize: 3,
        objectiveSuggestedPartySize: 0,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'pinvite', id: 202 }],
      pauseBrainDrive: false,
      groupMode: 'invite_nearby',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('does not auto-invite while dead or already in combat', () => {
    for (const selfState of [{ dead: 1 }, { cmb: 1 }]) {
      const state = createHostedPlayPartyState();

      const result = tickHostedPlayPartyCoordinator(
        {
          liveSelf: liveSelf({
            id: 101,
            nm: 'Hero',
            x: 100,
            z: 100,
            party: null,
            ...selfState,
          }),
          entities: [
            { id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 },
          ],
          recentEvents: [],
          playerClass: 'warrior',
          partyMode: 'follow_leader',
          autoInviteNearbyPlayers: true,
          autoInviteNearbyTargetPartySize: 5,
          objectiveSuggestedPartySize: 5,
          ambientDirectory: [],
          nowMs: 5_000,
        },
        state,
      );

      expect(result).toEqual({
        commands: [],
        pauseBrainDrive: false,
        groupMode: '',
        groupLeaderName: '',
        groupLeaderDistance: 0,
      });
    }
  });

  it('does not repeat-invite the same nearby player while the target cooldown is active', () => {
    const state = createHostedPlayPartyState();
    const input = {
      liveSelf: liveSelf({
        id: 101,
        nm: 'Hero',
        x: 100,
        z: 100,
        party: null,
      }),
      entities: [
        { id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 },
      ],
      recentEvents: [],
      playerClass: 'warrior' as const,
      partyMode: 'follow_leader' as const,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 5 as const,
      objectiveSuggestedPartySize: 5,
      ambientDirectory: [],
    };

    expect(tickHostedPlayPartyCoordinator({ ...input, nowMs: 5_000 }, state).commands)
      .toEqual([{ cmd: 'pinvite', id: 202 }]);

    expect(tickHostedPlayPartyCoordinator({ ...input, nowMs: 20_000 }, state)).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: '',
      groupLeaderName: '',
      groupLeaderDistance: 0,
    });
  });

  it('stops inviting once the configured target party size has been reached', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 100,
          z: 100,
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 100, mhp: 100, res: 0, mres: 0, rtype: 'rage', x: 100, z: 100, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Ally', cls: 'priest', level: 12, hp: 90, mhp: 90, res: 120, mres: 120, rtype: 'mana', x: 102, z: 100, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'solo',
        autoInviteNearbyPlayers: true,
        autoInviteNearbyTargetPartySize: 2,
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: '',
      groupLeaderName: '',
      groupLeaderDistance: 0,
    });
  });

  it('does not invite extra players when the hosted character is following another leader', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Hero',
          x: 1502,
          z: -1200,
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1502, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 203, k: 'player', nm: 'ExtraPlayer', x: 1504, z: -1200, dead: 0 },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        autoInviteNearbyPlayers: true,
        autoInviteNearbyTargetPartySize: 5,
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 2,
    });
  });
});
