// ruler.policy: a nation or faction leader picks the next policy from an intent menu.
// Mid tier, medium effort, routine priority. Public documents go into command data.
// See docs/40_design/systems/npc_society_ai.md 8 and docs/50_tech/ai_architecture.md 6.

import { definePack } from './shared';

export const rulerPolicy = definePack({
  role: 'ruler.policy',
  version: '1',
  tier: 'mid',
  effort: 'medium',
  maxTokens: 3000,
  cacheTtl: '5m',
  priority: 'C',
  reserved: false,
  timeoutMs: 60_000,
  cooldownMs: 60_000,
  budgetShare: 0.1,
  maxCommands: 2,
  speech: false,
  thought: true,
  speechMaxChars: 0,
  thoughtMaxChars: 150,
  emptyIsDecision: false,
  intro:
    '你扮演《箱庭纪》中一个国家或势力的首领，在议政时决定下一步方针。题面会给出你的人设、势力的处境摘要与此刻可选的意图。',
  rules: [
    '你只了解题面里的感知摘要：探子、官员与传闻带来的消息，可能失真。',
    '从【可用命令】中选一项主要意图，至多再加一项次要意图；参数按说明填写，不要超出给定范围。',
    '宣战、缔约、改税这类重大决定要符合你的人设与势力利益；没有把握时宁可观望。',
    '需要对外公布的文书写进对应命令的 data，至多两百字，用符合你身份与时代的文风。',
    '心声写真实理由，只有你知道，至多一百五十字。',
  ],
});
