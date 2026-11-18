// Per-map render data derived once when the player arrives on a map, and again when a switch
// tile opens or closes (switch_fade.ts): the style pack, the scene layout (building shells,
// free walls, standees, static lights), the roofs that can open and the far-sky pack. Both
// renderers share it, so the flat fallback and the HD-2D scene show the same trees, decor,
// signs and lamps. `key` names the map and its closed switches: a renderer rebuilds when it
// changes. Pure.

import type { SkyPack } from '../../systems/world/atlas';
import type { MapDef } from '../../systems/world/types';
import { buildLayout, type SceneLayout } from '../hd2d/layout';
import { skyPackFor } from '../hd2d/sky';
import { type StylePack, stylePackFor } from '../hd2d/style_packs';
import { type RoofSpec, roofsForMap } from './roofs';

export interface MapContext {
  /** the live map: the content map with its closed switches painted in */
  map: MapDef;
  /** map id and closed switch ids */
  key: string;
  pack: StylePack;
  layout: SceneLayout;
  roofs: RoofSpec[];
  /** the far sky the map shows (art_pipeline.md 2.13), null indoors */
  sky: SkyPack | null;
}

export function buildMapContext(
  map: MapDef,
  opts: { switchKey?: string; atlasSky?: string } = {},
): MapContext {
  const pack = stylePackFor(map);
  return {
    map,
    key: `${map.id}|${opts.switchKey ?? ''}`,
    pack,
    layout: buildLayout(map, pack),
    roofs: roofsForMap(map),
    sky: skyPackFor(map, opts.atlasSky),
  };
}
