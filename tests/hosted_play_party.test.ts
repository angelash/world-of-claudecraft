import { describe, expect, it } from 'vitest';

import {
  createHostedPlayPartyState,
  tickHostedPlayPartyCoordinator,
} from '../server/hosted_play/party';

function liveSelf(input: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 101,
    x: 0,
    z: 0,
    party: null,
    ...input,
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
        partyMode: 'follow_leader',
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'chat', text: '/follow Branoraaa' }],
      pauseBrainDrive: true,
      groupMode: 'follow_leader',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 18,
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
        partyMode: 'follow_leader',
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
        partyMode: 'follow_leader',
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
        partyMode: 'solo',
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
              { pid: 102, name: 'Hero', cls: 'mage', level: 12, hp: 100, mhp: 100, res: 120, mres: 120, rtype: 'mana', x: 0, z: 0, dead: 0, inCombat: 0, group: 1 },
            ],
          },
        }),
        entities: [
          { id: 501, k: 'mob', h: 80, x: 7, z: 0, aggro: 101 },
        ],
        recentEvents: [],
        partyMode: 'follow_leader',
        nowMs: 5_000,
      },
      state,
    );

    expect(result).toEqual({
      commands: [{ cmd: 'target', id: 501 }],
      pauseBrainDrive: true,
      groupMode: 'assist_party',
      groupLeaderName: 'Branoraaa',
      groupLeaderDistance: 8,
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
        partyMode: 'follow_leader',
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
