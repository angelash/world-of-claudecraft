// npc.batch_diary: one call sketches the day of several off-screen residents of a region
// (L3 batch diary). Low tier, background priority: among the first to degrade.
// No speech or thought fields; everything goes into command data.
// See docs/40_design/systems/npc_society_ai.md 1.1 and docs/50_tech/ai_architecture.md 4.5.

import { definePack } from './shared';
import { NPC_BATCH_DIARY_PROMPT } from './templates/npc_batch_diary';

export const npcBatchDiary = definePack({
  role: 'npc.batch_diary',
  version: '1',
  tier: 'low',
  effort: 'low',
  maxTokens: 6000,
  cacheTtl: '5m',
  priority: 'D',
  reserved: false,
  timeoutMs: 120_000,
  cooldownMs: 60_000,
  budgetShare: 0.1,
  maxCommands: 20,
  speech: false,
  thought: false,
  speechMaxChars: 0,
  thoughtMaxChars: 0,
  emptyIsDecision: false,
  ...NPC_BATCH_DIARY_PROMPT,
});
