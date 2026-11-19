import { describe, expect, it, vi } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_DAY } from '../src/core/time';
import { system as combat } from '../src/systems/combat';
import { addItem, countItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { system as party } from '../src/systems/party';
import { system as world } from '../src/systems/world';

function game() {
  const g = Engine.create(19, buildContent(), [modifiers, world, inventory, combat, party]);
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.queue('flag.set', { key: 'door.vocation_hunter', value: true });
  g.queue('flag.set', { key: 'door_rank', value: 5 });
  g.step(1);
  const player = g.world.slices.world.entities.player!;
  g.queue('combat.spawn', {
    monsterId: 'grey_wolf',
    mapId: player.mapId,
    x: player.x + 2,
    y: player.y,
    level: 1,
  });
  g.step(1);
  const id = Object.values(g.world.slices.combat.units).find(
    (u) =>
      u.monsterId === 'grey_wolf' && g.world.slices.world.entities[u.id]?.mapId === player.mapId,
  )?.id;
  if (!id) throw new Error('fixture wolf did not spawn');
  g.queue('party.tame', { targetId: id });
  g.step(1);
  const member = g.world.slices.party.members.pet_ashgrey_wolf!;
  if (!member) throw new Error('fixture wolf was not tamed');
  return { g, member };
}

function give(g: Engine, itemId: string, count = 1) {
  const probe = {
    id: 'feeding_fixture',
    order: 999,
    tick: (ctx: SystemContext) => addItem(ctx, 'player', itemId, count, 'fixture'),
  };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

describe('feeding a real half-pact beast', () => {
  it('settles two queued feeds of one beast only once before spending the second portion', () => {
    const { g, member } = game();
    give(g, 'cs_feed_hare_meat', 2);
    for (let i = 0; i < 2; i++) {
      g.queue('inventory.use', {
        ownerId: 'player',
        itemId: 'cs_feed_hare_meat',
        targetId: member.entityId,
      });
    }
    g.step(1);
    expect(countItem(g.world, 'player', 'cs_feed_hare_meat')).toBe(1);
    expect(g.world.recent.filter((event) => event.kind === 'party.fed')).toHaveLength(1);
    expect(g.world.recent.filter((event) => event.kind === 'item.used')).toHaveLength(1);
  });

  it('spends accepted food, stores satiety and emits the fact used by the companion quest', () => {
    const { g, member } = game();
    give(g, 'cs_feed_hare_meat');
    g.queue('inventory.use', {
      ownerId: 'player',
      itemId: 'cs_feed_hare_meat',
      targetId: member.entityId,
    });
    g.step(1);
    expect(countItem(g.world, 'player', 'cs_feed_hare_meat')).toBe(0);
    const fed = g.world.recent.find((event) => event.kind === 'party.fed');
    expect(fed).toMatchObject({ data: { companionId: member.id, itemId: 'cs_feed_hare_meat' } });
    expect((member.pet as { fedUntil?: number })?.fedUntil).toBeGreaterThanOrEqual(
      g.world.meta.tick + TICKS_PER_GAME_DAY,
    );
    const resumed = Engine.resume(structuredClone(g.world), g.content, g.systems);
    expect(resumed.world.slices.party.members[member.id]?.pet).toEqual(member.pet);
  });

  it('refuses disliked food or an unrelated target before spending or emitting a feeding fact', () => {
    const { g, member } = game();
    give(g, 'cs_feed_acorn_roots');
    g.queue('inventory.use', {
      ownerId: 'player',
      itemId: 'cs_feed_acorn_roots',
      targetId: member.entityId,
    });
    g.step(1);
    expect(countItem(g.world, 'player', 'cs_feed_acorn_roots')).toBe(1);
    g.queue('inventory.use', {
      ownerId: 'player',
      itemId: 'cs_feed_acorn_roots',
      targetId: 'player',
    });
    g.step(1);
    expect(countItem(g.world, 'player', 'cs_feed_acorn_roots')).toBe(1);
    expect(g.world.recent.some((event) => event.kind === 'party.fed')).toBe(false);
  });

  it('can feed after a fresh process loads a save without creating a new game first', async () => {
    const { g, member } = game();
    give(g, 'cs_feed_hare_meat');
    const save = structuredClone(g.world);
    vi.resetModules();
    const [core2, modifiers2, world2, inventory2, combat2, party2] = await Promise.all([
      import('../src/core'),
      import('../src/systems/modifiers'),
      import('../src/systems/world'),
      import('../src/systems/inventory'),
      import('../src/systems/combat'),
      import('../src/systems/party'),
    ]);
    const loaded = core2.Engine.resume(save, g.content, [
      modifiers2.system,
      world2.system,
      inventory2.system,
      combat2.system,
      party2.system,
    ]);
    loaded.queue('inventory.use', {
      ownerId: 'player',
      itemId: 'cs_feed_hare_meat',
      targetId: member.entityId,
    });
    loaded.step(1);
    expect(inventory2.countItem(loaded.world, 'player', 'cs_feed_hare_meat')).toBe(0);
    expect(loaded.world.recent.some((event) => event.kind === 'party.fed')).toBe(true);
  });
});
