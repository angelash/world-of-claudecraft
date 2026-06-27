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
});
