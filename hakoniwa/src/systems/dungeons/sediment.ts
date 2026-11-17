// What the nests do to the sediment level of their map (catalog_bestiary.md 2.8): a full
// nest (stage 3 and on) raises its map one level; a destroyed nest's core scatters and keeps
// the map one level up for a season after the collapse; a purified nest lowers it one level
// for good. The stored levels (world/sediment.ts sedimentAt: the map's level and the
// location hot spots) stay as the data writes them; localSediment adds the nests on top.
// Pure functions of the world and the content.

import type { ContentMap } from '../../core/contracts';
import { TICKS_PER_GAME_DAY } from '../../core/time';
import { SEDIMENT_CRITICAL, sedimentAt } from '../world/sediment';
import type { MapDef } from '../world/types';
import type { DungeonConfig, NestState } from './types';

/** The levels one nest adds to its map now (-1, 0 or +1). */
export function nestSedimentDelta(cfg: DungeonConfig, st: NestState, now: number): number {
  if (!st.live) return 0;
  if (st.purified) return -1;
  if (st.collapsed)
    return now < st.collapsedTick + cfg.nest.destroyDays * TICKS_PER_GAME_DAY ? 1 : 0;
  return st.stage >= cfg.nest.fullStage ? 1 : 0;
}

type World = { meta: { tick: number }; slices: object };

/** The levels the nests on a map add to it now. */
export function sedimentDelta(
  world: World,
  content: Pick<ContentMap, 'nests' | 'dungeonConfig'>,
  mapId: string,
): number {
  const cfg = content.dungeonConfig;
  const nests = (world.slices as { dungeons?: { nests: Record<string, NestState> } }).dungeons
    ?.nests;
  if (!cfg || !nests) return 0;
  let out = 0;
  for (const def of content.nests ?? []) {
    if (def.mapId !== mapId) continue;
    const st = nests[def.id];
    if (st) out += nestSedimentDelta(cfg, st, world.meta.tick);
  }
  return out;
}

/**
 * The canon sediment level at a point with the nests counted: the stored level
 * (sedimentAt) plus the nests' change to the map, held to 0..6.
 */
export function localSediment(
  world: World,
  content: Pick<ContentMap, 'nests' | 'dungeonConfig'>,
  map: MapDef,
  x: number,
  y: number,
): number {
  const level = sedimentAt(map, x, y) + sedimentDelta(world, content, map.id);
  return Math.max(0, Math.min(SEDIMENT_CRITICAL, level));
}
