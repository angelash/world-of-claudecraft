// GameView: the client's read-only window onto the world (architecture.md 7, the
// equivalent of the main project's IWorld seam). Renderer, HUD and windows read only
// through this interface and change the world only through GameCommands. Phase 1 wires
// the finished kernel parts (core, world, inventory); later systems join through the
// adapters in ./adapters.ts.

import type { AiMode } from '../../core/ai_port';
import type { BrainTrace } from '../../core/brain/trace';
import type {
  AnyWorldEvent,
  CommandKind,
  CommandMap,
  ContentMap,
  FlagValue,
} from '../../core/contracts';
import type { Engine } from '../../core/engine';
import { type Calendar, calendarAt } from '../../core/time';
import type { World } from '../../core/world';
import { type Holding, holdingOf, type ItemDef, itemDef } from '../../systems/inventory';
import {
  currentWeather,
  entitiesOnMap,
  getEntity,
  mapById,
  playerEntity,
} from '../../systems/world';
import type { Entity, MapDef, Weather } from '../../systems/world/types';

export interface GameView {
  readonly tick: number;
  calendar(): Calendar;
  weather(): Weather;
  flags(): Readonly<Record<string, FlagValue>>;
  flag(key: string): FlagValue | undefined;
  aiMode(): AiMode;
  aiPendingCount(): number;
  playerId(): string;
  player(): Readonly<Entity> | undefined;
  entity(id: string): Readonly<Entity> | undefined;
  entityCount(): number;
  map(id: string): MapDef | undefined;
  maps(): readonly MapDef[];
  /** the map the player is on */
  currentMap(): MapDef | undefined;
  entitiesOnMap(mapId: string): readonly Readonly<Entity>[];
  holding(ownerId: string): Readonly<Holding>;
  itemDef(id: string): ItemDef | undefined;
  recentEvents(): readonly AnyWorldEvent[];
  /** Actors with at least one recorded built-in decision trace (builtin_ai.md 2.6, 15). */
  traceActors(): string[];
  /** One actor's recent traces, oldest first; empty until a brain records one (PK-M1-18 on). */
  brainTraces(actor: string): readonly BrainTrace[];
  /** raw access for the dev-only debug window and phase-2 adapters */
  readonly world: Readonly<World>;
  readonly content: Readonly<ContentMap>;
}

/** A command the client wants queued (player source). */
export type ClientCommand = { [K in CommandKind]: { kind: K; data: CommandMap[K] } }[CommandKind];

export interface GameCommands {
  queue<K extends CommandKind>(kind: K, data: CommandMap[K]): void;
  queueAll(cmds: readonly ClientCommand[]): void;
}

export function createGameView(engine: Engine): GameView {
  const world = engine.world;
  const content = engine.content;
  return {
    get tick() {
      return world.meta.tick;
    },
    calendar: () => calendarAt(world.meta.tick),
    weather: () => currentWeather(world),
    flags: () => world.meta.flags,
    flag: (key) => world.meta.flags[key],
    aiMode: () => world.ai.mode,
    aiPendingCount: () => world.ai.pending.length,
    playerId: () => world.slices.world.playerId,
    player: () => playerEntity(world),
    entity: (id) => getEntity(world, id),
    entityCount: () => Object.keys(world.slices.world.entities).length,
    map: (id) => mapById(content, id),
    maps: () => content.maps,
    currentMap: () => {
      const p = playerEntity(world);
      return p ? mapById(content, p.mapId) : undefined;
    },
    entitiesOnMap: (mapId) => entitiesOnMap(world, mapId),
    holding: (ownerId) => holdingOf(world, ownerId),
    itemDef: (id) => itemDef(content, id),
    recentEvents: () => world.recent,
    traceActors: () => engine.traceActors(),
    brainTraces: (actor) => engine.recentTraces(actor),
    world,
    content,
  };
}

export function createGameCommands(engine: Engine): GameCommands {
  return {
    queue(kind, data) {
      engine.queue(kind, data);
    },
    queueAll(cmds) {
      for (const c of cmds) engine.queue(c.kind, c.data as never);
    },
  };
}

/** Truthiness of a flag as the UI reads it ('false', '0' and '' count as unset). */
export function flagOn(v: FlagValue | undefined): boolean {
  if (v === undefined || v === false || v === 0) return false;
  if (typeof v === 'string') return v !== '' && v !== 'false' && v !== '0';
  return true;
}
