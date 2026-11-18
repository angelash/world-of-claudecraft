// Act-1 goddess metrics over the whole act, seeds 1 to 5 (see ./goddess_alive_group.ts).

import { describe, it } from 'vitest';
import { GODDESS_GROUP_TIMEOUT, goddessAliveGroup } from './goddess_alive_group';

describe('act 1 goddess metrics, the whole act', () => {
  it(
    'seeds 1 to 5',
    () => {
      goddessAliveGroup([1, 2, 3, 4, 5]);
    },
    GODDESS_GROUP_TIMEOUT,
  );
});
