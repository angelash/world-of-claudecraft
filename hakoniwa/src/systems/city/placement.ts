// Placement validator (city_building 3.4): one deterministic, pure check shared by the
// player, officials and the client preview. It returns a machine code plus a readable
// reason (a TextRef) and the footprint tiles for highlighting. Buildings do not change the
// world's walkability (MapDef is immutable), so reachability is checked here instead.

import { contentText } from '../../core/content_key';
import type { ContentMap } from '../../core/contracts';
import { type KeyText, type TextRef, tr } from '../../core/text';
import { isWalkableTile, type LocationDef, type MapDef, mapById, tileAt } from '../world';
import type { TileKind } from '../world/types';
import {
  buildingDef,
  type CityWorld,
  countBuildings,
  flagsOk,
  hasActive,
  siteDef,
  stageAtLeast,
} from './common';
import { buildingCap } from './court_tiers';
import { type BuildingDef, type SiteDef, type SiteState, type Stage, stageLabel } from './types';

export interface Tile {
  x: number;
  y: number;
}

export type PlacementCode =
  | 'unknown_site'
  | 'unknown_building'
  | 'site_kind'
  | 'site_closed'
  | 'locked'
  | 'limit'
  | 'bounds'
  | 'terrain'
  | 'road'
  | 'overlap'
  | 'entrance'
  | 'reach'
  | 'keep_reach';

export type PlacementResult =
  | { ok: true; tiles: Tile[]; entrance: Tile }
  | { ok: false; code: PlacementCode; reason: TextRef; tiles: Tile[]; blocked: Tile[] };

export function footprintTiles(x: number, y: number, w: number, h: number): Tile[] {
  const out: Tile[] = [];
  for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) out.push({ x: x + dx, y: y + dy });
  return out;
}

/** The entrance is the tile just below the bottom edge, at the centre column. */
export function entranceOf(x: number, y: number, w: number, h: number): Tile {
  return { x: x + Math.floor(w / 2), y: y + h };
}

/** Build zones of the site map unlocked at a stage (tags stage:<s>). */
export function unlockedZones(map: MapDef, stage: Stage): LocationDef[] {
  return map.locations.filter((l) => {
    if (l.kind !== 'build_zone') return false;
    const tag = l.tags?.find((t) => t.startsWith('stage:'));
    const zoneStage = (tag ? tag.slice(6) : 'outpost') as Stage;
    return stageAtLeast(stage, zoneStage);
  });
}

function inRect(r: { x: number; y: number; w: number; h: number }, t: Tile): boolean {
  return t.x >= r.x && t.y >= r.y && t.x < r.x + r.w && t.y < r.y + r.h;
}

/** Why a building is not available yet, and whether it is the per-site limit; null when it is. */
function unlockCheck(
  world: CityWorld,
  content: Pick<ContentMap, 'city_buildings'>,
  site: SiteState,
  sdef: SiteDef,
  def: BuildingDef,
): { limit: boolean; reason: KeyText } | null {
  const locked = (reason: KeyText) => ({ limit: false, reason });
  if (!def.sites.includes(sdef.kind)) return locked(tr('sys.city.reject.site_kind'));
  if (sdef.kind === 'settlement' && def.unlock.stage && !stageAtLeast(site.stage, def.unlock.stage))
    return locked(tr('sys.city.reject.need_stage', { stage: stageLabel(def.unlock.stage) }));
  if (!flagsOk(world.meta.flags, def.unlock.flags)) return locked(tr('sys.city.reject.locked'));
  for (const need of def.unlock.buildings ?? []) {
    if (!hasActive(site, need)) {
      return locked(
        tr('sys.city.reject.need_building', {
          building: contentText('city_buildings', buildingDef(content, need), need),
        }),
      );
    }
  }
  const max = buildingCap(sdef, def, world.meta.flags);
  if (max !== undefined && countBuildings(site, def.id, true) >= max)
    return {
      limit: true,
      reason: tr('sys.city.reject.limit', {
        max,
        building: contentText('city_buildings', def),
      }),
    };
  return null;
}

/** Why a building is not available yet (null when it is). */
export function unlockProblem(
  world: CityWorld,
  content: Pick<ContentMap, 'city_buildings'>,
  site: SiteState,
  sdef: SiteDef,
  def: BuildingDef,
): KeyText | null {
  return unlockCheck(world, content, site, sdef, def)?.reason ?? null;
}

