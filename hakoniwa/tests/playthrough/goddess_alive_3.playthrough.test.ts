// Act-1 goddess metrics over the whole act, seeds 11 to 15 (see ./goddess_alive_group.ts).

import { describe, it } from 'vitest';
import { GODDESS_GROUP_TIMEOUT, goddessAliveGroup } from './goddess_alive_group';

describe('act 1 goddess metrics, the whole act', () => {
  it(
    'seeds 11 to 15',
    () => {
      goddessAliveGroup([11, 12, 13, 14, 15]);
    },
    GODDESS_GROUP_TIMEOUT,
  );
});
