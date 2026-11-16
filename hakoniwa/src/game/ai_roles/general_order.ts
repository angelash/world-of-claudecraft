// general.order: a general picks a plan from the plan menu given a battle summary. Mid tier
// at low effort; story-critical priority. Movement, contact and casualties are resolved by
// rules (docs/40_design/systems/warfare_rts.md 7.1). See docs/50_tech/ai_architecture.md 6.7.

import { definePack } from './shared';
import { GENERAL_ORDER_PROMPT } from './templates/general_order';

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
  ...GENERAL_ORDER_PROMPT,
});
