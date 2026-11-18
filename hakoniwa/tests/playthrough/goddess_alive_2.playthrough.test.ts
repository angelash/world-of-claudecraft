// Act-1 goddess metrics over the whole act, seeds 6 to 10 (see ./goddess_alive_group.ts).

import { describe, it } from 'vitest';
import { GODDESS_GROUP_TIMEOUT, goddessAliveGroup } from './goddess_alive_group';

describe('act 1 goddess metrics, the whole act', () => {
  it(
    'seeds 6 to 10',
    () => {
      goddessAliveGroup([6, 7, 8, 9, 10]);
    },
    GODDESS_GROUP_TIMEOUT,
  );
});
