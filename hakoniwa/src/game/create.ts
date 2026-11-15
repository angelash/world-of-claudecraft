// Game factory: content + systems + engine. Used by the client, the editor workbench,
// headless runs and tests.

import { buildContent } from '../content';
import type { ContentMap } from '../core/contracts';
import { Engine, type EngineOptions } from '../core/engine';
import type { GameSystem } from '../core/system';
import type { World } from '../core/world';
import { allSystems } from './registry';

export interface GameOptions extends EngineOptions {
  seed?: number;
  content?: ContentMap;
  systems?: GameSystem[];
}

export function createGame(opts: GameOptions = {}): Engine {
  const content = opts.content ?? buildContent();
  const systems = opts.systems ?? allSystems();
  return Engine.create(opts.seed ?? 20261115, content, systems, opts);
}

export function resumeGame(world: World, opts: GameOptions = {}): Engine {
  const content = opts.content ?? buildContent();
  const systems = opts.systems ?? allSystems();
  return Engine.resume(world, content, systems, opts);
}
