// The player's two door costs (thousand_doors.md 6.2, 6.3; section 23 groups U and Y, M1
// rows): taint turns into blockage at four to one, a return through the door floors the
// door fatigue at 60 and adds 3 blockage per overload stack, the fatigue wears off ten per
// game hour, and the revival-fatigue state lasts 2 + floor(rank / 10) game hours times
// (1 + 0.5 x stacks): rank 45 gives 6 hours, two stacks 12 (combat_and_classes.md 15.1).

import { describe, expect, it } from 'vitest';
import type { Engine } from '../src/core';
import type { SystemContext } from '../src/core/system';
import { TICKS_PER_GAME_HOUR, TICKS_PER_GAME_MINUTE } from '../src/core/time';
import { doorFatigueMinutes } from '../src/systems/combat/formulas';
import { doorCosts } from '../src/systems/doors';
import { blockageTier, overloadStacks } from '../src/systems/doors/costs';
import { events, flags, gameWith, makeGame, setFlags, withCtx } from './doors_harness';

function returned(g: Engine): void {
  withCtx(g, (ctx: SystemContext) => {
    ctx.emit('combat.player_returned', {
      fromMap: 'seal_ruins',
      x: 1,
      y: 1,
      toMap: 'seal_ruins',
      toX: 1,
      toY: 1,
      innerCourt: false,
      moneyLost: 0,
      fatigueMinutes: 120,
    });
  });
}

describe('U: taint turns into blockage (6.2, C83)', () => {
  it('8 taint gained is 2 blockage; the remainder carries; a cure takes nothing back', () => {
    const g = gameWith([]);
    setFlags(g, { 'player.taint': 8 });
    expect(doorCosts(g.world).blockage).toBe(2);
    expect(flags(g).blockage).toBe(2);
    // the taint itself stays as the taint system wrote it
    expect(flags(g)['player.taint']).toBe(8);
    setFlags(g, { 'player.taint': 11 });
    expect(doorCosts(g.world).blockage).toBe(2);
    setFlags(g, { 'player.taint': 12 });
    expect(doorCosts(g.world).blockage).toBe(3);
    setFlags(g, { 'player.taint': 0 });
    expect(doorCosts(g.world).blockage).toBe(3);
    setFlags(g, { 'player.taint': 4 });
    expect(doorCosts(g.world).blockage).toBe(4);
  });

  it('crossing into a new blockage tier is announced', () => {
    expect([0, 19, 20, 39, 40, 59, 60, 79, 80, 99, 100].map(blockageTier)).toEqual([
      0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5,
    ]);
    const g = gameWith([]);
    setFlags(g, { 'player.taint': 80 });
    expect(doorCosts(g.world)).toMatchObject({ blockage: 20, blockageTier: 1 });
    expect(events(g, 'doors.blockage_tier').map((e) => e.data)).toEqual([{ tier: 1, from: 0 }]);
  });
});

describe('Y: the revival-fatigue state (6.3, combat 15.1)', () => {
  it('lasts 6 game hours at door rank 45 and 12 with two overload stacks', () => {
    expect(doorFatigueMinutes(45, 0)).toBe(6 * 60);
    expect(doorFatigueMinutes(45, 2)).toBe(12 * 60);
    // rank 1 to 9 is 2 hours, rank 60 is 8, the cap is 10; at most three stacks
    expect(doorFatigueMinutes(1, 0)).toBe(120);
    expect(doorFatigueMinutes(60, 0)).toBe(8 * 60);
    expect(doorFatigueMinutes(99, 0)).toBe(10 * 60);
    expect(doorFatigueMinutes(1, 5)).toBe(Math.round(120 * 2.5));
  });

  it('a real death at door rank 45 puts on the state for 6 game hours', () => {
    const g = makeGame();
    setFlags(g, { door_rank: 45 });
    g.queue('world.teleport', { entityId: 'player', mapId: 'seal_ruins', x: 18.5, y: 9.5 });
    g.step(1);
    g.queue('combat.spawn', {
      monsterId: 'black_ridge',
      mapId: 'seal_ruins',
      x: 19.6,
      y: 9.5,
      level: 11,
    });
    g.step(1);
    const u = g.world.slices.combat.units.player;
    if (u) u.hp = 1;
    // the fall, then one game hour reforming in the corridor (combat 15.1)
    for (let i = 0; i < 2000 && events(g, 'combat.player_returned').length === 0; i++) g.step(1);
    const ret = events(g, 'combat.player_returned').at(-1);
    expect(ret?.data.fatigueMinutes).toBe(360);
    const aura = g.world.slices.combat.units.player?.auras.find(
      (a) => a.id === 'aur_st_revival_fatigue',
    );
    expect(aura).toBeDefined();
    const left = (aura?.expires ?? 0) - g.world.meta.tick;
    expect(left).toBeGreaterThan(360 * TICKS_PER_GAME_MINUTE - 20);
    expect(left).toBeLessThanOrEqual(360 * TICKS_PER_GAME_MINUTE);
    // the doors side: fatigue floored at 60, no overload yet
    expect(doorCosts(g.world).fatigue).toBe(60);
    expect(flags(g).door_fatigue).toBe(60);
  });
});

describe('Y: door fatigue and overload on the doors side (6.3)', () => {
  it('floors the fatigue at 60, adds 3 blockage per stack, and wears off ten an hour', () => {
    expect(overloadStacks([], 100)).toBe(0);
    expect(overloadStacks([10, 20, 30, 40], 50)).toBe(3);
    const g = gameWith([]);
    returned(g);
    expect(doorCosts(g.world)).toMatchObject({ fatigue: 60, blockage: 0 });
    returned(g);
    expect(doorCosts(g.world)).toMatchObject({ fatigue: 60, blockage: 3 });
    returned(g);
    expect(doorCosts(g.world).blockage).toBe(9);
    // an hour later ten has worn off (settled on the ten-tick check); four more and it is 10
    g.step(TICKS_PER_GAME_HOUR + 10);
    expect(doorCosts(g.world).fatigue).toBe(50);
    g.step(4 * TICKS_PER_GAME_HOUR);
    expect(doorCosts(g.world).fatigue).toBe(10);
    expect(flags(g).door_fatigue).toBe(10);
    // a death keeps a higher fatigue as it is
    withCtx(g, (ctx) => {
      ctx.world.slices.doors.fatigue = 75;
    });
    returned(g);
    expect(doorCosts(g.world).fatigue).toBe(75);
    // the seal never moves on death (6.3)
    expect(flags(g).seal_points ?? 0).toBe(0);
  });
});
