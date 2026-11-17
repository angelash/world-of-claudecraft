// Act-1 alive metrics over 12 game weeks, seeds 1 to 5 (see ./npc_alive_group.ts).

import { describe, it } from 'vitest';
import { aliveGroup, GROUP_TIMEOUT } from './npc_alive_group';

describe('act 1 alive metrics, 12 game weeks', () => {
  it(
    'seeds 1 to 5',
    () => {
      aliveGroup([1, 2, 3, 4, 5]);
    },
    GROUP_TIMEOUT,
  );
});
