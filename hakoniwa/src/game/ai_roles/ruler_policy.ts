// ruler.policy: a nation or faction leader picks the next policy from an intent menu.
// Mid tier, medium effort, routine priority. Public documents go into command data.
// See docs/40_design/systems/npc_society_ai.md 8 and docs/50_tech/ai_architecture.md 6.

import { definePack } from './shared';
import { RULER_POLICY_PROMPT } from './templates/ruler_policy';

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
  ...RULER_POLICY_PROMPT,
});
