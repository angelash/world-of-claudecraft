// Act-1 goddess metrics over the whole act, seeds 16 to 20 (see ./goddess_alive_group.ts).

import { describe, it } from 'vitest';
import { GODDESS_GROUP_TIMEOUT, goddessAliveGroup } from './goddess_alive_group';

describe('act 1 goddess metrics, the whole act', () => {
  it(
    'seeds 16 to 20',
    () => {
      goddessAliveGroup([16, 17, 18, 19, 20]);
    },
    GODDESS_GROUP_TIMEOUT,
  );
});
