// npc.daily: a named resident decides the next stretch of their day (L1 life turn and L2
// day plan). Low tier (Haiku 5.5), low effort: high volume, short answers.
// See docs/40_design/systems/npc_society_ai.md 3 and docs/50_tech/ai_architecture.md 7.2.

import { definePack } from './shared';
import { NPC_DAILY_PROMPT } from './templates/npc_daily';

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
  ...NPC_DAILY_PROMPT,
});
