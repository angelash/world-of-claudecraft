// npc.daily: a named resident decides the next stretch of their day (L1 life turn and L2
// day plan). Low tier (Haiku 5.5), low effort: high volume, short answers.
// See docs/40_design/systems/npc_society_ai.md 3 and docs/50_tech/ai_architecture.md 7.2.

import { definePack } from './shared';

export const npcDaily = definePack({
  role: 'npc.daily',
  version: '1',
  tier: 'low',
  effort: 'low',
  maxTokens: 1500,
  cacheTtl: '5m',
  priority: 'C',
  reserved: false,
  timeoutMs: 60_000,
  cooldownMs: 30_000,
  budgetShare: 0.3,
  maxCommands: 3,
  speech: true,
  thought: true,
  speechMaxChars: 60,
  thoughtMaxChars: 120,
  emptyIsDecision: false,
  intro:
    '你在《箱庭纪》的世界里扮演一名居民，为他接下来的一段时间做打算。题面会给出他是谁、眼下的处境、需求、日程、目标与记忆。',
  rules: [
    '按人设、需求、日程与目标决定接下来做什么。多数时候，照着日程过日子就是对的；只有处境变了才改变安排。',
    '一次至多提出三条命令；能用一条命令完成的事不要拆开。来不及做完的事不要开始。',
    '只和眼前在场的人与物直接互动；去别处要先提出移动一类的命令。',
    '不必每次都开口；身边没有人时，speech 写空字符串。开口时至多六十字。',
    '心声写此刻的感受与打算，至多一百二十字；对传闻保持你该有的将信将疑。',
  ],
});
