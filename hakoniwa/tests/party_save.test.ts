// The party slice across saves (PK-M1-15; release_engineering.md 5.5): a save round trip
// through the loader keeps the hash and plays on like the run that never stopped, with the
// roster in every state the batch adds (in the party, standing by, resting, waiting at a
// gate), a tactical order, the ironman switch, a beast companion and a ridden mount; and a
// save from before the roster (members without a state, none of the new fields) loads,
// counts its members as in the party and plays on; the chatter, fight and care records of
// PK-M1-21 ride the same round trip.

import { describe, expect, it } from 'vitest';
import { buildContent } from '../src/content';
import { Engine } from '../src/core';
import type { ContentMap } from '../src/core/contracts';
import {
  migrateSnapshot,
  RENAME_VERSION,
  serializeWorld,
  validateWorld,
  worldHash,
} from '../src/core/save';
import type { GameSystem, SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR } from '../src/core/time';
import { createGame } from '../src/game/create';
import { system as ailments } from '../src/systems/ailments';
import { system as combat } from '../src/systems/combat';
import { system as doors } from '../src/systems/doors';
import { addItem, system as inventory } from '../src/systems/inventory';
import { system as modifiers } from '../src/systems/modifiers';
import { isInParty, system as party, slotsUsed } from '../src/systems/party';
import { system as travel } from '../src/systems/travel';
import { system as world } from '../src/systems/world';

const SYSTEMS: GameSystem[] = [modifiers, world, inventory, combat, party, doors, ailments, travel];

let shipped: ContentMap | undefined;
const content = () => {
  shipped ??= buildContent();
  return shipped;
};

function game(seed: number): Engine {
  const g = createGame({ seed, aiMode: 'off', content: content(), systems: SYSTEMS });
  g.queue('flag.set', { key: 'act', value: 'act1' });
  g.queue('flag.set', { key: 'ironman', value: true });
  g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 32.5, y: 17.5 });
  g.step(1);
  return g;
}

function withCtx(g: Engine, fn: (ctx: SystemContext) => void): void {
  const probe = { id: 'zz_probe', order: 999, tick: (ctx: SystemContext) => fn(ctx) };
  Engine.resume(g.world, g.content, [...g.systems, probe]).step(1);
}

function busy(): Engine {
  const g = game(52);
  for (const [key, value] of Object.entries({
    a1_oola_fate: 'cleared',
    'door.vocation_hunter': true,
    door_rank: 6,
  }))
    g.queue('flag.set', { key, value });
  g.step(1);
  for (const id of ['yeyu', 'shiya', 'ron', 'oola'])
    g.queue('flag.set', { key: `companion.${id}.recruited`, value: true });
  g.step(1);
  g.queue('party.wound', { companionId: 'yeyu' }, { type: 'script', script: 'test' });
  g.queue('party.wait', { companionId: 'ron', on: true });
  g.queue('party.tactic', { tactic: 'spread', companionId: 'shiya', on: true });
  g.step(1);
  const before = new Set(Object.keys(g.world.slices.world.entities));
  g.queue('combat.spawn', {
    monsterId: 'grey_wolf',
    mapId: 'seal_ruins',
    x: 34.5,
    y: 17.5,
    level: 3,
  });
  g.step(1);
  const wolf = Object.keys(g.world.slices.world.entities).find((k) => !before.has(k));
  if (wolf) g.queue('party.tame', { targetId: wolf });
  withCtx(g, (ctx) => addItem(ctx, 'player', 'mnt_donkey', 1));
  g.queue('party.ride', { mountId: 'mnt_donkey' });
  g.step(20 * 3);
  return g;
}

describe('party save round trip', () => {
  it('keeps the hash and plays on like the run that never stopped', () => {
    const live = busy();
    const s = live.world.slices.party;
    expect(s.ironman).toBe('on');
    expect(s.mount).toBe('mnt_donkey');
    expect(s.members.yeyu?.state).toBe('resting');
    expect(s.members.oola?.state).toBe('standby');
    expect(s.members.ron?.state).toBe('waiting');
    expect(s.members.shiya?.tactic?.kind).toBe('spread');
    expect(s.members.pet_ashgrey_wolf?.pet?.kind).toBe('half');

    const { world: loaded } = migrateSnapshot(serializeWorld(live.world), RENAME_VERSION, {
      owners: [],
    });
    expect(validateWorld(loaded, [])).toEqual([]);
    expect(worldHash(loaded)).toBe(worldHash(live.world));
    const resumed = Engine.resume(loaded, live.content, live.systems);
    const ticks = 3 * TICKS_PER_GAME_HOUR + 7;
    live.step(ticks);
    resumed.step(ticks);
    expect(worldHash(resumed.world)).toBe(worldHash(live.world));
  });

  it('keeps the chatter, the fight record and the care clocks (PK-M1-21) across a save', () => {
    const live = busy();
    withCtx(live, (ctx) => {
      const s = ctx.world.slices.party;
      s.fight = { on: false, count: 2, start: 10, downs: 0, hardStreak: 1 };
      s.banter = {
        played: { a1_forest_walk: 5 },
        cut: { a1_mark: 1 },
        pending: { a1_mark: 7 },
        held: { a1_mark: true },
        here: ['seal_ruins'],
        pos: ['seal_ruins', 32.5, 17.5],
        journey: 40,
        camp: { night: 0, count: 1 },
        talked: { night: 0, companionId: 'shiya' },
        exposure: 200,
      };
      s.care = { bron: ctx.tick + 1000 };
      const shiya = s.members.shiya;
      if (shiya) {
        shiya.stanceLast = 'stay';
        shiya.treated = ctx.tick;
      }
    });
    const { world: loaded } = migrateSnapshot(serializeWorld(live.world), RENAME_VERSION, {
      owners: [],
    });
    expect(validateWorld(loaded, [])).toEqual([]);
    expect(worldHash(loaded)).toBe(worldHash(live.world));
    expect(loaded.slices.party.banter?.pending).toEqual({ a1_mark: 7 });
    const resumed = Engine.resume(loaded, live.content, live.systems);
    const ticks = 2 * TICKS_PER_GAME_HOUR + 3;
    live.step(ticks);
    resumed.step(ticks);
    expect(worldHash(resumed.world)).toBe(worldHash(live.world));
  });

  it('loads a save from before the roster: members without a state are in the party', () => {
    const g = game(53);
    g.queue('flag.set', { key: 'companion.shiya.recruited', value: true });
    g.step(1);
    const old = structuredClone(g.world);
    // the shape before this batch: no state, none of the new fields
    for (const m of Object.values(old.slices.party.members)) {
      delete m.state;
      delete m.hpSeen;
    }
    delete old.slices.party.ironman;
    const { world: loaded } = migrateSnapshot(serializeWorld(old), RENAME_VERSION, { owners: [] });
    expect(validateWorld(loaded, [])).toEqual([]);
    const resumed = Engine.resume(loaded, g.content, g.systems);
    expect(isInParty(resumed.world, 'shiya')).toBe(true);
    expect(slotsUsed(resumed.world)).toBe(1);
    resumed.step(20 * 5);
    expect(resumed.world.slices.world.entities.companion_shiya?.alive).toBe(true);
    resumed.queue('party.dismiss', { companionId: 'shiya' });
    resumed.step(1);
    expect(resumed.world.slices.party.members.shiya?.state).toBe('standby');
  });
});
