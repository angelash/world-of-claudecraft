// scene.improv: an actor (or narrator) improvises inside a scripted scene frame: the
// prologue interview, dreams, set pieces, the act 6 tribunal. Top tier (Opus 5.5); reserved
// because story anchors depend on it. See docs/50_tech/ai_architecture.md 5.12 to 5.14.

import { definePack } from './shared';
import { SCENE_IMPROV_PROMPT } from './templates/scene_improv';

export const sceneImprov = definePack({
  role: 'scene.improv',
  version: '1',
  tier: 'top',
  effort: 'medium',
  maxTokens: 3000,
  cacheTtl: '1h',
  priority: 'B',
  reserved: true,
  timeoutMs: 30_000,
  cooldownMs: 0,
  budgetShare: 0.3,
  maxCommands: 4,
  speech: true,
  thought: true,
  speechMaxChars: 150,
  thoughtMaxChars: 100,
  emptyIsDecision: false,
  ...SCENE_IMPROV_PROMPT,
});
