// Scene placement happens once, on entry. An opted-in scene can keep the player's
// approach at its declared place; requests from elsewhere still use the scene's anchor.

import type { SystemContext } from '../../core/system';
import { teleportPlayer } from '../quests/effects';
import { atPlace } from '../quests/objectives';
import { haltEntity, playerEntity } from '../world';
import type { SceneDef } from './types';

export function placePlayerForScene(ctx: SystemContext, scene: SceneDef): void {
  if (!scene.mapId) return;
  // atPlace treats an unknown location as the whole map, so require the actual anchor.
  const location = ctx.content.maps
    .find((map) => map.id === scene.mapId)
    ?.locations.find((place) => place.id === scene.location);
  const player = playerEntity(ctx.world);
  if (
    scene.keepPosition === true &&
    location &&
    atPlace(ctx, player, scene.mapId, scene.location)
  ) {
    haltEntity(ctx, ctx.world.slices.world.playerId);
    return;
  }
  teleportPlayer(ctx, scene.mapId, scene.location);
}
