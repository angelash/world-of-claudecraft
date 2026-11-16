// World system: tile maps, entities, movement and pathfinding, map exits, the hour/day
// clock events and weather. Phase 10 (architecture.md 4.6). Other systems create and
// move entities only through the ports exported here.

import { ok, reject, systemSource } from '../../core';
import type { GameSystem, SystemContext } from '../../core/system';
import { type TextParam, tr } from '../../core/text';
import { calendarAt, DT } from '../../core/time';
import { findPath, isWalkable, nearestWalkable } from './grid';
import type {
  Appearance,
  Entity,
  EntityKind,
  MapDef,
  SpawnDef,
  SpawnEntitySpec,
  Waypoint,
  Weather,
  WorldSlice,
} from './types';

export * from './grid';
export * from './look';
export * from './map_roles';
export * from './ports';
export * from './types';

export interface WorldStart {
  mapId: string;
  x: number;
  y: number;
  /** highest priority wins when several packs declare a start */
  priority: number;
}

declare module '../../core/contracts' {
  interface WorldSlices {
    world: WorldSlice;
  }
  interface ContentMap {
    maps: MapDef[];
    worldStarts: WorldStart[];
  }
  interface EventMap {
    'world.entity_spawned': { id: string; kind: EntityKind; ref?: string; mapId: string };
    'world.entity_removed': { id: string; kind: EntityKind; ref?: string };
    'world.arrived': { id: string; x: number; y: number };
    'world.move_failed': { id: string; reason: TextParam };
    'world.map_changed': { id: string; from: string; to: string };
    'world.hour': { hour: number; dayIndex: number };
    'world.day': { dayIndex: number; season: number; year: number };
    'world.weather': { weather: Weather; forced: boolean };
  }
  interface CommandMap {
    'world.move_to': { entityId: string; x: number; y: number; mapId?: string };
    'world.set_intent': { entityId: string; dx: number; dy: number };
    'world.stop': { entityId: string };
    'world.use_exit': { entityId: string; exitId: string };
    'world.teleport': { entityId: string; mapId: string; x: number; y: number };
  }
}

const SRC = systemSource('world');

// ---------------------------------------------------------------------------
// Queries

export function worldSlice(ctx: { world: { slices: { world: WorldSlice } } }): WorldSlice {
  return ctx.world.slices.world;
}

export function getEntity(
  world: { slices: { world: WorldSlice } },
  id: string,
): Entity | undefined {
  return world.slices.world.entities[id];
}

export function playerEntity(world: { slices: { world: WorldSlice } }): Entity | undefined {
  return world.slices.world.entities[world.slices.world.playerId];
}

export function mapById(content: { maps: MapDef[] }, id: string): MapDef | undefined {
  return content.maps.find((m) => m.id === id);
}

export function entitiesOnMap(world: { slices: { world: WorldSlice } }, mapId: string): Entity[] {
  return Object.values(world.slices.world.entities).filter((e) => e.mapId === mapId);
}

