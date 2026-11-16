// Fallback pack for roles without a pack of their own: low tier, cautious defaults.
// A new decision class should get its own module rather than rely on this one.

import { definePack } from './shared';
import { GENERIC_PROMPT } from './templates/generic';

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
  ...GENERIC_PROMPT,
});
