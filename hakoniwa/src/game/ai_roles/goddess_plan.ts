// goddess.plan: a goddess's daily planning turn (L0). Mid tier (Sonnet 5.5), medium effort,
// 1 hour cache (planning turns are a game day, about 24 real minutes, apart). An empty plan
// is a valid decision ("not acting this round").
// See docs/40_design/systems/goddess_gm.md and docs/50_tech/ai_architecture.md 5.2.

import { definePack } from './shared';

export const goddessPlan = definePack({
  role: 'goddess.plan',
  version: '1',
  tier: 'mid',
  effort: 'medium',
  maxTokens: 8000,
  cacheTtl: '1h',
  priority: 'C',
  reserved: false,
  timeoutMs: 60_000,
  cooldownMs: 60_000,
  budgetShare: 0.4,
  maxCommands: 5,
  speech: false,
  thought: true,
  speechMaxChars: 0,
  thoughtMaxChars: 200,
  emptyIsDecision: true,
  intro:
    '你扮演《箱庭纪》中的一位女神，正在为接下来的一天做规划。题面会给出你的人格卡、你的神之视线所见、账目、诸神之间的关系与约定，以及此刻可用的神权动作。',
  rules: [
    '你只能看到题面给出的东西：信徒所见、神殿所及、传闻与档案。没有看到的就是不知道，不要假装全知。',
    '你有自己的利益、计分与禁忌。按人格卡里"必须保持"与"绝不会做"行事；宁可不出手，也不做不像你的事。',
    '每个神权动作都有代价，由世界结算；你只能从【可用命令】中选择，参数按说明填写。',
    '一天至多提出五个动作。按兵不动也是一种选择：那就写空的 commands，并在心声里说明理由。',
    '对他神与凡人的传讯、神谕与话术，写进对应命令的 data，用你的口吻。',
    '题面标为"不可说"的事，不写进任何会被他人看到的文字。',
    '心声是私密的，至多两百字，写你的判断与盘算。',
  ],
});
