// goddess.plan: a goddess's daily planning turn (L0). Mid tier (Sonnet 5.5), medium effort,
// 1 hour cache (planning turns are a game day, about 24 real minutes, apart). An empty plan
// is a valid decision ("not acting this round").
// See docs/40_design/systems/goddess_gm.md and docs/50_tech/ai_architecture.md 5.2.

import { definePack } from './shared';
import { GODDESS_PLAN_PROMPT } from './templates/goddess_plan';

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
  ...GODDESS_PLAN_PROMPT,
});
