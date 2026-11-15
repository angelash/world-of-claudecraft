import { dist2d, INTERACT_RANGE } from '../sim/types';
import type { IWorld } from '../world_api';

export type InspectWorld = Pick<
  IWorld,
  'player' | 'entities' | 'aiInspectObject' | 'aiInspectScene'
>;

/** The keyboard and controller share the same object-first inspection rule. */
export function inspectNearby(world: InspectWorld, language: string): void {
  const player = world.player;
  let nearest: number | null = null;
  let distance = INTERACT_RANGE + 1;
  for (const entity of world.entities.values()) {
    if (entity.kind !== 'object' || !entity.lootable) continue;
    const candidate = dist2d(player.pos, entity.pos);
    if (candidate < distance) {
      nearest = entity.id;
      distance = candidate;
    }
  }
  if (nearest !== null) {
    world.aiInspectObject(nearest, language);
    return;
  }
  world.aiInspectScene(language);
}
