import { describe, expect, it } from 'vitest';
import type { GameSystem, SystemContext } from '../src/core';
import { Autoplayer } from '../src/game/autoplay';
import { attackers, playerHealth } from '../src/game/autoplay/fight';
import { maintainGear } from '../src/game/autoplay/maintenance';
import { nextLeg } from '../src/game/autoplay/nav';
import { createGame } from '../src/game/create';
import { allSystems } from '../src/game/registry';
import { markCombat } from '../src/systems/combat/threat';
import type { Unit } from '../src/systems/combat/types';
import type { Holding } from '../src/systems/inventory';
import { addItem, addMoney, holdingOf, wearInstance } from '../src/systems/inventory';
import { hostileInReach } from '../src/systems/travel/rest';
import type { Entity } from '../src/systems/world/types';
import recordedUpkeep from './playthrough/fixtures/m02_upkeep.json';

/** Relevant records from the first real low-durability, out-of-combat M02 recovery. */
function recordedRecovery() {
  const g = createGame({ seed: recordedUpkeep.seed, aiMode: 'off' });
  const world = g.world;
  world.meta.tick = recordedUpkeep.tick;
  world.meta.flags = structuredClone(recordedUpkeep.flags);
  for (const body of Object.values(world.slices.world.entities)) {
    if (body.mapId !== 'seal_ruins_depths') continue;
    delete world.slices.world.entities[body.id];
    delete world.slices.combat.units[body.id];
  }
  Object.assign(
    world.slices.world.entities,
    structuredClone(recordedUpkeep.entities) as Record<string, Entity>,
  );
  Object.assign(
    world.slices.combat.units,
    structuredClone(recordedUpkeep.units) as Record<string, Unit>,
  );
  world.slices.inventory.owners.player = structuredClone(recordedUpkeep.holding) as Holding;
  world.slices.quests = structuredClone(recordedUpkeep.quests) as typeof world.slices.quests;
  world.slices.scenes = structuredClone(recordedUpkeep.scenes) as typeof world.slices.scenes;
  world.slices.doors = structuredClone(recordedUpkeep.doors) as typeof world.slices.doors;
  world.slices.records = structuredClone(recordedUpkeep.records) as typeof world.slices.records;
  world.inbox = [];
  const bot = new Autoplayer(g);
  return { g, bot };
}

function fixture(opts: { itemId?: string; cur?: number; money?: number } = {}) {
  let pending: ((ctx: SystemContext) => void) | undefined;
  const probe: GameSystem = {
    id: 'zz_autoplay_maintenance',
    order: 999,
    tick(ctx) {
      const action = pending;
      pending = undefined;
      action?.(ctx);
    },
  };
  const g = createGame({ aiMode: 'off', systems: [...allSystems(), probe] });
  const run = (action: (ctx: SystemContext) => void) => {
    pending = action;
    g.step(1);
  };
  g.queue('flag.set', { key: 'act', value: 'epilogue' });
  g.queue('world.teleport', { entityId: 'player', mapId: 'borderstone', x: 65.5, y: 44.5 });
  let instanceId = '';
  const itemId = opts.itemId ?? 'rusty_shortsword';
  run((ctx) => {
    instanceId = addItem(ctx, 'player', itemId, 1, 'fixture')[0] ?? '';
    addMoney(ctx, 'player', opts.money ?? 10, 'fixture');
  });
  g.world.slices.scenes.current = null;
  g.world.slices.scenes.queue = [];
  g.queue('inventory.equip', { ownerId: 'player', itemId, instanceId });
  run((ctx) => {
    const inst = holdingOf(ctx.world, 'player').instances?.[instanceId];
    if (!inst?.durability) throw new Error('missing fixture durability');
    wearInstance(ctx, 'player', instanceId, inst.durability.max - (opts.cur ?? 4), 'fixture');
  });
  g.drainLog();
  const bot = new Autoplayer(g);
  const holding = () => holdingOf(g.world, 'player');
  const piece = () => holding().instances?.[instanceId];
  return { g, bot, run, holding, piece, instanceId };
}

