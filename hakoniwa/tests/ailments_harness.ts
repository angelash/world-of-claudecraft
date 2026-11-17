// Shared harness of the ailments tests (PK-M1-51): the real engine with the kernel systems,
// combat, doors (blockage), travel (time skips) and ailments over the shipped content, the
// registry flag guard on (an unregistered flag write throws), and helpers to put the player
// somewhere, let hours pass tick by tick or as a long skip, and read the body.

import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem, SystemContext } from '../src/core/system';
import { createGame } from '../src/game/create';
import { system as ailments, readAilments, type Sufferer } from '../src/systems/ailments';
import { system as combat } from '../src/systems/combat';
import { system as doors } from '../src/systems/doors';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { skipState, system as travel } from '../src/systems/travel';
import { system as world } from '../src/systems/world';

export const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, doors, ailments, travel];

let shipped: ContentMap | undefined;
/** The shipped content, built once per test file. */
export function content(): ContentMap {
  shipped ??= buildContent();
  return shipped;
}

/** A copy of the shipped content with `grade` set on one location of a map (a hot spot). */
export function withHotSpot(mapId: string, locationId: string, grade: number): ContentMap {
  const base = content();
  const maps = base.maps.map((m) =>
    m.id !== mapId
      ? m
      : {
          ...m,
          locations: m.locations.map((l) => (l.id === locationId ? { ...l, sediment: grade } : l)),
        },
  );
  return { ...base, maps } as ContentMap;
}

export interface Spot {
  map: string;
  x: number;
  y: number;
}

/** The town square of Borderstone (canon grade 1, thin). */
export const TOWN: Spot = { map: 'borderstone', x: 50, y: 39 };
/** The north spring of Borderstone (a hot spot only in withHotSpot content). */
export const SPRING: Spot = { map: 'borderstone', x: 36, y: 32 };
/** The ruins' depths (canon grade 3, dense). */
export const DEPTHS: Spot = { map: 'seal_ruins_depths', x: 19, y: 18 };
/** The inner court (canon grade 0, clear). */
export const COURT: Spot = { map: 'inner_court', x: 20, y: 18 };

/** A game in act 1 with the player at `at`, one tick in (06:00 of day 0). */
export function game(at: Spot, opts: { seed?: number; content?: ContentMap } = {}): Engine {
  const g = createGame({
    seed: opts.seed ?? 11,
    aiMode: 'off',
    content: opts.content ?? content(),
    systems: SYSTEMS,
  });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('world.teleport', { entityId: 'player', mapId: at.map, x: at.x, y: at.y });
  g.step(1);
  return g;
}

export function teleport(g: Engine, at: Spot): void {
  g.queue('world.teleport', { entityId: 'player', mapId: at.map, x: at.x, y: at.y });
  g.step(1);
}

/** Let `hours` pass as one long skip (hour-coarse steps) and wait for its end. */
export function skipHours(g: Engine, hours: number): void {
  g.queue('time.skip', { hours, kind: 'travel', mode: 'long' }, { type: 'script', script: 'test' });
  g.step(1);
  let guard = hours * 2 + 10;
  while (skipState(g.world) && guard-- > 0) g.step(1);
  if (skipState(g.world)) throw new Error('skip did not end');
}

export function body(g: Engine, id = 'player'): Sufferer | undefined {
  return readAilments(g.world)?.bodies[id];
}

export function events<K extends AnyWorldEvent['kind']>(g: Engine, kind: K) {
  return g.world.recent.filter((e): e is Extract<AnyWorldEvent, { kind: K }> => e.kind === kind);
}

/** The last result of a command of this kind. */
export function lastResult(g: Engine, kind: string) {
  const r = [...g.world.recent]
    .reverse()
    .find((e) => e.kind === 'command.result' && e.data.kind === kind);
  return r?.kind === 'command.result' ? r.data : undefined;
}

/** Run code inside a system context of the game (one tick). */
export function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe: GameSystem = { id: 'zz_probe', order: 999, tick: (ctx) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

export const flags = (g: Engine) => g.world.meta.flags;
