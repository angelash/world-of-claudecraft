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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Darian', cls: 'paladin', level: 12, hp: 110, mhp: 110, res: 120, mres: 120, rtype: 'mana', x: 1538, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 101, k: 'player', nm: 'Branoraaa', x: 1500, z: -1200, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', dead: 0, cmb: 0, auras: [] },
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
      commands: [{ cmd: 'chat', text: '/follow Branoraaa' }],
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
    state.lastFollowCommandAtMs = 5_000;

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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 1500, z: -1200, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Corda', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 1576, z: -1200, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 101, k: 'player', nm: 'Branoraaa', x: 1500, z: -1200, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', dead: 0, cmb: 0, auras: [] },
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
            { pid: 101, name: 'Branoraaa', cls: 'warrior' as const, level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage' as const, x: 12, z: 0, dead: 0, inCombat: 1, group: 1 as const },
            { pid: 102, name: 'Hero', cls: 'mage' as const, level: 12, hp: 26, mhp: 100, res: 100, mres: 120, rtype: 'mana' as const, x: 0, z: 0, dead: 0, inCombat: 1, group: 1 as const },
          ],
        },
      }),
      entities: [
        { id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 102 },
      ],
      recentEvents: [],
      playerClass: 'mage' as const,
      partyMode: 'follow_leader' as const,
      ambientDirectory: [],
      nowMs: 5_000,
    };

    const result = tickHostedPlayPartyCoordinator(
      input,
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
        target: { x: 12, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:101:12:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 12,
    });

    const retry = tickHostedPlayPartyCoordinator(
      { ...input, nowMs: 8_000 },
      state,
    );

    expect(retry.commands).toEqual([
      { cmd: 'stopattack' },
      { cmd: 'target', id: null },
    ]);
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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 12, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 70, mhp: 100, res: 100, mres: 120, rtype: 'mana', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
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
      commands: [
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 12, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:101:12:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 12,
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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'rogue', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'energy', x: 30, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 103, name: 'Branorabb', cls: 'priest', level: 12, hp: 20, mhp: 100, res: 80, mres: 100, rtype: 'mana', x: 24, z: 0, dead: 0, inCombat: 1, group: 1 },
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
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 16, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 103, name: 'Branorabb', cls: 'priest', level: 12, hp: 24, mhp: 100, res: 80, mres: 100, rtype: 'mana', x: 13, z: 0, dead: 0, inCombat: 1, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 3, z: 0, aggro: 101, auras: [] },
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
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 16, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 103, name: 'Branorabb', cls: 'priest', level: 12, hp: 70, mhp: 100, res: 80, mres: 100, rtype: 'mana', x: 13, z: 0, dead: 0, inCombat: 1, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 3, z: 0, aggro: 101, auras: [] },
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
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 102, name: 'Hero', cls: 'rogue', level: 12, hp: 60, mhp: 100, res: 120, mres: 120, rtype: 'energy', x: 16, z: 0, dead: 0, inCombat: 0, group: 1 },
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
        arrivalRange: 4,
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
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 60, mhp: 100, res: 20, mres: 100, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'priest', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 12, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 101, auras: [] },
          { id: 102, k: 'player', nm: 'Branorabb', x: 12, z: 0, hp: 100, mhp: 100, dead: 0, cmb: 0, auras: [] },
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
        target: { x: 12, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:102:12:0',
      },
      groupMode: 'assist_party',
      groupLeaderName: 'Hero',
      groupLeaderDistance: 0,
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
              { pid: 101, name: 'Hero', cls: 'warrior', level: 12, hp: 55, mhp: 100, res: 20, mres: 100, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Branorabb', cls: 'rogue', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'energy', x: 5, z: 0, dead: 0, inCombat: 0, group: 1 },
              { pid: 103, name: 'Branoracc', cls: 'priest', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 14, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 2, z: 0, aggro: 101, auras: [] },
          { id: 102, k: 'player', nm: 'Branorabb', x: 5, z: 0, hp: 100, mhp: 100, dead: 0, cmb: 0, auras: [] },
          { id: 103, k: 'player', nm: 'Branoracc', x: 14, z: 0, hp: 100, mhp: 100, dead: 0, cmb: 0, auras: [] },
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
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
      pauseBrainDrive: true,
      travelGoal: {
        target: { x: 14, z: 0 },
        arrivalRange: 4,
        goalKey: 'hosted-party-recover:103:14:0',
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
              { pid: 101, name: 'Branoraaa', cls: 'warrior', level: 12, hp: 120, mhp: 120, res: 0, mres: 0, rtype: 'rage', x: 0, z: 0, dead: 0, inCombat: 1, group: 1 },
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 40, z: 0, dead: 0, inCombat: 1, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 42, z: 0, aggro: 102, auras: [] },
        ],
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
      commands: [
        { cmd: 'stopattack' },
        { cmd: 'target', id: null },
      ],
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
        ambientDirectory: [
          ambientBot({ characterId: 201, characterName: 'Ilyraafsn' }),
        ],
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
