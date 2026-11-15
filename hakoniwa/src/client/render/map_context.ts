// Per-map render data derived once when the player arrives on a map: the style pack, the
// scene layout (building shells, free walls, standees, static lights) and the roofs that
// can open. Both renderers share it, so the flat fallback and the HD-2D scene show the
// same trees, decor, signs and lamps. Pure.

import type { MapDef } from '../../systems/world/types';
import { buildLayout, type SceneLayout } from '../hd2d/layout';
import { type StylePack, stylePackFor } from '../hd2d/style_packs';
import { type RoofSpec, roofsForMap } from './roofs';

export interface MapContext {
  map: MapDef;
  pack: StylePack;
  layout: SceneLayout;
  roofs: RoofSpec[];
}

export function buildMapContext(map: MapDef): MapContext {
  const pack = stylePackFor(map);
  return { map, pack, layout: buildLayout(map, pack), roofs: roofsForMap(map) };
}
