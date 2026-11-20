// The autoplayer on a roam node (onboarding_interaction.md 5.3): take the route's choice, walk
// to its touch point, then use it. A standing choice is taken by walking into its place and
// waiting for the node's timer there; a hidden timed choice (staying put) by waiting only.
// Pure: it reads the scene view and the roam query and says what to do next.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { roamPoints, type SceneView } from '../../systems/scenes';
import { nearestWalkable, playerEntity, walkMap } from '../../systems/world';

/** Close enough to a standing place's middle to wait there (walkTo stops within 0.6). */
const STAND_NEAR = 0.8;

export type RoamStep =
  | { kind: 'choose'; choiceId: string }
  | { kind: 'walk'; mapId: string; x: number; y: number }
  | { kind: 'wait' };

/** What the autoplayer does on the open roam node, given the route's pick among the choices. */
export function roamStep(
  world: World,
  content: ContentMap,
  sv: SceneView,
  pick: (choiceIds: string[]) => string,
): RoamStep {
  const choiceId = pick(sv.choices.map((c) => c.id));
  const choice = sv.choices.find((c) => c.id === choiceId);
  if (!choice) return { kind: 'wait' };
  // staying put until the timer: the hidden timed choice (the bench of the prologue stance)
  if (choice.hidden && !choice.stand) return { kind: 'wait' };
  const point = roamPoints(world, content).find((p) => p.id === choiceId);
  const p = playerEntity(world);
  // a point the roam query does not list (closed meanwhile) is left to the node's timer
  if (!point || !p) return { kind: 'wait' };
  const mapId = p.mapId;
  if (choice.stand) {
    // stand near the middle of the place, then let the timer take it (the walk stops at 0.6)
    return Math.hypot(point.x - p.x, point.y - p.y) <= STAND_NEAR
      ? { kind: 'wait' }
      : { kind: 'walk', mapId, x: point.x, y: point.y };
  }
  if (point.inReach) return { kind: 'choose', choiceId };
  // a touch point often stands on a wall, a fixture or a closed switch tile (the prologue's
  // curtain): walk to the nearest floor tile of the live map
  const map = walkMap({ content, world }, mapId);
  const floor = map ? nearestWalkable(map, point.x, point.y) : null;
  return { kind: 'walk', mapId, x: floor?.x ?? point.x, y: floor?.y ?? point.y };
}
