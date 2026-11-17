// Where an entity stands relative to a gathering node or a work station: the places are map
// locations (the map documents belong to the maps package; this system only names them), and
// an entity counts as there when it stands on that map inside the location's rectangle or
// within `reach` tiles of it.

import type { ContentMap } from '../../core/contracts';
import type { World } from '../../core/world';
import { getEntity, mapById } from '../world';
import type { Entity, LocationDef } from '../world/types';
import type { Place } from './types';

/** The location a place names, or undefined when the map or the location is not built. */
export function placeLocation(content: ContentMap, p: Place): LocationDef | undefined {
  return mapById(content, p.mapId)?.locations.find((l) => l.id === p.location);
}

/** Whether a point lies in a location's rectangle grown by `reach` tiles on every side. */
export function nearLocation(l: LocationDef, x: number, y: number, reach: number): boolean {
  return x >= l.x - reach && x < l.x + l.w + reach && y >= l.y - reach && y < l.y + l.h + reach;
}

/** The first of the places the entity stands at, if any. */
export function placeOf(
  content: ContentMap,
  e: Pick<Entity, 'mapId' | 'x' | 'y'>,
  places: readonly Place[],
  reach: number,
): Place | undefined {
  for (const p of places) {
    if (p.mapId !== e.mapId) continue;
    const l = placeLocation(content, p);
    if (l && nearLocation(l, e.x, e.y, reach)) return p;
  }
  return undefined;
}

/** The entity an id names, if it stands in the world. */
export function entityOf(world: World, id: string): Entity | undefined {
  return getEntity(world, id);
}
