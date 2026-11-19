// The shipped water row restores its specified amount over 18 seconds and resumes exactly.
import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core';
import { deserializeWorld, serializeWorld, stateHash } from '../src/core/save';
import { grantPool, unitOf } from '../src/systems/combat';
import { DRINK_TICKS } from '../src/systems/combat/item_consumption';
import { addItem } from '../src/systems/inventory';
import { events, game, lastResult, skipHours, TOWN, withCtx } from './ailments_harness';

function setup() {
  const g = game(TOWN);
  withCtx(g, (ctx) => {
    grantPool(ctx, 'player', 'fixture', 'mana', 300);
    addItem(ctx, 'player', 'cs_well_water_t1', 2);
  });
  const u = unitOf(g.world, 'player');
  if (!u) throw new Error('missing player');
  u.res.mana = 0;
  u.manaSpentAt = 1_000_000;
  return { g, u };
}

function drink(g: Engine) {
  g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_well_water_t1' });
  g.step(1);
}

describe('the independent drink slot', () => {
  it('restores 76 mana across 18 seconds, consuming exactly one portion', () => {
    const { g, u } = setup();
    drink(g);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(true);
    expect(u.res.mana).toBe(0);
    g.step(DRINK_TICKS / 2);
    expect(u.res.mana).toBe(38);
    g.step(DRINK_TICKS / 2);
    expect(u.res.mana).toBe(76);
    expect(u.drinking).toBeUndefined();
    expect(g.world.slices.inventory.owners.player?.items.cs_well_water_t1).toBe(1);
  });

  it('refuses a second drink while the slot is active without spending it', () => {
    const { g, u } = setup();
    drink(g);
    const first = structuredClone(u.drinking);
    drink(g);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(false);
    expect(u.drinking).toEqual(first);
    expect(g.world.slices.inventory.owners.player?.items.cs_well_water_t1).toBe(1);
  });

  it('two drink commands in one tick reserve only one portion before item.used settles', () => {
    const { g } = setup();
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_well_water_t1' });
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_well_water_t1' });
    g.step(1);
    expect(g.world.slices.inventory.owners.player?.items.cs_well_water_t1).toBe(1);
    expect(events(g, 'item.used').filter((e) => e.data.itemId === 'cs_well_water_t1')).toHaveLength(
      1,
    );
  });

  it('actual movement cancels later restoration but does not refund the portion', () => {
    const { g, u } = setup();
    drink(g);
    g.step(DRINK_TICKS / 2);
    const before = u.res.mana;
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: TOWN.map,
      x: TOWN.x + 1,
      y: TOWN.y,
    });
    g.step(1);
    expect(u.drinking).toBeUndefined();
    g.step(DRINK_TICKS);
    expect(u.res.mana).toBe(before);
    expect(g.world.slices.inventory.owners.player?.items.cs_well_water_t1).toBe(1);
  });

  it('a real damage fact cancels the drink before the next restoration', () => {
    const { g, u } = setup();
    drink(g);
    withCtx(g, (ctx) =>
      ctx.emit('combat.damage', {
        sourceId: 'fixture',
        targetId: 'player',
        amount: 1,
        absorbed: 0,
        school: 'physical',
        outcome: 'hit',
      }),
    );
    expect(events(g, 'combat.damage')).not.toHaveLength(0);
    g.step(1);
    expect(u.drinking).toBeUndefined();
    const before = u.res.mana;
    g.step(DRINK_TICKS);
    expect(u.res.mana).toBe(before);
  });

  it('a snapshot halfway through continues without losing or duplicating mana', () => {
    const { g, u } = setup();
    drink(g);
    g.step(DRINK_TICKS / 2);
    const loaded = Engine.resume(deserializeWorld(serializeWorld(g.world)), g.content, g.systems);
    expect(unitOf(loaded.world, 'player')?.drinking).toEqual(u.drinking);
    g.step(DRINK_TICKS / 2);
    loaded.step(DRINK_TICKS / 2);
    expect(unitOf(loaded.world, 'player')?.res.mana).toBe(76);
    expect(stateHash(loaded.world)).toBe(stateHash(g.world));
  });

  it('a body without a mana pool is rejected before drinking', () => {
    const g = game(TOWN);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_well_water_t1', 1));
    drink(g);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(false);
    expect(g.world.slices.inventory.owners.player?.items.cs_well_water_t1).toBe(1);
  });

  it('an hour-coarse skip settles the same drink amount as ordinary ticks', () => {
    const ordinary = setup();
    const skipped = setup();
    drink(ordinary.g);
    drink(skipped.g);
    skipHours(skipped.g, 1);
    ordinary.g.step(skipped.g.tick - ordinary.g.tick);
    expect(ordinary.u.drinking).toBeUndefined();
    expect(skipped.u.drinking).toBeUndefined();
    expect(skipped.u.res.mana).toBe(ordinary.u.res.mana);
    expect(skipped.u.res.mana).toBe(76);
  });

  it('movement before a long skip cannot complete an interrupted drink', () => {
    const { g, u } = setup();
    drink(g);
    g.queue('world.teleport', {
      entityId: 'player',
      mapId: TOWN.map,
      x: TOWN.x + 1,
      y: TOWN.y,
    });
    g.step(1);
    skipHours(g, 1);
    expect(u.drinking).toBeUndefined();
    expect(u.res.mana).toBe(0);
  });

  it('food waits 18 seconds, runs beside drink, and then replaces the old food aura', () => {
    const { g, u } = setup();
    withCtx(g, (ctx) => {
      addItem(ctx, 'player', 'cs_rye_hardtack', 1);
      addItem(ctx, 'player', 'cs_moon_stew', 1);
    });
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_rye_hardtack' });
    g.step(1);
    expect(lastResult(g, 'inventory.use')?.ok).toBe(true);
    expect(u.eating).toBeDefined();
    expect(u.auras.some((a) => a.id === 'aur_item_ryehardtack')).toBe(false);
    drink(g);
    g.step(DRINK_TICKS);
    expect(u.eating).toBeUndefined();
    expect(u.res.mana).toBe(76);
    expect(u.auras.some((a) => a.id === 'aur_item_ryehardtack')).toBe(true);
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_moon_stew' });
    g.step(DRINK_TICKS + 1);
    expect(u.auras.some((a) => a.id === 'aur_item_ryehardtack')).toBe(false);
    expect(u.auras.some((a) => a.id === 'aur_item_moonstew')).toBe(true);
  });

  it('food interrupted by damage never grants its promised aura', () => {
    const { g, u } = setup();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_rye_hardtack', 1));
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_rye_hardtack' });
    g.step(1);
    withCtx(g, (ctx) =>
      ctx.emit('combat.damage', {
        sourceId: 'fixture',
        targetId: 'player',
        amount: 1,
        absorbed: 0,
        school: 'physical',
        outcome: 'hit',
      }),
    );
    g.step(DRINK_TICKS);
    expect(u.eating).toBeUndefined();
    expect(u.auras.some((a) => a.id === 'aur_item_ryehardtack')).toBe(false);
    expect(g.world.slices.inventory.owners.player?.items.cs_rye_hardtack ?? 0).toBe(0);
  });

  it('resumed and hour-coarse food completion keep the ordinary aura expiry tick', () => {
    const { g, u } = setup();
    withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_rye_hardtack', 1));
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_rye_hardtack' });
    g.step(1);
    g.step(DRINK_TICKS / 2);
    const loaded = Engine.resume(deserializeWorld(serializeWorld(g.world)), g.content, g.systems);
    skipHours(loaded, 1);
    g.step(loaded.tick - g.tick);
    expect(
      unitOf(loaded.world, 'player')?.auras.find((a) => a.id === 'aur_item_ryehardtack'),
    ).toEqual(u.auras.find((a) => a.id === 'aur_item_ryehardtack'));
    expect(u.eating).toBeUndefined();
  });

  it('finishing a drink leaves a food slot that started later running', () => {
    const { g, u } = setup();
    drink(g);
    g.step(DRINK_TICKS / 2);
    withCtx(g, (ctx) => addItem(ctx, 'player', 'cs_rye_hardtack', 1));
    g.queue('inventory.use', { ownerId: 'player', itemId: 'cs_rye_hardtack' });
    g.step(1);
    g.step(DRINK_TICKS / 2);
    expect(u.drinking).toBeUndefined();
    expect(u.eating).toBeDefined();
    g.step(DRINK_TICKS / 2);
    expect(u.auras.some((a) => a.id === 'aur_item_ryehardtack')).toBe(true);
  });
});
