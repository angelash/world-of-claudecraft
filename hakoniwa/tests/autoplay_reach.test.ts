// The autoplayer leaves a target it cannot walk to (src/game/autoplay/reach.ts): a monster in
// a pocket of the map that no path reaches is noted when the world refuses the walk order,
// skipped by the target pickers for a while, and tried again after that. Without it the bot
// walks into the wall for the rest of the night (PK-M1-12: a beast-tide spider that spawned
// in a fenced pocket held act 1 for about 100,000 ticks).

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import type { Engine } from '../src/core';
import { Autoplayer } from '../src/game/autoplay';
import { ReachMemory, UNREACHABLE_SKIP } from '../src/game/autoplay/reach';
import { createGame } from '../src/game/create';
import type { Objective } from '../src/systems/quests/types';
import { findPath, walkMap } from '../src/systems/world';
import type { MapDef } from '../src/systems/world/types';

describe('reach memory', () => {
  it('skips a refused target until the skip runs out, keeping the order of the rest', () => {
    const m = new ReachMemory();
    expect(m.ok('a', 0)).toBe(true);
    m.mark('a', 100);
    expect(m.ok('a', 100)).toBe(false);
    expect(m.ok('a', 100 + UNREACHABLE_SKIP - 1)).toBe(false);
    expect(m.reachable(['c', 'a', 'b'], 200)).toEqual(['c', 'b']);
    expect(m.ok('a', 100 + UNREACHABLE_SKIP)).toBe(true);
    expect(m.reachable(['c', 'a', 'b'], 100 + UNREACHABLE_SKIP)).toEqual(['c', 'a', 'b']);
  });

  it('a second refusal starts the skip again', () => {
    const m = new ReachMemory();
    m.mark('a', 0);
    m.mark('a', 1000);
    expect(m.ok('a', UNREACHABLE_SKIP + 10)).toBe(false);
    expect(m.ok('a', 1000 + UNREACHABLE_SKIP)).toBe(true);
  });
});

/**
 * A walled test field: an open floor for the player and a one-tile pocket behind a wall
 * near it, which no path reaches (the shape of the beast-tide pocket of PK-M1-12).
 */
const ROWS = Array.from({ length: 12 }, (_, y) => {
  if (y === 0 || y === 11) return '#'.repeat(40);
  // the pocket: tile (7, 2) walled in on every side
  if (y === 1 || y === 3) return `#${'.'.repeat(5)}###${'.'.repeat(30)}#`;
  if (y === 2) return `#${'.'.repeat(5)}#.#${'.'.repeat(30)}#`;
  return `#${'.'.repeat(38)}#`;
});
const FIELD: MapDef = {
  id: 'zz_field',
  name: 'x',
  region: 'test',
  width: 40,
  height: 12,
  rows: ROWS,
  legend: { '#': 'wall', '.': 'floor' },
  locations: [],
  spawns: [],
  exits: [],
};
const POCKET = { x: 7, y: 2 };

function spawnAt(g: Engine, monsterId: string, x: number, y: number): string {
  const before = new Set(Object.keys(g.world.slices.world.entities));
  g.queue('combat.spawn', { monsterId, mapId: FIELD.id, x: x + 0.5, y: y + 0.5, level: 1 });
  g.step(1);
  const id = Object.keys(g.world.slices.world.entities).find(
    (k) => !before.has(k) && g.world.slices.world.entities[k]?.ref === monsterId,
  );
  if (!id) throw new Error(`spawn failed: ${monsterId}`);
  return id;
}

describe('autoplayer and unreachable targets', () => {
  it('notes a target it cannot walk to and hunts a reachable one instead', () => {
    const content = buildContent();
    content.maps = [...content.maps, FIELD];
    const g = createGame({ aiMode: 'off', content });
    const bot = new Autoplayer(g, { route: 'release' });
    g.queue('world.teleport', {
      entityId: g.world.slices.world.playerId,
      mapId: FIELD.id,
      x: 7.5,
      y: 6.5,
    });
    g.step(1);
    const p = g.world.slices.world.entities[g.world.slices.world.playerId];
    expect(p?.mapId).toBe(FIELD.id);
    const map = walkMap(g, FIELD.id) as MapDef;
    expect(findPath(map, { x: 7.5, y: 6.5 }, { x: POCKET.x + 0.5, y: POCKET.y + 0.5 })).toBeNull();
    // two attackable monster kinds; the pocketed one is the nearer
    const [lost, found] = ['dian_rat', 'grey_wolf'] as const;
    const lostId = spawnAt(g, lost, POCKET.x, POCKET.y);
    const foundId = spawnAt(g, found, 7, 10);
    expect(Math.floor(g.world.slices.world.entities[lostId]?.x ?? -1)).toBe(POCKET.x);
    const hunt = { type: 'kill', refs: [lost, found], mapId: FIELD.id, count: 1 } as Objective;
    // first pick: the nearer one, the pocketed monster
    bot.hunt(hunt as Extract<Objective, { type: 'kill' }>, 'test');
    expect(bot.intent.what).toBe(`fight ${lost} (test)`);
    g.step(2);
    const refused = g.world.recent.some(
      (e) =>
        e.kind === 'command.result' &&
        e.data.kind === 'world.move_to' &&
        !e.data.ok &&
        e.data.code === 'unreachable',
    );
    expect(refused).toBe(true);
    expect(bot.reach.ok(lostId, g.tick)).toBe(false);
    expect(bot.reach.ok(foundId, g.tick)).toBe(true);
    // the next look goes for the reachable one
    bot.hunt(hunt as Extract<Objective, { type: 'kill' }>, 'test');
    expect(bot.intent.what).toBe(`fight ${found} (test)`);
    // a named hunt with only the pocketed target left keeps it as the target
    const alone = { type: 'kill', refs: [lost], mapId: FIELD.id, count: 1 } as Objective;
    bot.hunt(alone as Extract<Objective, { type: 'kill' }>, 'test');
    expect(bot.intent.what).toBe(`fight ${lost} (test)`);
    // a hunt by kind (the beast-tide vanguard) skips the pocketed one as well
    const byKind = { type: 'kill', kind: 'monster', mapId: FIELD.id, count: 6 } as Objective;
    bot.hunt(byKind as Extract<Objective, { type: 'kill' }>, 'test');
    expect(bot.intent.what).toBe(`fight ${found} (test)`);
  });
});