export function distance(a: Waypoint, b: Waypoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function entitiesNear(
  world: { slices: { world: WorldSlice } },
  mapId: string,
  x: number,
  y: number,
  radius: number,
  filter?: (e: Entity) => boolean,
): Entity[] {
  const out: Entity[] = [];
  for (const e of Object.values(world.slices.world.entities)) {
    if (e.mapId !== mapId || !e.alive || e.hidden) continue;
    if (Math.hypot(e.x - x, e.y - y) > radius) continue;
    if (filter && !filter(e)) continue;
    out.push(e);
  }
  return out.sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
}

/** Spawn points of a kind across all maps (systems spawn their own kinds at init). */
export function spawnPoints(
  content: { maps: MapDef[] },
  kind: SpawnDef['kind'],
): { map: MapDef; spawn: SpawnDef }[] {
  const out: { map: MapDef; spawn: SpawnDef }[] = [];
  for (const map of content.maps) {
    for (const spawn of map.spawns) if (spawn.kind === kind) out.push({ map, spawn });
  }
  return out;
}

export function currentWeather(world: { slices: { world: WorldSlice } }): Weather {
  return world.slices.world.weather;
}

// ---------------------------------------------------------------------------
// Ports (cross-system writes)

export function spawnEntity(ctx: SystemContext, spec: SpawnEntitySpec): Entity {
  const ws = ctx.world.slices.world;
  const id = spec.id ?? ctx.newId(spec.kind === 'player' ? 'player' : `${spec.kind}_`);
  const map = mapById(ctx.content, spec.mapId);
  const pos = map ? (nearestWalkable(map, spec.x, spec.y) ?? { x: spec.x, y: spec.y }) : spec;
  const e: Entity = {
    id,
    kind: spec.kind,
    name: spec.name,
    mapId: spec.mapId,
    x: pos.x,
    y: pos.y,
    facing: 0,
    speed: spec.speed ?? 3,
    radius: spec.radius ?? 0.35,
    faction: spec.faction,
    appearance: spec.appearance,
    tags: spec.tags ?? [],
    alive: true,
    ref: spec.ref,
    spawnId: spec.spawnId,
    home: { x: pos.x, y: pos.y },
    move: null,
    intent: null,
  };
  ws.entities[id] = e;
  ctx.emit('world.entity_spawned', { id, kind: e.kind, ref: e.ref, mapId: e.mapId });
  return e;
}

export function removeEntity(ctx: SystemContext, id: string): void {
  const ws = ctx.world.slices.world;
  const e = ws.entities[id];
  if (!e) return;
  delete ws.entities[id];
  ctx.emit('world.entity_removed', { id, kind: e.kind, ref: e.ref });
}

export function setEntityName(ctx: SystemContext, id: string, name: string): void {
  const e = ctx.world.slices.world.entities[id];
  if (e && name.trim()) e.name = name.trim().slice(0, 24);
}

export function setAppearance(ctx: SystemContext, id: string, appearance: Appearance): void {
  const e = ctx.world.slices.world.entities[id];
  if (e) e.appearance = appearance;
}

/** Order an entity to walk to (x, y) on its current map. Returns false when unreachable. */
export function orderMove(
  ctx: SystemContext,
  id: string,
  x: number,
  y: number,
  arrive = 0.2,
): boolean {
  const e = ctx.world.slices.world.entities[id];
  if (!e || !e.alive) return false;
  const map = mapById(ctx.content, e.mapId);
  if (!map) return false;
  const path = findPath(map, e, { x, y });
  if (!path) return false;
  e.intent = null;
  e.move = { path, goal: { x, y }, arriveRadius: arrive };
  return true;
}

export function teleportEntity(
  ctx: SystemContext,
  id: string,
  mapId: string,
  x: number,
  y: number,
): boolean {
  const e = ctx.world.slices.world.entities[id];
  const map = mapById(ctx.content, mapId);
  if (!e || !map) return false;
  const pos = nearestWalkable(map, x, y);
  if (!pos) return false;
  const from = e.mapId;
  e.mapId = mapId;
  e.x = pos.x;
  e.y = pos.y;
  e.move = null;
  e.intent = null;
  e.home = { x: pos.x, y: pos.y };
  if (from !== mapId) ctx.emit('world.map_changed', { id, from, to: mapId });
  return true;
}

/** A registered weather modifier (goddess interventions, revelations). */
export function forceWeather(
  ctx: SystemContext,
  weather: Weather,
  untilTick: number,
  source: string,
): void {
  const ws = ctx.world.slices.world;
  ws.weatherOverride = { weather, untilTick, source };
  ws.weather = weather;
  ctx.emit('world.weather', { weather, forced: true });
}

// ---------------------------------------------------------------------------
// Simulation

function stepMovement(ctx: SystemContext, e: Entity): void {
  const map = mapById(ctx.content, e.mapId);
  if (!map || !e.alive) return;
  const stepLen = e.speed * DT;
  if (e.intent && (e.intent.dx !== 0 || e.intent.dy !== 0)) {
    const len = Math.hypot(e.intent.dx, e.intent.dy);
    const vx = (e.intent.dx / len) * stepLen;
    const vy = (e.intent.dy / len) * stepLen;
    e.facing = Math.atan2(vy, vx);
    if (isWalkable(map, e.x + vx, e.y)) e.x += vx;
    if (isWalkable(map, e.x, e.y + vy)) e.y += vy;
    return;
  }
  const mv = e.move;
  if (!mv) return;
  let budget = stepLen;
  while (budget > 0 && mv.path.length > 0) {
    const wp = mv.path[0] as Waypoint;
    const dx = wp.x - e.x;
    const dy = wp.y - e.y;
    const d = Math.hypot(dx, dy);
    if (d <= budget) {
      e.x = wp.x;
      e.y = wp.y;
      budget -= d;
      mv.path.shift();
    } else {
      e.x += (dx / d) * budget;
      e.y += (dy / d) * budget;
      e.facing = Math.atan2(dy, dx);
      budget = 0;
    }
  }
  if (mv.path.length === 0) {
    const gx = mv.goal.x - e.x;
    const gy = mv.goal.y - e.y;
    const gd = Math.hypot(gx, gy);
    if (gd > mv.arriveRadius && gd < 1 && isWalkable(map, mv.goal.x, mv.goal.y)) {
      const s = Math.min(gd, budget);
      e.x += (gx / gd) * s;
      e.y += (gy / gd) * s;
      if (s < gd) return;
    }
    e.move = null;
    ctx.emit('world.arrived', { id: e.id, x: e.x, y: e.y });
  }
}

function rollWeather(ctx: SystemContext, season: number): Weather {
  const rng = ctx.rng('world.weather');
  const table: { w: number; v: Weather }[] =
    season === 3
      ? [
          { w: 4, v: 'clear' },
          { w: 3, v: 'cloudy' },
          { w: 3, v: 'snow' },
          { w: 1, v: 'fog' },
        ]
      : [
          { w: 6, v: 'clear' },
          { w: 3, v: 'cloudy' },
          { w: season === 1 ? 2 : 3, v: 'rain' },
          { w: season === 1 ? 1 : 0.5, v: 'storm' },
          { w: season === 2 ? 2 : 1, v: 'fog' },
        ];
  return rng.weighted(table);
}

export const system: GameSystem = {
  id: 'world',
  order: 10,

  init(ctx) {
    const starts = [...(ctx.content.worldStarts ?? [])].sort((a, b) => b.priority - a.priority);
    const start = starts[0] ?? {
      mapId: ctx.content.maps[0]?.id ?? 'void',
      x: 1,
      y: 1,
      priority: 0,
    };
    const cal = calendarAt(0);
    ctx.world.slices.world = {
      playerId: '',
      entities: {},
      weather: 'clear',
      weatherOverride: null,
      lastHour: cal.hour,
      lastDay: cal.dayIndex,
      respawns: {},
    };
    const player = spawnEntity(ctx, {
      id: 'player',
      kind: 'player',
      name: '?',
      mapId: start.mapId,
      x: start.x,
      y: start.y,
      faction: 'player',
      appearance: { base: 'human', colors: ['#3b4a6b', '#c9b38a', '#f1c9a5', '#2b2b2b'] },
      speed: 4.2,
      tags: ['player'],
    });
    ctx.world.slices.world.playerId = player.id;
  },

  tick(ctx) {
    const ws = ctx.world.slices.world;
    const ids = Object.keys(ws.entities).sort();
    for (const id of ids) {
      const e = ws.entities[id];
      if (e) stepMovement(ctx, e);
    }
    const cal = calendarAt(ctx.tick);
    if (cal.hour !== ws.lastHour) {
      ws.lastHour = cal.hour;
      ctx.emit('world.hour', { hour: cal.hour, dayIndex: cal.dayIndex });
    }
    if (cal.dayIndex !== ws.lastDay) {
      ws.lastDay = cal.dayIndex;
      ctx.emit('world.day', { dayIndex: cal.dayIndex, season: cal.season, year: cal.year });
      const ov = ws.weatherOverride;
      if (ov && ov.untilTick > ctx.tick) {
        ws.weather = ov.weather;
      } else {
        ws.weatherOverride = null;
        ws.weather = rollWeather(ctx, cal.season);
      }
      ctx.emit('world.weather', { weather: ws.weather, forced: !!ws.weatherOverride });
    }
  },

  on: {
    // The prologue's character creation writes the chosen name as a flag; mirror it onto
    // the player entity so every system and the client see it.
    'flag.changed'(ctx, ev) {
      if (ev.data.key === 'player.name' && typeof ev.data.value === 'string') {
        setEntityName(ctx, ctx.world.slices.world.playerId, ev.data.value);
      }
    },
  },

  commands: {
    'world.move_to'(ctx, d) {
      const e = ctx.world.slices.world.entities[d.entityId];
      if (!e) return reject('no_entity', tr('sys.world.reject.no_entity'));
      if (d.mapId && d.mapId !== e.mapId)
        return reject('wrong_map', tr('sys.world.reject.wrong_map'));
      return orderMove(ctx, d.entityId, d.x, d.y)
        ? ok()
        : reject('unreachable', tr('sys.world.reject.unreachable'));
    },
    'world.set_intent'(ctx, d) {
      const e = ctx.world.slices.world.entities[d.entityId];
      if (!e) return reject('no_entity', tr('sys.world.reject.no_entity'));
      e.move = null;
      e.intent = { dx: d.dx, dy: d.dy };
      return ok();
    },
    'world.stop'(ctx, d) {
      const e = ctx.world.slices.world.entities[d.entityId];
      if (!e) return reject('no_entity', tr('sys.world.reject.no_entity'));
      e.move = null;
      e.intent = null;
      return ok();
    },
    'world.use_exit'(ctx, d) {
      const e = ctx.world.slices.world.entities[d.entityId];
      if (!e) return reject('no_entity', tr('sys.world.reject.no_entity'));
      const map = mapById(ctx.content, e.mapId);
      const exit = map?.exits.find((x) => x.id === d.exitId);
      if (!exit) return reject('no_exit', tr('sys.world.reject.no_exit'));
      if (Math.hypot(exit.x + 0.5 - e.x, exit.y + 0.5 - e.y) > 1.8) {
        return reject('too_far', tr('sys.world.reject.too_far'));
      }
      if (exit.requiresFlags?.some((f) => !ctx.flag(f))) {
        return reject('locked', tr('sys.world.reject.locked'));
      }
      const target = mapById(ctx.content, exit.toMap);
      const arrival = exit.toLocation
        ? target?.locations.find((l) => l.id === exit.toLocation)
        : undefined;
      const tx = arrival ? arrival.x + arrival.w / 2 : exit.toX;
      const ty = arrival ? arrival.y + arrival.h / 2 : exit.toY;
      return teleportEntity(ctx, e.id, exit.toMap, tx, ty)
        ? ok()
        : reject('bad_exit', tr('sys.world.reject.bad_exit'));
    },
    'world.teleport'(ctx, d) {
      return teleportEntity(ctx, d.entityId, d.mapId, d.x, d.y)
        ? ok()
        : reject('bad_target', tr('sys.world.reject.bad_target'));
    },
  },
};

export { SRC as worldSource };
