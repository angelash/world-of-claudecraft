import { canStartMobAggro } from './mob/aggro_gate';
import { questGateBlocksAggro } from './mob/quest_gated_aggro';
import type { SimContext } from './sim_context';
import type { AiActiveMobActionFailureReason, Entity } from './types';

export function aiActiveMobAdmissionReason(
  ctx: Pick<SimContext, 'entities' | 'players'>,
  mob: Entity,
  player: Entity,
  mobsFrozen: boolean,
): AiActiveMobActionFailureReason | null {
  return !canStartMobAggro(ctx.entities, mob, player, mobsFrozen) ||
    questGateBlocksAggro(ctx.players, mob, player)
    ? 'state_blocked'
    : null;
}

export function npcHasScriptedMovement(npc: Pick<Entity, 'wanderTarget' | 'route'>): boolean {
  return Boolean(npc.wanderTarget) || (npc.route?.points.length ?? 0) >= 2;
}
