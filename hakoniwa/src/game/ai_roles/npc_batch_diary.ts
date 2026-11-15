// npc.batch_diary: one call sketches the day of several off-screen residents of a region
// (L3 batch diary). Low tier, background priority: among the first to degrade.
// No speech or thought fields; everything goes into command data.
// See docs/40_design/systems/npc_society_ai.md 1.1 and docs/50_tech/ai_architecture.md 4.5.

import { definePack } from './shared';

export const npcBatchDiary = definePack({
  role: 'npc.batch_diary',
  version: '1',
  tier: 'low',
  effort: 'low',
  maxTokens: 6000,
  cacheTtl: '5m',
  priority: 'D',
  reserved: false,
  timeoutMs: 120_000,
  cooldownMs: 60_000,
  budgetShare: 0.1,
  maxCommands: 20,
  speech: false,
  thought: false,
  speechMaxChars: 0,
  thoughtMaxChars: 0,
  emptyIsDecision: false,
  intro:
    '你是一位冷静的记录者，为一个地区的若干居民推演他们今天各自过得怎样。题面会给出名册、各人的处境，以及当天发生的事。',
  rules: [
    '只写名册里的人，只用题面给出的事件、地点与物品；不发明新的人物、地点、组织与历史。',
    '每个人挑选至多三件今天对他重要的事，用他自己的口吻写一句说法（至多四十字）与一句心声（至多三十字）。',
    '不让任何人知道他不该知道的事；传闻就写成传闻，带上"听说"的口气。',
    '世界里发生过什么只能来自题面，你只是在已有的事上替各人取舍与添上口吻。',
    '结果按【可用命令】的说明写进命令的 data；通常一条命令就装下全部条目。',
  ],
});