const NEED_KINDS: Record<string, { kinds: TileKind[]; label: () => KeyText }> = {
  near_water: { kinds: ['water', 'deep_water'], label: () => tr('sys.city.reject.terrain_water') },
  near_tree: { kinds: ['tree'], label: () => tr('sys.city.reject.terrain_tree') },
  near_rock: { kinds: ['rock'], label: () => tr('sys.city.reject.terrain_rock') },
};

function terrainNeedMet(map: MapDef, tiles: Tile[], need: string): boolean {
  const spec = NEED_KINDS[need];
  if (!spec) return true;
  for (const t of tiles) {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        if (spec.kinds.includes(tileAt(map, t.x + dx, t.y + dy))) return true;
      }
    }
  }
  return false;
}

/** Tiles covered by placed buildings (construction included). */
export function occupiedTiles(site: SiteState, map: MapDef, skipId?: string): Set<number> {
  const occ = new Set<number>();
  for (const b of site.buildings) {
    if (b.id === skipId) continue;
    for (const t of footprintTiles(b.x, b.y, b.w, b.h)) occ.add(t.y * map.width + t.x);
  }
  return occ;
}

export function centerTile(map: MapDef, sdef: SiteDef): Tile {
  const loc = map.locations.find((l) => l.id === sdef.centerLocation);
  if (!loc) return { x: Math.floor(map.width / 2), y: Math.floor(map.height / 2) };
  return { x: Math.floor(loc.x + loc.w / 2), y: Math.floor(loc.y + loc.h / 2) };
}

/** 4-way flood fill over walkable, unoccupied tiles. */
export function reachable(map: MapDef, start: Tile, occ: Set<number>): Uint8Array {
  const seen = new Uint8Array(map.width * map.height);
  const startI = start.y * map.width + start.x;
  if (!isWalkableTile(map, start.x, start.y) || occ.has(startI)) return seen;
  const queue: number[] = [startI];
  seen[startI] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const i = queue[qi] as number;
    const x = i % map.width;
    const y = Math.floor(i / map.width);
    const next: [number, number][] = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1],
    ];
    for (const [nx, ny] of next) {
      if (!isWalkableTile(map, nx, ny)) continue;
      const ni = ny * map.width + nx;
      if (seen[ni] || occ.has(ni)) continue;
      seen[ni] = 1;
      queue.push(ni);
    }
  }
  return seen;
}

function fail(
  code: PlacementCode,
  reason: TextRef,
  tiles: Tile[],
  blocked: Tile[] = [],
): PlacementResult {
  return { ok: false, code, reason, tiles, blocked };
}

/**
 * Per-site work shared by every candidate of one search: the occupied tiles and what is
 * reachable from the centre before anything new is placed. findSpot builds it once instead
 * of repeating a full-map flood fill for each candidate tile.
 */
interface PlacementCache {
  occ: Set<number>;
  reachBefore: Uint8Array;
}

/**
 * Validate placing building defId with its top-left tile at (x, y). Pure: safe for the
 * client to call every frame for the placement preview.
 */
export function previewPlacement(
  world: CityWorld,
  content: Pick<ContentMap, 'city_sites' | 'city_buildings' | 'maps'>,
  siteId: string,
  defId: string,
  x: number,
  y: number,
): PlacementResult {
  return validatePlacement(world, content, siteId, defId, x, y);
}

