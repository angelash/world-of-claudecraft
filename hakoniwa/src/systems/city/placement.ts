// Placement validator (city_building 3.4): one deterministic, pure check shared by the
// player, officials and the client preview. It returns a machine code plus a readable
// Chinese reason and the footprint tiles for highlighting. Buildings do not change the
// world's walkability (MapDef is immutable), so reachability is checked here instead.

import type { ContentMap } from '../../core/contracts';
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
import type { BuildingDef, SiteDef, SiteState, Stage } from './types';

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
  | { ok: false; code: PlacementCode; reason: string; tiles: Tile[]; blocked: Tile[] };

const STAGE_LABEL: Record<Stage, string> = {
  outpost: '据点',
  village: '村落',
  territory: '领地',
  court: '庭院',
};

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

/** Why a building is not available yet (empty string when it is). */
export function unlockProblem(
  world: CityWorld,
  content: Pick<ContentMap, 'city_buildings'>,
  site: SiteState,
  sdef: SiteDef,
  def: BuildingDef,
): string {
  if (!def.sites.includes(sdef.kind)) return '这里不能建这种建筑';
  if (sdef.kind === 'settlement' && def.unlock.stage && !stageAtLeast(site.stage, def.unlock.stage))
    return `需要聚落发展到${STAGE_LABEL[def.unlock.stage]}`;
  if (!flagsOk(world.meta.flags, def.unlock.flags)) return '还没有解锁';
  for (const need of def.unlock.buildings ?? []) {
    if (!hasActive(site, need)) {
      return `需要先建成${buildingDef(content, need)?.name ?? need}`;
    }
  }
  if (def.max !== undefined && countBuildings(site, def.id, true) >= def.max)
    return `这里最多只能建 ${def.max} 座${def.name}`;
  return '';
}

const NEED_KINDS: Record<string, { kinds: TileKind[]; label: string }> = {
  near_water: { kinds: ['water', 'deep_water'], label: '需要靠近水边' },
  near_tree: { kinds: ['tree'], label: '需要靠近树林' },
  near_rock: { kinds: ['rock'], label: '需要靠近岩地' },
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
  reason: string,
  tiles: Tile[],
  blocked: Tile[] = [],
): PlacementResult {
  return { ok: false, code, reason, tiles, blocked };
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
  const sdef = siteDef(content, siteId);
  const site = world.slices.city.sites[siteId];
  const map = sdef ? mapById(content, sdef.mapId) : undefined;
  if (!sdef || !site || !map) return fail('unknown_site', '没有这个聚落', []);
  const def = buildingDef(content, defId);
  if (!def) return fail('unknown_building', '没有这种建筑', []);
  const tx = Math.floor(x);
  const ty = Math.floor(y);
  const tiles = footprintTiles(tx, ty, def.footprint.w, def.footprint.h);
  if (!site.active) return fail('site_closed', '这里现在还不能建设', tiles);
  if (!def.sites.includes(sdef.kind)) return fail('site_kind', '这里不能建这种建筑', tiles);
  const locked = unlockProblem(world, content, site, sdef, def);
  if (locked) {
    return fail(locked.startsWith('这里最多') ? 'limit' : 'locked', locked, tiles);
  }

  const zones = unlockedZones(map, site.stage);
  const outside = tiles.filter(
    (t) =>
      t.x < 0 ||
      t.y < 0 ||
      t.x >= map.width ||
      t.y >= map.height ||
      !zones.some((z) => inRect(z, t)),
  );
  if (outside.length > 0) return fail('bounds', '超出了可建设用地', tiles, outside);

  const badGround = tiles.filter(
    (t) => !isWalkableTile(map, t.x, t.y) || tileAt(map, t.x, t.y) === 'door',
  );
  if (badGround.length > 0)
    return fail('terrain', '这块地不能建房（水、墙、树或岩石）', tiles, badGround);
  if (def.terrain && def.terrain !== 'any' && !terrainNeedMet(map, tiles, def.terrain)) {
    return fail('terrain', NEED_KINDS[def.terrain]?.label ?? '地形不合适', tiles);
  }

  const onRoad = tiles.filter((t) => {
    const k = tileAt(map, t.x, t.y);
    return k === 'road' || k === 'bridge';
  });
  if (onRoad.length > 0) return fail('road', '不能压在道路上', tiles, onRoad);

  const occ = occupiedTiles(site, map);
  const overlap = tiles.filter((t) => occ.has(t.y * map.width + t.x));
  if (overlap.length > 0) return fail('overlap', '和别的建筑重叠了', tiles, overlap);

  const entrance = entranceOf(tx, ty, def.footprint.w, def.footprint.h);
  const ei = entrance.y * map.width + entrance.x;
  if (!isWalkableTile(map, entrance.x, entrance.y) || occ.has(ei))
    return fail('entrance', '门口被挡住了，门前要留一格空地', tiles, [entrance]);

  const center = centerTile(map, sdef);
  const after = new Set(occ);
  for (const t of tiles) after.add(t.y * map.width + t.x);
  if (after.has(center.y * map.width + center.x))
    return fail('reach', '不能占用聚落中心', tiles, [center]);
  const reachAfter = reachable(map, center, after);
  if (!reachAfter[ei]) return fail('reach', '门口和聚落中心走不通', tiles, [entrance]);

  // keep_reach: nothing that was reachable before may become cut off.
  const reachBefore = reachable(map, center, occ);
  for (const b of site.buildings) {
    const e = entranceOf(b.x, b.y, b.w, b.h);
    const i = e.y * map.width + e.x;
    if (reachBefore[i] && !reachAfter[i]) {
      const name = buildingDef(content, b.defId)?.name ?? b.defId;
      return fail('keep_reach', `会挡住${name}的出入口`, tiles, [e]);
    }
  }
  for (const ex of map.exits) {
    const i = ex.y * map.width + ex.x;
    if (reachBefore[i] && !reachAfter[i]) {
      return fail('keep_reach', '会堵住通往外面的路', tiles, [{ x: ex.x, y: ex.y }]);
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
  for (const z of unlockedZones(map, site.stage)) {
    for (let y = z.y; y < z.y + z.h; y++) {
      for (let x = z.x; x < z.x + z.w; x++) {
        if (previewPlacement(world, content, siteId, defId, x, y).ok) return { x, y };
      }
    }
  }
  return null;
}
