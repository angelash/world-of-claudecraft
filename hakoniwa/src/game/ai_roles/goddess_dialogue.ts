// goddess.dialogue: a goddess talks with the player (the showpiece conversation). Top tier
// (Opus 5.5), medium effort, 1 hour cache; reserved and interactive, so it degrades last.
// See docs/40_design/systems/goddess_gm.md 6 and docs/50_tech/ai_architecture.md 5.5.

import { definePack } from './shared';
import { GODDESS_DIALOGUE_PROMPT } from './templates/goddess_dialogue';

export const goddessDialogue = definePack({
  role: 'goddess.dialogue',
  version: '1',
  tier: 'top',
  effort: 'medium',
  maxTokens: 3000,
  cacheTtl: '1h',
  priority: 'A',
  reserved: true,
  timeoutMs: 30_000,
  cooldownMs: 0,
  budgetShare: 0.4,
  maxCommands: 2,
  speech: true,
  thought: true,
  speechMaxChars: 120,
  thoughtMaxChars: 100,
  emptyIsDecision: false,
  ...GODDESS_DIALOGUE_PROMPT,
});
