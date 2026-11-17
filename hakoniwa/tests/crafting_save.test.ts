// The crafting slice across saves (PK-M1-49; release_engineering.md 5.5): a save round trip
// through the loader (migrate, renames, validateWorld with the crafting slice check) keeps the
// hash and plays on exactly like the run that never stopped, node clocks and drunkenness
// included; a save from before the crafting system loads, validates and gets its slice on
// first use; the slice check refuses broken slices and a newer layout; renamed node ids reach
// the slice through its idFields.

import { describe, expect, it } from 'vitest';
import { Engine } from '../src/core';
import {
  applyRenames,
  migrateSnapshot,
  RENAME_VERSION,
  RenameSet,
  type SliceOwner,
  serializeWorld,
  validateWorld,
  worldHash,
} from '../src/core/save';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import {
  CRAFTING_ID_FIELDS,
  CRAFTING_SLICE_VERSION,
  system as crafting,
  emptyCraftingSlice,
  readCrafting,
  validateCraftingSlice,
} from '../src/systems/crafting';
import { addInstance, addItem, system as inventory } from '../src/systems/inventory';
import { Harness } from './crafting_harness';

const OWNERS: SliceOwner[] = [crafting, inventory as SliceOwner];

function busyHarness(): Harness {
  const t = new Harness({ seed: 21 });
  t.run((ctx) => {
    addInstance(ctx, 'player', 'x_pick_t1');
    addItem(ctx, 'player', 'x_ale', 3);
    addItem(ctx, 'player', 'x_ore', 6);
  });
  t.command('crafting.gather', { nodeId: 'node_zc_ore' });
  t.command('crafting.gather', { nodeId: 'node_zc_event' });
  t.command('inventory.use', { ownerId: 'player', itemId: 'x_ale' });
  t.standAt('shop');
  t.command('crafting.craft', { recipeId: 'rcp_zc_ingot', runs: 2 });
  return t;
}

describe('save round trip', () => {
  it('validates, keeps the hash, and plays on like the run that never stopped', () => {
    const live = busyHarness();
    const s = readCrafting(live.g.world);
    expect(s?.nodes.node_zc_ore?.used).toBe(1);
    expect(s?.nodes.node_zc_event?.readyAt).toBe(-1);
    expect(s?.drunk.player?.layers).toBe(2);
    expect(s?.recent.player).toHaveLength(2);
    expect(Object.keys(s?.skills.player ?? {}).sort()).toEqual(['mining']);

    const { world } = migrateSnapshot(serializeWorld(live.g.world), RENAME_VERSION, {
      owners: OWNERS,
    });
    expect(validateWorld(world, OWNERS)).toEqual([]);
    expect(worldHash(world)).toBe(worldHash(live.g.world));
    const resumed = Engine.resume(world, live.g.content, live.g.systems);
    const ticks = 3 * TICKS_PER_GAME_HOUR + 5;
    live.g.step(ticks);
    resumed.step(ticks);
    expect(readCrafting(resumed.world)?.drunk.player).toBeUndefined();
    expect(worldHash(resumed.world)).toBe(worldHash(live.g.world));
  });

  it('loads a save from before the crafting system and creates the slice on first use', () => {
    const t = new Harness({ seed: 22 });
    const old = structuredClone(t.g.world);
    delete (old.slices as { crafting?: unknown }).crafting;
    const { world } = migrateSnapshot(serializeWorld(old), RENAME_VERSION, { owners: OWNERS });
    expect(validateWorld(world, OWNERS)).toEqual([]);
    expect(readCrafting(world)).toBeUndefined();
    const resumed = Engine.resume(world, t.g.content, t.g.systems);
    resumed.queue('crafting.gather', { nodeId: 'node_zc_ore' });
    resumed.step(1);
    expect(readCrafting(resumed.world)?.version).toBe(CRAFTING_SLICE_VERSION);
    expect(readCrafting(resumed.world)?.nodes.node_zc_ore?.used).toBe(1);
  });
});

describe('the slice check', () => {
  it('passes a fresh and a missing slice, and refuses broken ones', () => {
    expect(validateCraftingSlice(undefined)).toEqual([]);
    expect(validateCraftingSlice(emptyCraftingSlice())).toEqual([]);
    expect(validateCraftingSlice(3)).toEqual(['crafting is not an object']);
    const bad = {
      ...emptyCraftingSlice(),
      skills: { player: { mining: 151, juggling: 3 } },
      nodes: { node_a: { readyAt: -2, used: 0 } },
      recent: { player: [1.5] },
      drunk: { player: { layers: -1, soberUntil: 0 } },
      masterworks: { player: 0 },
    };
    expect(validateCraftingSlice(bad)).toEqual([
      'crafting.skills.player.mining is not a skill',
      'crafting.skills.player.juggling is no livelihood',
      'crafting.nodes.node_a is not a node clock',
      'crafting.recent.player is not a list of ticks',
      'crafting.drunk.player is not a drunk state',
      'crafting.masterworks.player is not a count',
    ]);
    expect(validateCraftingSlice({ ...emptyCraftingSlice(), version: 99 })).toEqual([
      "crafting.version 99 is newer than this build's",
    ]);
  });

  it('renames node ids in the slice through its idFields', () => {
    const t = busyHarness();
    const table = {
      version: 2,
      entries: [{ since: 1, kind: 'node', from: 'node_zc_ore', to: 'node_zc_vein' }],
    };
    applyRenames(t.g.world, new RenameSet(table as never, 0, { isCanonical: () => true }), [
      { slice: 'crafting', fields: CRAFTING_ID_FIELDS },
    ]);
    const s = readCrafting(t.g.world);
    expect(Object.keys(s?.nodes ?? {}).sort()).toEqual(['node_zc_event', 'node_zc_vein']);
    expect(validateCraftingSlice(s)).toEqual([]);
  });
});
