// Act-1 alive metrics over 12 game weeks, seeds 11 to 15 (see ./npc_alive_group.ts).

import { describe, it } from 'vitest';
import { aliveGroup, GROUP_TIMEOUT } from './npc_alive_group';

describe('act 1 alive metrics, 12 game weeks', () => {
  it(
    'seeds 11 to 15',
    () => {
      aliveGroup([11, 12, 13, 14, 15]);
    },
    GROUP_TIMEOUT,
  );
});
