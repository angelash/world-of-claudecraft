// Which need of a person maps to a request template (quests_and_events.md 6.2 step 3;
// builtin_ai.md 4.2 `giver`, 6.2 `gen_trouble`). Pure; the topic graph reads it for "is
// this person troubled", the request flow for "what would they ask".

import type { Needs, NpcState } from '../../npc/types';

export interface RequestRules {
  /** the share of what the giver can spare that the reward may take */
  cap: number;
  /** a request paying less than this is not worth a posting (talk only) */
  minReward: number;
  /** a need under this is unmet */
  needBelow: number;
  /** need -> request templates (commission ids), first that may post wins */
  needs: Partial<Record<keyof Needs, string[]>>;
}

/** The giver's unmet need (the lowest one under the line among the mapped ones), or null. */
export function unmetNeed(rules: RequestRules, st: NpcState): keyof Needs | null {
  let best: keyof Needs | null = null;
  for (const k of Object.keys(rules.needs) as (keyof Needs)[]) {
    const v = st.needs[k];
    if (v === undefined || v >= rules.needBelow) continue;
    if (best === null || v < (st.needs[best] ?? 100)) best = k;
  }
  return best;
}
