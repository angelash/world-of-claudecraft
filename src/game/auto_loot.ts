import { INTERACT_RANGE, dist2d, type Entity } from '../sim/types';
import type { PartyInfo } from '../world_api';

export const AUTO_LOOT_OPEN_RANGE = INTERACT_RANGE;
export const AUTO_LOOT_REARM_RANGE = INTERACT_RANGE + 2;

export interface AutoLootWorld {
  player: Entity;
  playerId: number;
  partyInfo?: PartyInfo | null;
  entities: Map<number, Entity>;
}

export interface AutoLootState {
  suppressedCorpseId: number | null;
}

export function createAutoLootState(): AutoLootState {
  return { suppressedCorpseId: null };
}

export function corpseHasVisibleLoot(corpse: Entity, playerId: number, partyInfo?: PartyInfo | null): boolean {
  if (corpse.kind !== 'mob' || !corpse.dead || !corpse.lootable || !corpse.loot) return false;
  const hasSharedLootRights = corpse.tappedById === null
    || corpse.tappedById === playerId
    || !!partyInfo?.members.some((member) => member.pid === corpse.tappedById);
  if (hasSharedLootRights && corpse.loot.copper > 0) return true;
  return corpse.loot.items.some((slot) => {
    if (slot.count <= 0) return false;
    if (slot.openToAll || slot.personalFor?.includes(playerId)) return true;
    return hasSharedLootRights && !slot.personalFor;
  });
}

export function nearestAutoLootCorpse(world: AutoLootWorld, state: AutoLootState): number | null {
  const suppressed = state.suppressedCorpseId === null ? null : world.entities.get(state.suppressedCorpseId);
  if (!suppressed || !corpseHasVisibleLoot(suppressed, world.playerId, world.partyInfo)
      || dist2d(world.player.pos, suppressed.pos) > AUTO_LOOT_REARM_RANGE) {
    state.suppressedCorpseId = null;
  }

  let bestId: number | null = null;
  let bestDistance = AUTO_LOOT_OPEN_RANGE;
  for (const entity of world.entities.values()) {
    if (entity.id === state.suppressedCorpseId || !corpseHasVisibleLoot(entity, world.playerId, world.partyInfo)) continue;
    const distance = dist2d(world.player.pos, entity.pos);
    if (distance <= bestDistance) {
      bestId = entity.id;
      bestDistance = distance;
    }
  }
  return bestId;
}
