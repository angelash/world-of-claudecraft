// Role pack registry for the AI layer: one module per decision class, registered here.
// Role names follow docs/50_tech/implementation_conventions.md 7. Tiers follow the
// recommended preset of Q-004 (docs/50_tech/ai_architecture.md 0 and 10.5) and can be
// overridden per role through AiRunnerOptions.roleTiers.

import { type RolePack, RoleRegistry } from '../../ai/roles';
import { generalOrder } from './general_order';
import { genericPack } from './generic';
import { goddessDialogue } from './goddess_dialogue';
import { goddessPlan } from './goddess_plan';
import { npcBatchDiary } from './npc_batch_diary';
import { npcDaily } from './npc_daily';
import { npcDialogue } from './npc_dialogue';
import { officialDecide } from './official_decide';
import { rulerPolicy } from './ruler_policy';
import { sceneImprov } from './scene_improv';

export { COMMON_RULES, definePack, outputRules } from './shared';
export {
  generalOrder,
  genericPack,
  goddessDialogue,
  goddessPlan,
  npcBatchDiary,
  npcDaily,
  npcDialogue,
  officialDecide,
  rulerPolicy,
  sceneImprov,
};

export const ROLE_PACKS: readonly RolePack[] = [
  npcDaily,
  npcDialogue,
  npcBatchDiary,
  goddessPlan,
  goddessDialogue,
  sceneImprov,
  rulerPolicy,
  officialDecide,
  generalOrder,
];

/** A registry with every role pack and the generic fallback for unknown roles. */
export function createRoleRegistry(extra: readonly RolePack[] = []): RoleRegistry {
  return new RoleRegistry(genericPack, [...ROLE_PACKS, ...extra]);
}
