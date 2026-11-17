// Act-1 alive metrics over 12 game weeks, seeds 6 to 10 (see ./npc_alive_group.ts).

import { describe, it } from 'vitest';
import { aliveGroup, GROUP_TIMEOUT } from './npc_alive_group';

describe('act 1 alive metrics, 12 game weeks', () => {
  it(
    'seeds 6 to 10',
    () => {
      aliveGroup([6, 7, 8, 9, 10]);
    },
    GROUP_TIMEOUT,
  );
});
