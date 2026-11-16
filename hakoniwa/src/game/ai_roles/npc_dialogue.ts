// npc.dialogue: a core NPC answers one conversational turn (the player or another NPC is
// waiting). Mid tier (Sonnet 5.5) at low effort for latency; reserved, so it degrades last.
// See docs/40_design/systems/npc_society_ai.md 3.4 and docs/50_tech/ai_architecture.md 7.2.

import { definePack } from './shared';
import { NPC_DIALOGUE_PROMPT } from './templates/npc_dialogue';

export const npcDialogue = definePack({
  role: 'npc.dialogue',
  version: '1',
  tier: 'mid',
  effort: 'low',
  maxTokens: 1200,
  cacheTtl: '5m',
  priority: 'A',
  reserved: true,
  timeoutMs: 15_000,
  cooldownMs: 0,
  budgetShare: 0.3,
  maxCommands: 2,
  speech: true,
  thought: true,
  speechMaxChars: 60,
  thoughtMaxChars: 80,
  emptyIsDecision: false,
  ...NPC_DIALOGUE_PROMPT,
});
