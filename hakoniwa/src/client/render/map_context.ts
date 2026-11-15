// Per-map render data derived once when the player arrives on a map: building roofs,
// standing props (trees, rocks) and the static lamps by doors. Pure.

import type { MapDef } from '../../systems/world/types';
import { type RoofSpec, roofsForMap } from './roofs';
import { doorLights, type SceneLight } from './scene';
import { mapProps } from './tile_art';

export interface MapContext {
  map: MapDef;
  roofs: RoofSpec[];
  props: { kind: 'tree' | 'rock'; tx: number; ty: number; variant: number }[];
  lights: SceneLight[];
}

export function buildMapContext(map: MapDef): MapContext {
  return { map, roofs: roofsForMap(map), props: mapProps(map), lights: doorLights(map) };
}
