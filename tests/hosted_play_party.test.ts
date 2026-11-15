import { describe, expect, it } from 'vitest';
import type { AmbientPlayerBotRecord } from '../server/ambient_bots/types';
import {
  createHostedPlayPartyState,
  tickHostedPlayPartyCoordinator,
} from '../server/hosted_play/party';
import { findPartyCombatTarget } from '../server/party_coordination';
import { DUNGEONS } from '../src/sim/data';
import type { PartyInfo } from '../src/world_api';

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
  it('selects self aggro and leader called mobs as party combat targets', () => {
    const party: PartyInfo = {
      leader: 101,
      raid: false,
      master: { enabled: false, looter: 0, threshold: 'uncommon' },
      members: [
        {
          pid: 101,
          name: 'Alden',
          cls: 'warrior',
          level: 15,
          hp: 692,
          mhp: 692,
          res: 0,
          mres: 100,
          rtype: 'rage',
          x: 0,
          z: 0,
          dead: 0,
          inCombat: 0,
          targetId: 502,
          group: 1,
        },
        {
          pid: 102,
          name: 'Mira',
          cls: 'priest',
          level: 15,
          hp: 402,
          mhp: 402,
          res: 1079,
          mres: 1079,
          rtype: 'mana',
          x: 2,
          z: 0,
          dead: 0,
          inCombat: 0,
          group: 1,
        },
      ],
    };

    expect(
      findPartyCombatTarget({
        liveSelf: liveSelf({ id: 101, x: 0, z: 0 }),
        entities: [
          { id: 501, k: 'mob', tid: 'thornpeak_ogre', x: 6, z: 0, h: 1, hp: 80, aggro: 101 },
          { id: 502, k: 'mob', tid: 'thornpeak_ogre', x: 8, z: 0, h: true, hp: 80 },
        ],
        party,
        maxDistance: 60,
      }),
    ).toEqual({ id: 501, x: 6, z: 0, distance: 6 });

    expect(
      findPartyCombatTarget({
        liveSelf: liveSelf({ id: 102, x: 2, z: 0 }),
        entities: [{ id: 502, k: 'mob', tid: 'thornpeak_ogre', x: 8, z: 0, h: true, hp: 80 }],
        party,
        maxDistance: 60,
      }),
    ).toEqual({ id: 502, x: 8, z: 0, distance: 6 });
  });

  it('selects the party threat attacking the lowest-health member first', () => {
    const party: PartyInfo = {
      leader: 101,
      raid: false,
      master: { enabled: false, looter: 0, threshold: 'uncommon' },
      members: [
        {
          pid: 101,
          name: 'Alden',
          cls: 'warrior',
          level: 15,
          hp: 650,
          mhp: 692,
          res: 0,
          mres: 100,
          rtype: 'rage',
          x: 0,
          z: 0,
          dead: 0,
          inCombat: 0,
          group: 1,
        },
        {
          pid: 102,
          name: 'Mira',
          cls: 'priest',
          level: 15,
          hp: 90,
          mhp: 402,
          res: 1079,
          mres: 1079,
          rtype: 'mana',
          x: 2,
          z: 0,
          dead: 0,
          inCombat: 0,
          group: 1,
        },
      ],
    };

    expect(
      findPartyCombatTarget({
        liveSelf: liveSelf({ id: 101, x: 0, z: 0 }),
        entities: [
          { id: 501, k: 'mob', tid: 'thornpeak_ogre', x: 4, z: 0, h: true, hp: 80, aggro: 101 },
          { id: 502, k: 'mob', tid: 'thornpeak_ogre', x: 12, z: 0, h: true, hp: 80, aggro: 102 },
        ],
        party,
        maxDistance: 60,
      }),
    ).toEqual({ id: 502, x: 12, z: 0, distance: 12 });
  });

  it('assists an attackable leader threat instead of parking on empty unresolved combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: 1,
          z: 0,
          lv: 15,
          hp: 402,
          mhp: 402,
          res: 1079,
          mres: 1079,
          rtype: 'mana',
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 15,
                hp: 692,
                mhp: 692,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'mage',
                level: 15,
                hp: 402,
                mhp: 402,
                res: 1079,
                mres: 1079,
                rtype: 'mana',
                x: 1,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', tid: 'thornpeak_ogre', x: 7, z: 0, h: true, hp: 80, aggro: 101 },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.groupMode).toBe('assist_party');
    expect(result.commands).toEqual([
      { cmd: 'target', id: 501 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(result.pauseBrainDrive).toBe(true);
  });

  it('returns brain control when aggro-only support has no action and nobody is in combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Alden',
          x: 0,
          z: 0,
          lv: 19,
          hp: 974,
          mhp: 974,
          res: 0,
          mres: 100,
          rtype: 'energy',
          target: 501,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'rogue',
                level: 19,
                hp: 974,
                mhp: 974,
                res: 0,
                mres: 100,
                rtype: 'energy',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                targetId: 501,
                group: 1,
              },
              {
                pid: 102,
                name: 'Tovin',
                cls: 'paladin',
                level: 19,
                hp: 951,
                mhp: 951,
                res: 625,
                mres: 625,
                rtype: 'mana',
                x: -2,
                z: 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 501,
            k: 'mob',
            tid: 'thornpeak_necromancer',
            x: 26,
            z: 0,
            h: true,
            hp: 220,
            aggro: 102,
          },
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
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Alden',
      groupLeaderDistance: 0,
    });
  });

  it('holds a dungeon leader at the door until the train is ready', () => {
    const state = createHostedPlayPartyState();
    const door = DUNGEONS.sunken_bastion.doorPos;

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Alden',
          x: door.x + 11,
          z: door.z + 8,
          rtype: 'rage',
          res: 0,
          mres: 100,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 12,
                hp: 648,
                mhp: 648,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: door.x + 11,
                z: door.z + 8,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 339,
                mhp: 339,
                res: 600,
                mres: 911,
                rtype: 'mana',
                x: door.x + 45,
                z: door.z - 37,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 12,
                hp: 362,
                mhp: 362,
                res: 900,
                mres: 1089,
                rtype: 'mana',
                x: door.x + 40,
                z: door.z - 32,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovin',
                cls: 'paladin',
                level: 12,
                hp: 572,
                mhp: 642,
                res: 360,
                mres: 380,
                rtype: 'mana',
                x: door.x + 37,
                z: door.z - 27,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'druid',
                level: 12,
                hp: 448,
                mhp: 518,
                res: 750,
                mres: 807,
                rtype: 'mana',
                x: door.x + 33,
                z: door.z - 23,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        objectiveDungeonId: 'sunken_bastion',
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: door.x + 45, z: door.z - 37 },
        arrivalRange: 4,
        goalKey: `hosted-dungeon-door-regroup:102:${Math.round(door.x + 45)}:${Math.round(door.z - 37)}`,
      },
      groupMode: 'hold_regroup',
      groupLeaderName: 'Alden',
      groupLeaderDistance: 0,
    });
  });

  it('blocks a door-side follower from entering before the whole train is in range', () => {
    const state = createHostedPlayPartyState();
    const door = DUNGEONS.sunken_bastion.doorPos;
    const wait = { x: 49, z: 518 };

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 104,
          nm: 'Tovin',
          x: door.x + 1,
          z: door.z + 1,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 12,
                hp: 648,
                mhp: 648,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: door.x + 11,
                z: door.z + 8,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 339,
                mhp: 339,
                res: 600,
                mres: 911,
                rtype: 'mana',
                x: door.x + 4,
                z: door.z + 3,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 12,
                hp: 362,
                mhp: 362,
                res: 900,
                mres: 1089,
                rtype: 'mana',
                x: door.x + 3,
                z: door.z + 4,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovin',
                cls: 'paladin',
                level: 12,
                hp: 572,
                mhp: 642,
                res: 360,
                mres: 380,
                rtype: 'mana',
                x: door.x + 1,
                z: door.z + 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'druid',
                level: 12,
                hp: 448,
                mhp: 518,
                res: 750,
                mres: 807,
                rtype: 'mana',
                x: door.x + 10,
                z: door.z + 2,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'paladin',
        partyMode: 'follow_leader',
        objectiveDungeonId: 'sunken_bastion',
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      travelGoal: {
        target: wait,
        arrivalRange: 1.75,
        goalKey: 'hosted-dungeon-entry-wait:sunken_bastion:49:518',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Alden',
      groupLeaderDistance: Math.hypot(10, 7),
    });
  });

  it('lets a far dungeon-entry tail member use brain routing instead of a direct door follow', () => {
    const state = createHostedPlayPartyState();
    const wait = { x: 49, z: 518 };

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 103,
          nm: 'Corin',
          x: 16,
          z: 381,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 12,
                hp: 648,
                mhp: 648,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: wait.x,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 339,
                mhp: 339,
                res: 600,
                mres: 911,
                rtype: 'mana',
                x: wait.x,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 12,
                hp: 362,
                mhp: 362,
                res: 900,
                mres: 1089,
                rtype: 'mana',
                x: 16,
                z: 381,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovin',
                cls: 'paladin',
                level: 12,
                hp: 572,
                mhp: 642,
                res: 360,
                mres: 380,
                rtype: 'mana',
                x: wait.x,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'druid',
                level: 12,
                hp: 448,
                mhp: 518,
                res: 750,
                mres: 807,
                rtype: 'mana',
                x: wait.x,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        objectiveDungeonId: 'sunken_bastion',
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Alden',
      groupLeaderDistance: Math.hypot(wait.x - 16, wait.z - 381),
    });
  });

  it('lets every ready hosted member enter the dungeon at the door', () => {
    const state = createHostedPlayPartyState();
    const wait = { x: 49, z: 518 };

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: wait.x,
          z: wait.z,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 12,
                hp: 648,
                mhp: 648,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: wait.x,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 339,
                mhp: 339,
                res: 600,
                mres: 911,
                rtype: 'mana',
                x: wait.x,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 12,
                hp: 362,
                mhp: 362,
                res: 900,
                mres: 1089,
                rtype: 'mana',
                x: wait.x + 1,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovin',
                cls: 'paladin',
                level: 12,
                hp: 572,
                mhp: 642,
                res: 360,
                mres: 380,
                rtype: 'mana',
                x: wait.x,
                z: wait.z - 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'druid',
                level: 12,
                hp: 448,
                mhp: 518,
                res: 750,
                mres: 807,
                rtype: 'mana',
                x: wait.x - 1,
                z: wait.z,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        objectiveDungeonId: 'sunken_bastion',
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'enter_dungeon', dungeon: 'sunken_bastion' }],
      pauseBrainDrive: true,
      groupMode: 'brain',
      groupLeaderName: 'Alden',
      groupLeaderDistance: 0,
    });
  });

  it('lets a door-side follower enter after the leader is already in the dungeon phase', () => {
    const state = createHostedPlayPartyState();
    const door = DUNGEONS.sunken_bastion.doorPos;

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: door.x,
          z: door.z + 1,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 12,
                hp: 578,
                mhp: 648,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 1500,
                z: -1246,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 339,
                mhp: 339,
                res: 600,
                mres: 911,
                rtype: 'mana',
                x: door.x,
                z: door.z + 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 12,
                hp: 362,
                mhp: 362,
                res: 900,
                mres: 1089,
                rtype: 'mana',
                x: door.x - 2,
                z: door.z + 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovin',
                cls: 'paladin',
                level: 12,
                hp: 572,
                mhp: 642,
                res: 360,
                mres: 380,
                rtype: 'mana',
                x: door.x + 1,
                z: door.z - 2,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'druid',
                level: 12,
                hp: 448,
                mhp: 518,
                res: 750,
                mres: 807,
                rtype: 'mana',
                x: door.x - 1,
                z: door.z - 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        objectiveDungeonId: 'sunken_bastion',
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'enter_dungeon', dungeon: 'sunken_bastion' }],
      pauseBrainDrive: true,
      groupMode: 'brain',
      groupLeaderName: 'Alden',
    });
  });

  it('drives a hosted follower back to the party leader without spamming /follow', () => {
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1518,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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

  it('keeps moving a trailing hosted follower toward the leader across repeated follow ticks', () => {
    const state = createHostedPlayPartyState();

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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1538,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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

  it('follows the previous live party member to form a compact train', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 103,
          x: 1520,
          z: -1200,
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1506,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corda',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1520,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
        target: { x: 1506, z: -1200 },
        arrivalRange: 4,
        goalKey: 'hosted-follow-train:102:1506:-1200',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 20,
    });
  });

  it('lets the hosted leader advance while a compact train stretches behind them', () => {
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1505,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corda',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1510,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Darian',
                cls: 'paladin',
                level: 12,
                hp: 110,
                mhp: 110,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1515,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'hunter',
                level: 12,
                hp: 105,
                mhp: 105,
                res: 100,
                mres: 100,
                rtype: 'mana',
                x: 1520,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 6_000,
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

  it('preserves low healer mana instead of spending it on pre-pull buffs', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: 1502,
          z: -1200,
          hp: 339,
          mhp: 339,
          res: 260,
          mres: 911,
          rtype: 'mana',
          auras: [{ id: 'power_word_fortitude', kind: 'buff_sta', rem: 1700, dur: 1800 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 648,
                mhp: 648,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 339,
                mhp: 339,
                res: 260,
                mres: 911,
                rtype: 'mana',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 101,
            k: 'player',
            nm: 'Branoraaa',
            x: 1500,
            z: -1200,
            hp: 648,
            mhp: 648,
            res: 0,
            mres: 0,
            rtype: 'rage',
            dead: 0,
            cmb: 0,
          },
        ],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 6_000,
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

  it('lets the hosted leader advance when the first train link is only slightly stretched', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 14.2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corda',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 15,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 6_000,
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

  it('moves the hosted leader back when a train link breaks even if the tail is nearby', () => {
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1504,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corda',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1521,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
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
        target: { x: 1521, z: -1200 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:103:1521:-1200',
      },
      groupMode: 'hold_regroup',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 0,
    });
  });

  it('moves the Fenbridge leader back to reconnect a broken train link', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 27.82,
          z: 305.21,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 9,
                hp: 414,
                mhp: 414,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 27.82,
                z: 305.21,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'priest',
                level: 9,
                hp: 196,
                mhp: 196,
                res: 713,
                mres: 713,
                rtype: 'mana',
                x: 10.18,
                z: 309.59,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 9,
                hp: 196,
                mhp: 196,
                res: 852,
                mres: 852,
                rtype: 'mana',
                x: 9.85,
                z: 309.94,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
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
        target: { x: 10.18, z: 309.59 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:102:10:310',
      },
      groupMode: 'hold_regroup',
      groupLeaderName: 'Aldenpplbms',
      groupLeaderDistance: 0,
    });
  });

  it('moves a Highwatch leader back to reconnect a mid-range broken train link', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 14,
          z: 580,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 14,
                hp: 724,
                mhp: 724,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 14,
                z: 580,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'priest',
                level: 15,
                hp: 402,
                mhp: 402,
                res: 294,
                mres: 1079,
                rtype: 'mana',
                x: 12,
                z: 583,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 14,
                hp: 406,
                mhp: 406,
                res: 1302,
                mres: 1302,
                rtype: 'mana',
                x: 11,
                z: 587,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovinpplbms',
                cls: 'paladin',
                level: 15,
                hp: 683,
                mhp: 683,
                res: 485,
                mres: 485,
                rtype: 'mana',
                x: 38,
                z: 540,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liorapplbms',
                cls: 'druid',
                level: 15,
                hp: 547,
                mhp: 547,
                res: 963,
                mres: 963,
                rtype: 'mana',
                x: 39,
                z: 540,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
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
        target: { x: 38, z: 540 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:104:38:540',
      },
      groupMode: 'hold_regroup',
      groupLeaderName: 'Aldenpplbms',
      groupLeaderDistance: 0,
    });
  });

  it('prioritizes closing a non-combat follower gap before party preparation buffs', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 1538,
          z: -1200,
          auras: [],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Darian',
                cls: 'paladin',
                level: 12,
                hp: 110,
                mhp: 110,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1538,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 101,
            k: 'player',
            nm: 'Branoraaa',
            x: 1500,
            z: -1200,
            hp: 120,
            mhp: 120,
            res: 0,
            mres: 0,
            rtype: 'rage',
            dead: 0,
            cmb: 0,
            auras: [],
          },
        ],
        recentEvents: [],
        playerClass: 'paladin',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
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

  it('keeps an out-of-range hosted follower moving back to the regrouping leader', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 103,
          x: 1576,
          z: -1200,
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1700, dur: 1800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1700, dur: 1800 },
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corda',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1576,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 101,
            k: 'player',
            nm: 'Branoraaa',
            x: 1500,
            z: -1200,
            hp: 120,
            mhp: 120,
            res: 0,
            mres: 0,
            rtype: 'rage',
            dead: 0,
            cmb: 0,
            auras: [],
          },
        ],
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
      groupLeaderDistance: 76,
    });
  });

  it('prioritizes train regroup over distant unresolved party combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 105,
          x: 79,
          z: 87,
          hp: 379,
          mhp: 392,
          res: 43,
          mres: 658,
          target: null,
          auras: [],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 10,
                hp: 482,
                mhp: 482,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 896.5,
                z: -1240.3,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 10,
                hp: 217,
                mhp: 217,
                res: 622,
                mres: 769,
                rtype: 'mana',
                x: 896.7,
                z: -1240.3,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 10,
                hp: 235,
                mhp: 248,
                res: 450,
                mres: 921,
                rtype: 'mana',
                x: 896.5,
                z: -1241.2,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovin',
                cls: 'paladin',
                level: 10,
                hp: 488,
                mhp: 488,
                res: 289,
                mres: 310,
                rtype: 'mana',
                x: 898.4,
                z: -1243.3,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'druid',
                level: 10,
                hp: 379,
                mhp: 392,
                res: 43,
                mres: 658,
                rtype: 'mana',
                x: 79,
                z: 87,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 896, z: -1238, aggro: 101 }],
        recentEvents: [],
        playerClass: 'druid',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 898.4, z: -1243.3 },
        arrivalRange: 4,
        goalKey: 'hosted-regroup-train:104:898:-1243',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Alden',
      groupLeaderDistance: expect.closeTo(1558.86, 2),
    });
  });

  it('moves the hosted leader toward a lagging party member while the party regroups', () => {
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1529,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
      travelGoal: {
        target: { x: 1529, z: -1200 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:102:1529:-1200',
      },
      groupMode: 'hold_regroup',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 0,
    });
  });

  it('moves a non-Fenbridge leader back when the train is badly split', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 878.5,
          z: -1139.5,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 10,
                hp: 482,
                mhp: 482,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 878.5,
                z: -1139.5,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 10,
                hp: 187,
                mhp: 187,
                res: 769,
                mres: 769,
                rtype: 'mana',
                x: 277.4,
                z: -331.3,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 10,
                hp: 248,
                mhp: 248,
                res: 921,
                mres: 921,
                rtype: 'mana',
                x: 878.5,
                z: -1139.5,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'warrior',
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
        target: { x: 277.4, z: -331.3 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:102:277:-331',
      },
      groupMode: 'hold_regroup',
      groupLeaderName: 'Alden',
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1529,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: 1502,
            z: -1200,
            hp: 100,
            mhp: 100,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
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

  it('moves the hosted leader back when live entity coordinates show a member is lagging', () => {
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: 1535,
            z: -1200,
            hp: 100,
            mhp: 100,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
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
      travelGoal: {
        target: { x: 1535, z: -1200 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:102:1535:-1200',
      },
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 8,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'rogue',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'energy',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 101 }],
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 6,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 0,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 20, z: 0, aggro: 101 }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'target', id: 501 }, { cmd: 'attack' }],
      pauseBrainDrive: true,
      facing: expect.any(Number),
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 6,
    });
  });

  it('has a low-health hosted damage dealer stop attacking and recover near the leader', () => {
    const state = createHostedPlayPartyState();
    const input = {
      liveSelf: liveSelf({
        id: 102,
        x: 0,
        z: 0,
        hp: 26,
        mhp: 100,
        target: 501,
        auto: true,
        inv: [{ itemId: 'minor_healing_potion', count: 1 }],
        party: {
          leader: 101,
          raid: false,
          members: [
            {
              pid: 101,
              name: 'Branoraaa',
              cls: 'warrior' as const,
              level: 12,
              hp: 120,
              mhp: 120,
              res: 0,
              mres: 0,
              rtype: 'rage' as const,
              x: 12,
              z: 0,
              dead: 0,
              inCombat: 1,
              group: 1 as const,
            },
            {
              pid: 102,
              name: 'Hero',
              cls: 'mage' as const,
              level: 12,
              hp: 26,
              mhp: 100,
              res: 100,
              mres: 120,
              rtype: 'mana' as const,
              x: 0,
              z: 0,
              dead: 0,
              inCombat: 1,
              group: 1 as const,
            },
          ],
        },
      }),
      entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102 }],
      recentEvents: [],
      playerClass: 'mage' as const,
      partyMode: 'follow_leader' as const,
      ambientDirectory: [],
      nowMs: 5_000,
    };

    const result = tickHostedPlayPartyCoordinator(input, state);

    expect(result).toEqual({
      commands: [
        { cmd: 'use', item: 'minor_healing_potion' },
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 20, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:20:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 12,
    });

    const retry = tickHostedPlayPartyCoordinator({ ...input, nowMs: 8_000 }, state);

    expect(retry.commands).toEqual([{ cmd: 'stopattack' }, { cmd: 'target', id: null }]);
  });

  it('has a wounded hosted damage dealer recover before becoming critical', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          hp: 70,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 12,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 70,
                mhp: 100,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 12, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-recover:101:12:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 12,
    });
  });

  it('has a low-level threatened cloth member recover before the party recovery threshold', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          lv: 2,
          hp: 60,
          mhp: 67,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 2,
                hp: 128,
                mhp: 128,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 12,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 2,
                hp: 60,
                mhp: 67,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102 }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 20, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:20:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 12,
    });
  });

  it('uses a potion earlier for a low-level threatened cloth member', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          lv: 2,
          hp: 46,
          mhp: 67,
          target: 501,
          auto: true,
          inv: [{ itemId: 'minor_healing_potion', count: 1 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 2,
                hp: 128,
                mhp: 128,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 12,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 2,
                hp: 46,
                mhp: 67,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102 }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'use', item: 'minor_healing_potion' },
      { cmd: 'stopattack' },
      { cmd: 'target', id: null },
    ]);
    expect(result.travelGoal).toEqual({
      target: { x: 20, z: 0 },
      arrivalRange: 1.5,
      goalKey: 'hosted-party-retreat:101:501:20:0',
    });
    expect(result.groupMode).toBe('assist_party');
  });

  it('makes a low-level wounded cloth member obey recovery intent without explicit aggro', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 5,
          z: 35,
          lv: 1,
          hp: 46,
          mhp: 54,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenjwkzpv',
                cls: 'warrior',
                level: 1,
                hp: 90,
                mhp: 90,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 8,
                z: 36,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Corinjwkzpv',
                cls: 'mage',
                level: 1,
                hp: 46,
                mhp: 54,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 5,
                z: 35,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Mirajwkzpv',
                cls: 'priest',
                level: 1,
                hp: 54,
                mhp: 54,
                res: 100,
                mres: 100,
                rtype: 'mana',
                x: 7,
                z: 36,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 6, z: 35, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'recovery',
          behavior: 'recover',
          key: 'party-intent|recovery|recover',
          summary: 'Stabilize health before the next pull',
          targetName: 'Aldenjwkzpv',
          focusCallerName: 'Aldenjwkzpv',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([{ cmd: 'stopattack' }, { cmd: 'target', id: null }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.travelGoal).toEqual({
      target: { x: 15.155417527999326, z: 39.57770876399967 },
      arrivalRange: 1.5,
      goalKey: 'hosted-party-retreat:101:501:15:40',
    });
    expect(result.groupMode).toBe('assist_party');
  });

  it('retreats a low-level fragile member from party threats during recovery intent', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 1,
          z: 0,
          lv: 2,
          hp: 49,
          mhp: 67,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenjwkzpv',
                cls: 'warrior',
                level: 2,
                hp: 128,
                mhp: 128,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirajwkzpv',
                cls: 'priest',
                level: 2,
                hp: 49,
                mhp: 67,
                res: 70,
                mres: 100,
                rtype: 'mana',
                x: 1,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinjwkzpv',
                cls: 'mage',
                level: 2,
                hp: 67,
                mhp: 67,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'recovery',
          behavior: 'recover',
          key: 'party-intent|recovery|recover',
          summary: 'Stabilize health before the next pull',
          targetName: 'Aldenjwkzpv',
          focusCallerName: 'Aldenjwkzpv',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -8, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:-8:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Aldenjwkzpv',
      groupLeaderDistance: 1,
    });
  });

  it('keeps a wounded hosted member moving when only loosely near the anchor', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 3.5,
          z: 0,
          hp: 30,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 30,
                mhp: 100,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 3.5,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 3.5, z: 1, aggro: 102 }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -7.692191581126584, z: -2.197769023179024 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:-8:-2',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 3.5,
    });
  });

  it('retreats past the recovery anchor while a wounded member is still being attacked', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          hp: 20,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 20,
                mhp: 100,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 0, z: -1, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 6.65685424949238, z: 5.65685424949238 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:7:6',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 1,
    });
  });

  it('retreats a wounded member away from threats attacking the party', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          hp: 20,
          mhp: 100,
          target: null,
          auto: false,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'druid',
                level: 12,
                hp: 20,
                mhp: 100,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 0, z: -1, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'druid',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 9.48528137423857, z: 8.48528137423857 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:9:8',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 1,
    });
  });

  it('has a wounded hosted healer retreat instead of hard-casting under threat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 8,
          z: 0,
          lv: 2,
          hp: 23,
          mhp: 67,
          res: 100,
          mres: 100,
          rtype: 'mana',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'priest',
                level: 2,
                hp: 23,
                mhp: 67,
                res: 100,
                mres: 100,
                rtype: 'mana',
                x: 8,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 8, z: 1, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -7.938223013709342, z: -0.9922778767136677 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:101:501:-8:-1',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 8,
    });
  });

  it('pauses ordinary hosted brain work while the party is recovering', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 30,
          z: 0,
          hp: 100,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'rogue',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'energy',
                x: 30,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 20,
                mhp: 100,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 24,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'rogue',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:101:0:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 30,
    });
  });

  it('prevents hosted damage dealers from focus firing while another party member needs recovery', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 16,
          z: 0,
          hp: 100,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 16,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 24,
                mhp: 100,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 13,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 3, z: 0, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:101:0:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 16,
    });
  });

  it('allows protective focus fire on a mob attacking a low-health party member during recovery', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 16,
          z: 0,
          hp: 100,
          mhp: 100,
          target: null,
          auto: false,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 16,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 24,
                mhp: 100,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 13,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 13, z: 1, aggro: 103, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 501 },
      { cmd: 'cast', ability: 'fireball' },
      { cmd: 'attack' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('keeps moving to a Highwatch leash point when a safe retreat still has threat and a dry healer', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: -22,
          z: 664,
          lv: 18,
          hp: 720,
          mhp: 846,
          res: 0,
          mres: 100,
          rtype: 'rage',
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 18,
                hp: 720,
                mhp: 846,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: -22,
                z: 664,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 18,
                hp: 395,
                mhp: 395,
                res: 12,
                mres: 1307,
                rtype: 'mana',
                x: -21,
                z: 663,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 18,
                hp: 494,
                mhp: 494,
                res: 1578,
                mres: 1578,
                rtype: 'mana',
                x: -21,
                z: 663,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 246,
            k: 'mob',
            tid: 'boneclad_revenant',
            h: 100,
            x: -20,
            z: 663,
            aggro: 101,
            auras: [],
          },
          ...Array.from({ length: 20 }, (_, index) => ({
            id: 800 + index,
            k: 'mob',
            tid: 'boneclad_revenant',
            h: 100,
            x: -8 + index,
            z: 680,
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).not.toContainEqual({ cmd: 'target', id: 246 });
    expect(result.commands).not.toContainEqual({ cmd: 'attack' });
    expect(result.commands).not.toContainEqual(
      expect.objectContaining({
        cmd: 'cast',
        ability: expect.not.stringMatching(/^defensive_stance$/),
      }),
    );
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.travelGoal).toEqual({
      target: { x: -5, z: 650 },
      arrivalRange: 2.5,
      goalKey: 'hosted-party-safe-leash:thornpeak_heights:-5:650',
    });
    expect(result.groupMode).toBe('assist_party');
  });

  it('continues the Highwatch safe leash after leaving the initial retreat radius', () => {
    const state = createHostedPlayPartyState();
    state.highwatchSafeThreatLeashActive = true;

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: -7.9,
          z: 653.8,
          lv: 19,
          hp: 455,
          mhp: 974,
          res: 65,
          mres: 100,
          rtype: 'rage',
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Alden',
                cls: 'warrior',
                level: 19,
                hp: 455,
                mhp: 974,
                res: 65,
                mres: 100,
                rtype: 'rage',
                x: -7.9,
                z: 653.8,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 19,
                hp: 481,
                mhp: 506,
                res: 26,
                mres: 1363,
                rtype: 'mana',
                x: -8.2,
                z: 654.1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 19,
                hp: 491,
                mhp: 516,
                res: 1767,
                mres: 1767,
                rtype: 'mana',
                x: -8.1,
                z: 654,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 246,
            k: 'mob',
            tid: 'boneclad_revenant',
            h: 100,
            x: -20,
            z: 663,
            aggro: 101,
            auras: [],
          },
          ...Array.from({ length: 20 }, (_, index) => ({
            id: 850 + index,
            k: 'mob',
            tid: 'boneclad_revenant',
            h: 100,
            x: -8 + index,
            z: 680,
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).not.toContainEqual({ cmd: 'target', id: 246 });
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.travelGoal).toEqual({
      target: { x: -5, z: 650 },
      arrivalRange: 2.5,
      goalKey: 'hosted-party-safe-leash:thornpeak_heights:-5:650',
    });
    expect(result.groupMode).toBe('assist_party');
  });

  it('keeps a safe leader near unresolved party combat instead of returning to brain', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          hp: 120,
          mhp: 120,
          res: 0,
          mres: 0,
          rtype: 'rage',
          target: 7100,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 80,
                mhp: 100,
                res: 60,
                mres: 100,
                rtype: 'mana',
                x: 30,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
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
      commands: [{ cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 30, z: 0 },
        arrivalRange: 4.5,
        goalKey: 'hosted-party-combat:102:30:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 0,
    });
  });

  it('uses the hosted leader live target before aggro fallback', () => {
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 6,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 101, k: 'player', nm: 'Branoraaa', x: 6, z: 0, target: 502, auras: [] },
          { id: 501, k: 'mob', h: 80, x: 8, z: 0, aggro: 101, auras: [] },
          { id: 502, k: 'mob', h: 80, x: 10, z: 0, aggro: 101, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands[0]).toEqual({ cmd: 'target', id: 502 });
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('uses a hosted skull marker before the leader target', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          target: null,
          marks: { 502: 7 },
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 6,
                z: 0,
                dead: 0,
                inCombat: 1,
                targetId: 501,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 8, z: 0, aggro: 101, auras: [] },
          { id: 502, k: 'mob', h: 80, x: 10, z: 0, aggro: 101, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands[0]).toEqual({ cmd: 'target', id: 502 });
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('lets a hosted ranged follower pull the leader target before melee engages', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 2,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 120,
          mres: 120,
          rtype: 'mana',
          target: null,
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1_700, dur: 1_800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1_700, dur: 1_800 },
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                targetId: 502,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 502, k: 'mob', h: 80, x: 20, z: 0, aggro: null, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 502 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('prepare_party');
  });

  it('keeps a hosted melee follower from charging an incoming pull too early', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 100,
          mres: 100,
          rtype: 'energy',
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 1,
                targetId: 501,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'rogue',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 100,
                mres: 100,
                rtype: 'energy',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 18, z: 0, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'rogue',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([{ cmd: 'target', id: 501 }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.travelGoal).toBeUndefined();
    expect(result.groupMode).toBe('assist_party');
  });

  it('stages hosted dense high-aggro pre-pulls farther from the pack', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 0,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 120,
          mres: 120,
          rtype: 'mana',
          target: null,
          auras: [
            { id: 'frost_armor', kind: 'buff_armor', rem: 1_700, dur: 1_800 },
            { id: 'arcane_intellect', kind: 'buff_int', rem: 1_700, dur: 1_800 },
          ],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                targetId: 503,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 503, k: 'mob', tid: 'deepfen_murloc', h: 80, x: 28, z: 0, aggro: null, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([{ cmd: 'target', id: 503 }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('prepare_party');
    expect(result.travelGoal).toMatchObject({
      target: { x: 28, z: 0 },
      arrivalRange: 24,
      goalKey: 'party-target:503:28:0',
    });
  });

  it('allows protective focus when multiple members are unstable and one is under attack', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 16,
          z: 0,
          hp: 100,
          mhp: 100,
          target: null,
          auto: false,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 16,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 24,
                mhp: 100,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 13,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 104,
                name: 'Branoracc',
                cls: 'rogue',
                level: 12,
                hp: 55,
                mhp: 100,
                res: 100,
                mres: 100,
                rtype: 'energy',
                x: 12,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 13, z: 1, aggro: 103, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 501 },
      { cmd: 'cast', ability: 'fireball' },
      { cmd: 'attack' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('lets a stable hosted tank protect the party while multiple members recover', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          lv: 2,
          x: 0,
          z: 0,
          hp: 128,
          mhp: 128,
          res: 0,
          mres: 100,
          rtype: 'rage',
          target: null,
          auto: false,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 2,
                hp: 128,
                mhp: 128,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 2,
                hp: 44,
                mhp: 67,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 2,
                hp: 44,
                mhp: 67,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 3,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([{ cmd: 'target', id: 501 }, { cmd: 'attack' }]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('lets a wounded frontline protector keep fighting during party recovery', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          lv: 15,
          x: 0,
          z: 0,
          hp: 70,
          mhp: 100,
          res: 0,
          mres: 100,
          rtype: 'rage',
          target: null,
          auto: false,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 15,
                hp: 70,
                mhp: 100,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 15,
                hp: 30,
                mhp: 100,
                res: 20,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 501 },
      { cmd: 'cast', ability: 'taunt' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('keeps a stable hosted tank attacking during party recovery', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          lv: 2,
          x: 0,
          z: 0,
          hp: 128,
          mhp: 128,
          res: 0,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 2,
                hp: 128,
                mhp: 128,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 2,
                hp: 44,
                mhp: 67,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 2,
                hp: 44,
                mhp: 67,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 3,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102, auras: [] }],
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
      groupMode: 'recover_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('keeps recovery intent active until the party reaches the stable line', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 0,
          z: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 80,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
      groupMode: 'recover_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('holds party recovery when the healer needs mana before the next pull', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 0,
          z: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 24,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
      groupMode: 'recover_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('lets a low-mana healer drink through the ambient brain', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: 2,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 25,
          mres: 100,
          rtype: 'mana',
          inv: [{ itemId: 'spring_water', count: 1 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 25,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'priest',
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
      groupLeaderName: 'Hero',
      groupLeaderDistance: 2,
    });
  });

  it('keeps a low-mana healer without drinks from leaving the party to restock', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: 2,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 25,
          mres: 100,
          rtype: 'mana',
          inv: [],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 25,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).not.toBe('brain');
    expect(result.groupLeaderName).toBe('Hero');
    expect(result.groupLeaderDistance).toBe(2);
  });

  it('keeps a low-mana off-healer from blocking the party when the priest is stable', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 70,
          z: 84,
          hp: 482,
          mhp: 482,
          res: 0,
          mres: 100,
          rtype: 'rage',
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 10,
                hp: 482,
                mhp: 482,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 70,
                z: 84,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 10,
                hp: 217,
                mhp: 217,
                res: 769,
                mres: 769,
                rtype: 'mana',
                x: 71,
                z: 84,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Liora',
                cls: 'druid',
                level: 10,
                hp: 392,
                mhp: 392,
                res: 5,
                mres: 658,
                rtype: 'mana',
                x: 72,
                z: 84,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('backs party recovery out of dense hostile areas before resting', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 0,
          z: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 20,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: Array.from({ length: 30 }, (_, index) => ({
          id: 700 + index,
          k: 'mob',
          h: true,
          x: 14,
          z: 0,
          aggro: null,
          auras: [],
        })),
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
      travelGoal: {
        target: { x: -16, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-density-retreat:102:30:-16:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('retreats Mirefen recovery to Fenbridge when critical health risk starts near dense hostiles', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: -84,
          z: 336,
          hp: 382,
          mhp: 406,
          res: 6,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 8,
                hp: 382,
                mhp: 406,
                res: 6,
                mres: 100,
                rtype: 'rage',
                x: -84,
                z: 336,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 8,
                hp: 113,
                mhp: 175,
                res: 244,
                mres: 657,
                rtype: 'mana',
                x: -84,
                z: 337,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 8,
                hp: 204,
                mhp: 204,
                res: 733,
                mres: 783,
                rtype: 'mana',
                x: -82,
                z: 336,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: Array.from({ length: 12 }, (_, index) => ({
          id: 501 + index,
          k: 'mob',
          h: true,
          x: -82 + (index % 4),
          z: 334 + Math.floor(index / 4),
          aggro: index === 0 ? 101 : null,
          auras: [],
        })),
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -18, z: 286 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:mirefen_marsh:-18:286',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('retreats Eastbrook recovery to town when critical health risk starts near dense hostiles', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: 74.58,
          z: 72.7,
          hp: 34,
          mhp: 166,
          res: 79,
          mres: 713,
          rtype: 'mana',
          target: null,
          auto: false,
          inv: [{ itemId: 'minor_healing_potion', count: 1 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 10,
                hp: 232,
                mhp: 452,
                res: 1,
                mres: 100,
                rtype: 'rage',
                x: 73.04,
                z: 70.77,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 9,
                hp: 34,
                mhp: 166,
                res: 79,
                mres: 713,
                rtype: 'mana',
                x: 74.58,
                z: 72.7,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 10,
                hp: 189,
                mhp: 218,
                res: 891,
                mres: 891,
                rtype: 'mana',
                x: 73.39,
                z: 71.28,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: Array.from({ length: 12 }, (_, index) => ({
          id: 900 + index,
          k: 'mob',
          h: true,
          x: 70 + (index % 4) * 3,
          z: 68 + Math.floor(index / 4) * 3,
          aggro: index < 4 ? 102 : null,
          auras: [],
        })),
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toContainEqual({ cmd: 'use', item: 'minor_healing_potion' });
    expect(result).toMatchObject({
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -14, z: -100 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:eastbrook_vale:-14:-100',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Aldenpplbms',
    });
  });

  it('keeps Fenbridge threat recovery moving inside the old wide safe radius', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: -4,
          z: 294.5,
          hp: 190,
          mhp: 406,
          res: 6,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 8,
                hp: 190,
                mhp: 406,
                res: 6,
                mres: 100,
                rtype: 'rage',
                x: -4,
                z: 294.5,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 8,
                hp: 150,
                mhp: 293,
                res: 150,
                mres: 502,
                rtype: 'mana',
                x: -3,
                z: 295,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 8,
                hp: 154,
                mhp: 154,
                res: 58,
                mres: 601,
                rtype: 'mana',
                x: -5,
                z: 294,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: true, x: -7, z: 293, aggro: 101, auras: [] },
          { id: 502, k: 'mob', h: true, x: -6, z: 294, aggro: 102, auras: [] },
          { id: 503, k: 'mob', h: true, x: -5, z: 292, aggro: 103, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -18, z: 286 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:mirefen_marsh:-18:286',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
    });
  });

  it('lets a healer break safe retreat to shield a chased tail member', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: -23.13,
          z: 310.4,
          hp: 196,
          mhp: 196,
          res: 553,
          mres: 713,
          rtype: 'mana',
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 9,
                hp: 444,
                mhp: 444,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: -33.32,
                z: 302.13,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 9,
                hp: 196,
                mhp: 196,
                res: 553,
                mres: 713,
                rtype: 'mana',
                x: -23.13,
                z: 310.4,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Liorapplbms',
                cls: 'druid',
                level: 9,
                hp: 252,
                mhp: 359,
                res: 403,
                mres: 606,
                rtype: 'mana',
                x: -40.15,
                z: 297.5,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 701, k: 'mob', h: true, x: -41, z: 297, aggro: 103, auras: [] },
          { id: 702, k: 'mob', h: true, x: -39, z: 298, aggro: 103, auras: [] },
          { id: 703, k: 'mob', h: true, x: -38, z: 296, aggro: 103, auras: [] },
          ...Array.from({ length: 9 }, (_, index) => ({
            id: 720 + index,
            k: 'mob',
            h: true,
            x: -58 + index,
            z: 284 + index,
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 103 },
      { cmd: 'cast', ability: 'power_word_shield' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.travelGoal).toBeUndefined();
    expect(result.groupMode).toBe('assist_party');
  });

  it('keeps emergency safe-retreat healing active after the healer reaches the edge', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Mira',
          x: -4.48,
          z: 318.56,
          hp: 196,
          mhp: 196,
          res: 619,
          mres: 713,
          rtype: 'mana',
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 9,
                hp: 444,
                mhp: 444,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: -17.21,
                z: 314.96,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 9,
                hp: 196,
                mhp: 196,
                res: 619,
                mres: 713,
                rtype: 'mana',
                x: -4.48,
                z: 318.56,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Liorapplbms',
                cls: 'druid',
                level: 9,
                hp: 98,
                mhp: 359,
                res: 457,
                mres: 606,
                rtype: 'mana',
                x: -24.12,
                z: 309.96,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 701, k: 'mob', h: true, x: -25, z: 310, aggro: 103, auras: [] },
          { id: 702, k: 'mob', h: true, x: -23, z: 310, aggro: 103, auras: [] },
          { id: 703, k: 'mob', h: true, x: -24, z: 308, aggro: 103, auras: [] },
          ...Array.from({ length: 9 }, (_, index) => ({
            id: 730 + index,
            k: 'mob',
            h: true,
            x: -35 + index,
            z: 300 + index,
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 103 },
      { cmd: 'cast', ability: 'power_word_shield' },
    ]);
    expect(result.travelGoal).toBeUndefined();
    expect(result.groupMode).toBe('assist_party');
  });

  it('lets a healer support the leader from the Fenbridge safe retreat edge', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 105,
          nm: 'Liora',
          x: -7.51,
          z: 310.46,
          hp: 326,
          mhp: 326,
          res: 554,
          mres: 657,
          rtype: 'mana',
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 8,
                hp: 70,
                mhp: 406,
                res: 40,
                mres: 100,
                rtype: 'rage',
                x: -13.22,
                z: 296.57,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'mage',
                level: 8,
                hp: 175,
                mhp: 175,
                res: 500,
                mres: 657,
                rtype: 'mana',
                x: -0.5,
                z: 318.09,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 8,
                hp: 204,
                mhp: 204,
                res: 500,
                mres: 783,
                rtype: 'mana',
                x: -1.19,
                z: 318.68,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovinpplbms',
                cls: 'paladin',
                level: 8,
                hp: 414,
                mhp: 414,
                res: 240,
                mres: 240,
                rtype: 'mana',
                x: -1,
                z: 318.89,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liora',
                cls: 'priest',
                level: 8,
                hp: 326,
                mhp: 326,
                res: 554,
                mres: 657,
                rtype: 'mana',
                x: -7.51,
                z: 310.46,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 95, k: 'mob', h: true, x: -13, z: 296, aggro: 101, auras: [] },
          ...Array.from({ length: 11 }, (_, index) => ({
            id: 600 + index,
            k: 'mob',
            h: true,
            x: -16 + index,
            z: 280 + index,
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 101 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('focuses an active fight while recovery is only waiting on healer mana', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Hero',
          x: 0,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 100,
          mres: 120,
          rtype: 'mana',
          target: null,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 6,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 35,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'recovery',
          behavior: 'recover',
          key: 'party-intent|recovery|recover',
          summary: 'Recover health and mana before moving',
          targetName: 'Branoraaa',
          focusCallerName: 'Branoraaa',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 501 },
      expect.objectContaining({ cmd: 'cast' }),
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.groupMode).toBe('assist_party');
  });

  it('pulls a combat-split follower back during resource-only recovery', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          nm: 'Hero',
          x: 24,
          z: 0,
          hp: 100,
          mhp: 100,
          res: 100,
          mres: 120,
          rtype: 'mana',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 100,
                mres: 120,
                rtype: 'mana',
                x: 24,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 35,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 26, z: 0, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-regroup-leader:101:0:0',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 24,
    });
  });

  it('releases recovery intent once the healer has pull-ready mana', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 0,
          z: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 40,
                mres: 100,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
      pauseBrainDrive: false,
      groupMode: 'brain',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('starts hosted party recovery before a wounded cloth teammate becomes critical', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 16,
          z: 0,
          hp: 100,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 16,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 70,
                mhp: 100,
                res: 80,
                mres: 100,
                rtype: 'mana',
                x: 13,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 3, z: 0, aggro: 101, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:101:0:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 16,
    });
  });

  it('uses a healing potion from hosted party recovery before resuming local brain work', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 16,
          z: 0,
          hp: 60,
          mhp: 100,
          target: 501,
          auto: true,
          inv: [{ itemId: 'minor_healing_potion', count: 1 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'rogue',
                level: 12,
                hp: 60,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'energy',
                x: 16,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
        recentEvents: [],
        playerClass: 'rogue',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [
        { cmd: 'use', item: 'minor_healing_potion' },
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-recover:101:0:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 16,
    });
  });

  it('lets low-health hosted leaders recover before tank support or preparation commands', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          hp: 60,
          mhp: 100,
          res: 20,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          inv: [{ itemId: 'minor_healing_potion', count: 1 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 60,
                mhp: 100,
                res: 20,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 12,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 101, auras: [] },
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: 12,
            z: 0,
            hp: 100,
            mhp: 100,
            dead: 0,
            cmb: 0,
            auras: [],
          },
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
        { cmd: 'use', item: 'minor_healing_potion' },
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 24, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:102:501:24:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('starts threatened hosted frontline recovery before the standard recovery threshold', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          hp: 205,
          mhp: 252,
          res: 20,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 5,
                hp: 205,
                mhp: 252,
                res: 20,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirajwkynf',
                cls: 'priest',
                level: 5,
                hp: 112,
                mhp: 112,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinjwkynf',
                cls: 'mage',
                level: 5,
                hp: 107,
                mhp: 107,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 3,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: -1, z: 0, aggro: 101, auras: [] },
          {
            id: 102,
            k: 'player',
            nm: 'Mirajwkynf',
            x: 2,
            z: 0,
            hp: 112,
            mhp: 112,
            dead: 0,
            cmb: 0,
            auras: [],
          },
          {
            id: 103,
            k: 'player',
            nm: 'Corinjwkynf',
            x: 3,
            z: 0,
            hp: 107,
            mhp: 107,
            dead: 0,
            cmb: 0,
            auras: [],
          },
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
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 14, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:102:501:14:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('retreats a healthy frontline leader early from dense multi-threat combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          hp: 240,
          mhp: 252,
          res: 20,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 5,
                hp: 240,
                mhp: 252,
                res: 20,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirajwkynf',
                cls: 'priest',
                level: 5,
                hp: 112,
                mhp: 112,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 0,
                z: 4,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinjwkynf',
                cls: 'mage',
                level: 5,
                hp: 107,
                mhp: 107,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 2,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: true, x: 3, z: 0, aggro: 101, auras: [] },
          { id: 502, k: 'mob', h: true, x: 4, z: 1, aggro: 101, auras: [] },
          { id: 503, k: 'mob', h: true, x: 5, z: -1, aggro: 101, auras: [] },
          ...Array.from({ length: 17 }, (_, index) => ({
            id: 600 + index,
            k: 'mob',
            h: true,
            x: 8 + index,
            z: 8,
            aggro: null,
            auras: [],
          })),
          {
            id: 102,
            k: 'player',
            nm: 'Mirajwkynf',
            x: 0,
            z: 4,
            hp: 112,
            mhp: 112,
            dead: 0,
            cmb: 0,
            auras: [],
          },
          {
            id: 103,
            k: 'player',
            nm: 'Corinjwkynf',
            x: 2,
            z: 2,
            hp: 107,
            mhp: 107,
            dead: 0,
            cmb: 0,
            auras: [],
          },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:103:501:-3:13',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
    expect(result.travelGoal?.target.x).toBeCloseTo(-3.3665, 3);
    expect(result.travelGoal?.target.z).toBeCloseTo(12.7331, 3);
  });

  it('retreats a Fenbridge party to the hub safe point when direct threats pile up', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: -39.8,
          z: 224.1,
          hp: 154,
          mhp: 154,
          res: 58,
          mres: 601,
          rtype: 'mana',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 8,
                hp: 351,
                mhp: 406,
                res: 8,
                mres: 100,
                rtype: 'rage',
                x: -42.5,
                z: 226.5,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'mage',
                level: 7,
                hp: 154,
                mhp: 154,
                res: 58,
                mres: 601,
                rtype: 'mana',
                x: -39.8,
                z: 224.1,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Liorapplbms',
                cls: 'priest',
                level: 7,
                hp: 37,
                mhp: 293,
                res: 150,
                mres: 502,
                rtype: 'mana',
                x: -44.4,
                z: 224.4,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: true, x: -43, z: 224, aggro: 103, auras: [] },
          { id: 502, k: 'mob', h: true, x: -41, z: 226, aggro: 101, auras: [] },
          { id: 503, k: 'mob', h: true, x: -39, z: 223, aggro: 102, auras: [] },
        ],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -18, z: 286 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:mirefen_marsh:-18:286',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Aldenpplbms',
    });
  });

  it('retreats a Highwatch party to the west safe point when Deeprock threats pile up', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 3,
          z: 660,
          hp: 160,
          mhp: 381,
          res: 40,
          mres: 1023,
          rtype: 'mana',
          target: 223,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 14,
                hp: 620,
                mhp: 724,
                res: 8,
                mres: 100,
                rtype: 'rage',
                x: 2,
                z: 660,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'priest',
                level: 14,
                hp: 160,
                mhp: 381,
                res: 40,
                mres: 1023,
                rtype: 'mana',
                x: 3,
                z: 660,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 14,
                hp: 336,
                mhp: 336,
                res: 800,
                mres: 1197,
                rtype: 'mana',
                x: 2,
                z: 661,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 223,
            k: 'mob',
            tid: 'deeprock_kobold',
            h: true,
            x: 3,
            z: 660,
            aggro: 102,
            auras: [],
          },
          ...Array.from({ length: 12 }, (_, index) => ({
            id: 600 + index,
            k: 'mob',
            tid: 'deeprock_kobold',
            h: true,
            x: 6 + index,
            z: 658,
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'priest',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -22, z: 664 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:thornpeak_heights:-22:664',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Aldenpplbms',
    });
  });

  it('retreats a healthy Highwatch party early when direct threats stack in a dense camp', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Aldenpplbms',
          x: -101.4,
          z: 716.2,
          hp: 690,
          mhp: 724,
          res: 9,
          mres: 100,
          rtype: 'rage',
          target: 224,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 15,
                hp: 690,
                mhp: 724,
                res: 9,
                mres: 100,
                rtype: 'rage',
                x: -101.4,
                z: 716.2,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'priest',
                level: 15,
                hp: 402,
                mhp: 402,
                res: 30,
                mres: 1079,
                rtype: 'mana',
                x: -102,
                z: 718,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 15,
                hp: 428,
                mhp: 428,
                res: 1300,
                mres: 1371,
                rtype: 'mana',
                x: -100.9,
                z: 717.8,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovinpplbms',
                cls: 'paladin',
                level: 15,
                hp: 560,
                mhp: 683,
                res: 380,
                mres: 485,
                rtype: 'mana',
                x: -101.3,
                z: 709.1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liorapplbms',
                cls: 'druid',
                level: 15,
                hp: 448,
                mhp: 448,
                res: 520,
                mres: 606,
                rtype: 'mana',
                x: -102.1,
                z: 719.4,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 224,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -104,
            z: 716,
            aggro: 101,
            auras: [],
          },
          {
            id: 237,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -101,
            z: 719,
            aggro: 104,
            auras: [],
          },
          {
            id: 244,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -97,
            z: 722,
            aggro: 105,
            auras: [],
          },
          ...Array.from({ length: 30 }, (_, index) => ({
            id: 700 + index,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -118 + index,
            z: 703 + (index % 9),
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -22, z: 664 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:thornpeak_heights:-22:664',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Aldenpplbms',
    });
  });

  it('lets a low-health paladin heal at the Highwatch safe point before pausing recovery', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 104,
          nm: 'Tovinpplbms',
          x: -23.8,
          z: 665.2,
          hp: 314,
          mhp: 683,
          res: 485,
          mres: 485,
          rtype: 'mana',
          target: null,
          auto: false,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 15,
                hp: 320,
                mhp: 724,
                res: 10,
                mres: 100,
                rtype: 'rage',
                x: -23.9,
                z: 665.3,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'priest',
                level: 15,
                hp: 402,
                mhp: 402,
                res: 20,
                mres: 1079,
                rtype: 'mana',
                x: -24,
                z: 665.4,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 15,
                hp: 428,
                mhp: 428,
                res: 80,
                mres: 1371,
                rtype: 'mana',
                x: -24,
                z: 665.4,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovinpplbms',
                cls: 'paladin',
                level: 15,
                hp: 314,
                mhp: 683,
                res: 485,
                mres: 485,
                rtype: 'mana',
                x: -23.8,
                z: 665.2,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liorapplbms',
                cls: 'druid',
                level: 15,
                hp: 170,
                mhp: 547,
                res: 20,
                mres: 963,
                rtype: 'mana',
                x: -23.8,
                z: 665.2,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 237,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -23,
            z: 665,
            aggro: 105,
            auras: [],
          },
          {
            id: 241,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -24,
            z: 665,
            aggro: 104,
            auras: [],
          },
          ...Array.from({ length: 20 }, (_, index) => ({
            id: 760 + index,
            k: 'mob',
            tid: 'deeprock_ogre',
            h: true,
            x: -36 + index,
            z: 655 + (index % 5),
            aggro: null,
            auras: [],
          })),
        ],
        recentEvents: [],
        playerClass: 'paladin',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result.commands).toEqual([
      { cmd: 'target', id: 105 },
      { cmd: 'cast', ability: 'holy_light' },
    ]);
    expect(result.pauseBrainDrive).toBe(true);
    expect(result.travelGoal).toBeUndefined();
    expect(result.groupMode).toBe('assist_party');
  });

  it('keeps a Bastion bridge pull in hard retreat instead of resuming restock combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Aldenpplbms',
          x: 0,
          z: 318,
          hp: 500,
          mhp: 648,
          res: 8,
          mres: 100,
          rtype: 'rage',
          target: 184,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Aldenpplbms',
                cls: 'warrior',
                level: 12,
                hp: 500,
                mhp: 648,
                res: 8,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 318,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mirapplbms',
                cls: 'priest',
                level: 12,
                hp: 277,
                mhp: 448,
                res: 420,
                mres: 713,
                rtype: 'mana',
                x: -2,
                z: 320,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corinpplbms',
                cls: 'mage',
                level: 12,
                hp: 303,
                mhp: 322,
                res: 691,
                mres: 891,
                rtype: 'mana',
                x: 0,
                z: 318,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 104,
                name: 'Tovinpplbms',
                cls: 'paladin',
                level: 12,
                hp: 512,
                mhp: 602,
                res: 410,
                mres: 606,
                rtype: 'mana',
                x: 0,
                z: 318,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 105,
                name: 'Liorapplbms',
                cls: 'druid',
                level: 12,
                hp: 422,
                mhp: 448,
                res: 403,
                mres: 606,
                rtype: 'mana',
                x: -1,
                z: 319,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 184, k: 'mob', tid: 'sister_nhalia', h: true, x: 1, z: 318, aggro: 101, auras: [] },
          {
            id: 1310,
            k: 'mob',
            tid: 'gravecaller_summoner',
            h: true,
            x: 2,
            z: 319,
            aggro: 104,
            auras: [],
          },
          {
            id: 1311,
            k: 'mob',
            tid: 'gravecaller_cultist',
            h: true,
            x: -2,
            z: 318,
            aggro: 105,
            auras: [],
          },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toMatchObject({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: -18, z: 286 },
        arrivalRange: 2.5,
        goalKey: 'hosted-party-safe-retreat:mirefen_marsh:-18:286',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Aldenpplbms',
    });
  });

  it('anchors a wounded hosted leader on a stable healer instead of a closer damage dealer', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          x: 0,
          z: 0,
          hp: 55,
          mhp: 100,
          res: 20,
          mres: 100,
          rtype: 'rage',
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 55,
                mhp: 100,
                res: 20,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'rogue',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'energy',
                x: 5,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branoracc',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 14,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 101, auras: [] },
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: 5,
            z: 0,
            hp: 100,
            mhp: 100,
            dead: 0,
            cmb: 0,
            auras: [],
          },
          {
            id: 103,
            k: 'player',
            nm: 'Branoracc',
            x: 14,
            z: 0,
            hp: 100,
            mhp: 100,
            dead: 0,
            cmb: 0,
            auras: [],
          },
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
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 26, z: 0 },
        arrivalRange: 1.5,
        goalKey: 'hosted-party-retreat:103:501:26:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('brings a distant hosted follower back to the leader during regroup intent even while in combat', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 40,
          z: 0,
          hp: 100,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 40,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 42, z: 0, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        partyIntent: {
          schemaVersion: 1,
          kind: 'correction',
          behavior: 'regroup',
          key: 'party-intent|correction|regroup',
          summary: 'Tighten formation before moving',
          targetName: 'Branoraaa',
          focusCallerName: 'Branoraaa',
          holdAdvance: true,
          preferAssist: false,
        },
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-regroup-leader:101:0:0',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 40,
    });
  });

  it('brings a combat-split hosted follower back to the leader before local fighting continues', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 102,
          x: 22,
          z: 0,
          hp: 100,
          mhp: 100,
          target: 501,
          auto: true,
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 22,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 501, k: 'mob', h: 80, x: 24, z: 0, aggro: 102, auras: [] }],
        recentEvents: [],
        playerClass: 'mage',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'stopattack' }, { cmd: 'target', id: null }],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 0, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-regroup-leader:101:0:0',
      },
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 22,
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 20,
                mres: 100,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 88,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 3,
                z: 0,
                dead: 0,
                inCombat: 1,
                group: 1,
              },
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
      facing: expect.any(Number),
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'warlock',
                level: 12,
                hp: 90,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 36,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
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
      groupMode: 'recover_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('moves the hosted leader back during regroup intent when the train is split', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: 8,
          z: 433,
          rtype: 'rage',
          res: 0,
          mres: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 14,
                hp: 654,
                mhp: 654,
                res: 0,
                mres: 100,
                rtype: 'rage',
                x: 8,
                z: 433,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 15,
                hp: 402,
                mhp: 402,
                res: 1079,
                mres: 1079,
                rtype: 'mana',
                x: 137,
                z: 528,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Corin',
                cls: 'mage',
                level: 14,
                hp: 336,
                mhp: 336,
                res: 1302,
                mres: 1302,
                rtype: 'mana',
                x: 145,
                z: 527,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
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
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 137, z: 528 },
        arrivalRange: 4,
        goalKey: 'hosted-leader-regroup:102:137:528',
      },
      groupMode: 'hold_regroup',
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 90,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branoracc',
                cls: 'mage',
                level: 12,
                hp: 84,
                mhp: 84,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: -1,
                z: 1,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: 2,
            z: 0,
            hp: 90,
            mhp: 90,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
          {
            id: 103,
            k: 'player',
            nm: 'Branoracc',
            x: -1,
            z: 1,
            hp: 84,
            mhp: 84,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
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

  it('releases Fenbridge safe regroup intent once the party has moved north of the leader', () => {
    const state = createHostedPlayPartyState();

    const result = tickHostedPlayPartyCoordinator(
      {
        liveSelf: liveSelf({
          id: 101,
          nm: 'Hero',
          x: -18,
          z: 286,
          rtype: 'rage',
          res: 0,
          mres: 0,
          auras: [{ id: 'battle_shout', kind: 'buff_ap', rem: 95, dur: 120 }],
          party: {
            leader: 101,
            raid: false,
            members: [
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: -18,
                z: 286,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 90,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: -19,
                z: 296,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 103,
                name: 'Branoracc',
                cls: 'mage',
                level: 12,
                hp: 84,
                mhp: 84,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: -16,
                z: 296,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: -19,
            z: 296,
            hp: 90,
            mhp: 90,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
          {
            id: 103,
            k: 'player',
            nm: 'Branoracc',
            x: -16,
            z: 296,
            hp: 84,
            mhp: 84,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 0,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branorabb',
                cls: 'priest',
                level: 12,
                hp: 90,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 2,
                z: 0,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [
          {
            id: 102,
            k: 'player',
            nm: 'Branorabb',
            x: 2,
            z: 0,
            hp: 90,
            mhp: 90,
            res: 120,
            mres: 120,
            rtype: 'mana',
            dead: 0,
            cmb: 0,
          },
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warlock',
                level: 12,
                hp: 90,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 102, k: 'player', nm: 'Branoraaa', x: 1502, z: -1200, auras: [] }],
        recentEvents: [],
        playerClass: 'warlock',
        partyMode: 'follow_leader',
        ambientDirectory: [],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'cast', ability: 'summon_voidwalker' }],
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
      pauseBrainDrive: true,
      groupMode: 'invite_nearby',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('prefers nearby non-ambient players over closer ambient bot fillers', () => {
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
          { id: 201, k: 'player', nm: 'Ilyraafsn', x: 104, z: 100, dead: 0 },
          { id: 202, k: 'player', nm: 'Cordazxbfwc', x: 112, z: 100, dead: 0 },
        ],
        recentEvents: [],
        playerClass: 'warrior',
        partyMode: 'solo',
        autoInviteNearbyPlayers: true,
        autoInviteNearbyTargetPartySize: 5,
        objectiveSuggestedPartySize: 5,
        ambientDirectory: [ambientBot({ characterId: 201, characterName: 'Ilyraafsn' })],
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'pinvite', id: 202 }],
      pauseBrainDrive: true,
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
        entities: [{ id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 }],
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
      pauseBrainDrive: true,
      groupMode: 'invite_nearby',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
    });
  });

  it('holds advancement while auto-invite waits for the target party size', () => {
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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 100,
                z: 100,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Mira',
                cls: 'priest',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 100,
                mres: 100,
                rtype: 'mana',
                x: 102,
                z: 100,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [],
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
      pauseBrainDrive: true,
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
          entities: [{ id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 }],
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
      entities: [{ id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 }],
      recentEvents: [],
      playerClass: 'warrior' as const,
      partyMode: 'follow_leader' as const,
      autoInviteNearbyPlayers: true,
      autoInviteNearbyTargetPartySize: 5 as const,
      objectiveSuggestedPartySize: 5,
      ambientDirectory: [],
    };

    expect(tickHostedPlayPartyCoordinator({ ...input, nowMs: 5_000 }, state).commands).toEqual([
      { cmd: 'pinvite', id: 202 },
    ]);

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
              {
                pid: 101,
                name: 'Hero',
                cls: 'warrior',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 100,
                z: 100,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Ally',
                cls: 'priest',
                level: 12,
                hp: 90,
                mhp: 90,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 102,
                z: 100,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 202, k: 'player', nm: 'Nearby', x: 108, z: 100, dead: 0 }],
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
              {
                pid: 101,
                name: 'Branoraaa',
                cls: 'warrior',
                level: 12,
                hp: 120,
                mhp: 120,
                res: 0,
                mres: 0,
                rtype: 'rage',
                x: 1500,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
              {
                pid: 102,
                name: 'Hero',
                cls: 'mage',
                level: 12,
                hp: 100,
                mhp: 100,
                res: 120,
                mres: 120,
                rtype: 'mana',
                x: 1502,
                z: -1200,
                dead: 0,
                inCombat: 0,
                group: 1,
              },
            ],
          },
        }),
        entities: [{ id: 203, k: 'player', nm: 'ExtraPlayer', x: 1504, z: -1200, dead: 0 }],
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
