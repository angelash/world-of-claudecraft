// A nest's current cleared flag resets when it grows. Its saved clear history must
// still prevent an old save without an XP ledger from earning another first clear.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { deserializeWorld, Engine, serializeWorld } from '../src/core';
import type { AnyWorldEvent, ContentMap } from '../src/core/contracts';
import type { GameSystem } from '../src/core/system';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as combat, unitOf } from '../src/systems/combat';
import { killUnit } from '../src/systems/combat/death';
import { spawnMonster } from '../src/systems/combat/spawning';
import { system as dungeons, readDungeons } from '../src/systems/dungeons';
import { system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as records } from '../src/systems/records';
import { isWalkable, system as world } from '../src/systems/world';

const BASE = buildContent();
const NEST = 'nest_furrow_rat_queen';
const REWARD = `first:nest:${NEST}`;
const CLEAR_FLAG = `dg.${NEST}.cleared`;
const SYSTEMS = [modifiers, world, inventory, combat, dungeons, records];

function lifecycleContent(): ContentMap {
  return {
    ...BASE,
    // The shipped granary is sediment 2; this legal high-sediment lifecycle fixture
    // allows stage 2 to reach stage 3, as in dungeon_nests.test.ts.
    maps: BASE.maps.map((map) =>
      map.id !== 'borderstone'
        ? map
        : {
            ...map,
            locations: map.locations.map((location) =>
              location.id === 'old_granary' ? { ...location, sediment: 3 } : location,
            ),
          },
    ),
  };
}

function nestSpot(content: ContentMap) {
  const def = content.nests.find((nest) => nest.id === NEST);
  const map = content.maps.find((map) => map.id === def?.mapId);
  const location = map?.locations.find((location) => location.id === def?.location);
  if (!map || !location) throw new Error('missing nest location');
  for (let y = location.y; y < location.y + location.h; y++)
    for (let x = location.x; x < location.x + location.w; x++)
      if (isWalkable(map, x + 0.5, y + 0.5)) return { mapId: map.id, x: x + 0.5, y: y + 0.5 };
  throw new Error('no walkable nest location');
}

function game(): Engine {
  const content = lifecycleContent();
  const game = createGame({ seed: 20261119, aiMode: 'off', content, systems: SYSTEMS });
  game.queue('flag.set', { key: 'act', value: 'act1' });
  game.queue('flag.set', { key: 'act_week', value: 4 });
  game.queue('world.teleport', { entityId: 'player', ...nestSpot(content) });
  game.step(1);
  expect(readDungeons(game.world)?.nests[NEST]?.live).toBe(true);
  return game;
}

function killLord(game: Engine, credited = true): AnyWorldEvent[] {
  const at = nestSpot(game.content);
  const probe: GameSystem = {
    id: 'zz_xp_migration_clear',
    order: 999,
    tick(ctx) {
      const monster = spawnMonster(ctx, 'furrow_rat_queen', at.mapId, at.x, at.y);
      if (!monster) throw new Error('missing nest lord');
      killUnit(ctx, monster, credited ? (unitOf(ctx.world, 'player') ?? null) : null);
    },
  };
  const events: AnyWorldEvent[] = [];
  const clearing = Engine.resume(game.world, game.content, [...game.systems, probe]);
  clearing.onEvents((batch) => events.push(...batch));
  clearing.step(1);
  return events;
}

function growOneSeason(game: Engine): void {
  const season = game.content.dungeonConfig.nest.stageDays * TICKS_PER_GAME_DAY;
  // The real engine coarse-clock path runs the world's clock and dungeon settle/grow.
  // One seasonal step avoids simulating millions of individual ticks in this fixture.
  const seasonalWait: GameSystem = {
    id: 'zz_xp_migration_season',
    order: 1,
    clock: () => ({ stride: season, hold: null }),
  };
  Engine.resume(game.world, game.content, [...game.systems, seasonalWait]).step(1);
  expect(readDungeons(game.world)?.nests[NEST]).toMatchObject({ stage: 3, cleared: false });
  expect(game.world.meta.flags[CLEAR_FLAG]).toBe(false);
}

function resumeWithoutLedger(game: Engine): Engine {
  const oldSave = deserializeWorld(serializeWorld(game.world));
  delete oldSave.slices.records.xp;
  // Serialize the legacy shape too: this is the persisted state the migration receives.
  return Engine.resume(deserializeWorld(serializeWorld(oldSave)), game.content, game.systems);
}

function firstAwards(events: readonly AnyWorldEvent[]) {
  return events.filter((event) => event.kind === 'xp.awarded' && event.data.reason === REWARD);
}

describe('old nest XP ledger migration', () => {
  it.each([false, true])(
    'does not pay a regrown historical clear again (original party credit: %s)',
    (credited) => {
      const live = game();
      killLord(live, credited);
      expect(readDungeons(live.world)?.nests[NEST]?.cleared).toBe(true);
      const clearedTick = readDungeons(live.world)?.nests[NEST]?.clearedTick;
      expect(clearedTick).toBeGreaterThanOrEqual(0);
      expect(firstAwards(live.world.recent)).toHaveLength(credited ? 1 : 0);
      growOneSeason(live);
      expect(readDungeons(live.world)?.nests[NEST]?.clearedTick).toBe(clearedTick);

      const loaded = resumeWithoutLedger(live);
      const events = killLord(loaded);
      expect(readDungeons(loaded.world)?.nests[NEST]?.cleared).toBe(true);
      expect(firstAwards(events)).toEqual([]);
      expect(loaded.world.slices.records.xp?.settled[REWARD]?.amount).toBe(0);
    },
  );

  it('still pays the first real clear when an old regrown nest has no historical clear', () => {
    const live = game();
    growOneSeason(live);
    expect(readDungeons(live.world)?.nests[NEST]?.clearedTick).toBe(-1);
    const loaded = resumeWithoutLedger(live);
    const events = killLord(loaded);
    expect(firstAwards(events)).toHaveLength(1);
    expect(loaded.world.slices.records.xp?.settled[REWARD]?.amount).toBeGreaterThan(0);
  });
});