function validatePlacement(
  world: CityWorld,
  content: Pick<ContentMap, 'city_sites' | 'city_buildings' | 'maps'>,
  siteId: string,
  defId: string,
  x: number,
  y: number,
  cache?: PlacementCache,
): PlacementResult {
  const sdef = siteDef(content, siteId);
  const site = world.slices.city.sites[siteId];
  const map = sdef ? mapById(content, sdef.mapId) : undefined;
  if (!sdef || !site || !map) return fail('unknown_site', tr('sys.city.reject.unknown_site'), []);
  const def = buildingDef(content, defId);
  if (!def) return fail('unknown_building', tr('sys.city.reject.unknown_building'), []);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tiles = footprintTiles(tx, ty, def.footprint.w, def.footprint.h);
  if (!site.active) return fail('site_closed', tr('sys.city.reject.site_closed_build'), tiles);
  if (!def.sites.includes(sdef.kind))
    return fail('site_kind', tr('sys.city.reject.site_kind'), tiles);
  const locked = unlockCheck(world, content, site, sdef, def);
  if (locked) return fail(locked.limit ? 'limit' : 'locked', locked.reason, tiles);

  const zones = unlockedZones(map, site.stage);
  const outside = tiles.filter(
    (t) =>
      t.x < 0 ||
      t.y < 0 ||
      t.x >= map.width ||
      t.y >= map.height ||
      !zones.some((z) => inRect(z, t)),
  );
  if (outside.length > 0) return fail('bounds', tr('sys.city.reject.bounds'), tiles, outside);

  const badGround = tiles.filter(
    (t) => !isWalkableTile(map, t.x, t.y) || tileAt(map, t.x, t.y) === 'door',
  );
  if (badGround.length > 0)
    return fail('terrain', tr('sys.city.reject.bad_ground'), tiles, badGround);
  if (def.terrain && def.terrain !== 'any' && !terrainNeedMet(map, tiles, def.terrain)) {
    return fail(
      'terrain',
      NEED_KINDS[def.terrain]?.label() ?? tr('sys.city.reject.terrain'),
      tiles,
    );
  }

  const onRoad = tiles.filter((t) => {
    const k = tileAt(map, t.x, t.y);
    return k === 'road' || k === 'bridge';
  });
  if (onRoad.length > 0) return fail('road', tr('sys.city.reject.road'), tiles, onRoad);

  const occ = cache?.occ ?? occupiedTiles(site, map);
  const overlap = tiles.filter((t) => occ.has(t.y * map.width + t.x));
  if (overlap.length > 0) return fail('overlap', tr('sys.city.reject.overlap'), tiles, overlap);

  const entrance = entranceOf(tx, ty, def.footprint.w, def.footprint.h);
  const ei = entrance.y * map.width + entrance.x;
  if (!isWalkableTile(map, entrance.x, entrance.y) || occ.has(ei))
    return fail('entrance', tr('sys.city.reject.entrance'), tiles, [entrance]);

  const center = centerTile(map, sdef);
  const after = new Set(occ);
  for (const t of tiles) after.add(t.y * map.width + t.x);
  if (after.has(center.y * map.width + center.x))
    return fail('reach', tr('sys.city.reject.center'), tiles, [center]);
  const reachAfter = reachable(map, center, after);
  if (!reachAfter[ei]) return fail('reach', tr('sys.city.reject.reach'), tiles, [entrance]);

  // keep_reach: nothing that was reachable before may become cut off.
  const reachBefore = cache?.reachBefore ?? reachable(map, center, occ);
  for (const b of site.buildings) {
    const e = entranceOf(b.x, b.y, b.w, b.h);
    const i = e.y * map.width + e.x;
    if (reachBefore[i] && !reachAfter[i]) {
      const name = contentText('city_buildings', buildingDef(content, b.defId), b.defId);
      return fail(
        'keep_reach',
        tr('sys.city.reject.keep_reach_building', { building: name }),
        tiles,
        [e],
      );
    }
  }
  for (const ex of map.exits) {
    const i = ex.y * map.width + ex.x;
    if (reachBefore[i] && !reachAfter[i]) {
      return fail('keep_reach', tr('sys.city.reject.keep_reach_exit'), tiles, [
        { x: ex.x, y: ex.y },
      ]);
    }
  }
  return { ok: true, tiles, entrance };
}

/**
 * First valid spot for a building, scanning unlocked zones row by row (deterministic).
 * Used by the works official when it decides to build on its own.
 */
export function findSpot(
  world: CityWorld,
  content: Pick<ContentMap, 'city_sites' | 'city_buildings' | 'maps'>,
  siteId: string,
  defId: string,
): Tile | null {
  const sdef = siteDef(content, siteId);
  const site = world.slices.city.sites[siteId];
  const map = sdef ? mapById(content, sdef.mapId) : undefined;
  if (!sdef || !site || !map) return null;
  const occ = occupiedTiles(site, map);
  const cache: PlacementCache = { occ, reachBefore: reachable(map, centerTile(map, sdef), occ) };
  for (const z of unlockedZones(map, site.stage)) {
    for (let y = z.y; y < z.y + z.h; y++) {
      for (let x = z.x; x < z.x + z.w; x++) {
        if (validatePlacement(world, content, siteId, defId, x, y, cache).ok) return { x, y };
      }
    }
  }
  return null;
}
