// Registry of loop scores the music pilot can render, keyed by audio id.

import type { Score } from '../score';
import { SCORE as BORDERSTONE_DAY } from './mus_town_borderstone_day';

export const SCORES: Record<string, Score> = {
  [BORDERSTONE_DAY.id]: BORDERSTONE_DAY,
};
