// Game factory: content + systems + engine. Used by the client, the editor workbench,
// headless runs and tests. Every system's flag access goes through the variable
// registry (./flag_guard.ts, world_state_registry.md 9.4).

import { buildContent } from '../content';
import type { ContentMap } from '../core/contracts';
import { Engine, type EngineOptions } from '../core/engine';
import type { GameSystem } from '../core/system';
import type { World } from '../core/world';
import { type FlagPolicy, guardSystems, registryFor } from './flag_guard';
import { allSystems } from './registry';

export interface GameOptions extends EngineOptions {
  seed?: number;
  content?: ContentMap;
  systems?: GameSystem[];
  /** Unregistered flag writes: throw (development default), log (release default) or off. */
  flagPolicy?: FlagPolicy;
}

function guarded(content: ContentMap, opts: GameOptions): GameSystem[] {
  return guardSystems(opts.systems ?? allSystems(), registryFor(content), opts.flagPolicy);
}

export function createGame(opts: GameOptions = {}): Engine {
  const content = opts.content ?? buildContent();
  return Engine.create(opts.seed ?? 20261115, content, guarded(content, opts), opts);
}

export function resumeGame(world: World, opts: GameOptions = {}): Engine {
  const content = opts.content ?? buildContent();
  return Engine.resume(world, content, guarded(content, opts), opts);
}
