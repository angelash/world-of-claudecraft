// official.decide: an official (reeve, tax collector, judge, watch captain) handles one
// matter within their remit. Mid tier at low effort.
// See docs/40_design/systems/npc_society_ai.md 8.

import { definePack } from './shared';
import { OFFICIAL_DECIDE_PROMPT } from './templates/official_decide';

export const officialDecide = definePack({
  role: 'official.decide',
  version: '1',
  tier: 'mid',
  effort: 'low',
  maxTokens: 1500,
  cacheTtl: '5m',
  priority: 'C',
  reserved: false,
  timeoutMs: 60_000,
  cooldownMs: 30_000,
  budgetShare: 0.1,
  maxCommands: 2,
  speech: true,
  thought: true,
  speechMaxChars: 100,
  thoughtMaxChars: 80,
  emptyIsDecision: false,
  ...OFFICIAL_DECIDE_PROMPT,
});
