import { describe, expect, it } from 'vitest';
import {
  AUTO_LOOT_REARM_RANGE,
  corpseHasVisibleLoot,
  createAutoLootState,
  nearestAutoLootCorpse,
} from '../src/game/auto_loot';
import type { PartyInfo } from '../src/world_api';
import type { Entity } from '../src/sim/types';

function entity(partial: Partial<Entity> & Pick<Entity, 'id' | 'kind'>): Entity {
  return {
    id: partial.id,
    kind: partial.kind,
    pos: { x: 0, y: 0, z: 0 },
    dead: false,
    lootable: false,
    loot: null,
    tappedById: null,
    scale: 1,
    ...partial,
  } as Entity;
}

function partyWith(...pids: number[]): PartyInfo {
  return {
    leader: pids[0] ?? 1,
    raid: false,
    members: pids.map((pid) => ({
      pid,
      name: `P${pid}`,
      cls: 'warrior',
      level: 1,
      hp: 100,
      mhp: 100,
      res: 0,
      mres: 0,
      rtype: 'rage',
      x: 0,
      z: 0,
      dead: 0,
      inCombat: 0,
      group: 1,
    })),
  };
}

describe('auto loot', () => {
  it('selects the nearest visible lootable corpse in interaction range', () => {
    const player = entity({ id: 1, kind: 'player' });
    const far = entity({
      id: 2,
      kind: 'mob',
      dead: true,
      lootable: true,
      pos: { x: 4.5, y: 0, z: 0 },
      loot: { copper: 1, items: [] },
    });
    const near = entity({
      id: 3,
      kind: 'mob',
      dead: true,
      lootable: true,
      pos: { x: 2, y: 0, z: 0 },
      loot: { copper: 0, items: [{ itemId: 'wolf_fang', count: 1 }] },
    });

    const state = createAutoLootState();

    expect(nearestAutoLootCorpse({
      player,
      playerId: 1,
      partyInfo: null,
      entities: new Map([[1, player], [2, far], [3, near]]),
    }, state)).toBe(3);
  });

  it('suppresses a manually closed corpse until the player leaves the rearm range', () => {
    const player = entity({ id: 1, kind: 'player' });
    const corpse = entity({
      id: 2,
      kind: 'mob',
      dead: true,
      lootable: true,
      pos: { x: 2, y: 0, z: 0 },
      loot: { copper: 1, items: [] },
    });
    const state = createAutoLootState();
    state.suppressedCorpseId = 2;
    const entities = new Map([[1, player], [2, corpse]]);

    expect(nearestAutoLootCorpse({ player, playerId: 1, partyInfo: null, entities }, state)).toBeNull();

    player.pos = { x: corpse.pos.x + AUTO_LOOT_REARM_RANGE + 1, y: 0, z: 0 };
    expect(nearestAutoLootCorpse({ player, playerId: 1, partyInfo: null, entities }, state)).toBeNull();
    expect(state.suppressedCorpseId).toBeNull();

    player.pos = { x: 0, y: 0, z: 0 };
    expect(nearestAutoLootCorpse({ player, playerId: 1, partyInfo: null, entities }, state)).toBe(2);
  });

  it('respects corpse loot ownership when deciding whether loot is visible', () => {
    const corpse = entity({
      id: 2,
      kind: 'mob',
      dead: true,
      lootable: true,
      tappedById: 7,
      loot: { copper: 10, items: [{ itemId: 'wolf_fang', count: 1 }] },
    });

    expect(corpseHasVisibleLoot(corpse, 1, null)).toBe(false);
    expect(corpseHasVisibleLoot(corpse, 1, partyWith(1, 7))).toBe(true);
  });

  it('allows personal and open loot even without shared tap rights', () => {
    const personal = entity({
      id: 2,
      kind: 'mob',
      dead: true,
      lootable: true,
      tappedById: 7,
      loot: { copper: 0, items: [{ itemId: 'boar_hide', count: 1, personalFor: [1] }] },
    });
    const open = entity({
      id: 3,
      kind: 'mob',
      dead: true,
      lootable: true,
      tappedById: 7,
      loot: { copper: 0, items: [{ itemId: 'greyjaw_hide_boots', count: 1, openToAll: true }] },
    });

    expect(corpseHasVisibleLoot(personal, 1, null)).toBe(true);
    expect(corpseHasVisibleLoot(open, 1, null)).toBe(true);
  });
});
