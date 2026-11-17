// Act-1 alive metrics over 12 game weeks, seeds 16 to 20 (see ./npc_alive_group.ts).

import { describe, it } from 'vitest';
import { aliveGroup, GROUP_TIMEOUT } from './npc_alive_group';

describe('act 1 alive metrics, 12 game weeks', () => {
  it(
    'seeds 16 to 20',
    () => {
      aliveGroup([16, 17, 18, 19, 20]);
    },
    GROUP_TIMEOUT,
  );
});
