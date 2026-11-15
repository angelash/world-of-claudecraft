// general.order: a general picks a plan from the plan menu given a battle summary. Mid tier
// at low effort; story-critical priority. Movement, contact and casualties are resolved by
// rules (docs/40_design/systems/warfare_rts.md 7.1). See docs/50_tech/ai_architecture.md 6.7.

import { definePack } from './shared';

export const generalOrder = definePack({
  role: 'general.order',
  version: '1',
  tier: 'mid',
  effort: 'low',
  maxTokens: 2000,
  cacheTtl: '5m',
  priority: 'B',
  reserved: false,
  timeoutMs: 30_000,
  cooldownMs: 10_000,
  budgetShare: 0.1,
  maxCommands: 3,
  speech: true,
  thought: true,
  speechMaxChars: 60,
  thoughtMaxChars: 80,
  emptyIsDecision: false,
  intro:
    '你扮演《箱庭纪》中的一名将领，根据战况摘要决定部队接下来的方案。题面会给出你的将领卡、战况摘要与可选方案。',
  rules: [
    '战况摘要可能不全；按你的性格决定取舍，例如谨慎、激进或爱惜士卒。',
    '只从【可用命令】中选择，至多三条，参数按说明填写；具体的移动、接敌与伤亡由世界结算。',
    '可以说一句战前训话或军令，写进 speech，至多六十字。',
    '心声至多八十字。',
  ],
});
