// Fallback pack for roles without a pack of their own: low tier, cautious defaults.
// A new decision class should get its own module rather than rely on this one.

import { definePack } from './shared';

export const genericPack = definePack({
  role: '*',
  version: '1',
  tier: 'low',
  effort: 'low',
  maxTokens: 1500,
  cacheTtl: '5m',
  priority: 'C',
  reserved: false,
  timeoutMs: 60_000,
  cooldownMs: 10_000,
  budgetShare: 0.1,
  maxCommands: 3,
  speech: true,
  thought: true,
  speechMaxChars: 80,
  thoughtMaxChars: 100,
  emptyIsDecision: false,
  intro:
    '你在《箱庭纪》的世界里扮演题面描述的这个角色，为眼前的情况做一个决定。题面会给出角色是谁、眼下的处境与可用命令。',
  rules: [
    '按人设与处境，从【可用命令】中选择合适的命令，至多三条；参数按说明填写。',
    '没有合适的命令就写空的 commands。',
    '需要开口时写进 speech，至多八十字；心声至多一百字。',
  ],
});
