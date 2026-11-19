// Calibrated first-clear and discovery data, independent from cosmetic deed rewards.
import data from '../../../data/records/xp_rewards.json';
import { xpRewardsProblems } from '../../systems/records/xp';
import type { XpRewardsData } from '../../systems/records/xp_types';
import type { ContentPack } from '../pack';

export const pack: ContentPack = {
  id: 'xp_rewards',
  tables: { xpRewards: data as unknown as XpRewardsData },
  validate: xpRewardsProblems,
};