describe('autoplayer equipment upkeep', () => {
  it('keeps the real low-health Act1 recovery at its safe entrance instead of leaving for repair', () => {
    const { g, bot } = recordedRecovery();
    expect(g.world.meta.flags.act).toBe('act1');
    expect(g.world.slices.quests.quests.q_a1_m02_raven?.status).toBe('active');
    expect(bot.player()).toMatchObject({ mapId: 'seal_ruins_depths', x: 12.5, y: 15.5 });
    expect(g.world.slices.combat.units.player?.hp).toBe(21.84);
    expect(playerHealth(g.world, g.content)).toBeCloseTo(21.84 / 116);
    expect(holdingOf(g.world, 'player').instances?.it1?.durability?.cur).toBe(3);
    expect(holdingOf(g.world, 'player').money).toBe(23);
    expect(attackers(g.world)).toEqual([]);
    expect(hostileInReach(g, bot.player() as Entity)).toBeNull();
    expect(bot.needsRest()).toBe(true);
    const wait = bot.think();
    expect(wait).toBe(40);
    expect(bot.intent.what).toBe('rest');
    expect(g.world.inbox).toEqual([]);
    g.step(wait);
    expect(bot.player()).toMatchObject({ mapId: 'seal_ruins_depths', x: 12.5, y: 15.5 });
    expect(holdingOf(g.world, 'player').instances?.it1?.durability?.cur).toBe(3);
    expect(g.world.slices.combat.units.player?.hp).toBeGreaterThan(21.84);
  });

  it('settles repair through the real handler while the recorded Act1 player still needs rest', () => {
    const { g, bot } = recordedRecovery();
    const smith = bot.findNpc('barga');
    if (!smith) throw new Error('missing real smith');
    // Fixture placement isolates the service boundary. Rest repairs only at a smith
    // already in reach; the recorded entrance above must stay safe and recover first.
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: smith.mapId,
      x: smith.x,
      y: smith.y,
    });
    g.step(1);
    expect(g.world.meta.flags.act).toBe('act1');
    expect(bot.needsRest()).toBe(true);
    expect(holdingOf(g.world, 'player').money).toBe(23);
    const wait = bot.think();
    expect(g.world.inbox).toContainEqual({
      kind: 'inventory.repair',
      data: { ownerId: 'player', instanceId: 'it1', smithId: 'npc_barga' },
      source: { type: 'player' },
    });
    expect(holdingOf(g.world, 'player').instances?.it1?.durability?.cur).toBe(3);
    expect(holdingOf(g.world, 'player').money).toBe(23);
    g.step(wait);
    expect(holdingOf(g.world, 'player').instances?.it1?.durability).toEqual({ cur: 20, max: 20 });
    expect(holdingOf(g.world, 'player').money).toBe(22);
  });

  it('does not walk even to a smith on the same map while recovering at low health', () => {
    const { g, bot } = recordedRecovery();
    // The real town entrance is on Barga's map but well outside his repair reach.
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'borderstone',
      x: 50.5,
      y: 3.5,
    });
    g.step(1);
    const smith = bot.findNpc('barga');
    const player = bot.player();
    if (!smith || !player) throw new Error('missing real player or smith');
    expect(player.mapId).toBe(smith.mapId);
    expect(Math.hypot(player.x - smith.x, player.y - smith.y)).toBeGreaterThan(4);
    expect(hostileInReach(g, player)).toBeNull();
    expect(bot.needsRest()).toBe(true);
    expect(bot.think()).toBe(40);
    expect(bot.intent.what).toBe('rest');
    expect(g.world.inbox).toEqual([]);
  });

  it('reaches maintenance through the ordinary Autoplayer decision before another hunt', () => {
    const { g, bot, holding, piece, instanceId } = fixture();
    const wait = bot.think();
    expect(g.world.inbox).toContainEqual({
      kind: 'inventory.repair',
      data: { ownerId: 'player', instanceId, smithId: 'npc_barga' },
      source: { type: 'player' },
    });
    expect(piece()?.durability?.cur).toBe(4);
    expect(holding().money).toBe(10);
    g.step(wait);
    expect(piece()?.durability?.cur).toBe(20);
    expect(holding().money).toBe(9);
  });

  it('repairs the real low starter sword at Barga and pays its actual one-copper quote', () => {
    const { g, bot, holding, piece, instanceId } = fixture();
    expect(piece()?.durability).toEqual({ cur: 4, max: 20 });
    expect(maintainGear(bot)).toBe(2);
    expect(g.world.inbox).toContainEqual({
      kind: 'inventory.repair',
      data: { ownerId: 'player', instanceId, smithId: 'npc_barga' },
      source: { type: 'player' },
    });
    // Decisions queue a player command; only its real handler changes the purse or piece.
    expect(piece()?.durability?.cur).toBe(4);
    expect(holding().money).toBe(10);
    g.step(1);
    expect(piece()?.durability).toEqual({ cur: 20, max: 20 });
    expect(holding().money).toBe(9);
    expect(g.world.recent).toContainEqual(
      expect.objectContaining({
        kind: 'command.result',
        data: expect.objectContaining({ kind: 'inventory.repair', ok: true }),
      }),
    );
    expect(maintainGear(bot)).toBeNull();
  });

  it('walks and crosses the real north-road exit before repairing at the smith', () => {
    const { g, bot, holding, piece } = fixture();
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'borderstone_north',
      x: 63.5,
      y: 95.5,
    });
    g.step(1);
    expect(maintainGear(bot)).toBe(4);
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({
        kind: 'world.use_exit',
        data: { entityId: 'player', exitId: 'to_borderstone' },
      }),
    );
    expect(g.world.inbox.some((c) => c.kind === 'inventory.repair')).toBe(false);
    g.step(1);
    expect(bot.player()?.mapId).toBe('borderstone');
    expect(maintainGear(bot)).toBe(4);
    const smith = bot.findNpc('barga');
    expect(smith).toBeDefined();
    expect(g.world.inbox).toContainEqual(
      expect.objectContaining({
        kind: 'world.move_to',
        data: { entityId: 'player', x: smith?.x, y: smith?.y },
      }),
    );
    for (let n = 0; n < 200 && piece()?.durability?.cur !== 20; n++) {
      g.step(4);
      const wait = maintainGear(bot);
      if (wait === null) break;
    }
    expect(piece()?.durability?.cur).toBe(20);
    expect(holding().money).toBe(9);
  });

  it('leaves gear above the existing twenty-percent warning alone', () => {
    const { g, bot } = fixture({ cur: 4.5 });
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
  });

  it('leaves story decisions available when the repair is unaffordable', () => {
    const { g, bot, piece } = fixture({ money: 0 });
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
    expect(piece()?.durability?.cur).toBe(4);
  });

  it('repairs a retained broken common piece instead of treating it as working gear', () => {
    const { g, bot, holding, piece } = fixture({ itemId: 'worn_leather_vest', cur: 0, money: 24 });
    expect(piece()?.durability).toEqual({ cur: 0, max: 40 });
    expect(maintainGear(bot)).toBe(2);
    g.step(1);
    expect(piece()?.durability).toEqual({ cur: 40, max: 40 });
    expect(holding().money).toBe(0);
  });

  it('does not recreate a poor sword that already shattered', () => {
    const { g, bot, piece, holding } = fixture({ cur: 0 });
    expect(piece()).toBeUndefined();
    expect(holding().items.iron_ore).toBe(1);
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
  });

  it('does no maintenance while the player remains in combat', () => {
    const { g, bot, run } = fixture();
    run((ctx) => {
      const player = ctx.world.slices.combat.units.player;
      if (!player) throw new Error('missing fixture player');
      markCombat(ctx, player);
    });
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
  });

  it('yields to a queued or running real story scene', () => {
    const { g, bot } = fixture();
    g.world.slices.scenes.queue.push('cut_a1_raven');
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
    g.world.slices.scenes.queue.pop();
    g.queue('scenes.start', { sceneId: 'cut_a1_raven' });
    g.step(1);
    expect(g.world.slices.scenes.current?.sceneId).toBe('cut_a1_raven');
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
  });

  it('does not pursue a smith when the current live map has no legal route', () => {
    const { g, bot } = fixture();
    g.queue('world.teleport', { entityId: 'player', mapId: 'divine_court', x: 10.5, y: 13.5 });
    g.step(1);
    expect(maintainGear(bot)).toBeNull();
    expect(g.world.inbox).toEqual([]);
  });

  it('skips a smith isolated beyond the arrival area even when that map has an open exit', () => {
    const { g, bot } = fixture();
    const town = g.content.maps.find((m) => m.id === 'borderstone');
    if (!town) throw new Error('missing real town map');
    g.content.maps = g.content.maps.map((map) =>
      map.id !== town.id
        ? map
        : {
            ...map,
            switches: [
              ...(map.switches ?? []),
              {
                id: 'zz_smith_n',
                x: 60,
                y: 39,
                w: 11,
                h: 1,
                closedTile: 'wall',
                openWhen: 'zz_smith_open',
              },
              {
                id: 'zz_smith_s',
                x: 60,
                y: 49,
                w: 11,
                h: 1,
                closedTile: 'wall',
                openWhen: 'zz_smith_open',
              },
              {
                id: 'zz_smith_w',
                x: 60,
                y: 39,
                w: 1,
                h: 11,
                closedTile: 'wall',
                openWhen: 'zz_smith_open',
              },
              {
                id: 'zz_smith_e',
                x: 70,
                y: 39,
                w: 1,
                h: 11,
                closedTile: 'wall',
                openWhen: 'zz_smith_open',
              },
            ],
          },
    );
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: 'borderstone_north',
      x: 63.5,
      y: 95.5,
    });
    g.step(1);
    expect(
      nextLeg(g.content.maps, g.world.meta.flags, 'borderstone_north', 'borderstone', bot.player()),
    ).not.toBeNull();
    expect(maintainGear(bot)).toBe(4);
    // Knut is the remaining reachable real smith. Barga must not attract a wasted town visit.
    expect(bot.intent.what).toBe('repair worn gear at knut_naumann');
    expect(g.world.inbox).not.toContainEqual(
      expect.objectContaining({
        kind: 'world.use_exit',
        data: { entityId: 'player', exitId: 'to_borderstone' },
      }),
    );
  });
});
